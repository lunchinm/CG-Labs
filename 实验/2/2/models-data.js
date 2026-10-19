var points = []; //顶点的属性：坐标数组
var colors = []; //顶点的属性：颜色数组

/*=================================================================
 * 场景顶点缓冲区被按"固定段 + 物体段"的顺序组织，各段起始位置由以下计数给出。
 * 顺序：坐标轴(0) → 地面网格 → 角落 gizmo → 物体模型（选中哪种就追加哪种）
 * 说明：每个"轴/gizmo"段内部又分为【线段】与【三角形(圆锥箭头)】两小段，
 *       因为 gl.drawArrays 一次只能用一种图元，必须分开绘制。
 *================================================================*/
// 以下计数均为"写入 points 数组后的绝对下标位置"
var axisVertexCount = 0;  // 坐标轴段：结束位置（线 + 圆锥）
var axisLineCount = 0;    // 坐标轴段：线段结束位置（其后的三角形从该下标开始）
var gridVertexCount = 0;  // 地面网格段：顶点数（全部为线段）
var gizmoVertexCount = 0; // 角落朝向 gizmo 段：结束位置（线 + 圆锥）
var gizmoLineCount = 0;   // 角落朝向 gizmo 段：线段结束位置

/****************************************************
 * 往顶点数组压入一条线段（两端点各带自己的颜色，便于做淡出渐变）
 ****************************************************/
function pushLine(a, b, ca, cb)
{
    points.push(a); colors.push(ca);
    points.push(b); colors.push(cb);
}

/****************************************************
 * 在 apex 处生成一个圆锥箭头（用 segments 段三角扇逼近）
 * axis 为轴单位向量，u/v 为与 axis 正交的基向量；
 * 底面圆心 = apex - axis*height，底面半径 radius。
 ****************************************************/
function pushCone(apex, axis, u, v, height, radius, segments, color)
{
    var bx = apex[0] - axis[0] * height,
        by = apex[1] - axis[1] * height,
        bz = apex[2] - axis[2] * height;

    for (var k = 0; k < segments; k++) {
        var a0 = 2 * Math.PI * k / segments,
            a1 = 2 * Math.PI * (k + 1) / segments,
            c0 = Math.cos(a0), s0 = Math.sin(a0),
            c1 = Math.cos(a1), s1 = Math.sin(a1);

        var p0 = vec4(bx + radius * (u[0] * c0 + v[0] * s0),
                      by + radius * (u[1] * c0 + v[1] * s0),
                      bz + radius * (u[2] * c0 + v[2] * s0), 1.0);
        var p1 = vec4(bx + radius * (u[0] * c1 + v[0] * s1),
                      by + radius * (u[1] * c1 + v[1] * s1),
                      bz + radius * (u[2] * c1 + v[2] * s1), 1.0);

        // 侧向三角形：apex - p0 - p1
        points.push(apex); colors.push(color);
        points.push(p0);   colors.push(color);
        points.push(p1);   colors.push(color);
    }
}

const VertexColors = [
    vec4( 0.0, 0.0, 0.0, 1.0 ),  // black
    vec4( 0.0, 0.0, 1.0, 1.0 ),  // blue
    vec4( 1.0, 0.0, 0.0, 1.0 ),  // red
    vec4( 0.0, 0.5, 0.0, 1.0 ),  // light-green        
    vec4( 0.0, 0.0, 0.5, 1.0 ),  // light-blue
    vec4( 0.5, 0.0, 0.0, 1.0 ),  // light-red
    vec4( 0.0, 1.0, 0.0, 1.0 ),  // green
    vec4( 0.5, 0.5, 0.5, 1.0 )   // grey
];// 常量颜色

/****************************************************
 * 坐标轴模型生成：贯穿场景的三色轴 + 圆锥箭头
 * 半轴长 L = 2.0；正向端点用圆锥三角扇逼近，负向为同色 55% 亮度的细线。
 * 段内顺序：【全部线段】→【全部圆锥三角形】，
 * 因为一段之内混有线段与三角形时无法用一次 drawArrays 画完。
 * 结果：线段 12 顶点 + 圆锥 3×12×3 = 108 顶点，共 120 顶点。
 ****************************************************/
