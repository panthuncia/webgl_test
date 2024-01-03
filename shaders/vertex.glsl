precision mediump float;
attribute vec3 a_position;
attribute vec3 a_normal;
attribute vec2 a_texCoord;
#ifdef USE_NORMAL_MAP
attribute vec3 a_tangent;
attribute vec3 a_bitangent;
#endif

//uniform mat4 u_modelMatrix;
uniform mat4 u_modelViewMatrix;
uniform mat4 u_projectionMatrix;
uniform mat3 u_normalMatrix;

//#ifndef USE_NORMAL_MAP
varying vec3 v_normal;
//#endif
varying vec3 v_fragPos;
varying vec2 v_texCoord;
#ifdef USE_NORMAL_MAP
varying mat3 m_TBN;
#endif
// mat3 transposeMat3(mat3 m) {
//     return mat3(
//         vec3(m[0][0], m[1][0], m[2][0]),
//         vec3(m[0][1], m[1][1], m[2][1]),
//         vec3(m[0][2], m[1][2], m[2][2])
//     );
// }
void main() {
    // Transform the position into view space
    v_fragPos = vec3(u_modelViewMatrix * vec4(a_position, 1.0));

    // Transform the normal
    //#ifndef USE_NORMAL_MAP
    v_normal = u_normalMatrix * a_normal;
    //#endif

    //pass texcoord to fs
    v_texCoord = a_texCoord;

    //calculate TBN matrix, for transforming tangent-space coordinates to view space
    //used in normal mapping
    #ifdef USE_NORMAL_MAP
    vec3 T = normalize(u_normalMatrix * a_tangent);
    vec3 B = normalize(u_normalMatrix * a_bitangent);
    vec3 N = normalize(u_normalMatrix * a_normal);
    m_TBN = mat3(T, B, N);
    #endif

    // Set the position
    gl_Position = u_projectionMatrix * vec4(v_fragPos, 1.0);
}