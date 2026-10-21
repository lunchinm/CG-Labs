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

var modelScale = 1.0;          // 物体整体缩放因子（Z/C 键、滚轮、侧栏滑块）
var modelRot = mat4();         // 累积旋转变换矩阵（鼠标左键拖动虚拟跟踪球）M = T·R·S 中的 R
var modelTrans = vec3(0,0,0);  // 累积平移向量（方向键、侧栏数字框、左键平移模式）M = T·R·S 中的 T

var theta = 45.0;              // 相机方位角 θ（绕 Y 轴，单位：度）
var phi = 54.7356;             // 相机仰角 φ（相对 +Y 轴，单位：度）
var camRadius = 15.5;          // 相机到原点的距离（Ctrl+滚轮 / 侧栏滑块调节）
var isOrth = true;             // 投影方式：true=正交，false=透视
var fov = 60.0;                // 透视投影视野角（度）

/* 相机的 up 向量。
 *   null      —— 由 (θ, φ) 的球面公式解析给出，此时画面不滚转、地平线水平；
 *   [x,y,z]   —— W/S、A/D 做"严格绕世界轴"的刚性旋转时，eye 与 up 一起被旋转，
 *                旋转后的 up 一般不再等于球面公式的结果（这正是画面发生滚转的原因），
 *                故用这个向量覆盖，直到用户重新设定 (θ, φ)（滑块、预设、右键拖动、复位）。 */
var camUp = null;

var MODEL_SCALE_MIN = 0.2;     // 物体缩放下限
var MODEL_SCALE_MAX = 10.0;    // 物体缩放上限（Z/C、滚轮、侧栏滑块共用）

var leftDragMode = 'rotate';   // 鼠标左键功能：'rotate'=旋转物体 / 'translate'=平移物体（中键切换）

var showAxes = true;           // 显示：坐标轴
var showLabels = true;         // 显示：角落 gizmo 内的 X/Y/Z 标识
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
// 默认相机距离与默认 fov 满足 r·tan(fov/2) = 15.5·tan30° ≈ 8.95 = 正交 halfV，
// 因此默认状态下正交与透视覆盖同样的世界高度，切换投影时画面尺度不跳变
var DEFAULT_THETA = 45.0,
    DEFAULT_PHI = 54.7356,
    DEFAULT_RADIUS = 15.5,
    DEFAULT_FOV = 60.0;

/* 正交投影的竖向半高：它决定"画面里能看见多大的世界范围"。
 * 必须以相机参数动态给出，否则平行投影下"沿视线方向平移观察者不改变成像"，
 * Ctrl+滚轮推拉相机距离、相机距离滑块与视野角滑块在正交模式下就全都看不出变化。
 * 取
 *     halfV = camRadius · tan(fov/2)
 * 即正交视见体在"过原点的对焦平面"上覆盖的世界高度与透视投影完全一致：
 *   1) 推拉相机距离 = 正交下缩放画面（滚轮推拉的常见观感）；
 *   2) 调视野角 = 正交下同样缩放画面；
 *   3) 正交 ⇄ 透视切换时画面尺度不跳变。
 * 默认 15.5·tan30° ≈ 8.95：坐标轴半轴长 18.0 约为其 2 倍，
 * 轴端伸出画布，成为贯穿全屏的空间参照。 */
function orthoHalfV(){
    var h = camRadius * Math.tan(radians(fov * 0.5));
    return Math.max(0.3, Math.min(200.0, h));   // 防止 fov 取到 5/170 时退化
}

