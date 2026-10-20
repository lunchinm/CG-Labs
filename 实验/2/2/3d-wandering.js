var canvas;
var gl;
var program;

var vBuffer, cBuffer;//顶点属性数组

/* ==================================================================
 * 交互可调参数（全部在声明处给定初值）
 * 说明：窗口 onload 中会先调用 resizeCanvas() 设置画布尺寸，
 *       因此这些全局量不能依赖 initViewingParameters() 才被赋值，
 *       否则首次 render() 会取到 undefined 而报错。
 * ================================================================== */
var currentModel = 'hat';      // 当前选择的模型：cube / sphere / hat

var modelScale = 1.0;          // 物体整体缩放因子（Z/C 键、侧栏滑块）
var modelRot = mat4();         // 累积旋转变换矩阵（鼠标左键拖动虚拟跟踪球）M = T·R·S 中的 R
var modelTrans = vec3(0,0,0);  // 累积平移向量（方向键、侧栏数字框）M = T·R·S 中的 T

var theta = 45.0;              // 相机方位角 θ（绕 Y 轴，单位：度）
var phi = 54.7356;             // 相机仰角 φ（相对 +Y 轴，单位：度）
var camRadius = 4.0;           // 相机到原点的距离（滚轮 / 侧栏滑块调节）
var isOrth = true;             // 投影方式：true=正交，false=透视
var fov = 60.0;                // 透视投影视野角（度）

var showGrid = true;           // 显示：地面网格
var showAxes = true;           // 显示：坐标轴
var showLabels = true;         // 显示：轴标签
var showGizmo = true;          // 显示：角落朝向 gizmo

var ModelMatrix;               // 模型变换矩阵
var ViewMatrix;                // 视图变换矩阵
var ProjectionMatrix;          // 投影变换矩阵

// shader里的统一变量在本代码里的标识变量
var u_ModelMatrix, u_ViewMatrix, u_ProjectionMatrix;
var u_Flag;//用来区分绘制坐标还是物体，坐标轴不需要进行M变换

// 各段在顶点缓冲区中的位置（由 buildScene() 统一计算）
var objStart = 0;              // 物体段起始下标
var objCount = 0;              // 物体段顶点数

// 场景中的默认观察参数
var DEFAULT_THETA = 45.0,
    DEFAULT_PHI = 54.7356,
    DEFAULT_RADIUS = 4.0,
    DEFAULT_FOV = 60.0;

// 视图预设（前/后/左/右/上/下/等轴测）
// 等轴测取 θ=45°、φ=arctan(√2)=54.7356°、r=4，eye=(2.31,2.31,2.31)，
// 此时三根正向轴在屏幕上恰好等长且互成 120°，+Y 竖直向上、+X 指向右下、+Z 指向左下。
var VIEW_PRESETS = {
    front:  { theta:   0.0, phi:  90.0 },
    back:   { theta: 180.0, phi:  90.0 },
    left:   { theta: -90.0, phi:  90.0 },
    right:  { theta:  90.0, phi:  90.0 },
    top:    { theta:   0.0, phi:   0.0 },
    bottom: { theta:   0.0, phi: 180.0 },
    iso:    { theta:  45.0, phi: 54.7356 }
};

