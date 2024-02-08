class WebGLRenderer {
  constructor(canvasID) {

    this.canvas = document.getElementById(canvasID);
    this.gl = this.canvas.getContext("webgl2");
    //print gl restrictions, for debugging
    this.printRestrictions()
    const gl = this.gl;
    this.matrices = {
      viewMatrix: mat4.create(),
      projectionMatrix: mat4.create(),
      viewMatrixInverse: mat4.create(),
    };

    //scene setup
    this.currentScene = {
      shadowScene: {},
      lights: [],
      objects: [],
      camera: {
        position: vec3.create(),
        lookAt: vec3.fromValues(0, 0, 0),
        up: vec3.fromValues(0, 1, 0),
      },
    };

    this.defaultDirection = vec3.fromValues(0, 0, -1); // Default direction
    vec3.normalize(this.defaultDirection, this.defaultDirection);

    //camera setup
    let fieldOfView = (80 * Math.PI) / 180; // in radians
    let aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    let zNear = 0.1;
    let zFar = 1000.0;
    let projectionMatrix = mat4.create();
    this.currentScene.camera.fieldOfView = fieldOfView;
    this.currentScene.camera.aspect = aspect;
    this.currentScene.camera.zNear = zNear;
    this.currentScene.camera.zFar = zFar;

    mat4.perspective(projectionMatrix, fieldOfView, aspect, zNear, zFar);
    this.matrices.projectionMatrix = projectionMatrix;

    //shadow setup
    this.SHADOW_WIDTH = 2048;//8192;
    this.SHADOW_HEIGHT = 2048;//8192;
    this.SHADOW_CASCADE_DISTANCE = 100;

    this.NUM_SHADOW_CASCADES = 3;
    this.currentScene.shadowScene.cascadeSplits = calculateCascadeSplits(
      this.NUM_SHADOW_CASCADES,
      this.currentScene.camera.zNear,
      this.currentScene.camera.zFar,
      this.SHADOW_CASCADE_DISTANCE,
    );

    this.MAX_DIRECTIONAL_LIGHTS = 2;
    this.MAX_SPOT_LIGHTS = 5;
    this.MAX_POINT_LIGHTS = 2
    this.MAX_LIGHTS = this.MAX_DIRECTIONAL_LIGHTS+this.MAX_SPOT_LIGHTS+this.MAX_POINT_LIGHTS;

    //shader variants for conditional compilation
    this.SHADER_VARIANTS = {
      SHADER_VARIANT_NORMAL_MAP: 0b1,
      SHADER_VARIANT_BAKED_AO: 0b10,
      SHADER_VARIANT_PARALLAX: 0b100,
      SHADER_VARIANT_PBR: 0b1000,
      SHADER_VARIANT_OPACITY_MAP: 0b10000,
    };

    this.shaderProgramVariants = {};
    this.buffers = {
      uniformLocations: {}

    };

    this.createUBOs();

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.blendEquation(gl.FUNC_ADD);

    this.initLightVectors();

    // Camera control parameters
    this.mouseDown = false;
    this.lastMouseX = null;
    this.lastMouseY = null;

    this.horizontalAngle = Math.PI / 2;
    this.verticalAngle = Math.PI / 2;
    this.distanceFromOrigin = 40; // Adjust as necessary
    this.createCallbacks();
  }
  addObject(object) {
    this.currentScene.objects.push(object);
  }
  addLight(light) {
    this.currentScene.lights.push(light);
    this.initLightVectors();
  }
  getProgram(fsSource, vsSource, variantID){
    const gl = this.gl;

      let defines = "#version 300 es\n";
      if (variantID & this.SHADER_VARIANTS.SHADER_VARIANT_NORMAL_MAP) {
        defines += "#define USE_NORMAL_MAP\n";
      }
      if (variantID & this.SHADER_VARIANTS.SHADER_VARIANT_BAKED_AO) {
        defines += "#define USE_BAKED_AO\n";
      }
      if (variantID & this.SHADER_VARIANTS.SHADER_VARIANT_PARALLAX) {
        defines += "#define USE_PARALLAX\n";
      }
      if (variantID & this.SHADER_VARIANTS.SHADER_VARIANT_PBR) {
        defines += "#define USE_PBR\n";
      }
      if (variantID & this.SHADER_VARIANTS.SHADER_VARIANT_OPACITY_MAP) {
        defines += "#define USE_OPACITY_MAP\n";
      }
      let vertexShader = compileShader(gl, defines + vsSource, gl.VERTEX_SHADER);
      let fragmentShader = compileShader(gl, defines + fsSource, gl.FRAGMENT_SHADER);

      let shaderProgram = gl.createProgram();
      gl.attachShader(shaderProgram, vertexShader);
      gl.attachShader(shaderProgram, fragmentShader);
      gl.linkProgram(shaderProgram);
      return shaderProgram;
  }
  async createUBOs() {
    const gl = this.gl;
    let fsSource = primaryFSSource;
    let vsSource = primaryVSSource;
    //create dummy program with all uniforms
    let shaderProgram = this.getProgram(fsSource, vsSource, 0b00000);

    this.buffers.perFrameUBOBindingLocation = 0;
    this.buffers.perMaterialUBOBindingLocation = 1;
    this.buffers.lightUBOBindingLocation = 2;

    //get uniform block info
    const perFrameBlockName = "FSPerFrame";
    const perMaterialBlockName = "FSPerMaterial";
    const lightBlockName = "FSLightInfo";
    const perFrameBlockIndex = gl.getUniformBlockIndex(shaderProgram, perFrameBlockName);
    const perMaterialBlockIndex = gl.getUniformBlockIndex(shaderProgram, perMaterialBlockName);
    const lightBlockIndex = gl.getUniformBlockIndex(shaderProgram, lightBlockName);
    const perFrameBlockSize = gl.getActiveUniformBlockParameter(shaderProgram, perFrameBlockIndex, gl.UNIFORM_BLOCK_DATA_SIZE);
    const perMaterialBlockSize = gl.getActiveUniformBlockParameter(shaderProgram, perMaterialBlockIndex, gl.UNIFORM_BLOCK_DATA_SIZE);
    const lightBlockSize = gl.getActiveUniformBlockParameter(shaderProgram, lightBlockIndex, gl.UNIFORM_BLOCK_DATA_SIZE);

    //create CPU-side buffers
    this.buffers.perFrameBufferData = new ArrayBuffer(perFrameBlockSize);
    this.buffers.perMaterialBufferData = new ArrayBuffer(perMaterialBlockSize);
    this.buffers.lightBufferData = new ArrayBuffer(lightBlockSize);

    //create data views for accessing CPU-side buffers
    this.buffers.perFrameDataView = new DataView(this.buffers.perFrameBufferData);
    this.buffers.perMaterialDataView = new DataView(this.buffers.perMaterialBufferData);
    this.buffers.lightDataView = new DataView(this.buffers.lightBufferData);

    //create GPU-side buffers
    this.buffers.perFrameUBO = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.buffers.perFrameUBO);
    gl.bufferData(gl.UNIFORM_BUFFER, perFrameBlockSize, gl.DYNAMIC_DRAW);

    this.buffers.perMaterialUBO = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.buffers.perMaterialUBO);
    gl.bufferData(gl.UNIFORM_BUFFER, perMaterialBlockSize, gl.DYNAMIC_DRAW);

    this.buffers.lightUBO = gl.createBuffer();
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.buffers.lightUBO);
    gl.bufferData(gl.UNIFORM_BUFFER, lightBlockSize, gl.DYNAMIC_DRAW);

    const perFrameUniformNames = ["u_viewMatrixInverse"];
    const perMaterialUniformNames = ["u_ambientStrength", "u_specularStrength"];
    const lightUniformNames = ["u_lightProperties", "u_numLights", "u_lightPosViewSpace", "u_lightDirViewSpace", "u_lightAttenuation", "u_lightColor", "u_lightSpaceMatrices", "u_lightCascadeMatrices", "u_lightCubemapMatrices", "u_cascadeSplits"];

    //get uniform offsets by name
    gl.uniformBlockBinding(shaderProgram, perFrameBlockIndex, this.buffers.perFrameUBOBindingLocation);
    const perFrameUniformIndices = gl.getUniformIndices(shaderProgram, perFrameUniformNames);
    const perFrameUniformOffsets = gl.getActiveUniforms(shaderProgram, perFrameUniformIndices, gl.UNIFORM_OFFSET);
    gl.uniformBlockBinding(shaderProgram, perMaterialBlockIndex, this.buffers.perMaterialUBOBindingLocation);
    const perMaterialUniformIndices = gl.getUniformIndices(shaderProgram, perMaterialUniformNames);
    const perMaterialUniformOffsets = gl.getActiveUniforms(shaderProgram, perMaterialUniformIndices, gl.UNIFORM_OFFSET);
    gl.uniformBlockBinding(shaderProgram, lightBlockIndex, this.buffers.lightUBOBindingLocation);
    const lightUniformIndices = gl.getUniformIndices(shaderProgram, lightUniformNames);
    const lightUniformOffsets = gl.getActiveUniforms(shaderProgram, lightUniformIndices, gl.UNIFORM_OFFSET);

    this.buffers.uniformLocations.perFrameUniformLocations = {}
    this.buffers.uniformLocations.perMaterialUniformLocations = {}
    this.buffers.uniformLocations.lightUniformLocations = {}
    for (let i=0; i<perFrameUniformNames.length; i++){
      this.buffers.uniformLocations.perFrameUniformLocations[perFrameUniformNames[i]]=perFrameUniformOffsets[i]
    }
    for (let i=0; i<perMaterialUniformNames.length; i++){
      this.buffers.uniformLocations.perMaterialUniformLocations[perMaterialUniformNames[i]]=perMaterialUniformOffsets[i]
    }
    for (let i=0; i<lightUniformNames.length; i++){
      this.buffers.uniformLocations.lightUniformLocations[lightUniformNames[i]]=lightUniformOffsets[i]
    }

    console.log("created UBOs");
  }
  async createProgramVariants(shaderVariantsToCompile) {
    const gl = this.gl;
    let fsSource = primaryFSSource;
    let vsSource = primaryVSSource;

    for (const variantID of shaderVariantsToCompile) {
      shaderProgram = this.getProgram(fsSource, vsSource, variantID);

      //bind UBOs
      let perFrameIndex = gl.getUniformBlockIndex(shaderProgram, "FSPerFrame");
      gl.uniformBlockBinding(shaderProgram, perFrameIndex, this.buffers.perFrameUBOBindingLocation);
      gl.bindBufferBase(gl.UNIFORM_BUFFER, this.buffers.perFrameUBOBindingLocation, this.buffers.perFrameUBO);

      let perMaterialIndex = gl.getUniformBlockIndex(shaderProgram, "FSPerMaterial");
      gl.uniformBlockBinding(shaderProgram, perMaterialIndex, this.buffers.perMaterialUBOBindingLocation);
      gl.bindBufferBase(gl.UNIFORM_BUFFER, this.buffers.perMaterialUBOBindingLocation, this.buffers.perMaterialUBO);

      let lightInfoIndex = gl.getUniformBlockIndex(shaderProgram, "FSLightInfo");
      gl.uniformBlockBinding(shaderProgram, lightInfoIndex, this.buffers.lightUBOBindingLocation);
      gl.bindBufferBase(gl.UNIFORM_BUFFER, this.buffers.lightUBOBindingLocation, this.buffers.lightUBO);

      let programInfo = {
        program: shaderProgram,
        attribLocations: {
          vertexPosition: gl.getAttribLocation(shaderProgram, "a_position"),
          vertexNormal: gl.getAttribLocation(shaderProgram, "a_normal"),
          texCoord: gl.getAttribLocation(shaderProgram, "a_texCoord"),
        },
        uniformLocations: {
          projectionMatrix: gl.getUniformLocation(shaderProgram, "u_projectionMatrix"),
          modelViewMatrix: gl.getUniformLocation(shaderProgram, "u_modelViewMatrix"),
          normalMatrix: gl.getUniformLocation(shaderProgram, "u_normalMatrix"),
          objectTexture: gl.getUniformLocation(shaderProgram, "u_baseColorTexture"),
        },
        textureLocations: {
          
        }
      };
      //conditional attributes and uniforms
      if (variantID & this.SHADER_VARIANTS.SHADER_VARIANT_NORMAL_MAP) {
        //programInfo.uniformLocations.modelMatrix = gl.getUniformLocation(shaderProgram, 'u_modelMatrix');
        programInfo.attribLocations.vertexTangent = gl.getAttribLocation(shaderProgram, "a_tangent");
        programInfo.attribLocations.vertexBitangent = gl.getAttribLocation(shaderProgram, "a_bitangent");
        programInfo.textureLocations.normalTexture = gl.getUniformLocation(shaderProgram, "u_normalMap");
      }
      if (variantID & this.SHADER_VARIANTS.SHADER_VARIANT_BAKED_AO) {
        programInfo.textureLocations.aoTexture = gl.getUniformLocation(shaderProgram, "u_aoMap");
      }
      if (variantID & this.SHADER_VARIANTS.SHADER_VARIANT_PARALLAX) {
        programInfo.textureLocations.heightMap = gl.getUniformLocation(shaderProgram, "u_heightMap");
      }
      if (variantID & this.SHADER_VARIANTS.SHADER_VARIANT_PBR) {
        programInfo.textureLocations.metallic = gl.getUniformLocation(shaderProgram, "u_metallic");
        programInfo.textureLocations.roughness = gl.getUniformLocation(shaderProgram, "u_roughness");
      }
      if (variantID & this.SHADER_VARIANTS.SHADER_VARIANT_OPACITY_MAP) {
        programInfo.textureLocations.opacity = gl.getUniformLocation(shaderProgram, "u_opacity");
      }
      this.shaderProgramVariants[variantID] = programInfo;
    }
  }

  updateScene() {
    for (let entity of this.currentScene.objects) {
      entity.update();
    }
    for (let entity of this.currentScene.lights) {
      entity.update();
    }
  }

  async drawScene() {
    const gl = this.gl;
    this.updateScene();
    this.updateLights();
    // if we haven't initialized shadow scene, do that. This cannot be in constructor because async.
    if (this.currentScene.shadowScene.shadowCascadeFramebuffer == null) {
      await this.initShadowScene();
    }
    this.shadowPass();
    gl.clearColor(0.0, 0.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const currentScene = this.currentScene;
    // drawFullscreenQuad(gl, currentScene.shadowScene.shadowCubemaps, 1);
    // this.updateCamera();
    // return;
    for (const object of currentScene.objects) {
      //compile shaders on first occurence of variant, shortens startup at cost of some stutter on object load
      if (!this.shaderProgramVariants[object.shaderVariant]) {
        await this.createProgramVariants([object.shaderVariant]);
      }
      const programInfo = this.shaderProgramVariants[object.shaderVariant];
      gl.useProgram(programInfo.program);

      gl.uniform1f(programInfo.uniformLocations.ambientLightStrength, 0.005);
      gl.uniform1f(programInfo.uniformLocations.specularLightStrength, 1);

      gl.uniform1i(programInfo.uniformLocations.numLights, currentScene.lights.length);
      gl.uniform4fv(programInfo.uniformLocations.lightPosViewSpace, currentScene.lightPositionsData);
      gl.uniform4fv(programInfo.uniformLocations.lightColor, currentScene.lightColorsData);
      gl.uniform4fv(programInfo.uniformLocations.lightAttenuation, currentScene.lightAttenuationsData);
      gl.uniform4fv(programInfo.uniformLocations.lightProperties, currentScene.lightPropertiesData);
      gl.uniform4fv(programInfo.uniformLocations.lightDirection, currentScene.lightDirectionsData);

      //bind shadow maps
      gl.uniform1i(programInfo.uniformLocations.numShadowCastingLights, 1);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, currentScene.shadowScene.shadowCascades); // Bind shadow map texture array
      gl.uniform1i(programInfo.uniformLocations.shadowCascades, 0);

      for(let i=0; i<this.NUM_SHADOW_CASCADES; i++){
        gl.uniform1f(programInfo.uniformLocations.cascadeSplits[i], this.currentScene.shadowScene.cascadeSplits[i]);
      }

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, currentScene.shadowScene.shadowMaps); // Bind shadow map texture array
      gl.uniform1i(programInfo.uniformLocations.shadowMaps, 1);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, currentScene.shadowScene.shadowCubemaps); // Bind shadow map texture array
      gl.uniform1i(programInfo.uniformLocations.shadowCubemaps, 2);

      let textureUnitAfterShadowMaps = 3;
      let dirLightNum = 0;
      let spotLightNum = 0;
      let pointLightNum = 0;

      for(const light of currentScene.lights){
        switch (light.type){
          case LightType.DIRECTIONAL:
            for(let j=0; j<this.NUM_SHADOW_CASCADES; j++){
              let lightSpaceMatrix = mat4.create();
              mat4.multiply(lightSpaceMatrix, light.cascades[j].orthoMatrix, light.cascades[j].viewMatrix);
              gl.uniformMatrix4fv(programInfo.uniformLocations.lightCascadeMatrices[dirLightNum*this.NUM_SHADOW_CASCADES+j], false, lightSpaceMatrix);
            }
            dirLightNum++;
            break;
          case LightType.SPOT:
            let lightSpaceMatrix = mat4.create();
            mat4.multiply(lightSpaceMatrix, light.projectionMatrix, light.viewMatrix);
            gl.uniformMatrix4fv(programInfo.uniformLocations.lightSpaceMatrices[spotLightNum], false, lightSpaceMatrix);
            spotLightNum++;
            break;
          case LightType.POINT:
            for(let i=0; i<6; i++){
              let lightSpaceMatrix = mat4.create();
              mat4.multiply(lightSpaceMatrix, light.projectionMatrix, light.cubemapViewMatrices[i]);
              gl.uniformMatrix4fv(programInfo.uniformLocations.lightCubemapMatrices[pointLightNum*6+i], false, lightSpaceMatrix);
            }
            pointLightNum++;
            break;
        }
      }

      //gl.uniform3f(programInfo.uniformLocations.viewPos, 0, 0, 0);
      let modelViewMatrix = mat4.create();
      mat4.multiply(modelViewMatrix, this.matrices.viewMatrix, object.transform.modelMatrix);

      gl.uniformMatrix4fv(programInfo.uniformLocations.modelViewMatrix, false, modelViewMatrix);
      gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, this.matrices.projectionMatrix);

      gl.uniformMatrix4fv(programInfo.uniformLocations.viewMatrixInverse, false, this.matrices.viewMatrixInverse);

      let normalMatrix = calculateNormalMatrix(modelViewMatrix);
      gl.uniformMatrix3fv(programInfo.uniformLocations.normalMatrix, false, normalMatrix);

      if (object.shaderVariant & this.SHADER_VARIANTS.SHADER_VARIANT_NORMAL_MAP) {
        gl.uniformMatrix4fv(programInfo.uniformLocations.modelMatrix, false, object.transform.modelMatrix);
      }
      let i = 0;
      for (const mesh of object.meshes) {
        //vertices
        gl.bindVertexArray(mesh.vao);

        let textureUnit = textureUnitAfterShadowMaps;
        //base texture
        gl.activeTexture(gl.TEXTURE0 + textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, object.textures[i]);
        gl.uniform1i(programInfo.uniformLocations.objectTexture, textureUnit);
        textureUnit += 1;

        //if we have a normal map for this mesh
        if (object.shaderVariant & this.SHADER_VARIANTS.SHADER_VARIANT_NORMAL_MAP) {
          //tangent
          gl.bindBuffer(gl.ARRAY_BUFFER, mesh.tangentBuffer);
          gl.vertexAttribPointer(programInfo.attribLocations.vertexTangent, 3, gl.FLOAT, false, 0, 0);
          gl.enableVertexAttribArray(programInfo.attribLocations.vertexTangent);
          //bitangent
          gl.bindBuffer(gl.ARRAY_BUFFER, mesh.bitangentBuffer);
          gl.vertexAttribPointer(programInfo.attribLocations.vertexBitangent, 3, gl.FLOAT, false, 0, 0);
          gl.enableVertexAttribArray(programInfo.attribLocations.vertexBitangent);
          //normal map
          gl.activeTexture(gl.TEXTURE0 + textureUnit);
          gl.bindTexture(gl.TEXTURE_2D, object.normals[i]);
          gl.uniform1i(programInfo.uniformLocations.normalTexture, textureUnit);
          textureUnit += 1;
        }
        //ao texture
        if (object.shaderVariant & this.SHADER_VARIANTS.SHADER_VARIANT_BAKED_AO) {
          gl.activeTexture(gl.TEXTURE0 + textureUnit);
          gl.bindTexture(gl.TEXTURE_2D, object.aoMaps[i]);
          gl.uniform1i(programInfo.uniformLocations.aoTexture, textureUnit);
          textureUnit += 1;
        }
        //height texture
        if (object.shaderVariant & this.SHADER_VARIANTS.SHADER_VARIANT_PARALLAX) {
          gl.activeTexture(gl.TEXTURE0 + textureUnit);
          gl.bindTexture(gl.TEXTURE_2D, object.heightMaps[i]);
          gl.uniform1i(programInfo.uniformLocations.heightMap, textureUnit);
          textureUnit += 1;
        }
        //PBR metallic & roughness textures
        if (object.shaderVariant & this.SHADER_VARIANTS.SHADER_VARIANT_PBR) {
          gl.activeTexture(gl.TEXTURE0 + textureUnit);
          gl.bindTexture(gl.TEXTURE_2D, object.metallic[i]);
          gl.uniform1i(programInfo.uniformLocations.metallic, textureUnit);
          textureUnit += 1;
          gl.activeTexture(gl.TEXTURE0 + textureUnit);
          gl.bindTexture(gl.TEXTURE_2D, object.roughness[i]);
          gl.uniform1i(programInfo.uniformLocations.roughness, textureUnit);
          textureUnit += 1;
        }
        //Opacity texture, if object uses one
        if (object.shaderVariant & this.SHADER_VARIANTS.SHADER_VARIANT_OPACITY_MAP) {
          gl.activeTexture(gl.TEXTURE0 + textureUnit);
          gl.bindTexture(gl.TEXTURE_2D, object.opacity[i]);
          gl.uniform1i(programInfo.uniformLocations.opacity, textureUnit);
          textureUnit += 1;
        }

        gl.drawArrays(gl.TRIANGLES, 0, mesh.vertices.length / 3);
        gl.bindVertexArray(null);
        i += 1;
      }
      //console.log("done with object")
    }
    this.updateCamera();
  }
  updateLights() {
    let frustrumCorners = getFrustumCorners(this.currentScene.camera.fieldOfView, this.currentScene.camera.aspect, this.currentScene.camera.zNear, this.currentScene.camera.zFar, this.matrices.viewMatrixInverse);
    let frustrumCenter = getFrustumCenter(this.currentScene.camera.position, calculateForwardVector(this.currentScene.camera.position, this.currentScene.camera.lookAt), this.currentScene.camera.zNear, this.currentScene.camera.zFar);
    this.currentScene.numLights = this.currentScene.lights.length;
    for (let i = 0; i < this.currentScene.lights.length; i++) {
      let lightPosWorld = this.currentScene.lights[i].transform.pos;
      let lightPosView = vec3.create();
      vec3.transformMat4(lightPosView, lightPosWorld, this.matrices.viewMatrix);

      this.currentScene.lightPositionsData[i * 4] = lightPosView[0];
      this.currentScene.lightPositionsData[i * 4 + 1] = lightPosView[1];
      this.currentScene.lightPositionsData[i * 4 + 2] = lightPosView[2];
      this.currentScene.lightPositionsData[i * 4 + 3] = 0; //padding for uniform block alignment, unused in shader

      this.currentScene.lightAttenuationsData[i * 4] = this.currentScene.lights[i].constantAttenuation;
      this.currentScene.lightAttenuationsData[i * 4 + 1] = this.currentScene.lights[i].linearAttenuation;
      this.currentScene.lightAttenuationsData[i * 4 + 2] = this.currentScene.lights[i].quadraticAttenuation;

      let lightColor = this.currentScene.lights[i].color;
      let lightIntensity = this.currentScene.lights[i].intensity;
      this.currentScene.lightColorsData[i * 4] = lightColor[0]*lightIntensity;
      this.currentScene.lightColorsData[i * 4 + 1] = lightColor[1]*lightIntensity;
      this.currentScene.lightColorsData[i * 4 + 2] = lightColor[2]*lightIntensity;
      this.currentScene.lightColorsData[i * 4 + 3] = 1.0;

      let lightDirWorld = this.currentScene.lights[i].getLightDir();
      let lightDirView = vec3.create();
      let viewMatrix3x3 = mat3.create();
      mat3.fromMat4(viewMatrix3x3, this.matrices.viewMatrix); // Extract the upper-left 3x3 part
      vec3.transformMat3(lightDirView, lightDirWorld, viewMatrix3x3);

      this.currentScene.lightDirectionsData[i * 4] = lightDirView[0];
      this.currentScene.lightDirectionsData[i * 4 + 1] = lightDirView[1];
      this.currentScene.lightDirectionsData[i * 4 + 2] = lightDirView[2];

      this.currentScene.lightPropertiesData[i * 4] = this.currentScene.lights[i].type;
      if (this.currentScene.lights[i].type == LightType.SPOT) {
        this.currentScene.lightPropertiesData[i * 4 + 1] = Math.cos(this.currentScene.lights[i].innerConeAngle);
        this.currentScene.lightPropertiesData[i * 4 + 2] = Math.cos(this.currentScene.lights[i].outerConeAngle);
      }
      if (this.currentScene.lights[i].type == LightType.DIRECTIONAL) {
        this.currentScene.lights[i].cascades = setupCascades(this.NUM_SHADOW_CASCADES, this.currentScene.lights[i], this.currentScene.camera, this.currentScene.shadowScene.cascadeSplits);
      }
    }
  }

  initLightVectors() {
    this.currentScene.lightPositionsData = new Float32Array(this.MAX_LIGHTS * 4);
    this.currentScene.lightColorsData = new Float32Array(this.MAX_LIGHTS * 4);
    this.currentScene.lightAttenuationsData = new Float32Array(this.MAX_LIGHTS * 4);
    this.currentScene.lightDirectionsData = new Float32Array(this.MAX_LIGHTS * 4);
    this.currentScene.lightPropertiesData = new Float32Array(this.MAX_LIGHTS * 4);
  }
  createCallbacks() {
    // Event listeners
    this.canvas.onmousedown = (event) => {
      this.mouseDown = true;
      this.lastMouseX = event.clientX;
      this.lastMouseY = event.clientY;
    };

    document.onmouseup = (event) => {
      this.mouseDown = false;
    };

    document.onmousemove = (event) => {
      if (!this.mouseDown) {
        return;
      }
      var newX = event.clientX;
      var newY = event.clientY;

      var deltaX = newX - this.lastMouseX;
      var deltaY = newY - this.lastMouseY;

      this.horizontalAngle += deltaX * 0.005; // Adjust sensitivity
      this.verticalAngle -= deltaY * 0.005; // Adjust sensitivity
      //console.log(verticalAngle)
      if (this.verticalAngle < 0.0000001) {
        this.verticalAngle = 0.0000001;
      }
      if (this.verticalAngle > Math.PI) {
        this.verticalAngle = Math.PI;
      }

      this.updateCamera();

      this.lastMouseX = newX;
      this.lastMouseY = newY;
    };

    // Scroll wheel event listener
    this.canvas.addEventListener("wheel", (event) => {
      // Determine the direction of scrolling (normalize across different browsers)
      let delta = Math.sign(event.deltaY);

      // Adjust zoom level
      this.distanceFromOrigin += delta * 1; // Adjust zoom speed as necessary
      this.distanceFromOrigin = Math.max(0.1, this.distanceFromOrigin); // Prevents zooming too close, adjust as necessary

      // Update camera
      this.updateCamera();
    });
  }
  updateCamera() {
    // Ensure the vertical angle is within limits
    this.verticalAngle = Math.max(0, Math.min(Math.PI, this.verticalAngle));

    // Calculate camera position using spherical coordinates
    var x = this.distanceFromOrigin * Math.sin(this.verticalAngle) * Math.cos(this.horizontalAngle);
    var y = this.distanceFromOrigin * Math.cos(this.verticalAngle);
    var z = this.distanceFromOrigin * Math.sin(this.verticalAngle) * Math.sin(this.horizontalAngle);

    this.currentScene.camera.position[0] = x;
    this.currentScene.camera.position[1] = y;
    this.currentScene.camera.position[2] = z;

    // Update view matrix

    mat4.lookAt(this.matrices.viewMatrix, [x, y, z], [0, 0, 0], [0, 1, 0]); // Adjust up vector as needed
    mat4.invert(this.matrices.viewMatrixInverse, this.matrices.viewMatrix);
  }
  async loadModel(modelDescription) {
    const gl = this.gl;
    let textures = [];
    let normals = [];
    let aoMaps = [];
    let heightMaps = [];
    let metallic = [];
    let roughness = [];
    let opacity = [];
    let shaderVariant = 0;
    try {
      for (const textureName of modelDescription.textures) {
        let textureImage = await loadTexture("textures/" + textureName);
        let texture = createWebGLTexture(gl, textureImage, false, true);
        textures.push(texture);
      }
    } catch {
      console.log("Object " + modelDescription.model + " has no texture");
    }

    try {
      for (const textureName of modelDescription.normals) {
        let normalImage = await loadTexture("textures/" + textureName);
        let normalTexture = createWebGLTexture(gl, normalImage, false, true);
        normals.push(normalTexture);
      }
      shaderVariant |= this.SHADER_VARIANTS.SHADER_VARIANT_NORMAL_MAP;
    } catch {
      console.log("Object " + modelDescription.model + " has no normals");
    }

    try {
      for (const textureName of modelDescription.aoMaps) {
        let aoImage = await loadTexture("textures/" + textureName);
        let aoTexture = createWebGLTexture(gl, aoImage);
        aoMaps.push(aoTexture);
      }
      shaderVariant |= this.SHADER_VARIANTS.SHADER_VARIANT_BAKED_AO;
    } catch {
      console.log("Object " + modelDescription.model + " has no ao maps");
    }

    try {
      for (const textureName of modelDescription.heightMaps) {
        let heightMapImage = await loadTexture("textures/" + textureName);
        let heightMapTexture = createWebGLTexture(gl, heightMapImage);
        heightMaps.push(heightMapTexture);
      }
      shaderVariant |= this.SHADER_VARIANTS.SHADER_VARIANT_PARALLAX;
    } catch {
      console.log("Object " + modelDescription.model + " has no height maps");
    }

    try {
      for (const textureName of modelDescription.metallic) {
        let metallicImage = await loadTexture("textures/" + textureName);
        let metallicTexture = createWebGLTexture(gl, metallicImage, false, true);
        metallic.push(metallicTexture);
      }
      shaderVariant |= this.SHADER_VARIANTS.SHADER_VARIANT_PBR;
    } catch {
      console.log("Object " + modelDescription.model + " has no metallic texture");
    }

    try {
      for (const textureName of modelDescription.roughness) {
        let roughnessImage = await loadTexture("textures/" + textureName);
        let roughnessTexture = createWebGLTexture(gl, roughnessImage, false, true);
        roughness.push(roughnessTexture);
      }
      shaderVariant |= this.SHADER_VARIANTS.SHADER_VARIANT_PBR;
    } catch {
      console.log("Object " + modelDescription.model + " has no roughness texture");
    }
    try {
      for (const textureName of modelDescription.opacity) {
        let opacityImage = await loadTexture("textures/" + textureName);
        let opacityTexture = createWebGLTexture(gl, opacityImage);
        opacity.push(opacityTexture);
      }
      shaderVariant |= this.SHADER_VARIANTS.SHADER_VARIANT_OPACITY_MAP;
    } catch {
      console.log("Object " + modelDescription.model + " has no opacity texture");
    }

    let objectData = await getObj("objects/" + modelDescription.model);
    console.log(objectData);
    return createRenderable(gl, objectData, shaderVariant, textures, normals, aoMaps, heightMaps, metallic, roughness, opacity);
  }
  printRestrictions(){
    console.log("Max texture size: "+this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE));
    console.log("Max texture layers: "+this.gl.getParameter(this.gl.MAX_ARRAY_TEXTURE_LAYERS));
    console.log("Max cubemap dimensions: "+this.gl.getParameter(this.gl.MAX_CUBE_MAP_TEXTURE_SIZE));
    console.log("Max vertex uniforms: "+this.gl.getParameter(this.gl.MAX_VERTEX_UNIFORM_VECTORS));
    console.log("Max fragment uniforms: "+this.gl.getParameter(this.gl.MAX_FRAGMENT_UNIFORM_VECTORS));
    console.log("Max fragment uniform blocks: "+this.gl.getParameter(this.gl.MAX_FRAGMENT_UNIFORM_BLOCKS));
  }
}
