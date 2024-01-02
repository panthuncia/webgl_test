async function createProgramVariants(vsPath, fsPath, shaderVariantsToCompile) {
  let fsSource = await (loadText(fsPath));
  let vsSource = await (loadText(vsPath));


  for (const variantID of shaderVariantsToCompile) {
    let defines = "";
    if (variantID & shaderVariantNormalMap) {
      defines += "#define USE_NORMAL_MAP\n";
    }
    if (variantID & shaderVariantBakedAO) {
      defines += "#define USE_BAKED_AO\n";
    }
    if (variantID & shaderVariantParallax) {
      defines += "#define USE_PARALLAX\n";
    }
    if (variantID & shaderVariantPBR){
      defines += "#define USE_PBR\n";
    }
    if (variantID & ShaderVariantOpacityMap){
      defines += "#define USE_OPACITY_MAP\n";
    }
    let vertexShader = compileShader(gl, defines + vsSource, gl.VERTEX_SHADER);
    let fragmentShader = compileShader(gl, defines + fsSource, gl.FRAGMENT_SHADER);

    let shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);
    let programInfo = {
      program: shaderProgram,
      attribLocations: {
        vertexPosition: gl.getAttribLocation(shaderProgram, 'a_position'),
        vertexNormal: gl.getAttribLocation(shaderProgram, 'a_normal'),
        texCoord: gl.getAttribLocation(shaderProgram, 'a_texCoord')
      },
      uniformLocations: {
        projectionMatrix: gl.getUniformLocation(shaderProgram, 'u_projectionMatrix'),
        modelViewMatrix: gl.getUniformLocation(shaderProgram, 'u_modelViewMatrix'),
        normalMatrix: gl.getUniformLocation(shaderProgram, 'u_normalMatrix'),
        numLights: gl.getUniformLocation(shaderProgram, 'u_numLights'),
        lightPosViewSpace: gl.getUniformLocation(shaderProgram, 'u_lightPosViewSpace'),
        lightColor: gl.getUniformLocation(shaderProgram, 'u_lightColor'),
        lightAttenuation: gl.getUniformLocation(shaderProgram, 'u_lightAttenuation'),
        lightProperties: gl.getUniformLocation(shaderProgram, 'u_lightProperties'),
        lightDirection: gl.getUniformLocation(shaderProgram, 'u_lightDirViewSpace'),
        objectTexture: gl.getUniformLocation(shaderProgram, 'u_baseColorTexture'),
        ambientLightStrength: gl.getUniformLocation(shaderProgram, 'u_ambientStrength'),
        specularLightStrength: gl.getUniformLocation(shaderProgram, 'u_specularStrength'),

      },
    }
    if (variantID & shaderVariantNormalMap) {
      programInfo.uniformLocations.modelMatrix = gl.getUniformLocation(shaderProgram, 'u_modelMatrix');
      programInfo.attribLocations.vertexTangent = gl.getAttribLocation(shaderProgram, 'a_tangent');
      programInfo.attribLocations.vertexBitangent = gl.getAttribLocation(shaderProgram, 'a_bitangent');
      programInfo.uniformLocations.normalTexture = gl.getUniformLocation(shaderProgram, 'u_normalMap');
    }
    if (variantID & shaderVariantBakedAO) {
      programInfo.uniformLocations.aoTexture = gl.getUniformLocation(shaderProgram, 'u_aoMap');
    }
    if (variantID & shaderVariantParallax) {
      programInfo.uniformLocations.heightMap = gl.getUniformLocation(shaderProgram, 'u_heightMap');
    }
    if (variantID & shaderVariantPBR) {
      programInfo.uniformLocations.metallic = gl.getUniformLocation(shaderProgram, 'u_metallic');
      programInfo.uniformLocations.roughness = gl.getUniformLocation(shaderProgram, 'u_roughness');
    }
    if (variantID & ShaderVariantOpacityMap) {
      programInfo.uniformLocations.opacity = gl.getUniformLocation(shaderProgram, 'u_opacity');
    }
    globalShaderProgramVariants[variantID] = programInfo;
  }
}

var globalMatrices = {
  viewMatrix: mat4.create(),
  projectionMatrix: mat4.create()
};

var currentScene = {
  shadowScene: {}
}

function updateScene(){
  for(entity of currentScene.objects){
    entity.updateSelfAndChildren();
  }
}

