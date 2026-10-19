var canvas;
var gl;
var program;

var vBuffer, cBuffer;//顶点属性数组

// 交互可调参数及根据参数生成的三个变换：M,V,P（全局变量）
// 注意：窗口onload中先调用resize()、而resize()内部会调用render()，
//       此时initViewingParameters()尚未执行，因此这些全局量必须在声明处给定初始值，
//       否则首次render()会因取用未定义变量而报错。
var modelScale = 1.0; //物体整体缩放的因子（附加项：累积缩放，Z/C键控制）
var modelRot = mat4();   //附加项：累积旋转变换矩阵mat4（鼠标拖动"虚拟跟踪球"产生，M = T·R·S 中的R）
var modelTrans = vec3(0,0,0); //附加项：累积平移向量vec3（方向键控制，M = T·R·S 中的T）
var theta = 0; // 视点（眼睛）绕Y轴旋转角度，参极坐标θ值，
var phi = 90; // 视点（眼睛）绕X轴旋转角度，参极坐标φ值，
var isOrth = true; // 投影方式设置参数
var fov = 120; // 透视投影的俯仰角，fov越大视野范围越大
var ModelMatrix; // 模型变换矩阵
var ViewMatrix; // 视图变换矩阵
var ProjectionMatrix; // 投影变换矩阵

// shader里的统一变量在本代码里的标识变量
var u_ModelMatrix, u_ViewMatrix, u_ProjectionMatrix;
var u_Flag;//用来区分绘制坐标还是物体，坐标轴不需要进行M变换

/* ***********窗口加载时调用:程序环境初始化程序****************** */
window.onload = function() {
    canvas = document.getElementById("canvas");
    gl = canvas.getContext('webgl2');
    if ( !gl ) { alert( "WebGL isn't available" ); }
    
    program = initShaders( gl, "shaders/3d-wandering.vert", "shaders/3d-wandering.frag" );
    gl.useProgram( program );
    
	//调整画布大小为正方形以保证图形长宽比例正确,设置视口viewport大小与画布一致
    resize();
	
	// 开启深度缓存，以正确渲染物体被遮挡部分，3D显示必备
    gl.enable(gl.DEPTH_TEST); 
	// 设置canvas画布背景色 -白色-
    gl.clearColor(1.0, 1.0, 1.0, 1.0); 
	
	
    // 初始化数据缓冲区，并关联attribute 着色器变量
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
    u_ModelMatrix = gl.getUniformLocation(program,"u_ModelMatrix");
    u_ViewMatrix = gl.getUniformLocation( program, "u_ViewMatrix" );
    u_ProjectionMatrix = gl.getUniformLocation( program, "u_ProjectionMatrix" );
    u_Flag = gl.getUniformLocation(program, "u_Flag");

	//初始化交互界面上的相关参数
	initViewingParameters();

	// 附加项：注册鼠标拖动"虚拟跟踪球"事件（物体绕任意轴转动）
	initTrackball();
	
    // 生成XYZ坐标轴，调用models-data.js中函数//返回points和colors数组 
    vertextsXYZ(); 	
	// 生成立方体模型数据，调用models-data.js中函数//返回points和colors数组 
    generateCube(); 
	
    // 发送顶点属性数据points和colors给GPU
    SendData(); 	
    // 调用绘制函数进行渲染
    render(); 
}

/* 注册键盘按键事件，修改变换矩阵中的各项参数，并重新进行渲染render */
window.onkeydown = function(e){
    switch (e.keyCode) { 
		case 90:    // Z-模型沿Y轴旋转
            modelScale *=1.1;
            break;
        case 67:    // C-模型沿Y轴反向旋转
            modelScale *= 0.9;
            break;

        case 87:    // W-视点绕X轴顺时针旋转5度
            phi -= 5;
            break;
        case 83:    // S-视点绕X轴逆时针旋转5度
            phi += 5;
            break;
        case 65:    // A-视点绕Y轴顺时针旋转5度
            theta -= 5;
            break;
        case 68:    // D-视点绕Y轴逆时针旋转5度
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
        case 77:    // M-放大俯仰角，给了一个限制范围
            fov = Math.min(fov + 5, 170);
            break;
        case 78:    // N-较小俯仰角
            fov = Math.max(fov - 5, 5);
            break; 			
			
		case 32:    // 空格-复位
            initViewingParameters();
            break;
    }        
    render();//参数变化后需要重新绘制画面
}

/* 绘图界面随窗口交互缩放而相应变化，保持1:1防止图形变形 */
window.onresize = resize;
function resize(){
    var size = Math.min(document.body.clientWidth, document.body.clientHeight);
    canvas.width = size;
    canvas.height = size;
    gl.viewport( 0, 0, canvas.width, canvas.height );
    render();
}


