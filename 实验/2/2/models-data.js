var points = []; //顶点的属性：坐标数组
var colors = []; //顶点的属性：颜色数组

/*=================================================================
 * 场景顶点缓冲区被按"固定段 + 物体段"的顺序组织，各段起始位置由以下计数给出。
 * 顺序：坐标轴(0) → 角落 gizmo → 物体模型（选中哪种就追加哪种）
 * 说明：每个"轴/gizmo"段内部又分为【线段】与【三角形(圆锥箭头)】两小段，
 *       因为 gl.drawArrays 一次只能用一种图元，必须分开绘制。
 *================================================================*/
// 以下计数均为"写入 points 数组后的绝对下标位置"
var axisVertexCount = 0;  // 坐标轴段：结束位置（线 + 圆锥）
var axisLineCount = 0;    // 坐标轴段：线段结束位置（其后的三角形从该下标开始）
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
 * 由原点沿单位方向 dir 生成一条虚线（每 (dash+gap) 画一段长为 dash 的实线）
 * 用于区分坐标轴的正半轴（实线）与负半轴（虚线）；
 * 每段两端颜色在 cStart→cEnd 之间按位置插值，保持"越远离原点越暗"的渐变。
 ****************************************************/
function pushDashedLine(dir, length, dash, gap, cStart, cEnd)
{
    for (var t = 0.0; t < length - 1e-9; t += dash + gap) {
        var t1 = Math.min(t + dash, length);
        pushLine(vec4(dir[0] * t,  dir[1] * t,  dir[2] * t,  1.0),
                 vec4(dir[0] * t1, dir[1] * t1, dir[2] * t1, 1.0),
                 mix(cStart, cEnd, t  / length),
                 mix(cStart, cEnd, t1 / length));
    }
}

/****************************************************
 * 在 apex 处生成一个圆锥箭头（用 segments 段三角扇逼近）
 * axis 为轴单位向量，u/v 为与 axis 正交的基向量；
 * 底面圆心 = apex - axis*height，底面半径 radius。
 * 箭头侧面按"该处的径向法线"做明暗，使箭头看起来是立体圆锥而非扁平色块。
 ****************************************************/
function pushCone(apex, axis, u, v, height, radius, segments, color)
{
    var bx = apex[0] - axis[0] * height,
        by = apex[1] - axis[1] * height,
        bz = apex[2] - axis[2] * height;

    var apexColor = shadeColor(color, [axis[0], axis[1], axis[2]]);

    for (var k = 0; k < segments; k++) {
        var a0 = 2 * Math.PI * k / segments,
            a1 = 2 * Math.PI * (k + 1) / segments,
            c0 = Math.cos(a0), s0 = Math.sin(a0),
            c1 = Math.cos(a1), s1 = Math.sin(a1);

        var nx0 = u[0] * c0 + v[0] * s0,
            ny0 = u[1] * c0 + v[1] * s0,
            nz0 = u[2] * c0 + v[2] * s0,
            nx1 = u[0] * c1 + v[0] * s1,
            ny1 = u[1] * c1 + v[1] * s1,
            nz1 = u[2] * c1 + v[2] * s1;

        var p0 = vec4(bx + radius * nx0, by + radius * ny0, bz + radius * nz0, 1.0);
        var p1 = vec4(bx + radius * nx1, by + radius * ny1, bz + radius * nz1, 1.0);

        // 侧向三角形：apex - p0 - p1
        points.push(apex); colors.push(apexColor);
        points.push(p0);   colors.push(shadeColor(color, [nx0, ny0, nz0]));
        points.push(p1);   colors.push(shadeColor(color, [nx1, ny1, nz1]));
    }
}

