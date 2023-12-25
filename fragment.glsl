#version 100
precision mediump float;

varying vec3 v_normal;
varying vec3 v_fragPos;

uniform vec3 u_lightPos; // Position of the light
uniform vec3 u_viewPos; // Position of the camera
uniform vec4 u_lightColor; // Color of the light
uniform vec4 u_objectColor; // Color of the object

void main() {
    // Normalize the normal
    vec3 normal = normalize(v_normal);

    // Calculate ambient light
    float ambientStrength = 0.1;
    vec4 ambient = ambientStrength * u_lightColor;

    // Calculate diffuse light
    vec3 lightDir = normalize(u_lightPos - v_fragPos);
    float diff = max(dot(normal, lightDir), 0.0);
    vec4 diffuse = diff * u_lightColor;

    // Calculate specular light
    float specularStrength = 0.5;
    vec3 viewDir = normalize(u_viewPos - v_fragPos);
    vec3 reflectDir = reflect(-lightDir, normal);
    float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
    vec4 specular = specularStrength * spec * u_lightColor;

    // Combine results
    vec4 color = (ambient + diffuse + specular) * u_objectColor;
    
    gl_FragColor = color;
}