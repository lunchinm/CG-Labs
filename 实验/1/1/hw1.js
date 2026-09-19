"use strict";

/* ============================================================================
 * 计算机图形学 实验一 —— 交互式图形程序（增强版）
 * ----------------------------------------------------------------------------
 * 功能总览：
 *   1. 完成原作业 3 个 TODO：
 *        TODO1 - 创建顶点缓冲区(VBO)并把顶点数据传给 GPU、关联 aPosition；
 *        TODO2 - 鼠标点击的"画布像素坐标"→"NDC 坐标"转换；
 *        TODO3 - 点击后把新的 uniform 值(centerX/centerY/randomColor)传给着色器；
 *              （本程序改为 requestAnimationFrame 循环渲染，uniform 每帧统一传递，
 *                功能上完全覆盖原 TODO3 的"按需更新"逻辑，见 render 内注释）
 *   2. 形状系统：预设形状（矩形/三角形/圆形/五角星）+ 用户多笔画手绘形状；
 *   3. 旋转控制：开关按钮 + 双向速度滑动条（左滑逆时针/右滑顺时针/中点停止，
 *      距离越大转速越快，实时生效）；旋转中心以黄色圆点标记并附文字提示；
 *   4. 缓动平移：点击画布后形状"先加速后减速"地平滑移动到点击处（非瞬移）；
 *   5. 点击移动时形状颜色随机变化。
 *
 * 坐标系约定（重要，贯穿全文件）：
 *   - NDC 空间：x、y 均在 [-1,1]，y 轴向上；是 GPU 最终使用的裁剪空间。
 *   - "屏幕等比空间"：把 NDC 的 x 偏移乘以纵横比 aspect = width/height 后
 *     得到的空间。在该空间中横竖坐标单位与屏幕像素一一对应，
 *     因此形状不会因宽屏被拉伸，旋转观感也与屏幕一致。
 *   - 所有形状顶点均以"质心为原点"存放在屏幕等比空间中（局部坐标）；
 *     绘制时由顶点着色器负责：等比空间旋转 → 换回 NDC → 加中心平移。
 * ==========================================================================*/

/* ---------------------------------------------------------------------------
 * 一、全局状态
 * -------------------------------------------------------------------------*/

var canvas;        // HTML5 画布元素
var gl;            // WebGL 2.0 上下文
var program;       // 着色器程序对象（顶点着色器 + 片元着色器）
var bufferId;      // 顶点缓冲区对象（VBO），保存形状顶点数据并传给 GPU

// —— uniform 变量的 location 缓存 ——
// uniform 的 location 在程序链接后不会改变，init 时查询一次并缓存，
// 之后每帧直接使用，避免 render 循环中反复调用 getUniformLocation 造成浪费。
var locCenterX, locCenterY, locAngle, locAspect, locColor;

// —— 当前形状 ——
// 形状分两类，用 type 区分：
//   type = 'fill'  : 填充形状（预设形状），tris 为展开好的三角形顶点数组，
//                    以 gl.TRIANGLES 一次画完；
//   type = 'lines' : 线框形状（手绘形状），strokes 为"笔画数组"（每笔画一个点列，
//                    支持多条折线组成的形状），segs 记录每笔画在 VBO 中的
//                    {offset, count}（以顶点个数计），渲染时逐笔画用
//                    gl.LINE_STRIP 画出。
// 两类形状的顶点都存放在"屏幕等比空间"且质心在原点。
var shape = null;

// —— 形状中心（NDC 坐标）——
var centerX = 0.0;   // 形状中心的 NDC x
var centerY = 0.0;   // 形状中心的 NDC y

// —— 平移动画状态（先加速后减速）——
var animating   = false;  // 是否正在播放平移动画
var animStart   = 0;      // 动画起始时间戳（毫秒，由 requestAnimationFrame 提供）
var animFromX   = 0;      // 动画起点（NDC x）
var animFromY   = 0;      // 动画起点（NDC y）
var animToX     = 0;      // 动画终点（NDC x，即点击处）
var animToY     = 0;      // 动画终点（NDC y）
var ANIM_DURATION = 800;  // 动画总时长（毫秒），常量便于调整

// —— 旋转状态 ——
var angle    = 0.0;                      // 当前旋转角（弧度，持续累加）
var rotSpeed = 0;                        // 旋转角速度（弧度/秒），由滑动条直接控制：
                                        //   正值=顺时针，负值=逆时针，0=停止
                                        //   （NDC y 轴向上，正角度=逆时针，
                                        //    故滑动条正值需取负号才对应顺时针）

// —— 旋转中心标记（HTML 元素，由 JS 每帧定位到形状中心）——
var pivotMarker, pivotHint;

