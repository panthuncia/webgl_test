#version 300 es
precision mediump float;

// fragment_shader.glsl
in highp vec2 v_texCoord;

uniform sampler2D u_texture;

out vec4 fragmentColor;

void main() {
    highp float depth = texture(u_texture, v_texCoord).r;
    fragmentColor = vec4(depth, depth, depth, 1.0); // Display shadow map as grayscale
}
