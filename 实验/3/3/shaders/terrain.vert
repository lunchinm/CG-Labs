#version 300 es

// 全屏四边形：把 NDC 坐标直接传给背景着色器，用来重建相机射线。
in vec4 vPosition;
out vec2 vNdc;

void main() {
    vNdc = vPosition.xy;
    gl_Position = vec4(vPosition.xy, 0.0, 1.0);
}
