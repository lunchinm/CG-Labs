"use strict";

var canvas;
var gl;
var program;

var points = []; //保存“点，线，面”基本图元所需要的顶点属性数据，每个顶点是矢量数据
var bufferId;  //顶点属性缓冲区，用于传递数据给GPU

//将要绘制的矩形的四个顶点的初始NDC坐标
var vertices = [
	vec2( -0.2, -0.2 ),
	vec2( -0.2,  0.2 ),
	vec2(  0.2, 0.2),
	vec2(  0.2,  -0.2)
];

//初始化绘制的矩形中心的NDC坐标，填充的随机色
var centerX=0.0; 
var centerY=0.0; 
var colorRandom=vec4(1.0,0.0,0.0,1.0);

//鼠标点击画布时，图形的中心发生变化时，设置此标志便于重新传递中心（centerX，centerY）
var centerChageFlag=false;  

//初始化函数init，相当于JS中执行的开始的地方，相当于main()
window.onload = function init()
{
	//加载webGL到画布对象中
	canvas = document.getElementById("gl-canvas");
    gl = canvas.getContext('webgl2');
    if (!gl) alert( "WebGL 2.0 isn't available" );

    //加载顶点着色器和片元着色器
    program = initShaders(gl, "shaders/hw1.vert", "shaders/hw1.frag");
    gl.useProgram(program);

    //初始化：“画布Canvas”的大小
    canvas.width = window.innerWidth; //document.body.clientWidth;   
    canvas.height = window.innerHeight; //document.body.clientHeight;	

    //初始化："视口viewport"在“画布canvas”中的位置和大小，一般和画布等大小。
    gl.viewport( 0, 0, canvas.width, canvas.height );

	//初始化：设置背景色，即设置画布canvas的默认填充颜色
    gl.clearColor( 0.5, 0.5, 0.5, 1.0 );

	

    // 调用retangle（）根据vertices数组的四个顶点，生成三角形顶点数组points
    //triangle(vertices[0], vertices[1], vertices[2]);
	retangle(vertices[0], vertices[1], vertices[2],vertices[3]); 


	/*******************************************************************************
	*   TODO1: ---将顶点属性缓冲对象数据VBO 传给vertex shader,补全下面//后的代码
	*******************************************************************************/
	/*创建顶点缓冲区bufferId；让gl绑定该缓冲区*/
    //bufferId = ;
    //gl.bindBuffer( ，);	
	
	/*将points中的矢量顶点数据扁平化化放入缓存（用./Common/MVnew.js中的flattern()转换为浮点数)*/
	//gl.bufferData( );

	/*将缓冲区的顶点属性数据和program的shader中的属性变量aPosition进行关联*/
    /* gl.vertexAttribPointer(index, size, type, normalized, stride, pointer)*/
    //let vPosition=  ;
    //gl.vertexAttribPointer(  );
    //gl.enableVertexAttribArray(  );
	
	//--将全局变量传给向相应的shader--
	gl.uniform1f(gl.getUniformLocation( program, "centerX" ), centerX);
	gl.uniform1f(gl.getUniformLocation( program, "centerY" ), centerY);
	gl.uniform4fv(gl.getUniformLocation( program, "randomColor" ),colorRandom);	
	

	//窗口加载时，以NDC坐标（0，0）为中心绘制矩形
	render();
};

function triangle( a, b, c )
{
    points.push( a, b, c );	
};

function retangle(a,b,c,d)
{
	triangle(a,b,c);
	triangle(a,c,d);
}


//当窗口发生变化时，画布大小随着改变，并且视口viewport也随之改变，且重新绘制场景
window.onresize = function() {
	canvas.width=window.innerWidth;
	canvas.height=window.innerHeight;
	gl.viewport(0, 0, canvas.width, canvas.height);
	//如果想快速调试看变量值，可采用下面两种方式
	//alert("canvas.width="+canvas.width+" canvas.height="+canvas.height);
	//console.log("canvas.width="+canvas.width+" canvas.height="+canvas.height);
	render();
 };


document.addEventListener('DOMContentLoaded', function() {
		//需要获取文档中的canvas对象后，才能为其添加事件监听程序
	    canvas = document.getElementById('gl-canvas');
		
		/*******************************************************************************
		*   TODO2: 为画布canvas添加鼠标mousedown事件，
		*          获得屏幕点击位置的屏幕像素坐标，将其转换为将要绘制的图形的新中心NDC坐标	 
		*          传递新中心，并重新绘制。补全下面//注释掉的代码
		*******************************************************************************/
		canvas.addEventListener("mousedown", function(event){
			//获取画布点击位置，返回画布像素整数坐标
			let rect = event.target.getBoundingClientRect();
			//let x =
			//let y =
			
			// 将画布屏幕坐标转换为NDC坐标
			//let ndcX =
			//let ndcY =
			
			//交互绘制图形中心发生变化，设置标志为true 且重新绘制render()
			//centerChageFlag=
			//centerX=
			//centerY=
			//render();

		});

});
 
function render()
{
	//清屏，即用前面gl.clearColor()设置的背景色进行填充
    gl.clear(gl.COLOR_BUFFER_BIT);	

	/******************************************************************
	TODO3: 如果有鼠标点击事件发生，即若centerchageflag=true
	      需要传递uniform变量新值给着色器，变量是：centerX, centerY,colorRandom
		  并且处理完后，将标志设置为false。自己补全if语句中应有的代码。
	******************************************************************/
	if(centerChageFlag)
	{
		//自己填写相应的代码
    };


	//调用gl的三角形图元绘制函数进行图形的绘制，（直接取顶点缓存中的顶点数据）
	gl.drawArrays(gl.TRIANGLES, 0, points.length );	

}


  
