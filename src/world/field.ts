import { shader } from '../render/native';
import { WORLD } from '../config';
import { normalize, smooth } from '../simulation/math';
import type { Surface, Vec3 } from '../types';

// Integer hashing avoids vendor-dependent sine hashes at sector boundaries.
export const noise2 = shader<'float'>(`fn exoNoise(p: vec2f) -> f32 {
  let i = vec2i(floor(p)); let f = fract(p); let u = f*f*(3.0-2.0*f);
  let a = exoHash(i); let b = exoHash(i+vec2i(1,0));
  let c = exoHash(i+vec2i(0,1)); let d = exoHash(i+vec2i(1,1));
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);
}
fn exoHash(p: vec2i) -> f32 {
  var h = bitcast<u32>(p.x)*374761393u + bitcast<u32>(p.y)*668265263u + ${WORLD.seed}u;
  h = (h ^ (h >> 13u))*1274126177u; h = h ^ (h >> 16u);
  return f32(h & 16777215u)/16777215.0;
}`);

export const terrainHeight = shader<'float'>(
  `fn exoHeight(p: vec2f) -> f32 {
  let coast = 2500.0 + 1800.0*sin(p.y*0.00018);
  let land = smoothstep(-1200.0,1200.0,coast-p.x);
  var hills = 0.0; var amplitude = 210.0; var frequency = 0.00065;
  for(var i=0;i<6;i++){ hills += amplitude*exoNoise(p*frequency+vec2f(f32(i)*41.7)); amplitude *= 0.46; frequency *= 2.05; }
  let q = (p-vec2f(-6500.0,-15300.0))/vec2f(4700.0,6500.0);
  let ridge = exp(-dot(q,q))*3100.0*(0.72+0.28*exoNoise(p*0.0012));
  let rolling = 65.0*sin(p.y*0.0022+sin(p.x*0.001))*sin(p.x*0.0014);
  let island = max(0.0,1.0-length(p-vec2f(19000.0,-25000.0))/1900.0);
  return mix(-160.0,35.0+hills+rolling+ridge,land) + island*island*400.0;
}`,
  [noise2],
);

export const WAVES = [
  { x: 0.8, z: 0.6, amplitude: 1.4, k: 0.025, speed: 0.7 },
  { x: -0.6, z: 0.8, amplitude: 0.65, k: 0.069, speed: 1.05 },
  { x: 0.95, z: -0.31225, amplitude: 0.25, k: 0.16, speed: 1.6 },
] as const;

// Parametric Gerstner waves; inverse horizontal displacement is shared by CPU/GPU.
export function waterSurface(x: number, z: number, time: number): Surface {
  let qx = x,
    qz = z;
  for (let j = 0; j < 3; j++) {
    let dx = 0,
      dz = 0;
    for (const w of WAVES) {
      const phase = (qx * w.x + qz * w.z) * w.k - time * w.speed;
      const d = 0.45 * w.amplitude * Math.cos(phase);
      dx += w.x * d;
      dz += w.z * d;
    }
    qx = x - dx;
    qz = z - dz;
  }
  let h = 0,
    nx = 0,
    nz = 0;
  for (const w of WAVES) {
    const phase = (qx * w.x + qz * w.z) * w.k - time * w.speed;
    h += w.amplitude * Math.sin(phase);
    nx += w.amplitude * w.k * w.x * Math.cos(phase);
    nz += w.amplitude * w.k * w.z * Math.cos(phase);
  }
  return { height: h, normal: normalize({ x: -nx, y: 1, z: -nz }) };
}
export const waterHeight = shader<'float'>(`fn exoWater(p: vec2f, t: f32) -> f32 {
 var q=p;
 for(var j=0;j<3;j++) { var d=vec2f(0.0);
 ${WAVES.map((w) => `d += vec2f(${w.x},${w.z}) * ${0.45 * w.amplitude} * cos(dot(q,vec2f(${w.x},${w.z}))*${w.k}-t*${w.speed});`).join('\n')}
 q=p-d; }
 var h=0.0;
 ${WAVES.map((w) => `h += ${w.amplitude} * sin(dot(q,vec2f(${w.x},${w.z}))*${w.k}-t*${w.speed});`).join('\n')}
 return h;
}`);

// Filter sub-pixel wave normals instead of exposing the triangles of distant LODs.
export const waterNormal = shader<'vec3'>(`fn exoWaterNormal(p:vec2f,t:f32,footprint:f32)->vec3f {
 var q=p;
 for(var j=0;j<3;j++){var d=vec2f(0.0);
 ${WAVES.map((w) => `d += vec2f(${w.x},${w.z})*${0.45 * w.amplitude}*cos(dot(q,vec2f(${w.x},${w.z}))*${w.k}-t*${w.speed});`).join('\n')}
 q=p-d;}
 var gradient=vec2f(0.0);
 ${WAVES.map((w) => `gradient += vec2f(${w.x},${w.z})*${w.amplitude * w.k}*cos(dot(q,vec2f(${w.x},${w.z}))*${w.k}-t*${w.speed})*exp(-pow(footprint*${w.k},2.0));`).join('\n')}
 return normalize(vec3f(-gradient.x,1.0,-gradient.y));
}`);

export function windAt(p: Vec3): Vec3 {
  let lift = 0;
  for (const t of WORLD.thermals) {
    const radial = Math.hypot(p.x - t.x, p.z - t.z) / t.radius;
    lift +=
      (1 - smooth(0.2, 1, radial)) *
      smooth(t.base - 100, t.base + 250, p.y) *
      (1 - smooth(t.top - 500, t.top, p.y)) *
      t.strength;
  }
  const storm = smooth(2000, 13000, p.x);
  return { x: 2 + storm * 4, y: lift, z: -1 - storm * 3 };
}

export const thermalShader = WORLD.thermals
  .map(
    (t) => `{
 let r = length(p.xz-vec2f(${t.x}.0,${t.z}.0))/${t.radius}.0;
 lift += (1.0-smoothstep(0.2,1.0,r))*smoothstep(${t.base - 100}.0,${t.base + 250}.0,p.y)*(1.0-smoothstep(${t.top - 500}.0,${t.top}.0,p.y));
}`,
  )
  .join('\n');
