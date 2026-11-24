/** Deterministic lighting reconstructed from E1M1 sectors and visible fixtures.
 * Coordinates are FERRO metres (32 Doom units). Area/bounce illumination is
 * approximated by bounded local lights; this is not a global-illumination solve. */
export const MAX_SCENE_LIGHTS = 6;
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const unit=a=>{const n=Math.hypot(...a)||1;return a.map(x=>x/n);};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));

/** Same deterministic sector waveforms as the surface shader, applied to the
 * emitted light as well as the indirect sector contribution. */
export function sectorLightPulse(special,time){
  if(special===1){const n=Math.sin(Math.floor(time*12)+special)*173.19;return n-Math.floor(n)>.72?.4:1;}
  if([2,4,12].includes(special))return time%1<.17?1:.35;
  if([3,13].includes(special))return time%.5<.17?1:.35;
  if(special===8)return .68+.32*Math.sin(time*2.6);
  return 1;
}

export function shadowProjection(position,target,{fov=112,near=.06,far=45}={}){
  const forward=unit(sub(target,position)),reference=Math.abs(forward[1])>.98?[0,0,1]:[0,1,0];
  const right=unit(cross(forward,reference)),up=cross(right,forward);
  const view=[right[0],up[0],-forward[0],0,right[1],up[1],-forward[1],0,right[2],up[2],-forward[2],0,
    -dot(right,position),-dot(up,position),dot(forward,position),1];
  const q=1/Math.tan(fov*Math.PI/360),projection=[q,0,0,0,0,q,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0];
  const vp=new Float32Array(16);
  for(let col=0;col<4;col++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)vp[col*4+row]+=projection[k*4+row]*view[col*4+k];
  return vp;
}

/** Fit a second, small depth map to the visible weapon. The room shadow map
 * cannot resolve finger-sized contacts across its whole 112-degree frustum. */
export function weaponShadowProjection(lightPosition,view,batch){
  const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],s=batch.mesh.stride,vertices=batch.mesh.vertices;
  const instance=batch.instances,ty=view.tangente,tx=ty*view.largeur/view.hauteur;
  // One vertex per triangle is sufficient for a padded fit; the actual shadow
  // draw still uses every triangle. No new geometry or pose buffers are made.
  for(let i=0;i<vertices.length;i+=s*3){
    const x=vertices[i]*instance[4]+instance[0],y=vertices[i+1]*instance[4]+instance[1],z=vertices[i+2]*instance[4]+instance[2];
    if(y<.8||Math.abs(x)>y*tx*1.12+1||Math.abs(z)>y*ty*1.12+1)continue;
    for(let k=0;k<3;k++){
      const p=view.oeil[k]+(view.droite[k]*x+view.avant[k]*y+view.haut[k]*z)/32;
      min[k]=Math.min(min[k],p);max[k]=Math.max(max[k],p);
    }
  }
  if(!Number.isFinite(min[0]))return shadowProjection(lightPosition,view.oeil.map((v,i)=>v+view.avant[i]));
  const center=min.map((v,i)=>(v+max[i])*.5),forward=unit(sub(center,lightPosition));
  const reference=Math.abs(forward[1])>.98?[0,0,1]:[0,1,0],right=unit(cross(forward,reference)),up=cross(right,forward);
  let spread=.04;
  for(let i=0;i<8;i++){
    const p=min.map((v,k)=>((i>>k)&1?max[k]+.025:v-.025)-lightPosition[k]),depth=Math.max(.08,dot(p,forward));
    spread=Math.max(spread,Math.abs(dot(p,right))/depth,Math.abs(dot(p,up))/depth);
  }
  return shadowProjection(lightPosition,center,{fov:clamp(2*Math.atan(spread*1.15)*180/Math.PI,8,120)});
}