/* ***********窗口加载时调用:程序环境初始化程序****************** */
window.onload = function() {
    canvas = document.getElementById("canvas");
    gl = canvas.getContext('webgl2', { antialias: true });  // 显式开启多重采样抗锯齿，轴/网格细线与模型轮廓更平滑
    if ( !gl ) { alert( "WebGL isn't available" ); return; }

    program = initShaders( gl, "shaders/3d-wandering.vert", "shaders/3d-wandering.frag" );
    gl.useProgram( program );

    // 初始化数据缓冲区，并关联 attribute 着色器变量
    vBuffer = gl.createBuffer();//为points存储的缓存
    gl.bindBuffer( gl.ARRAY_BUFFER, vBuffer );
    var vPosition = gl.getAttribLocation( program, "vPosition" );
    gl.vertexAttribPointer( vPosition, 4, gl.FLOAT, false, 0, 0 );
    gl.enableVertexAttribArray( vPosition );
    cBuffer = gl.createBuffer();//为colors存储的缓存
    gl.bindBuffer( gl.ARRAY_BUFFER, cBuffer );
    var vColor = gl.getAttribLocation( program, "vColor" );
    gl.vertexAttribPointer( vColor, 4, gl.FLOAT, false, 0, 0 );
    gl.enableVertexAttribArray( vColor );

    // 关联uniform着色器变量
    u_ModelMatrix = gl.getUniformLocation(program, "u_ModelMatrix");
    u_ViewMatrix = gl.getUniformLocation( program, "u_ViewMatrix" );
    u_ProjectionMatrix = gl.getUniformLocation( program, "u_ProjectionMatrix" );
    u_Flag = gl.getUniformLocation(program, "u_Flag");

    //调整画布大小以填满视口容器（保持与容器 CSS 尺寸 1:1），并设置 viewport
    resizeCanvas();

    /* 开启深度缓存，以正确渲染物体被遮挡部分，3D显示必备；
     * 深度函数取 LEQUAL：坐标轴/网格与物体深度相等时（如轴与网格都位于 y=0 平面）
     * 后绘制者胜出，从而让彩色坐标轴覆盖住网格的中心线，且避免 z-fighting。 */
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    /* 开启混合，使顶点色携带的 alpha 生效：
     * 地面网格按"到原点距离"写入逐线 alpha，配合混合即可实现边缘淡出。 */
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // 设置canvas画布背景色（与 #viewport-container 的 #eef1f5 一致）
    gl.clearColor(0.933, 0.945, 0.961, 1.0);

    //初始化交互界面上的相关参数
    initViewingParameters();

    // 绑定侧栏/工具栏控件与鼠标交互
    initUI();
    initPointerInteraction();

    // 构建场景：坐标轴 → 地面网格 → 角落 gizmo → 物体（顺序固定）
    buildScene(currentModel);

    // 调用绘制函数进行渲染
    render();

    /* 绘图界面随窗口交互缩放而相应变化，保持 1:1 防止图形变形 */
    window.onresize = function(){ resizeCanvas(); render(); };
}

/* 视口容器尺寸变化时同步画布像素尺寸与 WebGL viewport（不触发渲染） */
function resizeCanvas(){
    var container = document.getElementById('viewport-container');
    var w = Math.max(1, container.clientWidth);
    var h = Math.max(1, container.clientHeight);
    canvas.width  = w;
    canvas.height = h;
    gl.viewport( 0, 0, w, h );
}

/* 注册键盘按键事件，修改变换矩阵中的各项参数，并重新进行渲染render */
window.onkeydown = function(e){
    // 焦点在输入控件内时不拦截按键，避免影响数字框/滑块的正常输入
    var tag = (e.target && e.target.tagName) ? e.target.tagName : '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    switch (e.keyCode) {
        case 90:    // Z-物体整体放大
            modelScale *= 1.1;
            break;
        case 67:    // C-物体整体缩小
            modelScale *= 0.9;
            break;

        case 87:    // W-视点绕X轴顺时针旋转5度（φ 减小，相机向 +Y 升起）
            phi -= 5;
            break;
        case 83:    // S-视点绕X轴逆时针旋转5度（φ 增大，相机向 -Y 落下）
            phi += 5;
            break;
        case 65:    // A-视点绕Y轴顺时针旋转5度（θ 减小）
            theta -= 5;
            break;
        case 68:    // D-视点绕Y轴逆时针旋转5度（θ 增大）
            theta += 5;
            break;

        /* ===== 附加项：方向键控制物体累积平移（M = T·R·S 中的T）===== */
        case 37:    // ← 物体沿X轴负方向平移
            modelTrans[0] -= 0.1;
            e.preventDefault();     // 阻止方向键滚动页面
            break;
        case 39:    // → 物体沿X轴正方向平移
            modelTrans[0] += 0.1;
            e.preventDefault();
            break;
        case 38:    // ↑ 物体沿Y轴正方向平移
            modelTrans[1] += 0.1;
            e.preventDefault();
            break;
        case 40:    // ↓ 物体沿Y轴负方向平移
            modelTrans[1] -= 0.1;
            e.preventDefault();
            break;

        case 80:    // P-切换投影方式
            isOrth = !isOrth;
            break;
        case 77:    // M-放大视野角，给了一个限制范围
            fov = Math.min(fov + 5, 170);
            break;
        case 78:    // N-缩小视野角
            fov = Math.max(fov - 5, 5);
            break;

        case 32:    // 空格-复位
            initViewingParameters();
            break;
    }

    clampCamera();
    syncUI();
    render();//参数变化后需要重新绘制画面
}

/* 把相机极坐标参数限制在合法范围内（θ 环绕到 [-180,180)，φ 截断到 [0,180]） */
function clampCamera(){
    theta = ((theta + 180) % 360 + 360) % 360 - 180;
    phi = Math.max(0.0, Math.min(180.0, phi));
    camRadius = Math.max(1.5, Math.min(12.0, camRadius));
    fov = Math.max(5.0, Math.min(170.0, fov));
}

