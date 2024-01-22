debugQuad = {}

async function createDebugQuad(gl){
    debugQuad.vertices = new Float32Array([
        -1.0, -1.0,  0.0, 0.0, // bottom left
         1.0, -1.0,  1.0, 0.0, // bottom right
        -1.0,  1.0,  0.0, 1.0, // top left
         1.0,  1.0,  1.0, 1.0  // top right
    ]);
    
    debugQuad.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, debugQuad.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, debugQuad.vertices, gl.STATIC_DRAW);

    let fsSource = await (loadText("shaders/debug_quad_fs.glsl"));
    let vsSource = await (loadText("shaders/debug_quad_vs.glsl"));
    vertexShader = compileShader(gl, vsSource, gl.VERTEX_SHADER);
    fragmentShader = compileShader(gl, fsSource, gl.FRAGMENT_SHADER);
    shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert('Unable to initialize the shadow shader program: ' + gl.getProgramInfoLog(shadowProgram));
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

    gl.bindBuffer(gl.ARRAY_BUFFER, debugQuad.vertexBuffer);
    // Set up the position attribute
    gl.vertexAttribPointer(debugQuad.programInfo.attribLocations.vertexPosition, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(debugQuad.programInfo.attribLocations.vertexPosition);
    
    // Set up the texture coordinate attribute
    gl.vertexAttribPointer(debugQuad.programInfo.attribLocations.texCoord, 2, gl.FLOAT, false, 16, 8);
    gl.enableVertexAttribArray(debugQuad.programInfo.attribLocations.texCoord);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, textureArray);
    gl.uniform1i(debugQuad.programInfo.uniformLocations.textureArray, 0);
    gl.uniform1i(debugQuad.programInfo.uniformLocations.layer, layer);
    
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}