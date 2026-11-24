/** Production shaders for the FERRO host pass. All maps and geometry are made
 * by this project. GGX / Smith / Schlick use the standard microfacet model;
 * indirect light and skin transmission remain bounded real-time approximations.
 * Reference: https://google.github.io/filament/main/filament.html */
const LIGHTING = `
uniform vec3 uEye,uFogColor;
uniform float uFogDensity;
uniform float uTime,uBrightness,uDamage,uFlash,uAmbient,uOutdoor;
uniform vec4 uLights[8],uLightColors[8];
uniform int uLightCount;
precision highp sampler2DShadow;
uniform sampler2DShadow uShadow,uSelfShadow;
uniform mat4 uShadowVP,uSelfShadowVP;
uniform vec2 uShadowTexel,uSelfShadowTexel;
uniform bool uShadowEnabled,uSelfShadowEnabled,uAOOutput;
const float PI=3.14159265359;
float sat(float x){return clamp(x,0.0,1.0);}
vec3 linearColor(vec3 c){return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));}
vec3 displayColor(vec3 c){return mix(c*12.92,1.055*pow(max(c,vec3(0)),vec3(1.0/2.4))-.055,step(vec3(.0031308),c));}
vec3 film(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.0,1.0);}
float sectorPower(float light,int special){
 if(special==1)light*=fract(sin(floor(uTime*12.0)+float(special))*173.19)>.72?.4:1.0;
 if(special==2||special==4||special==12)light*=mod(uTime,1.0)<.17?1.0:.35;
 if(special==3||special==13)light*=mod(uTime,.5)<.17?1.0:.35;
 if(special==8)light*=.68+.32*sin(uTime*2.6);
 return clamp(light,.12,1.0);
}
float shadowSample(sampler2DShadow depthMap,mat4 matrix,vec2 texel,vec3 p,vec3 n,float depthBias){
 vec4 clip=matrix*vec4(p+n*.003,1);if(clip.w<=0.0)return 1.0;
 vec3 q=clip.xyz/clip.w*.5+.5;
 if(q.z<=0.0||q.z>=1.0||q.x<=.001||q.x>=.999||q.y<=.001||q.y>=.999)return 1.0;
 float bias=depthBias+depthBias*2.6*(1.0-max(dot(n,normalize(uLights[0].xyz-p)),0.0));
 float amount=0.0;
 for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
  amount+=texture(depthMap,vec3(q.xy+vec2(float(x),float(y))*texel*1.35,q.z-bias));
 }
 return amount/9.0;
}
float shadowAt(vec3 p,vec3 n){
 if(!uShadowEnabled)return 1.0;
 float visibility=shadowSample(uShadow,uShadowVP,uShadowTexel,p,n,.00028);
 if(uSelfShadowEnabled)visibility*=shadowSample(uSelfShadow,uSelfShadowVP,uSelfShadowTexel,p,n,.00006);
 return visibility;
}
vec3 fresnel(float vh,vec3 f0){float t=pow(1.0-vh,5.0);return f0+(1.0-f0)*t;}
vec3 brdf(vec3 base,vec3 n,vec3 v,vec3 l,float rough,float metal,float f0Value){
 vec3 h=normalize(v+l);float nv=max(dot(n,v),.001),nl=max(dot(n,l),.0),nh=max(dot(n,h),0.0),vh=max(dot(v,h),0.0);
 float a=max(.035,rough*rough),a2=a*a,k=nh*nh*(a2-1.0)+1.0;
 float D=a2/max(PI*k*k,.00001);
 float visibility=.5/max(nl*sqrt(nv*nv*(1.0-a2)+a2)+nv*sqrt(nl*nl*(1.0-a2)+a2),.0001);
 vec3 F=fresnel(vh,mix(vec3(f0Value),base,metal));
 return ((1.0-F)*(1.0-metal)*base/PI+D*visibility*F)*nl;
}
vec4 shadeSurface(vec3 srgb,vec3 p,vec3 normal,float rough,float metal,float ao,float emission,float sector,int kind){
 vec3 base=linearColor(clamp(srgb,0.0,1.0)),n=normalize(normal),v=normalize(uEye-p);
 rough=clamp(rough,.07,.97);metal=clamp(metal,0.0,1.0);
 float nv=max(dot(n,v),.001),f0=kind==7?.025:kind==1?.028:.04;
 vec3 F=fresnel(nv,mix(vec3(f0),base,metal)),r=reflect(-v,n);
 vec3 diffuseSky=mix(vec3(.036,.039,.038),vec3(.15,.18,.20),n.y*.5+.5);
 vec3 reflectedSky=mix(vec3(.018,.022,.022),vec3(.20,.25,.29),r.y*.5+.5);
 vec3 indirect=(base*(1.0-metal)*diffuseSky+(reflectedSky*F)*mix(.8,.22,rough))*ao;
 indirect*=uAmbient*(.23+sector*.77)*(1.0+uOutdoor*.4);
 vec3 direct=vec3(0);float shadow=shadowAt(p,n);
 for(int i=0;i<8;i++){
  if(i>=uLightCount)break;
  vec3 delta=uLights[i].xyz-p;float d2=dot(delta,delta),distance=sqrt(d2),range=uLights[i].w;
  vec3 l=delta/max(distance,.001);float falloff=pow(sat(1.0-pow(distance/max(range,.1),4.0)),2.0)/(1.0+d2);
  float visible=i==0?shadow:1.0;
  vec3 radiance=uLightColors[i].rgb*uLightColors[i].w*falloff*visible;
  direct+=brdf(base,n,v,l,rough,metal,f0)*radiance;
  if(kind==1){ // Small diffuse wrap approximates transport through skin; no texture or scan.
   float wrap=max(0.0,(dot(n,l)+.32)/1.32)-max(0.0,dot(n,l));
   direct+=base*vec3(1.0,.44,.24)*wrap*.17*radiance/PI;
  }
 }
 if(kind==2)indirect+=base*.025*pow(1.0-nv,3.0)*ao;
 vec3 luminous=base*max(0.0,emission)*3.5;
 vec3 lit=(indirect+direct+luminous)*uBrightness;
 float ambientPart=dot(indirect,vec3(.2126,.7152,.0722))/max(.001,dot(indirect+direct+luminous,vec3(.2126,.7152,.0722)));
 // Analytic distance haze gives the long corridors depth; no particle cards,
 // texture, extra geometry or claim of volumetric light scattering is involved.
 float haze=1.0-exp(-uFogDensity*max(0.0,length(uEye-p)-3.0));
 vec3 color=displayColor(film(mix(lit,uFogColor,haze)));
 color=mix(color,vec3(.65,.015,.005),clamp(uDamage,0.0,.55));
 return vec4(color,uAOOutput?clamp(ambientPart,.05,.95):1.0);
}
`;

