#version 100
precision mediump float;

varying vec3 v_normal;
varying vec3 v_fragPos;
varying vec2 v_texCoord;  // Received from vertex shader

uniform sampler2D u_baseColorTexture;
uniform sampler2D u_normalMap;
uniform sampler2D u_aoMap;
uniform sampler2D u_heightMap;

uniform vec3 u_lightPos; // Position of the light
uniform vec3 u_viewPos; // Position of the camera
uniform vec4 u_lightColor; // Color of the light

vec2 getParallaxCoords(vec2 texCoords, vec3 viewDir) {
  float heightScale = 0.01; // This value can be adjusted for more/less depth
  float numLayers = 20.0; // Number of layers for the POM effect
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


void main() {
    vec3 viewDir = normalize(u_viewPos - v_fragPos);
    vec2 uv = getParallaxCoords(v_texCoord, viewDir);
    vec4 baseColor = texture2D(u_baseColorTexture, uv);
    vec4 aoColor = texture2D(u_aoMap, uv);

    // Normalize the normal
    vec3 normal = normalize(v_normal + texture2D(u_normalMap, uv).rgb);

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
    color.xyz *= aoColor.r;

    gl_FragColor = color;
}