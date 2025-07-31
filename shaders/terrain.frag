// Fragment shader for terrain
precision highp float;

varying vec2 vUv;
varying vec3 vPosition;

uniform vec3 uColor;

void main() {
    float light = dot(normalize(vec3(0.0, 1.0, 0.0)), normalize(vec3(0.3, 1.0, 0.5)));
    light = clamp(light, 0.2, 1.0);
    vec3 color = uColor * light;
    gl_FragColor = vec4(color, 1.0);
}