// —— 手动调整旋转中心状态 ——
// adjustingPivot=true 时，画布点击用于设置旋转中心位置（而非画笔画）；
// 完成绘制时若仍为 true，则使用用户手动设置的中心而非默认质心。
var adjustingPivot = false;
var customPivotX   = 0.0;   // 用户手动设置的旋转中心（NDC x）
var customPivotY   = 0.0;   // 用户手动设置的旋转中心（NDC y）

// —— 颜色 ——
// 初始为固定红色；此后每次"点击移动"都会随机生成新的颜色。
var colorRandom;   // init 中初始化为 vec4(1,0,0,1)

// —— 手绘状态 ——
var drawMode  = false;   // 是否处于"手绘模式"（由"手绘形状/完成绘制"按钮切换）
var drawing   = false;   // 是否正在画某一笔画（mousedown 到 mouseup 之间）
var strokes   = [];      // 已完成的笔画数组，每项为 NDC 点列 [vec2,...]
var currentStroke = null;// 正在绘制中的笔画（mousedown 时新建，mouseup 时收编）

// —— 手绘预览 ——
// 手绘过程中需要把"正在画的全部笔画"实时显示出来。预览数据独立于 shape：
//   previewFlat : 所有预览顶点串接成的一维 vec2 数组（供 flatten 上传）；
//   previewSegs : 每条笔画的 {offset, count}（以顶点个数计）。
// 注意：预览顶点做了等比空间换算（x 乘 aspect），预览阶段固定 center=(0,0)、
//       angle=0 绘制，因此手绘过程中形状位置就是绘制位置，且不会跟随着旋转。
var previewFlat = [];
var previewSegs = [];

// —— 画布纵横比 ——
var aspect = 1.0;   // width/height，init 和 resize 时更新，每帧传给着色器


/* ---------------------------------------------------------------------------
 * 二、工具函数
 * -------------------------------------------------------------------------*/

/**
 * 【原作业 TODO2 的核心】
 * 把鼠标事件的"画布像素坐标"转换为"NDC 坐标"。
 *
 * 推导：
 *   event.clientX/clientY 是相对浏览器窗口的坐标；
 *   rect = canvas.getBoundingClientRect() 给出画布在窗口中的位置和大小。
 *   因此画布内的像素坐标为：
 *       x = event.clientX - rect.left    （0 ~ canvas.width）
 *       y = event.clientY - rect.top     （0 ~ canvas.height，向下增长）
 *
 *   NDC 坐标要求 x∈[-1,1]（左→右），y∈[-1,1]（下→上）：
 *       ndcX = x / canvas.width  * 2 - 1
 *       ndcY = -(y / canvas.height * 2 - 1) = 1 - 2*y/canvas.height
 *   注意 y 方向要翻转：屏幕像素坐标 y 向下增长，而 NDC 的 y 向上增长。
 *
 * @param {MouseEvent} event 鼠标事件
 * @returns {vec2} 对应的 NDC 坐标
 */
function pixelToNDC(event)
{
    // 获取画布点击位置，返回画布像素整数坐标
    var rect = event.target.getBoundingClientRect();
    var x = event.clientX - rect.left;
    var y = event.clientY - rect.top;

    // 将画布屏幕坐标转换为 NDC 坐标（y 轴翻转）
    var ndcX = 2.0 * x / canvas.width - 1.0;
    var ndcY = 1.0 - 2.0 * y / canvas.height;
    return vec2(ndcX, ndcY);
}

/**
 * easeInOutCubic 缓动函数：实现"先加速后减速"的运动节奏。
 *
 *   t ∈ [0,1] 为归一化时间进度，返回值为归一化路程进度 s(t)：
 *     - t < 0.5  : s = 4t³        （开始平缓 → 越来越快，加速段）
 *     - t ≥ 0.5  : s = 1-((-2t+2)³)/2 （越来越慢 → 平缓停下，减速段）
 *
 * 该曲线两端斜率为 0、中点斜率最大，运动观感"柔和起步、柔和停住"。
 * 若使用匀速（s = t），移动会显得生硬，这正是题目要求避免的。
 *
 * @param {number} t 归一化时间进度 [0,1]
 * @returns {number} 归一化路程进度 [0,1]
 */
function easeInOutCubic(t)
{
    return t < 0.5 ? 4.0 * t * t * t
                   : 1.0 - Math.pow(-2.0 * t + 2.0, 3.0) / 2.0;
}

