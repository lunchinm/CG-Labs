#version 300 es

uniform mat4 u_ModelMatrix;
uniform mat4 u_ViewMatrix;
uniform mat4 u_ProjectionMatrix;

in vec4 vPosition;
in vec2 vTexCoord;

out vec2 TexCoord;

void main() {
    gl_Position = u_ProjectionMatrix * u_ViewMatrix * u_ModelMatrix * vPosition;
    TexCoord = vTexCoord;
}