/* ****************************************
*  渲染函数render 
*******************************************/
function render(){    
    // 用背景色清屏；同时清除深度缓存，否则上一帧的深度值残留会导致
    // 旋转/缩放后物体内部的遮挡关系出错（深度测试必需）
    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT );
    
    // 构造观察流程中需要的三各变换矩阵
    ModelMatrix=formModelMatrix();//M:模型变换矩阵
    ViewMatrix=formViewMatrix(); //V:视点变换矩阵
    ProjectionMatrix=formProjectMatrix(); //投影变换矩阵
    
    // 传递变换矩阵    
    gl.uniformMatrix4fv( u_ModelMatrix, false, flatten(ModelMatrix) );     
    gl.uniformMatrix4fv( u_ViewMatrix, false, flatten(ViewMatrix) ); 
    gl.uniformMatrix4fv( u_ProjectionMatrix, false, flatten(ProjectionMatrix) ); 
	
    // 标志位设为0，用顶点数据绘制坐标系
    gl.uniform1i( u_Flag, 0 );
    gl.drawArrays( gl.LINES, 0, 6 ); // 绘制X轴，从0开始，读6个点
    gl.drawArrays( gl.LINES, 6, 6 ); // 绘制y轴，从6开始，读6个点
    gl.drawArrays( gl.LINES, 12, 6 ); // 绘制z轴，从12开始，读6个点        

    // 标志位设为1，用顶点数据绘制 面单色立方体
    gl.uniform1i( u_Flag, 1 );
    gl.drawArrays( gl.TRIANGLES, 18, points.length - 18 ); // 绘制物体,都是三角形网格表面
}


