WebGLRenderer.prototype.drawObjectDepths = function (object, viewMatrix, projectionMatrix, skinned) {
  const gl = this.gl;
  let programInfo = null;
  if (!skinned){
    gl.useProgram(this.shadowScene.shadowProgram);
    programInfo = this.shadowScene.programInfo;
  } else {
    gl.useProgram(this.shadowScene.shadowProgramSkinned);
    programInfo = this.shadowScene.programInfoSkinned;
  }
  gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, projectionMatrix);
  let modelViewMatrix = mat4.create();
  mat4.multiply(modelViewMatrix, viewMatrix, object.transform.modelMatrix);
  gl.uniformMatrix4fv(programInfo.uniformLocations.modelViewMatrix, false, modelViewMatrix);
  for (const mesh of object.meshes) {
    if (mesh.material.shaderVariant & this.SHADER_VARIANTS.SHADER_VARIANT_SKIP_LIGHTING) {
      return;
    }
    if (skinned){
       gl.uniformMatrix4fv(programInfo.uniformLocations.inverseBindMatrices, false, object.skeleton.inverseBindMatrices);
       gl.uniformMatrix4fv(programInfo.uniformLocations.boneTransforms, false, object.skeleton.boneTransforms);
    }

    // Draw mesh
    gl.bindVertexArray(mesh.vao);
    mesh.draw(gl);
    gl.bindVertexArray(null);
  }
};

WebGLRenderer.prototype.drawDepths = function (viewMatrix, projectionMatrix) {
  const gl = this.gl;
  for (const key in this.currentScene.unskinnedOpaqueObjects) {
    let object = this.currentScene.unskinnedOpaqueObjects[key];
    this.drawObjectDepths(object, viewMatrix, projectionMatrix, false);
  }
  for (const key in this.currentScene.skinnedOpaqueObjects) {
    let object = this.currentScene.skinnedOpaqueObjects[key];
    this.drawObjectDepths(object, viewMatrix, projectionMatrix, true);
  }
  // for (const key in this.currentScene.unskinnedTransparentObjects) {
  //   let object = this.currentScene.unskinnedTransparentObjects[key];
  //   this.drawObjectDepths(object, viewMatrix, projectionMatrix ,false);
  // }
  for (const key in this.currentScene.skinnedTransparentObjects) {
    let object = this.currentScene.skinnedTransparentObjects[key];
    this.drawObjectDepths(object, viewMatrix, projectionMatrix, true);
  }
};

WebGLRenderer.prototype.shadowPass = function () {
  const gl = this.gl;

  gl.viewport(0, 0, this.SHADOW_RESOLUTION, this.SHADOW_RESOLUTION);

  let directionalLightNum = 0;
  let spotLightNum = 0;
  let pointLightNum = 0;
  let i = 0;
  for (let key in this.currentScene.lights) {
    let light = this.currentScene.lights[key];
    if (light.type == LightType.DIRECTIONAL) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowScene.shadowCascadeFramebuffer);
      const cascadeInfo = light.cascades;
      for (let j = 0; j < this.NUM_SHADOW_CASCADES; j++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, this.shadowScene.shadowCascades, 0, directionalLightNum * this.NUM_SHADOW_CASCADES + j);

        gl.clear(gl.DEPTH_BUFFER_BIT);

        // Render the scene (depths only) for each cascade
        this.drawDepths(cascadeInfo[j].viewMatrix, cascadeInfo[j].orthoMatrix);
      }
      directionalLightNum++;
    } else if (light.type == LightType.SPOT) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowScene.shadowMapFramebuffer);

      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, this.shadowScene.shadowMaps, 0, spotLightNum);
      gl.clear(gl.DEPTH_BUFFER_BIT);

      let projectionMatrix = light.projectionMatrix;
      let viewMatrix = light.viewMatrix;
      this.drawDepths(viewMatrix, projectionMatrix);
      spotLightNum++;
    } else if (light.type == LightType.POINT) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowScene.shadowCubemapFramebuffer);
      for (let i = 0; i < 6; i++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, this.shadowScene.shadowCubemaps, 0, pointLightNum * 6 + i);
        gl.clear(gl.DEPTH_BUFFER_BIT);
        let projectionMatrix = light.projectionMatrix;
        let viewMatrix = light.cubemapViewMatrices[i];
        this.drawDepths(viewMatrix, projectionMatrix);
      }

      pointLightNum++;
    }
    i++;
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

  this.shadowScene.shadowCascadeFramebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowScene.shadowCascadeFramebuffer);

  this.shadowScene.shadowCascades = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.shadowScene.shadowCascades);

  // let numDirectionalLights = 0;
  // let numSpotLights = 0;
  // let numPointLights = 0;
  // for (let key in this.currentScene.lights) {
  //   let light = this.currentScene.lights[key];
  //   if (light.type == LightType.DIRECTIONAL) {
  //     numDirectionalLights++;
  //   }
  //   else if (light.type == LightType.SPOT) {
  //     numSpotLights++;
  //   }
  //   else if (light.type == LightType.POINT) {
  //     numPointLights++;
  //   }
  // }
  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.DEPTH_COMPONENT32F, this.SHADOW_RESOLUTION, this.SHADOW_RESOLUTION, Math.max(numCascades * this.MAX_DIRECTIONAL_LIGHTS, 1), 0, gl.DEPTH_COMPONENT, gl.FLOAT, null);

  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // Attach the first layer of the texture array to the framebuffer's depth buffer
  // This layer will be changed when rendering each cascade
  gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, this.shadowScene.shadowCascades, 0, 0);

  // Check if the framebuffer is complete
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    console.error("Framebuffer is not complete");
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  //create standard shadow maps for spot lights
  this.shadowScene.shadowMapFramebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowScene.shadowMapFramebuffer);

  this.shadowScene.shadowMaps = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.shadowScene.shadowMaps);

  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.DEPTH_COMPONENT32F, this.SHADOW_RESOLUTION, this.SHADOW_RESOLUTION, Math.max(this.MAX_SPOT_LIGHTS, 1), 0, gl.DEPTH_COMPONENT, gl.FLOAT, null);

  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // Attach the first layer of the texture array to the framebuffer's depth buffer
  // This layer will be changed when rendering each cascade
  gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, this.shadowScene.shadowMaps, 0, 0);

  // Check if the framebuffer is complete
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    console.error("Framebuffer is not complete");
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  // Create (emulated) cubemaps for spot lights
  this.shadowScene.shadowCubemapFramebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowScene.shadowCubemapFramebuffer);

  this.shadowScene.shadowCubemaps = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.shadowScene.shadowCubemaps);

  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.DEPTH_COMPONENT32F, this.SHADOW_RESOLUTION, this.SHADOW_RESOLUTION, Math.max(this.MAX_POINT_LIGHTS * 6, 1), 0, gl.DEPTH_COMPONENT, gl.FLOAT, null);

  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  // Attach the first layer of the texture array to the framebuffer's depth buffer
  // This layer will be changed when rendering each cascade
  gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, this.shadowScene.shadowCubemaps, 0, 0);

  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    console.error("Framebuffer is not complete");
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
};

