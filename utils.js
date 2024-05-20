//normal matrix as inverse-transpose of model-view matrix
function calculateNormalMatrix(modelViewMatrix) {
  var normalMatrix = mat3.create();
  mat3.fromMat4(normalMatrix, modelViewMatrix);

  mat3.invert(normalMatrix, normalMatrix);
  mat3.transpose(normalMatrix, normalMatrix);

  return normalMatrix;
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

function createRenderableObject(gl, data, material, name) {
  let meshes = [];
  for (const geometry of data.geometries) {
    let tanbit = null;
    if (geometry.data.texcoords) {
      if (geometry.data.indices){
        tanbit = calculateTangentsBitangentsIndexed(geometry.data.positions, geometry.data.normals, geometry.data.texcoords, geometry.data.indices);
      } else {
        tanbit = calculateTangentsBitangents(geometry.data.positions, geometry.data.normals, geometry.data.texcoords);
      }
    }
    let baryCoords = getBarycentricCoordinates(geometry.data.positions.length);
    if(geometry.data.joints != undefined){
      let subMeshes = createSubMeshes(gl, geometry.data.positions, geometry.data.normals, geometry.data.texcoords, baryCoords, geometry.data.material, tanbit == null ? null : tanbit.tangents, tanbit == null ? null : tanbit.bitangents, geometry.data.indices, geometry.data.joints, geometry.data.weights, 50);
      meshes.push(...subMeshes);
    }
    else {
      meshes.push(new Mesh(gl, geometry.data.positions, geometry.data.normals, geometry.data.texcoords, baryCoords, geometry.data.material, tanbit == null ? null : tanbit.tangents, tanbit == null ? null : tanbit.bitangents, geometry.data.indices, geometry.data.joints, geometry.data.weights));
    }
  }
  let renderable = new RenderableObject(meshes, name);
  return renderable;
}

//Calculate tangents, bitangents (for tangent-space operations such as normal mapping & parallax), barycentric coordinates (for wireframe), and pad arrays if necessary
function prepareObjectData(gl, data) {
  meshes = [];
  for (const geometry of data.geometries) {
    let tanbit = null;
    if (geometry.data.texcoords) {
      if (geometry.data.indices){
        tanbit = calculateTangentsBitangentsIndexed(geometry.data.positions, geometry.data.normals, geometry.data.texcoords, geometry.data.indices);
      } else {
        tanbit = calculateTangentsBitangents(geometry.data.positions, geometry.data.normals, geometry.data.texcoords);
      }
    }    let baryCoords = getBarycentricCoordinates(geometry.data.positions.length);
    meshes.push(new Mesh(gl, geometry.data.positions, geometry.data.normals, geometry.data.texcoords, baryCoords, geometry.data.material, tanbit.tangents, tanbit.bitangents, geometry.data.indices));
  }
  return { meshes };
}

//create a renderable object from data
function createRenderable(gl, name, data) {
  newData = prepareObjectData(gl, data);
  return new RenderableObject(newData.meshes, name);
}

//update the data associated with a renderable object
// function updateRenderable(gl, renderable, data, texture = null, normal = null, aoMap = null, heightMap = null, metallic = null, roughness = null, opacity = null, textureScale = 1.0) {
//   newData = prepareObjectData(gl, data);
//   let material = new Material(texture, normal, false, aoMap, heightMap, metallic, roughness, false, opacity, 1.0);
//   renderable.setData(newData.meshes, material);
// }

async function loadTexture(url) {
  //Web environments suck I want to use C++/Vulkan
  const uniqueUrl = url + "?_ts=" + new Date().getTime();
  const response = await fetch(uniqueUrl);
  const blob = await response.blob();
  return createImageBitmap(blob);
}

// Helper function for conversion
async function imageBitmapToBase64(imageBitmap){
  const canvas = document.createElement('canvas');
  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(imageBitmap, 0, 0);

  const base64Image = canvas.toDataURL();

  return base64Image;
}

async function base64ToImageBitmap(base64String) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      createImageBitmap(img).then(imageBitmap => {
        resolve(imageBitmap);
      });
    };
    img.onerror = (e) => {
      reject(e);
    };
    img.src = base64String;
  });
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