/* ****************************************************
* 初始化或复位：需要将交互参数及变换矩阵设置为初始值
********************************************************/
function initViewingParameters(){
	modelScale=1.0;
	modelRot = mat4();          // 附加项：累积旋转复位为单位矩阵
	modelTrans = vec3(0,0,0);   // 附加项：累积平移复位为零向量
    theta = 0;     
	phi = 90;	
    isOrth = true;     
	fov = 120;
	
	ModelMatrix = mat4(); //单位矩阵
    ViewMatrix = mat4();//单位矩阵
    ProjectionMatrix = mat4();//单位矩阵
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

/********************************************************
* 交互菜单选择不同图形后，需要重新生成顶点数据并渲染
******************************************************/
function modelChange(model){
    points = [];
    colors = [];
    switch(model){
        case 'cube':{
            vertextsXYZ();
            generateCube();
            break;
        }
        case 'sphere':{
            vertextsXYZ();
            generateSphere();
            break;
        }
        case 'hat':{
            vertextsXYZ();
            generateHat();
            break;
        }
    }
    SendData();//重新发送数据
	render();//重新渲染
}


/* ****************************************************
 * 生成观察流水管线中的 M,V,P矩阵  
********************************************************/
function formModelMatrix(){
//===================TODO2：生成中心物体的模型变换矩阵M============================
/* 一般模型变换（课件 lec6 p.52：M = T·R·S）
 * 本程序由三个可交互的累积量合成模型变换矩阵：
 *   modelTrans —— 累积平移（方向键，附加项）
 *   modelRot   —— 累积旋转（鼠标拖动虚拟跟踪球，附加项）
 *   modelScale —— 累积缩放（Z/C 键，基本要求）
 * 顶点以列向量左乘，故复合顺序为 T · R · S（先缩放，再旋转，最后平移）
 */
    var scaleMatrix = scale(modelScale, modelScale, modelScale);        // S
    var modelMatrix = mult(translate(modelTrans[0], modelTrans[1], modelTrans[2]),
                           mult(modelRot, scaleMatrix));                // M = T·R·S
    return modelMatrix;
}

function formViewMatrix(){
//===================TODO3：生成物体的视点变换矩阵V=======================
/***提示1：观察者（eye）的位置计算***************************************
*观察者（eye）的位置是在绕X和Y轴转动，可以认为是在球面运动，可使用极坐标参数化表示。
*极坐标参数半径radius可直接给定,最好大于1，因为物体坐标MC范围默认在[-1,1]之间。
*极坐标参数theta和phi是交互界面中控制，
*三角函数需要用到Math库，MVnew.js提供的函数radians将三角函数中的角度值转换为弧度值。
************************************************************************/
/***提示2：UP向量的计算**********************************
*通常UP=(0,1,0),但是当相机视线方向n和UP共线时会有问题! 
*解决方法：找垂直于观察方向n的某线段作为up向量
*********************************************************/
    var radius = 2.0;
    const at = vec3(0.0,0.0,0.0);

    /* eye 的球面参数化（含默认值校验）：
     * 取 theta 为绕Y轴的方位角、phi 为相对 +Y 轴的仰角，
     *   eye = r*( sin(phi)*sin(theta), cos(phi), sin(phi)*cos(theta) )
     * 默认 theta=0、phi=90 时 eye = (0, 0, r)，与框架占位代码一致；
     * 且只改变 phi 时 eye 在 YZ 平面内转动（相机绕X轴转），
     *    只改变 theta 时 eye 在 XZ 平面内转动（相机绕Y轴转），
     * 正好对应交互说明中 W/S 绕X轴、A/D 绕Y轴。
     */
    var eye = vec3(radius * Math.sin(radians(phi)) * Math.sin(radians(theta)),
                   radius * Math.cos(radians(phi)),
                   radius * Math.sin(radians(phi)) * Math.cos(radians(theta)));

    /* up 向量：取上述球坐标框架中"仰角增大方向"的反向单位向量
     *   up = ( -cos(phi)*sin(theta), sin(phi), -cos(phi)*cos(theta) )
     * 该向量恒为单位向量且恒垂直于 eye（点积恒为0），
     * 因此在 phi = 0/180（视线沿Y轴）时也不会与观察方向共线退化，
     * 无需额外的退化特判。默认 theta=0、phi=90 时 up = (0,1,0)。
     */
    var up = vec3(-Math.cos(radians(phi)) * Math.sin(radians(theta)),
                  Math.sin(radians(phi)),
                  -Math.cos(radians(phi)) * Math.cos(radians(theta)));

    return  lookAt(eye, at, up); //提示：lookAt是/common/MVnew.js中的已经写好的函数
};

function formProjectMatrix(){
   //==========TODO4: 生成投影矩阵=======================
	//提示1：可调用common目录下的MVnew.js里ortho(),perspective()函数
    //ortho正交投影需要的参数有left, right, bottom, ytop, near, far
    //perspective透视投影需要的参数有fov, aspect, near, far， 
	//注意1：fov俯仰角是交互控制变化的参数，是全局变量初始值120
	//注意2：因为参数top是js的保留字，所以这里的参数改名为ytop
	//注意3：设置的视见体参数需要考虑将场景中的景物包含进去。
    /* 视见体参数取值说明：
     * 相机在半径 radius=2 的球面上，at 为原点，故景物在观察坐标系中
     * 沿 -Z 方向距离眼睛约 1~3（near 需小于1、far 需大于3才能包含景物）；
     * 景物建模坐标范围约 [-1,1]，考虑 Z/C 缩放后留有裕量，裁剪窗口取 ±2。
     */
    const near = 0.1;
    const far = 10.0;
	const left = -2.0; 
    const right = 2.0;
    const bottom = -2.0;
    const ytop = 2.0; // 注意：top是js全局变量，所以这里改名为ytop
	
	const aspect = 1.0; //纵横比设置为1（画布为正方形）
	
    // 由 isOrth 标志位切换正投影/透视投影
    if (isOrth) {
        return ortho(left, right, bottom, ytop, near, far);
    } else {
        return perspective(fov, aspect, near, far); // fov 为俯仰角（度），MVnew内部已转为弧度
    }
}


/* ****************************************************
 * 附加项：鼠标拖动虚拟跟踪球（Virtual Trackball）
 * 拖动时物体绕"鼠标划过方向对应的球面切向轴"旋转，
 * 效果上等价于用手拨动一个虚拟球体，实现绕任意轴转动，
 * 并与 Z/C（缩放）、方向键（平移）叠加成累积变换。
********************************************************/
var trackballDragging = false;  // 是否正在拖动
var trackballLast = null;       // 上一次鼠标位置投影到半球面上的点（vec3）

function initTrackball(){
    canvas.addEventListener('mousedown', function(e){
        trackballDragging = true;
        trackballLast = trackballPoint(e);
    });

    canvas.addEventListener('mousemove', function(e){
        if (!trackballDragging) return;
        var p1 = trackballPoint(e);
        if (trackballLast) {
            // 前后两点都投影到单位半球面，绕两点所在平面的叉乘轴转动两点夹角
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
    });

    // 鼠标抬起或移出画布即结束本次拖动
    canvas.addEventListener('mouseup',    function(){ trackballDragging = false; });
    canvas.addEventListener('mouseleave', function(){ trackballDragging = false; });
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