function generateAxes()
{
    const L   = 2.0;   // 半轴长度（贯穿场景）
    const h   = 0.18;  // 圆锥箭头高
    const r   = 0.06;  // 圆锥底面半径
    const seg = 12;    // 圆锥分段数

    var cX = vec4(0.882, 0.231, 0.231, 1.0),  // X 正向：红 #e13b3b
        cY = vec4(0.227, 0.710, 0.290, 1.0),  // Y 正向：绿 #3ab54a
        cZ = vec4(0.227, 0.431, 0.882, 1.0);  // Z 正向：蓝 #3a6ee1

    var dX = vec4(0.485, 0.127, 0.127, 1.0),  // X 负向：红 55% 亮度
        dY = vec4(0.125, 0.391, 0.160, 1.0),  // Y 负向：绿 55% 亮度
        dZ = vec4(0.125, 0.237, 0.485, 1.0);  // Z 负向：蓝 55% 亮度

    var O = vec4(0.0, 0.0, 0.0, 1.0);

    /* ---------- 第一段：6 条线段（12 顶点）---------- */
    pushLine(O, vec4(-L, 0.0, 0.0, 1.0),     cX, dX); // X 负向
    pushLine(O, vec4(L - h, 0.0, 0.0, 1.0),  cX, cX); // X 正向（止于箭头根部，避免穿透锥体）
    pushLine(O, vec4(0.0, -L, 0.0, 1.0),     cY, dY); // Y 负向
    pushLine(O, vec4(0.0, L - h, 0.0, 1.0),  cY, cY); // Y 正向
    pushLine(O, vec4(0.0, 0.0, -L, 1.0),     cZ, dZ); // Z 负向
    pushLine(O, vec4(0.0, 0.0, L - h, 1.0),  cZ, cZ); // Z 正向
    axisLineCount = points.length;

    /* ---------- 第二段：3 个圆锥箭头（108 顶点）---------- */
    pushCone(vec4(L, 0.0, 0.0, 1.0), vec3(1.0, 0.0, 0.0),
             vec3(0.0, 1.0, 0.0), vec3(0.0, 0.0, 1.0), h, r, seg, cX);
    pushCone(vec4(0.0, L, 0.0, 1.0), vec3(0.0, 1.0, 0.0),
             vec3(0.0, 0.0, 1.0), vec3(1.0, 0.0, 0.0), h, r, seg, cY);
    pushCone(vec4(0.0, 0.0, L, 1.0), vec3(0.0, 0.0, 1.0),
             vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), h, r, seg, cZ);
    axisVertexCount = points.length;
}

/****************************************************
 * 地面网格生成（y = 0 平面）：主次网格 + 按到原点距离的 alpha 淡出
 * 半宽 half = 3.0，格距 0.25，每 4 格一条主线（即 1.0 间隔）。
 * 每条线的 alpha 取"线常量"（两端相同），配合顶点色 alpha 直通 + 混合实现淡出。
 * 中心两条线（t = 0）也保留，稍后由坐标轴覆盖绘制，避免 ±2 轴外出现视觉空洞。
 * 结果：25 × 2 = 50 条线 × 2 顶点 = 100 顶点。
 ****************************************************/
function generateGrid()
{
    const half  = 3.0;   // 网格半宽（范围 ±3）
    const step  = 0.25;  // 格距
    const n     = Math.round(half / step);  // 每侧格数 = 12
    const fadeR = 3.5;   // 淡出参考半径

    /* 到原点距离 → alpha：边缘处约 0.14，最暗不低于 0.06 */
    function alphaAt(t)
    {
        return Math.max(0.06, Math.min(1.0, 1.0 - Math.abs(t) / fadeR));
    }

    var start = points.length;
    for (var i = 0; i <= 2 * n; i++) {
        var t = (i - n) * step;              // 该线所在的固定坐标，范围 [-3, 3]
        var a = alphaAt(t);
        var c = (i % 4 === 0)                // 每 4 格一条主线
              ? vec4(0.42, 0.46, 0.52, a)    // 主线：深灰
              : vec4(0.70, 0.74, 0.79, a);   // 次线：浅灰

        // 平行 X 轴的线（固定 z = t）
        pushLine(vec4(-half, 0.0, t, 1.0), vec4(half, 0.0, t, 1.0), c, c);
        // 平行 Z 轴的线（固定 x = t）
        pushLine(vec4(t, 0.0, -half, 1.0), vec4(t, 0.0, half, 1.0), c, c);
    }
    gridVertexCount = points.length - start;
}

/****************************************************
 * 角落朝向 gizmo 生成：三色轴 + 小圆锥箭头
 * 它绘制在视口角落处独立的小视口里（只随相机旋转、不随物体变换），
 * 因此只需正向三轴，无负向线。线段 6 顶点 + 圆锥 3×8×3 = 72 顶点，共 78 顶点。
 ****************************************************/
