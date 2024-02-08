const primaryFSSource = `#define PI 3.1415926538
precision highp float;
precision highp sampler2DArray;

//if we're not using normal mapping, 
//we want the view-space normals from the vertex shader
//#ifndef USE_NORMAL_MAP
in vec3 v_normal;
//#endif

in vec4 v_fragPos;
in vec2 v_texCoord;  // Received from vertex shader
#ifdef USE_NORMAL_MAP
in mat3 m_TBN; //received from vertex shader
#endif

#define MAX_DIRECTIONAL_LIGHTS 2
#define MAX_SPOT_LIGHTS 5
#define MAX_POINT_LIGHTS 2
#define MAX_LIGHTS MAX_DIRECTIONAL_LIGHTS+MAX_SPOT_LIGHTS+MAX_POINT_LIGHTS

#define NUM_CASCADE_SPLITS 3


// Ambient lighting needs to be scaled differently for PBR and non-PBR materials, or shadows look wierd
#ifdef USE_PBR 
#define AMBIENT_SCALING_FACTOR 0.2
#else
#define AMBIENT_SCALING_FACTOR 15.0
#endif

#define LIGHT_TYPE_POINT 0
#define LIGHT_TYPE_SPOT 1
#define LIGHT_TYPE_DIRECTIONAL 2


layout(std140) uniform FSPerFrame {
    uniform mat4 u_viewMatrixInverse;
};

layout(std140) uniform FSPerMaterial {
    uniform float u_ambientStrength;
    #ifndef USE_PBR
    uniform float u_specularStrength;
    uniform float padding[2];
    #else
    uniform float padding[3];
    #endif
};

layout(std140) uniform FSLightInfo {
    // light attributes: x=type (0=point, 1=spot, 2=directional)
    // x=point -> w = shadow caster
    // x=spot -> y= inner cone angle, z= outer cone angle, w= shadow caster
    // x=directional => w= shadow caster
    uniform vec4 u_lightProperties[MAX_LIGHTS];
    uniform vec4 u_lightPosViewSpace[MAX_LIGHTS]; // Position of the lights
    uniform vec4 u_lightDirViewSpace[MAX_LIGHTS]; // direction of the lights
    uniform vec4 u_lightAttenuation[MAX_LIGHTS]; //x,y,z = constant, linear, quadratic attenuation, w= max range
    uniform vec4 u_lightColor[MAX_LIGHTS]; // Color of the lights

    uniform mat4 u_lightSpaceMatrices[MAX_SPOT_LIGHTS]; // for transforming fragments to light-space for shadow sampling
    uniform mat4 u_lightCascadeMatrices[NUM_CASCADE_SPLITS * MAX_DIRECTIONAL_LIGHTS];
    uniform mat4 u_lightCubemapMatrices[6*MAX_POINT_LIGHTS];
    
    uniform float u_cascadeSplits[NUM_CASCADE_SPLITS];
    uniform int u_numLights;
};

uniform sampler2DArray u_shadowMaps;
uniform sampler2DArray u_shadowCascades;
uniform sampler2DArray u_shadowCubemaps; //emulated cubemaps (+X, -X, +Y, -Y, +Z, -Z) because OpenGL ES 3.0 doesn't have TEXTURE_CUBE_MAP_ARRAY :/

uniform sampler2D u_baseColorTexture;
#ifdef USE_NORMAL_MAP
uniform sampler2D u_normalMap;
#endif
#ifdef USE_BAKED_AO
uniform sampler2D u_aoMap;
#endif
#ifdef USE_PARALLAX
uniform sampler2D u_heightMap;
#endif
#ifdef USE_PBR
uniform sampler2D u_metallic;
uniform sampler2D u_roughness;
#endif
#ifdef USE_OPACITY_MAP
uniform sampler2D u_opacity;
#endif

out vec4 fragmentColor;

//POM. WIP.
#ifdef USE_PARALLAX
vec2 getParallaxCoords(vec2 texCoords, vec3 viewDir) {
    float heightScale = 0.02; // This value can be adjusted for more/less depth
    float numLayers = 200.0; // Number of layers for the POM effect
    float layerDepth = 1.0 / numLayers;

    float currentLayerDepth = 0.0;
    vec2 P = viewDir.xy / viewDir.z * heightScale;

    vec2 deltaTexCoords = P / numLayers;
    vec2 currentTexCoords = texCoords;

    float currentDepthMapValue = texture(u_heightMap, currentTexCoords).r;

    for(int i = 0; i < 20; ++i) {
        if(currentLayerDepth >= currentDepthMapValue) {
            break;
        }

        currentTexCoords -= deltaTexCoords;
        currentDepthMapValue = texture(u_heightMap, currentTexCoords).r;
        currentLayerDepth += layerDepth;
    }

    return currentTexCoords;
}
#endif

// Models spotlight falloff with linear interpolation between inner and outer cone angles
float spotAttenuation(vec3 pointToLight, vec3 lightDirection, float outerConeCos, float innerConeCos) {
    float cos = dot(normalize(lightDirection), normalize(-pointToLight));
    if(cos > outerConeCos) {
        if(cos < innerConeCos) {
            return smoothstep(outerConeCos, innerConeCos, cos);
        }
        return 1.0;
    }
    return 0.0;
}

// http://graphicrants.blogspot.com/2013/08/specular-brdf-reference.html
// http://ix.cs.uoregon.edu/~hank/441/lectures/pbr_slides.pdf
// Approximates the percent of microfacets in a surface aligned with the halfway vector
float TrowbridgeReitzGGX(vec3 normalDir, vec3 halfwayDir, float roughness) {
    // UE4 uses alpha = roughness^2, so I will too.
    float alpha = roughness * roughness;
    float alpha2 = alpha* alpha;
    
    float normDotHalf = max(dot(normalDir, halfwayDir), 0.0);
    float normDotHalf2 = normDotHalf * normDotHalf;

    float denom1 = (normDotHalf2 * (alpha2 - 1.0) + 1.0);
    float denom2 = denom1 * denom1;

    return alpha2 / (PI * denom2);
}
// https://learnopengl.com/PBR/Theory
// Approximates self-shadowing of microfacets on a surface
float geometrySchlickGGX(float normDotView, float roughness) {
    float r = (roughness + 1.0);
    float k = (r * r) / 8.0;

    float denominator = normDotView * (1.0 - k) + k;
    return normDotView / denominator;
}
// https://learnopengl.com/PBR/Theory
float geometrySmith(vec3 normalDir, vec3 viewDir, float roughness, float normDotLight) {
    float normDotView = max(dot(normalDir, viewDir), 0.0);

    // combination of shadowing from microfacets obstructing view vector, and microfacets obstructing light vector
    return geometrySchlickGGX(normDotView, roughness) * geometrySchlickGGX(normDotLight, roughness);
}
// https://learnopengl.com/PBR/Theory
// models increased reflectivity as view angle approaches 90 degrees
vec3 fresnelSchlick(float cosTheta, vec3 F0) {
    return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}
vec3 calculateLightContribution(int lightIndex, vec3 fragPos, vec3 viewDir, vec3 normal, vec2 uv, vec3 albedo, float metallic, float roughness, vec3 F0) {
    int lightType = int(u_lightProperties[lightIndex].x);
    vec3 lightPos = u_lightPosViewSpace[lightIndex].xyz;
    vec3 lightColor = u_lightColor[lightIndex].xyz;

    vec3 dir = u_lightDirViewSpace[lightIndex].xyz;
    
    float constantAttenuation = u_lightAttenuation[lightIndex].x;
    float linearAttenuation = u_lightAttenuation[lightIndex].y;
    float quadraticAttenuation = u_lightAttenuation[lightIndex].z;
    
    float outerConeCos = u_lightProperties[lightIndex].z;
    float innerConeCos = u_lightProperties[lightIndex].y;

    vec3 lightDir;
    float distance;
    float attenuation;
    float spotAttenuationFactor = 0.0;
    // For spotlights, apply extra attenuation based on the angle
    if(lightType == 1) {
        spotAttenuationFactor = spotAttenuation(lightDir, dir, outerConeCos, innerConeCos);
    }
    //for directional lights, use light dir directly, with zero attenuation
    if(lightType == 2) {
        lightDir = dir;
        attenuation = 1.0;
    } else {
        lightDir = normalize(lightPos - fragPos);
        distance = length(lightPos - fragPos);
        attenuation = 1.0 / (constantAttenuation + linearAttenuation * distance + quadraticAttenuation * distance * distance+spotAttenuationFactor);
    }

    //unit vector halfway between view dir and light dir. Makes more accurate specular highlights.
    vec3 halfwayDir = normalize(lightDir + viewDir);

    // PBR lighting
    // https://learnopengl.com/PBR/Theory
    #ifdef USE_PBR
    vec3 radiance = lightColor * attenuation;
    float normDotLight = max(dot(normal, lightDir), 0.0);

    // Cook-Torrence specular BRDF: fCookTorrance=DFG/(4(ωo⋅n)(ωi⋅n))
    // Approximate microfacet alignment
    float normalDistributionFunction = TrowbridgeReitzGGX(normal, halfwayDir, roughness);
    // Approximate microfacet shadowing
    float G = geometrySmith(normal, viewDir, roughness, normDotLight);
    // Approximate specular intensity based on view angle
    vec3 kSpecular = fresnelSchlick(max(dot(halfwayDir, viewDir), 0.0), F0); // F

    // Preserve energy, diffuse+specular must be at most 1.0
    vec3 kDiffuse = vec3(1.0) - kSpecular;
    // Metallic surfaces have no diffuse color
    // model as diffuse color decreases as metallic fudge-factor increases 
    kDiffuse *= 1.0 - metallic;

    vec3 numerator = normalDistributionFunction * G * kSpecular;
    float denominator = 4.0 * max(dot(normal, viewDir), 0.0) * max(dot(normal, lightDir), 0.0) + 0.0001; //+0.0001 fudge-factor to prevent division by 0
    vec3 specular = numerator / denominator;

    vec3 lighting = (kDiffuse * albedo / PI + specular) * radiance * normDotLight;

    #else //Non-PBR lighting

    // Calculate diffuse light
    float diff = max(dot(normal, lightDir), 0.0);
    vec3 diffuse = diff * lightColor;

    // Calculate specular light, Blinn-Phong
    float spec = pow(max(dot(normal, halfwayDir), 0.0), 32.0);
    vec3 specular = u_specularStrength * spec * lightColor;

    //attenuate
    vec3 lighting = (diffuse + specular) * attenuation;
    #endif

    return lighting;
}

int calculateShadowCascadeIndex(float depth) {
    for(int i = 0; i < NUM_CASCADE_SPLITS; i++) {
        if(depth < u_cascadeSplits[i]) {
            return i;
        }
    }
    return NUM_CASCADE_SPLITS - 1;
}

float calculateCascadedShadow(vec4 fragPosWorldSpace, int dirLightNum, vec3 normal, int lightIndex) {
    //shadows
    int cascadeIndex = calculateShadowCascadeIndex(abs(v_fragPos.z)); //abs because -z is forwards
    int infoIndex = NUM_CASCADE_SPLITS*dirLightNum+cascadeIndex;
    vec4 fragPosLightSpace = u_lightCascadeMatrices[infoIndex] * fragPosWorldSpace;
    vec3 uv = fragPosLightSpace.xyz; /// fragPosLightSpace.w;
    uv = uv * 0.5 + 0.5; // Map to [0, 1]
        //because OpenGL ES lacks CLAMP_TO_BORDER...
    bool isOutside = uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || uv.z > 1.0;
    float shadow = 0.0;
    //kind of a hack, not quite sure why I'm getting texcoords outside of bounds on fragments within the split distance
    //this just steps up one cascade if that happens.
    if (isOutside && cascadeIndex!=NUM_CASCADE_SPLITS-1){
        cascadeIndex+=1;
        infoIndex = NUM_CASCADE_SPLITS*dirLightNum+cascadeIndex;
        fragPosLightSpace = u_lightCascadeMatrices[infoIndex] * fragPosWorldSpace;
        uv = fragPosLightSpace.xyz / fragPosLightSpace.w;
        uv = uv * 0.5 + 0.5; // Map to [0, 1]
        isOutside = false;
    } 
    if(!isOutside) {
        float closestDepth = texture(u_shadowCascades, vec3(uv.xy, float(infoIndex))).r;
        float currentDepth = uv.z;

        //float cosTheta = abs(dot(normal, u_lightDirViewSpace[lightIndex].xyz));
        float bias = 0.0002;
        //float slopeScaledBias = 0.0000;
        //float bias = max(constantBias, slopeScaledBias*cosTheta);
        shadow = currentDepth - bias > closestDepth ? 1.0 : 0.0;
    }
    return shadow;
}

float calculateSpotShadow(vec4 fragPosWorldSpace, int spotLightNum){
    vec4 fragPosLightSpace = u_lightSpaceMatrices[spotLightNum] * fragPosWorldSpace;
    vec3 uv = fragPosLightSpace.xyz/fragPosLightSpace.w;
    uv = uv * 0.5 + 0.5; // Map to [0, 1]
    //because OpenGL ES lacks CLAMP_TO_BORDER...
    bool isOutside = uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || uv.z > 1.0;
    float shadow = 0.0;
    if(!isOutside) {
        float closestDepth = texture(u_shadowMaps, vec3(uv.xy, float(spotLightNum))).r;
        float currentDepth = uv.z;

        //float cosTheta = abs(dot(normal, u_lightDirViewSpace[lightIndex].xyz));
        float bias = 0.0002;
        //float slopeScaledBias = 0.0000;
        //float bias = max(constantBias, slopeScaledBias*cosTheta);
        shadow = currentDepth - bias > closestDepth ? 1.0 : 0.0;
    }
    return shadow;
}

float calculatePointShadow(vec4 fragPosWorldSpace, int pointLightNum, int lightIndex){
    vec4 lightPosWorldSpace = u_viewMatrixInverse*vec4(u_lightPosViewSpace[lightIndex].xyz, 1);
    vec3 dir = fragPosWorldSpace.xyz - lightPosWorldSpace.xyz;
    int faceIndex = 0;
    float maxDir = max(max(abs(dir.x), abs(dir.y)), abs(dir.z));

    if (dir.x == maxDir) {
        faceIndex = 0; // +X
    } else if (dir.x == -maxDir) {
        faceIndex = 1; // -X
    } else if (dir.y == maxDir) {
        faceIndex = 2; // +Y
    } else if (dir.y == -maxDir) {
        faceIndex = 3; // -Y
    } else if (dir.z == maxDir) {
        faceIndex = 4; // +Z
    } else if (dir.z == -maxDir) {
        faceIndex = 5; // -Z
    }
    vec4 fragPosLightSpace = u_lightCubemapMatrices[pointLightNum*6+faceIndex]*fragPosWorldSpace;
    vec3 uv = fragPosLightSpace.xyz/fragPosLightSpace.w;
    uv = uv * 0.5 + 0.5;
    bool isOutside = uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || uv.z > 1.0;
    float shadow = 0.0;
    if(!isOutside) {
    int layer = pointLightNum * 6 + faceIndex;
        float closestDepth = texture(u_shadowCubemaps, vec3(uv.xy, float(layer))).r;
        float currentDepth = uv.z;
        float bias = 0.0002;
        shadow = currentDepth - bias > closestDepth ? 1.0 : 0.0;
    }
    return shadow;
}

void main() {
    //we're doing light calculations in view space
    vec3 viewDir = -normalize(v_fragPos.xyz); // view-space

    //Parallax occlusion mapping. WIP.
    #ifdef USE_PARALLAX
    vec2 uv = getParallaxCoords(v_texCoord, viewDir);
    #else
    vec2 uv = v_texCoord;
    #endif

    vec4 baseColor = texture(u_baseColorTexture, uv);

    //if normal mapping, transform tangent space normal
    //to view space using TBN matrix. Else, just normalize v_normal.
    #ifdef USE_NORMAL_MAP
    vec3 normal = texture(u_normalMap, uv).rgb;
    normal = normalize(normal * 2.0 - 1.0);
    normal = normalize(m_TBN * normal);
    //normal = normalize(v_normal + texture(u_normalMap, uv).rgb);
    #else
    vec3 normal = normalize(v_normal);
    #endif

    //set up pbr values, if we are using it
    float metallic = 0.0;
    float roughness = 0.0;
    vec3 F0 = vec3(0.04); //total hack, this should be specified per-material
    #ifdef USE_PBR
    metallic = texture(u_metallic, uv).r;
    roughness = texture(u_roughness, uv).r;
    F0 = mix(F0, baseColor.xyz, metallic);
    #endif

    //accumulate light from all lights. WIP.
    vec3 lighting = vec3(0.0, 0.0, 0.0);
    float normalOffsetBias = 0.05;
    vec4 fragPosWorldSpace = u_viewMatrixInverse * vec4(v_fragPos.xyz+normal*normalOffsetBias, v_fragPos.w);
    int dirLightNum = 0;
    int spotLightNum = 0;
    int pointLightNum = 0;
    for(int i = 0; i < u_numLights; i++) {
        float shadow = 0.0;
        int lightType = int(round(u_lightProperties[i].x));
        switch (lightType){
            case LIGHT_TYPE_DIRECTIONAL:
                shadow = calculateCascadedShadow(fragPosWorldSpace, dirLightNum, normalize(v_normal), i);
                dirLightNum++;
                break;
            case LIGHT_TYPE_SPOT:
                shadow = calculateSpotShadow(fragPosWorldSpace, spotLightNum);
                spotLightNum++;
                break;
            case LIGHT_TYPE_POINT:
                shadow = calculatePointShadow(fragPosWorldSpace, pointLightNum, i);
                pointLightNum++;
                break;
        }
        lighting += (1.0-shadow) * calculateLightContribution(i, v_fragPos.xyz, viewDir, normal, uv, baseColor.xyz, metallic, roughness, F0);
    }
    // Combine results

    //ambient lighting, use AO map here if we have one
    #ifdef USE_BAKED_AO
    vec3 ambient = u_ambientStrength * baseColor.xyz * texture(u_aoMap, uv).r * AMBIENT_SCALING_FACTOR;
    // color.xyz *= aoColor.r;
    #else
    vec3 ambient = u_ambientStrength * baseColor.xyz * AMBIENT_SCALING_FACTOR;
    #endif
    lighting += ambient;
    vec3 color = baseColor.xyz * lighting;
    //reinhard tonemapping
    color = color / (color + vec3(1.0));
    #ifdef USE_PBR
    //gamma correction
    color = pow(color, vec3(1.0 / 2.2));
    #endif

    //apply opacity
    float opacity = baseColor.a;
    #ifdef USE_OPACITY_MAP
    opacity = 1.0 - texture(u_opacity, uv).r;
    #endif
    fragmentColor = vec4(color, opacity);
}
`

