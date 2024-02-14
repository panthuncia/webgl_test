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
function prepareObjectData(gl, data, textures = [], normals = [], aoMaps = [], heightMaps = [], metallic = [], roughness = [], opacity = [], reuseTextures = true){
  meshes = [];
  for (const geometry of data.geometries) {
    let baryCoords = getBarycentricCoordinates(geometry.data.position.length);
    meshes.push(new Mesh(gl, geometry.data.position, geometry.data.normal, geometry.data.texcoord, baryCoords));
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
  return {meshes, textures, normals, aoMaps, heightMaps, metallic, roughness, opacity}
}

//create a renderable object from data
function createRenderable(gl, data, shaderVariant, textures = [], normals = [], aoMaps = [], heightMaps = [], metallic = [], roughness = [], opacity = [], textureScale = 1.0, reuseTextures = true) {
  newData = prepareObjectData(gl, data, textures, normals, aoMaps, heightMaps, metallic, roughness, opacity, reuseTextures);
  return new RenderableObject(newData.meshes, shaderVariant, newData.textures, newData.normals, newData.aoMaps, newData.heightMaps, newData.metallic, newData.roughness, newData.opacity, textureScale);
}

//update the data associated with a renderable object
function updateRenderable(gl, renderable, data, shaderVariant, textures = [], normals = [], aoMaps = [], heightMaps = [], metallic = [], roughness = [], opacity = [], textureScale = 1.0, reuseTextures = true) {
  newData = prepareObjectData(gl, data, textures, normals, aoMaps, heightMaps, metallic, roughness, opacity, reuseTextures)
  return renderable.setData(newData.meshes, shaderVariant, newData.textures, newData.normals, newData.aoMaps, newData.heightMaps, newData.metallic, newData.roughness, newData.opacity, textureScale);
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

// Get a forward vector from a position and target
function calculateForwardVector(cameraPosition, targetPosition) {
  let forwardVector = vec3.subtract(vec3.create(), targetPosition, cameraPosition);
  vec3.normalize(forwardVector, forwardVector);
  return forwardVector;
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
    let offset = baseOffset + i * 4;
    dataView.setFloat32(offset, floatArray[i], true);
  }
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