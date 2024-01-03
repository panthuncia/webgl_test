var GLOBAL_MAX_LIGHTS = 5;

var shaderVariantNormalMap = 0b1;
var shaderVariantBakedAO = 0b10;
var shaderVariantParallax = 0b100;
var shaderVariantPBR = 0b1000;
var ShaderVariantOpacityMap = 0b10000;

// var shaderVariantsToCompile = [];

// //build list of shader variants to compile
// for (var i = 0; i < 32; i++) {
//     shaderVariantsToCompile.push(i);
// }

var globalShaderProgramVariants = {}

var srgb_ext = gl.getExtension('EXT_sRGB');
var depth_ext = gl.getExtension('WEBGL_depth_texture');

let shadowWidth = 8196;
let shadowHeight = 8196;

const mat4 = glMatrix.mat4;
const mat3 = glMatrix.mat3;
const quat = glMatrix.quat;
const vec3 = glMatrix.vec3;

let defaultDirection = vec3.fromValues(0, 0, -1); // Default direction
vec3.normalize(defaultDirection, defaultDirection);

var globalMatrices = {
    viewMatrix: mat4.create(),
    projectionMatrix: mat4.create(),
    viewMatrixInverse: mat4.create()
};

var currentScene = {
    shadowScene: {}
}