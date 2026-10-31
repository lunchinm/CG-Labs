#version 300 es

precision highp float;
in vec4 fColor;
out vec4 FragColor;

/* 背面（内壁）着色强度 u_BackMix：
 *   相机飞进物体内部（或半进入）时，画面上看到的全是物体的背面，
 *   而顶点的颜色是按"外法线 + 漫反射"烘出来的，背光内壁往往是一块很暗的纯色，
 *   读不出结构、容易被误认为"画面坏了"。这里把背面颜色朝中性灰蓝混合，
 *   内壁就变成一层明显区别于外表面的浅色，一眼能认出"我在物体内部"。
 *   u_BackMix = 0 —— 完全按顶点色绘制（外部视角、坐标轴、gizmo 均为此值）。 */
uniform float u_BackMix;

void
main()
{
    vec3 c = fColor.rgb;
    if (!gl_FrontFacing) {
        c = mix(c, vec3(0.60, 0.64, 0.72), u_BackMix);
    }
    FragColor = vec4(c, fColor.a);
}
