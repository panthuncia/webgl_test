// fragment_shader.glsl
varying highp vec2 v_texCoord;

uniform sampler2D u_texture;

void main() {
    highp float depth = texture2D(u_texture, v_texCoord).r;
    gl_FragColor = vec4(depth, depth, depth, 1.0); // Display shadow map as grayscale
}