//find the corners of a camera frustrum
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

// Find the center of a camera frustrum
function getFrustumCenter(cameraPosition, cameraForward, zNear, zFar) {
  let nearCenter = vec3.scaleAndAdd(vec3.create(), cameraPosition, cameraForward, zNear);
  let farCenter = vec3.scaleAndAdd(vec3.create(), cameraPosition, cameraForward, zFar);

  let frustumCenter = vec3.lerp(vec3.create(), nearCenter, farCenter, 0.5);
  return frustumCenter;
}

// Computes an axis-aligned bounding box for a set of points
function computeAABB(points) {
  let min = vec3.fromValues(Infinity, Infinity, Infinity);
  let max = vec3.fromValues(-Infinity, -Infinity, -Infinity);

  for (let point of points) {
    vec3.min(min, min, point);
    vec3.max(max, max, point);
  }

  return [min, max];
}

// Get a forward vector from a position and target
function calculateForwardVector(cameraPosition, targetPosition) {
  let forwardVector = vec3.subtract(vec3.create(), targetPosition, cameraPosition);
  vec3.normalize(forwardVector, forwardVector);
  return forwardVector;
}

function forwardVectorFromMatrix(matrix){
  let forward = vec3.create();
  forward[0] = -matrix[8];
  forward[1] = -matrix[9];
  forward[2] = -matrix[10];

  vec3.normalize(forward, forward);

  return forward;
}

function rightVectorFromMatrix(matrix) {
  let right = vec3.create();
  right[0] = matrix[0];
  right[1] = matrix[1];
  right[2] = matrix[2];

  vec3.normalize(right, right);

  return right;
}

function getPitchYawFromQuaternion(q) {
    let matrix = mat4.create();
    mat4.fromQuat(matrix, q);

    const pitch = Math.asin(-matrix[8]); // -m21
    let yaw;

    // Check for gimbal lock
    if (Math.abs(matrix[8]) < 0.99999) {
        yaw = Math.atan2(matrix[4], matrix[0]); // m10 / m00
    } else {
        yaw = 0;
    }

    return {pitch , yaw};
}

function quaternionFromDirection(direction, up = vec3.fromValues(0, 1, 0)) {
  let forward = vec3.normalize(vec3.create(), direction);
  let dot = vec3.dot(vec3.fromValues(0, 0, -1), forward);

  if (Math.abs(dot + 1) < 0.000001) {
      // Directly opposite
      return quat.setAxisAngle(quat.create(), up, Math.PI);
  } else if (Math.abs(dot - 1) < 0.000001) {
      return quat.create();
  }

  let rotationAxis = vec3.cross(vec3.create(), vec3.fromValues(0, 0, -1), forward);
  vec3.normalize(rotationAxis, rotationAxis);
  let angle = Math.acos(dot);
  return quat.setAxisAngle(quat.create(), rotationAxis, angle);
}

// Combination of linear and logarithmic shadow cascade falloff
function calculateCascadeSplits(numCascades, zNear, zFar, maxDist, lambda = 0.9) {
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

// Create view matrix for a directional light, where direction matters more than position
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
  // center[0] = Math.floor(center[0] / cascadeSize) * cascadeSize;
  // center[1] = Math.floor(center[1] / cascadeSize) * cascadeSize;
  // center[2] = Math.floor(center[2] / cascadeSize) * cascadeSize;
  return center;
}

// Create an orthographic projection for a square cascade of given size
function getOrthographicProjectionMatrix(cascadeSize, nearPlane, farPlane) {
  return mat4.ortho(mat4.create(), -cascadeSize, cascadeSize, -cascadeSize, cascadeSize, nearPlane, farPlane);
}

function getLightViewMatrix(lightDirection, lightUp, cascadeCenter) {
  let lookAtPoint = vec3.add(vec3.create(), cascadeCenter, lightDirection);
  return mat4.lookAt(mat4.create(), cascadeCenter, lookAtPoint, lightUp);
}

