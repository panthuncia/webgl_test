#version 300 es
precision mediump float;
in vec3 a_position;
//attribute vec2 a_texCoord;

uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;

//varying vec3 v_fragPos;
//varying vec3 v_texCoord;

void main() {
    // Transform the position into view space
    vec3 v_fragPos = vec3(u_modelViewMatrix * vec4(a_position, 1.0));

    //pass texcoord to fs
    //v_texCoord = a_texCoord;

    // Set the position
    gl_Position = u_projectionMatrix * vec4(v_fragPos, 1.0);
}