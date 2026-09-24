import { Matrix4, Vector2, Vector3 } from 'three/webgpu';
import { uniform } from 'three/tsl';
export function createUniforms() {
  return {
    time: uniform(0),
    storm: uniform(0),
    sun: uniform(new Vector3(-0.6, 0.24, -0.7).normalize()),
    origin: uniform(new Vector3()),
    eye: uniform(new Vector3()),
    ship: uniform(new Vector3()),
    inverseProjection: uniform(new Matrix4()),
    cameraWorld: uniform(new Matrix4()),
    previousViewProjection: uniform(new Matrix4()),
    historyValid: uniform(0),
    frame: uniform(0),
    resolution: uniform(new Vector2(1, 1)),
    cloudResolution: uniform(new Vector2(1, 1)),
    cloudSteps: uniform(64, 'int'),
    shadowSteps: uniform(5, 'int'),
    blur: uniform(0.5),
    exposure: uniform(1),
  };
}
export type RenderUniforms = ReturnType<typeof createUniforms>;