/********************************************************
*  渲染函数render
******************************************************/
function render(){
    // 用背景色清屏；同时清除深度缓存，否则上一帧的深度值残留会导致
    // 旋转/缩放后物体内部的遮挡关系出错（深度测试必需）
    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );

    // 构造观察流程中需要的三个变换矩阵并上传
    ModelMatrix = formModelMatrix();                  //M:模型变换矩阵
    ViewMatrix = formViewMatrix();                    //V:视点变换矩阵
    ProjectionMatrix = formProjectMatrix(canvas.width / canvas.height); //P:投影变换矩阵

    gl.uniformMatrix4fv( u_ModelMatrix, false, flatten(ModelMatrix) );
    gl.uniformMatrix4fv( u_ViewMatrix, false, flatten(ViewMatrix) );
    gl.uniformMatrix4fv( u_ProjectionMatrix, false, flatten(ProjectionMatrix) );

    /* ---------- pass1：中心物体（写深度，作为遮挡参照）---------- */
    gl.uniform1i( u_Flag, 1 );   // 标志位=1，顶点先经 M 变换再经 P·V
    gl.depthMask( true );
    gl.drawArrays( gl.TRIANGLES, objStart, objCount );

    /* ---------- pass2：地面网格 + 三色坐标轴（不写深度，被物体正确遮挡）----------
     * 顺序：先网格、后坐标轴。二者都位于 y=0 平面且都不写深度，
     * 因此后绘制的坐标轴会覆盖住网格在 x=0 / z=0 处的中心线，
     * 避免"轴只到 ±2 而网格到 ±3"时中心出现视觉空洞与双线。 */
    gl.uniform1i( u_Flag, 0 );   // 标志位=0，只用 P·V 绘制，不做模型变换
    gl.depthMask( false );

    if (showGrid) {
        gl.drawArrays( gl.LINES, axisVertexCount, gridVertexCount );
    }
    if (showAxes) {
        // 轴段内先线段后三角形（圆锥箭头），两种图元必须分两次调用
        gl.drawArrays( gl.LINES, 0, axisLineCount );
        gl.drawArrays( gl.TRIANGLES, axisLineCount, axisVertexCount - axisLineCount );
    }
    gl.depthMask( true );

    /* ---------- pass3：角落朝向 gizmo（独立小视口 + 独立相机）---------- */
    var gizmoStart = axisVertexCount + gridVertexCount;
    if (showGizmo) {
        drawGizmo( gizmoStart );
        // 小视口绘制完毕后恢复主视图的三个变换矩阵与 viewport
        gl.viewport( 0, 0, canvas.width, canvas.height );
        gl.uniformMatrix4fv( u_ModelMatrix, false, flatten(ModelMatrix) );
        gl.uniformMatrix4fv( u_ViewMatrix, false, flatten(ViewMatrix) );
        gl.uniformMatrix4fv( u_ProjectionMatrix, false, flatten(ProjectionMatrix) );
        gl.uniform1i( u_Flag, 1 );
    }

    // 每帧把参数写回界面与状态栏，并更新轴标签位置
    syncUI();
    updateAxisLabels();
}

/* 在视口右上角的小方形区域内绘制朝向 gizmo：
 * 用 scissor 限定区域、只清该区域的深度，再改用"只旋转不平移"的视图矩阵
 * 与小范围正交投影，使 gizmo 始终位于角落、大小恒定、方向随主相机联动。 */
function drawGizmo( gizmoStart )
{
    const size = 96, margin = 14;
    var x = canvas.width - size - margin;
    var y = canvas.height - size - margin;   // WebGL 原点在左下：距顶部 margin

    gl.enable( gl.SCISSOR_TEST );
    gl.scissor( x, y, size, size );
    gl.clear( gl.DEPTH_BUFFER_BIT );         // 仅清除小方区内的深度，避免与主场景互相干扰
    gl.viewport( x, y, size, size );

    gl.uniformMatrix4fv( u_ModelMatrix, false, flatten(mat4()) );                        // 单位模型矩阵
    gl.uniformMatrix4fv( u_ViewMatrix, false, flatten(formGizmoViewMatrix()) );          // 只含旋转的视图矩阵
    gl.uniformMatrix4fv( u_ProjectionMatrix, false, flatten(ortho(-0.72, 0.72, -0.72, 0.72, 0.1, 10.0)) );
    gl.uniform1i( u_Flag, 0 );

    gl.drawArrays( gl.LINES, gizmoStart, gizmoLineCount - gizmoStart );
    gl.drawArrays( gl.TRIANGLES, gizmoLineCount, gizmoVertexCount - gizmoLineCount );

    gl.disable( gl.SCISSOR_TEST );
}


