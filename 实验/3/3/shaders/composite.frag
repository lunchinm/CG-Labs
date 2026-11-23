#version 300 es
precision mediump float;

out vec4 FragColor;

in vec2 vNdc;

uniform sampler2D u_background;

void main() {
    vec2 uv = vNdc * 0.5 + 0.5;
    FragColor = vec4(texture(u_background, uv).rgb, 1.0);
}
