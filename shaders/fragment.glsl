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

#define MAX_LIGHTS 128
//light attributes: x=type (0=point, 1=spot, 2=directional)
//x=point -> 
//x=spot -> y= inner cone angle, z= outer cone angle
uniform vec4 u_lightProperties[MAX_LIGHTS];
uniform vec4 u_lightPosViewSpace[MAX_LIGHTS]; // Position of the lights
uniform vec4 u_lightDirViewSpace[MAX_LIGHTS]; // direction of the lights
uniform vec4 u_lightAttenuation[MAX_LIGHTS]; //x,y,z = constant, linear, quadratic attenuation, w= max range
uniform vec4 u_lightColor[MAX_LIGHTS]; // Color of the lights
uniform int u_numLights;
uniform float u_ambientStrength;
uniform float u_specularStrength;

#ifdef USE_PARALLAX
vec2 getParallaxCoords(vec2 texCoords, vec3 viewDir) {
  float heightScale = 1.0; // This value can be adjusted for more/less depth
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

vec3 calculateLightContribution(vec3 lightColor, vec3 lightPos, vec3 fragPos, vec3 viewDir, vec3 normal, float constantAttenuation, float linearAttenuation, float quadraticAttenuation){
    // Calculate ambient light
    //float ambientStrength = 0.1;
    vec3 ambient = u_ambientStrength * lightColor.xyz;

    // Calculate diffuse light
    vec3 lightDir = normalize(lightPos - fragPos);
    float diff = max(dot(normal, lightDir), 0.0);
    vec3 diffuse = diff * lightColor;

    // Calculate specular light
    //float specularStrength = 0.5;
    vec3 halfwayDir = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normal, halfwayDir), 0.0), 32.0);
    vec3 specular = u_specularStrength * spec * lightColor;

    //attenuate
    // float constantAttenuation = 1.0;
    // float linearAttenuation = 0.09;
    // float quadraticAttenuation = 0.032;
    float distance = length(lightPos - fragPos);
    float attenuation = 1.0 / (constantAttenuation + linearAttenuation * distance + quadraticAttenuation * distance * distance);
    vec3 lighting = (ambient + diffuse + specular) * attenuation;
    return lighting;
}


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

void main() {
    //vec3 viewDir = normalize(u_viewPos - v_fragPos);
    vec3 viewDir = -normalize(v_fragPos); // view-space

    #ifdef USE_PARALLAX
    vec2 uv = getParallaxCoords(v_texCoord, viewDir);
    #else
    vec2 uv = v_texCoord;
    #endif
    
    vec4 baseColor = texture2D(u_baseColorTexture, uv);

    //if normal mapping, transform tangent space
    //to view space using TBN matrix. Else, just normalize v_normal.
    #ifdef USE_NORMAL_MAP
    vec3 normal = texture2D(u_normalMap, uv).rgb;
    normal = normalize(normal*2.0-1.0);
    normal = normalize(m_TBN * normal);
    //normal = normalize(v_normal + texture2D(u_normalMap, uv).rgb);
    #else
    vec3 normal = normalize(v_normal);
    #endif

    vec3 lighting = vec3(0.0, 0.0, 0.0);
    for (int i=0; i<MAX_LIGHTS; i++){
        if (i >= u_numLights){break;}
        lighting+=calculateLightContribution(u_lightColor[i].xyz, u_lightPosViewSpace[i].xyz, v_fragPos, viewDir, normal, u_lightAttenuation[i].x, u_lightAttenuation[i].y, u_lightAttenuation[i].z);
    }
    
    // Combine results
    vec3 color = baseColor.xyz*lighting;

    #ifdef USE_BAKED_AO
    vec4 aoColor = texture2D(u_aoMap, uv);
    color.xyz *= aoColor.r;
    #endif

    gl_FragColor = vec4(color, 1.0);
}