/**
 * 把"围绕 (0,0) 的轮廓环"以质心为扇心做 triangle fan 展开，
 * 生成填充形状（type='fill'）。
 *
 * 原理：对"关于质心呈星形域"的多边形（凸多边形、圆、五角星等都满足），
 *       连接质心与轮廓上每条相邻边即可无缝、不重叠地铺满整个区域：
 *           triangle(center, ring[i], ring[i+1])   i = 0..n-1（环形闭合）
 * 预设形状都以 (0,0) 为几何中心生成，质心恰为 (0,0)，直接作为扇心。
 *
 * @param {Array} ring 有序轮廓顶点数组（局部等比坐标，逆时针）
 * @returns {Object} 填充形状对象 {type:'fill', tris:[vec2,...]}
 */
function buildFill(ring)
{
    var tris = [];                    // 展开后的三角形顶点数组
    var n = ring.length;
    for (var i = 0; i < n; i++) {
        var a = ring[i];              // 环上当前点
        var b = ring[(i + 1) % n];    // 环上下一点（%n 实现环形闭合）
        tris.push(vec2(0.0, 0.0), a, b);  // (扇心, 当前点, 下一点)
    }
    return { type: 'fill', tris: tris };
}

/**
 * 预设形状：矩形。
 * 直接沿用原作业框架的四个顶点（逆时针），对 (0,0) 中心对称。
 */
function makeRectangle()
{
    var ring = [
        vec2(-0.2, -0.2),
        vec2(-0.2,  0.2),
        vec2( 0.2,  0.2),
        vec2( 0.2, -0.2)
    ];
    return buildFill(ring);
}

/**
 * 预设形状：等边三角形。
 * 以半径 R=0.25（屏幕高度的 12.5%）生成三个顶点，
 * 角度取 -90°、30°、150°（角度递增 = 逆时针）。
 */
function makeTriangle()
{
    var R = 0.25, ring = [];
    var angles = [-90, 30, 150];
    for (var i = 0; i < angles.length; i++) {
        // 角度转弧度后按圆参数方程求顶点：x=R*cosθ, y=R*sinθ
        var a = angles[i] * Math.PI / 180.0;
        ring.push(vec2(R * Math.cos(a), R * Math.sin(a)));
    }
    return buildFill(ring);
}

/**
 * 预设形状：圆（用 48 段折线逼近，macro 上仍是三角形扇填充）。
 * 圆是关于圆心的星形域，fan 展开即为标准的"扇形三角化"。
 */
function makeCircle()
{
    var R = 0.25, N = 48, ring = [];
    for (var i = 0; i < N; i++) {
        var a = i / N * 2.0 * Math.PI;    // 0 → 2π 均匀采样（逆时针）
        ring.push(vec2(R * Math.cos(a), R * Math.sin(a)));
    }
    return buildFill(ring);
}

/**
 * 预设形状：五角星。
 * 交替取"外半径顶点"和"内半径顶点"共 10 个，构成凹十边形。
 * 五角星关于其中心是星形域，因此 fan 展开仍能得到正确填充
 * （每个三角形恰覆盖一个"尖角 + 半个凹槽"区域，互不越界）。
 */
function makeStar()
{
    var R = 0.30;         // 外顶点半径（尖角）
    var r = R * 0.4;      // 内顶点半径（凹槽），取外径的 0.4 为经典比例
    var ring = [];
    for (var i = 0; i < 10; i++) {
        // 每隔 36° 交替落在内、外圆上；起始角 -90° 让一个尖角朝上
        var a = (-90 + i * 36) * Math.PI / 180.0;
        var rad = (i % 2 === 0) ? R : r;
        ring.push(vec2(rad * Math.cos(a), rad * Math.sin(a)));
    }
    return buildFill(ring);
}

/**
 * 把"手绘的全部笔画"合成为一个可控制的线框形状（type='lines'）。
 *
 * 步骤：
 *   1. 过滤掉无效笔画（少于 2 个点的笔画画不成线）；
 *   2. 求所有点的质心（算术平均）——作为形状中心与旋转轴心；
 *   3. 每个点减去质心得到局部坐标；x 分量乘以 aspect，
 *      从"NDC 空间"换算到"屏幕等比空间"（保证手绘的形状比例与屏幕一致，
 *      宽屏上画的圆旋转后仍是圆，不会被拉成椭圆）；
 *   4. 记录每笔画在顶点数组中的 (offset, count)，供逐笔画 LINE_STRIP 绘制；
 *   5. 形状中心即质心所在位置——手绘完成后形状"原地出现"。
 *
 * 局限说明：线框形状不做填充三角化（多笔画轮廓的填充需要 ear clipping
 * 等复杂算法且歧义大），因此手绘形状以折线轮廓呈现，但同样可平移/旋转。
 *
 * @returns {Object|null} 线框形状对象；若没有任何有效笔画则返回 null
 */
