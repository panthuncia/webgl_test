function calculateNormalMatrix(modelViewMatrix) {
  // Create a new 3x3 matrix as a subset of the model-view matrix
  var normalMatrix = mat3.create(); // Using glMatrix library for matrix operations
  mat3.fromMat4(normalMatrix, modelViewMatrix); // Extract the upper-left 3x3 part

  // Invert and transpose the matrix
  mat3.invert(normalMatrix, normalMatrix);
  mat3.transpose(normalMatrix, normalMatrix);

  return normalMatrix;
}

//https://webglfundamentals.org/webgl/lessons/webgl-load-obj.html
function parseOBJ(text) {
  // because indices are base 1 let's just fill in the 0th data
  const objPositions = [[0, 0, 0]];
  const objTexcoords = [[0, 0]];
  const objNormals = [[0, 0, 0]];

  // same order as `f` indices
  const objVertexData = [objPositions, objTexcoords, objNormals];

  // same order as `f` indices
  let webglVertexData = [
    [], // positions
    [], // texcoords
    [], // normals
  ];

  const materialLibs = [];
  const geometries = [];
  let geometry;
  let groups = ["default"];
  let material = "default";
  let object = "default";

  const noop = () => {};

  function newGeometry() {
    // If there is an existing geometry and it's
    // not empty then start a new one.
    if (geometry && geometry.data.position.length) {
      geometry = undefined;
    }
  }

  function setGeometry() {
    if (!geometry) {
      const position = [];
      const texcoord = [];
      const normal = [];
      webglVertexData = [position, texcoord, normal];
      geometry = {
        object,
        groups,
        material,
        data: {
          position,
          texcoord,
          normal,
        },
      };
      geometries.push(geometry);
    }
  }

  function addVertex(vert) {
    const ptn = vert.split("/");
    ptn.forEach((objIndexStr, i) => {
      if (!objIndexStr) {
        return;
      }
      const objIndex = parseInt(objIndexStr);
      const index = objIndex + (objIndex >= 0 ? 0 : objVertexData[i].length);
      webglVertexData[i].push(...objVertexData[i][index]);
    });
  }

  const keywords = {
    v(parts) {
      objPositions.push(parts.map(parseFloat));
    },
    vn(parts) {
      objNormals.push(parts.map(parseFloat));
    },
    vt(parts) {
      // should check for missing v and extra w?
      const [u, v] = parts.map(parseFloat);
      objTexcoords.push([u, 1 - v]);
    },
    f(parts) {
      setGeometry();
      const numTriangles = parts.length - 2;
      for (let tri = 0; tri < numTriangles; ++tri) {
        addVertex(parts[0]);
        addVertex(parts[tri + 1]);
        addVertex(parts[tri + 2]);
      }
    },
    s: noop, // smoothing group
    mtllib(parts, unparsedArgs) {
      // the spec says there can be multiple filenames here
      // but many exist with spaces in a single filename
      materialLibs.push(unparsedArgs);
    },
    usemtl(parts, unparsedArgs) {
      material = unparsedArgs;
      newGeometry();
    },
    g(parts) {
      groups = parts;
      newGeometry();
    },
    o(parts, unparsedArgs) {
      object = unparsedArgs;
      newGeometry();
    },
  };

  const keywordRE = /(\w*)(?: )*(.*)/;
  const lines = text.split("\n");
  for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
    const line = lines[lineNo].trim();
    if (line === "" || line.startsWith("#")) {
      continue;
    }
    const m = keywordRE.exec(line);
    if (!m) {
      continue;
    }
    const [, keyword, unparsedArgs] = m;
    const parts = line.split(/\s+/).slice(1);
    const handler = keywords[keyword];
    if (!handler) {
      console.warn("unhandled keyword:", keyword); // eslint-disable-line no-console
      continue;
    }
    handler(parts, unparsedArgs);
  }

  // remove any arrays that have no entries.
  for (const geometry of geometries) {
    geometry.data = Object.fromEntries(Object.entries(geometry.data).filter(([, array]) => array.length > 0));
  }

  return {
    geometries,
    materialLibs,
  };
}

