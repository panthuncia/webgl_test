#version 100
precision mediump float;
attribute vec3 a_position;
attribute vec3 a_normal;
attribute vec2 a_texCoord;

uniform mat4 u_modelViewMatrix; // Model-View matrix
uniform mat4 u_projectionMatrix; // Projection matrix
uniform mat3 u_normalMatrix; // Normal matrix (for transforming normals)

varying vec3 v_normal;
varying vec3 v_fragPos;
varying vec2 v_texCoord;

void main() {
    // Transform the position
    v_fragPos = vec3(u_modelViewMatrix * vec4(a_position, 1.0));

    // Transform the normal
    v_normal = u_normalMatrix * a_normal;

    //pass texcoord to fs
    v_texCoord = a_texCoord;

    // Set the position
    gl_Position = u_projectionMatrix * vec4(v_fragPos, 1.0);
}