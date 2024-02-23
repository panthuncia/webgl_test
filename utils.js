//normal matrix as inverse-transpose of model-view matrix
function calculateNormalMatrix(modelViewMatrix) {
  var normalMatrix = mat3.create();
  mat3.fromMat4(normalMatrix, modelViewMatrix);

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
    if (geometry && geometry.data.positions.length) {
      geometry = undefined;
    }
  }

  function setGeometry() {
    if (!geometry) {
      const positions = [];
      const texcoords = [];
      const normals = [];
      webglVertexData = [positions, texcoords, normals];
      geometry = {
        object,
        groups,
        material,
        data: {
          positions,
          texcoords,
          normals,
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

//calculates the tangents and bitangents for a list of positions on a mesh
//used for tangent-space operations such as normal mapping and parallax
function calculateTangentsBitangents(positions, normals, uvs) {
  let tangents = [];
  let bitangents = [];
  let j = 0;
  for (let i = 0; i < positions.length; i += 9) {
    // vertices
    let v0 = { x: positions[i], y: positions[i + 1], z: positions[i + 2] };
    let v1 = { x: positions[i + 3], y: positions[i + 4], z: positions[i + 5] };
    let v2 = { x: positions[i + 6], y: positions[i + 7], z: positions[i + 8] };

    //uvs
    let uv0 = { u: uvs[j], v: uvs[j + 1] };
    let uv1 = { u: uvs[j + 2], v: uvs[j + 3] };
    let uv2 = { u: uvs[j + 4], v: uvs[j + 5] };

    //deltas
    let deltaPos1 = { x: v1.x - v0.x, y: v1.y - v0.y, z: v1.z - v0.z };
    let deltaPos2 = { x: v2.x - v0.x, y: v2.y - v0.y, z: v2.z - v0.z };
    let deltaUV1 = { u: uv1.u - uv0.u, v: uv1.v - uv0.v };
    let deltaUV2 = { u: uv2.u - uv0.u, v: uv2.v - uv0.v };

    //tangent
    let r = 1.0 / (deltaUV1.u * deltaUV2.v - deltaUV1.v * deltaUV2.u);
    let tangent = {
      x: (deltaPos1.x * deltaUV2.v - deltaPos2.x * deltaUV1.v) * r,
      y: (deltaPos1.y * deltaUV2.v - deltaPos2.y * deltaUV1.v) * r,
      z: (deltaPos1.z * deltaUV2.v - deltaPos2.z * deltaUV1.v) * r,
    };
    //bitangent
    let bitangent = {
      x: (deltaPos2.x * deltaUV1.u - deltaPos1.x * deltaUV2.u) * r,
      y: (deltaPos2.y * deltaUV1.u - deltaPos1.y * deltaUV2.u) * r,
      z: (deltaPos2.z * deltaUV1.u - deltaPos1.z * deltaUV2.u) * r,
    };

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

//create an array of barycentric coordinates
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

//Calculate tangents, bitangents (for tangent-space operations such as normal mapping & parallax), barycentric coordinates (for wireframe), and pad arrays if necessary
function prepareObjectData(gl, data){
  meshes = [];
  for (const geometry of data.geometries) {
    let tanbit = calculateTangentsBitangents(geometry.data.positions, geometry.data.normals, geometry.data.texcoords);
    let baryCoords = getBarycentricCoordinates(geometry.data.positions.length);
    meshes.push(new Mesh(gl, geometry.data.positions, geometry.data.normals, geometry.data.texcoords, baryCoords, tanbit.tangents, tanbit.bitangents, geometry.data.indices));
  }
  return {meshes}
}

//create a renderable object from data
function createRenderable(gl, name, data, material) {
  newData = prepareObjectData(gl, data);
  return new RenderableObject(newData.meshes, material, name);
}

//update the data associated with a renderable object
function updateRenderable(gl, renderable, data, texture = null, normal = null, aoMap = null, heightMap = null, metallic = null, roughness = null, opacity = null, textureScale = 1.0) {
  newData = prepareObjectData(gl, data);
  let material = new Material(texture, normal, false, aoMap, heightMap, metallic, roughness, false, opacity, 1.0);
  renderable.setData(newData.meshes, material);
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
    let orthoMatrix = getOrthographicProjectionMatrix(size, -200, 200);

    cascades.push({ size, center, orthoMatrix, viewMatrix });
  }

  return cascades;
}

// Create a cubemap texture from web resource
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
    currentMatrixOffset = i*64;
    let matrix = matrices[i]
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
  const phi = Math.acos(a[2]/Math.sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2]))
  if (theta<0){
    theta +=2*Math.PI;
  }
  const u = theta/ (2*Math.PI);
  const v = phi/Math.PI;
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

  if (newellMethod){
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

  return {pointsArray, normalsArray, texCoordArray};
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

  return {pointsArray, normalsArray, texCoordArray};
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

function lerpVec3(posA, posB, t){
  let newPos = vec3.create();
  vec3.lerp(newPos, posA, posB, t);
  return newPos;
}

function lerpRotation(quatA, quatB, t){
  let newRot = quat.create();
  quat.slerp(newRot, quatA, quatB, t);
  return newRot;
}
// Create line arrays from array of positions
function linesFromPositions(positions){
  let lines = [];
  for(let i=0; i<positions.length-1; i++){
    lines.push(positions[i][0], positions[i][1], positions[i][2], positions[i+1][0], positions[i+1][1], positions[i+1][2]);
  }
  return lines;
}

// Perform chaikin subdivision
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

function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

//Create a color weighted against being white
function generateStrongColor() {
  const strongComponentIndex = Math.floor(Math.random() * 3);
  const strongComponentIndex2 = Math.floor(Math.random() * 2);


  let r = 0, g = 0, b = 0;
  switch (strongComponentIndex) {
    case 0:
      switch( strongComponentIndex2){
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
      switch( strongComponentIndex2){
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
      switch( strongComponentIndex2){
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

  return {r, g, b};
}

function extractDataFromBuffer(binaryData, accessorData) {
  const { accessor, bufferView } = accessorData;
  const numComponents = numComponentsForType(accessor.type);

  // Calculate byte stride; use the provided byteStride from bufferView if present, otherwise calculate it
  const byteStride = bufferView.byteStride ? bufferView.byteStride : numComponents * bytesPerComponent(accessor.componentType);

  let effectiveByteOffset = bufferView.byteOffset;
  if (effectiveByteOffset == undefined){
    effectiveByteOffset = 0;
  }
  if (accessor.byteOffset != undefined){ 
   effectiveByteOffset += accessor.byteOffset;
  }

  let typedArray;
  if (byteStride === numComponents * bytesPerComponent(accessor.componentType)) {
    // Non-interleaved data, we can proceed as before
    typedArray = createTypedArray(accessor.componentType, binaryData, effectiveByteOffset, accessor.count * numComponents);
  } else {
    // Interleaved data, need to manually assemble the typed array
    const elementSize = bytesPerComponent(accessor.componentType) * numComponents;
    let data = new ArrayBuffer(accessor.count * elementSize);
    let view = new DataView(data);

    for (let i = 0, byteOffset = accessor.byteOffset; i < accessor.count; i++, byteOffset += byteStride) {
      for (let componentIndex = 0; componentIndex < numComponents; componentIndex++) {
        const componentByteOffset = byteOffset + bytesPerComponent(accessor.componentType) * componentIndex;
        const value = readComponent(binaryData, accessor.componentType, effectiveByteOffset + componentByteOffset);
        writeComponent(view, accessor.componentType, i * numComponents + componentIndex, value);
      }
    }

    typedArray = createTypedArray(accessor.componentType, data, 0, accessor.count * numComponents);
  }
  return typedArray;
}

function bytesPerComponent(componentType) {
  switch (componentType) {
    case 5120: return 1; // BYTE
    case 5121: return 1; // UNSIGNED_BYTE
    case 5122: return 2; // SHORT
    case 5123: return 2; // UNSIGNED_SHORT
    case 5125: return 4; // UNSIGNED_INT
    case 5126: return 4; // FLOAT
    default: throw new Error("Unsupported component type");
  }
}

function createTypedArray(componentType, buffer, byteOffset, length) {
  switch (componentType) {
    case 5120: return new Int8Array(buffer, byteOffset, length);
    case 5121: return new Uint8Array(buffer, byteOffset, length);
    case 5122: return new Int16Array(buffer, byteOffset, length);
    case 5123: return new Uint16Array(buffer, byteOffset, length);
    case 5125: return new Uint32Array(buffer, byteOffset, length);
    case 5126: return new Float32Array(buffer, byteOffset, length);
    default: throw new Error("Unsupported component type");
  }
}

function readComponent(buffer, componentType, byteOffset) {
  const dataView = new DataView(buffer);
  switch (componentType) {
    case 5120: return dataView.getInt8(byteOffset);
    case 5121: return dataView.getUint8(byteOffset);
    case 5122: return dataView.getInt16(byteOffset, true);
    case 5123: return dataView.getUint16(byteOffset, true);
    case 5125: return dataView.getUint32(byteOffset, true);
    case 5126: return dataView.getFloat32(byteOffset, true);
    default: throw new Error("Unsupported component type");
  }
}

function writeComponent(dataView, componentType, index, value) {
  const byteOffset = index * bytesPerComponent(componentType);
  switch (componentType) {
    case 5120: dataView.setInt8(byteOffset, value); break;
    case 5121: dataView.setUint8(byteOffset, value); break;
    case 5122: dataView.setInt16(byteOffset, value, true); break;
    case 5123: dataView.setUint16(byteOffset, value, true); break;
    case 5125: dataView.setUint32(byteOffset, value, true); break;
    case 5126: dataView.setFloat32(byteOffset, value, true); break;
    default: throw new Error("Unsupported component type");
  }
}

function numComponentsForType(type) {
  switch (type) {
    case "SCALAR": return 1;
    case "VEC2": return 2;
    case "VEC3": return 3;
    case "VEC4": return 4;
    case "MAT2": return 4;
    case "MAT3": return 9;
    case "MAT4": return 16;
    default: throw new Error("Unsupported type");
  }
}

function getAccessorData(gltfData, accessorIndex) {
  const accessor = gltfData.accessors[accessorIndex];
  const bufferView = gltfData.bufferViews[accessor.bufferView];
  return { accessor, bufferView };
}

function parseGLTFNodeHierarchy(renderer, gltfData, meshesAndMaterials) {
  const nodes = [];
  // create SceneNode instances for each GLTF node
  for(let gltfNode of gltfData.nodes) {
    let node = null;
    if (gltfNode.mesh != undefined){
      let data = meshesAndMaterials[gltfNode.mesh];
      node = renderer.createRenderableObject(data.mesh, data.material, gltfNode.name);
      if(gltfNode.skin != undefined){
        console.log("found skinned mesh");
        node.skinInstance = gltfNode.skin; //hack for setting skins later
      }
    } else {
      node = renderer.createNode(gltfData.name);
      node.originalIndex = nodes.length;
    }
    if (gltfNode.matrix != undefined){
      const position = vec3.create();
      const rotation = quat.create();
      const scale = vec3.create();
      matrix = mat4.fromValues(...gltfNode.matrix);

      mat4.getTranslation(position, matrix);
      mat4.getScaling(scale, matrix);
      mat4.getRotation(rotation, matrix);

      quat.normalize(rotation, rotation);
      
      node.transform.setLocalPosition(position);
      node.transform.setLocalScale(scale);
      node.transform.setLocalRotationFromQuaternion(rotation);
    } else{
      if (gltfNode.translation != undefined){
        node.transform.setLocalPosition(gltfNode.translation);
      }
      if (gltfNode.scale != undefined){
        node.transform.setLocalScale(gltfNode.scale);
      }
      if (gltfNode.rotation != undefined){
        node.transform.setLocalRotationFromQuaternion(gltfNode.rotation);
      }
    }
    nodes.push(node);
  };

  // establish parent-child relationships
  gltfData.nodes.forEach((gltfNode, index) => {
    const node = nodes[index];
    if (gltfNode.children) {
      gltfNode.children.forEach((childIndex) => {
        const childNode = nodes[childIndex];
        node.addChild(childNode);
      });
    }
  });

  //find and return nodes with no parents
  const rootNodes = nodes.filter(node => node.parent.localID == -1);
  return {nodes, rootNodes};
}

function createDefaultTexture(gl){
  let texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  let whitePixel = new Uint8Array([255, 255, 255, 255]);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, whitePixel);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  return texture;
}

// Load external images
async function getGLTFImages(gltfData, dir){
  let images = [];
  for(gltfImage of gltfData.images) {
    const image = await loadTexture(dir+"/"+gltfImage.uri);
    images.push(image);
  }
  return images;
}

//Load images stored in binary format
async function getGLTFImagesFromBinary(gltfData, binaryData){
  let images = [];
  for (const gltfImage of gltfData.images) {
    let imageBuffer;

    if (gltfImage.uri) {
        if (gltfImage.uri.startsWith('data:')) {
            imageBuffer = decodeDataUri(gltfImage.uri);
            const image = await createImageBitmap(new Blob([imageBuffer]));
            images.push(image);
        } else {
            console.error("External URIs unsupported in glb files");
        }
    } else if (gltfImage.bufferView !== undefined) {
        const bufferView = gltfData.bufferViews[gltfImage.bufferView];
        const blob = new Blob([new Uint8Array(binaryData, bufferView.byteOffset, bufferView.byteLength)], { type: gltfImage.mimeType });
        const image = await createImageBitmap(blob);
        images.push(image);
    }
  }
  return images;
}

async function parseGLTFMaterials(renderer, gltfData, dir, binaryData = null){
  const gl = renderer.gl;
  let defaultTexture = createDefaultTexture(gl);
  let images = null;
  if (binaryData != null){
    images = await getGLTFImagesFromBinary(gltfData, binaryData);
  }
  else{
    images = await getGLTFImages(gltfData, dir);
  }
  let linearTextures = [];
  let srgbTextures = [];
  let materials = [];

  // Create linear and sRGB texture for each, because glTF doesn't specify usage in the texture definition :/
  // we will just delete the unused one.
  gltfData.textures.forEach((gltfTexture, index) => {
    if (images[gltfTexture.source]){
      const linearTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, linearTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images[gltfTexture.source]);
      linearTextures[index] = linearTexture;
      const srgbTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, srgbTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, images[gltfTexture.source]);
      srgbTextures[index] = srgbTexture;
    } else {
      console.warn("Missing texture!");
    }
  })
  gltfData.materials.forEach((gltfMaterial, index) => {
    let texture = null, normal = null, aoMap = null, heightMap = null, metallicRoughness = null, opacity = null, emissiveTexture = null;

    let metallicFactor = null, roughnessFactor = null, baseColorFactor = null, emissiveFactor = [0, 0, 0, 1];
    if (gltfMaterial.pbrMetallicRoughness) {
      if (gltfMaterial.pbrMetallicRoughness.baseColorTexture) {
        if (srgbTextures[gltfMaterial.pbrMetallicRoughness.baseColorTexture.index]){
          texture = srgbTextures[gltfMaterial.pbrMetallicRoughness.baseColorTexture.index];
          gl.deleteTexture(linearTextures[gltfMaterial.pbrMetallicRoughness.baseColorTexture.index]);
        } else {
          texture = defaultTexture;
        }
      } else {
        texture = defaultTexture;
      }
      if (gltfMaterial.pbrMetallicRoughness.metallicRoughnessTexture) {
        if (linearTextures[gltfMaterial.pbrMetallicRoughness.metallicRoughnessTexture.index]){
          metallicRoughness = linearTextures[gltfMaterial.pbrMetallicRoughness.metallicRoughnessTexture.index];
          gl.deleteTexture(srgbTextures[gltfMaterial.pbrMetallicRoughness.metallicRoughnessTexture.index]);
        } else {
          metallicRoughness = defaultTexture;
        }
      }
      if (gltfMaterial.pbrMetallicRoughness.metallicFactor){
        metallicFactor = gltfMaterial.pbrMetallicRoughness.metallicFactor;
      } else {
        metallicFactor = 1.0;
      }
      if (gltfMaterial.pbrMetallicRoughness.roughnessFactor){
        roughnessFactor = gltfMaterial.pbrMetallicRoughness.roughnessFactor;
      } else {
        roughnessFactor = 1.0;
      }
      if (gltfMaterial.pbrMetallicRoughness.baseColorFactor){
        baseColorFactor = gltfMaterial.pbrMetallicRoughness.baseColorFactor;
      } else {
        baseColorFactor = [1, 1, 1, 1];
      }
    }

    if (gltfMaterial.normalTexture) {
      if (linearTextures[gltfMaterial.normalTexture.index]){
        normal = linearTextures[gltfMaterial.normalTexture.index];
        gl.deleteTexture(srgbTextures[gltfMaterial.normalTexture.index]);
      } else {
        normal = defaultTexture;
      }
    }
    if (gltfMaterial.occlusionTexture) {
      if (linearTextures[gltfMaterial.occlusionTexture.index]) {
        aoMap = linearTextures[gltfMaterial.occlusionTexture.index];
        gl.deleteTexture(srgbTextures[gltfMaterial.occlusionTexture.index]);
      } else {
        aoMap = defaultTexture;
      }
    }
    if (gltfMaterial.emissiveTexture){
      if (srgbTextures[gltfMaterial.emissiveTexture.index]){
        emissiveTexture = srgbTextures[gltfMaterial.emissiveTexture.index];
        gl.deleteTexture(linearTextures[gltfMaterial.emissiveTexture.index]);
        emissiveFactor = [1, 1, 1, 1];
      } else {
        emissiveTexture = defaultTexture;
      }
    }
    if (gltfMaterial.emissiveFactor){
      emissiveFactor = [...gltfMaterial.emissiveFactor, 1];
    }

    let blendMode = BLEND_MODE.BLEND_MODE_BLEND;
    if (gltfMaterial.alphaMode == "OPAQUE" || gltfMaterial.alphaMode == undefined){
      blendMode = BLEND_MODE.BLEND_MODE_OPAQUE;
    } else if (gltfMaterial.alphaMode == "MASK"){
      blendMode = BLEND_MODE.BLEND_MODE_MASK;
    }

    const material = new Material(texture, normal, true, aoMap, heightMap, metallicRoughness, metallicRoughness, true, metallicFactor, roughnessFactor, baseColorFactor, opacity, blendMode, emissiveTexture, emissiveFactor);
    materials.push(material);
  });
  return materials;
}

function parseGLTFSkins(gltfData, nodes, binaryData, animations, renderer) {
  let skins = [];
  if (gltfData.skins == undefined){
    return skins;
  }
  for (let skin of gltfData.skins){
    const inverseBindMatrices = extractDataFromBuffer(binaryData, getAccessorData(gltfData, skin.inverseBindMatrices));
    let joints = [];
    for (let joint of skin.joints){
      joints.push(nodes[joint]);
    }
    let skeleton = new Skeleton(joints, inverseBindMatrices);
    //register animations that reference joints in this skeleton
    for (let joint of skin.joints){
      for (let animation of animations){
        if(nodes[joint].localID in animation.nodesMap && ! (animation.name in skeleton.animationsByName)){
          skeleton.addAnimation(animation);
        }
      }
    }
    skins.push(skeleton);
  }
  return skins;
}

function setSkins(skins, nodes, renderer){
  for (let node of nodes){
    if (node.skinInstance != undefined){
      node.setSkin(skins[node.skinInstance]);
    }
  }
}

function numComponentsForPath(path) {
  switch (path) {
    case "translation":
    case "scale":
      return 3; // X, Y, Z
    case "rotation":
      return 4; // X, Y, Z, W
    default:
      console.warn(`Unsupported path: ${path}`);
  }
}

function parseGLTFAnimationToClips(gltfAnimation, gltfData, binaryData, nodes) {
  const animation = new Animation(gltfAnimation.name);// new AnimationClip();

  for (const channel of gltfAnimation.channels) {
    const sampler = gltfAnimation.samplers[channel.sampler];
    const inputAccessor = getAccessorData(gltfData, sampler.input);
    const outputAccessor = getAccessorData(gltfData, sampler.output);

    const inputs = extractDataFromBuffer(binaryData, inputAccessor); // Time keyframes
    const outputs = extractDataFromBuffer(binaryData, outputAccessor); // Value keyframes

    const path = channel.target.path; // "translation", "rotation", or "scale"
    const node = nodes[channel.target.node].localID;
    if (animation.nodesMap[node] == undefined){
      animation.nodesMap[node] = new AnimationClip();
    }

    for (let i = 0; i < inputs.length; i++) {
      const time = inputs[i];
      const value = outputs.slice(i * numComponentsForPath(path), (i + 1) * numComponentsForPath(path));
      
      switch (path) {
        case "translation":
          animation.nodesMap[node].addPositionKeyframe(time, vec3.fromValues(value[0], value[1], value[2]));
          break;
        case "rotation":
          animation.nodesMap[node].addRotationKeyframe(time, quat.fromValues(value[0], value[1], value[2], value[3]));
          break;
        case "scale":
          animation.nodesMap[node].addScaleKeyframe(time, vec3.fromValues(value[0], value[1], value[2]));
          break;
      }
    }
  }

  return animation;
}

function parseGLTFAnimations(gltfData, binaryData, nodes) {
  const animations = [];
  if (!gltfData.animations) {
    return animations;
  }

  for (const animation of gltfData.animations) {
    let parsedAnimation = parseGLTFAnimationToClips(animation, gltfData, binaryData, nodes);
    animations.push(parsedAnimation);
  }

  return animations;
}

async function loadAndParseGLTF(renderer, dir, filename) {
  let meshesAndMaterials = [];
  try {
    // Fetch the GLTF JSON file
    const url = dir+"/"+filename;
    const gltfResponse = await fetch(url);
    if (!gltfResponse.ok) {
      throw new Error(`HTTP error! status: ${gltfResponse.status}`);
    }
    const gltfData = await gltfResponse.json();

    // Load external BIN files specified in the GLTF
    const binBuffers = await Promise.all(gltfData.buffers.map(async (buffer) => {
      if (buffer.uri) {
        const binUrl = dir+"/"+buffer.uri;
        const binResponse = await fetch(binUrl);
        if (!binResponse.ok) {
          throw new Error(`HTTP error! status: ${binResponse.status}`);
        }
        return binResponse.arrayBuffer();
      }
    }));

    let materials = await parseGLTFMaterials(renderer, gltfData, dir);

    const binaryData = binBuffers[0]; // One .bin file for now
    for (const mesh of gltfData.meshes) {
      let data = {mesh: {geometries:[{data:{
          positions: extractDataFromBuffer(binaryData, getAccessorData(gltfData, mesh.primitives[0].attributes.POSITION)),
          normals: extractDataFromBuffer(binaryData, getAccessorData(gltfData, mesh.primitives[0].attributes.NORMAL)),
          indices: extractDataFromBuffer(binaryData, getAccessorData(gltfData, mesh.primitives[0].indices)),
        }}]},
        material: materials[mesh.primitives[0].material]
      };
      if (mesh.primitives[0].attributes.TEXCOORD_0){
        data.mesh.geometries[0].data.texcoords = extractDataFromBuffer(binaryData, getAccessorData(gltfData, mesh.primitives[0].attributes.TEXCOORD_0));
      }
      if (mesh.primitives[0].attributes.JOINTS_0){
        data.mesh.geometries[0].data.joints = extractDataFromBuffer(binaryData, getAccessorData(gltfData, mesh.primitives[0].attributes.JOINTS_0));
        data.mesh.geometries[0].data.weights = extractDataFromBuffer(binaryData, getAccessorData(gltfData, mesh.primitives[0].attributes.WEIGHTS_0));
      }
      meshesAndMaterials.push(data);
    }
    //console.log(meshes);
    let { nodes, rootNodes} = parseGLTFNodeHierarchy(renderer, gltfData, meshesAndMaterials);
    let animations = parseGLTFAnimations(gltfData, binaryData, nodes);
    let skins = parseGLTFSkins(gltfData, nodes, binaryData, animations);
    for (let skeleton of skins){
      renderer.addSkeleton(skeleton);
    }
    setSkins(skins, nodes);
    console.log(animations);
    return rootNodes;
  } catch (error) {
    console.error(error);
  }
  return [];
}

//https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#binary-gltf-layout
async function loadAndParseGLB(renderer, url) {
  let meshesAndMaterials = [];
  try {
    const glbArrayBuffer = await fetchGLB(url);
    const header = parseGLBHeader(glbArrayBuffer);
    const chunks = parseGLBChunks(glbArrayBuffer);
    
    const jsonChunk = chunks.find(chunk => chunk.chunkType === 0x4E4F534A); // 'JSON' in ASCII
    if (!jsonChunk) {
      throw new Error("JSON chunk not found");
    }

    const binChunk = chunks.find(chunk => chunk.chunkType === 0x4E4942); // 'BIN' in ASCII
    
    const gltfData = decodeJSONChunk(jsonChunk.chunkData);
    console.log("GLTF Data:", gltfData);
    const binaryBuffer = binChunk.chunkData;

    // Get ArrayBuffer as subset of full ArrayBuffer
    // Shouldn't really be necessary, but it makes gltf and glb loading more similar
    const fullArrayBuffer = binaryBuffer.buffer;
    const byteOffset = binaryBuffer.byteOffset;
    const byteLength = binaryBuffer.byteLength;

    const binaryData = new ArrayBuffer(byteLength);
    const subsetUint8Array = new Uint8Array(binaryData);
    subsetUint8Array.set(new Uint8Array(fullArrayBuffer, byteOffset, byteLength));

    let materials = await parseGLTFMaterials(renderer, gltfData, "", binaryData);
    for (const mesh of gltfData.meshes) {
      let data = {mesh: {geometries:[{data:{
          positions: extractDataFromBuffer(binaryData, getAccessorData(gltfData, mesh.primitives[0].attributes.POSITION)),
          normals: extractDataFromBuffer(binaryData, getAccessorData(gltfData, mesh.primitives[0].attributes.NORMAL)),
          indices: extractDataFromBuffer(binaryData, getAccessorData(gltfData, mesh.primitives[0].indices)),
        }}]},
        material: materials[mesh.primitives[0].material]
      };
      if (mesh.primitives[0].attributes.TEXCOORD_0){
        data.mesh.geometries[0].data.texcoords = extractDataFromBuffer(binaryData, getAccessorData(gltfData, mesh.primitives[0].attributes.TEXCOORD_0));
      }
      if (mesh.primitives[0].attributes.JOINTS_0){
        data.mesh.geometries[0].data.joints = extractDataFromBuffer(binaryData, getAccessorData(gltfData, mesh.primitives[0].attributes.JOINTS_0));
        data.mesh.geometries[0].data.weights = extractDataFromBuffer(binaryData, getAccessorData(gltfData, mesh.primitives[0].attributes.WEIGHTS_0));
      }
      meshesAndMaterials.push(data);
    }
    //console.log(meshes);
    let { nodes, rootNodes} = parseGLTFNodeHierarchy(renderer, gltfData, meshesAndMaterials);
    let animations = parseGLTFAnimations(gltfData, binaryData, nodes);
    let skins = parseGLTFSkins(gltfData, nodes, binaryData, animations);
    for (let skeleton of skins){
      renderer.addSkeleton(skeleton);
    }
    setSkins(skins, nodes);
    console.log(animations);
    return rootNodes;
  } catch (error) {
    console.error(error);
  }
  return [];
}

async function fetchGLB(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.arrayBuffer();
}

function parseGLBHeader(glbArrayBuffer) {
  const dataView = new DataView(glbArrayBuffer);
  const magic = dataView.getUint32(0, true);
  const version = dataView.getUint32(4, true);
  const length = dataView.getUint32(8, true);

  if (magic !== 0x46546C67) {
    throw new Error("Invalid GLB format");
  }

  return { version, length };
}

function parseGLBChunks(glbArrayBuffer) {
  const chunks = [];
  let offset = 12; // Skip the header

  while (offset < glbArrayBuffer.byteLength) {
    const dataView = new DataView(glbArrayBuffer, offset);
    const chunkLength = dataView.getUint32(0, true);
    const chunkType = dataView.getUint32(4, true);
    const chunkData = new Uint8Array(glbArrayBuffer, offset + 8, chunkLength);

    chunks.push({ chunkLength, chunkType, chunkData });
    offset += chunkLength + 8;
  }

  return chunks;
}

function decodeJSONChunk(chunkData) {
  const textDecoder = new TextDecoder("utf-8");
  const jsonText = textDecoder.decode(chunkData);
  return JSON.parse(jsonText);
}