function calculateTangentsBitangents(positions, normals, uvs) {
  let tangents = [];
  let bitangents = [];
  let j = 0;
  for (let i = 0; i < positions.length; i += 9) {
    // Extract vertices and UVs for the current triangle
    let v0 = { x: positions[i], y: positions[i + 1], z: positions[i + 2] };
    let v1 = { x: positions[i + 3], y: positions[i + 4], z: positions[i + 5] };
    let v2 = { x: positions[i + 6], y: positions[i + 7], z: positions[i + 8] };

    let uv0 = { u: uvs[j], v: uvs[j + 1] };
    let uv1 = { u: uvs[j + 2], v: uvs[j + 3] };
    let uv2 = { u: uvs[j + 4], v: uvs[j + 5] };

    // Calculate the deltas
    let deltaPos1 = { x: v1.x - v0.x, y: v1.y - v0.y, z: v1.z - v0.z };
    let deltaPos2 = { x: v2.x - v0.x, y: v2.y - v0.y, z: v2.z - v0.z };
    let deltaUV1 = { u: uv1.u - uv0.u, v: uv1.v - uv0.v };
    let deltaUV2 = { u: uv2.u - uv0.u, v: uv2.v - uv0.v };

    // Calculate the tangent and bitangent
    let r = 1.0 / (deltaUV1.u * deltaUV2.v - deltaUV1.v * deltaUV2.u);
    let tangent = {
      x: (deltaPos1.x * deltaUV2.v - deltaPos2.x * deltaUV1.v) * r,
      y: (deltaPos1.y * deltaUV2.v - deltaPos2.y * deltaUV1.v) * r,
      z: (deltaPos1.z * deltaUV2.v - deltaPos2.z * deltaUV1.v) * r,
    };
    let bitangent = {
      x: (deltaPos2.x * deltaUV1.u - deltaPos1.x * deltaUV2.u) * r,
      y: (deltaPos2.y * deltaUV1.u - deltaPos1.y * deltaUV2.u) * r,
      z: (deltaPos2.z * deltaUV1.u - deltaPos1.z * deltaUV2.u) * r,
    };

    // Store the tangent and bitangent for each vertex of the triangle
    tangents.push(tangent.x, tangent.y, tangent.z);
    tangents.push(tangent.x, tangent.y, tangent.z);
    tangents.push(tangent.x, tangent.y, tangent.z);
    bitangents.push(bitangent.x, bitangent.y, bitangent.z);
    bitangents.push(bitangent.x, bitangent.y, bitangent.z);
    bitangents.push(bitangent.x, bitangent.y, bitangent.z);
    j += 6;
  }

  return { tangents: tangents, bitangents: bitangents };
}

