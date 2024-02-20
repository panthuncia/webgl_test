const mat4 = glMatrix.mat4;
const mat3 = glMatrix.mat3;
const quat = glMatrix.quat;
const vec3 = glMatrix.vec3;
const vec4 = glMatrix.vec4;

const defaultDirection = vec3.fromValues(0, 0, -1); // Default direction

SHADER_VARIANTS = {
    SHADER_VARIANT_NORMAL_MAP: 1<<0,
    SHADER_VARIANT_BAKED_AO: 1<<1,
    SHADER_VARIANT_PARALLAX: 1<<2,
    SHADER_VARIANT_PBR: 1<<3,
    SHADER_VARIANT_OPACITY_MAP: 1<<4,
    SHADER_VARIANT_INVERT_NORMAL_MAP: 1<<5,
    SHADER_VARIANT_WIREFRAME: 1<<6,
    SHADER_VARIANT_SKIP_LIGHTING: 1<<7,
    SHADER_VARIANT_COMBINED_METALLIC_ROUGHNESS: 1<<8,
    SHADER_VARIANT_PBR_MAPS: 1<<9,
};

BLEND_MODE = {
    BLEND_MODE_OPAQUE: 0,
    BLEND_MODE_MASK: 1,
    BLEND_MODE_BLEND: 2,
}