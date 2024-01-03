#define PI 3.1415926538
precision mediump float;

//if we're not using normal mapping, 
//we want the view-space normals from the vertex shader
//#ifndef USE_NORMAL_MAP
varying vec3 v_normal;
//#endif

varying vec3 v_fragPos;
varying vec2 v_texCoord;  // Received from vertex shader
#ifdef USE_NORMAL_MAP
varying mat3 m_TBN; //received from vertex shader
#endif

#define MAX_LIGHTS 5
//light attributes: x=type (0=point, 1=spot, 2=directional)
//x=point -> w = shadow caster
//x=spot -> y= inner cone angle, z= outer cone angle, w= shadow caster
//x=directional => w= shadow caster
uniform vec4 u_lightProperties[MAX_LIGHTS];
uniform vec4 u_lightPosViewSpace[MAX_LIGHTS]; // Position of the lights
uniform vec4 u_lightDirViewSpace[MAX_LIGHTS]; // direction of the lights
uniform vec4 u_lightAttenuation[MAX_LIGHTS]; //x,y,z = constant, linear, quadratic attenuation, w= max range
uniform vec4 u_lightColor[MAX_LIGHTS]; // Color of the lights

//these two have u_numShadowCastingLights elements
uniform mat4 u_lightSpaceMatrices[MAX_LIGHTS]; // for transforming fragments to light-space for shadow sampling
uniform mat4 u_viewMatrixInverse;

uniform int u_numLights;
//uniform int u_numShadowCastingLights;

uniform float u_ambientStrength;
uniform float u_specularStrength;

uniform sampler2D u_shadowMaps[MAX_LIGHTS]; 

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

  float currentDepthMapValue = texture2D(u_heightMap, currentTexCoords).r;

  for (int i = 0; i < 20; ++i) {
      if (currentLayerDepth >= currentDepthMapValue) {
          break;
      }

      currentTexCoords -= deltaTexCoords;
      currentDepthMapValue = texture2D(u_heightMap, currentTexCoords).r;
      currentLayerDepth += layerDepth;
  }

  return currentTexCoords;
}
#endif

//https://github.com/panthuncia/TressFXShaders/blob/main/TressFXLighting.hlsl
// https://github.com/KhronosGroup/glTF/blob/master/extensions/2.0/Khronos/KHR_lights_punctual/README.md#inner-and-outer-cone-angles
float SpotAttenuation(vec3 pointToLight, vec3 spotDirection, float outerConeCos, float innerConeCos)
{
    float actualCos = dot(normalize(spotDirection), normalize(-pointToLight));
    if (actualCos > outerConeCos)
    {
        if (actualCos < innerConeCos)
        {
            return smoothstep(outerConeCos, innerConeCos, actualCos);
        }
        return 1.0;
    }
    return 0.0;
}

//https://learnopengl.com/PBR/Lighting
float DistributionGGX(vec3 N, vec3 H, float roughness)
{
    float a      = roughness*roughness;
    float a2     = a*a;
    float NdotH  = max(dot(N, H), 0.0);
    float NdotH2 = NdotH*NdotH;
	
    float num   = a2;
    float denom = (NdotH2 * (a2 - 1.0) + 1.0);
    denom = PI * denom * denom;
	
    return num / denom;
}
//https://learnopengl.com/PBR/Lighting
float GeometrySchlickGGX(float NdotV, float roughness)
{
    float r = (roughness + 1.0);
    float k = (r*r) / 8.0;

    float num   = NdotV;
    float denom = NdotV * (1.0 - k) + k;
	
    return num / denom;
}
//https://learnopengl.com/PBR/Lighting
float GeometrySmith(vec3 N, vec3 V, vec3 L, float roughness)
{
    float NdotV = max(dot(N, V), 0.0);
    float NdotL = max(dot(N, L), 0.0);
    float ggx2  = GeometrySchlickGGX(NdotV, roughness);
    float ggx1  = GeometrySchlickGGX(NdotL, roughness);
	
    return ggx1 * ggx2;
}
//https://learnopengl.com/PBR/Lighting
vec3 fresnelSchlick(float cosTheta, vec3 F0)
{
    return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}  
