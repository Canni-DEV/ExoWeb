import { shader } from './native';
import { noise2, thermalShader, waterNormal, waterHeight, terrainHeight } from '../world/field';
export const horizonDrop = shader<'float'>(`fn exoHorizonDrop(p:vec2f,eye:vec2f)->f32 {
 let d=max(0.0,distance(p,eye)-8000.0); return d*d*0.0000001;
}`);
export const stitchHeight = shader<'float'>(
  `fn exoStitch(p:vec2f,local:vec2f,size:f32,edges:vec4f,eye:vec2f,base:f32,spacing:f32)->f32 {
 var h=base;let distances=vec4f(local.y,size-local.y,local.x,size-local.x);
 for(var edge=0;edge<4;edge++){
  let step=edges[edge];let d=distances[edge];
  if(step>0.0 && d<spacing*2.0){
   let axis=select(p.y,p.x,edge<2);let origin=floor(axis/step)*step;let f=(axis-origin)/step;
   let a=select(vec2f(p.x,origin),vec2f(origin,p.y),edge<2);
   let b=select(vec2f(p.x,origin+step),vec2f(origin+step,p.y),edge<2);
   let aligned=mix(exoHeight(a)-exoHorizonDrop(a,eye),exoHeight(b)-exoHorizonDrop(b,eye),f);
   h=mix(aligned,h,smoothstep(0.0,spacing*2.0,d));
  }
 }
 return h;
}`,
  [terrainHeight, horizonDrop],
);
export const skyColor = shader<'vec3'>(`fn exoSky(rd:vec3f,sun:vec3f,storm:f32)->vec3f {
 let mu=clamp(dot(rd,sun),-1.0,1.0);let horizon=exp(-max(rd.y,0.0)*4.5);
 let zenith=mix(vec3f(0.075,0.11,0.32),vec3f(0.018,0.085,0.105),storm);
 let sunset=pow(max(0.0,mu),7.0);
 let haze=mix(mix(vec3f(0.26,0.15,0.34),vec3f(0.64,0.27,0.17),sunset),vec3f(0.16,0.27,0.245),storm);
 var col=mix(zenith,haze,horizon);
 let glow=0.009/pow(max(0.045,1.0+0.78*0.78-1.56*mu),1.5);
 col+=mix(vec3f(1.0,0.53,0.18),vec3f(0.65,0.77,0.58),storm)*glow;
 col+=vec3f(13.0,8.0,3.7)*smoothstep(0.99976,0.99994,mu)*(1.0-storm*0.8);
 let moon=normalize(vec3f(0.46,0.63,-0.87));let md=length(rd-moon);
 let disk=1.0-smoothstep(0.061,0.062,md);
 let light=smoothstep(-0.01,0.055,dot(rd-moon,normalize(vec3f(-0.7,0.2,0.0))));
 col=mix(col,mix(col*0.82,vec3f(0.28,0.18,0.3),light),disk*0.7*(1.0-storm));
 return col*mix(0.22,1.0,smoothstep(-0.3,0.03,rd.y));
}`);
export const aerial = shader<'vec3'>(
  `fn exoAerial(col:vec3f,p:vec3f,eye:vec3f,sun:vec3f,storm:f32)->vec3f {
 let d=distance(p,eye);let rd=normalize(p-eye);
 let edge=smoothstep(28000.0,31800.0,max(abs(eye.x),abs(eye.z)));
 let density=0.000023*exp(-max(0.0,(p.y+eye.y)*0.5)/4200.0)*(1.0+storm*1.8+edge*18.0);
 return mix(exoSky(rd,sun,storm)*0.75,col,exp(-d*density));
}`,
  [skyColor],
);
export const terrainBasis = shader<'vec3'>(`fn exoTerrainBasis(p:vec3f)->vec3f {
 var n=normalize(cross(dpdy(p),dpdx(p)));if(n.y<0.0){n=-n;}return n;
}`);
export const terrainWeights = shader<'vec4'>(
  `fn exoTerrainWeights(p:vec3f,n:vec3f)->vec4f {
 let snow=smoothstep(1850.0,2780.0,p.y+exoNoise(p.xz*0.002)*300.0)*smoothstep(0.5,0.87,n.y);
 let wet=(1.0-smoothstep(3.0,26.0,p.y))*smoothstep(0.4,0.85,n.y);
 let sand=smoothstep(0.64,0.94,n.y)*(1.0-smoothstep(850.0,1650.0,p.y));
 return vec4f(sand*(1.0-wet)*(1.0-snow),(1.0-sand)*(1.0-wet)*(1.0-snow),wet*(1.0-snow),snow);
}`,
  [noise2],
);
export const terrainSurface = shader<'vec4'>(
  `fn exoTerrainSurface(p:vec3f,n:vec3f,a:vec4f,b:vec4f,c:vec4f,d:vec4f,storm:f32)->vec4f {
 let w=exoTerrainWeights(p,n);let band=exoNoise(p.xz*0.00085);
 let sand=mix(vec3f(0.14,0.045,0.042),vec3f(0.32,0.14,0.085),band)*(0.97+a.b*0.06);
 let rock=mix(vec3f(0.052,0.045,0.068),vec3f(0.22,0.115,0.105),band)*(0.58+b.b*0.86);
 let wet=vec3f(0.09,0.063,0.069)*(0.55+c.b*0.7);let snow=vec3f(0.59,0.66,0.8)*(0.79+d.b*0.24);
 let rough=dot(vec4f(max(.63,a.a),max(.55,b.a),c.a,max(.72,d.a)),w)*(1.0-storm*0.13);
 return vec4f(sand*w.x+rock*w.y+wet*w.z+snow*w.w,clamp(rough,0.18,0.9));
}`,
  [terrainWeights, noise2],
);
export const surfaceNormal =
  shader<'vec3'>(`fn exoSurfaceNormal(n:vec3f,x:vec4f,y:vec4f,z:vec4f)->vec3f {
 let weight=pow(abs(n),vec3f(5.0));let w=weight/(weight.x+weight.y+weight.z);
 let dx=x.rg*2.0-1.0;let dy=y.rg*2.0-1.0;let dz=z.rg*2.0-1.0;
 let gradient=vec3f(0.0,dx.x,dx.y)*w.x+vec3f(dy.x,0.0,dy.y)*w.y+vec3f(dz.x,dz.y,0.0)*w.z;
 return normalize(n-(gradient-n*dot(gradient,n))*0.12);
}`);
export const cloudDensity = shader<'float'>(
  `fn exoCloudDensity(p:vec3f,t:f32,storm:f32,volume:texture_3d<f32>,sm:sampler)->f32 {
 let drift=vec3f(t*7.0,0.0,-t*3.0);let q=p+drift;
 let coverage=exoNoise(q.xz*0.00013+vec2f(19.0,43.0));
 let base=textureSampleLevel(volume,sm,q*0.000065,0.0).r;
 let billow=textureSampleLevel(volume,sm,q*0.00024+vec3f(0.17),0.0).r;
 let erosion=textureSampleLevel(volume,sm,q*0.00082,0.0).r;
 let bottom=1550.0+coverage*300.0;let top=2950.0+coverage*1450.0+storm*450.0;
 let layer=smoothstep(bottom,bottom+420.0,p.y)*(1.0-smoothstep(top-900.0,top,p.y));
 var lift=0.0; ${thermalShader}
 let towers=clamp(lift,0.0,1.0);let shape=base*0.68+billow*0.32;
 let threshold=0.57-coverage*0.095-storm*0.035;
 let body=max(0.0,(shape-threshold)*5.0)*layer;let column=max(0.0,(shape-0.47)*4.5)*towers;
 return max(0.0,max(body,column)-(1.0-erosion)*0.19)*0.004;
}`,
  [noise2],
);
export const cloudShadow = shader<'float'>(
  `fn exoCloudShadow(p:vec3f,sun:vec3f,t:f32,storm:f32,volume:texture_3d<f32>,sm:sampler)->f32 {
 var optical=0.0;
 for(var j=0;j<4;j++){let height=1700.0+f32(j)*620.0;let d=max(0.0,(height-p.y)/max(sun.y,0.1));
 if(height>p.y){optical+=exoCloudDensity(p+sun*d,t,storm,volume,sm)*700.0;}}
 return 0.28+0.72*exp(-optical*0.62);
}`,
  [cloudDensity],
);
const cloudMarchSource = (
  depth: boolean,
) => `fn ${depth ? 'exoCloudDepth' : 'exoClouds'}(ro:vec3f,rd:vec3f,sceneDistance:f32,sun:vec3f,t:f32,storm:f32,steps:i32,lightSteps:i32,jitter:f32,volume:texture_3d<f32>,sm:sampler)->vec4f {
 // Keep the integration lattice independent of opaque depth. Clipping the entire
 // lattice to a mountain made every cloud sample jump at its silhouette.
 var start=0.0;var finish=42000.0;
 if(abs(rd.y)>0.00001){let a=(0.0-ro.y)/rd.y;let b=(6800.0-ro.y)/rd.y;start=max(0.0,min(a,b));finish=min(finish,max(a,b));}
 else if(ro.y<0.0||ro.y>6800.0){finish=0.0;}
 let end=min(finish,sceneDistance);
 if(end<=start){return ${depth ? 'vec4f(0.0,sceneDistance/100000.0,0.0,1.0)' : 'vec4f(0.0)'};}
 let span=finish-start;var transmittance=1.0;var color=vec3f(0.0);var depth=0.0;var weight=0.0;
 let mu=dot(rd,sun);let phase=0.32+0.09/pow(max(0.08,1.0+0.69*0.69-1.38*mu),1.5);
 for(var i=0;i<96;i++){
  if(i>=steps||transmittance<0.012){break;}
  let fnxt=(f32(i)+1.0)/f32(steps);let fbase=f32(i)/f32(steps);
  let left=start+span*fbase*fbase;let right=min(end,start+span*fnxt*fnxt);
  if(left>=end){break;}
  let ds=right-left;let distance=left+ds*jitter;
  let p=ro+rd*distance;let density=exoCloudDensity(p,t,storm,volume,sm);
  if(density>0.000005){var optical=0.0;
   ${depth ? '' : `for(var j=0;j<7;j++){if(j>=lightSteps){break;}let step=100.0+f32(j)*100.0;optical+=exoCloudDensity(p+sun*(f32(j)+0.5)*step,t,storm,volume,sm)*step;}`}
   let silver=exp(-optical)*phase;
   let ambient=mix(vec3f(0.12,0.055,0.17),vec3f(0.027,0.105,0.107),storm);
   let direct=mix(vec3f(1.25,0.62,0.29),vec3f(0.48,0.68,0.57),storm)*(silver+exp(-optical*0.28)*0.12);
   let alpha=1.0-exp(-density*ds);let contribution=transmittance*alpha;
   color+=contribution*(ambient+direct);depth+=contribution*distance;weight+=contribution;transmittance*=1.0-alpha;
  }
 }
 ${depth ? 'return vec4f(depth/max(weight,0.0001)/100000.0,sceneDistance/100000.0,1.0-transmittance,1.0);' : 'return vec4f(color,1.0-transmittance);'}
}`;
export const clouds = shader<'vec4'>(cloudMarchSource(false), [cloudDensity]);
export const cloudDepth = shader<'vec4'>(cloudMarchSource(true), [cloudDensity]);
export const reflectedSky = shader<'vec3'>(
  `fn exoReflectedSky(rd:vec3f,p:vec3f,sun:vec3f,t:f32,storm:f32,volume:texture_3d<f32>,sm:sampler)->vec3f {
 // The sub-pixel solar disk is represented by the filtered water BRDF / direct PBR light.
 let mu=dot(rd,sun);let disk=vec3f(13.0,8.0,3.7)*smoothstep(.99976,.99994,mu)*(1.0-storm*.8)*mix(.22,1.0,smoothstep(-.3,.03,rd.y));
 let sky=max(vec3f(0.0),exoSky(rd,sun,storm)-disk);let distance=clamp((2400.0-p.y)/max(0.08,rd.y),0.0,22000.0);
 let den=exoCloudDensity(p+rd*distance,t,storm,volume,sm);
 let cover=(1.0-exp(-den*1400.0))*smoothstep(-0.04,0.12,rd.y);
 let cloud=mix(vec3f(0.43,0.20,0.31),vec3f(0.08,0.20,0.19),storm)+vec3f(0.56,0.32,0.13)*pow(max(0.0,dot(rd,sun)),8.0);
 return mix(sky,cloud,cover);
}`,
  [skyColor, cloudDensity],
);
export const waterColor = shader<'vec3'>(
  `fn exoWaterColor(p:vec3f,eye:vec3f,sun:vec3f,storm:f32,ground:f32,ship:vec3f,velocity:vec3f,contact:f32,t:f32,volume:texture_3d<f32>,sm:sampler)->vec3f {
 let footprint=length(fwidth(p.xz));var n=exoWaterNormal(p.xz,t,footprint);let f=exp(-footprint*0.12);
 let q=p.xz+vec2f(t*1.1,-t*.7);
 let warp=exoNoise(q*.045)*11.0;
 let a=sin(dot(q,vec2f(.77,.35))+warp)+sin(dot(q,vec2f(1.33,.54))-warp*.7)*.45;
 let b=sin(dot(q,vec2f(.47,-.58))+warp*.9)+sin(dot(q,vec2f(1.91,-.67))+warp)*.35;
 let fine=vec2f(a,b)*0.12*f;n=normalize(n+vec3f(fine.x,0.0,fine.y));
 let view=normalize(eye-p);let fresnel=0.025+0.975*pow(1.0-max(0.0,dot(view,n)),5.0);
 let reflected=exoReflectedSky(reflect(-view,n),p,sun,t,storm,volume,sm);
 let depth=max(0.0,exoWater(p.xz,t)-ground);let deep=mix(vec3f(0.005,0.038,0.038),vec3f(0.004,0.055,0.048),storm);
 let water=mix(deep,vec3f(0.026,0.21,0.17),exp(-depth*0.07));
 let halfVector=normalize(view+sun);let power=mix(480.0,24.0,clamp(footprint*.025,0.0,1.0));let glint=pow(max(0.0,dot(n,halfVector)),power)*7.0*power/480.0;
 let foamNoise=mix(exoNoise(p.xz*.21+vec2f(t*.08)),0.5,smoothstep(2.0,12.0,footprint));
 let shore=(1.0-smoothstep(0.0,3.7,depth))*smoothstep(0.33,0.70,foamNoise);
 let crest=smoothstep(0.12,0.26,length(n.xz))*0.045*storm;
 let heading=normalize(velocity.xz+vec2f(0.001));let rel=p.xz-ship.xz;
 let behind=-dot(rel,heading);let side=abs(rel.x*heading.y-rel.y*heading.x);
 let wake=exp(-pow((side-behind*.16)/max(0.7,behind*.065),2.0))*exp(-max(0.0,behind)*.018)*smoothstep(0.0,6.0,behind)*contact;
 let shadow=exoCloudShadow(p,sun,t,storm,volume,sm);
 let col=mix(water,reflected,fresnel)+vec3f(1.6,1.1,.62)*glint*shadow+vec3f(.35,.53,.49)*(shore+crest+wake*.35);
 return exoAerial(col,p,eye,sun,storm);
}`,
  [waterNormal, waterHeight, reflectedSky, cloudShadow, noise2, aerial],
);
