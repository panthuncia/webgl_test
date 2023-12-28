precision mediump float;

varying vec3 v_normal;
varying vec3 v_fragPos;
varying vec2 v_texCoord;  // Received from vertex shader

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

uniform vec3 u_lightPos; // Position of the light
uniform vec3 u_viewPos; // Position of the camera
uniform vec4 u_lightColor; // Color of the light

#ifdef USE_PARALLAX
vec2 getParallaxCoords(vec2 texCoords, vec3 viewDir) {
  float heightScale = 0.01; // This value can be adjusted for more/less depth
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

void main() {
    vec3 viewDir = normalize(u_viewPos - v_fragPos);
    
    #ifdef USE_PARALLAX
    vec2 uv = getParallaxCoords(v_texCoord, viewDir);
    #else
    vec2 uv = v_texCoord;
    #endif
    
    vec4 baseColor = texture2D(u_baseColorTexture, uv);

    // Normalize the normal
    #ifdef USE_NORMAL_MAP
    vec3 normal = normalize(v_normal + texture2D(u_normalMap, uv).rgb);
    #else
    vec3 normal = normalize(v_normal);
    #endif
    // Calculate ambient light
    float ambientStrength = 0.1;
    vec4 ambient = ambientStrength * u_lightColor;

    // Calculate diffuse light
    vec3 lightDir = normalize(u_lightPos - v_fragPos);
    float diff = max(dot(normal, lightDir), 0.0);
    vec4 diffuse = diff * u_lightColor;

    // Calculate specular light
    float specularStrength = 0.5;
    vec3 reflectDir = reflect(-lightDir, normal);
    float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
    vec4 specular = specularStrength * spec * u_lightColor;

    // Combine results
    vec4 color = (ambient + diffuse + specular) * baseColor;

    #ifdef USE_BAKED_AO
    vec4 aoColor = texture2D(u_aoMap, uv);
    color.xyz *= aoColor.r;
    #endif

    gl_FragColor = color;
}