/*=================================================================
 * 顶点明暗（Lambert 漫反射）工具
 * 做法：把一盏方向光在"生成顶点数据时"就烘焙进每个顶点的颜色里，
 *       而不是改动着色器。好处是渲染管线完全不变（frag 仍是 FragColor = fColor），
 *       坐标轴、gizmo 的顶点色生成逻辑也不受任何影响。
 * 光照模型：k = min(1, ambient + diffuse * max(0, n·l))，颜色 = 基色 * k
 * 光源方向 l 取世界坐标下的"右上偏前上方"，与默认等轴测视角(+X 右下、+Y 上、+Z 左下)
 * 相配合，使三个可见面有不同的明度，物体因此获得体积感。
 * 注意：光源固定在世界坐标中，跟踪球旋转物体时明暗会随之变化，符合场景视图观感。
 *================================================================*/
var LIGHT_DIR = [0.5998, 0.7197, 0.3499];  // 归一化的方向光（由 at 指向光源）
var AMBIENT   = 0.38;                      // 环境光比例，保证背光面不至于全黑
var DIFFUSE   = 0.72;                      // 漫反射比例

/****************************************************
 * 按法线 n 对基色 base 做明暗调制，返回新的顶点色
 ****************************************************/
function shadeColor(base, n)
{
    var len = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
    var d = (len > 1e-9)
          ? (n[0] * LIGHT_DIR[0] + n[1] * LIGHT_DIR[1] + n[2] * LIGHT_DIR[2]) / len
          : 0.0;
    var k = Math.min(1.0, AMBIENT + DIFFUSE * Math.max(0.0, d));
    return vec4(base[0] * k, base[1] * k, base[2] * k, base[3]);
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
 * 半轴长 L = 18.0（约为画面竖向半高的 2 倍，轴会伸出画布外，作为贯穿全屏的空间参照）；
 * 正向用实线 + 圆锥三角扇箭头（24 段，轮廓更圆润）；
 * 负向用同色 55% 亮度的虚线（dash 0.90 / gap 0.60，步长 1.50 恰好把 ±18 分成 12 段），
 * 与正向实线一眼可分。
 * 段内顺序：【全部线段】→【全部圆锥三角形】，
 * 因为一段之内混有线段与三角形时无法用一次 drawArrays 画完。
 * 结果：线段 3×2 + 3×12×2 = 78 顶点 + 圆锥 3×24×3 = 216 顶点，共 294 顶点。
 ****************************************************/
function generateAxes()
{
    const L    = 18.0;  // 半轴长度（贯穿场景，伸出画布外，作为贯穿全屏的空间参照）
    const h    = 1.80;  // 圆锥箭头高（保持半轴长的 10%）
    const r    = 0.50;  // 圆锥底面半径（保持半轴长的约 2.8%）
    const seg  = 24;    // 圆锥分段数
    const dash = 0.90;  // 负半轴虚线：实线段长
    const gap  = 0.60;  // 负半轴虚线：间隔长

    var cX = vec4(0.882, 0.231, 0.231, 1.0),  // X 正向：红 #e13b3b
        cY = vec4(0.227, 0.710, 0.290, 1.0),  // Y 正向：绿 #3ab54a
        cZ = vec4(0.227, 0.431, 0.882, 1.0);  // Z 正向：蓝 #3a6ee1

    var dX = vec4(0.485, 0.127, 0.127, 1.0),  // X 负向：红 55% 亮度
        dY = vec4(0.125, 0.391, 0.160, 1.0),  // Y 负向：绿 55% 亮度
        dZ = vec4(0.125, 0.237, 0.485, 1.0);  // Z 负向：蓝 55% 亮度

    var O = vec4(0.0, 0.0, 0.0, 1.0);

    /* ---------- 第一段：线段（正向实线 + 负向虚线，共 78 顶点）---------- */
    pushLine(O, vec4(L - h, 0.0, 0.0, 1.0),  cX, cX); // X 正向（止于箭头根部，避免穿透锥体）
    pushLine(O, vec4(0.0, L - h, 0.0, 1.0),  cY, cY); // Y 正向
    pushLine(O, vec4(0.0, 0.0, L - h, 1.0),  cZ, cZ); // Z 正向
    pushDashedLine(vec3(-1.0, 0.0, 0.0), L, dash, gap, cX, dX); // X 负向
    pushDashedLine(vec3(0.0, -1.0, 0.0), L, dash, gap, cY, dY); // Y 负向
    pushDashedLine(vec3(0.0, 0.0, -1.0), L, dash, gap, cZ, dZ); // Z 负向
    axisLineCount = points.length;

    /* ---------- 第二段：3 个圆锥箭头（216 顶点）---------- */
    pushCone(vec4(L, 0.0, 0.0, 1.0), vec3(1.0, 0.0, 0.0),
             vec3(0.0, 1.0, 0.0), vec3(0.0, 0.0, 1.0), h, r, seg, cX);
    pushCone(vec4(0.0, L, 0.0, 1.0), vec3(0.0, 1.0, 0.0),
             vec3(0.0, 0.0, 1.0), vec3(1.0, 0.0, 0.0), h, r, seg, cY);
    pushCone(vec4(0.0, 0.0, L, 1.0), vec3(0.0, 0.0, 1.0),
             vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), h, r, seg, cZ);
    axisVertexCount = points.length;
}

