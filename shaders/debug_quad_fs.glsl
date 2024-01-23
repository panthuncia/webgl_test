#version 300 es
precision mediump float;
precision highp sampler2DArray;

in highp vec2 v_texCoord;

uniform sampler2DArray u_textureArray;
uniform int u_layer;

out vec4 fragmentColor;

void main() {
    //highp float depth = texture(u_textureArray, vec3(v_texCoord, u_layer)).r;
    //fragmentColor = vec4(depth, depth, depth, 1.0); // Display shadow map as grayscale
    fragmentColor = vec4(1, 1, 0, 1);
}