function generateGizmo()
{
    const L   = 0.6;   // gizmo 轴长
    const h   = 0.11;  // 圆锥高
    const r   = 0.04;  // 圆锥底面半径
    const seg = 8;     // 圆锥分段数

    var cX = vec4(0.882, 0.231, 0.231, 1.0),
        cY = vec4(0.227, 0.710, 0.290, 1.0),
        cZ = vec4(0.227, 0.431, 0.882, 1.0);

    var O = vec4(0.0, 0.0, 0.0, 1.0);

    /* ---------- 第一段：3 条线段（6 顶点）---------- */
    pushLine(O, vec4(L - h, 0.0, 0.0, 1.0), cX, cX);
    pushLine(O, vec4(0.0, L - h, 0.0, 1.0), cY, cY);
    pushLine(O, vec4(0.0, 0.0, L - h, 1.0), cZ, cZ);
    gizmoLineCount = points.length;

    /* ---------- 第二段：3 个圆锥箭头（72 顶点）---------- */
    pushCone(vec4(L, 0.0, 0.0, 1.0), vec3(1.0, 0.0, 0.0),
             vec3(0.0, 1.0, 0.0), vec3(0.0, 0.0, 1.0), h, r, seg, cX);
    pushCone(vec4(0.0, L, 0.0, 1.0), vec3(0.0, 1.0, 0.0),
             vec3(0.0, 0.0, 1.0), vec3(1.0, 0.0, 0.0), h, r, seg, cY);
    pushCone(vec4(0.0, 0.0, L, 1.0), vec3(0.0, 0.0, 1.0),
             vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), h, r, seg, cZ);
    gizmoVertexCount = points.length;
}

/****************************************************
 * 立方体模型生成
 ****************************************************/
function generateCube()
{
    quad( 1, 0, 3, 2 ); //Z正-前
    quad( 4, 5, 6, 7 ); //Z负-后
    
    quad( 2, 3, 7, 6 ); //X正-右
    quad( 5, 4, 0, 1 ); //X负-左
    
    quad( 6, 5, 1, 2 ); //Y正-上
    quad( 3, 0, 4, 7 ); //Y负-下
} 

function quad(a, b, c, d) 
{
	const vertexMC = 0.5; // 顶点分量X,Y,Z到原点距离
    var vertices = [
        vec4( -vertexMC, -vertexMC,  vertexMC, 1.0 ), //Z正前面左下角点V0，顺时针四点0~3
        vec4( -vertexMC,  vertexMC,  vertexMC, 1.0 ),
        vec4(  vertexMC,  vertexMC,  vertexMC, 1.0 ),
        vec4(  vertexMC, -vertexMC,  vertexMC, 1.0 ),
        vec4( -vertexMC, -vertexMC, -vertexMC, 1.0 ),   //Z负后面左下角点V4，顺时针四点4~7
        vec4( -vertexMC,  vertexMC, -vertexMC, 1.0 ),
        vec4(  vertexMC,  vertexMC, -vertexMC, 1.0 ),
        vec4(  vertexMC, -vertexMC, -vertexMC, 1.0 )
    ];

    var indices = [ a, b, c, a, c, d ];
    for ( var i = 0; i < indices.length; ++i ) {
        points.push(vertices[indices[i]]);  // 保存一个顶点坐标到定点给数组vertices中        
        colors.push(VertexColors[a]); // 立方体每面为单色
    }
}

/****************************************************
 * 球体模型生成：由四面体递归生成
 ****************************************************/
function generateSphere(){
    // 细分次数和顶点
    const numTimesToSubdivide = 5; // 球体细分次数
    var va = vec4(0.0, 0.0, -1.0, 1.0);
    var vb = vec4(0.0, 0.942809, 0.333333, 1.0);
    var vc = vec4(-0.816497, -0.471405, 0.333333, 1.0);
    var vd = vec4(0.816497, -0.471405, 0.333333, 1.0);
    
    function triangle(a, b, c) {
        points.push(a);
        points.push(b);
        points.push(c);
        
        colors.push(vec4(0.0, 1.0, 1.0, 1.0));
        colors.push(vec4(1.0, 0.0, 1.0, 1.0));
        colors.push(vec4(0.0, 1.0, 0.0, 1.0));
    };

    function divideTriangle(a, b, c, count) {
        if ( count > 0 ) {
            var ab = mix( a, b, 0.5);
            var ac = mix( a, c, 0.5);
            var bc = mix( b, c, 0.5);

            ab = normalize(ab, true);
            ac = normalize(ac, true);
            bc = normalize(bc, true);

            divideTriangle(  a, ab, ac, count - 1 );
            divideTriangle( ab,  b, bc, count - 1 );
            divideTriangle( bc,  c, ac, count - 1 );
            divideTriangle( ab, bc, ac, count - 1 );
        }
        else {
            triangle( a, b, c );
        }
    }

    function tetrahedron(a, b, c, d, n) {
        divideTriangle(a, b, c, n);
        divideTriangle(d, c, b, n);
        divideTriangle(a, d, b, n);
        divideTriangle(a, c, d, n);
    };

    tetrahedron(va, vb, vc, vd, numTimesToSubdivide); // 递归细分生成球体
}