const NOISE=`
float hash3(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float noise3(vec3 p){
 vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 return mix(mix(mix(hash3(i),hash3(i+vec3(1,0,0)),f.x),mix(hash3(i+vec3(0,1,0)),hash3(i+vec3(1,1,0)),f.x),f.y),
 mix(mix(hash3(i+vec3(0,0,1)),hash3(i+vec3(1,0,1)),f.x),mix(hash3(i+vec3(0,1,1)),hash3(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float filteredLine(float phase){float width=fwidth(phase);return sin(phase)*exp(-width*width*.2);}
`;

export const WORLD_VERTEX=`#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec2 aUV;
layout(location=2) in float aLight;
layout(location=3) in float aSpecial;
uniform mat4 uVP;
out vec2 vUV;out vec3 vPosition;out float vLight;flat out int vSpecial;
void main(){vUV=aUV;vPosition=aPosition;vLight=aLight;vSpecial=int(aSpecial+.5);gl_Position=uVP*vec4(aPosition,1.0);}`;

export const WORLD_FRAGMENT=`#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uTexture,uNormalRoughness,uSurface;
uniform vec2 uHeightUV;
uniform bool uRelief;
in vec2 vUV;in vec3 vPosition;in float vLight;flat in int vSpecial;
layout(location=0) out vec4 fragColor;
layout(location=1) out vec4 fragNormal;
${LIGHTING}
void main(){
 vec3 dx=dFdx(vPosition),dy=dFdy(vPosition),n=normalize(cross(dx,dy));
 fragNormal=vec4(n*.5+.5,1);
 vec2 ux=dFdx(vUV),uy=dFdy(vUV);float determinant=ux.x*uy.y-ux.y*uy.x;
 float inv=abs(determinant)>.0000001?1.0/determinant:1.0;
 vec3 t=normalize((dx*uy.y-dy*ux.y)*inv),b=normalize((dy*ux.x-dx*uy.x)*inv);
 float scroll=vSpecial>=1000?uTime*35.0/float(vSpecial/1000):0.0;
 vec2 uv=vUV+vec2(scroll,0);
 if(uRelief&&length(vPosition-uEye)<15.0){
  vec3 view=normalize(uEye-vPosition);vec3 tangentView=vec3(dot(view,t),dot(view,b),dot(view,n));
  vec2 shift=tangentView.xy/max(tangentView.z,.22)*uHeightUV;
  vec2 stepUV=shift/10.0;float depth=0.0;
  for(int i=0;i<10;i++){
   if(depth>=1.0-texture(uSurface,uv).a)break;
   uv-=stepUV;depth+=.1;
  }
  vec2 previous=uv+stepUV;
  float after=depth-(1.0-texture(uSurface,uv).a),before=depth-.1-(1.0-texture(uSurface,previous).a);
  uv=mix(uv,previous,clamp(after/max(.0001,after-before),0.0,1.0));
 }
 vec4 color=texture(uTexture,uv);if(color.a<.5)discard;
 vec4 nr=texture(uNormalRoughness,uv),surface=texture(uSurface,uv);
 vec3 local=normalize(nr.xyz*2.0-1.0);n=normalize(t*local.x+b*local.y+n*local.z);
 fragColor=shadeSurface(color.rgb,vPosition,n,nr.a,surface.r,surface.g,surface.b,sectorPower(vLight,vSpecial%1000),0);
}`;

