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


/* ==================================================================
 * 附加项一：复杂几何模型
 *   1) Newell 茶壶 —— 32 个双三次 Bézier 补丁（控制点见 teapot-data.js）
 *   2) 环面纽结   —— (2, 3) 参数曲线扫掠圆管
 *   3) 太阳系     —— 太阳 / 地球 / 月球三个球体 + 两条轨道线，
 *                    供"层次建模与动画"使用（各段下标见 solarSegments）
 * ================================================================== */

/****************************************************
 * 用 UV 球生成一个球体：stacks 为纬向分段、slices 为经向分段。
 * 顶点色按球面法线做 Lambert 明暗烘焙，与其它模型保持一致。
 ****************************************************/
function pushUVSphere(radius, base, stacks, slices)
{
    function pushTri(a, b, c)
    {
        points.push(a); colors.push(shadeColor(base, [a[0], a[1], a[2]]));
        points.push(b); colors.push(shadeColor(base, [b[0], b[1], b[2]]));
        points.push(c); colors.push(shadeColor(base, [c[0], c[1], c[2]]));
    }

    function at(theta, phi)
    {
        return vec4(radius * Math.sin(theta) * Math.sin(phi),
                    radius * Math.cos(theta),
                    radius * Math.sin(theta) * Math.cos(phi),
                    1.0);
    }

    for (var i = 0; i < stacks; i++) {
        var t0 = Math.PI * i / stacks,
            t1 = Math.PI * (i + 1) / stacks;
        for (var j = 0; j < slices; j++) {
            var p0 = 2.0 * Math.PI * j / slices,
                p1 = 2.0 * Math.PI * (j + 1) / slices;
            var a = at(t0, p0), b = at(t1, p0), c = at(t1, p1), d = at(t0, p1);
            /* 两极处的四边形退化成三角形：i=0 时 a 与 d 重合于北极，
             * i=stacks-1 时 b 与 c 重合于南极，必须单独处理，否则极点处
             * 会留下一个未被封闭的窟窿（从外面看是一个暗斑）。 */
            if (i === 0)                 pushTri(a, b, c);
            else if (i === stacks - 1)   pushTri(a, b, d);
            else { pushTri(a, b, c); pushTri(a, c, d); }
        }
    }
}

/****************************************************
 * 茶壶补丁求值：cp 为 4×4 控制点，u/v 为补丁参数，
 * 同时用 Bernstein 基函数的导数求出两个切向量，叉乘得到法线。
 ****************************************************/
var BZ = [0, 0, 0, 0], BZD = [0, 0, 0, 0];

function bernstein(t)
{
    var s = 1.0 - t;
    BZ[0] = s * s * s;
    BZ[1] = 3.0 * t * s * s;
    BZ[2] = 3.0 * t * t * s;
    BZ[3] = t * t * t;
    BZD[0] = -3.0 * s * s;
    BZD[1] = 3.0 * s * s - 6.0 * t * s;
    BZD[2] = 6.0 * t * s - 3.0 * t * t;
    BZD[3] = 3.0 * t * t;
}

function evalPatch(cp, u, v, outP, outN)
{
    bernstein(u);
    var bu = [BZ[0], BZ[1], BZ[2], BZ[3]];
    var du = [BZD[0], BZD[1], BZD[2], BZD[3]];
    bernstein(v);
    var bv = [BZ[0], BZ[1], BZ[2], BZ[3]];
    var dv = [BZD[0], BZD[1], BZD[2], BZD[3]];

    var px = 0, py = 0, pz = 0, ux = 0, uy = 0, uz = 0, vx = 0, vy = 0, vz = 0;
    for (var i = 0; i < 4; i++) {
        for (var j = 0; j < 4; j++) {
            var p = cp[i][j];
            var w  = bu[i] * bv[j];
            var wu = du[i] * bv[j];
            var wv = bu[i] * dv[j];
            px += p[0] * w;  py += p[1] * w;  pz += p[2] * w;
            ux += p[0] * wu; uy += p[1] * wu; uz += p[2] * wu;
            vx += p[0] * wv; vy += p[1] * wv; vz += p[2] * wv;
        }
    }
    outP[0] = px; outP[1] = py; outP[2] = pz;

    var nx = uy * vz - uz * vy,
        ny = uz * vx - ux * vz,
        nz = ux * vy - uy * vx;
    // 补丁控制网格的朝向不完全一致，用"由原点指向外的方向"统一法线朝向
    if (nx * px + ny * py + nz * pz < 0.0) { nx = -nx; ny = -ny; nz = -nz; }
    outN[0] = nx; outN[1] = ny; outN[2] = nz;
}

