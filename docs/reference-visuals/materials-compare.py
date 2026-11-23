#!/usr/bin/env python3
"""Offline QA only. Compare archived artwork with the live analytic recipes.

No extracted image is a runtime input. Requires the optional research archive and
Pillow; the game, production build and runtime tests do not need either of them.
"""
from pathlib import Path
from tempfile import TemporaryDirectory
import json
import subprocess
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 13)
SMALL = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 11)
WALL_GROUPS = {
    'panels': ['STARTAN3','STARG3','STARTAN2','STARTAN1','BROWN1','BROWN144','STARGR1','BROWN96'],
    'consoles': ['COMPUTE1','COMPTALL','COMPUTE2','PLANET1'],
    'doors': ['BIGDOOR2','BIGDOOR4','DOOR3','EXITDOOR','EXITSIGN'],
    'trim': ['BRNBIGC','BRNBIGL','BRNBIGR','BROWNGRN','COMPSPAN','COMPTILE','LITE3','NUKE24','SLADWALL','STEP1','STEP6','SUPPORT2','SW1STRTN','SW2STRTN','TEKWALL1','TEKWALL4'],
    'sky': ['SKY1'],
}
FLAT_GROUPS = {
    'flats-a': ['CEIL3_5','CEIL5_1','CEIL5_2','FLAT14','FLAT18','FLAT20','FLAT23','FLAT5_5','FLOOR1_1','FLOOR4_8','FLOOR5_1','FLOOR5_2'],
    'flats-b': ['FLOOR6_2','FLOOR7_1','FLOOR7_2','NUKAGE1','NUKAGE2','NUKAGE3','STEP2','TLITE6_1','TLITE6_4','TLITE6_5','TLITE6_6'],
}
UI_NAMES = ['STBAR', *['STTNUM'+str(n) for n in range(10)], 'STYSNUM0','STGNUM2','STTPRCNT',
            'STFST00','STFST01','STFST02','STFST10','STFST20','STFST30','STFST40','STFOUCH0','STFOUCH4','STFDEAD0','M_DOOM']
NODE = r"""
import {readFileSync,writeFileSync} from 'node:fs';
import {Wad} from './reference/wad.js';
import {proceduralTexture,proceduralFlat} from './src/procedural-materials.js';
import {proceduralPatch} from './src/procedural-interface.js';
const spec=JSON.parse(readFileSync(process.argv[2]+'/spec.json','utf8'));
const wad=new Wad(readFileSync('reference/doom1.wad')),meta={};
for(const [kind,names] of Object.entries(spec))for(const name of names){
 const original=kind==='wall'?wad.texture(name):kind==='flat'?wad.flat(name):wad.patch(name);
 const generated=kind==='wall'?proceduralTexture(name):kind==='flat'?proceduralFlat(name):proceduralPatch(name);
 if(!original||!generated)throw new Error('Missing '+name);
 if(original.width!==generated.width||original.height!==generated.height)throw new Error('Wrong dimensions '+name);
 meta[name]={width:original.width,height:original.height,leftOffset:original.leftOffset,topOffset:original.topOffset};
 for(const [prefix,image]of [['original',original],['procedural',generated]])writeFileSync(process.argv[2]+'/'+prefix+'-'+name+'.rgba',image.pixels);
}
writeFileSync(process.argv[2]+'/dimensions.json',JSON.stringify(meta));
"""

def image(raw, meta, prefix, name, scale):
    info = meta[name]
    im = Image.frombytes('RGBA', (info['width'], info['height']), (raw / f'{prefix}-{name}.rgba').read_bytes())
    return im.resize((im.width * scale, im.height * scale), Image.Resampling.NEAREST)

def background(width, height):
    return Image.new('RGB', (width, height), '#171a1a')

def paired_board(raw, meta, key, names, scale, columns, slot_width):
    rows = [names[i:i+columns] for i in range(0, len(names), columns)]
    heights = [max(meta[n]['height'] for n in row)*scale+44 for row in rows]
    board = background(slot_width*columns, sum(heights)+34)
    draw = ImageDraw.Draw(board)
    draw.text((10,8), 'Référence archive à gauche · recette procédurale à droite · aucune identité pixel revendiquée', fill='#d6dddc', font=FONT)
    y = 34
    for row, height in zip(rows, heights):
        for col, name in enumerate(row):
            x=col*slot_width
            draw.text((x+9,y+4), f"{name}  {meta[name]['width']}×{meta[name]['height']}", fill='#e2e6e3', font=FONT)
            for side,prefix in enumerate(['original','procedural']):
                im=image(raw,meta,prefix,name,scale)
                px=x+8+side*(slot_width//2)
                board.paste(im,(px,y+25),im)
        y+=height
    path=OUT/f'materials-{key}.png';board.save(path);print(path.relative_to(ROOT))

def interface_board(raw, meta):
    board=background(1200,1100);draw=ImageDraw.Draw(board)
    draw.text((12,10),'HUD : référence à gauche · construction vectorielle à droite',fill='#e2e6e3',font=FONT)
    for side,prefix in enumerate(['original','procedural']):
        im=image(raw,meta,prefix,'STBAR',3)
        draw.text((12,36+side*122),prefix+' STBAR (FRAG archive / ARMS jeu solo)',fill='#c2cbc7',font=SMALL)
        board.paste(im,(12,54+side*122),im)
        for n in range(10):
            name='STTNUM'+str(n);im=image(raw,meta,prefix,name,4)
            board.paste(im,(12+n*70,315+side*72),im)
    draw.text((12,290),'Grands chiffres rouges : référence au-dessus, procédure au-dessous',fill='#d6dddc',font=FONT)
    faces=[n for n in UI_NAMES if n.startswith('STF')]
    for index,name in enumerate(faces):
        x=(index%5)*240;y=480+(index//5)*190
        draw.text((x+9,y),name,fill='#d6dddc',font=FONT)
        for side,prefix in enumerate(['original','procedural']):
            im=image(raw,meta,prefix,name,4);board.paste(im,(x+9+side*113,y+24),im)
    for side,prefix in enumerate(['original','procedural']):
        im=image(raw,meta,prefix,'M_DOOM',3);board.paste(im,(12+side*430,895),im)
    path=OUT/'materials-interface.png';board.save(path);print(path.relative_to(ROOT))

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    with TemporaryDirectory(prefix='doom-material-comparison-') as temporary:
        raw=Path(temporary)
        spec={'wall':sum(WALL_GROUPS.values(),[]),'flat':sum(FLAT_GROUPS.values(),[]),'ui':UI_NAMES}
        (raw/'spec.json').write_text(json.dumps(spec))
        subprocess.run(['node','--input-type=module','-',str(raw)],input=NODE,text=True,cwd=ROOT,check=True)
        meta=json.loads((raw/'dimensions.json').read_text())
        for key,names in WALL_GROUPS.items():
            wide=key in ['consoles','doors','sky']
            paired_board(raw,meta,key,names,2,1 if wide else 2,1060 if wide else 540)
        for key,names in FLAT_GROUPS.items():paired_board(raw,meta,key,names,3,3,408)
        interface_board(raw,meta)

if __name__=='__main__':main()
