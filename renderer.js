class WebGLRenderer {
  constructor(canvasID) {
    this.canvas = document.getElementById(canvasID);
    this.gl = this.canvas.getContext("webgl2");
    var vertElem = document.getElementById("primaryVSSource");
    var fragElem = document.getElementById("primaryFSSource");
    this.primaryVSSource = vertElem.text;
    this.primaryFSSource = fragElem.text;


    //print gl restrictions, for debugging
    this.printRestrictions();
    const gl = this.gl;
    this.matrices = {
      viewMatrix: mat4.create(),
      projectionMatrix: mat4.create(),
      viewMatrixInverse: mat4.create(),
    };

    //scene setup
    this.currentScene = {
      nextObjectID: 0,
      shadowScene: {},
      lights: {},
      numLights: 0,
      objects: {},
      numObjects: 0,
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
    this.SHADOW_WIDTH = 2048; //8192;
    this.SHADOW_HEIGHT = 2048; //8192;
    this.SHADOW_CASCADE_DISTANCE = 100;

    this.NUM_SHADOW_CASCADES = 3;
    this.currentScene.shadowScene.cascadeSplits = calculateCascadeSplits(this.NUM_SHADOW_CASCADES, this.currentScene.camera.zNear, this.currentScene.camera.zFar, this.SHADOW_CASCADE_DISTANCE);

    this.MAX_DIRECTIONAL_LIGHTS = 2;
    this.MAX_SPOT_LIGHTS = 5;
    this.MAX_POINT_LIGHTS = 2;
    this.MAX_LIGHTS = this.MAX_DIRECTIONAL_LIGHTS + this.MAX_SPOT_LIGHTS + this.MAX_POINT_LIGHTS;

    this.standardHeader = `#version 300 es
    #define MAX_DIRECTIONAL_LIGHTS `+this.MAX_DIRECTIONAL_LIGHTS+`
    #define MAX_SPOT_LIGHTS `+this.MAX_SPOT_LIGHTS+`
    #define MAX_POINT_LIGHTS `+this.MAX_POINT_LIGHTS+`
    #define MAX_LIGHTS `+this.MAX_LIGHTS+`
    #define NUM_CASCADE_SPLITS `+this.NUM_SHADOW_CASCADES+`
    precision highp float;
    precision highp int;\n`

    //shader variants for conditional compilation
    this.SHADER_VARIANTS = {
      SHADER_VARIANT_NORMAL_MAP: 0b1,
      SHADER_VARIANT_BAKED_AO: 0b10,
      SHADER_VARIANT_PARALLAX: 0b100,
      SHADER_VARIANT_PBR: 0b1000,
      SHADER_VARIANT_OPACITY_MAP: 0b10000,
      SHADER_VARIANT_INVERT_NORMAL_MAP: 0b100000,
      SHADER_VARIANT_WIREFRAME: 0b1000000,
      SHADER_VARIANT_FORCE_GOURAUD: 0b10000000,
    };

    this.shaderProgramVariants = {};
    this.buffers = {
      uniformLocations: {},
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
    this.distanceFromOrigin = 25;
    this.createCallbacks();

    this.forceWireframe = false;
    this.forceGouraud = false;

    this.initLineRenderer();
    this.sceneRoot = new SceneNode();
  }
  addObject(object) {
    this.numObjects++;
    this.sceneRoot.addChild(object);
    object.localID = this.currentScene.nextObjectID;
    this.currentScene.objects[this.currentScene.nextObjectID] = object;
    this.currentScene.nextObjectID++;
    return object.localID;
  }
  removeObject(objectID) {
    this.numObjects--;
    let object = this.currentScene.objects[objectID];
    if (object.parent != null){
      object.parent.removeChild(objectID);
    }
    delete this.currentScene.objects[objectID];
  }
  getObjectById(objectID){
    let object = this.currentScene.objects[objectID];
    return  object === undefined ? this.currentScene.lights[objectID] : object;
  }
  addLight(light) {
    this.currentScene.numLights++;
    this.sceneRoot.addChild(light);
    light.localID = this.currentScene.nextObjectID;
    this.currentScene.lights[this.currentScene.nextObjectID] = light;
    this.currentScene.nextObjectID++;
    this.buffers.lightDataView.setInt32(this.buffers.uniformLocations.lightUniformLocations.u_numLights, this.currentScene.numLights, true);
    this.initLightVectors();
    
    if (light.type == LightType.DIRECTIONAL){
      this.updateCascades();
    }
  }
  getProgram(fsSource, vsSource, variantID) {
    const gl = this.gl;

    let defines = this.standardHeader;
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
    if (variantID & this.SHADER_VARIANTS.SHADER_VARIANT_INVERT_NORMAL_MAP) {
      defines += "#define INVERT_NORMAL_MAP\n";
    }
    if (variantID & this.SHADER_VARIANTS.SHADER_VARIANT_WIREFRAME) {
      defines += "#define WIREFRAME\n";
    }
    if (variantID & this.SHADER_VARIANTS.SHADER_VARIANT_FORCE_GOURAUD) {
      defines += "#define GOURAUD\n";
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
    let fsSource = this.primaryFSSource;
    let vsSource = this.primaryVSSource;
    //create dummy program with all uniforms
    let shaderProgram = this.getProgram(fsSource, vsSource, 0b00000);

    this.buffers.perFrameUBOBindingLocation = 0;
    this.buffers.perMaterialUBOBindingLocation = 1;
    this.buffers.lightUBOBindingLocation = 2;

    //get uniform block info
    const perFrameBlockName = "PerFrame";
    const perMaterialBlockName = "PerMaterial";
    const lightBlockName = "LightInfo";
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
    // const ones = new Float32Array(lightBlockSize).fill(1);
    // gl.bufferSubData(gl.UNIFORM_BUFFER, 0, ones);

    const perFrameUniformNames = ["u_viewMatrixInverse"];
    const perMaterialUniformNames = ["u_ambientStrength", "u_textureScale", "u_specularStrength"];
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

    this.buffers.uniformLocations.perFrameUniformLocations = {};
    this.buffers.uniformLocations.perMaterialUniformLocations = {};
    this.buffers.uniformLocations.lightUniformLocations = {};
    for (let i = 0; i < perFrameUniformNames.length; i++) {
      this.buffers.uniformLocations.perFrameUniformLocations[perFrameUniformNames[i]] = perFrameUniformOffsets[i];
    }
    for (let i = 0; i < perMaterialUniformNames.length; i++) {
      this.buffers.uniformLocations.perMaterialUniformLocations[perMaterialUniformNames[i]] = perMaterialUniformOffsets[i];
    }
    for (let i = 0; i < lightUniformNames.length; i++) {
      this.buffers.uniformLocations.lightUniformLocations[lightUniformNames[i]] = lightUniformOffsets[i];
    }

    //set constant cascade splits. TODO: Move these to a PerProgram buffer?
    dataViewSetFloatArray(this.buffers.lightDataView, this.currentScene.shadowScene.cascadeSplits, this.buffers.uniformLocations.lightUniformLocations.u_cascadeSplits);
    console.log("created UBOs");
  }
  createProgramVariants(shaderVariantsToCompile) {
    const gl = this.gl;
    let fsSource = this.primaryFSSource;
    let vsSource = this.primaryVSSource;

    for (const variantID of shaderVariantsToCompile) {
      shaderProgram = this.getProgram(fsSource, vsSource, variantID);

      //bind UBOs
      let perFrameIndex = gl.getUniformBlockIndex(shaderProgram, "PerFrame");
      gl.uniformBlockBinding(shaderProgram, perFrameIndex, this.buffers.perFrameUBOBindingLocation);
      gl.bindBufferBase(gl.UNIFORM_BUFFER, this.buffers.perFrameUBOBindingLocation, this.buffers.perFrameUBO);

      let perMaterialIndex = gl.getUniformBlockIndex(shaderProgram, "PerMaterial");
      gl.uniformBlockBinding(shaderProgram, perMaterialIndex, this.buffers.perMaterialUBOBindingLocation);
      gl.bindBufferBase(gl.UNIFORM_BUFFER, this.buffers.perMaterialUBOBindingLocation, this.buffers.perMaterialUBO);

      let lightInfoIndex = gl.getUniformBlockIndex(shaderProgram, "LightInfo");
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
          shadowCascades: gl.getUniformLocation(shaderProgram, "u_shadowCascades"),
          shadowMaps: gl.getUniformLocation(shaderProgram, "u_shadowMaps"),
          shadowCubemaps: gl.getUniformLocation(shaderProgram, "u_shadowCubemaps"),
        },
      };
      //conditional attributes and uniforms
      if (variantID & this.SHADER_VARIANTS.SHADER_VARIANT_NORMAL_MAP) {
        programInfo.attribLocations.vertexTangent = gl.getAttribLocation(shaderProgram, "a_tangent");
        programInfo.attribLocations.vertexBitangent = gl.getAttribLocation(shaderProgram, "a_bitangent");
        programInfo.uniformLocations.normalTexture = gl.getUniformLocation(shaderProgram, "u_normalMap");
      }
      if (variantID & this.SHADER_VARIANTS.SHADER_VARIANT_BAKED_AO) {
        programInfo.uniformLocations.aoTexture = gl.getUniformLocation(shaderProgram, "u_aoMap");
      }
      if (variantID & this.SHADER_VARIANTS.SHADER_VARIANT_PARALLAX) {
        programInfo.uniformLocations.heightMap = gl.getUniformLocation(shaderProgram, "u_heightMap");
      }
      if (variantID & this.SHADER_VARIANTS.SHADER_VARIANT_PBR) {
        programInfo.uniformLocations.metallic = gl.getUniformLocation(shaderProgram, "u_metallic");
        programInfo.uniformLocations.roughness = gl.getUniformLocation(shaderProgram, "u_roughness");
      }
      if (variantID & this.SHADER_VARIANTS.SHADER_VARIANT_OPACITY_MAP) {
        programInfo.uniformLocations.opacity = gl.getUniformLocation(shaderProgram, "u_opacity");
      }
      this.shaderProgramVariants[variantID] = programInfo;
    }
  }

  updateScene() {
    for (let key in this.currentScene.objects) {
      this.currentScene.objects[key].update();
    }
    for (let key in this.currentScene.lights) {
      this.currentScene.lights[key].update();
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
    //this.shadowPass();
    gl.clearColor(0.0, 0.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const currentScene = this.currentScene;
    // drawFullscreenQuad(gl, currentScene.shadowScene.shadowMaps, 1);
    // this.updateCamera();
    // return;
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.buffers.perFrameUBO);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.buffers.perFrameBufferData);

    
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.buffers.lightUBO);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.buffers.lightBufferData);
    
    for (const key in currentScene.objects) {
      let object = currentScene.objects[key];
      //compile shaders on first occurence of variant, shortens startup at cost of some stutter on object load
      let currentVariant = object.shaderVariant;
      if(this.forceWireframe){
        currentVariant |= this.SHADER_VARIANTS.SHADER_VARIANT_WIREFRAME;
      }
      if(this.forceGouraud){
        currentVariant |= this.SHADER_VARIANTS.SHADER_VARIANT_FORCE_GOURAUD;
      }
      if (!this.shaderProgramVariants[currentVariant]) {
        this.createProgramVariants([currentVariant]);
      }
      const programInfo = this.shaderProgramVariants[currentVariant];
      gl.useProgram(programInfo.program);

      this.buffers.perMaterialDataView.setFloat32(this.buffers.uniformLocations.perMaterialUniformLocations.u_ambientStrength, object.material.ambientStrength, true);
      this.buffers.perMaterialDataView.setFloat32(this.buffers.uniformLocations.perMaterialUniformLocations.u_specularStrength, object.material.specularStrength, true);
      this.buffers.perMaterialDataView.setFloat32(this.buffers.uniformLocations.perMaterialUniformLocations.u_textureScale, object.material.textureScale, true);


      gl.bindBuffer(gl.UNIFORM_BUFFER, this.buffers.perMaterialUBO);
      gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.buffers.perMaterialBufferData);

      //bind shadow maps

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, currentScene.shadowScene.shadowCascades); // Bind shadow map texture array
      gl.uniform1i(programInfo.uniformLocations.shadowCascades, 0);

      // for (let i = 0; i < this.NUM_SHADOW_CASCADES; i++) {
      //   gl.uniform1f(programInfo.uniformLocations.cascadeSplits[i], this.currentScene.shadowScene.cascadeSplits[i]);
      // }

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, currentScene.shadowScene.shadowMaps); // Bind shadow map texture array
      gl.uniform1i(programInfo.uniformLocations.shadowMaps, 1);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D_ARRAY, currentScene.shadowScene.shadowCubemaps); // Bind shadow map texture array
      gl.uniform1i(programInfo.uniformLocations.shadowCubemaps, 2);

      let textureUnitAfterShadowMaps = 3;

      //gl.uniform3f(programInfo.uniformLocations.viewPos, 0, 0, 0);
      let modelViewMatrix = mat4.create();
      mat4.multiply(modelViewMatrix, this.matrices.viewMatrix, object.transform.modelMatrix);

      gl.uniformMatrix4fv(programInfo.uniformLocations.modelViewMatrix, false, modelViewMatrix);
      gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, this.matrices.projectionMatrix);

      // gl.uniformMatrix4fv(programInfo.uniformLocations.viewMatrixInverse, false, this.matrices.viewMatrixInverse);

      let normalMatrix = calculateNormalMatrix(modelViewMatrix);
      gl.uniformMatrix3fv(programInfo.uniformLocations.normalMatrix, false, normalMatrix);

      if (currentVariant & this.SHADER_VARIANTS.SHADER_VARIANT_NORMAL_MAP) {
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
        if (currentVariant & this.SHADER_VARIANTS.SHADER_VARIANT_NORMAL_MAP) {
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
        if (currentVariant & this.SHADER_VARIANTS.SHADER_VARIANT_BAKED_AO) {
          gl.activeTexture(gl.TEXTURE0 + textureUnit);
          gl.bindTexture(gl.TEXTURE_2D, object.aoMaps[i]);
          gl.uniform1i(programInfo.uniformLocations.aoTexture, textureUnit);
          textureUnit += 1;
        }
        //height texture
        if (currentVariant & this.SHADER_VARIANTS.SHADER_VARIANT_PARALLAX) {
          gl.activeTexture(gl.TEXTURE0 + textureUnit);
          gl.bindTexture(gl.TEXTURE_2D, object.heightMaps[i]);
          gl.uniform1i(programInfo.uniformLocations.heightMap, textureUnit);
          textureUnit += 1;
        }
        //PBR metallic & roughness textures
        if (currentVariant & this.SHADER_VARIANTS.SHADER_VARIANT_PBR) {
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
        if (currentVariant & this.SHADER_VARIANTS.SHADER_VARIANT_OPACITY_MAP) {
          gl.activeTexture(gl.TEXTURE0 + textureUnit);
          gl.bindTexture(gl.TEXTURE_2D, object.opacity[i]);
          gl.uniform1i(programInfo.uniformLocations.opacity, textureUnit);
          textureUnit += 1;
        }
        // gl.validateProgram(programInfo.program);
        // const validationStatus = gl.getProgramParameter(shaderProgram, gl.VALIDATE_STATUS);
        // if (!validationStatus) {
        //     console.error('Program validation failed:', gl.getProgramInfoLog(shaderProgram));
        // }
        gl.drawArrays(gl.TRIANGLES, 0, mesh.vertices.length / 3);
        gl.bindVertexArray(null);
        i += 1;
      }
      //console.log("done with object")
    }
    this.updateCamera();
  }
  updateLights() {
    let spotNum = 0;
    let pointNum = 0;
    let i=0;
    for (let key in this.currentScene.lights) {
      let light = this.currentScene.lights[key];

      let lightPosWorld = light.transform.getGlobalPosition();
      let lightPosView = vec3.create();
      vec3.transformMat4(lightPosView, lightPosWorld, this.matrices.viewMatrix);

      this.currentScene.lightPositionsData[i * 4] = lightPosView[0];
      this.currentScene.lightPositionsData[i * 4 + 1] = lightPosView[1];
      this.currentScene.lightPositionsData[i * 4 + 2] = lightPosView[2];
      this.currentScene.lightPositionsData[i * 4 + 3] = 0; //padding for uniform block alignment, unused in shader

      this.currentScene.lightAttenuationsData[i * 4] = light.constantAttenuation;
      this.currentScene.lightAttenuationsData[i * 4 + 1] = light.linearAttenuation;
      this.currentScene.lightAttenuationsData[i * 4 + 2] = light.quadraticAttenuation;

      let lightColor = light.color;
      let lightIntensity = light.intensity;
      this.currentScene.lightColorsData[i * 4] = lightColor[0] * lightIntensity;
      this.currentScene.lightColorsData[i * 4 + 1] = lightColor[1] * lightIntensity;
      this.currentScene.lightColorsData[i * 4 + 2] = lightColor[2] * lightIntensity;
      this.currentScene.lightColorsData[i * 4 + 3] = 1.0;

      let lightDirWorld = light.getLightDir();
      let lightDirView = vec3.create();
      let viewMatrix3x3 = mat3.create();
      mat3.fromMat4(viewMatrix3x3, this.matrices.viewMatrix); // Extract the upper-left 3x3 part
      vec3.transformMat3(lightDirView, lightDirWorld, viewMatrix3x3);

      this.currentScene.lightDirectionsData[i * 4] = lightDirView[0];
      this.currentScene.lightDirectionsData[i * 4 + 1] = lightDirView[1];
      this.currentScene.lightDirectionsData[i * 4 + 2] = lightDirView[2];

      this.currentScene.lightPropertiesData[i * 4] = light.type;
      if (light.type == LightType.SPOT) {
        this.currentScene.lightPropertiesData[i * 4 + 1] = light.innerConeCos;
        this.currentScene.lightPropertiesData[i * 4 + 2] = light.outerConeCos;
      }

      switch (light.type){
        case LightType.SPOT:
          if (light.dirtyFlag){
            dataViewSetMatrix(this.buffers.lightDataView, light.lightSpaceMatrix, this.buffers.uniformLocations.lightUniformLocations.u_lightSpaceMatrices+spotNum*64);
            light.dirtyFlag = false;
          }
          spotNum++;
          break;
        case LightType.POINT:
          if (light.dirtyFlag){
            dataViewSetMatrixArray(this.buffers.lightDataView, light.lightCubemapMatrices, this.buffers.uniformLocations.lightUniformLocations.u_lightCubemapMatrices+pointNum*6*64);
            light.dirtyFlag = false;
          }
          pointNum++;
          break;
      }
      i++
    }

    //update buffer data
    dataViewSetFloatArray(this.buffers.lightDataView, this.currentScene.lightPositionsData, this.buffers.uniformLocations.lightUniformLocations.u_lightPosViewSpace);
    dataViewSetFloatArray(this.buffers.lightDataView, this.currentScene.lightPropertiesData, this.buffers.uniformLocations.lightUniformLocations.u_lightProperties);
    dataViewSetFloatArray(this.buffers.lightDataView, this.currentScene.lightColorsData, this.buffers.uniformLocations.lightUniformLocations.u_lightColor);
    dataViewSetFloatArray(this.buffers.lightDataView, this.currentScene.lightAttenuationsData, this.buffers.uniformLocations.lightUniformLocations.u_lightAttenuation);
    dataViewSetFloatArray(this.buffers.lightDataView, this.currentScene.lightDirectionsData, this.buffers.uniformLocations.lightUniformLocations.u_lightDirViewSpace);
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

      this.horizontalAngle += deltaX * 0.005; // sensitivity
      this.verticalAngle -= deltaY * 0.005; // sensitivity
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

    this.canvas.addEventListener("wheel", (event) => {
      // Determine the direction of scrolling (normalize across different browsers)
      let delta = Math.sign(event.deltaY);

      this.distanceFromOrigin += delta * 1; // Zoom speed
      this.distanceFromOrigin = Math.max(0.1, this.distanceFromOrigin); // Zoom limit

      // Update camera
      this.updateCamera();
    });
  }
  updateCascades(){
    // Update directional light shadow cascades
    let lightSpaceMatrices = [];
    for (let key in this.currentScene.lights) {
      let light = this.currentScene.lights[key];
      if (light.type == LightType.DIRECTIONAL) {
        light.cascades = setupCascades(this.NUM_SHADOW_CASCADES, light, this.currentScene.camera, this.currentScene.shadowScene.cascadeSplits);
        for (let cascade of light.cascades){
          let lightSpaceMatrix = mat4.create();
          mat4.multiply(lightSpaceMatrix, cascade.orthoMatrix, cascade.viewMatrix);
          lightSpaceMatrices.push(lightSpaceMatrix);
        }
      }
    }
    dataViewSetMatrix(this.buffers.perFrameDataView, this.matrices.viewMatrixInverse, this.buffers.uniformLocations.perFrameUniformLocations.u_viewMatrixInverse);
    dataViewSetMatrixArray(this.buffers.lightDataView, lightSpaceMatrices, this.buffers.uniformLocations.lightUniformLocations.u_lightCascadeMatrices);
  }
  updateCamera() {
    // Ensure the vertical angle is within limits
    this.verticalAngle = Math.max(0, Math.min(Math.PI, this.verticalAngle));

    // Calculate camera position using spherical coordinates
    var x = this.distanceFromOrigin * Math.sin(this.verticalAngle) * Math.cos(this.horizontalAngle);
    var y = this.distanceFromOrigin * Math.cos(this.verticalAngle);
    var z = this.distanceFromOrigin * Math.sin(this.verticalAngle) * Math.sin(this.horizontalAngle);

    const lookAt = this.currentScene.camera.lookAt;
    this.currentScene.camera.position[0] = x+lookAt[0];
    this.currentScene.camera.position[1] = y+lookAt[1];
    this.currentScene.camera.position[2] = z+lookAt[2];

    // Update view matrix
    mat4.lookAt(this.matrices.viewMatrix, [x, y, z], [lookAt[0], lookAt[1], lookAt[2]], [0, 1, 0]);
    mat4.invert(this.matrices.viewMatrixInverse, this.matrices.viewMatrix);

    // Update shadow cascades after camera moves
    this.updateCascades();
  }
  createObjectFromData(pointsArray, normalsArray, texcoords, textures = [], normals = [], aoMaps = [], heightMaps = [], metallic = [], roughness = [], opacity = [], textureScale = 1.0){
    const gl = this.gl;
    let objectData = {
      geometries: [{data: {position: pointsArray, normal: normalsArray, texcoord: texcoords }}]
    }
    let shaderVariant = 0;

    if (textures.length == 0){
      var texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);

      var greyPixel = new Uint8Array([255, 0, 0, 255]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, greyPixel);

      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      textures = [texture];
    }
    if (normals.length > 0){
      shaderVariant |= this.SHADER_VARIANTS.SHADER_VARIANT_NORMAL_MAP;
    }
    if (heightMaps.length > 0){
      shaderVariant |= this.SHADER_VARIANTS.SHADER_VARIANT_PARALLAX;
    }
    if (metallic.length > 0 || roughness.length > 0){
      shaderVariant |= this.SHADER_VARIANTS.SHADER_VARIANT_PBR;
    }
    return createRenderable(gl, objectData, shaderVariant, textures, normals, aoMaps, heightMaps, metallic, roughness, opacity, textureScale);
  }

  setObjectData(object, pointsArray, normalsArray, texcoords, textures = [], normals = [], aoMaps = [], heightMaps = [], metallic = [], roughness = [], opacity = [], textureScale = 1.0){
    const gl = this.gl;
    let objectData = {
      geometries: [{data: {position: pointsArray, normal: normalsArray, texcoord: texcoords }}]
    }
    let shaderVariant = 0;

    if (textures.length == 0){
      var texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);

      var greyPixel = new Uint8Array([255, 0, 0, 255]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, greyPixel);

      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      textures = [texture];
    }
    if (normals.length > 0){
      shaderVariant |= this.SHADER_VARIANTS.SHADER_VARIANT_NORMAL_MAP;
    }
    if (heightMaps.length > 0){
      shaderVariant |= this.SHADER_VARIANTS.SHADER_VARIANT_PARALLAX;
    }
    if (metallic.length > 0 || roughness.length > 0){
      shaderVariant |= this.SHADER_VARIANTS.SHADER_VARIANT_PBR;
    }
    return updateRenderable(this.gl, object, objectData, shaderVariant, normalsArray, texcoords, textures = [], normals = [], aoMaps = [], heightMaps = [], metallic = [], roughness = [], opacity = [], textureScale = 1.0)
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
    let repeat = false;
    let textureScale = 1.0;
    try {
      if (modelDescription.invert_normal_map == true){
        shaderVariant |= this.SHADER_VARIANTS.SHADER_VARIANT_INVERT_NORMAL_MAP;
      }
    }
    catch{}
    try {
      if (modelDescription.repeatTexture == true){
        repeat = true;
      }
    }
    catch{}
    try {
      textureScale = modelDescription.textureScale;
    }
    catch{}
    try {
      for (const textureName of modelDescription.textures) {
        let textureImage = await loadTexture("textures/" + textureName);
        let texture = createWebGLTexture(gl, textureImage, repeat, true);
        textures.push(texture);
      }
    } catch {
      console.log("Object " + modelDescription.model + " has no texture");
    }

    try {
      for (const textureName of modelDescription.normals) {
        let normalImage = await loadTexture("textures/" + textureName);
        let normalTexture = createWebGLTexture(gl, normalImage, repeat, true);
        normals.push(normalTexture);
      }
      shaderVariant |= this.SHADER_VARIANTS.SHADER_VARIANT_NORMAL_MAP;
    } catch {
      console.log("Object " + modelDescription.model + " has no normals");
    }

    try {
      for (const textureName of modelDescription.aoMaps) {
        let aoImage = await loadTexture("textures/" + textureName);
        let aoTexture = createWebGLTexture(gl, aoImage, repeat);
        aoMaps.push(aoTexture);
      }
      shaderVariant |= this.SHADER_VARIANTS.SHADER_VARIANT_BAKED_AO;
    } catch {
      console.log("Object " + modelDescription.model + " has no ao maps");
    }

    try {
      for (const textureName of modelDescription.heightMaps) {
        let heightMapImage = await loadTexture("textures/" + textureName);
        let heightMapTexture = createWebGLTexture(gl, heightMapImage, repeat);
        heightMaps.push(heightMapTexture);
      }
      shaderVariant |= this.SHADER_VARIANTS.SHADER_VARIANT_PARALLAX;
    } catch {
      console.log("Object " + modelDescription.model + " has no height maps");
    }

    try {
      for (const textureName of modelDescription.metallic) {
        let metallicImage = await loadTexture("textures/" + textureName);
        let metallicTexture = createWebGLTexture(gl, metallicImage, repeat, true);
        metallic.push(metallicTexture);
      }
      shaderVariant |= this.SHADER_VARIANTS.SHADER_VARIANT_PBR;
    } catch {
      console.log("Object " + modelDescription.model + " has no metallic texture");
    }

    try {
      for (const textureName of modelDescription.roughness) {
        let roughnessImage = await loadTexture("textures/" + textureName);
        let roughnessTexture = createWebGLTexture(gl, roughnessImage, repeat, true);
        roughness.push(roughnessTexture);
      }
      shaderVariant |= this.SHADER_VARIANTS.SHADER_VARIANT_PBR;
    } catch {
      console.log("Object " + modelDescription.model + " has no roughness texture");
    }
    try {
      for (const textureName of modelDescription.opacity) {
        let opacityImage = await loadTexture("textures/" + textureName);
        let opacityTexture = createWebGLTexture(gl, opacityImage, repeat);
        opacity.push(opacityTexture);
      }
      shaderVariant |= this.SHADER_VARIANTS.SHADER_VARIANT_OPACITY_MAP;
    } catch {
      console.log("Object " + modelDescription.model + " has no opacity texture");
    }

    let objectData = await getObj("objects/" + modelDescription.model);
    console.log(objectData);
    return createRenderable(gl, objectData, shaderVariant, textures, normals, aoMaps, heightMaps, metallic, roughness, opacity, textureScale);
  }
  printRestrictions() {
    console.log("Max texture size: " + this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE));
    console.log("Max texture layers: " + this.gl.getParameter(this.gl.MAX_ARRAY_TEXTURE_LAYERS));
    console.log("Max cubemap dimensions: " + this.gl.getParameter(this.gl.MAX_CUBE_MAP_TEXTURE_SIZE));
    console.log("Max vertex uniforms: " + this.gl.getParameter(this.gl.MAX_VERTEX_UNIFORM_VECTORS));
    console.log("Max fragment uniforms: " + this.gl.getParameter(this.gl.MAX_FRAGMENT_UNIFORM_VECTORS));
    console.log("Max fragment uniform blocks: " + this.gl.getParameter(this.gl.MAX_FRAGMENT_UNIFORM_BLOCKS));
    console.log("Max uniform block size: " + this.gl.getParameter(this.gl.MAX_UNIFORM_BLOCK_SIZE));
  }
  moveCameraForward(dist){
    let dir = calculateForwardVector(this.currentScene.camera.position, this.currentScene.camera.lookAt);
    let move = vec3.create();
    vec3.scale(move, dir, dist);
    vec3.add(this.currentScene.camera.lookAt, this.currentScene.camera.lookAt, move);
    //vec3.add(this.currentScene.camera.position, this.currentScene.camera.position, move);
  }
  moveCameraRight(dist){
    let forward = calculateForwardVector(this.currentScene.camera.position, this.currentScene.camera.lookAt);
    let move = vec3.create();
    vec3.cross(move, forward, this.currentScene.camera.up);
    vec3.scale(move, move, dist);
    vec3.add(this.currentScene.camera.lookAt, this.currentScene.camera.lookAt, move);
    //vec3.add(this.currentScene.camera.position, this.currentScene.camera.position, move);
  }
}
