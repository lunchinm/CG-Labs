#version 300 es

// Per-object matrices plus the shared light-space matrix.
uniform mat4 u_ModelMatrix;
uniform mat4 u_ViewMatrix;
uniform mat4 u_ProjectionMatrix;
uniform mat4 u_LightSpaceMatrix;

in vec4 vPosition;
in vec4 vNormal;
in vec2 vTexCoord;

out vec2 TexCoord;
out vec3 FragPos;
out vec3 LocalPos;
out vec3 Normal;
out vec4 FragPosLightSpace;

void main() {
    gl_Position = u_ProjectionMatrix * u_ViewMatrix * u_ModelMatrix * vPosition;

    FragPos = (u_ModelMatrix * vPosition).xyz;
    LocalPos = vPosition.xyz;
    Normal = transpose(inverse(mat3(u_ModelMatrix))) * vNormal.xyz;

    TexCoord = vTexCoord;

    FragPosLightSpace = u_LightSpaceMatrix * vec4(FragPos, 1.0);
}