// 视图预设（前/后/左/右/上/下/等轴测）
// 等轴测取 θ=45°、φ=arctan(√2)=54.7356°，视线方向恒为 (0.5774,0.5774,0.5774)
//（r=DEFAULT_RADIUS=15.5 时 eye=(8.95,8.95,8.95)），
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
    gl = canvas.getContext('webgl2', { antialias: true });  // 显式开启多重采样抗锯齿，坐标轴线与模型轮廓更平滑
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
     * 深度函数取 LEQUAL：坐标轴与物体深度相等时后绘制者胜出，
     * 且能避免同一平面上的共面几何出现 z-fighting。 */
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    /* 开启混合，使顶点色携带的 alpha 生效
     * （当前各顶点色 alpha 均为 1.0，保留该设置以便后续扩展半透明效果）。 */
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // 设置canvas画布背景色（与 #viewport-container 的 #eef1f5 一致）
    gl.clearColor(0.933, 0.945, 0.961, 1.0);

    //初始化交互界面上的相关参数
    initViewingParameters();

    // 绑定侧栏/工具栏控件与鼠标交互
    initUI();
    initPointerInteraction();

    // 构建场景：坐标轴 → 角落 gizmo → 物体（顺序固定）
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
            modelScale = Math.min(MODEL_SCALE_MAX, modelScale * 1.1);
            break;
        case 67:    // C-物体整体缩小
            modelScale = Math.max(MODEL_SCALE_MIN, modelScale * 0.9);
            break;

        /* ===== W/S/A/D：按住持续平滑旋转相机 =====
         * 旧实现每收到一次按键事件就整步跳 5°，受操作系统"先延迟后定频重复"的
         * 影响，画面必然一顿一顿。现在 keydown 只负责"置位 + 启动动画循环"，
         * 真正的角度累加交给 camAnimFrame() 按真实时间步长连续完成。 */
        case 87:    // W-相机严格绕世界 X 轴旋转（抬升）
            cameraKey.w = true; startCameraAnim();
            break;
        case 83:    // S-相机严格绕世界 X 轴旋转（降低）
            cameraKey.s = true; startCameraAnim();
            break;
        case 65:    // A-相机绕世界 Y 轴顺时针旋转（θ 减小）
            cameraKey.a = true; startCameraAnim();
            break;
        case 68:    // D-相机绕世界 Y 轴逆时针旋转（θ 增大）
            cameraKey.d = true; startCameraAnim();
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

/* 松开 W/S/A/D 时仅清掉对应标志位，动画循环会在下一帧发现"无键按下"后自行结束 */
window.onkeyup = function(e){
    switch (e.keyCode) {
        case 87: cameraKey.w = false; break;
        case 83: cameraKey.s = false; break;
        case 65: cameraKey.a = false; break;
        case 68: cameraKey.d = false; break;
    }
};

/* 窗口失焦（Alt+Tab、切到别的应用）时按键的 keyup 可能收不到，
 * 必须主动清空标志位，否则相机释放后仍会一直转下去 */
window.onblur = function(){
    cameraKey.w = cameraKey.s = cameraKey.a = cameraKey.d = false;
};

/* ==================================================================
 * 相机键盘旋转的平滑动画
 * 采用 requestAnimationFrame + 真实时间步长驱动，角速度恒定（90°/秒）：
 *  - 轻点一下（约 50~100ms）大约转过 5°~9°，与旧的离散步进手感接近；
 *  - 按住则连续匀速旋转，彻底消除"一顿一顿"的跳变。
 * ================================================================== */
var CAMERA_ROT_SPEED = 90.0;                      // 连续旋转角速度（度/秒）
var cameraKey = { w:false, s:false, a:false, d:false };
var camAnimRunning = false, camAnimLast = 0;

function startCameraAnim(){
    if (camAnimRunning) return;                   // 循环已在跑时无需重复启动
    camAnimRunning = true;
    camAnimLast = performance.now();
    requestAnimationFrame(camAnimFrame);
}

function camAnimFrame(now){
    // 单帧步长上限 50ms：避免切回标签页、长时间卡顿后"补帧"造成角度突跳
    var dt = Math.min(0.05, Math.max(0.0, (now - camAnimLast) / 1000));
    camAnimLast = now;
    var step = CAMERA_ROT_SPEED * dt;             // 本帧应转过的角度

    if (cameraKey.w) rotateCameraAboutWorldX(-step);   // W 绕世界 X 轴正向抬升相机
    if (cameraKey.s) rotateCameraAboutWorldX( step);   // S 反向
    if (cameraKey.a) rotateCameraAboutWorldY(-step);   // A 绕世界 Y 轴旋转
    if (cameraKey.d) rotateCameraAboutWorldY( step);   // D 反向

    clampCamera();
    syncUI();
    render();

    if (cameraKey.w || cameraKey.s || cameraKey.a || cameraKey.d) {
        requestAnimationFrame(camAnimFrame);
    } else {
        camAnimRunning = false;                   // 全部松开后循环自然结束
    }
}

/* 说明：W/S 采用"严格绕世界 X 轴"的刚性旋转——把 eye 与 up 一起用 R_x(±Δ) 旋转。
 * 关键点是 up 必须同步旋转：如果只把视线方向绕世界 X 轴转、而让 up 仍由球面公式
 * 按新的 (θ, φ) 重新生成，两者就不自洽，等效转动轴会漂移成一根斜轴
 * （等轴视角下实测约 [−0.61, 0.54, 0.59]），观感即"类似地球自转"，这是本程序
 * 早期版本的问题。现在 up 与 eye 作为刚体同步旋转，转动轴严格等于世界 X 轴。
 * 代价是画面会产生滚转（世界 X 轴在屏幕上保持不动、其余景物绕它倾斜），
 * 这是"绕世界 X 轴旋转相机"必然的几何结果；"地平线恒水平"只在 θ=0°/180°
 * （前/后视图，视线位于 YZ 平面内）时才与它重合。
 * 一旦用户改用滑块、视图预设或右键拖动重新给定 (θ, φ)，camUp 即被清空、回到无滚转姿态。 */

