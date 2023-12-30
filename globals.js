var GLOBAL_MAX_LIGHTS = 128;

var shaderVariantNormalMap = 0b1;
var shaderVariantBakedAO = 0b10;
var shaderVariantParallax = 0b100;
var shaderVariantPBR = 0b1000;

var shaderVariantsToCompile = [];

//build list of shader variants to compile
for (var i = 0; i < 16; i++) {
    shaderVariantsToCompile.push(i);
}

var globalShaderProgramVariants = {}