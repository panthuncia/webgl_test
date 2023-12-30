var GLOBAL_MAX_LIGHTS = 128;

var shaderVariantNormalMap = 0b1;
var shaderVariantBakedAO = 0b10;
var shaderVariantParallax = 0b100;
var shaderVariantsToCompile = [0b000, 0b001, 0b010, 0b100, 0b011, 0b101, 0b111, 0b110];
var globalShaderProgramVariants = {}
async function createProgramVariants(vsPath, fsPath) {
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
    let vertexShader = compileShader(gl, defines+vsSource, gl.VERTEX_SHADER);
    let fragmentShader = compileShader(gl, defines+fsSource, gl.FRAGMENT_SHADER);

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
    globalShaderProgramVariants[variantID] = programInfo;
  }
}

var globalMatrices = {
  viewMatrix: mat4.create(),
  projectionMatrix: mat4.create()
};

var currentScene = {

}

function drawScene() {
  updateLights();
  gl.clearColor(0.0, 0.0, 1.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  for (const object of currentScene.objects) {
    programInfo = globalShaderProgramVariants[object.shaderVariant]
    gl.useProgram(programInfo.program)

    gl.uniform1f(programInfo.uniformLocations.ambientLightStrength, 0.1);
    gl.uniform1f(programInfo.uniformLocations.specularLightStrength, 1);

    
    gl.uniform1i(programInfo.uniformLocations.numLights, currentScene.lights.length);
    gl.uniform4fv(programInfo.uniformLocations.lightPosViewSpace, currentScene.lightPositionsData);
    gl.uniform4fv(programInfo.uniformLocations.lightColor, currentScene.lightColorsData);
    gl.uniform4fv(programInfo.uniformLocations.lightAttenuation, currentScene.lightAttenuationsData);
    //gl.uniform3f(programInfo.uniformLocations.viewPos, 0, 0, 0);
    let modelViewMatrix = mat4.create();
    mat4.multiply(modelViewMatrix, globalMatrices.viewMatrix, object.modelMatrix);

    gl.uniformMatrix4fv(programInfo.uniformLocations.modelViewMatrix, false, modelViewMatrix);
    gl.uniformMatrix4fv(
      programInfo.uniformLocations.projectionMatrix,
      false,
      globalMatrices.projectionMatrix);
    let normalMatrix = calculateNormalMatrix(modelViewMatrix);
    gl.uniformMatrix3fv(programInfo.uniformLocations.normalMatrix, false, normalMatrix);

    if (object.shaderVariant & shaderVariantNormalMap) {
      gl.uniformMatrix4fv(programInfo.uniformLocations.modelMatrix, false, object.modelMatrix);
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

      gl.drawArrays(gl.TRIANGLES, 0, mesh.vertices.length / 3);

      i += 1;
    }
    //console.log("done with object")
  }
  updateCamera();
  requestAnimationFrame(drawScene);
}

// var houseObjectDescription = {
//   model: "Cottage_FREE.obj",
//   matfile: "Cottage_FREE.mtl",
//   textures: [
//     "Cottage_Clean_Base_Color.png"
//   ],
//   normals: [
//     "Cottage_Clean_Normal.png"
//   ],
//   aoMaps: [
//     "Cottage_Clean_AO.png"
//   ],
//   heightMaps: [
//     "Cottage_Clean_Height.png"
//   ]
// }

async function loadModel(modelDescription) {
  let textures = []
  let normals = []
  let aoMaps = []
  let heightMaps = []
  shaderVariant = 0
  try {
    for (const textureName of modelDescription.textures) {
      let textureImage = await (loadTexture("textures/" + textureName));
      let texture = createWebGLTexture(gl, textureImage);
      textures.push(texture);
    }
  } catch {
    console.log("Object " + modelDescription.model + " has no texture")
  }

  try {
    for (const textureName of modelDescription.normals) {
      let normalImage = await (loadTexture("textures/" + textureName));
      let normalTexture = createWebGLTexture(gl, normalImage);
      normals.push(normalTexture);
    }
    shaderVariant |= shaderVariantNormalMap;
  } catch {
    console.log("Object " + modelDescription.model + " has no normals")
  }

  try {
    for (const textureName of modelDescription.aoMaps) {
      let aoImage = await (loadTexture("textures/" + textureName));
      let aoTexture = createWebGLTexture(gl, aoImage);
      aoMaps.push(aoTexture);
    }
    shaderVariant |= shaderVariantBakedAO;
  } catch {
    console.log("Object " + modelDescription.model + " has no ao maps")
  }

  try {
    for (const textureName of modelDescription.heightMaps) {
      let heightMapImage = await loadTexture("textures/" + textureName);
      let heightMapTexture = createWebGLTexture(gl, heightMapImage);
      heightMaps.push(heightMapTexture);
    }
    shaderVariant |= shaderVariantParallax;
  } catch {
    console.log("Object " + modelDescription.model + " has no height maps")
  }

  let objectData = await (getObj('objects/' + modelDescription.model));
  console.log(objectData);
  return renderableObject = createRenderable(objectData, shaderVariant, textures, normals, aoMaps, heightMaps);
}

function updateLights(){
  currentScene.numLights = currentScene.lights.length;
  for (let i=0; i<currentScene.lights.length; i++){
    currentScene.lightTypesData[i] = currentScene.lights[i].type;
    let lightPosWorld = currentScene.lights[i].position;
    let lightPosView = vec3.create();
    vec3.transformMat4(lightPosView, lightPosWorld, globalMatrices.viewMatrix);

    currentScene.lightPositionsData[i*4] = lightPosView[0];
    currentScene.lightPositionsData[i*4+1] = lightPosView[1];
    currentScene.lightPositionsData[i*4+2] = lightPosView[2];
    currentScene.lightPositionsData[i*4+3] = 0; //padding for uniform block alignment, unused in shader


    currentScene.lightAttenuationsData[i*4] = currentScene.lights[i].constantAttenuation;
    currentScene.lightAttenuationsData[i*4+1] = currentScene.lights[i].linearAttenuation;
    currentScene.lightAttenuationsData[i*4+2] = currentScene.lights[i].quadraticAttenuation;

    let lightColor = currentScene.lights[i].color;
    currentScene.lightColorsData[i*4] = lightColor[0];
    currentScene.lightColorsData[i*4+1] = lightColor[1];
    currentScene.lightColorsData[i*4+2] = lightColor[2];
    currentScene.lightColorsData[i*4+3] = 1.0;
  }
}

function initLightVectors(){
  currentScene.lightTypesData = new Int8Array(GLOBAL_MAX_LIGHTS);
  currentScene.lightPositionsData = new Float32Array(GLOBAL_MAX_LIGHTS * 3);
  currentScene.lightColorsData = new Float32Array(GLOBAL_MAX_LIGHTS * 3);
  currentScene.lightAttenuationsData = new Float32Array(GLOBAL_MAX_LIGHTS * 4);
}

async function main() {

  let programInfo = await createProgramVariants("shaders/vertex.glsl", "shaders/fragment.glsl");

  let fieldOfView = 45 * Math.PI / 180; // in radians
  let aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
  let zNear = 0.1;
  let zFar = 100.0;
  let projectionMatrix = mat4.create();
  mat4.perspective(projectionMatrix, fieldOfView, aspect, zNear, zFar);
  globalMatrices.projectionMatrix = projectionMatrix

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LESS);

  let mainObject = await (loadModel(await (loadJson("objects/descriptions/house.json"))));
  let sphereObject = await (loadModel(await (loadJson("objects/descriptions/brick_sphere.json"))));

  mat4.translate(sphereObject.modelMatrix, sphereObject.modelMatrix, [0.0, 10.0, 0.0])
  mat4.scale(sphereObject.modelMatrix, sphereObject.modelMatrix, vec3.fromValues(.1, .1, .1))

  currentScene.objects = [mainObject, sphereObject];

  let light1 = new Light(LightType.SPOT, [0, 0, 5], [1, 1, 1], 1.0, 0.09, 0.032);
  let light2 = new Light(LightType.SPOT, [7, 0, 0], [1, 1, 1], 1.0, 0.09, 0.032);
  currentScene.lights = [light1, light2];
  initLightVectors();
  updateLights();

  requestAnimationFrame(drawScene)
}

main()