// Create directional shadow cascade info
function setupCascades(numCascades, light, camera, cascadeSplits) {
  let cascades = [];

  for (let i = 0; i < numCascades; i++) {
    let size = cascadeSplits[i];
    let camPos = camera.transform.getGlobalPosition();
    let center = vec3.fromValues(camPos[0], 0, camPos[2]); //getCascadeCenter(camera.position, calculateForwardVector(camera.position, camera.lookAt), size);
    let viewMatrix = createDirectionalLightViewMatrix(light.getLightDir(), center);
    let orthoMatrix = getOrthographicProjectionMatrix(size, -20, 100);

    cascades.push({ size, center, orthoMatrix, viewMatrix });
  }

  return cascades;
}

// Create a cubemap texture from web resource
async function createCubemap(gl) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
  
  const faceInfo = [
    { target: gl.TEXTURE_CUBE_MAP_POSITIVE_X, img: skyboxPosXImage.data },
    { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_X, img: skyboxNegXImage.data },
    { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Y, img: skyboxPosYImage.data },
    { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, img: skyboxNegYImage.data },
    { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Z, img: skyboxPosZImage.data },
    { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, img: skyboxNegZImage.data },
    // { target: gl.TEXTURE_CUBE_MAP_POSITIVE_X, url: "textures/cubemap/Daylight Box_Right.bmp" },
    // { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_X, url: "textures/cubemap/Daylight Box_Left.bmp" },
    // { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Y, url: "textures/cubemap/Daylight Box_Top.bmp" },
    // { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, url: "textures/cubemap/Daylight Box_Bottom.bmp" },
    // { target: gl.TEXTURE_CUBE_MAP_POSITIVE_Z, url: "textures/cubemap/Daylight Box_Front.bmp" },
    // { target: gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, url: "textures/cubemap/Daylight Box_Back.bmp" },
  ];
  for (let face of faceInfo){ 
    const { target, img } = face;
    const image = await base64ToImageBitmap(img);
    gl.texImage2D(target, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, image);

    gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
    gl.texImage2D(target, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  };
  gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);

  gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
  return texture;
}

// Helper method for data view
function dataViewSetMatrix(dataView, matrix, baseOffset) {
  for (let i = 0; i < 16; i++) {
    let offset = baseOffset + i * 4;
    dataView.setFloat32(offset, matrix[i], true);
  }
}

// Helper method for data view
function dataViewSetMatrixArray(dataView, matrices, baseOffset) {
  for (let i = 0; i < matrices.length; i++) {
    currentMatrixOffset = i * 64;
    let matrix = matrices[i];
    for (let j = 0; j < 16; j++) {
      let offset = baseOffset + currentMatrixOffset + j * 4;
      dataView.setFloat32(offset, matrix[j], true);
    }
  }
}

// Helper method for data view
function dataViewSetFloatArray(dataView, floatArray, baseOffset) {
  for (let i = 0; i < floatArray.length; i++) {
    let offset = baseOffset + i * 16; //STD140 specifies 16 bytes of padding for each float in a float array...
    dataView.setFloat32(offset, floatArray[i], true);
  }
}

// Helper method for data view
function dataViewSetVec4Array(dataView, floatArray, baseOffset) {
  for (let i = 0; i < floatArray.length; i++) {
    let offset = baseOffset + i * 4;
    dataView.setFloat32(offset, floatArray[i], true);
  }
}

function dataViewSetVec4(dataView, floatArray, baseOffset) {
  dataViewSetVec4Array(dataView, floatArray, baseOffset);
}

// Calculate u, v texcoord of a given position on a sphere
function calculateUV(a) {
  let theta = Math.atan2(a[1], a[0]);
  const phi = Math.acos(a[2] / Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]));
  if (theta < 0) {
    theta += 2 * Math.PI;
  }
  const u = theta / (2 * Math.PI);
  const v = phi / Math.PI;
  return [u, v];
}

// Newell method
// Sum of cross-products of edge vertices
function calculateFaceNormal(vertices) {
  let normal = vec3.create();

  for (let i = 0; i < 3; i++) {
    const currentVertex = vertices[i];
    const nextVertex = vertices[(i + 1) % 3];

    vec3.add(normal, normal, vec3.cross(vec3.create(), currentVertex, nextVertex));
  }

  vec3.normalize(normal, normal);
  return normal;
}

