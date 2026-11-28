#version 300 es
precision highp float;

out vec4 FragColor;

in vec3 v_Dir;

uniform samplerCube u_skybox;
uniform float u_exposure;
// 1 表示正在生成环境立方体贴图：输出线性色，与地形捕捉通道的口径一致。
uniform float u_envMode;

vec3 aces(vec3 x) {
    return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
    // 六个 JPEG 的像素行序与立方体贴图的约定相反（照原样采样会整片上下颠倒：
    // 水面跑到天上、山尖朝下），且 Chrome 对立方体贴图忽略 UNPACK_FLIP_Y_WEBGL，
    // 所以在这里把采样方向的 y 取反，等价于把环境翻转回来。
    vec3 dir = normalize(v_Dir);
    vec3 srgb = texture(u_skybox, vec3(dir.x, -dir.y, dir.z)).rgb;

    // 贴图是 sRGB 编码的照片。捕捉通道要写线性色，否则主程序再做一次曝光
    // 与 ACES 时，镜面里的天空会比背景亮一档；屏幕通道则和场景走同一条
    // 曝光 + ACES，天空盒才不会像一张贴纸浮在调色过的画面上。
    vec3 linearColor = pow(srgb, vec3(2.2));
    if (u_envMode > 0.5) {
        FragColor = vec4(linearColor, 1.0);
        return;
    }
    FragColor = vec4(clamp(aces(linearColor * u_exposure), 0.0, 1.0), 1.0);
}