WebGLRenderer.prototype.createShadowProgram = async function () {
  const gl = this.gl;
  let fsSource = this.shadowFSSource;
  let vsSource = this.shadowVSSource;
  let standardHeader = `#version 300 es\n`;
  let vertexShader = compileShader(gl, this.standardHeader+vsSource, gl.VERTEX_SHADER);
  let fragmentShader = compileShader(gl, this.standardHeader+fsSource, gl.FRAGMENT_SHADER);
  this.shadowScene.shadowProgram = gl.createProgram();
  gl.attachShader(this.shadowScene.shadowProgram, vertexShader);
  gl.attachShader(this.shadowScene.shadowProgram, fragmentShader);
  gl.linkProgram(this.shadowScene.shadowProgram);

  let vertexShaderSkinned = compileShader(gl, this.standardHeader+"#define SKINNED \n"+vsSource, gl.VERTEX_SHADER);
  let fragmentShaderSkinned = compileShader(gl, this.standardHeader+"#define SKINNED \n"+fsSource, gl.FRAGMENT_SHADER);
  this.shadowScene.shadowProgramSkinned = gl.createProgram();
  gl.attachShader(this.shadowScene.shadowProgramSkinned, vertexShaderSkinned);
  gl.attachShader(this.shadowScene.shadowProgramSkinned, fragmentShaderSkinned);
  gl.linkProgram(this.shadowScene.shadowProgramSkinned);

  if (!gl.getProgramParameter(this.shadowScene.shadowProgram, gl.LINK_STATUS)) {
    alert("Unable to initialize the shadow shader program: " + gl.getProgramInfoLog(shadowProgram));
  }

  if (!gl.getProgramParameter(this.shadowScene.shadowProgramSkinned, gl.LINK_STATUS)) {
    alert("Unable to initialize the skinned shadow shader program: " + gl.getProgramInfoLog(shadowProgram));
  }

  this.shadowScene.programInfo = {
    attribLocations: {
      vertexPosition: gl.getAttribLocation(this.shadowScene.shadowProgram, "a_position"),
    },
    uniformLocations: {
      projectionMatrix: gl.getUniformLocation(this.shadowScene.shadowProgram, "u_projectionMatrix"),
      modelViewMatrix: gl.getUniformLocation(this.shadowScene.shadowProgram, "u_modelViewMatrix"),
    },
  };
  this.shadowScene.programInfoSkinned = {
    attribLocations: {
      vertexPosition: gl.getAttribLocation(this.shadowScene.shadowProgramSkinned, "a_position"),
      jointIndices: gl.getAttribLocation(this.shadowScene.shadowProgramSkinned, "a_jointIndices"),
      jointWeights: gl.getAttribLocation(this.shadowScene.shadowProgramSkinned, "a_jointWeights"),
    },
    uniformLocations: {
      projectionMatrix: gl.getUniformLocation(this.shadowScene.shadowProgramSkinned, "u_projectionMatrix"),
      modelViewMatrix: gl.getUniformLocation(this.shadowScene.shadowProgramSkinned, "u_modelViewMatrix"),
      boneTransforms: gl.getUniformLocation(this.shadowScene.shadowProgramSkinned, "u_boneTransforms"),
      inverseBindMatrices: gl.getUniformLocation(this.shadowScene.shadowProgramSkinned, "u_inverseBindMatrices"),
    },
  };
};
