#version 300 es

// ============================================================================
// 顶点着色器 hw1.vert
// ----------------------------------------------------------------------------
// 职责：
//   1. 接收形状的"局部坐标"顶点 aPosition（质心在原点）；
//   2. 用 uniform 角度 angle 对顶点做二维旋转（绕质心自转）；
//   3. 用 uniform (centerX, centerY) 把形状平移到画布中的当前位置；
//   4. 输出裁剪空间坐标 gl_Position。
// ============================================================================

// 输入属性：每个顶点的二维局部坐标（NDC 尺度，质心为原点）
in vec2 aPosition;

// uniform：形状中心的 NDC 坐标（由 JS 每帧传入）
uniform float centerX;
uniform float centerY;

// uniform：旋转角（弧度）。由 JS 的动画循环根据旋转速度累加传入。
//          形状顶点是"质心在原点"的局部坐标，因此先旋转后平移，
//          即可实现"绕自身质心自转"的效果。
uniform float angle;

// uniform：画布纵横比 width/height。
//          NDC 的 x、y 范围都是 [-1,1]，但对应的是"宽 × 高"的矩形画布，
//          若直接在 NDC 中旋转，宽屏上形状会被横向拉伸。
//          约定：JS 端的局部坐标存放在"屏幕等比空间"（x 分量 = NDC 偏移 × aspect），
//          本着色器先在该等比空间中旋转（形状观感与屏幕一致），
//          再把 x 除以 aspect 换回 NDC 空间，最后加中心平移。
uniform float aspect;

void main()
{
    // 预先计算旋转矩阵的两个元素，避免在顶点处理中重复调用三角函数
    // 二维旋转矩阵 R(θ) = [ cosθ  -sinθ ]
    //                     [ sinθ   cosθ ]
    float c = cos(angle);
    float s = sin(angle);

    // 第一步：R(θ) * aPosition —— 在"屏幕等比空间"中做二维旋转：
    //   x' = x*cosθ - y*sinθ
    //   y' = x*sinθ + y*cosθ
    // 因为顶点是"质心在原点"的局部坐标，所以这就是绕质心自转。
    vec2 p = vec2(aPosition.x * c - aPosition.y * s,
                  aPosition.x * s + aPosition.y * c);

    // 第二步：把等比空间的 x 分量除以 aspect 换回 NDC 空间，
    //         再加上形状中心的 NDC 坐标完成平移。
    gl_Position = vec4(p.x / aspect + centerX, p.y + centerY, 0.0, 1.0);
}
