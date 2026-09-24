import { shader } from './native';
import { noise2, thermalShader, waterNormal } from '../world/field';

// Visual curvature only beyond the collision neighbourhood; terrain and sea share it.
export const horizonDrop = shader<'float'>(`fn exoHorizonDrop(p:vec2f,eye:vec2f)->f32 {
 let d=max(0.0,distance(p,eye)-8000.0);
 return d*d*0.0000001;
}`);

export const skyColor = shader<'vec3'>(`fn exoSky(rd: vec3f, sun: vec3f, storm: f32) -> vec3f {
 let mu=clamp(dot(rd,sun),-1.0,1.0);
 let horizon=exp(-abs(rd.y)*5.5);
 let rayleigh=0.05968*(1.0+mu*mu);
 let mie=0.035/pow(max(0.035,1.0+0.76*0.76-1.52*mu),1.5);
 let zenith=mix(vec3f(0.075,0.17,0.25),vec3f(0.018,0.052,0.085),storm);
 let haze=mix(vec3f(0.82,0.40,0.21),vec3f(0.12,0.26,0.34),storm);
 var col=mix(zenith,haze,horizon)* (0.8+rayleigh*2.0);
 col += vec3f(1.0,0.65,0.35)*mie*(1.0-storm*0.7);
 col += vec3f(6.0,3.4,1.8)*smoothstep(0.99965,0.9999,mu)*(1.0-storm*0.85);
 let moonDirection=normalize(vec3f(0.5,0.48,-0.9));let moonDistance=length(rd-moonDirection);
 let moonEdge=1.0-smoothstep(0.112,0.115,moonDistance);
 let moonLight=0.06+max(0.0,dot(normalize(rd-moonDirection+vec3f(0.0,0.0,0.06)),sun))*0.24;
 col=mix(col,vec3f(0.12,0.20,0.22)*moonLight,moonEdge*(1.0-storm*0.5));
 col+=vec3f(0.16,0.23,0.22)*exp(-abs(moonDistance-0.114)*600.0)*(1.0-storm*0.7);
 col *= mix(0.3,1.0,smoothstep(-0.22,0.08,rd.y));
 return col;
}`);
export const aerial = shader<'vec3'>(
  `fn exoAerial(col: vec3f, p: vec3f, eye: vec3f, sun: vec3f, storm: f32) -> vec3f {
 let d=distance(p,eye); let rd=normalize(p-eye);
 let edge=smoothstep(28000.0,31800.0,max(abs(eye.x),abs(eye.z)));
 let density=0.000036*exp(-max(0.0,(p.y+eye.y)*0.5)/6000.0)*(1.0+storm*1.5+edge*14.0);
 let extinction=exp(-d*density);
 return mix(exoSky(rd,sun,storm),col,extinction);
}`,
  [skyColor],
);

export const terrainColor = shader<'vec3'>(
  `fn exoTerrainColor(p: vec3f, eye: vec3f, sun: vec3f, storm: f32, ship:vec3f) -> vec3f {
 var n=normalize(cross(dpdy(p),dpdx(p))); if(n.y<0.0){n=-n;}
 let weights=pow(abs(n),vec3f(4.0)); let blend=weights/(weights.x+weights.y+weights.z);
 let detail=exoNoise(p.yz*0.12)*blend.x+exoNoise(p.xz*0.12)*blend.y+exoNoise(p.xy*0.12)*blend.z;
 let bands=exoNoise(p.xz*0.0009);
 let rock=mix(vec3f(0.08,0.115,0.13),vec3f(0.29,0.20,0.14),bands);
 let sand=vec3f(0.46,0.33,0.20);
 var col=mix(rock,sand,(1.0-smoothstep(12.0,130.0,p.y))*smoothstep(0.75,0.98,n.y));
 let snow=smoothstep(2000.0,2900.0,p.y+bands*400.0)*smoothstep(0.6,0.95,n.y);
 col=mix(col,vec3f(0.62,0.72,0.72),snow);
 col*=mix(0.68,1.15,detail);
 col*=mix(0.4,1.0,smoothstep(-2.0,18.0,p.y));
 let cloudShadow=mix(0.55,1.0,smoothstep(0.3,0.65,exoNoise(p.xz*0.00016+vec2f(13.0))));
 let light=0.24+max(0.0,dot(n,sun))*1.15*cloudShadow*(1.0-storm*0.4);
 let contactShadow=1.0-0.7*exp(-dot(p.xz-ship.xz,p.xz-ship.xz)/10.0)*exp(-max(0.0,ship.y-p.y-2.5)/8.0);
 return exoAerial(col*light*contactShadow,p,eye,sun,storm);
}`,
  [noise2, aerial],
);