/* ****************************************************
* 初始化或复位：需要将交互参数及变换矩阵设置为初始值
********************************************************/
function initViewingParameters(){
    modelScale = 1.0;
    modelRot = mat4();          // 附加项：累积旋转复位为单位矩阵
    modelTrans = vec3(0,0,0);   // 附加项：累积平移复位为零向量
    theta = DEFAULT_THETA;
    phi = DEFAULT_PHI;
    camRadius = DEFAULT_RADIUS;
    isOrth = true;
    fov = DEFAULT_FOV;

    ModelMatrix = mat4(); //单位矩阵
    ViewMatrix = mat4();//单位矩阵
    ProjectionMatrix = mat4();//单位矩阵

    updateTransInputs();
};


/****************************************************************
* 初始及交互菜单选择不同图形后，需要重新发送顶点属性数据给GPU
******************************************************************/
function SendData(){
    var pointsData = flatten(points);
    var colorsData = flatten(colors);

    gl.bindBuffer( gl.ARRAY_BUFFER, vBuffer );
    gl.bufferData( gl.ARRAY_BUFFER, pointsData, gl.STATIC_DRAW );
    gl.bindBuffer( gl.ARRAY_BUFFER, cBuffer );
    gl.bufferData( gl.ARRAY_BUFFER, colorsData, gl.STATIC_DRAW );
}

/****************************************************************
* 构建场景顶点数据：固定按"坐标轴 → 地面网格 → 角落 gizmo → 物体"的顺序，
* 段计数（axisVertexCount / gridVertexCount / gizmoVertexCount）由生成函数填写，
* 物体段的起始下标与顶点数在此处记录，供 render() 分段绘制使用。
******************************************************************/
function buildScene(model){
    points = [];
    colors = [];

    generateAxes();    // 三色坐标轴 + 圆锥箭头（段计数：axisVertexCount/axisLineCount）
    generateGrid();    // 地面主次网格 + 距离淡出（段计数：gridVertexCount）
    generateGizmo();   // 角落朝向 gizmo（段计数：gizmoVertexCount/gizmoLineCount）

    objStart = points.length;
    switch (model) {
        case 'cube':   generateCube();   break;
        case 'sphere': generateSphere(); break;
        default:       generateHat();    break;
    }
    objCount = points.length - objStart;

    SendData();//发送顶点属性数据给GPU
}

/********************************************************
* 交互菜单选择不同图形后，需要重新生成顶点数据并渲染
******************************************************/
function modelChange(model){
    currentModel = model;
    buildScene(model);
    syncUI();
    render();//重新渲染
}


/* ****************************************************
 * 生成观察流水管线中的 M,V,P矩阵
********************************************************/
function formModelMatrix(){
//===================TODO2：生成中心物体的模型变换矩阵M============================
/* 一般模型变换（课件 lec6 p.52：M = T·R·S）
 * 本程序由三个可交互的累积量合成模型变换矩阵：
 *   modelTrans —— 累积平移（方向键 / 侧栏数字框，附加项）
 *   modelRot   —— 累积旋转（鼠标左键拖动虚拟跟踪球，附加项）
 *   modelScale —— 累积缩放（Z/C 键 / 侧栏滑块，基本要求）
 * 顶点以列向量左乘，故复合顺序为 T · R · S（先缩放，再旋转，最后平移）
 */
    var scaleMatrix = scale(modelScale, modelScale, modelScale);        // S
    var modelMatrix = mult(translate(modelTrans[0], modelTrans[1], modelTrans[2]),
                           mult(modelRot, scaleMatrix));                // M = T·R·S
    return modelMatrix;
}

/* 由球面极坐标求观察者位置：θ 为绕 Y 轴的方位角、φ 为相对 +Y 轴的仰角 */
function eyePosition(radius){
    return vec3(radius * Math.sin(radians(phi)) * Math.sin(radians(theta)),
                radius * Math.cos(radians(phi)),
                radius * Math.sin(radians(phi)) * Math.cos(radians(theta)));
}

/* 求与视线方向恒不共线的 up 向量：
 * 取球坐标框架中"仰角增大方向"的反向单位向量，
 * 该向量恒为单位向量且恒垂直于 eye（点积恒为 0），
 * 因此在 φ = 0/180（视线沿 Y 轴）时也不会与观察方向共线退化。
 */
