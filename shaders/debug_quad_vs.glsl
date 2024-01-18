#version 300 es
// vertex_shader.glsl
in vec4 a_position;
in vec2 a_texCoord;

out highp vec2 v_texCoord;
out vec4 outVertexPosition;

void main() {
    v_texCoord = a_texCoord;
    outVertexPosition = a_position;
}