function triangle(a, b, c, pointsArray, normalsArray, texCoordsArray, newellMethod) {
  pointsArray.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);

  normal = calculateFaceNormal([a, b, c]);

  if (newellMethod) {
    normalsArray.push(normal[0], normal[1], normal[2]);
    normalsArray.push(normal[0], normal[1], normal[2]);
    normalsArray.push(normal[0], normal[1], normal[2]);
  } else {
    normalsArray.push(a[0], a[1], a[2]);
    normalsArray.push(b[0], b[1], b[2]);
    normalsArray.push(c[0], c[1], c[2]);
  }
  let aUV = calculateUV(a);
  let bUV = calculateUV(b);
  let cUV = calculateUV(c);

  texCoordsArray.push(aUV[0], aUV[1], bUV[0], bUV[1], cUV[0], cUV[1]);
}

function dot(u, v) {
  if (u.length != v.length) {
    throw "dot(): vectors are not the same dimension";
  }

  var sum = 0.0;
  for (var i = 0; i < u.length; ++i) {
    sum += u[i] * v[i];
  }

  return sum;
}

function length(u) {
  return Math.sqrt(dot(u, u));
}

function normalize(u, excludeLastComponent) {
  if (excludeLastComponent) {
    var last = u.pop();
  }

  var len = length(u);

  if (!isFinite(len)) {
    throw "normalize: vector " + u + " has zero length";
  }

  for (var i = 0; i < u.length; ++i) {
    u[i] /= len;
  }

  if (excludeLastComponent) {
    u.push(last);
  }

  return u;
}

function mix(u, v, s) {
  if (typeof s !== "number") {
    throw "mix: the last paramter " + s + " must be a number";
  }

  if (u.length != v.length) {
    throw "vector dimension mismatch";
  }

  var result = [];
  for (var i = 0; i < u.length; ++i) {
    result.push((1.0 - s) * u[i] + s * v[i]);
  }

  return result;
}

function divideTriangle(a, b, c, count, pointsArray, normalsArray, texCoordsArray, newellMethod) {
  if (count > 0) {
    var ab = mix(a, b, 0.5);
    var ac = mix(a, c, 0.5);
    var bc = mix(b, c, 0.5);

    ab = normalize(ab, true);
    ac = normalize(ac, true);
    bc = normalize(bc, true);

    divideTriangle(a, ab, ac, count - 1, pointsArray, normalsArray, texCoordsArray, newellMethod);
    divideTriangle(ab, b, bc, count - 1, pointsArray, normalsArray, texCoordsArray, newellMethod);
    divideTriangle(ac, bc, c, count - 1, pointsArray, normalsArray, texCoordsArray, newellMethod);
    divideTriangle(ab, bc, ac, count - 1, pointsArray, normalsArray, texCoordsArray, newellMethod);
  } else {
    triangle(a, b, c, pointsArray, normalsArray, texCoordsArray, newellMethod);
  }
}

function tetrahedron(a, b, c, d, n, newellMethod) {
  let pointsArray = [];
  let normalsArray = [];
  let texCoordArray = [];
  divideTriangle(a, b, c, n, pointsArray, normalsArray, texCoordArray, newellMethod);
  divideTriangle(d, c, b, n, pointsArray, normalsArray, texCoordArray, newellMethod);
  divideTriangle(a, d, b, n, pointsArray, normalsArray, texCoordArray, newellMethod);
  divideTriangle(a, c, d, n, pointsArray, normalsArray, texCoordArray, newellMethod);

  return { pointsArray, normalsArray, texCoordArray };
}

