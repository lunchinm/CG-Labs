#version 300 es

in vec4 vPosition;

out vec3 v_Dir;

uniform mat4 u_ModelMatrix;
uniform mat4 u_ViewMatrix;
uniform mat4 u_ProjectionMatrix;

// 天空盒就是一只大立方体的内壁：方向取物体空间坐标，位置直接把 z 写成 w，
// 钉在远平面上。这样它既不受相机位置影响，也不会插进场景几何里。
void main() {
    v_Dir = vPosition.xyz;
    vec4 clip = u_ProjectionMatrix * u_ViewMatrix * u_ModelMatrix * vPosition;
    gl_Position = clip.xyww;
}
