#version 300 es

in vec2 aPosition;

uniform float centerX;
uniform float centerY;

void main()
{
    
	gl_Position.x = aPosition.x + centerX ;
    gl_Position.y = aPosition.y + centerY;
    gl_Position.z = 0.0;
    gl_Position.w = 1.0;

}
