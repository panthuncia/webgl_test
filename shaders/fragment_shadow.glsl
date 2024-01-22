#version 300 es

precision highp float;
layout(location = 0) out float fragmentdepth;

void main() {
    fragmentdepth = gl_FragCoord.z;
}