function upVector(){
    return vec3(-Math.cos(radians(phi)) * Math.sin(radians(theta)),
                Math.sin(radians(phi)),
                -Math.cos(radians(phi)) * Math.cos(radians(theta)));
}

function formViewMatrix(){
//===================TODO3：生成物体的视点变换矩阵V=======================
/***提示1：观察者（eye）的位置计算***************************************
*观察者（eye）的位置是在绕X和Y轴转动，可以认为是在球面运动，可使用极坐标参数化表示。
*极坐标参数半径 radius 由全局量 camRadius 给出（滚轮/侧栏滑块可调，范围 1.5~12），
*因为物体坐标范围约 [-1,1]、地面网格到 ±3，radius 需不小于 1.5 才不会穿进物体内部。
*极坐标参数theta和phi是交互界面中控制，
*三角函数需要用到Math库，MVnew.js提供的函数radians将三角函数中的角度值转换为弧度值。
************************************************************************/
/***提示2：UP向量的计算**********************************
*通常UP=(0,1,0),但是当相机视线方向n和UP共线时会有问题!
*解决方法：找垂直于观察方向n的某线段作为up向量
*********************************************************/
    /* eye 的球面参数化：
     *   eye = r*( sin(phi)*sin(theta), cos(phi), sin(phi)*cos(theta) )
     * 默认 theta=-45、phi=54.7356 时为等轴测视角（正象限上方斜看原点）；
     * 只改变 phi 时 eye 在 YZ 平面内转动（相机绕X轴转），
     * 只改变 theta 时 eye 在 XZ 平面内转动（相机绕Y轴转），
     * 正好对应交互说明中 W/S 绕X轴、A/D 绕Y轴。
     */
    return lookAt(eyePosition(camRadius), vec3(0.0,0.0,0.0), upVector()); //lookAt是/common/MVnew.js中的已经写好的函数
};

/* 角落 gizmo 专用视图矩阵：只随相机方向旋转、不随相机距离平移 */
function formGizmoViewMatrix(){
    return lookAt(eyePosition(3.0), vec3(0.0,0.0,0.0), upVector());
}

function formProjectMatrix(aspect){
   //==========TODO4: 生成投影矩阵=======================
	//提示1：可调用common目录下的MVnew.js里ortho(),perspective()函数
    //ortho正交投影需要的参数有left, right, bottom, ytop, near, far
    //perspective透视投影需要的参数有fov, aspect, near, far，
	//注意1：fov俯仰角是交互控制变化的参数，是全局变量（默认60，范围5~170）
	//注意2：因为参数top是js的保留字，所以这里的参数改名为ytop
	//注意3：设置的视见体参数需要考虑将场景中的景物包含进去。
    /* 视见体参数取值说明：
     * 相机在半径 camRadius（默认4，最大12）的球面上，at 为原点，故景物在观察坐标系中
     * 沿 -Z 方向距离眼睛约 camRadius-3 ~ camRadius+3（near 需小于1、far 需大于15才能包含景物）；
     * 正交投影竖向视野固定为 ±3.2（需覆盖 ±3 的地面网格，否则俯视图会裁切），
     * 横向随纵横比 aspect = 画布宽/高 变化；透视投影只需要 fov 与 aspect。
     */
    const near = 0.1;
    const far = 50.0;
    const halfV = 3.2; // 正交投影竖向半高

    // 由 isOrth 标志位切换正投影/透视投影
    if (isOrth) {
        return ortho(-halfV * aspect, halfV * aspect, -halfV, halfV, near, far);
    } else {
        return perspective(fov, aspect, near, far); // fov 为视野角（度），MVnew内部已转为弧度
    }
}


/* ==================================================================
 * 界面控件绑定与状态同步
 * ================================================================== */
function bindClick(el, fn){
    el.onclick = function(){ fn(); el.blur(); };   // 点击后移除焦点，避免空格/回车重复触发按钮
}

