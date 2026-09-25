import { Matrix4, Vector2, Vector3 } from 'three/webgpu';
import { uniform, texture3D } from 'three/tsl';
import { createCloudNoise } from './volume';
export function createUniforms() {
  return {
    cloudNoise: texture3D(createCloudNoise()),
    time: uniform(0),
    previousTime: uniform(0),
    delta: uniform(0),
    storm: uniform(0),
    alpine: uniform(0),
    wetness: uniform(0.4),
    sun: uniform(new Vector3(-0.6, 0.24, -0.7).normalize()),
    origin: uniform(new Vector3()),
    eye: uniform(new Vector3()),
    ship: uniform(new Vector3()),
    shipVelocity: uniform(new Vector3()),
    contact: uniform(0),
    energy: uniform(1),
    gravity: uniform(0),
    splash: uniform(0),
    inverseProjection: uniform(new Matrix4()),
    cloudInverseProjection: uniform(new Matrix4()),
    cameraWorld: uniform(new Matrix4()),
    previousViewProjection: uniform(new Matrix4()),
    previousCloudViewProjection: uniform(new Matrix4()),
    projectionJitter: uniform(new Vector2()),
    previousProjectionJitter: uniform(new Vector2()),
    historyValid: uniform(0),
    frame: uniform(0),
    resolution: uniform(new Vector2(1, 1)),
    cloudResolution: uniform(new Vector2(1, 1)),
    cloudSteps: uniform(64, 'int'),
    shadowSteps: uniform(5, 'int'),
    blur: uniform(0.5),
    bloom: uniform(0.4),
    grain: uniform(0.22),
    lens: uniform(0.45),
    lensWet: uniform(0),
    quality: uniform(1, 'int'),
    exposure: uniform(1),
  };
}
export type RenderUniforms = ReturnType<typeof createUniforms>;
