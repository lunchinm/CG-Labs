var points = []; //顶点的属性：坐标数组
var colors = []; //顶点的属性：颜色数组

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
 * 坐标轴模型：X轴，Y轴，Z轴的顶点位置和颜色,(-1,1)范围内定义 
 ****************************************************/
function vertextsXYZ()
{
    const len = 0.9;
    var XYZaxis = [
        vec4(-len,  0.0,  0.0, 1.0), // X
        vec4( len,  0.0,  0.0, 1.0),
        vec4( len, 0.0, 0.0, 1.0),
        vec4(len-0.01, 0.01, 0.0, 1.0),
        vec4(len, 0.0, 0.0, 1.0),
        vec4(len-0.01, -0.01, 0.0, 1.0),
        
        vec4( 0.0, -len,  0.0, 1.0), // Y
        vec4( 0.0,  len,  0.0, 1.0),
        vec4( 0.0, len,0.0, 1.0),
        vec4(0.01, len-0.01, 0.0, 1.0),
        vec4(0.0, len, 0.0, 1.0),
        vec4(-0.01, len-0.01, 0.0, 1.0),
        
        vec4( 0.0,  0.0, -len, 1.0), // Z
        vec4( 0.0,  0.0,  len, 1.0),
        vec4( 0.0, 0.0, len, 1.0),
        vec4( 0.01, 0.0,  len-0.01, 1.0),
        vec4( 0.0, 0.0, len, 1.0),
        vec4( -0.01,0.0,  len-0.01, 1.0)
    ];
    
    var XYZColors = [
        vec4(1.0, 0.0, 0.0, 1.0),  // red
        vec4(0.0, 1.0, 0.0, 1.0),  // green
        vec4(0.0, 0.0, 1.0, 1.0),  // blue
    ];
    
    for (var i = 0; i < XYZaxis.length; i++){    
        points.push(XYZaxis[i]);
        var j = Math.trunc(i/6); // JS取整运算Math.trunc//每个方向轴用6个顶点
        colors.push(XYZColors[j]);
    }
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