function finalizeSketch()
{
    // 1. 过滤有效笔画（≥2 点才能构成线段）
    var valid = strokes.filter(function (s) { return s.length >= 2; });
    if (valid.length === 0) return null;

    // 2. 确定旋转中心：
    //    若用户手动调整过（adjustingPivot=true），使用用户设置的位置；
    //    否则使用所有笔画的质心（默认方式）。
    var cx, cy;
    if (adjustingPivot) {
        cx = customPivotX;
        cy = customPivotY;
    } else {
        var sumX = 0, sumY = 0, total = 0;
        valid.forEach(function (s) {
            s.forEach(function (p) { sumX += p[0]; sumY += p[1]; total++; });
        });
        cx = sumX / total;
        cy = sumY / total;
    }

    // 3 & 4. 逐笔画局部化（NDC → 等比空间），并记录每笔画的绘制区间
    var localStrokes = [], segs = [], offset = 0;
    valid.forEach(function (s) {
        s.forEach(function (p) {
            // x 方向乘 aspect：NDC 偏移 → 等比空间坐标（y 不变）
            localStrokes.push(vec2((p[0] - cx) * aspect, p[1] - cy));
        });
        segs.push({ offset: offset, count: s.length });  // 以顶点个数计
        offset += s.length;
    });

    // 5. 形状中心 = 质心位置：手绘的形状出现在用户绘制它的地方
    centerX = cx;
    centerY = cy;

    return { type: 'lines', strokes: localStrokes, segs: segs };
}

/**
 * 把当前 shape 的顶点数据写入 VBO（bufferData 上传 GPU）。
 * 填充形状：tris 一维展开后 flatten；
 * 线框形状：所有笔画的点串接成一维数组后 flatten（点连续存放，
 *           segs 记录区间，绘制时逐段 drawArrays）。
 */
function uploadShape()
{
    var verts;
    if (shape.type === 'fill') {
        verts = shape.tris;
    } else {
        // 把多笔画的点列拼接为一维数组：concat 返回新数组
        verts = [];
        shape.strokes.forEach(function (s) { verts = verts.concat(s); });
    }
    // 【原作业 TODO1 的一部分】把顶点数据写入已绑定的缓冲区：
    // flatten() 把 vec2 数组转换为 Float32Array（GPU 需要的原始浮点格式）
    gl.bufferData(gl.ARRAY_BUFFER, flatten(verts), gl.STATIC_DRAW);
}

/**
 * 根据当前 strokes + currentStroke 重建"手绘预览"数据并上传 VBO。
 * mousemove 时高频调用：点数通常几百以内，全量重传性能完全可接受。
 */
function updatePreview()
{
    // 汇总"已完成笔画 + 正在画的笔画"作为预览内容
    var all = strokes.slice();               // 浅拷贝已完成笔画
    if (currentStroke && currentStroke.length > 0) all.push(currentStroke);

    previewFlat = [];
    previewSegs = [];
    var offset = 0;
    all.forEach(function (s) {
        if (s.length < 1) return;
        // 预览顶点也做等比空间换算（center 视为 (0,0)）：
        //   px = ndcX * aspect, py = ndcY
        // 渲染时以 center=(0,0)、angle=0 绘制，屏幕上即显示在原绘位置
        s.forEach(function (p) {
            previewFlat.push(vec2(p[0] * aspect, p[1]));
        });
        previewSegs.push({ offset: offset, count: s.length });
        offset += s.length;
    });

    // 预览数据上传 VBO（手绘模式下渲染分支画的就是这份预览数据）
    // 注意：flatten() 不支持空数组；预览为空时跳过 bufferData，
    // 同时 previewSegs 也为空，渲染循环不会画出任何东西
    if (previewFlat.length > 0) {
        gl.bufferData(gl.ARRAY_BUFFER, flatten(previewFlat), gl.STATIC_DRAW);
    }
}


/**
 * 计算当前所有笔画（含正在画的）的质心（NDC 坐标）。
 * 用于旋转中心标记的实时定位，以及"调整旋转中心"进入时的初始值。
 * @returns {vec2|null} 质心坐标；无点时返回 null
 */
function computeCentroid()
{
    var sumX = 0, sumY = 0, total = 0;
    for (var i = 0; i < strokes.length; i++) {
        for (var j = 0; j < strokes[i].length; j++) {
            sumX += strokes[i][j][0];
            sumY += strokes[i][j][1];
            total++;
        }
    }
    if (currentStroke) {
        for (var k = 0; k < currentStroke.length; k++) {
            sumX += currentStroke[k][0];
            sumY += currentStroke[k][1];
            total++;
        }
    }
    if (total === 0) return null;
    return vec2(sumX / total, sumY / total);
}