async function drawScene() {
  updateScene();
  updateLights();
  shadowPass();
  gl.clearColor(0.0, 0.0, 1.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  drawFullscreenQuad(currentScene.shadowScene.shadowMap);
  return;
  for (const object of currentScene.objects) {

    //compile shaders on first occurence of variant, shortens startup at cost of some stutter on object load
    if(!globalShaderProgramVariants[object.shaderVariant]){
      await(createProgramVariants("shaders/vertex.glsl", "shaders/fragment.glsl", [object.shaderVariant]));
    }
    programInfo = globalShaderProgramVariants[object.shaderVariant]
    gl.useProgram(programInfo.program)

    gl.uniform1f(programInfo.uniformLocations.ambientLightStrength, 0.005);
    gl.uniform1f(programInfo.uniformLocations.specularLightStrength, 1);


    gl.uniform1i(programInfo.uniformLocations.numLights, currentScene.lights.length);
    gl.uniform4fv(programInfo.uniformLocations.lightPosViewSpace, currentScene.lightPositionsData);
    gl.uniform4fv(programInfo.uniformLocations.lightColor, currentScene.lightColorsData);
    gl.uniform4fv(programInfo.uniformLocations.lightAttenuation, currentScene.lightAttenuationsData);
    gl.uniform4fv(programInfo.uniformLocations.lightProperties, currentScene.lightPropertiesData);
    gl.uniform4fv(programInfo.uniformLocations.lightDirection, currentScene.lightDirectionsData);


    //gl.uniform3f(programInfo.uniformLocations.viewPos, 0, 0, 0);
    let modelViewMatrix = mat4.create();
    mat4.multiply(modelViewMatrix, globalMatrices.viewMatrix, object.transform.modelMatrix);

    gl.uniformMatrix4fv(programInfo.uniformLocations.modelViewMatrix, false, modelViewMatrix);
    gl.uniformMatrix4fv(
      programInfo.uniformLocations.projectionMatrix,
      false,
      globalMatrices.projectionMatrix);
    let normalMatrix = calculateNormalMatrix(modelViewMatrix);
    gl.uniformMatrix3fv(programInfo.uniformLocations.normalMatrix, false, normalMatrix);

    if (object.shaderVariant & shaderVariantNormalMap) {
      gl.uniformMatrix4fv(programInfo.uniformLocations.modelMatrix, false, object.transform.modelMatrix);
    }
    let i = 0;
    for (const mesh of object.meshes) {
      //vertices
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vertexBuffer);
      gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
      //normals
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
      gl.vertexAttribPointer(programInfo.attribLocations.vertexNormal, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(programInfo.attribLocations.vertexNormal);
      //texcoords
      gl.bindBuffer(gl.ARRAY_BUFFER, mesh.texCoordBuffer);
      gl.vertexAttribPointer(programInfo.attribLocations.texCoord, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(programInfo.attribLocations.texCoord);

      let textureUnit = 0
      //base texture
      gl.activeTexture(gl.TEXTURE0 + textureUnit);
      gl.bindTexture(gl.TEXTURE_2D, object.textures[i]);
      gl.uniform1i(programInfo.uniformLocations.objectTexture, textureUnit);
      textureUnit += 1;

      //if we have a normal map for this mesh
      if (object.shaderVariant & shaderVariantNormalMap) {
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
      if (object.shaderVariant & shaderVariantBakedAO) {
        gl.activeTexture(gl.TEXTURE0 + textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, object.aoMaps[i]);
        gl.uniform1i(programInfo.uniformLocations.aoTexture, textureUnit);
        textureUnit += 1;
      }
      //height texture
      if (object.shaderVariant & shaderVariantParallax) {
        gl.activeTexture(gl.TEXTURE0 + textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, object.heightMaps[i]);
        gl.uniform1i(programInfo.uniformLocations.heightMap, textureUnit);
        textureUnit += 1;
      }
      //PBR metallic & roughness textures
      if (object.shaderVariant & shaderVariantPBR) {
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
      if (object.shaderVariant & ShaderVariantOpacityMap) {
        gl.activeTexture(gl.TEXTURE0 + textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, object.opacity[i]);
        gl.uniform1i(programInfo.uniformLocations.opacity, textureUnit);
        textureUnit += 1;
      }

      gl.drawArrays(gl.TRIANGLES, 0, mesh.vertices.length / 3);

      i += 1;
    }
    //console.log("done with object")
  }
  updateCamera();
  requestAnimationFrame(drawScene);
}

function updateLights() {
  currentScene.numLights = currentScene.lights.length;
  for (let i = 0; i < currentScene.lights.length; i++) {

    let lightPosWorld = currentScene.lights[i].position;
    let lightPosView = vec3.create();
    vec3.transformMat4(lightPosView, lightPosWorld, globalMatrices.viewMatrix);

    currentScene.lightPositionsData[i * 4] = lightPosView[0];
    currentScene.lightPositionsData[i * 4 + 1] = lightPosView[1];
    currentScene.lightPositionsData[i * 4 + 2] = lightPosView[2];
    currentScene.lightPositionsData[i * 4 + 3] = 0; //padding for uniform block alignment, unused in shader


    currentScene.lightAttenuationsData[i * 4] = currentScene.lights[i].constantAttenuation;
    currentScene.lightAttenuationsData[i * 4 + 1] = currentScene.lights[i].linearAttenuation;
    currentScene.lightAttenuationsData[i * 4 + 2] = currentScene.lights[i].quadraticAttenuation;

    let lightColor = currentScene.lights[i].color;
    currentScene.lightColorsData[i * 4] = lightColor[0];
    currentScene.lightColorsData[i * 4 + 1] = lightColor[1];
    currentScene.lightColorsData[i * 4 + 2] = lightColor[2];
    currentScene.lightColorsData[i * 4 + 3] = 1.0;

    let lightDirWorld = currentScene.lights[i].direction;
    let lightDirView = vec3.create();
    viewMatrix3x3 = mat3.create();
    mat3.fromMat4(viewMatrix3x3, globalMatrices.viewMatrix); // Extract the upper-left 3x3 part
    vec3.transformMat3(lightDirView, lightDirWorld, viewMatrix3x3);

    currentScene.lightDirectionsData[i * 4] = lightDirView[0];
    currentScene.lightDirectionsData[i * 4 + 1] = lightDirView[1];
    currentScene.lightDirectionsData[i * 4 + 2] = lightDirView[2];

    currentScene.lightPropertiesData[i * 4] = currentScene.lights[i].type;
    if (currentScene.lights[i].type == LightType.SPOT) {
      currentScene.lightPropertiesData[i * 4 + 1] = Math.cos(currentScene.lights[i].innerConeAngle);
      currentScene.lightPropertiesData[i * 4 + 2] = Math.cos(currentScene.lights[i].outerConeAngle);
    }
  }
}

function initLightVectors() {
  currentScene.lightPositionsData = new Float32Array(GLOBAL_MAX_LIGHTS * 4);
  currentScene.lightColorsData = new Float32Array(GLOBAL_MAX_LIGHTS * 4);
  currentScene.lightAttenuationsData = new Float32Array(GLOBAL_MAX_LIGHTS * 4);
  currentScene.lightDirectionsData = new Float32Array(GLOBAL_MAX_LIGHTS * 4);
  currentScene.lightPropertiesData = new Float32Array(GLOBAL_MAX_LIGHTS * 4);

}

async function main() {

  //let programInfo = await createProgramVariants("shaders/vertex.glsl", "shaders/fragment.glsl");

  let fieldOfView = 45 * Math.PI / 180; // in radians
  let aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
  let zNear = 0.1;
  let zFar = 100.0;
  let projectionMatrix = mat4.create();
  mat4.perspective(projectionMatrix, fieldOfView, aspect, zNear, zFar);
  globalMatrices.projectionMatrix = projectionMatrix

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LESS);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.blendEquation(gl.FUNC_ADD);

  let mainObject = await (loadModel(await (loadJson("objects/descriptions/house_pbr.json"))));
  let sphereObject = await (loadModel(await (loadJson("objects/descriptions/brick_sphere.json"))));

  sphereObject.transform.setLocalPosition([0, 10, 0]);
  sphereObject.transform.setLocalScale([.1, .1, .1]);

  currentScene.objects = [mainObject, sphereObject];

  let light1 = new Light(LightType.POINT, [0, 0, 5], [1, 1, 1], 1.0, 0.09, 0.032);
  let light2 = new Light(LightType.POINT, [9, 0, 0], [4, 4, 4], 1.0, 0.09, 0.032);
  let light3 = new Light(LightType.SPOT, [-10, 1, 0], [1, 1, 1], 1.0, 0.09, 0.032, [1, 0, 0], Math.PI / 8, Math.PI / 6);
  let light4 = new Light(LightType.SPOT, [0, 10, 0], [1, 1, 1], 1.0, 0.01, 0.0032, [0, -1, 0], Math.PI / 8, Math.PI / 6);
  let light5 = new Light(LightType.DIRECTIONAL, [0,0,0], [1,1,1], 0, 0, 0, [1, 1, 1]);

  currentScene.lights = [light5];
  initLightVectors();
  updateLights();
  await(initShadowScene());
  await(createDebugQuad());
  requestAnimationFrame(drawScene)
}

main()