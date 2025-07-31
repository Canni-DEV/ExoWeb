// Sky fragment shader
precision highp float;

varying vec3 vWorldPosition;

uniform vec3 topColor;
uniform vec3 bottomColor;

void main() {
    float h = normalize(vWorldPosition + vec3(0.0, 0.0, 0.0)).y;
    float t = max(pow(max(h, 0.0), 0.5), 0.0);
    vec3 color = mix(bottomColor, topColor, t);
    gl_FragColor = vec4(color, 1.0);
}