/****************************************************
* TODO1: 墨西哥帽模型生成，等距细分得z,x，函数计算得到y
****************************************************/
function generateHat()
{
    
    // 这里(x,z)是区域（-1，-1）到（1，1）平均划分成nRows*nColumns得到的交点坐标；
    var nRows = 11; // 线数，实际格数=nRows-1,
    var nColumns = 11; // 线数,实际格数=nColumns-1

    // 嵌套数组data用于存储网格上交叉点的高值(y)值。
    var data = new Array(nRows);
    for(var i = 0; i < nRows; i++) {
        data[i] = new Array(nColumns);
    };
    
    /*=================================================================
     * TODO1  Step1/Step2：遍历网格上每个点，求点的高度(即Y值)
     * 依据课件 lec4《几何造型技术》p.39 的墨西哥帽（hat）模型：
     *   先按等距划分得到归一化的平面坐标（范围 [-1,1]）
     *      Xj = j * 2/(nColumns-1) - 1
     *      Zi = i * 2/(nRows-1)    - 1
     *   再由平面坐标 (x,z) 计算高程 y=f(z,x)，存入 data[i][j]：
     *      r = sqrt(x*x + z*z)
     *      y = sin(PI*r)/(PI*r)   （r != 0，非原点处）
     *      y = 1                  （r == 0，中心帽顶点）
     * 说明：data 的行索引 i 对应 z（即课件中的 Z 方向），列索引 j 对应 x（X 方向）
     *================================================================*/
    for (var i = 0; i < nRows; i++) {
        for (var j = 0; j < nColumns; j++) {
            var x = j * 2.0 / (nColumns - 1) - 1.0;  // Xj
            var z = i * 2.0 / (nRows - 1) - 1.0;     // Zi
            var r = Math.sqrt(x * x + z * z);        // 到原点的平面距离
            data[i][j] = (r === 0) ? 1.0 : Math.sin(Math.PI * r) / (Math.PI * r);
        }
    }

    /*=================================================================
     * TODO1  Step3：顶点数据按每四个片元构成一个四边形网格图元
     * 课件 lec4 p.40：每个方格取 4 个顶点，先计算 (x,y,z)，再按"逆时针"顺序
     * 存入顶点数组，用三角扇（每 4 个顶点绘制 2 个三角形）渲染。
     *
     *   (i,  j  ) A -------------------- B (i,  j+1)
     *            |  \                     |
     *            |    \                   |
     *            |      \                 |
     *   (i+1,j  ) D -------------------- C (i+1,j+1)
     *
     * 逆时针顺序 A -> D -> C -> B，发三角扇两个三角形：A,D,C 与 A,C,B
     *================================================================*/
    for (var i = 0; i < nRows - 1; i++) {
        for (var j = 0; j < nColumns - 1; j++) {
            var xA = j * 2.0 / (nColumns - 1) - 1.0;          // 左列 x
            var xB = (j + 1) * 2.0 / (nColumns - 1) - 1.0;     // 右列 x
            var zA = i * 2.0 / (nRows - 1) - 1.0;              // 上行 z
            var zC = (i + 1) * 2.0 / (nRows - 1) - 1.0;        // 下行 z

            // 方格四个顶点 (x, y, z)
            var A = vec4(xA, data[i][j], zA, 1.0);
            var B = vec4(xB, data[i][j + 1], zA, 1.0);
            var C = vec4(xB, data[i + 1][j + 1], zC, 1.0);
            var D = vec4(xA, data[i + 1][j], zC, 1.0);

            // 逆时针展开为两个三角形（三角扇形）
            var quadVertices = [A, D, C, A, C, B];
            for (var k = 0; k < quadVertices.length; k++) {
                points.push(quadVertices[k]);
                // 颜色按高程做蓝->红渐变，使帽面起伏清晰可辨
                colors.push(hatColor(quadVertices[k][1]));
            }
        }
    }
}

/****************************************************
 * 墨西哥帽顶点着色：按高程 y 在 [−0.217, 1] 区间做蓝→红渐变
 * （y 最低处为 sin(1.5π)/1.5π ≈ −0.212 的帽檐外圈）
 ****************************************************/
function hatColor(y)
{
    var t = (y + 0.22) / 1.22;              // 归一化到 [0,1]
    t = Math.max(0.0, Math.min(1.0, t));
    return mix(vec4(0.10, 0.30, 0.90, 1.0),  // 低处：蓝
               vec4(1.00, 0.20, 0.15, 1.0),  // 高处：红
               t);
}