/**
 * 更新滑动条轨道的颜色填充：拇指与中心之间用颜色标识方向和距离。
 * 拇指不在中心时，拇指与中心点之间的轨道段填充颜色：
 *   - 右滑（value > 0，顺时针）：蓝色填充
 *   - 左滑（value < 0，逆时针）：橙色填充
 *   - 中点（value = 0）：无填充，仅显示中心刻度线
 * 中心点始终有 1px 深色刻度线作为参考。
 *
 * @param {number} value 滑动条当前值（-360 ~ 360）
 * @param {HTMLElement} slider 滑动条 DOM 元素
 */
function updateSliderFill(value, slider)
{
    var min = -360, max = 360;
    // 拇指在轨道上的百分比位置
    var thumbPct = (value - min) / (max - min) * 100;
    var centerPct = 50;                 // 中心（value=0）在 50% 处
    var gray = '#d0d5dd';               // 未填充段的底色
    var centerMark = '#666';            // 中心刻度线颜色
    var fill;                           // 填充色

    if (value > 0) {
        fill = '#2f6fdb';               // 蓝色
    } else if (value < 0) {
        fill = '#2f6fdb';               // 蓝色
    }

    if (value > 0) {
        // 中心(50%) → 拇指位置，蓝色填充
        slider.style.background =
            'linear-gradient(to right, ' + gray + ' 0%, ' + gray + ' 49.3%, ' +
            centerMark + ' 49.3%, ' + centerMark + ' 50.7%, ' +
            fill + ' 50.7%, ' + fill + ' ' + thumbPct + '%, ' +
            gray + ' ' + thumbPct + '%)';
    } else if (value < 0) {
        // 拇指位置 → 中心(50%)，橙色填充
        slider.style.background =
            'linear-gradient(to right, ' + gray + ' 0%, ' + gray + ' ' + thumbPct + '%, ' +
            fill + ' ' + thumbPct + '%, ' + fill + ' 49.3%, ' +
            centerMark + ' 49.3%, ' + centerMark + ' 50.7%, ' +
            gray + ' 50.7%)';
    } else {
        // 中点：仅显示刻度线
        slider.style.background =
            'linear-gradient(to right, ' + gray + ' 0%, ' + gray + ' 49.3%, ' +
            centerMark + ' 49.3%, ' + centerMark + ' 50.7%, ' +
            gray + ' 50.7%)';
    }
}


/* ---------------------------------------------------------------------------
 * 三、初始化（相当于 main 函数）
 * -------------------------------------------------------------------------*/
window.onload = function init()
{
    // ---- 加载 WebGL 上下文 -------------------------------------------------
    canvas = document.getElementById("gl-canvas");
    gl = canvas.getContext('webgl2');
    if (!gl) alert("WebGL 2.0 isn't available");

    // ---- 加载并启用着色器程序 ----------------------------------------------
    program = initShaders(gl, "shaders/hw1.vert", "shaders/hw1.frag");
    gl.useProgram(program);

    // ---- 初始化画布与视口 ---------------------------------------------------
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    aspect = canvas.width / canvas.height;   // 纵横比随画布确定

    // ---- 设置背景色（灰色）--------------------------------------------------
    gl.clearColor(0.5, 0.5, 0.5, 1.0);

    // ---- 初始颜色：红色（此后每次点击移动时随机变化）------------------------
    colorRandom = vec4(1.0, 0.0, 0.0, 1.0);

    // ---- 默认形状：矩形，并生成顶点数据 ------------------------------------
    shape = makeRectangle();

    /***************************************************************************
     * TODO1: --- 将顶点属性缓冲对象数据 VBO 传给 vertex shader ---------------
     **************************************************************************/
    /* 创建顶点缓冲区 bufferId；让 gl 绑定该缓冲区（后续 bufferData 都写入它）*/
    bufferId = gl.createBuffer();                 // 在 GPU 端创建缓冲区对象
    gl.bindBuffer(gl.ARRAY_BUFFER, bufferId);     // 绑定为当前 ARRAY_BUFFER

    /* 将 shape 顶点数据扁平化放入缓存（flatten() 转为 Float32Array）*/
    uploadShape();                                // 内部调用 gl.bufferData(...)

    /* 将缓冲区的顶点属性数据和 shader 中的属性变量 aPosition 进行关联 */
    // 查询 aPosition 在着色器中的属性编号（location）
    let vPosition = gl.getAttribLocation(program, "aPosition");
    // 描述缓冲区数据的"读取方式"：每个顶点 2 个 float、不分块、从偏移 0 开始
    // gl.vertexAttribPointer(index, size, type, normalized, stride, pointer)
    gl.vertexAttribPointer(vPosition, 2, gl.FLOAT, false, 0, 0);
    // 激活该顶点属性数组：绘制时 GPU 才会从缓冲区逐顶点读取数据
    gl.enableVertexAttribArray(vPosition);
    /***************************************************************************
     * TODO1 结束 -------------------------------------------------------------
     ***************************************************************************/

    // ---- 缓存各 uniform 的 location（每帧 render 直接使用）------------------
    locCenterX = gl.getUniformLocation(program, "centerX");
    locCenterY = gl.getUniformLocation(program, "centerY");
    locAngle   = gl.getUniformLocation(program, "angle");
    locAspect  = gl.getUniformLocation(program, "aspect");
    locColor   = gl.getUniformLocation(program, "randomColor");

    // ---- 绑定工具栏按钮事件 -------------------------------------------------
    setupUI();

    // ---- 获取旋转中心标记元素 ------------------------------------------------
    pivotMarker = document.getElementById("pivotMarker");
    pivotHint   = document.getElementById("pivotHint");

    // ---- 绑定画布鼠标事件（完成原 TODO2 的交互）-----------------------------
    setupMouse();

    // ---- 启动渲染循环 -------------------------------------------------------
    // 用 requestAnimationFrame 驱动持续渲染：平移动画、旋转、手绘预览
    // 都在每帧中更新，鼠标事件只负责修改状态。
    requestAnimationFrame(render);
};


