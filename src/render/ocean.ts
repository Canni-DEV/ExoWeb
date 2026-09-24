import { Mesh, NodeMaterial, PlaneGeometry, type Scene, type Node } from 'three/webgpu';
import {
  Fn,
  modelWorldMatrix,
  positionLocal,
  positionPrevious,
  positionWorld,
  vec3,
  vec4,
  sampler,
  cameraProjectionMatrix,
  cameraViewMatrix,
} from 'three/tsl';
import { terrainHeight, waterHeight, waterNormal } from '../world/field';
import { waterColor, horizonDrop } from './shaders';
import type { RenderUniforms } from './uniforms';
import { shader } from './native';
import type TextureNode from 'three/src/nodes/accessors/TextureNode.js';

const waterScreen = shader<'vec3'>(
  `fn exoWaterScreen(base:vec3f,p:vec3f,eye:vec3f,origin:vec3f,t:f32,ground:f32,quality:i32,vp:mat4x4f,ip:mat4x4f,col:texture_2d<f32>,dep:texture_depth_2d,sm:sampler)->vec3f {
 let n=exoWaterNormal(p.xz,t,0.0);let clip=vp*vec4f(p-origin,1.0);let uv=clip.xy/clip.w*vec2f(.5,-.5)+.5;
 let view=normalize(eye-p);let fresnel=.025+.975*pow(1.0-max(0.0,dot(n,view)),5.0);
 let refractedUV=clamp(uv+n.xz*.004,vec2f(.001),vec2f(.999));
 let backgroundDepth=textureLoad(dep,vec2i(refractedUV*vec2f(textureDimensions(dep))),0);
 let safe=select(0.0,1.0,backgroundDepth>clip.z/clip.w);
 let refraction=textureSampleLevel(col,sm,refractedUV,0.0).rgb*vec3f(.42,.76,.68);
 var result=mix(base,refraction,exp(-max(0.0,exoWater(p.xz,t)-ground)*.085)*(1.0-fresnel)*.45*safe);
 if(quality<2){return result;}
 let direction=reflect(-view,n);var lastDelta=-1000.0;
 for(var i=0;i<28;i++){
  let f=(f32(i)+1.0)/28.0;let distance=2.0+f*f*1300.0;
  let ray=vp*vec4f(p+direction*distance+n*.6-origin,1.0);
  if(ray.w<=0.0){break;}
  let coord=ray.xy/ray.w*vec2f(.5,-.5)+.5;
  if(any(coord<vec2f(.002))||any(coord>vec2f(.998))){break;}
  let depth=textureLoad(dep,vec2i(coord*vec2f(textureDimensions(dep))),0);
  let sampleView=ip*vec4f(coord*vec2f(2.0,-2.0)+vec2f(-1.0,1.0),depth,1.0);
  let delta=ray.w+sampleView.z/sampleView.w;
  if(depth<.999999 && delta>=0.0 && delta<max(4.0,distance*.08) && lastDelta<0.0){
   let border=min(min(coord.x,coord.y),min(1.0-coord.x,1.0-coord.y));
   let confidence=smoothstep(0.0,.08,border)*(1.0-f*.5);
   result=mix(result,textureSampleLevel(col,sm,coord,0.0).rgb,fresnel*confidence);break;
  }
  lastDelta=delta;
 }
 return result;
}`,
  [waterNormal, waterHeight],
);
export class OceanRenderer {
  private patches = new Map<string, { mesh: Mesh; x: number; z: number }>();
  private geometry = new Map<number, PlaneGeometry>();
  private material = new NodeMaterial();
  private center = '';
  private color: Node<'vec3'>;
  constructor(
    private scene: Scene,
    private u: RenderUniforms,
  ) {
    const global = positionWorld.add(u.origin),
      offset = modelWorldMatrix.mul(vec4(0, 0, 0, 1)).xz.add(u.origin.xz),
      coord = positionLocal.xz.add(offset);
    const displaced = vec3(
      positionLocal.x,
      waterHeight(coord, u.time).sub(horizonDrop(coord, u.eye.xz)),
      positionLocal.z,
    );
    this.material.positionNode = Fn(() => {
      positionPrevious.assign(
        vec3(
          positionLocal.x,
          waterHeight(coord, u.previousTime).sub(horizonDrop(coord, u.eye.xz)),
          positionLocal.z,
        ),
      );
      return displaced;
    })();
    this.color = waterColor(
      global,
      u.eye,
      u.sun,
      u.storm,
      terrainHeight(global.xz),
      u.ship,
      u.shipVelocity,
      u.contact,
      u.time,
      u.cloudNoise,
      sampler(u.cloudNoise),
    );
    this.material.outputNode = vec4(this.color, 1);
  }
  bindScene(color: TextureNode<'vec4'>, depth: TextureNode<'vec4'>) {
    const u = this.u,
      p = positionWorld.add(u.origin);
    this.material.outputNode = vec4(
      waterScreen(
        this.color,
        p,
        u.eye,
        u.origin,
        u.time,
        terrainHeight(p.xz),
        u.quality,
        cameraProjectionMatrix.mul(cameraViewMatrix),
        u.inverseProjection,
        color,
        depth,
        sampler(color),
      ),
      1,
    );
  }
  update(x: number, z: number) {
    const center = `${Math.floor(x / 256)},${Math.floor(z / 256)}`;
    if (center === this.center) return;
    this.center = center;
    const wanted = new Map<string, { x: number; z: number; size: number }>();
    const visit = (px: number, pz: number, size: number) => {
      const d = Math.hypot(
        Math.max(Math.abs(x - px - size / 2) - size / 2, 0),
        Math.max(Math.abs(z - pz - size / 2) - size / 2, 0),
      );
      if (d > 120000) return;
      if (size > 512 && d < size * 1.2) {
        const h = size / 2;
        for (let iz = 0; iz < 2; iz++)
          for (let ix = 0; ix < 2; ix++) visit(px + ix * h, pz + iz * h, h);
        return;
      }
      wanted.set(`${px},${pz},${size}`, { x: px, z: pz, size });
    };
    visit(-262144, -262144, 524288);
    for (const [key, p] of this.patches)
      if (!wanted.has(key)) {
        this.scene.remove(p.mesh);
        this.patches.delete(key);
      }
    for (const [key, p] of wanted)
      if (!this.patches.has(key)) {
        let geometry = this.geometry.get(p.size);
        if (!geometry) {
          const divisions = p.size === 512 ? 128 : 32;
          geometry = new PlaneGeometry(p.size, p.size, divisions, divisions);
          geometry.rotateX(-Math.PI / 2);
          geometry.translate(p.size / 2, 0, p.size / 2);
          this.geometry.set(p.size, geometry);
        }
        const mesh = new Mesh(geometry, this.material);
        mesh.frustumCulled = false;
        mesh.layers.set(1);
        this.scene.add(mesh);
        this.patches.set(key, { mesh, x: p.x, z: p.z });
      }
    this.rebase();
  }
  rebase() {
    for (const p of this.patches.values())
      p.mesh.position.set(p.x - this.u.origin.value.x, 0, p.z - this.u.origin.value.z);
  }
  get vertices() {
    let count = 0;
    for (const p of this.patches.values()) count += p.mesh.geometry.getAttribute('position').count;
    return count;
  }
  dispose() {
    for (const p of this.patches.values()) this.scene.remove(p.mesh);
    for (const g of this.geometry.values()) g.dispose();
    this.material.dispose();
    this.patches.clear();
  }
}