export function buildLightingRig(map){
  const areas=new Map();
  for(const cell of map.floorPolygons||[]){
    let area=0,cx=0,cy=0;
    for(let i=0;i<cell.points.length;i++){
      const a=cell.points[i],b=cell.points[(i+1)%cell.points.length],k=a.x*b.y-b.x*a.y;
      area+=k;cx+=(a.x+b.x)*k;cy+=(a.y+b.y)*k;
    }
    if(Math.abs(area)<1)continue;
    const record={x:cx/(3*area),y:cy/(3*area),area:Math.abs(area*.5)};
    if(!areas.has(cell.sector))areas.set(cell.sector,[]);areas.get(cell.sector).push(record);
  }
  const lights=[];
  for(const sector of map.sectors){
    if(sector.ceiling-sector.floor<40)continue;
    const cells=(areas.get(sector.id)||[]).sort((a,b)=>b.area-a.area);
    if(!cells.length)continue;
    const emitter=/^TLITE|^LITE/.test(sector.ceilingTexture),outdoor=sector.ceilingTexture==='F_SKY1';
    const chosen=emitter?cells.filter(c=>c.area>400).slice(0,3):cells.slice(0,1);
    for(const c of chosen){
      const range=clamp((sector.ceiling-sector.floor)/32*2.6,6,15);
      lights.push({id:`sector-${sector.id}-${lights.length}`,sector:sector.id,x:c.x,y:c.y,
        z:emitter||outdoor?sector.ceiling-(outdoor?2:7):sector.floor+(sector.ceiling-sector.floor)*.62,
        range,power:(emitter?18:outdoor?22:3.2)*(sector.light/255)**1.7,
        color:emitter?[.83,.91,.78]:outdoor?[.57,.71,.81]:[.60,.69,.71],
        source:emitter?'emissive-ceiling':outdoor?'open-sky':'sector-bounce'});
    }
    // The original toxic floors provide a restrained green upward spill. These
    // anchors follow the liquid's real sector; they do not add scenery/emitters.
    if(/^NUKAGE/.test(sector.floorTexture))for(const c of cells.filter(c=>c.area>512).slice(0,3)){
      lights.push({id:`liquid-${sector.id}-${lights.length}`,sector:sector.id,x:c.x,y:c.y,z:sector.floor+6,
        range:4.3,power:3.7,color:[.23,.66,.075],source:'toxic-floor'});
    }
  }
  // Wall lamps and computer screens already exist in the fixed plan. Use their
  // visible wall spans, instead of putting an unmotivated bright point beneath
  // every plain ceiling. Offset each source into its own sector, never a wall.
  for(const line of map.lines)for(const left of [false,true]){
    const side=map.sides[left?line.left:line.right];if(!side)continue;
    const sector=map.sectors[side.sector],other=map.sides[left?line.right:line.left];
    const back=other?map.sectors[other.sector]:null;
    const a=map.vertices[left?line.v2:line.v1],b=map.vertices[left?line.v1:line.v2];
    const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);if(length<4)continue;
    for(const band of ['middle','upper','lower']){
      const name=side[band],lamp=/^LITE/.test(name),screen=/^COMP/.test(name);
      if(!lamp&&!screen)continue;
      const bottom=band==='upper'?Math.max(sector.floor,back?.ceiling??sector.ceiling):sector.floor;
      const top=band==='lower'?Math.min(sector.ceiling,back?.floor??sector.floor):sector.ceiling;
      if(top-bottom<8)continue;
      const count=screen?Math.min(2,Math.max(1,Math.floor(length/128))):1;
      for(let i=0;i<count;i++){
        const t=(i+.5)/count,x=a.x+dx*t+dy/length*4,y=a.y+dy*t-dx/length*4;
        if(map.sectorAt(x,y)?.id!==sector.id)continue;
        lights.push({id:`wall-${line.id}-${left?1:0}-${band}-${i}`,sector:sector.id,x,y,z:(bottom+top)*.5,
          band,back:back?.id,range:lamp?6:4,power:lamp?12:3.1,color:lamp?[.91,1,.78]:[.27,.48,.70],
          source:lamp?'wall-lamp':'computer-screen'});
      }
    }
  }
  const walls=map.lines.map(line=>({a:map.vertices[line.v1],b:map.vertices[line.v2],
    front:map.sides[line.right]?.sector,back:map.sides[line.left]?.sector}));
  return {lights,walls,map};
}

function lightHeight(rig,light,sector){
  if(light.source==='toxic-floor')return sector.floor+6;
  if(light.source==='sector-bounce')return sector.floor+(sector.ceiling-sector.floor)*.62;
  if(light.band){
    const back=rig.map.sectors[light.back];
    const bottom=light.band==='upper'?Math.max(sector.floor,back?.ceiling??sector.ceiling):sector.floor;
    const top=light.band==='lower'?Math.min(sector.ceiling,back?.floor??sector.floor):sector.ceiling;
    return (bottom+top)*.5;
  }
  return sector.ceiling-(light.source==='open-sky'?2:7);
}

/** Reject lights hidden by solid walls or the current height of a closed door. */
export function lightPathOpen(rig,from,to){
  const dx=to.x-from.x,dy=to.y-from.y;
  for(const wall of rig.walls){
    const ex=wall.b.x-wall.a.x,ey=wall.b.y-wall.a.y,den=dx*ey-dy*ex;
    if(Math.abs(den)<1e-8)continue;
    const ax=wall.a.x-from.x,ay=wall.a.y-from.y,t=(ax*ey-ay*ex)/den,u=(ax*dy-ay*dx)/den;
    if(t<.002||t>.998||u<-.0001||u>1.0001)continue;
    if(wall.front===undefined||wall.back===undefined)return false;
    const a=rig.map.sectors[wall.front],b=rig.map.sectors[wall.back],z=from.z+(to.z-from.z)*t;
    if(z<=Math.max(a.floor,b.floor)+.2||z>=Math.min(a.ceiling,b.ceiling)-.2)return false;
  }
  return true;
}

