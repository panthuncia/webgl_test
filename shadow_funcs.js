function shadowPass() {
    gl.bindFramebuffer(gl.FRAMEBUFFER, currentScene.shadowScene.shadowFramebuffer);
    gl.viewport(0, 0, shadowWidth, shadowHeight);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    // Use a shader program that outputs depth
    gl.useProgram(currentScene.shadowScene.shadowProgram);

    // Set up the light's view and projection matrices
    //let lightDir = vec3.fromValues(currentScene.lights[0].position)
    let lightProjectionMatrix = currentScene.lights[0].projectionMatrix;
    let lightViewMatrix = currentScene.lights[0].viewMatrix;

    // Set uniform for the light's projection matrix
    gl.uniformMatrix4fv(currentScene.shadowScene.programInfo.uniformLocations.projectionMatrix, false, lightProjectionMatrix);

    // Render the scene (depths only)
    for (const object of currentScene.objects) {
        //get model-view matrix
        let modelViewMatrix = mat4.create();
        mat4.multiply(modelViewMatrix, lightViewMatrix, object.transform.modelMatrix);
        gl.uniformMatrix4fv(currentScene.shadowScene.programInfo.uniformLocations.modelViewMatrix, false, modelViewMatrix);
        for (const mesh of object.meshes) {
            //vertices
            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vertexBuffer);
            gl.vertexAttribPointer(currentScene.shadowScene.programInfo.uniformLocations.vertexPosition, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(currentScene.shadowScene.programInfo.uniformLocations.vertexPosition);

            //draw mesh
            gl.drawArrays(gl.TRIANGLES, 0, mesh.vertices.length / 3);
        }
    }

    //reset frame buffer and viewport
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
}

async function initShadowScene() {
    await (createShadowProgram()); //compile shaders

    currentScene.shadowScene.shadowFramebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, currentScene.shadowScene.shadowFramebuffer);

    // Create a texture to store the depth component
    currentScene.shadowScene.shadowMap = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, currentScene.shadowScene.shadowMap);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT,
        shadowWidth, shadowHeight, 0, gl.DEPTH_COMPONENT,
        gl.UNSIGNED_INT, null);

    // Set texture parameters
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Attach the texture as the framebuffer's depth buffer
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,
        gl.TEXTURE_2D, currentScene.shadowScene.shadowMap, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

async function createShadowProgram() {
    let fsSource = await (loadText("shaders/empty.glsl"));
    let vsSource = await (loadText("shaders/vertex_shadow.glsl"));
    vertexShader = compileShader(gl, vsSource, gl.VERTEX_SHADER);
    fragmentShader = compileShader(gl, fsSource, gl.FRAGMENT_SHADER);
    currentScene.shadowScene.shadowProgram = gl.createProgram();
    gl.attachShader(currentScene.shadowScene.shadowProgram, vertexShader);
    gl.attachShader(currentScene.shadowScene.shadowProgram, fragmentShader);
    gl.linkProgram(currentScene.shadowScene.shadowProgram);

    if (!gl.getProgramParameter(currentScene.shadowScene.shadowProgram, gl.LINK_STATUS)) {
        alert('Unable to initialize the shadow shader program: ' + gl.getProgramInfoLog(shadowProgram));
    }

    currentScene.shadowScene.programInfo = {
        attribLocations: {
            vertexPosition: gl.getAttribLocation(currentScene.shadowScene.shadowProgram, 'a_position'),
        },
        uniformLocations: {
            projectionMatrix: gl.getUniformLocation(currentScene.shadowScene.shadowProgram, "u_projectionMatrix"),
            modelViewMatrix: gl.getUniformLocation(currentScene.shadowScene.shadowProgram, "u_modelViewMatrix")
        }
    }
}