function initUI(){
    /* 工具栏：模型分段按钮 */
    document.querySelectorAll('#segModel button').forEach(function(btn){
        bindClick(btn, function(){ modelChange(btn.dataset.model); });
    });
    /* 侧栏：模型单选项（与工具栏同源） */
    document.querySelectorAll('input[name=model]').forEach(function(radio){
        radio.addEventListener('change', function(){ modelChange(radio.value); });
    });

    /* 工具栏：视图预设 */
    document.querySelectorAll('#segView button').forEach(function(btn){
        bindClick(btn, function(){ setView(btn.dataset.view); });
    });

    /* 工具栏：投影切换 / 复位 */
    bindClick(document.getElementById('btnProj'), function(){
        isOrth = !isOrth; syncUI(); render();
    });
    bindClick(document.getElementById('btnReset'), function(){
        initViewingParameters(); syncUI(); render();
    });

    /* 侧栏：相机与物体变换滑块 */
    bindRange('rngTheta',  function(v){ theta = v; });
    bindRange('rngPhi',    function(v){ phi = v; });
    bindRange('rngFov',    function(v){ fov = v; });
    bindRange('rngRadius', function(v){ camRadius = v; });
    bindRange('rngScale',  function(v){ modelScale = v; });

    /* 侧栏：物体平移数字框 */
    bindNumber('numTx', function(v){ modelTrans[0] = v; });
    bindNumber('numTy', function(v){ modelTrans[1] = v; });
    bindNumber('numTz', function(v){ modelTrans[2] = v; });
    bindClick(document.getElementById('btnTransZero'), function(){
        modelTrans = vec3(0,0,0); syncUI(); render();
    });

    /* 侧栏：显示开关 */
    bindCheck('chkGrid',   function(v){ showGrid = v; });
    bindCheck('chkAxes',   function(v){ showAxes = v; });
    bindCheck('chkLabels', function(v){ showLabels = v; });
    bindCheck('chkGizmo',  function(v){ showGizmo = v; });
}

function bindRange(id, setter){
    var el = document.getElementById(id);
    el.addEventListener('input', function(){
        var v = parseFloat(el.value);
        if (!isNaN(v)) setter(v);
        clampCamera();
        syncUI();
        render();
    });
}

function bindNumber(id, setter){
    var el = document.getElementById(id);
    el.addEventListener('input', function(){
        var v = parseFloat(el.value);
        if (!isNaN(v)) { setter(v); syncUI(); render(); }
    });
}

function bindCheck(id, setter){
    var el = document.getElementById(id);
    el.addEventListener('change', function(){
        setter(el.checked);
        syncUI();
        render();
    });
}

/* 视图预设：切换到指定的固定 (θ, φ) 观察方向 */
function setView(name){
    var preset = VIEW_PRESETS[name];
    if (!preset) return;
    theta = preset.theta;
    phi = preset.phi;
    clampCamera();
    syncUI();
    render();
}

/* 判断当前 (θ, φ) 落在哪个预设上（用于高亮工具栏按钮），角度按环绕比较 */
function activeViewPreset(){
    for (var name in VIEW_PRESETS) {
        var p = VIEW_PRESETS[name];
        if (Math.abs(((theta - p.theta + 540) % 360) - 180) < 0.5 &&
            Math.abs(phi - p.phi) < 0.5) {
            return name;
        }
    }
    return null;
}

/* 把全局参数写回界面控件与状态栏（每帧调用，保证键鼠操作与面板始终一致） */
function syncUI(){
    document.getElementById('stProjection').textContent = isOrth ? '正交' : '透视';
    document.getElementById('btnProjLabel').textContent = isOrth ? '投影：正交' : '投影：透视';

    document.getElementById('stTheta').textContent  = theta.toFixed(0) + '°';
    document.getElementById('stPhi').textContent    = phi.toFixed(1) + '°';
    document.getElementById('stFov').textContent    = fov.toFixed(0) + '°';
    document.getElementById('stRadius').textContent = camRadius.toFixed(1);

    document.getElementById('valTheta').textContent  = theta.toFixed(0) + '°';
    document.getElementById('valPhi').textContent    = phi.toFixed(1) + '°';
    document.getElementById('valFov').textContent    = fov.toFixed(0) + '°';
    document.getElementById('valRadius').textContent = camRadius.toFixed(1);
    document.getElementById('valScale').textContent  = modelScale.toFixed(2);

    document.getElementById('rngTheta').value  = theta;
    document.getElementById('rngPhi').value    = phi;
    document.getElementById('rngFov').value    = fov;
    document.getElementById('rngRadius').value = camRadius;
    document.getElementById('rngScale').value  = Math.max(0.2, Math.min(3.0, modelScale));

    var modelName = { cube: '方块', sphere: '球', hat: '墨西哥帽' }[currentModel] || currentModel;
    document.getElementById('stModel').textContent = modelName;
    document.getElementById('stTrans').textContent =
        '(' + modelTrans[0].toFixed(1) + ', ' + modelTrans[1].toFixed(1) + ', ' + modelTrans[2].toFixed(1) + ')';
    document.getElementById('stScale').textContent = modelScale.toFixed(2);

    document.getElementById('rotInfo').textContent = rotationInfo();

    /* 同步模型选择（工具栏分段按钮 + 侧栏单选） */
    document.querySelectorAll('#segModel button').forEach(function(btn){
        btn.classList.toggle('active', btn.dataset.model === currentModel);
    });
    document.querySelectorAll('input[name=model]').forEach(function(radio){
        radio.checked = (radio.value === currentModel);
    });

    /* 同步视图预设高亮：当前方向不落在任何预设上时全部取消高亮 */
    var activeName = activeViewPreset();
    document.querySelectorAll('#segView button').forEach(function(btn){
        btn.classList.toggle('active', btn.dataset.view === activeName);
    });
}

