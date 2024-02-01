debugQuad = {}

async function createDebugQuad(gl){
    debugQuad.positions = new Float32Array([
        -1.0, -1.0, 
         1.0, -1.0, 
        -1.0,  1.0, 
         1.0,  1.0,
    ]);
    debugQuad.textureCoordinates = new Float32Array([
        0.0,  0.0,
        1.0,  0.0,
        0.0,  1.0,
        1.0,  1.0,
    ]);
    
    debugQuad.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, debugQuad.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, debugQuad.positions, gl.STATIC_DRAW);

    debugQuad.textureCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, debugQuad.textureCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, debugQuad.textureCoordinates, gl.STATIC_DRAW);

    let fsSource = `#version 300 es
    precision mediump float;
    precision highp sampler2DArray;
    
    in highp vec2 v_texCoord;
    
    uniform sampler2DArray u_textureArray;
    uniform int u_layer;
    
    out vec4 fragmentColor;
    
    void main() {
        highp float depth = texture(u_textureArray, vec3(v_texCoord, u_layer)).r;
        fragmentColor = vec4(depth, depth, depth, 1.0); // Display shadow map as grayscale
        //fragmentColor = vec4(1, 1, 0, 1);
    }
    `
    let vsSource = `#version 300 es
    // vertex_shader.glsl
    in vec4 a_position;
    in vec2 a_texCoord;
    
    out highp vec2 v_texCoord;
    
    void main() {
        v_texCoord = a_texCoord;
        gl_Position = a_position;
    }`
    vertexShader = compileShader(gl, vsSource, gl.VERTEX_SHADER);
    fragmentShader = compileShader(gl, fsSource, gl.FRAGMENT_SHADER);
    shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert('Unable to initialize the debug shader program: ' + gl.getProgramInfoLog(shadowProgram));
    }

    debugQuad.programInfo = {
        program: shaderProgram, 
        attribLocations: {
            vertexPosition: gl.getAttribLocation(shaderProgram, 'a_position'),
            texCoord: gl.getAttribLocation(shaderProgram, 'a_texCoord')
        },
        uniformLocations: {
            textureArray: gl.getUniformLocation(shaderProgram, 'u_textureArray'),
            layer: gl.getUniformLocation(shaderProgram, 'u_layer'),
        }
    }
    
}

function drawFullscreenQuad(gl, textureArray, layer){
    gl.useProgram(debugQuad.programInfo.program);

    gl.bindBuffer(gl.ARRAY_BUFFER, debugQuad.positionBuffer);
    // Set up the position attribute
    gl.vertexAttribPointer(debugQuad.programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(debugQuad.programInfo.attribLocations.vertexPosition);
    
    // Set up the texture coordinate attribute
    gl.bindBuffer(gl.ARRAY_BUFFER, debugQuad.textureCoordBuffer);
    gl.vertexAttribPointer(debugQuad.programInfo.attribLocations.texCoord, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(debugQuad.programInfo.attribLocations.texCoord);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, textureArray);
    gl.uniform1i(debugQuad.programInfo.uniformLocations.textureArray, 0);
    
    gl.uniform1i(debugQuad.programInfo.uniformLocations.layer, layer);
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}