function compileShader(gl, shaderSource, shaderType) {
  const shader = gl.createShader(shaderType);
  gl.shaderSource(shader, shaderSource);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    console.error("An error occurred compiling the shader: " + info);
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

async function getObj(filename) {
  return await fetch(filename)
    .then((response) => response.text())
    .then((data) => {
      console.log("found file");
      return parseOBJ(data);
    });
}

function padArray(array, value, amount){
  for(let i=0; i<amount; i++){
    array.push(value);
  }
}

function getBarycentricCoordinates(length){
  let choices = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  let coords = [];
  for (let i=0; i<length/3; i++){
    for(let num of choices){
      coords.push(num);
    }
  }
  return coords;
}

function createRenderable(gl, data, shaderVariant, textures = [], normals = [], aoMaps = [], heightMaps = [], metallic = [], roughness = [], opacity = [], textureScale = 1.0, reuseTextures = true) {
  meshes = [];
  for (const geometry of data.geometries) {
    let tanbit = calculateTangentsBitangents(geometry.data.position, geometry.data.normal, geometry.data.texcoord);
    let baryCoords = getBarycentricCoordinates(geometry.data.position.length);
    meshes.push(new Mesh(gl, geometry.data.position, geometry.data.normal, geometry.data.texcoord, baryCoords, tanbit.tangents, tanbit.bitangents));
  }
  if(textures.length==1 && reuseTextures){
    padArray(textures, textures[0], meshes.length-1);
  }
  if(normals.length==1 && reuseTextures){
    padArray(normals, normals[0], meshes.length-1);
  }
  if(aoMaps.length==1 && reuseTextures){
    padArray(aoMaps, aoMaps[0], meshes.length-1);
  }
  if(heightMaps.length==1 && reuseTextures){
    padArray(heightMaps, heightMaps[0], meshes.length-1);
  }
  if(metallic.length==1 && reuseTextures){
    padArray(metallic, metallic[0], meshes.length-1);
  }
  if(roughness.length==1 && reuseTextures){
    padArray(roughness, roughness[0], meshes.length-1);
  }
  if(opacity.length==1 && reuseTextures){
    padArray(opacity, opacity[0], meshes.length-1);
  }
  return new RenderableObject(meshes, shaderVariant, textures, normals, aoMaps, heightMaps, metallic, roughness, opacity, textureScale);
}

async function loadTexture(url) {
  //Web environments suck I want to use C++/Vulkan
  const uniqueUrl = url + "?_ts=" + new Date().getTime();
  const response = await fetch(uniqueUrl);
  const blob = await response.blob();
  return createImageBitmap(blob);
}

function createWebGLTexture(gl, image, srgb = false, repeated = false, mipmaps = false) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeated ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, repeated ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  if (srgb) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
  }

  if (mipmaps) {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  }

  return texture;
}

async function loadText(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.text();
    return data;
  } catch (error) {
    console.error("Error fetching file:", error);
  }
}

async function loadJson(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching file:", error);
  }
}

function getFrustumCorners(fov, aspect, zNear, zFar, inverseViewMatrix) {
  let tanFov = Math.tan(fov / 2);

  let nearHeight = 2 * tanFov * zNear;
  let nearWidth = nearHeight * aspect;
  let farHeight = 2 * tanFov * zFar;
  let farWidth = farHeight * aspect;

  let corners = [
    vec3.transformMat4(vec3.create(), vec3.fromValues(-nearWidth / 2, nearHeight / 2, -zNear), inverseViewMatrix),
    vec3.transformMat4(vec3.create(), vec3.fromValues(nearWidth / 2, nearHeight / 2, -zNear), inverseViewMatrix),
    vec3.transformMat4(vec3.create(), vec3.fromValues(-nearWidth / 2, -nearHeight / 2, -zNear), inverseViewMatrix),
    vec3.transformMat4(vec3.create(), vec3.fromValues(nearWidth / 2, -nearHeight / 2, -zNear), inverseViewMatrix),
    vec3.transformMat4(vec3.create(), vec3.fromValues(-farWidth / 2, farHeight / 2, -zFar), inverseViewMatrix),
    vec3.transformMat4(vec3.create(), vec3.fromValues(farWidth / 2, farHeight / 2, -zFar), inverseViewMatrix),
    vec3.transformMat4(vec3.create(), vec3.fromValues(-farWidth / 2, -farHeight / 2, -zFar), inverseViewMatrix),
    vec3.transformMat4(vec3.create(), vec3.fromValues(farWidth / 2, -farHeight / 2, -zFar), inverseViewMatrix),
  ];

  return corners;
}

function getFrustumCenter(cameraPosition, cameraForward, zNear, zFar) {
  let nearCenter = vec3.scaleAndAdd(vec3.create(), cameraPosition, cameraForward, zNear);
  let farCenter = vec3.scaleAndAdd(vec3.create(), cameraPosition, cameraForward, zFar);

  let frustumCenter = vec3.lerp(vec3.create(), nearCenter, farCenter, 0.5);
  return frustumCenter;
}

function computeAABB(points) {
  let min = vec3.fromValues(Infinity, Infinity, Infinity);
  let max = vec3.fromValues(-Infinity, -Infinity, -Infinity);

  for (let point of points) {
    vec3.min(min, min, point);
    vec3.max(max, max, point);
  }

  return [min, max];
}