// Generate subdivision surface from cube vertices
function cube(a, b, c, d, e, f, g, h, n, newellMethod) {
  let pointsArray = [];
  let normalsArray = [];
  let texCoordArray = [];

  divideTriangle(a, b, c, n, pointsArray, normalsArray, texCoordArray, newellMethod);
  divideTriangle(a, c, d, n, pointsArray, normalsArray, texCoordArray, newellMethod);

  divideTriangle(e, f, b, n, pointsArray, normalsArray, texCoordArray, newellMethod);
  divideTriangle(a, e, b, n, pointsArray, normalsArray, texCoordArray, newellMethod);

  divideTriangle(h, g, f, n, pointsArray, normalsArray, texCoordArray, newellMethod);
  divideTriangle(e, h, f, n, pointsArray, normalsArray, texCoordArray, newellMethod);

  divideTriangle(d, c, g, n, pointsArray, normalsArray, texCoordArray, newellMethod);
  divideTriangle(h, d, g, n, pointsArray, normalsArray, texCoordArray, newellMethod);

  divideTriangle(f, g, b, n, pointsArray, normalsArray, texCoordArray, newellMethod);
  divideTriangle(b, g, c, n, pointsArray, normalsArray, texCoordArray, newellMethod);

  divideTriangle(d, h, e, n, pointsArray, normalsArray, texCoordArray, newellMethod);
  divideTriangle(a, d, e, n, pointsArray, normalsArray, texCoordArray, newellMethod);

  return { pointsArray, normalsArray, texCoordArray };
}

// Linear interpolation on a transform object
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

function positionFromMatrix(matrix) {
  let position = vec3.fromValues(matrix[12], matrix[13], matrix[14]);
  return position;
}

function lerpVec3(posA, posB, t) {
  let newPos = vec3.create();
  vec3.lerp(newPos, posA, posB, t);
  return newPos;
}

function lerpRotation(quatA, quatB, t) {
  let newRot = quat.create();
  quat.slerp(newRot, quatA, quatB, t);
  return newRot;
}
// Create line arrays from array of positions
function linesFromPositions(positions) {
  let lines = [];
  for (let i = 0; i < positions.length - 1; i++) {
    lines.push(positions[i][0], positions[i][1], positions[i][2], positions[i + 1][0], positions[i + 1][1], positions[i + 1][2]);
  }
  return lines;
}

// Perform chaikin subdivision
function chaikin(vertices, iterations) {
  if (iterations === 0) {
    return vertices;
  }

  var newVertices = [];

  for (var i = 0; i < vertices.length - 1; i++) {
    var v0 = vertices[i];
    var v1 = vertices[i + 1];

    var p0 = mix(v0, v1, 0.25);
    var p1 = mix(v0, v1, 0.75);

    newVertices.push(p0, p1);
  }
  return chaikin(newVertices, iterations - 1);
}

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

//Create a color weighted against being white
function generateStrongColor() {
  const strongComponentIndex = Math.floor(Math.random() * 3);
  const strongComponentIndex2 = Math.floor(Math.random() * 2);

  let r = 0,
    g = 0,
    b = 0;
  switch (strongComponentIndex) {
    case 0:
      switch (strongComponentIndex2) {
        case 0:
          r = 200 + Math.floor(Math.random() * 56);
          g = Math.floor(Math.random() * 100);
          b = Math.floor(Math.random() * 10);
          break;
        case 1:
        case 0:
          r = 200 + Math.floor(Math.random() * 56);
          g = Math.floor(Math.random() * 10);
          b = Math.floor(Math.random() * 100);
          break;
      }
      break;
    case 1:
      switch (strongComponentIndex2) {
        case 0:
          r = Math.floor(Math.random() * 100);
          g = 200 + Math.floor(Math.random() * 56);
          b = Math.floor(Math.random() * 10);
          break;
        case 1:
        case 0:
          r = Math.floor(Math.random() * 10);
          g = 200 + Math.floor(Math.random() * 56);
          b = Math.floor(Math.random() * 100);
          break;
      }
      break;
    case 2:
      switch (strongComponentIndex2) {
        case 0:
          r = Math.floor(Math.random() * 100);
          g = Math.floor(Math.random() * 10);
          b = 200 + Math.floor(Math.random() * 56);
          break;
        case 1:
        case 0:
          r = Math.floor(Math.random() * 10);
          g = Math.floor(Math.random() * 100);
          b = 200 + Math.floor(Math.random() * 56);
          break;
      }
      break;
  }

  return { r, g, b };
}