/****************************************************
 * 角落朝向 gizmo 生成：三色轴 + 小圆锥箭头
 * 它绘制在视口角落处独立的小视口里（只随相机旋转、不随物体变换），
 * 因此只需正向三轴，无负向线。线段 6 顶点 + 圆锥 3×16×3 = 144 顶点，共 150 顶点。
 ****************************************************/
function generateGizmo()
{
    const L   = 0.6;   // gizmo 轴长
    const h   = 0.11;  // 圆锥高
    const r   = 0.04;  // 圆锥底面半径
    const seg = 16;    // 圆锥分段数

    var cX = vec4(0.882, 0.231, 0.231, 1.0),
        cY = vec4(0.227, 0.710, 0.290, 1.0),
        cZ = vec4(0.227, 0.431, 0.882, 1.0);

    var O = vec4(0.0, 0.0, 0.0, 1.0);

    /* ---------- 第一段：3 条线段（6 顶点）---------- */
    pushLine(O, vec4(L - h, 0.0, 0.0, 1.0), cX, cX);
    pushLine(O, vec4(0.0, L - h, 0.0, 1.0), cY, cY);
    pushLine(O, vec4(0.0, 0.0, L - h, 1.0), cZ, cZ);
    gizmoLineCount = points.length;

    /* ---------- 第二段：3 个圆锥箭头（144 顶点）---------- */
    pushCone(vec4(L, 0.0, 0.0, 1.0), vec3(1.0, 0.0, 0.0),
             vec3(0.0, 1.0, 0.0), vec3(0.0, 0.0, 1.0), h, r, seg, cX);
    pushCone(vec4(0.0, L, 0.0, 1.0), vec3(0.0, 1.0, 0.0),
             vec3(0.0, 0.0, 1.0), vec3(1.0, 0.0, 0.0), h, r, seg, cY);
    pushCone(vec4(0.0, 0.0, L, 1.0), vec3(0.0, 0.0, 1.0),
             vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), h, r, seg, cZ);
    gizmoVertexCount = points.length;
}

/****************************************************
 * 立方体六个面的外法线
 * quad() 的首参 a 唯一标识一个面（见 generateCube 的调用顺序），据此取该面法线做明暗。
 ****************************************************/
const CUBE_FACE_NORMAL = {
    1: [ 0.0,  0.0,  1.0],  // Z正-前
    4: [ 0.0,  0.0, -1.0],  // Z负-后
    2: [ 1.0,  0.0,  0.0],  // X正-右
    5: [-1.0,  0.0,  0.0],  // X负-左
    6: [ 0.0,  1.0,  0.0],  // Y正-上
    3: [ 0.0, -1.0,  0.0]   // Y负-下
};

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
        // 立方体每面为单色：六个面各取一种基色，再乘上该面法线的漫反射系数，
        // 使朝向光源的面（+Y 上、+X 右）亮、背光面（-Y、-X、-Z）暗，产生立体感。
        colors.push(shadeColor(VertexColors[a], CUBE_FACE_NORMAL[a]));
    }
}