/* ---------------------------------------------------------------------------
 * 四、UI 事件绑定（按钮 / 滑动条）
 * -------------------------------------------------------------------------*/
function setupUI()
{
    // —— 四个预设形状按钮：切换形状（新形状出现在当前位置）——
    // 切换时取消进行中的平移动画，避免旧目标位置造成困惑。
    document.getElementById("btnRect").onclick = function () {
        animating = false;
        shape = makeRectangle();
        uploadShape();
    };
    document.getElementById("btnTri").onclick = function () {
        animating = false;
        shape = makeTriangle();
        uploadShape();
    };
    document.getElementById("btnCircle").onclick = function () {
        animating = false;
        shape = makeCircle();
        uploadShape();
    };
    document.getElementById("btnStar").onclick = function () {
        animating = false;
        shape = makeStar();
        uploadShape();
    };

    // —— 旋转速度滑动条：双向，中点=停止，左=逆时针，右=顺时针 ——
    // 滑动条直接控制旋转，无需额外按钮开关
    var slider = document.getElementById("rotSpeed");
    var label  = document.getElementById("speedLabel");
    slider.addEventListener("input", function () {
        var v = parseInt(slider.value);
        // 滑动条正值=顺时针。NDC y 轴向上，正角度=逆时针，
        // 因此取负号使正值对应顺时针：rotSpeed = -v * π/180
        rotSpeed = -v * Math.PI / 180.0;
        // 更新标签文字
        if (v === 0) {
            label.textContent = "停止";
        } else if (v > 0) {
            label.textContent = "顺时针 " + v + "°/s";
        } else {
            label.textContent = "逆时针 " + (-v) + "°/s";
        }
        // 更新轨道颜色填充：拇指与中心之间用颜色标识方向和距离
        updateSliderFill(v, slider);
    });
    // 初始化轨道颜色（中心刻度线）
    updateSliderFill(0, slider);

    // —— 手绘模式按钮：进入 / 完成绘制（多笔画手绘的显式结束方式）——
    var btnDraw  = document.getElementById("btnDraw");
    var btnClear = document.getElementById("btnClear");
    var btnPivot = document.getElementById("btnPivot");
    btnDraw.onclick = function () {
        if (!drawMode) {
            // ===== 进入手绘模式 =====
            drawMode = true;
            drawing  = false;
            adjustingPivot = false;   // 重置：默认使用质心定位
            strokes  = [];
            currentStroke = null;
            previewFlat = [];
            previewSegs = [];
            btnDraw.textContent = "完成绘制";
            btnDraw.classList.add("active");
            btnClear.classList.add("show");   // 手绘模式中显示"清空"
            btnPivot.classList.add("show");   // 手绘模式中显示"调整旋转中心"
            btnPivot.classList.remove("active"); // 初始未激活
            animating = false;
        } else {
            // ===== 完成绘制 =====
            // 若 adjustingPivot 仍为 true，finalizeSketch 会使用用户手动设置的中心；
            // 否则使用默认质心。
            var sk = finalizeSketch();
            if (sk) {
                shape = sk;
                uploadShape();
            }
            drawMode = false;
            drawing  = false;
            adjustingPivot = false;   // 退出时重置
            btnDraw.textContent = "手绘形状";
            btnDraw.classList.remove("active");
            btnClear.classList.remove("show");
            btnPivot.classList.remove("show");
            btnPivot.classList.remove("active");
        }
    };

    // —— 清空按钮：丢弃全部笔画重新画 ——
    btnClear.onclick = function () {
        strokes = [];
        currentStroke = null;
        drawing = false;
        previewFlat = [];
        previewSegs = [];
    };

    // —— 调整旋转中心按钮：切换"手动设置中心"模式 ——
    // 激活后画布点击用于设置旋转中心位置（而非画笔画）；
    // 再次点击切换回默认质心定位方式。
    btnPivot.onclick = function () {
        adjustingPivot = !adjustingPivot;
        btnPivot.classList.toggle("active", adjustingPivot);
        if (adjustingPivot) {
            // 进入调整模式：把当前质心作为初始值，标记不会跳变
            var c = computeCentroid();
            if (c) { customPivotX = c[0]; customPivotY = c[1]; }
        }
        // 退出调整模式时不需要做额外操作，渲染自动回到质心定位
    };
}