/* 由累积旋转矩阵的迹反算旋转角，作为只读信息显示 */
function rotationInfo(){
    var trace = modelRot[0][0] + modelRot[1][1] + modelRot[2][2];
    var c = Math.max(-1.0, Math.min(1.0, (trace - 1.0) / 2.0));
    var angle = Math.acos(c) * 180.0 / Math.PI;
    if (!isFinite(angle) || angle < 0.05) return '未旋转（鼠标左键拖动）';
    return '已旋转 ' + angle.toFixed(1) + '°';
}

/* 把平移数字框写回全局值（复位时使用） */
function updateTransInputs(){
    document.getElementById('numTx').value = modelTrans[0].toFixed(1);
    document.getElementById('numTy').value = modelTrans[1].toFixed(1);
    document.getElementById('numTz').value = modelTrans[2].toFixed(1);
}


/* ==================================================================
 * 轴标签：把世界点经 P·V 投影到屏幕像素，用 HTML 覆盖层呈现（矢量清晰）
 * ================================================================== */
var AXIS_LABEL_LENGTH = 2.0;   // 与 generateAxes() 中的半轴长保持一致
var AXIS_LABEL_GAP    = 0.24;  // 标签相对轴端的额外外移量（避开圆锥箭头的尖端）

function projectToScreen(p){
    /* 先把世界点变换到观察坐标系，判断它是否位于相机前方。
     * 正交投影下 clip.w 恒为 1，仅靠 w 无法识别"相机后方"的点；
     * 而相机距离最小可到 1.5，比轴端 2.16 还近，因此必须显式判断。
     * ViewMatrix 第 3 行即"由 at 指向 eye"的单位向量，故 z_eye < 0 表示点在相机前方。*/
    var eyeZ = ViewMatrix[2][0] * p[0] + ViewMatrix[2][1] * p[1] +
               ViewMatrix[2][2] * p[2] + ViewMatrix[2][3];
    if (eyeZ >= -1e-6) return null;

    var clip = mult(mult(ProjectionMatrix, ViewMatrix), vec4(p[0], p[1], p[2], 1.0));
    if (clip[3] <= 1e-6) return null;             // 透视投影下位于相机后方或退化时不显示
    var ndcX = clip[0] / clip[3];
    var ndcY = clip[1] / clip[3];
    return {
        x: (ndcX * 0.5 + 0.5) * canvas.width,
        y: (1.0 - (ndcY * 0.5 + 0.5)) * canvas.height  // NDC 向上，屏幕像素向下
    };
}

function updateAxisLabels(){
    var labs = [
        { el: document.getElementById('axisLabelX'), p: vec3(AXIS_LABEL_LENGTH + AXIS_LABEL_GAP, 0.0, 0.0) },
        { el: document.getElementById('axisLabelY'), p: vec3(0.0, AXIS_LABEL_LENGTH + AXIS_LABEL_GAP, 0.0) },
        { el: document.getElementById('axisLabelZ'), p: vec3(0.0, 0.0, AXIS_LABEL_LENGTH + AXIS_LABEL_GAP) }
    ];
    for (var i = 0; i < labs.length; i++) {
        var el = labs[i].el;
        if (!showLabels) { el.style.display = 'none'; continue; }
        var s = projectToScreen(labs[i].p);
        if (!s) { el.style.display = 'none'; continue; }
        el.style.display = 'block';
        el.style.left = s.x + 'px';
        el.style.top  = s.y + 'px';
    }
}


/* ==================================================================
 * 附加项：鼠标交互
 *   左键拖动 —— 虚拟跟踪球（物体绕任意轴转动）
 *   右键拖动 —— 旋转相机（改 θ / φ）
 *   滚轮     —— 缩放相机距离（改 camRadius）
 * ================================================================== */