/****************************************************
 * 球体模型生成：由四面体递归生成
 * 细分次数 6 → 4×4^6 = 16384 个三角形、49152 个顶点，轮廓与明暗过渡带（明暗交界线）
 * 都不会出现肉眼可见的多边形棱边。
 * 着色：不使用"每三角形青/品红/绿"拼色（那种取色在球面上呈噪点状），
 *       改为按"该顶点自身的单位法线"（即归一化后的位置）做漫反射明暗，
 *       顶点色随位置平滑连续，得到一颗有体积感的实心球。
 ****************************************************/
function generateSphere(){
    // 细分次数和顶点
    const numTimesToSubdivide = 6; // 球体细分次数
    const SPHERE_BASE = vec4(0.34, 0.56, 0.93, 1.0); // 球面基色（与界面强调色同源的蓝）
    var va = vec4(0.0, 0.0, -1.0, 1.0);
    var vb = vec4(0.0, 0.942809, 0.333333, 1.0);
    var vc = vec4(-0.816497, -0.471405, 0.333333, 1.0);
    var vd = vec4(0.816497, -0.471405, 0.333333, 1.0);

    /* 球面上的顶点已是单位向量，其自身方向即为该点法线（四边形的 w 分量不参与） */
    function triangle(a, b, c) {
        points.push(a);
        points.push(b);
        points.push(c);

        colors.push(shadeColor(SPHERE_BASE, [a[0], a[1], a[2]]));
        colors.push(shadeColor(SPHERE_BASE, [b[0], b[1], b[2]]));
        colors.push(shadeColor(SPHERE_BASE, [c[0], c[1], c[2]]));
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
                var p = quadVertices[k];
                points.push(p);
                // 颜色按高程做蓝->红渐变，再乘上由高程梯度解析求得的法线所做的漫反射，
                // 使帽顶的隆起与帽檐的翻卷产生明暗变化，起伏更清晰可辨
                colors.push(shadeColor(hatColor(p[1]), hatNormal(p[0], p[2])));
            }
        }
    }
}

/****************************************************
 * 墨西哥帽顶点法线（解析求导，不用数值差分，避免噪声）
 *   y(r) = sin(πr)/(πr)，  r = √(x²+z²)
 *   dy/dr = (πr·cos(πr) − sin(πr)) / (π r²)，  r→0 时取 0（中心为光滑极值）
 *   ∂y/∂x = (dy/dr)·(x/r)，  ∂y/∂z = (dy/dr)·(z/r)
 *   曲面 y = f(x,z) 的法线 ∝ (−∂y/∂x, 1, −∂y/∂z)
 ****************************************************/
function hatNormal(x, z)
{
    var r = Math.sqrt(x * x + z * z);
    var dydr = 0.0;
    if (r > 1e-6) {
        dydr = (Math.PI * r * Math.cos(Math.PI * r) - Math.sin(Math.PI * r))
             / (Math.PI * r * r);
    }
    if (r > 1e-6) {
        return [-dydr * x / r, 1.0, -dydr * z / r];
    }
    return [0.0, 1.0, 0.0];
}

/****************************************************
 * 墨西哥帽基色：按高程 y 在 [−0.217, 1] 区间做蓝→红渐变
 * （y 最低处为 sin(1.5π)/1.5π ≈ −0.212 的帽檐外圈）
 * 渐变曲线用 smoothstep 代替线性，中段过渡更柔和，避免出现色带
 ****************************************************/
function hatColor(y)
{
    var t = (y + 0.22) / 1.22;                        // 归一化到 [0,1]
    t = Math.max(0.0, Math.min(1.0, t));
    t = t * t * (3.0 - 2.0 * t);                      // smoothstep 缓入缓出
    return mix(vec4(0.10, 0.30, 0.90, 1.0),           // 低处：蓝
               vec4(1.00, 0.22, 0.14, 1.0),           // 高处：红
               t);
}