function calculateForwardVector(cameraPosition, targetPosition) {
  let forwardVector = vec3.subtract(vec3.create(), targetPosition, cameraPosition);
  vec3.normalize(forwardVector, forwardVector);
  return forwardVector;
}

function calculateCascadeSplits(numCascades, zNear, zFar, maxDist, lambda = 0.5) {
  let splits = [];
  let end = Math.min(zFar, maxDist);
  let logNear = Math.log(zNear);
  let logFar = Math.log(end);
  let logRange = logFar - logNear;
  let uniformRange = end - zNear;

  for (let i = 0; i < numCascades; i++) {
    let p = (i + 1) / numCascades;
    let logSplit = Math.exp(logNear + logRange * p);
    let uniformSplit = zNear + uniformRange * p;
    splits[i] = lambda * logSplit + (1 - lambda) * uniformSplit;
  }
  return splits;
}

// function getOrthographicFromCorners(corners) {
//   let [min, max] = computeAABB(corners);

//   let left = min[0];
//   let right = max[0];
//   let bottom = min[1];
//   let top = max[1];
//   let near = min[2];
//   let far = max[2];

//   //return mat4.ortho(mat4.create(), left, right, top, bottom, near, far);
//   //return mat4.ortho(mat4.create(), -50, 50, -50, 50, -50, 50);
//   return mat4.ortho(mat4.create(), min[0]/5, max[0]/5, min[1]/5, max[1]/5, -max[2]/5, -min[2]/5);
// }

function createDirectionalLightViewMatrix(lightDir, target) {
  const up = vec3.fromValues(0, 1, 0); // World's up direction
  const lightPosition = vec3.create();
  //vec3.scale(lightDir, lightDir, -1);
  vec3.scale(lightPosition, lightDir, 1);
  vec3.add(lightPosition, target, lightPosition);

  const viewMatrix = mat4.create();
  mat4.lookAt(viewMatrix, lightPosition, target, up);

  return viewMatrix;
}

function getCascadeCenter(cameraPosition, cameraForward, cascadeSize) {
  let center = vec3.scaleAndAdd(vec3.create(), cameraPosition, cameraForward, cascadeSize);
  // Align the center to a fixed grid in world space
  // center[0] = Math.floor(center[0] / cascadeSize) * cascadeSize;
  // center[1] = Math.floor(center[1] / cascadeSize) * cascadeSize;
  // center[2] = Math.floor(center[2] / cascadeSize) * cascadeSize;
  return center;
}

function getOrthographicProjectionMatrix(cascadeSize, nearPlane, farPlane) {
  return mat4.ortho(mat4.create(), -cascadeSize, cascadeSize, -cascadeSize, cascadeSize, nearPlane, farPlane);
}

function getLightViewMatrix(lightDirection, lightUp, cascadeCenter) {
  let lookAtPoint = vec3.add(vec3.create(), cascadeCenter, lightDirection);
  return mat4.lookAt(mat4.create(), cascadeCenter, lookAtPoint, lightUp);
}

function setupCascades(numCascades, light, camera, cascadeSplits) {
  let cascades = [];

  for (let i = 0; i < numCascades; i++) {
    let size = cascadeSplits[i];
    let center = vec3.fromValues(camera.position[0], 0, camera.position[2]); //getCascadeCenter(camera.position, calculateForwardVector(camera.position, camera.lookAt), size);
    let viewMatrix = createDirectionalLightViewMatrix(light.getLightDir(), center);
    let orthoMatrix = getOrthographicProjectionMatrix(size, -200, 200);

    cascades.push({ size, center, orthoMatrix, viewMatrix });
  }

  return cascades;
}

