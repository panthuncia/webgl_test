var cubeVertices = [
    -10.0,  10.0, -10.0,
    -10.0, -10.0, -10.0,
    10.0, -10.0, -10.0,
    10.0, -10.0, -10.0,
    10.0,  10.0, -10.0,
    -10.0,  10.0, -10.0,

    -10.0, -10.0,  10.0,
    -10.0, -10.0, -10.0,
    -10.0,  10.0, -10.0,
    -10.0,  10.0, -10.0,
    -10.0,  10.0,  10.0,
    -10.0, -10.0,  10.0,

    10.0, -10.0, -10.0,
    10.0, -10.0,  10.0,
    10.0,  10.0,  10.0,
    10.0,  10.0,  10.0,
    10.0,  10.0, -10.0,
    10.0, -10.0, -10.0,
    
    -10.0, -10.0,  10.0,
    -10.0,  10.0,  10.0,
    10.0,  10.0,  10.0,
    10.0,  10.0,  10.0,
    10.0, -10.0,  10.0,
    -10.0, -10.0,  10.0,

    -10.0,  10.0, -10.0,
    10.0,  10.0, -10.0,
    10.0,  10.0,  10.0,
    10.0,  10.0,  10.0,
    -10.0,  10.0,  10.0,
    -10.0,  10.0, -10.0,

    -10.0, -10.0, -10.0,
    -10.0, -10.0,  10.0,
    10.0, -10.0, -10.0,
    10.0, -10.0, -10.0,
    -10.0, -10.0,  10.0,
    10.0, -10.0,  10.0
]

 var v0 = normalize([-3.0, -3.0, 3.0, 1], true);
var v1 = normalize([3.0, -3.0, 3.0, 1], true);
var v2 = normalize([3.0, 3.0, 3.0, 1], true);
var v3 = normalize([-3.0, 3.0, 3.0, 1], true);
var v4 = normalize([-3.0, -3.0, -3.0, 1], true);
var v5 = normalize([3.0, -3.0, -3.0, 1], true);
var v6 = normalize([3.0, 3.0, -3.0, 1], true);
var v7 = normalize([-3.0, 3.0, -3.0, 1], true);
//var cubeData = cube(v0, v1, v2, v3, v4, v5, v6, v7, 0, false);

WebGLRenderer.prototype.drawSkybox = function () {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(this.skyboxProgramInfo.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.cubePositionsBuffer);

    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(0);

    let m4 = mat4.fromValues(...this.currentScene.camera.viewMatrix);
    m4[12]=0;
    m4[13]=0;
    m4[14]=0;
    let viewProjectionMatrix = mat4.create();
    mat4.multiply(viewProjectionMatrix, this.currentScene.camera.projectionMatrix, this.currentScene.camera.viewMatrix);

    // Step 4: Invert the View-Projection Matrix
    //let viewDirectionProjectionInverse = mat4.create();
    //mat4.invert(viewDirectionProjectionInverse, viewProjectionMatrix);

    //gl.uniformMatrix4fv(this.skyboxProgramInfo.uniformLocations.viewDirectionProjectionInverse, false, viewDirectionProjectionInverse);

    gl.uniformMatrix4fv(this.skyboxProgramInfo.uniformLocations.viewMatrix, false, m4);
    gl.uniformMatrix4fv(this.skyboxProgramInfo.uniformLocations.projectionMatrix, false, this.currentScene.camera.projectionMatrix);


    // Bind cubemap texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.skyboxCubemap);
    gl.uniform1i(this.skyboxProgramInfo.uniformLocations.u_skybox, 0);

    gl.drawArrays(gl.TRIANGLES, 0, cubeVertices.length/3);
};

WebGLRenderer.prototype.initSkyboxRenderer = function () {
    const gl = this.gl;
    const skyboxVSSource = `#version 300 es
        #define EPSILON 0.00001
        in vec3 a_position;
        out vec3 v_direction;
        uniform mat4 u_viewMatrix;
        uniform mat4 u_projectionMatrix;
        uniform mat4 u_viewDirectionProjectionInverse;

        void main() {
            v_direction = a_position;
            gl_Position = u_viewMatrix * u_projectionMatrix  * vec4(a_position, 1.0);
            gl_Position.z = gl_Position.w-EPSILON;
        }
        `;
    const skyboxFSSource = `#version 300 es
            precision highp float;
            in vec3 v_direction;
            uniform samplerCube u_skybox;
            out vec4 fragColor;
            void main() {
                fragColor = texture(u_skybox, v_direction);
            }
        `;

    // Initialize shaders
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, skyboxVSSource);
    gl.compileShader(vertexShader);
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, skyboxFSSource);
    gl.compileShader(fragmentShader);

    // Create the shader program
    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert("Unable to initialize the skybox shader program: " + gl.getProgramInfoLog(shaderProgram));
        return null;
    }
    this.skyboxProgramInfo = {
        program: shaderProgram,
        attribLocations: {
            vertexPosition: gl.getAttribLocation(shaderProgram, "a_position"),
        },
        uniformLocations: {
            projectionMatrix: gl.getUniformLocation(shaderProgram, "u_viewMatrix"),
            viewMatrix: gl.getUniformLocation(shaderProgram, "u_projectionMatrix"),
            skybox: gl.getUniformLocation(shaderProgram, 'u_skybox'),
        },
    };

    this.cubePositionsBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.cubePositionsBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cubeVertices), gl.STATIC_DRAW);
};