export const noise3 = shader<'float'>(
  `fn exoNoise3(p: vec3f) -> f32 {
 let z=floor(p.z);let f=fract(p.z);let u=f*f*(3.0-2.0*f);
 return mix(exoNoise(p.xy+vec2f(37.0,113.0)*z),exoNoise(p.xy+vec2f(37.0,113.0)*(z+1.0)),u);
}`,
  [noise2],
);
export const cloudDensity = shader<'float'>(
  `fn exoCloudDensity(p: vec3f,t:f32,storm:f32) -> f32 {
 let drift=vec3f(t*9.0,0.0,-t*4.0);
 let q=(p+drift)*0.00038;
 let base=exoNoise3(q)*0.64+exoNoise3(q*2.03+vec3f(12.0))*0.25+exoNoise3(q*4.1)*0.11;
 let erosion=exoNoise3(q*10.0)*0.11;
 let coverage=exoNoise(p.xz*0.000075+vec2f(24.0));
 let layer=smoothstep(1400.0,2100.0,p.y)*(1.0-smoothstep(3200.0,4600.0,p.y));
 var lift=0.0; ${thermalShader}
 let towers=clamp(lift,0.0,1.0)*0.18;
 return max(0.0,base-erosion-(0.52-storm*0.10-coverage*0.11-towers))*max(layer,clamp(lift,0.0,1.0)*0.65)*0.008;
}`,
  [noise3, noise2],
);
export const clouds = shader<'vec4'>(
  `fn exoClouds(ro:vec3f,rd:vec3f,sceneDistance:f32,sun:vec3f,t:f32,storm:f32,steps:i32,lightSteps:i32,jitter:f32) -> vec4f {
 var start=0.0;var finish=min(sceneDistance,45000.0);
 if(abs(rd.y)>0.00001){
  let a=(0.0-ro.y)/rd.y;let b=(6600.0-ro.y)/rd.y;
  start=max(0.0,min(a,b));finish=min(finish,max(a,b));
 }else if(ro.y<0.0||ro.y>6600.0){return vec4f(0.0);}
 if(finish<=start){return vec4f(0.0);}
 // Concentrate samples near the camera without losing the distant horizon.
 let span=finish-start;var transmittance=1.0;var color=vec3f(0.0);
 let mu=dot(rd,sun);let phase=0.4+0.13/pow(max(0.10,1.0+0.65*0.65-1.3*mu),1.5);
 for(var i=0;i<96;i++){
  if(i>=steps||transmittance<0.015){break;}
  let f=(f32(i)+jitter)/f32(steps);let fnxt=(f32(i)+1.0)/f32(steps);
  let distance=start+span*f*f;let fbase=f32(i)/f32(steps);let ds=max(1.0,span*(fnxt*fnxt-fbase*fbase));
  let p=ro+rd*distance;let density=exoCloudDensity(p,t,storm);
  if(density>0.00001){
   var optical=0.0;
   for(var j=0;j<7;j++){if(j>=lightSteps){break;}let l=(f32(j)+0.5)*130.0;optical+=exoCloudDensity(p+sun*l,t,storm)*130.0;}
   let lighting=exp(-optical)*phase;
   let ambient=mix(vec3f(0.20,0.29,0.36),vec3f(0.06,0.12,0.18),storm);
   let direct=mix(vec3f(1.3,0.85,0.48),vec3f(0.5,0.72,0.88),storm)*lighting;
   let alpha=1.0-exp(-density*ds);
   color+=transmittance*alpha*(ambient+direct);transmittance*=1.0-alpha;
  }
 }
 return vec4f(color,1.0-transmittance);
}`,
  [cloudDensity],
);

export const waterColor = shader<'vec3'>(
  `fn exoWaterColor(p:vec3f,eye:vec3f,sun:vec3f,storm:f32,ground:f32,ship:vec3f,t:f32) -> vec3f {
 let footprint=length(fwidth(p.xz));
 var n=exoWaterNormal(p.xz,t,footprint);
 let micro=vec2f(exoNoise(p.xz*0.045+vec2f(t*0.1)),exoNoise(p.xz*0.057-vec2f(t*0.08)))-0.5;
 n=normalize(n+vec3f(micro.x*0.2,0.0,micro.y*0.2)*exp(-footprint*0.06));
 let view=normalize(eye-p);let fresnel=0.035+0.965*pow(1.0-max(0.0,dot(view,n)),5.0);
 let reflectColor=exoSky(reflect(-view,n),sun,storm);
 let water=mix(vec3f(0.012,0.045,0.065),vec3f(0.04,0.20,0.21),exp(-max(0.0,p.y-ground)*0.025));
 let sunGlint=pow(max(0.0,dot(reflect(-sun,n),view)),180.0);
 let foam=(1.0-smoothstep(0.0,8.0,p.y-ground))*(0.4+0.6*exoNoise(p.xz*0.18));
 let wake=exp(-distance(p.xz,ship.xz)*0.04)*(1.0-smoothstep(4.0,20.0,ship.y))*smoothstep(0.35,0.65,sin(distance(p.xz,ship.xz)*0.4-t*5.0));
 let col=mix(water,reflectColor,fresnel)+vec3f(1.8,1.2,0.7)*sunGlint+vec3f(0.38,0.51,0.52)*(foam+wake*0.4);
 return exoAerial(col,p,eye,sun,storm);
}`,
  [noise2, skyColor, aerial, waterNormal],
);