var DRAG_NONE = 0, DRAG_OBJECT = 1, DRAG_CAMERA = 2;
var dragging = DRAG_NONE;      // 当前拖动模式
var trackballLast = null;      // 上一次鼠标位置投影到半球面上的点（vec3）
var cameraDragLast = null;     // 上一次鼠标像素位置（相机旋转用）

function initPointerInteraction(){
    canvas.addEventListener('mousedown', function(e){
        if (e.button === 0) {                    // 左键：旋转物体
            dragging = DRAG_OBJECT;
            trackballLast = trackballPoint(e);
            e.preventDefault();
        } else if (e.button === 2) {             // 右键：旋转相机
            dragging = DRAG_CAMERA;
            cameraDragLast = { x: e.clientX, y: e.clientY };
            e.preventDefault();
        }
    });

    canvas.addEventListener('mousemove', function(e){
        if (dragging === DRAG_OBJECT) {
            rotateObjectByTrackball(e);
        } else if (dragging === DRAG_CAMERA) {
            rotateCameraByDrag(e);
        }
    });

    // 鼠标抬起或移出画布即结束本次拖动
    canvas.addEventListener('mouseup',    endDrag);
    canvas.addEventListener('mouseleave', endDrag);

    // 右键拖动需要屏蔽浏览器右键菜单
    canvas.addEventListener('contextmenu', function(e){ e.preventDefault(); });

    // 滚轮缩放相机距离（passive:false 才允许 preventDefault）
    canvas.addEventListener('wheel', function(e){
        e.preventDefault();
        camRadius = camRadius * (e.deltaY > 0 ? 1.1 : 1.0 / 1.1);
        clampCamera();
        syncUI();
        render();
    }, { passive: false });
}

function endDrag(){
    dragging = DRAG_NONE;
    trackballLast = null;
    cameraDragLast = null;
}

/* 左键拖动：前后两点都投影到单位半球面，绕两点所在平面的叉乘轴转动两点夹角 */
function rotateObjectByTrackball(e){
    var p1 = trackballPoint(e);
    if (trackballLast) {
        var axis = cross(trackballLast, p1);
        var len = length(axis);
        var cosAngle = dot(trackballLast, p1);
        cosAngle = Math.max(-1.0, Math.min(1.0, cosAngle));
        if (len > 1e-6) {   // 位移过小时忽略（此时轴退化，叉乘长度→0）
            var angleDeg = Math.acos(cosAngle) * 180.0 / Math.PI;
            /* 左乘累积：绕"叉乘轴"旋转两点夹角。注意 MVnew.js 中通用的
             * rotate(angle,axis) 构造出的矩阵是标准右手旋转矩阵的转置
             * （即等价于绕该轴反向旋转 angle），若直接传入 +angleDeg，
             * 物体转向会与鼠标拖动方向相反。故此处取 -angleDeg，
             * 使半球面上被按住的点随鼠标移动，符合虚拟跟踪球的直觉。 */
            modelRot = mult(rotate(-angleDeg, axis), modelRot);
            render();
        }
    }
    trackballLast = p1;
}

/* 右键拖动：横向改方位角 θ、纵向改仰角 φ（每像素 0.3°） */
function rotateCameraByDrag(e){
    if (!cameraDragLast) return;
    var dx = e.clientX - cameraDragLast.x;
    var dy = e.clientY - cameraDragLast.y;
    cameraDragLast = { x: e.clientX, y: e.clientY };
    theta -= dx * 0.3;   // 向右拖动=相机绕 Y 轴左移，画面中的场景随之向右转
    phi   += dy * 0.3;   // 向下拖动=相机降低，观察方向趋于仰视
    clampCamera();
    syncUI();
    render();
}

/* 把画布内的鼠标位置先转换为 [-1,1]×[-1,1] 的方形坐标，
 * 再投影到单位半球面 z = sqrt(1 - x^2 - y^2)；
 * 落在单位圆外的点沿半径方向拉回圆周（z = 0），避免根号内出现负值。 */
function trackballPoint(e){
    var rect = canvas.getBoundingClientRect();
    // 像素坐标 -> [-1,1] 坐标（y 轴翻转：屏幕向下为y正，而模型方向向上为y正）
    var nx = 2.0 * (e.clientX - rect.left) / rect.width  - 1.0;
    var ny = 1.0 - 2.0 * (e.clientY - rect.top) / rect.height;
    var d = nx * nx + ny * ny;
    if (d > 1.0) {
        var s = 1.0 / Math.sqrt(d);
        return vec3(nx * s, ny * s, 0.0);
    }
    return vec3(nx, ny, Math.sqrt(1.0 - d));
}
