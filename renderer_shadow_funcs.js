WebGLRenderer.prototype.drawDepths = function (viewMatrix) {
    const gl = this.gl;
    for (const object of this.currentScene.objects) {
    let modelViewMatrix = mat4.create();
    mat4.multiply(modelViewMatrix, viewMatrix, object.transform.modelMatrix);
    gl.uniformMatrix4fv(this.currentScene.shadowScene.programInfo.uniformLocations.modelViewMatrix, false, modelViewMatrix);

    for (const mesh of object.meshes) {
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vertexBuffer);
      gl.vertexAttribPointer(this.currentScene.shadowScene.programInfo.uniformLocations.vertexPosition, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(this.currentScene.shadowScene.programInfo.uniformLocations.vertexPosition);

      // Draw mesh
      gl.drawArrays(gl.TRIANGLES, 0, mesh.vertices.length / 3);
    }
  }
};

WebGLRenderer.prototype.shadowPass = function () {
  const gl = this.gl;

  gl.viewport(0, 0, this.SHADOW_WIDTH, this.SHADOW_HEIGHT);
  gl.useProgram(this.currentScene.shadowScene.shadowProgram);

  let directionalLightNum = 0;
  let spotLightNum = 0;
  for (let i = 0; i < this.currentScene.lights.length; i++) {
    let light = this.currentScene.lights[i];
    if (light.type == LightType.DIRECTIONAL) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.currentScene.shadowScene.shadowCascadeFramebuffer);
      const cascadeInfo = light.cascades;
      for (let j = 0; j < this.NUM_SHADOW_CASCADES; j++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, this.currentScene.shadowScene.shadowCascades, 0, directionalLightNum * this.NUM_SHADOW_CASCADES + j);

        gl.clear(gl.DEPTH_BUFFER_BIT);

        gl.uniformMatrix4fv(this.currentScene.shadowScene.programInfo.uniformLocations.projectionMatrix, false, cascadeInfo[i].orthoMatrix);

        // Render the scene (depths only) for each cascade
        this.drawDepths(cascadeInfo[i].viewMatrix);
      }
      directionalLightNum++;
    } 
    else if (light.type == LightType.SPOT) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.currentScene.shadowScene.shadowMapFramebuffer);
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, this.currentScene.shadowScene.shadowMaps, 0, spotLightNum);
        let projectionMatrix = light.projectionMatrix;
        gl.uniformMatrix4fv(this.currentScene.shadowScene.programInfo.uniformLocations.projectionMatrix, false, projectionMatrix);
        let viewMatrix = light.viewMatrix;
        this.drawDepths(viewMatrix);
        spotLightNum++
    }
  }

  //reset frame buffer and viewport
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, this.canvas.width, this.canvas.height);
};
WebGLRenderer.prototype.initShadowScene = async function () {
  const gl = this.gl;
  const numCascades = this.NUM_SHADOW_CASCADES;

  await this.createShadowProgram(); // Compile shaders

  //create shadow cascades

  this.currentScene.shadowScene.shadowCascadeFramebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, this.currentScene.shadowScene.shadowCascadeFramebuffer);

  this.currentScene.shadowScene.shadowCascades = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.currentScene.shadowScene.shadowCascades);

  let numDirectionalLights = 0;
  for (let light of this.currentScene.lights) {
    if (light.type == LightType.DIRECTIONAL) {
      numDirectionalLights++;
    }
  }
  // Use gl.DEPTH_COMPONENT32F for higher precision if needed
  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.DEPTH_COMPONENT32F, this.SHADOW_WIDTH, this.SHADOW_HEIGHT, numCascades * numDirectionalLights, 0, gl.DEPTH_COMPONENT, gl.FLOAT, null);

  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // Attach the first layer of the texture array to the framebuffer's depth buffer
  // This layer will be changed when rendering each cascade
  gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, this.currentScene.shadowScene.shadowCascades, 0, 0);

  // Check if the framebuffer is complete
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    console.error("Framebuffer is not complete");
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  //create standard shadow maps for spot lights
  this.currentScene.shadowScene.shadowMapFramebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, this.currentScene.shadowScene.shadowMapFramebuffer);

  this.currentScene.shadowScene.shadowMaps = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.currentScene.shadowScene.shadowMaps);

  let numSpotLights = 0;
  for (let light of this.currentScene.lights) {
    if (light.type == LightType.SPOT) {
      numSpotLights++;
    }
  }
  // Use gl.DEPTH_COMPONENT32F for higher precision if needed
  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.DEPTH_COMPONENT32F, this.SHADOW_WIDTH, this.SHADOW_HEIGHT, numSpotLights, 0, gl.DEPTH_COMPONENT, gl.FLOAT, null);

  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // Attach the first layer of the texture array to the framebuffer's depth buffer
  // This layer will be changed when rendering each cascade
  gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, this.currentScene.shadowScene.shadowMaps, 0, 0);

  // Check if the framebuffer is complete
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    console.error("Framebuffer is not complete");
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};
WebGLRenderer.prototype.createShadowProgram = async function () {
  const gl = this.gl;
  let fsSource = await loadText("shaders/fragment_shadow.glsl");
  let vsSource = await loadText("shaders/vertex_shadow.glsl");
  vertexShader = compileShader(gl, vsSource, gl.VERTEX_SHADER);
  fragmentShader = compileShader(gl, fsSource, gl.FRAGMENT_SHADER);
  this.currentScene.shadowScene.shadowProgram = gl.createProgram();
  gl.attachShader(this.currentScene.shadowScene.shadowProgram, vertexShader);
  gl.attachShader(this.currentScene.shadowScene.shadowProgram, fragmentShader);
  gl.linkProgram(this.currentScene.shadowScene.shadowProgram);

  if (!gl.getProgramParameter(this.currentScene.shadowScene.shadowProgram, gl.LINK_STATUS)) {
    alert("Unable to initialize the shadow shader program: " + gl.getProgramInfoLog(shadowProgram));
  }

  this.currentScene.shadowScene.programInfo = {
    attribLocations: {
      vertexPosition: gl.getAttribLocation(this.currentScene.shadowScene.shadowProgram, "a_position"),
    },
    uniformLocations: {
      projectionMatrix: gl.getUniformLocation(this.currentScene.shadowScene.shadowProgram, "u_projectionMatrix"),
      modelViewMatrix: gl.getUniformLocation(this.currentScene.shadowScene.shadowProgram, "u_modelViewMatrix"),
    },
  };
};