/****************************************************
 * Newell 茶壶：遍历 32 个补丁，每个补丁细分 TEAPOT_SEG×TEAPOT_SEG 个四边形。
 * 原始数据以 Z 轴向上，这里映射为 (x, z, y) 以匹配场景的 Y 轴向上；
 * 再按包围盒居中、缩放到最大跨度为 2.6，使其与其它模型尺度相当。
 ****************************************************/
function generateTeapot()
{
    var SEG = 8;
    var BASE = vec4(0.86, 0.62, 0.42, 1.0);

    // 1) 坐标映射与归一化（只处理一次控制点，之后直接求值）
    var ctrl = [];
    var minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, minz = 1e9, maxz = -1e9;
    for (var k = 0; k < TEAPOT_VERTICES.length; k += 3) {
        var x = TEAPOT_VERTICES[k],
            y = TEAPOT_VERTICES[k + 2],     // 原 Z 轴 → 世界 Y 轴
            z = TEAPOT_VERTICES[k + 1];     // 原 Y 轴 → 世界 Z 轴
        ctrl.push([x, y, z]);
        if (x < minx) minx = x;  if (x > maxx) maxx = x;
        if (y < miny) miny = y;  if (y > maxy) maxy = y;
        if (z < minz) minz = z;  if (z > maxz) maxz = z;
    }
    var cx = (minx + maxx) * 0.5, cy = (miny + maxy) * 0.5, cz = (minz + maxz) * 0.5;
    var span = Math.max(maxx - minx, Math.max(maxy - miny, maxz - minz));
    var s = 2.6 / span;
    for (var q = 0; q < ctrl.length; q++) {
        ctrl[q] = [(ctrl[q][0] - cx) * s, (ctrl[q][1] - cy) * s, (ctrl[q][2] - cz) * s];
    }

    // 2) 逐补丁细分
    var P = [0, 0, 0], N = [0, 0, 0];
    for (var np = 0; np < 32; np++) {
        var cp = [];
        for (var i = 0; i < 4; i++) {
            var row = [];
            for (var j = 0; j < 4; j++) row.push(ctrl[TEAPOT_PATCHES[np * 16 + i * 4 + j]]);
            cp.push(row);
        }
        for (var a = 0; a < SEG; a++) {
            for (var b = 0; b < SEG; b++) {
                var u0 = a / SEG, u1 = (a + 1) / SEG;
                var v0 = b / SEG, v1 = (b + 1) / SEG;
                var pts = [], nrm = [];
                var uv = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
                for (var t = 0; t < 4; t++) {
                    evalPatch(cp, uv[t][0], uv[t][1], P, N);
                    pts.push(vec4(P[0], P[1], P[2], 1.0));
                    var nl = Math.sqrt(N[0] * N[0] + N[1] * N[1] + N[2] * N[2]) || 1.0;
                    nrm.push([N[0] / nl, N[1] / nl, N[2] / nl]);
                }
                var tri = [0, 1, 2, 0, 2, 3];
                for (var t2 = 0; t2 < 6; t2++) {
                    var idx = tri[t2];
                    points.push(pts[idx]);
                    colors.push(shadeColor(BASE, nrm[idx]));
                }
            }
        }
    }
}

/****************************************************
 * 环面纽结：参数曲线 C(t) = ((R+cos(qt))cos t, (R+cos(qt))sin t, −sin(qt))，
 * 沿曲线用切向量构造法平面，再扫掠一个半径 r 的圆管。
 * 取 p=2、q=3，曲线在环面上绕 3 圈、整体绕 2 圈，形成三叶结。
 ****************************************************/
