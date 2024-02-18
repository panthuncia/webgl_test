WebGLRenderer.prototype.drawLines = function (positions, modelMatrix) {
    const gl = this.gl;
    gl.useProgram(this.lineProgramInfo.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.linesPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

    gl.vertexAttribPointer(this.lineProgramInfo.attribLocations.vertexPosition, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(this.lineProgramInfo.attribLocations.vertexPosition);

    let modelViewMatrix = mat4.create();
    mat4.multiply(modelViewMatrix, this.currentScene.camera.viewMatrix, modelMatrix);
    gl.uniformMatrix4fv(this.lineProgramInfo.uniformLocations.projectionMatrix, false, this.currentScene.camera.projectionMatrix);
    gl.uniformMatrix4fv(this.lineProgramInfo.uniformLocations.modelViewMatrix, false, modelViewMatrix);

    gl.drawArrays(gl.LINES, 0, positions.length / 3);
};

WebGLRenderer.prototype.initLineRenderer = function () {
    const gl = this.gl;
    const vsSource = `#version 300 es
            in vec4 a_vertexPosition;
            uniform mat4 u_modelViewMatrix;
            uniform mat4 u_projectionMatrix;
            void main(void) {
                gl_Position = u_projectionMatrix * u_modelViewMatrix * a_vertexPosition;
            }
        `;
    const fsSource = `#version 300 es
            precision highp float;
            out vec4 fragColor;
            void main(void) {
                fragColor = vec4(1.0, 1.0, 1.0, 1.0); // White color
            }
        `;

    // Initialize shaders
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vsSource);
    gl.compileShader(vertexShader);
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fsSource);
    gl.compileShader(fragmentShader);

    // Create the shader program
    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert("Unable to initialize the line shader program: " + gl.getProgramInfoLog(shaderProgram));
        return null;
    }
    this.lineProgramInfo = {
        program: shaderProgram,
        attribLocations: {
        vertexPosition: gl.getAttribLocation(shaderProgram, "a_vertexPosition"),
        },
        uniformLocations: {
        projectionMatrix: gl.getUniformLocation(shaderProgram, "u_projectionMatrix"),
        modelViewMatrix: gl.getUniformLocation(shaderProgram, "u_modelViewMatrix"),
        },
    };

    this.linesPositionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.linesPositionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(), gl.STATIC_DRAW);
};