vec3 calculateLightContribution(int lightType, vec3 lightColor, vec3 lightPos, vec3 dir, vec3 fragPos, vec3 viewDir, vec3 normal, vec2 uv, vec3 albedo, float metallic, float roughness, vec3 F0, float constantAttenuation, float linearAttenuation, float quadraticAttenuation, float outerConeCos, float innerConeCos) {
    vec3 lightDir;
    float distance;
    float attenuation;
    //for directional lights, use light dir directly, with zero attenuation
    if(lightType == 2) {
        lightDir = dir;
        attenuation = 1.0;
    } else {
        lightDir = normalize(lightPos - fragPos);
        distance = length(lightPos - fragPos);
        attenuation = 1.0 / (constantAttenuation + linearAttenuation * distance + quadraticAttenuation * distance * distance);
    }
    
    //PBR lighting
    //https://learnopengl.com/PBR/Lighting
    #ifdef USE_PBR
    vec3 H = normalize(viewDir + lightDir);
    vec3 radiance = lightColor * attenuation;
    float NDF = DistributionGGX(normal, H, roughness);
    float G = GeometrySmith(normal, viewDir, lightDir, roughness);
    vec3 F = fresnelSchlick(max(dot(H, viewDir), 0.0), F0);  

    vec3 kS = F;
    vec3 kD = vec3(1.0) - kS;
    kD *= 1.0 - metallic;	

    vec3 numerator    = NDF * G * F;
    float denominator = 4.0 * max(dot(normal, viewDir), 0.0) * max(dot(normal, lightDir), 0.0) + 0.0001;
    vec3 specular     = numerator / denominator;  
    float NdotL = max(dot(normal, lightDir), 0.0);
    vec3 lighting = (kD * albedo / PI + specular) * radiance * NdotL;
    
    #else //Non-PBR lighting

    // Calculate diffuse light
    float diff = max(dot(normal, lightDir), 0.0);
    vec3 diffuse = diff * lightColor;

    // Calculate specular light
    vec3 halfwayDir = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normal, halfwayDir), 0.0), 32.0);
    vec3 specular = u_specularStrength * spec * lightColor;

    //attenuate
    vec3 lighting = (diffuse + specular) * attenuation;
    #endif
    // For spotlights, apply extra attenuation based on the angle
    if (lightType == 1) {
        //vec3 pointToLight = fragPos - lightPos;
        float spotEffect = SpotAttenuation(lightDir, dir, outerConeCos, innerConeCos);
        lighting *= spotEffect;
    }

    return lighting;
}

void main() {
    //we're doing light calculations in view space
    vec3 viewDir = -normalize(v_fragPos); // view-space

    //Parallax occlusion mapping. WIP.
    #ifdef USE_PARALLAX
    vec2 uv = getParallaxCoords(v_texCoord, viewDir);
    #else
    vec2 uv = v_texCoord;
    #endif
    
    vec4 baseColor = texture2D(u_baseColorTexture, uv);

    //if normal mapping, transform tangent space normal
    //to view space using TBN matrix. Else, just normalize v_normal.
    #ifdef USE_NORMAL_MAP
    vec3 normal = texture2D(u_normalMap, uv).rgb;
    normal = normalize(normal*2.0-1.0);
    normal = normalize(m_TBN * normal);
    //normal = normalize(v_normal + texture2D(u_normalMap, uv).rgb);
    #else
    vec3 normal = normalize(v_normal);
    #endif

    //set up pbr values, if we are using it
    float metallic = 0.0;
    float roughness = 0.0;
    vec3 F0 = vec3(0.04); 
    #ifdef USE_PBR
    metallic = texture2D(u_metallic, uv).r;
    roughness = texture2D(u_roughness, uv).r;
    F0 = mix(F0, baseColor.xyz, metallic);
    #endif

    //accumulate light from all lights. WIP.
    vec3 lighting = vec3(0.0, 0.0, 0.0);
    vec4 fragPosWorldSpace = u_viewMatrixInverse * vec4(v_fragPos, 1.0);
    for (int i=0; i<MAX_LIGHTS; i++){
        if (i >= u_numLights){break;}
        int lightType = int(u_lightProperties[i].x);
        vec3 lightPos = u_lightPosViewSpace[i].xyz;
        vec3 lightDir = u_lightDirViewSpace[i].xyz;
        float outerConeCos = u_lightProperties[i].z;
        float innerConeCos = u_lightProperties[i].y;

        //shadows
        vec4 fragPosLightSpace = u_lightSpaceMatrices[i] * fragPosWorldSpace;
        vec3 projCoords = fragPosLightSpace.xyz / fragPosLightSpace.w;
        projCoords = projCoords * 0.5 + 0.5; // Map to [0, 1]

        // Sample the corresponding shadow map
        float closestDepth = texture2D(u_shadowMaps[i], projCoords.xy).r;
        float currentDepth = projCoords.z;

        // Implement shadow comparison (with bias to avoid shadow acne)
        float bias = 0.005; // Adjust bias as needed
        float shadow = currentDepth - bias > closestDepth ? 1.0 : 0.0;

        lighting += (1.0-shadow)*calculateLightContribution(lightType, u_lightColor[i].xyz, lightPos, lightDir, v_fragPos, viewDir, normal, uv, baseColor.xyz, metallic, roughness, F0, u_lightAttenuation[i].x, u_lightAttenuation[i].y, u_lightAttenuation[i].z, outerConeCos, innerConeCos);
    }
    // Combine results

    //ambient lighting, use AO map here if we have one
    #ifdef USE_BAKED_AO
    vec3 ambient = u_ambientStrength * baseColor.xyz*texture2D(u_aoMap, uv).r;
    // color.xyz *= aoColor.r;
    #else
    vec3 ambient = u_ambientStrength * baseColor.xyz;
    #endif
    lighting+=ambient;
    vec3 color = baseColor.xyz*lighting;
    //reinhard tonemapping
    color = color / (color + vec3(1.0));
    #ifdef USE_PBR
    //gamma correction
    color = pow(color, vec3(1.0/2.2));
    #endif

    //apply opacity
    float opacity = baseColor.a;
    #ifdef USE_OPACITY_MAP
    opacity = 1.0-texture2D(u_opacity, uv).r;
    #endif
    gl_FragColor = vec4(color, opacity);
}