function generateTorusKnot()
{
    var P = 2, Q = 3, R = 1.35, r = 0.40;
    var NU = 300, NV = 18;
    var CA = vec4(0.16, 0.62, 0.70, 1.0), CB = vec4(0.66, 0.34, 0.86, 1.0);
    var tmax = 2.0 * Math.PI * P;

    function curve(t)
    {
        var rr = R + Math.cos(Q * t);
        // (x, y, z) → (x, z, y)：把曲线的 Z 轴映射为世界 Y 轴
        return [rr * Math.cos(t), -Math.sin(Q * t), rr * Math.sin(t)];
    }

    function norm(v)
    {
        var l = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]) || 1.0;
        return [v[0] / l, v[1] / l, v[2] / l];
    }
    function cross(a, b)
    {
        return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    }

    // 先写入临时数组，待整体居中、缩放到与其它模型相当的尺度后再并入 points
    var tp = [], tc = [];

    for (var i = 0; i < NU; i++) {
        var t0 = tmax * i / NU, t1 = tmax * (i + 1) / NU;
        var c0 = curve(t0), c1 = curve(t1);
        var h = 1e-4;
        var tan0 = norm([curve(t0 + h)[0] - curve(t0 - h)[0],
                         curve(t0 + h)[1] - curve(t0 - h)[1],
                         curve(t0 + h)[2] - curve(t0 - h)[2]]);
        var ref = Math.abs(tan0[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
        var N0 = norm(cross(tan0, ref));
        var B0 = cross(tan0, N0);
        var tan1 = norm([curve(t1 + h)[0] - curve(t1 - h)[0],
                         curve(t1 + h)[1] - curve(t1 - h)[1],
                         curve(t1 + h)[2] - curve(t1 - h)[2]]);
        var ref1 = Math.abs(tan1[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
        var N1 = norm(cross(tan1, ref1));
        var B1 = cross(tan1, N1);

        for (var j = 0; j < NV; j++) {
            var f0 = 2.0 * Math.PI * j / NV, f1 = 2.0 * Math.PI * (j + 1) / NV;
            function ring(cx, cy, cz, Nx, Bx, f)
            {
                var cs = Math.cos(f), sn = Math.sin(f);
                var nx = Nx[0] * cs + Bx[0] * sn,
                    ny = Nx[1] * cs + Bx[1] * sn,
                    nz = Nx[2] * cs + Bx[2] * sn;
                return { p: vec4(cx + nx * r, cy + ny * r, cz + nz * r, 1.0), n: [nx, ny, nz] };
            }
            var v00 = ring(c0[0], c0[1], c0[2], N0, B0, f0);
            var v01 = ring(c0[0], c0[1], c0[2], N0, B0, f1);
            var v10 = ring(c1[0], c1[1], c1[2], N1, B1, f0);
            var v11 = ring(c1[0], c1[1], c1[2], N1, B1, f1);
            var shade = 0.5 + 0.5 * Math.sin(t0);
            var base = mix(CA, CB, shade);
            var quad = [v00, v01, v11, v00, v11, v10];
            for (var k = 0; k < 6; k++) {
                tp.push(quad[k].p);
                tc.push(shadeColor(base, quad[k].n));
            }
        }
    }

    /* 居中并缩放到最大跨度 2.6：三叶结的曲线在 x/z 上并不对称，
     * 若不居中，物体旋转时会绕着一个偏离中心的点甩动。 */
    var minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9, minz = 1e9, maxz = -1e9;
    for (var m = 0; m < tp.length; m++) {
        var p = tp[m];
        if (p[0] < minx) minx = p[0]; if (p[0] > maxx) maxx = p[0];
        if (p[1] < miny) miny = p[1]; if (p[1] > maxy) maxy = p[1];
        if (p[2] < minz) minz = p[2]; if (p[2] > maxz) maxz = p[2];
    }
    var cx = (minx + maxx) * 0.5, cy = (miny + maxy) * 0.5, cz = (minz + maxz) * 0.5;
    var span = Math.max(maxx - minx, Math.max(maxy - miny, maxz - minz)) || 1.0;
    var s = 2.6 / span;
    for (var m2 = 0; m2 < tp.length; m2++) {
        points.push(vec4((tp[m2][0] - cx) * s, (tp[m2][1] - cy) * s, (tp[m2][2] - cz) * s, 1.0));
        colors.push(tc[m2]);
    }
}

/****************************************************
 * 太阳系（层次建模）：
 *   太阳（原点）→ 地球（绕太阳公转 + 自转）→ 月球（绕地球公转 + 自转）
 * 轨道线画在 XZ 平面：地球轨道半径 6.0、月球轨道半径 1.5（随地球平移）。
 * 段顺序仍是【线段】→【三角形】，渲染时分别用 LINES / TRIANGLES 绘制。
 ****************************************************/
var solarSegments = null;

function pushCircle(radius, segments, color)
{
    for (var i = 0; i < segments; i++) {
        var a0 = 2.0 * Math.PI * i / segments,
            a1 = 2.0 * Math.PI * (i + 1) / segments;
        pushLine(vec4(radius * Math.cos(a0), 0.0, radius * Math.sin(a0), 1.0),
                 vec4(radius * Math.cos(a1), 0.0, radius * Math.sin(a1), 1.0),
                 color, color);
    }
}

function generateSolarSystem()
{
    var ORBIT_COLOR = vec4(0.55, 0.62, 0.72, 0.9);

    solarSegments = {};
    solarSegments.earthOrbitStart = points.length;
    pushCircle(6.0, 180, ORBIT_COLOR);
    solarSegments.earthOrbitCount = points.length - solarSegments.earthOrbitStart;

    solarSegments.moonOrbitStart = points.length;
    pushCircle(1.5, 90, ORBIT_COLOR);
    solarSegments.moonOrbitCount = points.length - solarSegments.moonOrbitStart;

    solarSegments.sunStart = points.length;
    pushUVSphere(1.5, vec4(1.00, 0.72, 0.22, 1.0), 20, 32);
    solarSegments.sunCount = points.length - solarSegments.sunStart;

    solarSegments.earthStart = points.length;
    pushUVSphere(0.55, vec4(0.22, 0.48, 0.90, 1.0), 18, 28);
    solarSegments.earthCount = points.length - solarSegments.earthStart;

    solarSegments.moonStart = points.length;
    pushUVSphere(0.20, vec4(0.76, 0.77, 0.82, 1.0), 14, 20);
    solarSegments.moonCount = points.length - solarSegments.moonStart;
}

/* ==================================================================
 * 附加项四：齿轮组的层次建模
 * 三个齿轮都在 XY 平面内绕自己的轴（Z 轴）旋转，按齿数比传递转速：
 *   主动轮 A(20 齿) → 从动轮 B(15 齿) → 从动轮 C(12 齿)
 *   ωB = −ωA·NA/NB，ωC = −ωB·NB/NC（相邻齿轮转向相反）
 * 每个齿轮单独成段，渲染时各自上传自己的模型矩阵，
 * B 的转角由 A 的转角换算而来、C 的转角由 B 的换算而来，构成父子层次。
 * ================================================================== */
var gearSegments = null;        // 各齿轮、轴在顶点缓冲区中的段
var gearLayout = null;          // 缩放后的轴心位置与齿数

/* 齿轮参数（局部单位）：轴心间距严格等于两轮半径之和，齿才能啮合 */
var GEAR_SPEC = [
    { radius: 1.00, teeth: 20, pos: [0.00, 0.00], phase: 0.0,
      color: [0.74, 0.62, 0.44] },
    { radius: 0.75, teeth: 15, pos: [1.75, 0.00], phase: Math.PI - Math.PI / 15.0,
      color: [0.52, 0.63, 0.78] },
    { radius: 0.60, teeth: 12, pos: [1.35, 1.2894], phase: radians(17.25),
      color: [0.58, 0.70, 0.52] }
];

/****************************************************
 * 生成单个齿轮（中心在原点，轮齿位于 XY 平面，轴向为 Z）：
 * 每个齿由 4 个轮廓点组成（齿根起 → 齿顶起 → 齿顶落 → 齿根落），
 * 端面用中心点做三角扇，齿侧与内孔用四边形带，端面法线为 ±Z、
 * 侧面法线为径向，从而呈现金属齿轮的分面明暗。
 ****************************************************/
function generateGear(radius, teeth, thickness, phase, base)
{
    var N = teeth,
        pitch = 2.0 * Math.PI / N,
        rootR = radius * 0.80,
        h = thickness * 0.5,
        hubR = Math.max(radius * 0.20, 0.02),
        hubH = thickness * 1.2;

    var prof = [];
    for (var k = 0; k < N; k++) {
        /* 齿中心严格落在 k·pitch + phase 上，齿槽中心落在 (k+0.5)·pitch + phase 上，
         * 这样两轮相切方向上的"齿对槽"才能对上，齿轮看上去才真正啮合。 */
        var b0 = k * pitch + phase;
        prof.push([rootR,  b0 - 0.30 * pitch]);
        prof.push([radius, b0 - 0.12 * pitch]);
        prof.push([radius, b0 + 0.12 * pitch]);
        prof.push([rootR,  b0 + 0.30 * pitch]);
    }
    var P = prof.length;

    function at(i, z) {
        var rr = prof[i][0], aa = prof[i][1];
        return vec4(rr * Math.cos(aa), rr * Math.sin(aa), z, 1.0);
    }
    function pushV(p, n) {
        points.push(p);
        colors.push(shadeColor(base, n));
    }
    function pushFace(a, b, c, n) {
        pushV(a, n); pushV(b, n); pushV(c, n);
    }

    var nFront = [0, 0, 1], nBack = [0, 0, -1];
    var cFront = vec4(0, 0, h, 1.0), cBack = vec4(0, 0, -h, 1.0);

    for (var i = 0; i < P; i++) {
        var j = (i + 1) % P;
        var f0 = at(i, h), f1 = at(j, h),
            b0v = at(i, -h), b1v = at(j, -h);

        pushFace(cFront, f0, f1, nFront);            // 前端面
        pushFace(cBack, b1v, b0v, nBack);            // 后端面

        /* 齿侧：两端点的平均方向作为该面的法线 */
        var am = 0.5 * (prof[i][1] + prof[j][1]);
        var nSide = [Math.cos(am), Math.sin(am), 0.0];
        pushFace(b0v, b1v, f1, nSide);
        pushFace(b0v, f1, f0, nSide);
    }

    /* 轮毂与轴：沿 Z 伸出的圆柱，随齿轮一起转（旋转对称，看上去不动） */
    var HS = 18;
    for (var s = 0; s < HS; s++) {
        var a0 = 2.0 * Math.PI * s / HS,
            a1 = 2.0 * Math.PI * (s + 1) / HS;
        var n0 = [Math.cos(a0), Math.sin(a0), 0.0],
            n1 = [Math.cos(a1), Math.sin(a1), 0.0];
        var q0 = vec4(hubR * n0[0], hubR * n0[1], -hubH, 1.0),
            q1 = vec4(hubR * n1[0], hubR * n1[1], -hubH, 1.0),
            q2 = vec4(hubR * n1[0], hubR * n1[1],  hubH, 1.0),
            q3 = vec4(hubR * n0[0], hubR * n0[1],  hubH, 1.0);
        pushV(q0, n0); pushV(q1, n1); pushV(q2, n1);
        pushV(q0, n0); pushV(q2, n1); pushV(q3, n0);

        var hc0 = vec4(0, 0, hubH, 1.0), hc1 = vec4(0, 0, -hubH, 1.0);
        pushFace(hc0, q3, q2, nFront);
        pushFace(hc1, q1, q0, nBack);
    }
}

/****************************************************
 * 生成整套齿轮组：先按局部坐标求包围盒，整体居中并缩放到最大跨度 2.6，
 * 与其它模型的尺度保持一致；每个齿轮各记录一段，供渲染时分段上传矩阵。
 ****************************************************/
function generateGearTrain()
{
    var minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    for (var i = 0; i < GEAR_SPEC.length; i++) {
        var g = GEAR_SPEC[i];
        minx = Math.min(minx, g.pos[0] - g.radius);
        maxx = Math.max(maxx, g.pos[0] + g.radius);
        miny = Math.min(miny, g.pos[1] - g.radius);
        maxy = Math.max(maxy, g.pos[1] + g.radius);
    }
    var cx = (minx + maxx) * 0.5, cy = (miny + maxy) * 0.5;
    var span = Math.max(maxx - minx, maxy - miny) || 1.0;
    var s = 2.6 / span;

    gearSegments = { gears: [] };
    gearLayout = { scale: s, pos: [], teeth: [] };

    for (var k = 0; k < GEAR_SPEC.length; k++) {
        var spec = GEAR_SPEC[k];
        var start = points.length;
        generateGear(spec.radius * s, spec.teeth, 0.22 * s, spec.phase,
                     vec4(spec.color[0], spec.color[1], spec.color[2], 1.0));
        gearSegments.gears.push({ start: start, count: points.length - start });
        gearLayout.pos.push([(spec.pos[0] - cx) * s, (spec.pos[1] - cy) * s]);
        gearLayout.teeth.push(spec.teeth);
    }
}





