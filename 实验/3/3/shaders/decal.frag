#version 300 es
precision mediump float;

out vec4 FragColor;

in vec2 TexCoord;

uniform sampler2D u_texture;
uniform float u_opacity;

void main() {
    vec4 color = texture(u_texture, TexCoord);
    if (color.a < 0.01) discard;
    FragColor = vec4(color.rgb, color.a * u_opacity);
}
