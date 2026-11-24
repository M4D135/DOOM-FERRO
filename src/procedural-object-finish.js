/** Deterministic material ageing on generated solids, never a projected image.
 * Colours and roughness are evaluated at shared positions, so triangle borders
 * cannot acquire independent random stains. The recipe costs no extra geometry. */
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const blend=(a,b,t)=>a+(b-a)*t;
function noise(x,y,z,seed){
 const xi=Math.floor(x),yi=Math.floor(y),zi=Math.floor(z),smooth=v=>v*v*(3-2*v),
  u=smooth(x-xi),v=smooth(y-yi),w=smooth(z-zi);
 const hash=(a,b,c)=>{let h=Math.imul(a,374761393)^Math.imul(b,668265263)^Math.imul(c,2147483647)^seed;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967295;};
 const row=(yy,zz)=>blend(hash(xi,yy,zz),hash(xi+1,yy,zz),u);
 return blend(blend(row(yi,zi),row(yi+1,zi),v),blend(row(yi,zi+1),row(yi+1,zi+1),v),w);
}

export function ageSurface(mesh,profile){
 const v=mesh.vertices,armour=profile.startsWith('ARM'),barrel=profile==='BAR1',medical=profile==='MEDI'||profile==='STIM',
  weapon=profile==='weapon',height=mesh.bounds.max[2]-mesh.bounds.min[2];
 let seed=2166136261;for(const ch of profile)seed=Math.imul(seed^ch.charCodeAt(0),16777619);
 for(let i=0;i<v.length;i+=17){
  const kind=v[i+12];if(kind!==4&&kind!==5&&kind!==3&&kind!==8&&kind!==2)continue;
  const x=v[i],y=v[i+1],z=v[i+2],n=noise(x*.23,y*.23,z*.23,seed),fine=noise(x*.78,y*.78,z*.78,seed+97),
   ground=weapon?0:Math.exp(-Math.max(0,z-mesh.bounds.min[2])/(medical?2.1:height*.09+1.0));
  let dirt=.055+.10*n+.17*ground,edge=0;
  if(barrel){
   const angle=Math.atan2(y,x),underRib=Math.exp(-1*((z-8.1)/.65)**2)+Math.exp(-1*((z-20.1)/.85)**2),
    drip=Math.exp(-1*((angle+.63)/.26)**2)*Math.exp(-1*((z-22)/9)**2);
   dirt+=.18*underRib*(.4+.6*n)+.15*drip;
   edge=clamp(Math.abs(v[i+5])-.27)*(.4+.6*fine);
  }else if(armour){
   dirt+=.11*Math.exp(-1*((z-6.1)/.75)**2)*(.5+.5*n);
   edge=(Math.exp(-1*((z-1.45)/.32)**2)+.55*Math.exp(-1*((z-15.2)/.55)**2))*clamp((fine-.43)*2.1);
  }else if(medical){
   dirt+=.14*Math.exp(-1*((z-(profile==='MEDI'?10.5:13.1))/.8)**2)*(.25+.75*n);
   edge=clamp((Math.abs(x)/(profile==='MEDI'?13.6:6.5)-.88)*8)*clamp((fine-.43)*1.8)*.38;
  }
  dirt=clamp(dirt,0,.43);
  if(kind===5){
   const marking=v[i+6]>v[i+7]*3&&v[i+6]>v[i+8]*3||profile==='SBOX'&&Math.max(v[i+6],v[i+7],v[i+8])<.25;
   const factor=marking?1:.985-dirt*.51;
   for(let k=0;k<3;k++)v[i+6+k]*=factor;
   // Broad pressed paint is satin/matte; only tiny worn edges expose metal.
   v[i+10]=clamp(Math.max(v[i+10],armour?.61:.59)+.12*n+.07*dirt,.44,.87);
   if(!marking&&edge>.08){
    const wear=Math.min(.22,edge*.24),steel=[.30,.32,.29];
    for(let k=0;k<3;k++)v[i+6+k]=blend(v[i+6+k],steel[k],wear);
    v[i+11]=blend(v[i+11],.72,wear);v[i+10]-=wear*.18;
   }
  }else if(kind===4){
   const dull=.96-dirt*.38;
   for(let k=0;k<3;k++)v[i+6+k]*=dull;
   v[i+10]=clamp(Math.max(v[i+10],weapon?.34:.39)+.13*n+.08*ground,.28,.85);
  }else if(kind===3||kind===2){
   for(let k=0;k<3;k++)v[i+6+k]*=.98-dirt*.18;
   v[i+10]=Math.max(v[i+10],kind===3?.78:.94);
  }else if(kind===8){
   for(let k=0;k<3;k++)v[i+6+k]*=.97-.035*n;
   v[i+10]=clamp(v[i+10]+.055*n,0,.9);
  }
 }
 return mesh;
}