function pack(lights,eye,target,ambient,outdoor,fogDensity=0){
  const positions=new Float32Array(MAX_SCENE_LIGHTS*4),colors=new Float32Array(MAX_SCENE_LIGHTS*4);
  lights.slice(0,MAX_SCENE_LIGHTS).forEach((light,i)=>{
    positions.set([...light.position,light.range],i*4);colors.set([...light.color,light.power],i*4);
  });
  const key=lights[0]||{position:eye.map((v,i)=>v+(i===1?3:0))};
  const forward=unit(sub(target,key.position)),reference=Math.abs(forward[1])>.98?[0,0,1]:[0,1,0];
  const right=unit(cross(forward,reference)),up=cross(right,forward);
  return {positions,colors,count:Math.min(lights.length,MAX_SCENE_LIGHTS),
    shadowVP:shadowProjection(key.position,target),ambient,outdoor,fogDensity,fogColor:[.027,.036,.037],
    shadowView:{oeil:key.position,avant:forward,droite:right,haut:up,tangente:Math.tan(56*Math.PI/180),largeur:1,hauteur:1},
    shadowRange:key.range||14,
    sources:lights.slice(0,MAX_SCENE_LIGHTS).map(l=>({id:l.id,source:l.source,position:l.position}))};
}

export function sceneLighting(rig,view,entities=[],time=0,weapon=null){
  const eye=view.oeil,origin={x:eye[0]*32,y:-eye[2]*32,z:eye[1]*32};
  const sector=rig.map.sectorAt(origin.x,origin.y),candidates=[];
  for(const light of rig.lights){
    const s=rig.map.sectors[light.sector];if(s.ceiling-s.floor<40)continue;
    const z=lightHeight(rig,light,s),position=[light.x/32,z/32,-light.y/32];
    const distance=Math.hypot(...sub(position,eye));if(distance>light.range*1.4)continue;
    // Choose the primary shadow light by its steady power; a flicker must not
    // make the shadow camera jump between fixtures every game tick.
    candidates.push({...light,z,position,power:light.power*sectorLightPulse(s.special,time),score:light.power/(2+distance*distance)});
  }
  const accepted=candidates.sort((a,b)=>b.score-a.score).slice(0,18).filter(l=>lightPathOpen(rig,origin,l)).slice(0,MAX_SCENE_LIGHTS);
  for(const e of entities){
    if(e.removed||!(e.type===2028||e.projectile||e.state==='exploding'))continue;
    const position=[e.x/32,((e.z||0)+(e.type===2028?43:e.projectile?0:25))/32,-e.y/32],distance=Math.hypot(...sub(position,eye));
    if(distance>7)continue;
    const l={id:'object-'+e.id,source:e.type===2028?'lamp':'flame',position,range:5,power:e.type===2028?10:13,
      color:e.type===2028?[1,.85,.45]:[1,.31,.065],score:8/(1+distance*distance)};
    if(lightPathOpen(rig,origin,{x:e.x,y:e.y,z:position[1]*32}))accepted.push(l);
  }
  if(!accepted.length){
    const height=(sector?.ceiling??origin.z+88)/32;
    accepted.push({id:'room-fill',source:'sector-bounce',position:[eye[0]-.8,Math.max(height-.2,eye[1]+.5),eye[2]-.3],range:9,
      color:[.60,.69,.73],power:2.5,score:1});
  }
  accepted.sort((a,b)=>b.score-a.score);
  if(weapon&&weapon.kind!=='fist'&&weapon.phase>=0&&weapon.phase<.08){
    const position=eye.map((v,i)=>v+view.avant[i]*.8-view.haut[i]*.15);
    accepted.splice(1,0,{id:'muzzle',source:'muzzle',position,range:5,power:20*(1-weapon.phase/.1),color:[1,.6,.2],score:100});
  }
  const target=eye.map((v,i)=>v+view.avant[i]*3.5+(i===1?-.5:0));
  const outside=sector?.ceilingTexture==='F_SKY1';
  return pack(accepted,eye,target,.64+Math.max(0,(sector?.light??160)/255)*.22,outside?1:0,outside?.009:.014);
}

/** Controlled portrait lighting used by the model inspection fixtures. */
export function studioLighting(view,target){
  const center=target||view.oeil.map((v,i)=>v+view.avant[i]*2);
  const at=(r,f,u)=>center.map((v,i)=>v+view.droite[i]*r+view.avant[i]*f+view.haut[i]*u);
  return pack([
    {id:'studio-key',source:'studio',position:at(-2.7,-3.4,3.8),range:14,power:105,color:[1,.88,.75]},
    {id:'studio-fill',source:'studio',position:at(3.4,-2,1.4),range:12,power:36,color:[.69,.81,1]},
    {id:'studio-rim',source:'studio',position:at(.8,2.5,3),range:12,power:100,color:[.77,.86,1]}
  ],view.oeil,center,.9,0);
}