export const MODEL_VERTEX=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
layout(location=3) in float aEmission;
layout(location=4) in vec4 aMaterial;
layout(location=5) in vec3 aSurface;
layout(location=6) in vec4 aOriginYaw;
layout(location=7) in vec4 aScaleLight;
uniform mat4 uVP;
uniform vec3 uEye,uRight,uForward,uUp;
uniform bool uViewModel;
out vec3 vPosition,vNormal,vColor,vSurface;
out float vEmission,vLight;
out vec4 vMaterial;flat out int vSpecial;
void main(){
 vec3 local=aPosition*aScaleLight.x;
 if(uViewModel){
  local+=aOriginYaw.xyz;
  vPosition=uEye+(uRight*local.x+uForward*local.y+uUp*local.z)/32.0;
  vNormal=uRight*aNormal.x+uForward*aNormal.y+uUp*aNormal.z;
 }else{
  float c=cos(aOriginYaw.w),s=sin(aOriginYaw.w);
  vPosition=aOriginYaw.xyz+vec3(s*local.x+c*local.y,local.z,c*local.x-s*local.y)/32.0;
  vNormal=vec3(s*aNormal.x+c*aNormal.y,aNormal.z,c*aNormal.x-s*aNormal.y);
 }
 vColor=aColor;vEmission=aEmission;vLight=aScaleLight.y;vSpecial=int(aScaleLight.z+.5);
 vSurface=aSurface;vMaterial=aMaterial;gl_Position=uVP*vec4(vPosition,1.0);
}`;

export const MODEL_FRAGMENT=`#version 300 es
precision highp float;
precision highp int;
in vec3 vPosition,vNormal,vColor,vSurface;
in float vEmission,vLight;
in vec4 vMaterial;flat in int vSpecial;
layout(location=0) out vec4 fragColor;
layout(location=1) out vec4 fragNormal;
${LIGHTING}
${NOISE}
void main(){
 vec3 p=vSurface*max(.01,vMaterial.w),albedo=vColor;
 int kind=int(vMaterial.z+.5);
 float rough=clamp(vMaterial.x,.08,1.0),metal=clamp(vMaterial.y,0.0,1.0);
 float broad=noise3(p*.28),fine=(noise3(p*24.0)-.5)*exp(-length(fwidth(p))*15.0),height=0.0,ao=1.0;
 if(kind==1){
  float pores=pow(noise3(p*36.0),4.0)*exp(-length(fwidth(p))*22.0);
  albedo*=.98+broad*.04+fine*.018;albedo+=vec3(.009,-.002,-.003)*(noise3(p*.9)-.5);
  rough=clamp(rough+fine*.08,.38,.72);metal=0.0;height=-pores*.000075;
 }else if(kind==2){
  float warp=filteredLine(p.x*68.0),weft=filteredLine(p.z*72.0),weave=warp*weft;
  albedo*=.96+broad*.065+weave*.022+fine*.018;rough=max(.82,rough);metal=0.0;height=weave*.00009;
 }else if(kind==3){
  float crease=pow(1.0-abs(noise3(p*4.5)*2.0-1.0),18.0);
  albedo*=.96+broad*.07-crease*.025+fine*.025;rough=clamp(rough+fine*.12,.38,.84);metal=0.0;height=(fine-crease*.2)*.00015;
 }else if(kind==4){
  float brush=filteredLine(p.z*155.0+noise3(p*.8)*3.0);
  albedo*=.98+fine*.025+brush*.008;rough=clamp(rough+(broad-.5)*.07+brush*.018,.15,.65);height=brush*.000025;
 }else if(kind==5){
  float chip=smoothstep(.9,.98,noise3(p*7.5))*exp(-length(fwidth(p))*10.0);
  albedo*=.98+broad*.03+fine*.012;albedo=mix(albedo,vec3(.17,.18,.16),chip*.2);
  rough=clamp(rough+fine*.05,.26,.8);metal=mix(min(metal,.12),.75,chip*.4);height=fine*.00004;
 }else if(kind==6){albedo*=.97+broad*.055;metal=0.0;height=fine*.000035;
 }else if(kind==7){rough=clamp(rough,.07,.18);metal=0.0;albedo*=.98+broad*.025;
 }else if(kind==8){
  float grain=filteredLine(p.x*11.0+noise3(vec3(p.x*.8,p.y*.8,p.z*.035))*6.0);
  float fibre=filteredLine(p.x*90.0+noise3(p*.3)*12.0);
  albedo*=.94+broad*.08+grain*.055+fibre*.012;rough=clamp(rough,.34,.76);metal=0.0;height=grain*.00009+fibre*.000025;
 }else if(kind==9){albedo*=.96+broad*.06;rough=clamp(rough+(broad-.5)*.06,.22,.86);metal=0.0;
 }else if(kind==10){rough=.25;metal=0.0;}
 vec3 n=normalize(vNormal),dx=dFdx(vPosition),dy=dFdy(vPosition);
 fragNormal=vec4(n*.5+.5,1);
 vec3 tx=cross(dy,n),ty=cross(n,dx);float determinant=dot(dx,tx);
 vec3 gradient=sign(determinant)*(dFdx(height)*tx+dFdy(height)*ty)/max(abs(determinant),.000001);
 n=normalize(n-clamp(gradient,vec3(-.18),vec3(.18)));
 fragColor=shadeSurface(albedo,vPosition,n,rough,metal,ao,vEmission,sectorPower(vLight,vSpecial),kind);
}`;

export const SKY_VERTEX=`#version 300 es
precision highp float;
out vec2 vNDC;
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));vNDC=p*2.0-1.0;gl_Position=vec4(vNDC,.99999,1.0);}`;
export const SKY_FRAGMENT=`#version 300 es
precision highp float;
uniform vec3 uForward,uRight,uUp;
uniform vec2 uFov;
uniform float uTime;
in vec2 vNDC;layout(location=0) out vec4 fragColor;layout(location=1) out vec4 fragNormal;
${NOISE}
float cloud(vec3 p){float a=.55,total=0.0;for(int i=0;i<5;i++){total+=noise3(p)*a;p=p*2.07+vec3(3.1,1.7,5.3);a*=.48;}return total;}
void main(){
 vec3 d=normalize(uForward+uRight*vNDC.x*uFov.x+uUp*vNDC.y*uFov.y);
 float angle=atan(d.z,d.x),horizon=d.y/max(.01,length(d.xz));
 vec3 overcast=mix(vec3(.31,.35,.36),vec3(.13,.18,.21),smoothstep(-.1,.9,d.y));
 float vapour=cloud(d*5.0+vec3(uTime*.004,1.0,0));
 overcast+=vec3(.24,.25,.24)*(vapour-.42);
 float ridge=.035+.052*sin(angle*9.0+.5)+.043*sin(angle*17.0+1.8)+.019*sin(angle*39.0);
 float back=.07+.027*sin(angle*7.0)+.023*sin(angle*23.0);
 float detail=cloud(vec3(angle*42.0,horizon*28.0,3.0));
 vec3 mountain=mix(vec3(.13,.14,.14),vec3(.34,.35,.34),detail);
 mountain+=vec3(.14)*(smoothstep(.51,.76,detail)*smoothstep(-.05,.13,horizon));
 vec3 c=mix(overcast,mix(vec3(.32,.35,.36),mountain,smoothstep(-.1,.02,ridge-horizon)),(1.0-smoothstep(back-.004,back+.004,horizon)));
 c=mix(c,mountain,(1.0-smoothstep(ridge-.003,ridge+.003,horizon)));
 fragColor=vec4(c,1.0);fragNormal=vec4(.5,.5,1,0);
}`;

export const SHADOW_VERTEX=`#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec2 aUV;
layout(location=3) in float aSpecial;
layout(location=6) in vec4 aOriginYaw;
layout(location=7) in vec4 aScaleLight;
uniform mat4 uVP;
uniform bool uModel,uViewModel;
uniform vec3 uEye,uRight,uForward,uUp;
uniform float uTime;
out vec2 vUV;
void main(){
 vec3 p=aPosition;
 if(uModel){
  vec3 local=p*aScaleLight.x;
  if(uViewModel){local+=aOriginYaw.xyz;p=uEye+(uRight*local.x+uForward*local.y+uUp*local.z)/32.0;}
  else{float c=cos(aOriginYaw.w),s=sin(aOriginYaw.w);p=aOriginYaw.xyz+vec3(s*local.x+c*local.y,local.z,c*local.x-s*local.y)/32.0;}
 }
 vUV=aUV;
 if(!uModel&&aSpecial>=1000.0)vUV.x+=uTime*35.0/floor(aSpecial/1000.0);
 gl_Position=uVP*vec4(p,1.0);
}`;
export const SHADOW_FRAGMENT=`#version 300 es
precision highp float;
uniform sampler2D uTexture;
uniform bool uAlphaTest;
in vec2 vUV;
void main(){if(uAlphaTest&&texture(uTexture,vUV).a<.5)discard;}`;

export const POST_VERTEX=`#version 300 es
precision highp float;
out vec2 vUV;
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));vUV=p;gl_Position=vec4(p*2.0-1.0,0,1);}`;
export const POST_FRAGMENT=`#version 300 es
precision highp float;
uniform sampler2D uScene,uDepth,uNormal;
uniform vec3 uRight,uUp,uForward;
uniform vec2 uPixel,uFov,uNearFar;
uniform bool uContactAO;
in vec2 vUV;out vec4 fragColor;
float luminance(vec3 c){return dot(c,vec3(.299,.587,.114));}
vec3 positionAt(vec2 uv){
 float d=texture(uDepth,uv).r;
 float z=-(2.0*uNearFar.x*uNearFar.y)/(uNearFar.y+uNearFar.x-(d*2.0-1.0)*(uNearFar.y-uNearFar.x));
 return vec3((uv*2.0-1.0)*(-z)*uFov,z);
}
void main(){
 vec4 center=texture(uScene,vUV);vec3 color=center.rgb;
 vec3 north=texture(uScene,vUV+vec2(0,uPixel.y)).rgb,south=texture(uScene,vUV-vec2(0,uPixel.y)).rgb;
 vec3 east=texture(uScene,vUV+vec2(uPixel.x,0)).rgb,west=texture(uScene,vUV-vec2(uPixel.x,0)).rgb;
 float l=luminance(color),ln=luminance(north),ls=luminance(south),le=luminance(east),lw=luminance(west);
 float contrast=max(max(ln,ls),max(le,lw))-min(min(ln,ls),min(le,lw));
 if(contrast>max(.06,l*.18)){
  vec2 edge=normalize(vec2(-(ln-ls),le-lw)+vec2(.00001))*uPixel;
  vec3 filtered=(texture(uScene,vUV+edge*.55).rgb+texture(uScene,vUV-edge*.55).rgb)*.5;
  color=mix(color,filtered,.65);
 }
 float depth=texture(uDepth,vUV).r;
 if(uContactAO&&depth<.9999){
  vec3 p=positionAt(vUV),worldNormal=normalize(texture(uNormal,vUV).xyz*2.0-1.0);
  vec3 n=vec3(dot(worldNormal,uRight),dot(worldNormal,uUp),-dot(worldNormal,uForward));float radius=.36;
  float scale=min(26.0,radius/max(.2,-p.z)/(uFov.y*uPixel.y)*.5),occlusion=0.0;
  for(int i=0;i<12;i++){
   float angle=float(i)*2.39996323,r=(.25+.75*float((i%3)+1)/3.0)*scale;
   vec2 sampleUV=clamp(vUV+vec2(cos(angle),sin(angle))*uPixel*r,uPixel,1.0-uPixel);
   vec3 delta=positionAt(sampleUV)-p;float distance=length(delta);
   float facing=max(0.0,dot(n,delta/max(distance,.001))-.12);
   occlusion+=facing*max(0.0,1.0-distance/radius)*smoothstep(.008,.04,distance);
  }
  color*=1.0-clamp(occlusion/12.0*2.0,0.0,.68)*clamp(center.a,.1,.9);
 }
 fragColor=vec4(color,1.0);
}`;

export const DOOM_SHADERS=Object.freeze({WORLD_VERTEX,WORLD_FRAGMENT,MODEL_VERTEX,MODEL_FRAGMENT,
  SKY_VERTEX,SKY_FRAGMENT,SHADOW_VERTEX,SHADOW_FRAGMENT,POST_VERTEX,POST_FRAGMENT});
