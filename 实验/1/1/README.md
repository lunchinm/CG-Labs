# 实验一：2D 图形的交互绘制

## 作业要求

以鼠标点击画布的任意位置为中心，重新绘制矩形，并填充随机颜色。

## 实现功能

### 基本要求（3 个 TODO）

1. **TODO1** — 创建 VBO 顶点缓冲区，将顶点数据传给 GPU 并关联 `aPosition` 属性
2. **TODO2** — 鼠标点击的画布像素坐标 → NDC 归一化设备坐标转换（含 y 轴翻转）
3. **TODO3** — 点击后更新 `centerX`/`centerY`/`randomColor` 等 uniform 值

### 附加功能

- **形状切换**：4 种预设形状（矩形 / 三角形 / 圆形 / 五角星），均以质心为原点用三角形扇（Triangle Fan）填充
- **多笔画手绘**：支持多条折线组成一个形状，`mouseup` 仅结束当前笔画，"完成绘制"按钮显式结束；手绘形状以线框（LINE_STRIP）渲染
- **缓动平移**：点击画布后形状"先加速后减速"地平滑移动到点击位置（easeInOutCubic 缓动函数），非瞬移
- **旋转控制**：双向滑动条直接控制旋转——中点停止、左滑逆时针、右滑顺时针、距离越大转速越快
- **旋转中心调整**：手绘模式下可手动设置旋转中心位置（"调整旋转中心"按钮），黄色圆点标记实时显示
- **随机变色**：每次点击移动时形状颜色随机变化
- **比例保持**：所有形状顶点存放在"屏幕等比空间"（x 分量乘以纵横比 aspect），宽屏上不会变形

## 文件结构

```
1/
├── hw1.html        # 主页面（工具栏布局、滑动条样式、旋转中心标记）
├── hw1.js          # 主程序（WebGL 逻辑、形状系统、动画、交互）
├── shaders/
│   ├── hw1.vert    # 顶点着色器（旋转 + 纵横比校正 + 平移）
│   └── hw1.frag    # 片元着色器（输出 uniform 颜色）
└── Common/         # WebGL 支持库
    ├── webgl-utils.js
    ├── initShaders2.js
    └── MVnew.js
```

## 技术要点

### 坐标系约定

- **NDC 空间**：x、y ∈ [-1,1]，y 轴向上，GPU 最终使用的裁剪空间
- **屏幕等比空间**：NDC 的 x 偏移乘以纵横比 aspect 后的空间，在该空间中横竖单位与屏幕像素一一对应，形状不会因宽屏被拉伸
- 所有形状顶点以"质心为原点"存放在屏幕等比空间中，绘制时由顶点着色器负责：等比空间旋转 → 换回 NDC → 加中心平移

### 顶点着色器核心逻辑

```glsl
// 在等比空间中旋转（绕质心自转）
vec2 p = vec2(aPosition.x * c - aPosition.y * s,
              aPosition.x * s + aPosition.y * c);
// 换回 NDC 并平移到形状中心
gl_Position = vec4(p.x / aspect + centerX, p.y + centerY, 0.0, 1.0);
```

### 渲染循环

采用 `requestAnimationFrame` 连续渲染（非事件驱动），每帧统一传递 uniform、推进平移动画与旋转角度。

## 在线体验

**https://lunchinm.github.io/CG-Labs/实验/1/1/hw1.html**

## 本地运行

```bash
# 在实验/1/1/ 目录下启动 HTTP 服务器
python -m http.server 8000
# 浏览器访问 http://localhost:8000/hw1.html
```