function createCubemap(gl) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);

  const faceInfos = [
    { target: gl.TEXTURE_CUBE_MAP_POSITIVE_X, url: "https://web.cs.wpi.edu/~jmcuneo/cs4731/project3/skybox_posx.png" },
    { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_X, url: "https://web.cs.wpi.edu/~jmcuneo/cs4731/project3/skybox_negx.png" },
    { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Y, url: "https://web.cs.wpi.edu/~jmcuneo/cs4731/project3/skybox_posy.png" },
    { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, url: "https://web.cs.wpi.edu/~jmcuneo/cs4731/project3/skybox_negy.png" },
    { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Z, url: "https://web.cs.wpi.edu/~jmcuneo/cs4731/project3/skybox_posz.png" },
    { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, url: "https://web.cs.wpi.edu/~jmcuneo/cs4731/project3/skybox_negz.png" },
  ];
  faceInfos.forEach((faceInfo) => {
    const { target, url } = faceInfo;

    gl.texImage2D(target, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 255, 255]));

    const image = new Image();
    image.onload = function () {
      gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
      gl.texImage2D(target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
    };
    image.src = url;
  });
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

  return texture;
}

function dataViewSetMatrix(dataView, matrix, baseOffset) {
  for (let i = 0; i < 16; i++) {
    let offset = baseOffset + i * 4;
    dataView.setFloat32(offset, matrix[i], true);
  }
}

function dataViewSetMatrixArray(dataView, matrices, baseOffset) {
  for (let i = 0; i < matrices.length; i++) {
    currentMatrixOffset = i*64;
    let matrix = matrices[i]
    for (let j = 0; j < 16; j++) {
      let offset = baseOffset + currentMatrixOffset + j * 4;
      dataView.setFloat32(offset, matrix[j], true);
    }
  }
}

function dataViewSetFloatArray(dataView, floatArray, baseOffset) {
  for (let i = 0; i < floatArray.length; i++) {
    let offset = baseOffset + i * 4;
    dataView.setFloat32(offset, floatArray[i], true);
  }
}

function calculateUV(a) {
  let theta = Math.atan2(a[1], a[0]);
  const phi = Math.acos(a[2]/Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]))
  if (theta<0){
    theta +=2*Math.PI;
  }
  const u = theta/ (2*Math.PI);
  const v = phi/Math.PI;
  return [u, v];
}

function triangle(a, b, c, pointsArray, normalsArray, texCoordsArray) {

  pointsArray.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  
  //normal = calculateNormal([a, b, c]);

  // normalsArray.push(normal.x, normal.y, normal.z);
  // normalsArray.push(normal.x, normal.y, normal.z);
  // normalsArray.push(normal.x, normal.y, normal.z);

  normalsArray.push(a[0], a[1], a[2]);
  normalsArray.push(b[0], b[1], b[2]);
  normalsArray.push(c[0], c[1], c[2]);

  let aUV = calculateUV(a);
  let bUV = calculateUV(b);
  let cUV = calculateUV(c);

  texCoordsArray.push(aUV[0], aUV[1], bUV[0], bUV[1], cUV[0], cUV[1]);
}

function dot( u, v )
{
    if ( u.length != v.length ) {
        throw "dot(): vectors are not the same dimension";
    }

    var sum = 0.0;
    for ( var i = 0; i < u.length; ++i ) {
        sum += u[i] * v[i];
    }

    return sum;
}

function length( u )
{
    return Math.sqrt( dot(u, u) );
}

function normalize( u, excludeLastComponent )
{
    if ( excludeLastComponent ) {
        var last = u.pop();
    }

    var len = length( u );

    if ( !isFinite(len) ) {
        throw "normalize: vector " + u + " has zero length";
    }

    for ( var i = 0; i < u.length; ++i ) {
        u[i] /= len;
    }

    if ( excludeLastComponent ) {
        u.push( last );
    }

    return u;
}

function mix( u, v, s )
{
    if ( typeof s !== "number" ) {
        throw "mix: the last paramter " + s + " must be a number";
    }

    if ( u.length != v.length ) {
        throw "vector dimension mismatch";
    }

    var result = [];
    for ( var i = 0; i < u.length; ++i ) {
        result.push( (1.0 - s) * u[i] + s * v[i] );
    }

    return result;
}

