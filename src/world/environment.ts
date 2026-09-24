import type { EnvironmentState, Vec3 } from '../types';
import { smooth } from '../simulation/math';

/** Spatial art direction: travelling backwards retraces the same environmental transition. */
export function environmentAt(p: Vec3): EnvironmentState {
  const storm = smooth(1000, 14000, p.x) * smooth(12000, 21500, -p.z);
  const alpine = smooth(1450, 2800, p.y);
  return { storm, alpine, exposure: 0.86 + storm * 0.1, wetness: 0.38 + storm * 0.5 };
}