// Missing from gl-matrix
// https://github.com/toji/gl-matrix/issues/329
function getEuler(out, quat) {
  let x = quat[0],
    y = quat[1],
    z = quat[2],
    w = quat[3],
    x2 = x * x,
    y2 = y * y,
    z2 = z * z,
    w2 = w * w;
  let unit = x2 + y2 + z2 + w2;
  let test = x * w - y * z;
  if (test > 0.499995 * unit) { //TODO: Use glmatrix.EPSILON
    // singularity at the north pole
    out[0] = Math.PI / 2;
    out[1] = 2 * Math.atan2(y, x);
    out[2] = 0;
  } else if (test < -0.499995 * unit) { //TODO: Use glmatrix.EPSILON
    // singularity at the south pole
    out[0] = -Math.PI / 2;
    out[1] = 2 * Math.atan2(y, x);
    out[2] = 0;
  } else {
    out[0] = Math.asin(2 * (x * z - w * y));
    out[1] = Math.atan2(2 * (x * w + y * z), 1 - 2 * (z2 + w2));
    out[2] = Math.atan2(2 * (x * y + z * w), 1 - 2 * (y2 + z2));
  }
  // TODO: Return them as degrees and not as radians
  return out;
}

function alignQuaternionWithUp(quaternion, defaultDirection, globalUp) {
  // Convert quaternion to a rotation matrix
  const rotationMatrix = mat3.create();
  mat3.fromQuat(rotationMatrix, quaternion);

  const forward = vec3.transformMat3(vec3.create(), defaultDirection, rotationMatrix);

  const right = vec3.cross(vec3.create(), globalUp, forward);
  vec3.normalize(right, right);

  // Orthogonalize up vector
  const orthogonalUp = vec3.cross(vec3.create(), forward, right);
  vec3.normalize(orthogonalUp, orthogonalUp);

  // Create a new rotation matrix from the orthogonal basis vectors
  const adjustedMatrix = mat3.fromValues(
    right[0], right[1], right[2],
    orthogonalUp[0], orthogonalUp[1], orthogonalUp[2],
    forward[0], forward[1], forward[2]
  );

  const adjustedQuat = quat.create();
  quat.fromMat3(adjustedQuat, adjustedMatrix);

  return adjustedQuat;
}

function quaternionLookAt(position, target, defaultDirection, globalUp = [0, 1, 0]) {
  // Find rotation quaternion that rotates (position, defaultDirection) to face target
  const directionVector = vec3.create();
  vec3.subtract(directionVector, position, target);
  vec3.normalize(directionVector, directionVector);

  const rotationAxis = vec3.create();
  vec3.cross(rotationAxis, defaultDirection, directionVector);
  vec3.normalize(rotationAxis, rotationAxis);

  const angle = Math.acos(vec3.dot(defaultDirection, directionVector));

  const initialRotation = quat.create();
  quat.setAxisAngle(initialRotation, rotationAxis, angle);

  // Find "up" vector after rotation
  const rotatedUp = vec3.create();
  vec3.transformQuat(rotatedUp, globalUp, initialRotation);

  // Find rotation quaternion to align the rotated "up" with the global "up"
  const secondaryRotationAxis = directionVector;
  const rotatedUpCrossGlobalUp = vec3.create();
  vec3.cross(rotatedUpCrossGlobalUp, rotatedUp, globalUp);
  const secondaryRotationAngle = Math.asin(vec3.length(rotatedUpCrossGlobalUp) / (vec3.length(rotatedUp) * vec3.length(globalUp)));

  const secondaryRotation = quat.create();
  if(vec3.dot(rotatedUp, globalUp) < 0){
      quat.setAxisAngle(secondaryRotation, secondaryRotationAxis, Math.PI - secondaryRotationAngle);
  } else {
      quat.setAxisAngle(secondaryRotation, secondaryRotationAxis, secondaryRotationAngle);
  }

  // Combine the initial and secondary rotations
  const finalRotation = quat.create();
  quat.multiply(finalRotation, secondaryRotation, initialRotation);

  return alignQuaternionWithUp(finalRotation, defaultDirection, globalUp);
}