function divideTriangle(a, b, c, count, pointsArray, normalsArray, texCoordsArray) {
  if (count > 0) {
      var ab = mix(a, b, 0.5);
      var ac = mix(a, c, 0.5);
      var bc = mix(b, c, 0.5);

      ab = normalize(ab, true);
      ac = normalize(ac, true);
      bc = normalize(bc, true);

      divideTriangle(a, ab, ac, count - 1, pointsArray, normalsArray, texCoordsArray);
      divideTriangle(ab, b, bc, count - 1, pointsArray, normalsArray, texCoordsArray);
      divideTriangle(ac, bc, c, count - 1, pointsArray, normalsArray, texCoordsArray);
      divideTriangle(ab, bc, ac, count - 1, pointsArray, normalsArray, texCoordsArray);
  } else {
      triangle(a, b, c, pointsArray, normalsArray, texCoordsArray);
  }
}

function tetrahedron(a, b, c, d, n) {
  let pointsArray = [];
  let normalsArray = [];
  let texCoordArray = [];
  divideTriangle(a, b, c, n, pointsArray, normalsArray, texCoordArray);
  divideTriangle(d, c, b, n, pointsArray, normalsArray, texCoordArray);
  divideTriangle(a, d, b, n, pointsArray, normalsArray, texCoordArray);
  divideTriangle(a, c, d, n, pointsArray, normalsArray, texCoordArray);

  return {pointsArray, normalsArray, texCoordArray};
}

function cube(a, b, c, d, e, f, g, h, n) {
  let pointsArray = [];
  let normalsArray = [];
  let texCoordArray = [];

  divideTriangle(a, b, c, n, pointsArray, normalsArray, texCoordArray);
  divideTriangle(a, c, d, n, pointsArray, normalsArray, texCoordArray);

  divideTriangle(e, f, b, n, pointsArray, normalsArray, texCoordArray);
  divideTriangle(a, e, b, n, pointsArray, normalsArray, texCoordArray);

  divideTriangle(h, g, f, n, pointsArray, normalsArray, texCoordArray);
  divideTriangle(e, h, f, n, pointsArray, normalsArray, texCoordArray);

  divideTriangle(d, c, g, n, pointsArray, normalsArray, texCoordArray);
  divideTriangle(h, d, g, n, pointsArray, normalsArray, texCoordArray);

  divideTriangle(f, g, b, n, pointsArray, normalsArray, texCoordArray);
  divideTriangle(b, g, c, n, pointsArray, normalsArray, texCoordArray);

  divideTriangle(d, h, e, n, pointsArray, normalsArray, texCoordArray);
  divideTriangle(a, d, e, n, pointsArray, normalsArray, texCoordArray); 

  return {pointsArray, normalsArray, texCoordArray};
}

function lerpTransform(transformA, transformB, t) {
  let newPos = vec3.create();
  vec3.lerp(newPos, transformA.pos, transformB.pos, t);

  let newRot = quat.create();
  quat.slerp(newRot, transformA.rot, transformB.rot, t);

  let newScale = vec3.create();
  vec3.lerp(newScale, transformA.scale, transformB.scale, t);

  let newTransform = new Transform(newPos, [0, 0, 0], newScale);
  newTransform.rot = newRot;

  return newTransform;
}

function linesFromPositions(positions){
  let lines = [];
  for(let i=0; i<positions.length-1; i++){
    lines.push(positions[i][0], positions[i][1], positions[i][2], positions[i+1][0], positions[i+1][1], positions[i+1][2]);
  }
  return lines;
}

function chaikin(vertices, iterations) {

  if (iterations === 0) {
      return vertices;
  }

  var newVertices = [];

  for(var i = 0; i < vertices.length - 1; i++) {
      var v0 = vertices[i];
      var v1 = vertices[i + 1];

      var p0 = mix(v0, v1, 0.25);
      var p1 = mix(v0, v1, 0.75);

      newVertices.push(p0, p1);
  }
  return chaikin(newVertices, iterations - 1);
}

