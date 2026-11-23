#version 300 es

// Depth-only pass: light space position comes from the CPU.

in vec4 vPosition;

uniform mat4 u_LightSpaceMatrix;
uniform mat4 u_ModelMatrix;

void main()
{
    gl_Position = u_LightSpaceMatrix * u_ModelMatrix * vPosition;
}
