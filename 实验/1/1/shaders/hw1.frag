#version 300 es

precision highp float;
uniform vec4 randomColor;
out vec4 FragColor;

void
main()
{
    FragColor = randomColor;
}
