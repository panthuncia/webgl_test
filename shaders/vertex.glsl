precision mediump float;

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

#ifndef USE_NORMAL_MAP
out vec3 v_normal;
#endif
out vec3 v_fragPos;
out vec2 v_texCoord;
#ifdef USE_NORMAL_MAP
out mat3 m_TBN;
#endif

void main() {
    // Transform the position into view space
    v_fragPos = vec3(u_modelViewMatrix * vec4(a_position, 1.0));

    // Transform the normal
    #ifndef USE_NORMAL_MAP
    v_normal = u_normalMatrix * a_normal;
    #endif

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
    gl_Position = u_projectionMatrix * vec4(v_fragPos, 1.0);
}