/* ---------------------------------------------------------------------------
 * 五、画布鼠标事件（移动模式 / 手绘模式）
 * -------------------------------------------------------------------------*/
function setupMouse()
{
    // —— mousedown：区分两种模式 ——
    canvas.addEventListener("mousedown", function (event) {
        if (drawMode) {
            if (adjustingPivot) {
                // ===== 调整旋转中心模式：点击设置中心位置，不画笔画 =====
                var p = pixelToNDC(event);
                customPivotX = p[0];
                customPivotY = p[1];
            } else {
                // ===== 手绘模式：开始一条"新笔画"=====
                drawing = true;
                currentStroke = [pixelToNDC(event)];
            }
        } else {
            // ===== 移动模式：点击处作为平移动画的目标 =====
            var target = pixelToNDC(event);       // 【TODO2】像素 → NDC

            // 随机变色：映射到 [0.15,1] 区间，避免随机出过暗的颜色
            // 在灰色背景上看不清楚
            colorRandom = vec4(0.15 + 0.85 * Math.random(),
                               0.15 + 0.85 * Math.random(),
                               0.15 + 0.85 * Math.random(), 1.0);

            // 平移动画：起点 = 形状"当前位置"。
            // 若上一次动画还没播完，centerX/centerY 就是当前插值位置，
            // 直接以其为新起点，形状会从原地平滑转向新目标（不跳变）。
            animating = true;
            animStart = performance.now();
            animFromX = centerX;
            animFromY = centerY;
            animToX   = target[0];
            animToY   = target[1];
        }
    });

    // —— mousemove：手绘模式下，正在画笔画时追加采样点 ——
    // 用 window 监听：鼠标滑出画布边缘也能继续记录，松开才断笔。
    window.addEventListener("mousemove", function (event) {
        if (!drawMode || !drawing) return;
        currentStroke.push(pixelToNDC(event));
        updatePreview();   // 实时重建预览数据并上传 VBO
    });

    // —— mouseup：手绘模式下仅结束"当前笔画"，不结束绘制 ——
    // 这是支持"多条线组成形状"的关键：一条画完可以接着画下一条，
    // 直到用户点击"完成绘制"。
    window.addEventListener("mouseup", function () {
        if (!drawMode || !drawing) return;
        drawing = false;
        if (currentStroke && currentStroke.length >= 2) {
            strokes.push(currentStroke);   // 有效笔画（≥2 点）才保留
        }
        currentStroke = null;
        updatePreview();
    });

    // —— 窗口尺寸变化：同步画布、视口与纵横比 ——
    window.onresize = function () {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
        gl.viewport(0, 0, canvas.width, canvas.height);
        aspect = canvas.width / canvas.height;
        // 画布尺寸变化不影响形状局部坐标（等比空间与像素对应），
        // 无需重新上传 VBO，下一帧会自动以新 aspect 渲染。
    };
}


/* ---------------------------------------------------------------------------
 * 六、渲染循环（requestAnimationFrame 驱动，每帧执行一次）
 *
 * 【原作业 TODO3 的等价实现】
 * 原框架是"事件驱动"：点击后置 centerChageFlag=true，render 中检测标志
 * 并更新 uniform。本程序改为"连续渲染"：动画（位置插值）与旋转（角度累加）
 * 都需要每帧推进，因此 uniform 每帧统一传递一遍——效果上完全覆盖了
 * "点击后传新值"的 TODO3 要求（uniform 新值同样会在点击后的下一帧生效）。
 * -------------------------------------------------------------------------*/
