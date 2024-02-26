class WebGLRenderer {
  constructor(canvasID) {
    this.canvas = document.getElementById(canvasID);
    this.gl = this.canvas.getContext("webgl2");
    var vertElem = document.getElementById("primaryVSSource");
    var fragElem = document.getElementById("primaryFSSource");
    this.primaryVSSource = vertElem.text;
    this.primaryFSSource = fragElem.text;
    var shadowVertElem = document.getElementById("shadowVSSource");
    var shadowFragElem = document.getElementById("shadowFSSource");
    this.shadowVSSource = shadowVertElem.text;
    this.shadowFSSource = shadowFragElem.text;


    // Print gl restrictions, for debugging
    this.printRestrictions();
    const gl = this.gl;
    // gl.enable(gl.CULL_FACE);
    // gl.cullFace(gl.BACK);
    // gl.frontFace(gl.CCW);

    this.currentScene = new Scene();
    let lookAt = vec3.fromValues(0, 0, -1);
    let up = vec3.fromValues(0, 1, 0);
    let fov = (80 * Math.PI) / 180; // in radians
    let aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    let zNear = 0.1;
    let zFar = 1000.0;
    this.currentScene.setCamera(lookAt, up, fov, aspect, zNear, zFar);
    this.velocity = {forward: 0, right: 0};
    this.speed = 0.1;

    this.defaultDirection = vec3.fromValues(0, 0, -1); // Default direction
    vec3.normalize(this.defaultDirection, this.defaultDirection);

    // Shadow setup
    this.SHADOW_WIDTH = 2048; //8192;
    this.SHADOW_HEIGHT = 2048; //8192;
    this.SHADOW_CASCADE_DISTANCE = 100;

    this.NUM_SHADOW_CASCADES = 4;
    this.shadowScene = {};
    this.shadowScene.cascadeSplits = calculateCascadeSplits(this.NUM_SHADOW_CASCADES, this.currentScene.camera.zNear, this.currentScene.camera.zFar, this.SHADOW_CASCADE_DISTANCE);

    this.MAX_DIRECTIONAL_LIGHTS = 2;
    this.MAX_SPOT_LIGHTS = 5;
    this.MAX_POINT_LIGHTS = 10;
    this.MAX_LIGHTS = this.MAX_DIRECTIONAL_LIGHTS + this.MAX_SPOT_LIGHTS + this.MAX_POINT_LIGHTS;

    this.standardHeader = `#version 300 es
    #define MAX_DIRECTIONAL_LIGHTS `+this.MAX_DIRECTIONAL_LIGHTS+`
    #define MAX_SPOT_LIGHTS `+this.MAX_SPOT_LIGHTS+`
    #define MAX_POINT_LIGHTS `+this.MAX_POINT_LIGHTS+`
    #define MAX_LIGHTS `+this.MAX_LIGHTS+`
    #define NUM_CASCADE_SPLITS `+this.NUM_SHADOW_CASCADES+`
    precision highp float;
    precision highp int;\n`

    // Shader variants for conditional compilation
    this.SHADER_VARIANTS = SHADER_VARIANTS;

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
    gl.disable(gl.BLEND);

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
    this.initShadowScene();
    this.initLineRenderer();

    let debugCubeData = cube(v0, v1, v2, v3, v4, v5, v6, v7, 0, false);
    this.debugCube = this.createObjectFromData(debugCubeData.pointsArray, debugCubeData.normalsArray, debugCubeData.texCoordArray, [], [255, 255, 255, 255], null, true, 40.0);
    
    //time, for animations
    this.lastTime = new Date().getTime() / 1000;
  }

  //Get a variant of the main shaders with a given variant ID
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
    if (variantID & this.SHADER_VARIANTS.SHADER_VARIANT_SKIP_LIGHTING) {
      defines += "#define SKIP_LIGHTING\n";
    }
    if (variantID & this.SHADER_VARIANTS.SHADER_VARIANT_COMBINED_METALLIC_ROUGHNESS) {
      defines += "#define COMBINED_METALLIC_ROUGHNESS\n";
    }
    if (variantID & this.SHADER_VARIANTS.SHADER_VARIANT_PBR_MAPS) {
      defines += "#define PBR_MAPS\n";
    }
    if (variantID & this.SHADER_VARIANTS.SHADER_VARIANT_SKINNED) {
      defines += "#define SKINNED\n";
    }
    if (variantID & this.SHADER_VARIANTS.SHADER_VARIANT_EMISSIVE_TEXTURE) {
      defines += "#define EMISSIVE_TEXTURE\n";
    }
    let vertexShader = compileShader(gl, defines + vsSource, gl.VERTEX_SHADER);
    let fragmentShader = compileShader(gl, defines + fsSource, gl.FRAGMENT_SHADER);

    let shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);
    return shaderProgram;
  }

  //Create uniform buffer objects, with reflection for offset positions
  createUBOs() {
    const gl = this.gl;
    let fsSource = this.primaryFSSource;
    let vsSource = this.primaryVSSource;
    //create dummy program with all uniforms
    let shaderVariant = 0b00000;
    shaderVariant |= this.SHADER_VARIANTS.SHADER_VARIANT_PBR;
    let shaderProgram = this.getProgram(fsSource, vsSource, shaderVariant);

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

    const perFrameUniformNames = ["u_camPosWorldSpace","u_viewMatrixInverse"];
    const perMaterialUniformNames = ["u_ambientStrength", "u_specularStrength", "u_emissiveFactor", "u_textureScale", "u_metallicFactor", "u_roughnessFactor", "u_baseColorFactor"];
    const lightUniformNames = ["u_lightProperties", "u_numLights", "u_lightPosWorldSpace", "u_lightDirWorldSpace", "u_lightAttenuation", "u_lightColor", "u_lightSpaceMatrices", "u_lightCascadeMatrices", "u_lightCubemapMatrices", "u_cascadeSplits"];

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
    dataViewSetFloatArray(this.buffers.lightDataView, this.shadowScene.cascadeSplits, this.buffers.uniformLocations.lightUniformLocations.u_cascadeSplits);
    console.log("created UBOs");
  }

  //create a set of shader variants
  createProgramVariants(shaderVariantsToCompile) {
    const gl = this.gl;
    let fsSource = this.primaryFSSource;
    let vsSource = this.primaryVSSource;

    for (const variantID of shaderVariantsToCompile) {
      let shaderProgram = this.getProgram(fsSource, vsSource, variantID);

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
          modelMatrix: gl.getUniformLocation(shaderProgram, "u_modelMatrix"),
          modelViewMatrix: gl.getUniformLocation(shaderProgram, "u_modelViewMatrix"),
          normalMatrix: gl.getUniformLocation(shaderProgram, "u_normalMatrix"),
          objectTexture: gl.getUniformLocation(shaderProgram, "u_baseColorTexture"),
          shadowCascades: gl.getUniformLocation(shaderProgram, "u_shadowCascades"),
          shadowMaps: gl.getUniformLocation(shaderProgram, "u_shadowMaps"),
          shadowCubemaps: gl.getUniformLocation(shaderProgram, "u_shadowCubemaps"),
          boneTransforms: gl.getUniformLocation(shaderProgram, "u_boneTransforms"),
          inverseBindMatrices: gl.getUniformLocation(shaderProgram, "u_inverseBindMatrices"),
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
        if (variantID & this.SHADER_VARIANTS.SHADER_VARIANT_COMBINED_METALLIC_ROUGHNESS){
          programInfo.uniformLocations.metallicRoughness = gl.getUniformLocation(shaderProgram, "u_metallicRoughness");
        } else {
          programInfo.uniformLocations.metallic = gl.getUniformLocation(shaderProgram, "u_metallic");
          programInfo.uniformLocations.roughness = gl.getUniformLocation(shaderProgram, "u_roughness");
        }
      }
      if (variantID & this.SHADER_VARIANTS.SHADER_VARIANT_OPACITY_MAP) {
        programInfo.uniformLocations.opacity = gl.getUniformLocation(shaderProgram, "u_opacity");
      }
      if (variantID & this.SHADER_VARIANTS.SHADER_VARIANT_EMISSIVE_TEXTURE) {
        programInfo.uniformLocations.emissive = gl.getUniformLocation(shaderProgram, "u_emissive");
      }
      this.shaderProgramVariants[variantID] = programInfo;
    }
  }

  addLightToCurrentScene(light){
    this.currentScene.addLight(light);
    this.buffers.lightDataView.setInt32(this.buffers.uniformLocations.lightUniformLocations.u_numLights, this.currentScene.numLights, true);
    this.initLightVectors();
    if (light.type == LightType.DIRECTIONAL){
      this.updateCascades();
    }
  }
  appendSceneToCurrentScene(scene){
    this.currentScene.appendScene(scene);
    this.buffers.lightDataView.setInt32(this.buffers.uniformLocations.lightUniformLocations.u_numLights, this.currentScene.numLights, true);
    this.initLightVectors();
    this.updateCascades();
  }
  // Update the scene graph from root
  updateScene() {
    //update animations
    let currentTime = new Date().getTime() / 1000;
    let elapsed = currentTime - this.lastTime;
    this.lastTime = currentTime;
    for(let skeleton of this.currentScene.animatedSkeletons){
      for (let node of skeleton.nodes){
        node.animationController.update(elapsed);
      }
    }
    //update scene tree
    this.currentScene.sceneRoot.forceUpdate();
    for(let skeleton of this.currentScene.animatedSkeletons){
      skeleton.updateTransforms();
    }
  }

  drawSkeletons(){
    const gl = this.gl;
    const currentScene = this.currentScene;
    let currentShaderVariant = this.SHADER_VARIANTS.SHADER_VARIANT_WIREFRAME;
    if (!this.shaderProgramVariants[currentShaderVariant]) {
      this.createProgramVariants([currentShaderVariant]);
    }
    const programInfo = this.shaderProgramVariants[currentShaderVariant];
    gl.useProgram(programInfo.program);
    gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, this.currentScene.camera.projectionMatrix);

    // Skeleton node transforms are in their own "skeleton-space". 
    // We need to transform them into the relevant model's local space before drawing, or they will make no sense.
    gl.disable(gl.DEPTH_TEST);
    for (let key in currentScene.objects){
      let object = currentScene.objects[key];
      if (object.skeleton != null){
        for (let bone of object.skeleton.nodes){
          let boneMatrix = mat4.create();
          mat4.multiply(boneMatrix, object.transform.modelMatrix, bone.transform.modelMatrix);
          this.debugCube.transform.modelMatrix = boneMatrix;
          //this.drawObject(this.debugCube, false, true);
          
          let parentBoneMatrix = mat4.create();
          mat4.multiply(parentBoneMatrix, object.transform.modelMatrix, bone.parent.transform.modelMatrix);
          //this.drawLines([...positionFromMatrix(parentBoneMatrix), ...positionFromMatrix(boneMatrix)], mat4.create());
        }
      }
    }
    gl.enable(gl.DEPTH_TEST);
  }
  drawNodes(){
    const gl = this.gl;
    const currentScene = this.currentScene;
    let currentShaderVariant = this.SHADER_VARIANTS.SHADER_VARIANT_WIREFRAME;
    if (!this.shaderProgramVariants[currentShaderVariant]) {
      this.createProgramVariants([currentShaderVariant]);
    }
    const programInfo = this.shaderProgramVariants[currentShaderVariant];
    gl.useProgram(programInfo.program);
    gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, this.currentScene.camera.projectionMatrix);

      for (let key in this.currentScene.nodes){
        let object = this.currentScene.nodes[key];
        this.debugCube.transform.modelMatrix = object.transform.modelMatrix;
        this.drawObject(this.debugCube, false, true);
      }
  }
  // TODO: This function is very long, but I haven't figured out function composition, which would allow calling draw() as a member function with no ifs
  // This enhancement should be paired with batch rendering
  drawObject(object, skinned, wireframe){
    const gl = this.gl;
    const currentScene = this.currentScene;
    //compile shaders on first occurence of variant, shortens startup at cost of some stutter on object load
    let currentShaderVariant = object.material.shaderVariant;
    if(wireframe){
      currentShaderVariant |= this.SHADER_VARIANTS.SHADER_VARIANT_WIREFRAME;
    }
    if (skinned == true){
      currentShaderVariant |= this.SHADER_VARIANTS.SHADER_VARIANT_SKINNED;
    }
    if (!this.shaderProgramVariants[currentShaderVariant]) {
      this.createProgramVariants([currentShaderVariant]);
    }
    const programInfo = this.shaderProgramVariants[currentShaderVariant];
    gl.useProgram(programInfo.program);

    gl.uniformMatrix4fv(programInfo.uniformLocations.projectionMatrix, false, this.currentScene.camera.projectionMatrix);


    this.buffers.perMaterialDataView.setFloat32(this.buffers.uniformLocations.perMaterialUniformLocations.u_ambientStrength, object.material.ambientStrength, true);
    this.buffers.perMaterialDataView.setFloat32(this.buffers.uniformLocations.perMaterialUniformLocations.u_specularStrength, object.material.specularStrength, true);
    dataViewSetVec4(this.buffers.perMaterialDataView, object.material.emissiveFactor, this.buffers.uniformLocations.perMaterialUniformLocations.u_emissiveFactor);
    this.buffers.perMaterialDataView.setFloat32(this.buffers.uniformLocations.perMaterialUniformLocations.u_textureScale, object.material.textureScale, true);
    this.buffers.perMaterialDataView.setFloat32(this.buffers.uniformLocations.perMaterialUniformLocations.u_metallicFactor, object.material.metallicFactor, true);
    this.buffers.perMaterialDataView.setFloat32(this.buffers.uniformLocations.perMaterialUniformLocations.u_roughnessFactor, object.material.roughnessFactor, true);
    dataViewSetVec4(this.buffers.perMaterialDataView, object.material.baseColorFactor, this.buffers.uniformLocations.perMaterialUniformLocations.u_baseColorFactor)

    gl.bindBuffer(gl.UNIFORM_BUFFER, this.buffers.perMaterialUBO);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.buffers.perMaterialBufferData);

    //bind shadow maps

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.shadowScene.shadowCascades);
    gl.uniform1i(programInfo.uniformLocations.shadowCascades, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.shadowScene.shadowMaps);
    gl.uniform1i(programInfo.uniformLocations.shadowMaps, 1);

    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.shadowScene.shadowCubemaps);
    gl.uniform1i(programInfo.uniformLocations.shadowCubemaps, 2);

    let textureUnitAfterShadowMaps = 3;
    let modelViewMatrix = mat4.create();
    mat4.multiply(modelViewMatrix, this.currentScene.camera.viewMatrix, object.transform.modelMatrix);

    gl.uniformMatrix4fv(programInfo.uniformLocations.modelMatrix, false, object.transform.modelMatrix);
    gl.uniformMatrix4fv(programInfo.uniformLocations.modelViewMatrix, false, modelViewMatrix);

    let normalMatrix = calculateNormalMatrix(object.transform.modelMatrix);
    gl.uniformMatrix3fv(programInfo.uniformLocations.normalMatrix, false, normalMatrix);

    if (skinned == true){
      gl.uniformMatrix4fv(programInfo.uniformLocations.inverseBindMatrices, false, object.skeleton.inverseBindMatrices);
      gl.uniformMatrix4fv(programInfo.uniformLocations.boneTransforms, false, object.skeleton.boneTransforms);
    }

    let textureUnit = textureUnitAfterShadowMaps;
    object.bindTextures(gl, textureUnit, programInfo);

    let i = 0;
    for (const mesh of object.meshes) {
      //vertices
      gl.bindVertexArray(mesh.vao);
      mesh.draw(gl);
      gl.bindVertexArray(null);
      //gl.useProgram(programInfo.program);
      i += 1;
    }
  }
  // Draw the scene
  drawScene() {
    const gl = this.gl;
    this.updateScene();
    this.updateLights();

    this.shadowPass();
    gl.clearColor(0.0, 0.0, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const currentScene = this.currentScene;
    // drawFullscreenQuad(gl, this.shadowScene.shadowCascades, 1);
    // this.updateCamera();
    // return;
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.buffers.perFrameUBO);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.buffers.perFrameBufferData);

    
    gl.bindBuffer(gl.UNIFORM_BUFFER, this.buffers.lightUBO);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, this.buffers.lightBufferData);
    
    // Draw opaque objects, then transparent, unskinned objects, then skinned
    for (const key in currentScene.unskinnedOpaqueObjects) {
      let object = currentScene.unskinnedOpaqueObjects[key];
      this.drawObject(object, false, this.forceWireframe);
    }
    for (const key in currentScene.skinnedOpaqueObjects) {
      let object = currentScene.skinnedOpaqueObjects[key];
      this.drawObject(object, true, this.forceWireframe);
    }
    gl.enable(gl.BLEND);
    for (const key in currentScene.unskinnedTransparentObjects) {
      let object = currentScene.unskinnedTransparentObjects[key];
      this.drawObject(object, false, this.forceWireframe);
    }
    for (const key in currentScene.skinnedTransparentObjects) {
      let object = currentScene.skinnedTransparentObjects[key];
      this.drawObject(object, true, this.forceWireframe);
    }
    gl.disable(gl.BLEND);
    this.drawSkeletons();
    this.updateCamera();
  }

  //Update the lights in the scene
  //TODO: Doing the view-space transformation in shaders might be better?
  // Won't matter until using deferred renderer. Could be more elegant too.
  updateLights() {
    let spotNum = 0;
    let pointNum = 0;
    let i=0;
    for (let key in this.currentScene.lights) {
      let light = this.currentScene.lights[key];

      let lightPosWorld = light.transform.getGlobalPosition();

      this.currentScene.lightPositionsData[i * 4] = lightPosWorld[0];
      this.currentScene.lightPositionsData[i * 4 + 1] = lightPosWorld[1];
      this.currentScene.lightPositionsData[i * 4 + 2] = lightPosWorld[2];
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
      this.currentScene.lightDirectionsData[i * 4] = lightDirWorld[0];
      this.currentScene.lightDirectionsData[i * 4 + 1] = lightDirWorld[1];
      this.currentScene.lightDirectionsData[i * 4 + 2] = lightDirWorld[2];

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
    dataViewSetVec4Array(this.buffers.lightDataView, this.currentScene.lightPositionsData, this.buffers.uniformLocations.lightUniformLocations.u_lightPosWorldSpace);
    dataViewSetVec4Array(this.buffers.lightDataView, this.currentScene.lightPropertiesData, this.buffers.uniformLocations.lightUniformLocations.u_lightProperties);
    dataViewSetVec4Array(this.buffers.lightDataView, this.currentScene.lightColorsData, this.buffers.uniformLocations.lightUniformLocations.u_lightColor);
    dataViewSetVec4Array(this.buffers.lightDataView, this.currentScene.lightAttenuationsData, this.buffers.uniformLocations.lightUniformLocations.u_lightAttenuation);
    dataViewSetVec4Array(this.buffers.lightDataView, this.currentScene.lightDirectionsData, this.buffers.uniformLocations.lightUniformLocations.u_lightDirWorldSpace);
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
    document.addEventListener('keydown', (event) => {
      switch (event.code) {
        case 'KeyW': this.velocity.forward = 1; break;
        case 'KeyS': this.velocity.forward = -1; break;
        case 'KeyA': this.velocity.right = -1; break;
        case 'KeyD': this.velocity.right = 1; break;
      }
    });
    
    document.addEventListener('keyup', (event) => {
      switch (event.code) {
        case 'KeyW':
        case 'KeyS': this.velocity.forward = 0; break;
        case 'KeyA':
        case 'KeyD': this.velocity.right = 0; break;
      }
    });
    
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

      this.horizontalAngle -= deltaX * 0.005; // sensitivity
      this.verticalAngle -= deltaY * 0.005; // sensitivity
      const upperBound = Math.PI / 2 - 0.01; // Slightly less than 90 degrees
      const lowerBound = -Math.PI / 2 + 0.01; // Slightly more than -90 degrees

      // Clamp the vertical angle within the bounds
      this.verticalAngle = Math.max(lowerBound, Math.min(upperBound, this.verticalAngle));

      this.updateCamera();

      this.lastMouseX = newX;
      this.lastMouseY = newY;
    };

    this.canvas.addEventListener("wheel", (event) => {
      let delta = Math.sign(event.deltaY);

      this.distanceFromOrigin += delta * 1; // Zoom speed
      this.distanceFromOrigin = Math.max(0.1, this.distanceFromOrigin); // Zoom limit

      this.updateCamera();
    });
  }
  updateCascades(){
    // Update directional light shadow cascades
    let lightSpaceMatrices = [];
    for (let key in this.currentScene.lights) {
      let light = this.currentScene.lights[key];
      if (light.type == LightType.DIRECTIONAL) {
        light.cascades = setupCascades(this.NUM_SHADOW_CASCADES, light, this.currentScene.camera, this.shadowScene.cascadeSplits);
        for (let cascade of light.cascades){
          let lightSpaceMatrix = mat4.create();
          mat4.multiply(lightSpaceMatrix, cascade.orthoMatrix, cascade.viewMatrix);
          lightSpaceMatrices.push(lightSpaceMatrix);
        }
      }
    }
    dataViewSetMatrix(this.buffers.perFrameDataView, this.currentScene.camera.viewMatrixInverse, this.buffers.uniformLocations.perFrameUniformLocations.u_viewMatrixInverse);
    dataViewSetMatrixArray(this.buffers.lightDataView, lightSpaceMatrices, this.buffers.uniformLocations.lightUniformLocations.u_lightCascadeMatrices);
  }
  updateCamera() {
    //this.verticalAngle = Math.max(0, Math.min(Math.PI, this.verticalAngle));
    let currentPos = this.currentScene.camera.transform.getGlobalPosition();
    // Calculate forward vector
    let forward = [Math.cos(this.verticalAngle) * Math.sin(this.horizontalAngle), Math.sin(this.verticalAngle), Math.cos(this.verticalAngle) * Math.cos(this.horizontalAngle)];

    // Calculate right vector
    var rightX = -Math.sin(this.horizontalAngle + Math.PI / 2);
    var rightY = 0;
    var rightZ = -Math.cos(this.horizontalAngle + Math.PI / 2);

    // Update position based on velocity and direction
    let x = currentPos[0]+(forward[0] * this.velocity.forward + rightX * this.velocity.right) * this.speed;
    let y = currentPos[1]+(forward[1] * this.velocity.forward + rightY * this.velocity.right) * this.speed;
    let z = currentPos[2]+(forward[2] * this.velocity.forward + rightZ * this.velocity.right) * this.speed;

    // Update lookAt based on new position
    const lookAtX = x + forward[0];
    const lookAtY = y + forward[1];
    const lookAtZ = z + forward[2];

    this.currentScene.camera.transform.setLocalPosition([x, y, z]);
    //this.currentScene.camera.transform.setLocalRotationFromEuler([0,  0, this.horizontalAngle]); //not actually used for anything yet
    this.currentScene.camera.lookAt = vec3.fromValues(lookAtX, lookAtY, lookAtZ);
    //update camera transforms
    this.currentScene.camera.update();
    
    //Update data view
    dataViewSetVec4(this.buffers.perFrameDataView, this.currentScene.camera.transform.getGlobalPosition(), this.buffers.uniformLocations.perFrameUniformLocations.u_camPosWorldSpace);

    // Update shadow cascades after camera moves
    this.updateCascades();
  }
  createObjectFromDataWithTexture(pointsArray, normalsArray, texcoords, name, skipLighting = false, textures = [], normals = [], aoMaps = [], heightMaps = [], metallic = [], roughness = [], opacity = [], textureScale = 1.0){
    const gl = this.gl;
    let objectData = {
      geometries: [{data: {position: pointsArray, normal: normalsArray, texcoord: texcoords }}]
    }
    let shaderVariant = 0;
    if (skipLighting){
      shaderVariant |= this.SHADER_VARIANTS.SHADER_VARIANT_SKIP_LIGHTING;
    }
    if (textures.length == 0){
      let texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);

      let greyPixel = new Uint8Array([255, 0, 0, 255]);
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
    return createRenderable(gl, name, objectData, shaderVariant, textures, normals, aoMaps, heightMaps, metallic, roughness, opacity, textureScale);
  }

  createObjectFromData(pointsArray, normalsArray, texcoords, indices = [], color = [128, 128, 128, 255], name = null, skipLighting = false, ambientStrength = 0.01){
    const gl = this.gl;
    let objectData = {
      geometries: [{data: {positions: pointsArray, normals: normalsArray, texcoords: texcoords, indices: indices}}]
    }
    let shaderVariant = 0;
    if (skipLighting){
      shaderVariant |= this.SHADER_VARIANTS.SHADER_VARIANT_SKIP_LIGHTING;
    }
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    var pixel = new Uint8Array(color);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixel);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

    let material = new Material(texture, null, false, null, null, null, null, false, null, null, [1, 1, 1, 1], null, BLEND_MODE.BLEND_MODE_OPAQUE, null, null, 1.0, skipLighting, ambientStrength);
    let renderable = createRenderable(gl, name, objectData, material);
    return renderable;
  }


  setObjectData(object, pointsArray, normalsArray, texcoords, texture = null, normal = null, aoMap = null, heightMap = null, metallic = null, roughness = null, opacity = null, textureScale = 1.0){
    const gl = this.gl;
    let objectData = {
      geometries: [{data: {position: pointsArray, normal: normalsArray, texcoord: texcoords }}]
    }

    if (texture == null){
      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);

      var greyPixel = new Uint8Array([255, 0, 0, 255]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, greyPixel);

      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    }
    return updateRenderable(this.gl, object, objectData, shaderVariant, normalsArray, texcoords, texture, normal, aoMap, heightMap, metallic, roughness, opacity, textureScale = 1.0)
  }
  setObjectMesh(object, pointsArray, normalsArray, texcoords,){
    const gl = this.gl;
    let data = {
      geometries: [{data: {position: pointsArray, normal: normalsArray, texcoord: texcoords }}]
    }
    meshes = [];
    for (const geometry of data.geometries) {
      let tanbit = null;
      if (geometry.data.texcoords){
        tanbit = calculateTangentsBitangents(geometry.data.positions, geometry.data.normals, geometry.data.texcoords);
      }
      let baryCoords = getBarycentricCoordinates(geometry.data.positions.length);
      meshes.push(new Mesh(gl, geometry.data.positions, geometry.data.normals, geometry.data.texcoords, baryCoords,tanbit == null? null :  tanbit.tangents,tanbit == null? null :  tanbit.bitangents));
    }
    object.setMeshes(meshes);
  }
  // Load model from custom JSON format
  async loadModel(modelDescription, name = null) {
    const gl = this.gl;
    let texture = null;
    let normalMap = null;
    let aoMap = null;
    let heightMap = null;
    let metallic = null;
    let roughness = null;
    let opacity = null;
    let repeat = false;
    let textureScale = 1.0;
    let invertNormalMap = false;
    if (modelDescription.material == undefined){
      console.log ("Model has no material, and will not be loaded properly");
    }

    try {
      if (modelDescription.material.repeatTexture == true){
        repeat = true;
      }
    }
    catch{}

    try {
      if (modelDescription.material.invertNormalMap == true){
        invertNormalMap = true;
      }
    } catch {}
    try {
      textureScale = modelDescription.material.textureScale;
    }
    catch{}
    try {
        let textureName = modelDescription.material.texture;
        let textureImage = await loadTexture("textures/" + textureName);
        texture = createWebGLTexture(gl, textureImage, false, repeat);
    } catch {
      console.log("Object " + modelDescription.model + " has no texture");
    }

    try {
      let textureName = modelDescription.material.normal;
      let normalImage = await loadTexture("textures/" + textureName);
      normalMap = createWebGLTexture(gl, normalImage, false, repeat);
    } catch {
      console.log("Object " + modelDescription.model + " has no normals");
    }

    try {
      let textureName = modelDescription.material.aoMap
      let aoImage = await loadTexture("textures/" + textureName);
      aoMap = createWebGLTexture(gl, aoImage, false, repeat);
    } catch {
      console.log("Object " + modelDescription.model + " has no ao maps");
    }

    try {
      let textureName = modelDescription.material.heightMap
        let heightMapImage = await loadTexture("textures/" + textureName);
        heightMap = createWebGLTexture(gl, heightMapImage, false, repeat);
    } catch {
      console.log("Object " + modelDescription.model + " has no height maps");
    }
    let baseColorFactor = [1, 1, 1, 1];
    let metallicFactor = null;
    let roughnessFactor = null;
    try {
      let textureName = modelDescription.material.metallic
      let metallicImage = await loadTexture("textures/" + textureName);
      metallic = createWebGLTexture(gl, metallicImage, false, repeat);
      metallicFactor = 1.0;
    } catch {
      console.log("Object " + modelDescription.model + " has no metallic texture");
    }

    try {
      let textureName = modelDescription.material.roughness
      let roughnessImage = await loadTexture("textures/" + textureName);
      roughness = createWebGLTexture(gl, roughnessImage, false, repeat);
      roughnessFactor = 1.0;
    } catch {
      console.log("Object " + modelDescription.model + " has no roughness texture");
    }
    try {
      let textureName = modelDescription.material.opacity;
        let opacityImage = await loadTexture("textures/" + textureName);
        opacity = createWebGLTexture(gl, opacityImage, false, repeat);
    } catch {
      console.log("Object " + modelDescription.model + " has no opacity texture");
    }

    let objectData = await getObj("objects/" + modelDescription.model);
    console.log(objectData);

    let material = new Material(texture, normalMap, invertNormalMap, aoMap, heightMap, metallic, roughness, false, metallicFactor, roughnessFactor, baseColorFactor, opacity, BLEND_MODE.BLEND_MODE_OPAQUE, null, null, textureScale, false, 0.1, 1.0); //TODO: handle opaqueness on non-gltf models
    return createRenderable(gl, name, objectData, material);
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
  // Broken
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