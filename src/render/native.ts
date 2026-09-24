import { wgslFn } from 'three/tsl';
import type { Node } from 'three/webgpu';
import type { CodeNodeInclude } from 'three/src/nodes/code/CodeNode.js';

// @types/three does not expose nativeFn's callable node proxy or WGSL return type.
// Keep that interoperability assertion at this boundary; call sites remain typed.
type Shader<T> = ((...parameters: (Node | number)[]) => Node<T>) & CodeNodeInclude;
export function shader<T extends 'float' | 'vec3' | 'vec4'>(
  source: string,
  includes: CodeNodeInclude[] = [],
): Shader<T> {
  return wgslFn(source, includes) as unknown as Shader<T>;
}