function render(now)
{
    // ---- 1. 计算帧间隔 dt（秒），用于旋转角速度积分 -------------------------
    // 第一帧没有参考时间，只记录时间戳，不推进角度
    if (render.lastT === undefined || render.lastT === null) {
        render.lastT = now;
    }
    var dt = (now - render.lastT) / 1000.0;
    render.lastT = now;
    // 切后台再切回时 dt 可能很大，限制一步最多推进 0.1 秒，防止形状瞬转
    if (dt > 0.1) dt = 0.1;

    // ---- 2. 更新平移动画：先加速后减速地插值位置 ----------------------------
    if (animating) {
        // 归一化时间进度 t：0（起点）→ 1（终点）
        var t = (now - animStart) / ANIM_DURATION;
        if (t >= 1.0) {
            t = 1.0;             // 到达终点
        }
        // 缓动：把"时间进度"映射为"路程进度"，实现加速段+减速段
        var e = easeInOutCubic(t);
        // 线性插值（作用在缓动后的路程进度上）：
        //   current = from + (to - from) * e
        centerX = animFromX + (animToX - animFromX) * e;
        centerY = animFromY + (animToY - animFromY) * e;
        if (t >= 1.0) animating = false;   // 动画播完，停在上次点击位置
    }

    // ---- 3. 更新旋转角度：角度 += 角速度 × 时间 ------------------------------
    // 滑动条直接控制旋转：rotSpeed=0 时角度不变（等效停转），
    // 非零时按速度和方向累加角度
    angle += rotSpeed * dt;

    // ---- 4. 清屏（用 init 中设置的灰色背景填充）-----------------------------
    gl.clear(gl.COLOR_BUFFER_BIT);

    // ---- 5. 传递 uniform（每帧统一更新，覆盖原 TODO3）-----------------------
    if (drawMode) {
        // 手绘预览：固定 center=(0,0)、angle=0——预览顶点本身就是
        // 屏幕绝对位置（等比空间），用户画在哪里就显示在哪里
        gl.uniform1f(locCenterX, 0.0);
        gl.uniform1f(locCenterY, 0.0);
        gl.uniform1f(locAngle, 0.0);
    } else {
        gl.uniform1f(locCenterX, centerX);
        gl.uniform1f(locCenterY, centerY);
        gl.uniform1f(locAngle, angle);
    }
    gl.uniform1f(locAspect, aspect);
    gl.uniform4fv(locColor, colorRandom);   // 颜色（点击移动时随机变化）

    // ---- 6. 绘制 -------------------------------------------------------------
    // 手绘预览优先：手绘模式中画"正在编辑的全部笔画"（线框）
    if (drawMode) {
        // 逐笔画绘制：LINE_STRIP 把每笔画的点依次连成折线
        for (var i = 0; i < previewSegs.length; i++) {
            var seg = previewSegs[i];
            gl.drawArrays(gl.LINE_STRIP, seg.offset, seg.count);
        }
    } else if (shape.type === 'fill') {
        // 填充形状：一次画出全部三角形
        gl.drawArrays(gl.TRIANGLES, 0, shape.tris.length);
    } else {
        // 线框形状（手绘完成的形状）：逐笔画 LINE_STRIP
        for (var j = 0; j < shape.segs.length; j++) {
            var s2 = shape.segs[j];
            gl.drawArrays(gl.LINE_STRIP, s2.offset, s2.count);
        }
    }

    // ---- 7. 更新旋转中心标记位置（仅手绘模式显示）----------------------------
    // adjustingPivot=true 时标记显示在用户手动设置的位置；
    // 否则显示在已绘笔画的质心（默认方式）。
    // 正在画笔画时（drawing=true）隐藏文字，避免遮挡绘制内容。
    if (drawMode && pivotMarker) {
        var cx, cy, hasPivot = false;
        if (adjustingPivot) {
            // 用户手动设置模式：直接用 customPivotX/Y
            cx = customPivotX;
            cy = customPivotY;
            hasPivot = true;
        } else {
            // 默认模式：实时计算质心
            var c = computeCentroid();
            if (c) { cx = c[0]; cy = c[1]; hasPivot = true; }
        }
        if (hasPivot) {
            // NDC → 像素
            var px = (cx + 1.0) / 2.0 * canvas.width;
            var py = (1.0 - cy) / 2.0 * canvas.height;
            pivotMarker.style.left = px + "px";
            pivotMarker.style.top  = py + "px";
            pivotMarker.style.display = "block";
            // 正在画笔画时隐藏文字，松开后显示
            if (drawing) {
                pivotHint.style.display = "none";
            } else {
                pivotHint.style.left = (px + 6) + "px";
                pivotHint.style.top  = (py - 16) + "px";
                pivotHint.style.display = "block";
            }
        } else {
            pivotMarker.style.display = "none";
            pivotHint.style.display = "none";
        }
    } else if (pivotMarker) {
        pivotMarker.style.display = "none";
        pivotHint.style.display = "none";
    }

    // ---- 8. 请求下一帧，形成持续渲染循环 -------------------------------------
    requestAnimationFrame(render);
}
