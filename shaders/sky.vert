precision highp float;

// Built-in attributes and matrices like `position`, `modelMatrix`,
// `modelViewMatrix`, and `projectionMatrix` are injected automatically by
// Three.js when using ShaderMaterial.

varying vec3 vWorldPosition;

void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}