const primaryVSSource = `precision mediump float;

in vec3 a_position;
in vec3 a_normal;
in vec2 a_texCoord;
#ifdef USE_NORMAL_MAP
in vec3 a_tangent;
in vec3 a_bitangent;
#endif

//uniform mat4 u_modelMatrix;
uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;

//#ifndef USE_NORMAL_MAP
out vec3 v_normal;
//#endif
out vec4 v_fragPos;
out vec2 v_texCoord;
#ifdef USE_NORMAL_MAP
out mat3 m_TBN;
#endif

void main() {
    // Transform the position into view space
    v_fragPos = vec4(u_modelViewMatrix * vec4(a_position, 1.0));

    // Transform the normal
    // normal matrix is calculated as inverse transpose
    // of model-view matrix to modify normals appropriately when object is scaled
    //#ifndef USE_NORMAL_MAP
    v_normal = u_normalMatrix * a_normal;
    //#endif

    // Pass texcoord to fs
    v_texCoord = a_texCoord;

    // Calculate TBN matrix, for transforming tangent-space coordinates to view space
    // Used in normal mapping
    #ifdef USE_NORMAL_MAP
    vec3 T = normalize(u_normalMatrix * a_tangent);
    vec3 B = normalize(u_normalMatrix * a_bitangent);
    vec3 N = normalize(u_normalMatrix * a_normal);
    m_TBN = mat3(T, B, N);
    #endif

    // Set the position
    gl_Position = u_projectionMatrix * v_fragPos;
}
`
const skyboxVSSource = `#version 300 es
layout (location = 0) in vec3 a_position;

out vec3 v_texCoords;

uniform mat4 u_projectionMatrix;
uniform mat4 u_viewMatrix;

void main() {
    v_texCoords = a_position;  
    gl_Position = u_projectionMatrix * u_viewMatrix * vec4(a_position, 1.0);
}
`

const skyboxFSSource = `#version 300 es
precision highp float;

out vec4 FragColor;
in vec3 v_texCoords;

uniform samplerCube skybox;

void main() {    
    FragColor = texture(skybox, v_texCoords);
}
`