/* 把相机极坐标参数限制在合法范围内（θ 环绕到 [-180,180)，φ 截断到 [0,180]） */
function clampCamera(){
    theta = ((theta + 180) % 360 + 360) % 360 - 180;
    phi = Math.max(0.0, Math.min(180.0, phi));
    camRadius = Math.max(2.0, Math.min(40.0, camRadius));
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

    /* ---------- pass2：三色坐标轴（不写深度，被物体正确遮挡）---------- */
    gl.uniform1i( u_Flag, 0 );   // 标志位=0，只用 P·V 绘制，不做模型变换
    gl.depthMask( false );

    if (showAxes) {
        // 轴段内先线段后三角形（圆锥箭头），两种图元必须分两次调用
        gl.drawArrays( gl.LINES, 0, axisLineCount );
        gl.drawArrays( gl.TRIANGLES, axisLineCount, axisVertexCount - axisLineCount );
    }
    gl.depthMask( true );

    /* ---------- pass3：角落朝向 gizmo（独立小视口 + 独立相机）---------- */
    var gizmoStart = axisVertexCount;
    if (showGizmo) {
        drawGizmo( gizmoStart );
        // 小视口绘制完毕后恢复主视图的三个变换矩阵与 viewport
        gl.viewport( 0, 0, canvas.width, canvas.height );
        gl.uniformMatrix4fv( u_ModelMatrix, false, flatten(ModelMatrix) );
        gl.uniformMatrix4fv( u_ViewMatrix, false, flatten(ViewMatrix) );
        gl.uniformMatrix4fv( u_ProjectionMatrix, false, flatten(ProjectionMatrix) );
        gl.uniform1i( u_Flag, 1 );
    }

    // 每帧把参数写回界面与状态栏，并更新角落 gizmo 的 X/Y/Z 标识位置
    syncUI();
    updateGizmoLabels();
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
    resetCamUp();               // up 回到球面基准（清掉 W/S 留下的滚转）
    camRadius = DEFAULT_RADIUS;
    isOrth = true;
    fov = DEFAULT_FOV;
    leftDragMode = 'rotate';    // 左键功能一并回到"旋转物体"

    cameraKey.w = cameraKey.s = cameraKey.a = cameraKey.d = false;   // 停掉按键连续旋转

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
* 构建场景顶点数据：固定按"坐标轴 → 角落 gizmo → 物体"的顺序，
* 段计数（axisVertexCount / gizmoVertexCount）由生成函数填写，
* 物体段的起始下标与顶点数在此处记录，供 render() 分段绘制使用。
******************************************************************/
function buildScene(model){
    points = [];
    colors = [];

    generateAxes();    // 三色坐标轴 + 圆锥箭头（段计数：axisVertexCount/axisLineCount）
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

/* 由球面极坐标求"由原点指向观察者"的单位方向向量：
 * θ 为绕 Y 轴的方位角、φ 为相对 +Y 轴的仰角 */
function eyeDirection(th, ph){
    return vec3(Math.sin(radians(ph)) * Math.sin(radians(th)),
                Math.cos(radians(ph)),
                Math.sin(radians(ph)) * Math.cos(radians(th)));
}

/* 由球面极坐标求观察者位置 */
function eyePosition(radius){
    var d = eyeDirection(theta, phi);
    return vec3(radius * d[0], radius * d[1], radius * d[2]);
}

/* 由球面极坐标求"与视线方向恒正交"的 up 向量（无滚转基准）：
 * 取球坐标框架中"仰角增大方向"的反向单位向量，
 * 该向量恒为单位向量且恒垂直于 eye（点积恒为 0），
 * 因此在 φ = 0/180（视线沿 Y 轴）时也不会与观察方向共线退化。
 */
function sphericalUp(){
    return vec3(-Math.cos(radians(phi)) * Math.sin(radians(theta)),
                 Math.sin(radians(phi)),
                -Math.cos(radians(phi)) * Math.cos(radians(theta)));
}

/* 实际用于 lookAt 的 up：有刚性旋转残留时用 camUp，否则用球面公式 */
function upVector(){
    if (camUp) return vec3(camUp[0], camUp[1], camUp[2]);
    return sphericalUp();
}

/* 重新由 (θ, φ) 定义相机姿态：清掉滚转，up 回到球面基准。
 * 所有"直接设定 θ / φ"的入口（滑块、视图预设、右键拖拽、复位）都要调用它。 */
function resetCamUp(){
    camUp = null;
}

/* 把 (θ, φ) 反算回角度：φ 由 +Y 分量决定，θ 由 x/z 决定（与 eyeDirection() 互逆） */
function setFromEyeDir(d){
    var y = Math.max(-1.0, Math.min(1.0, d[1]));
    phi   = Math.acos(y) * 180.0 / Math.PI;
    theta = Math.atan2(d[0], d[2]) * 180.0 / Math.PI;
}

/* 严格绕世界 X 轴旋转相机（W/S）：eye 与 up 作为刚体一起转，
 * 两者的夹角恒为 90°，因此不会出现 up 与视线共线的退化。
 * 注意：这样做画面会产生滚转——世界 X 轴本身是转轴，在屏幕上保持不动，
 * 其余景物绕它倾斜；这正是"相机绕世界 X 轴旋转"的几何结果。 */
function rotateCameraAboutWorldX(deg){
    var c = Math.cos(radians(deg)), s = Math.sin(radians(deg));
    var e = eyeDirection(theta, phi), u = upVector();
    var e2 = vec3(e[0], e[1] * c - e[2] * s, e[1] * s + e[2] * c);
    var u2 = vec3(u[0], u[1] * c - u[2] * s, u[1] * s + u[2] * c);
    setFromEyeDir(e2);
    camUp = u2;
}

/* 严格绕世界 Y 轴旋转相机（A/D），做法同上；此时不产生滚转，
 * 结果与"只改 θ"完全等价，保留下来的意义是与 W/S 共用同一套刚性旋转逻辑。 */
function rotateCameraAboutWorldY(deg){
    var c = Math.cos(radians(deg)), s = Math.sin(radians(deg));
    var e = eyeDirection(theta, phi), u = upVector();
    var e2 = vec3(e[0] * c + e[2] * s, e[1], -e[0] * s + e[2] * c);
    var u2 = vec3(u[0] * c + u[2] * s, u[1], -u[0] * s + u[2] * c);
    setFromEyeDir(e2);
    camUp = u2;
}

function formViewMatrix(){
//===================TODO3：生成物体的视点变换矩阵V=======================
/***提示1：观察者（eye）的位置计算***************************************
*观察者（eye）的位置是在绕X和Y轴转动，可以认为是在球面运动，可使用极坐标参数化表示。
*极坐标参数半径 radius 由全局量 camRadius 给出（Ctrl+滚轮/侧栏滑块可调，范围 2~40），
*因为物体坐标范围约 [-1,1]，radius 需作为视距把物体纳入视见体。
*极坐标参数theta和phi是交互界面中控制，
*三角函数需要用到Math库，MVnew.js提供的函数radians将三角函数中的角度值转换为弧度值。
************************************************************************/
/***提示2：UP向量的计算**********************************
*通常UP=(0,1,0),但是当相机视线方向n和UP共线时会有问题!
*解决方法：找垂直于观察方向n的某线段作为up向量
*********************************************************/
    /* eye 的球面参数化：
     *   eye = r*( sin(phi)*sin(theta), cos(phi), sin(phi)*cos(theta) )
     * 默认 theta=45°、phi=54.7356° 时为等轴测视角（正象限上方斜看原点）；
     * 只改变 θ 时 eye 在 XZ 平面内转动，即相机绕世界 Y 轴旋转，对应 A/D；
     * W/S 不在这里"只改 φ"，而是在 camAnimFrame() 里用 rotateCameraAboutWorldX()
     * 把 eye 与 up 作为刚体一起绕世界 X 轴旋转（因此转动轴严格是世界 X 轴，
     * 画面会产生相应的滚转）；up 取 upVector()，刚性旋转后由 camUp 覆盖。
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
     * 物体顶点离原点最远约 10（球半径 1.0 再乘最大缩放 10.0），相机在半径 camRadius 的球面上，
     * at 为原点，故透视投影下物体位于观察坐标系 -Z 方向约 camRadius-10 ~ camRadius+10 处，
     * near 取 0.5、far 取 200 可把所有取值（camRadius 范围 2~40）都包含进来；
     * 只有"物体放大到接近上限、同时把相机推到最近 2"时物体会穿过近平面，这属于透视下的正常裁剪。
     * 正交投影竖向视野为 ±orthoHalfV()（= camRadius·tan(fov/2)，随相机距离与视野角变化，
     * 使两个相机滑块与 Ctrl+滚轮在正交下同样有效），横向随纵横比 aspect = 画布宽/高 变化；
     * 平行投影下"沿视线方向平移观察者并不改变成像"，因此 near/far 只需保证物体不被裁掉：
     * 取 near = -200 / far = 200（视见体在观察者前后各伸出 200），
     * 这样即使相机距离调到最小值也不会出现近平面切掉物体的缺角。 */
    const near = 0.5;
    const far  = 200.0;
    const halfDepth = 200.0;   // 正交：视见体沿视线方向向观察者前后各伸出的深度

    // 由 isOrth 标志位切换正投影/透视投影
    if (isOrth) {
        var halfV = orthoHalfV();
        return ortho(-halfV * aspect, halfV * aspect,
                     -halfV, halfV,
                     -halfDepth, halfDepth);
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
    bindRange('rngTheta',  function(v){ theta = v; resetCamUp(); });
    bindRange('rngPhi',    function(v){ phi = v;   resetCamUp(); });
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
    resetCamUp();               // 预设是"无滚转"的标准视角
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

    document.getElementById('valTheta').textContent  = theta.toFixed(0) + '°';
    document.getElementById('valPhi').textContent    = phi.toFixed(1) + '°';
    document.getElementById('valFov').textContent    = fov.toFixed(0) + '°';
    document.getElementById('valRadius').textContent = camRadius.toFixed(1);
    document.getElementById('valScale').textContent  = modelScale.toFixed(2);

    document.getElementById('rngTheta').value  = theta;
    document.getElementById('rngPhi').value    = phi;
    document.getElementById('rngFov').value    = fov;
    document.getElementById('rngRadius').value = camRadius;
    document.getElementById('rngScale').value  = Math.max(MODEL_SCALE_MIN, Math.min(MODEL_SCALE_MAX, modelScale));

    var modelName = { cube: '方块', sphere: '球', hat: '墨西哥帽' }[currentModel] || currentModel;
    document.getElementById('stModel').textContent = modelName;
    document.getElementById('stTrans').textContent =
        '(' + modelTrans[0].toFixed(1) + ', ' + modelTrans[1].toFixed(1) + ', ' + modelTrans[2].toFixed(1) + ')';

    /* 左键功能（中键切换）：视口徽标 + 状态栏两处同步 */
    var isRotateMode = (leftDragMode === 'rotate');
    document.getElementById('stLeftMode').textContent = isRotateMode ? '旋转' : '平移';
    document.getElementById('modeBadge').textContent =
        isRotateMode ? '左键：旋转物体（中键切换）' : '左键：平移物体（中键切换）';
    document.getElementById('modeBadge').classList.toggle('is-translate', !isRotateMode);

    document.getElementById('rotInfo').textContent = rotationInfo();

    /* 平移数字框跟随 modelTrans 实时回显（左键平移、方向键、归零都会经过这里）。
     * 必须放在 syncUI() 里而不是只在初始化时写一次，否则拖动平移时
     * 侧栏数字框会一直停在旧值，看起来像"平移量没有变化"。 */
    updateTransInputs();

    /* 同步模型选择（工具栏分段按钮） */
    document.querySelectorAll('#segModel button').forEach(function(btn){
        btn.classList.toggle('active', btn.dataset.model === currentModel);
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

/* 把平移数字框写回全局值（syncUI() 每帧调用，复位时同样经过这里）。
 * 正在该输入框里手动输入时不回写，否则写到一半的 "1." "-" 之类会被格式化打断。 */
function updateTransInputs(){
    var ids = ['numTx', 'numTy', 'numTz'];
    for (var i = 0; i < 3; i++) {
        var el = document.getElementById(ids[i]);
        if (document.activeElement === el) continue;
        el.value = modelTrans[i].toFixed(1);
    }
}


/* ==================================================================
 * 角落 gizmo 的 X/Y/Z 标识
 * 主视口的坐标轴已放大到半轴长 18.0（轴端落在画面之外），因此不再在主画面
 * 标注 X/Y/Z，而是把标识放进右上角 gizmo 的小方框里：与 gizmo 本身共用
 * "只随相机旋转、不平移"的视图矩阵和同一套正交投影，逐帧把三条轴的端点
 * 投影成框内像素坐标。
 * ================================================================== */
var GIZMO_ORTHO_HALF = 0.72;   // 与 drawGizmo() 中 ortho(±0.72) 保持一致
var GIZMO_BOX        = 96;     // 小视口边长（px），与 CSS 的 #gizFrame 同尺寸
var GIZMO_BORDER     = 1;      // #gizFrame 的边框宽：绝对定位的子元素从内边距盒起算
var GIZMO_LABEL_L    = 0.70;   // 标识所在的世界半径：略超出 gizmo 轴端 0.6
var GIZMO_LABEL_PAD  = 8;      // 标识中心到框边的安全留白（px）

function updateGizmoLabels(){
    var labs = [
        { el: document.getElementById('gizLabelX'), p: vec3(GIZMO_LABEL_L, 0.0, 0.0) },
        { el: document.getElementById('gizLabelY'), p: vec3(0.0, GIZMO_LABEL_L, 0.0) },
        { el: document.getElementById('gizLabelZ'), p: vec3(0.0, 0.0, GIZMO_LABEL_L) }
    ];
    var show = showGizmo && showLabels;   // gizmo 关掉时框内没有轴线，标识一并隐藏
    var PV = mult(
        ortho(-GIZMO_ORTHO_HALF, GIZMO_ORTHO_HALF, -GIZMO_ORTHO_HALF, GIZMO_ORTHO_HALF, 0.1, 10.0),
        formGizmoViewMatrix());

    for (var i = 0; i < labs.length; i++) {
        var el = labs[i].el;
        if (!show) { el.style.display = 'none'; continue; }

        var q = labs[i].p;
        var clip = mult(PV, vec4(q[0], q[1], q[2], 1.0));
        var ndcZ = clip[2] / clip[3];
        // 指向相机背后的轴会被近平面裁掉，其标识也随之隐藏（与 WebGL 的裁剪一致）
        if (clip[3] <= 1e-6 || ndcZ < -1.0 || ndcZ > 1.0) { el.style.display = 'none'; continue; }

        var ndcX = clip[0] / clip[3];
        var ndcY = clip[1] / clip[3];
        // 小视口是 96px，而 #gizFrame 有 1px 边框、子元素从内边距盒起算 94px，
        // 因此先映射到内边距盒再补上边框宽度，标识与 WebGL 画出的轴端严格对齐
        var inner = GIZMO_BOX - 2 * GIZMO_BORDER;
        var px = GIZMO_BORDER + (ndcX * 0.5 + 0.5) * inner;
        var py = GIZMO_BORDER + (1.0 - (ndcY * 0.5 + 0.5)) * inner;  // NDC 向上，屏幕像素向下

        el.style.display = 'block';
        el.style.left = Math.max(GIZMO_LABEL_PAD,
                                 Math.min(GIZMO_BOX - GIZMO_LABEL_PAD, px)) + 'px';
        el.style.top  = Math.max(GIZMO_LABEL_PAD,
                                 Math.min(GIZMO_BOX - GIZMO_LABEL_PAD, py)) + 'px';
    }
}


/* ==================================================================
 * 附加项：鼠标交互
 *   左键拖动 —— 由 leftDragMode 决定：虚拟跟踪球（旋转物体）或屏幕平移（移动物体）
 *   中键按下 —— 切换左键功能（旋转 ⇄ 平移），界面上有徽标与状态栏提示
 *   右键拖动 —— 旋转相机（改 θ / φ）
 *   滚轮     —— 缩放物体（改 modelScale）
 *   Ctrl+滚轮 —— 推拉相机（改 camRadius）
 * ================================================================== */
var DRAG_NONE = 0, DRAG_OBJECT = 1, DRAG_CAMERA = 2, DRAG_TRANSLATE = 3;
var dragging = DRAG_NONE;         // 当前拖动模式

/* 跟踪球改为"绝对映射"所需的状态：按下点 + 按下时的姿态。
 * 每次移动都用 (按下点 → 当前点) 直接算出总旋转量，而不是逐帧累加增量，
 * 因此鼠标拖回按下点时物体必然精确回到按下时的角度。 */
var trackballDown = null;         // 按下时鼠标位置在单位半球面上的点（vec3）
var modelRotDown = null;          // 按下时的累积旋转矩阵（mat4）

var cameraDragLast = null;        // 上一次鼠标像素位置（相机旋转用）

/* 屏幕平移所需的状态：同样采用绝对映射（按下点 + 按下时的平移量） */
var translateDownScreen = null;   // 按下时的鼠标像素位置
var translateDownTrans = null;    // 按下时的累积平移向量（vec3）

function initPointerInteraction(){
    canvas.addEventListener('mousedown', function(e){
        if (e.button === 0) {                    // 左键：按当前模式旋转或移动物体
            e.preventDefault();
            if (leftDragMode === 'rotate') {
                dragging = DRAG_OBJECT;
                trackballDown = trackballPoint(e);
                modelRotDown = modelRot;        // 记下姿态快照（modelRot 只整体赋值，安全引用）
            } else {
                dragging = DRAG_TRANSLATE;
                translateDownScreen = { x: e.clientX, y: e.clientY };
                translateDownTrans = vec3(modelTrans[0], modelTrans[1], modelTrans[2]);
            }
        } else if (e.button === 1) {             // 中键：切换左键功能（旋转 ⇄ 平移）
            e.preventDefault();                  // 阻止中键的自动滚屏 / 粘贴等默认行为
            endDrag();
            leftDragMode = (leftDragMode === 'rotate') ? 'translate' : 'rotate';
            syncUI();
            render();
        } else if (e.button === 2) {             // 右键：旋转相机
            dragging = DRAG_CAMERA;
            cameraDragLast = { x: e.clientX, y: e.clientY };
            e.preventDefault();
        }
    });

    /* 移动与抬起监听在整个窗口上，而不是只挂在 canvas 上：
     * 视口里还叠着左键功能徽标、gizmo 取景框这些 DOM 覆盖层，
     * 光标一旦划过它们，挂在 canvas 上的 mousemove 就收不到事件，拖动会"卡住"、
     * 物体停在半路——这正是"平移有时不跟手"的根源。挂在 window 上还能让
     * 光标拖出视口后继续拖动，与常见三维软件的拖动手感一致。 */
    window.addEventListener('mousemove', function(e){
        if (dragging === DRAG_OBJECT) {
            rotateObjectByTrackball(e);
        } else if (dragging === DRAG_TRANSLATE) {
            translateObjectByDrag(e);
        } else if (dragging === DRAG_CAMERA) {
            rotateCameraByDrag(e);
        }
    });

    // 鼠标抬起即结束本次拖动（抬起事件同样要挂在 window 上，否则在视口外松手不会结束拖动）
    window.addEventListener('mouseup', endDrag);

    // 右键拖动需要屏蔽浏览器右键菜单；中键的 auxclick 也一并屏蔽
    canvas.addEventListener('contextmenu', function(e){ e.preventDefault(); });
    canvas.addEventListener('auxclick',     function(e){ e.preventDefault(); });

    /* 滚轮：默认缩放物体（物体的 M = T·R·S 中的 S），按住 Ctrl 时改为推拉相机距离。
     * 注意两点：
     *   1) 用 Ctrl 而不是 Shift——多数浏览器会把 Shift+滚轮转成"横向滚动"，
     *      此时 deltaY 恒为 0，缩放/推拉都会失效；
     *   2) 浏览器把 Ctrl+滚轮绑成"页面缩放"，必须靠 preventDefault 拦住
     *      （所以监听器要 passive:false），否则整个页面会先被放大。 */
    canvas.addEventListener('wheel', function(e){
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
            camRadius = camRadius * (e.deltaY > 0 ? 1.1 : 1.0 / 1.1);
        } else {
            // 向前滚（deltaY < 0）放大，向后滚缩小；范围与侧栏滑块保持一致
            modelScale = Math.max(MODEL_SCALE_MIN, Math.min(MODEL_SCALE_MAX,
                        modelScale * (e.deltaY > 0 ? 0.9 : 1.1)));
        }
        clampCamera();
        syncUI();
        render();
    }, { passive: false });
}

function endDrag(){
    dragging = DRAG_NONE;
    trackballDown = null;
    modelRotDown = null;
    cameraDragLast = null;
    translateDownScreen = null;
    translateDownTrans = null;
}

/* ==================================================================
 * 虚拟跟踪球（绝对映射）
 * 把"按下点"与"当前点"都投影到单位半球面，绕两点所在平面的叉乘轴转过两点夹角。
 * 关键修正：叉乘轴是在"相机坐标系"里算出来的（球面点由屏幕坐标给出），
 * 必须用视图矩阵的旋转部分把它换算回世界坐标后再喂给 rotate()，
 * 否则只有在接近前视图（视图矩阵旋转部分≈单位阵）时方向才碰巧正确。
 * ================================================================== */
function rotateObjectByTrackball(e){
    if (!trackballDown || !modelRotDown) return;

    var p1 = trackballPoint(e);
    var axisCam = cross(trackballDown, p1);   // 相机坐标系下的旋转轴
    var len = length(axisCam);                // = sin(夹角)

    if (len <= 1e-6) {
        /* 两点几乎重合（含鼠标回到按下点）：旋转轴退化，姿态直接取按下时的快照。
         * 这样"按住→拖出→拖回按下点"必然精确复原，符合跟踪球的直觉。 */
        modelRot = modelRotDown;
        render();
        return;
    }

    var cosAngle = Math.max(-1.0, Math.min(1.0, dot(trackballDown, p1)));
    var angleDeg = Math.acos(cosAngle) * 180.0 / Math.PI;
    var axisWorld = cameraAxisToWorld(scale(1.0 / len, axisCam));   // 单位化并转到世界坐标

    /* 左乘"按下时的姿态快照"：`rotate(-angle, axis)` 中取负号的来源见 MVnew.js——
     * 通用的 rotate(angle,axis) 构造出来的其实是标准右手旋转矩阵的转置
     * （等价于绕该轴反向旋转 angle）；取 -angleDeg 才能让被按住的点跟着鼠标走。 */
    modelRot = mult(rotate(-angleDeg, axisWorld), modelRotDown);
    render();
}

/* 把相机坐标系下的向量 a 换算到世界坐标系：
 * 视图矩阵 V 的前三行分别是相机的右/上/后(指向观察者)三轴在世界中的坐标，
 * 因此 世界向量 = a0·row0 + a1·row1 + a2·row2 = Vᵀ·a。 */
function cameraAxisToWorld(a){
    var V = ViewMatrix;
    return vec3(V[0][0] * a[0] + V[1][0] * a[1] + V[2][0] * a[2],
                V[0][1] * a[0] + V[1][1] * a[1] + V[2][1] * a[2],
                V[0][2] * a[0] + V[1][2] * a[1] + V[2][2] * a[2]);
}

/* ==================================================================
 * 左键平移模式（绝对映射）
 * 把鼠标的屏幕位移映射成世界位移：横向沿相机右向量、纵向沿相机上向量（向下为负）。
 * 每像素对应的世界长度由当前投影方式决定：
 *   正交 —— 整个画布高度对应 2·orthoHalfV() 个世界单位，与 formProjectMatrix() 完全一致；
 *   透视 —— 在"过原点的对焦平面"上，画布高度对应 2·tan(fov/2)·camRadius。
 * 两者在默认参数下相等，因此正交/透视下拖动的灵敏度一致。
 * ================================================================== */
function worldPerPixel(){
    if (isOrth) return (2.0 * orthoHalfV()) / canvas.height;
    return (2.0 * Math.tan(radians(fov * 0.5)) * camRadius) / canvas.height;
}

function translateObjectByDrag(e){
    if (!translateDownScreen || !translateDownTrans) return;

    var dx = e.clientX - translateDownScreen.x;
    var dy = e.clientY - translateDownScreen.y;
    var unit = worldPerPixel();
    var V = ViewMatrix;
    var right = vec3(V[0][0], V[0][1], V[0][2]);   // 相机右向量（世界坐标）
    var up    = vec3(V[1][0], V[1][1], V[1][2]);   // 相机上向量（世界坐标）

    modelTrans = vec3(
        translateDownTrans[0] + (right[0] * dx - up[0] * dy) * unit,
        translateDownTrans[1] + (right[1] * dx - up[1] * dy) * unit,
        translateDownTrans[2] + (right[2] * dx - up[2] * dy) * unit
    );

    syncUI();
    render();
}

/* 右键拖动：横向改方位角 θ、纵向改仰角 φ（每像素 0.3°）。
 * 方向统一为"抓取式"：拖动方向 = 物体在屏幕上的移动方向（与左键旋转/平移一致）。
 *   - 向右拖动 → 物体右移：相机绕 Y 轴向左绕行，θ 减小；
 *   - 向下拖动 → 物体下移：相机抬高、视线更俯视，φ（相对 +Y 轴的仰角）减小。
 * φ 的符号务必要与横向一致，否则会出现"横向对、纵向反"的割裂手感。 */
function rotateCameraByDrag(e){
    if (!cameraDragLast) return;
    var dx = e.clientX - cameraDragLast.x;
    var dy = e.clientY - cameraDragLast.y;
    cameraDragLast = { x: e.clientX, y: e.clientY };
    theta -= dx * 0.3;
    phi   -= dy * 0.3;
    resetCamUp();        // 手动给定 (θ, φ) 即回到无滚转姿态
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
