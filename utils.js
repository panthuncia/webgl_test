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
  const objVertexData = [
    objPositions,
    objTexcoords,
    objNormals,
  ];

  // same order as `f` indices
  let webglVertexData = [
    [],   // positions
    [],   // texcoords
    [],   // normals
  ];

  const materialLibs = [];
  const geometries = [];
  let geometry;
  let groups = ['default'];
  let material = 'default';
  let object = 'default';

  const noop = () => { };

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
      webglVertexData = [
        position,
        texcoord,
        normal,
      ];
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
    const ptn = vert.split('/');
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
      const [u, v] = parts.map(parseFloat)
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
    s: noop,    // smoothing group
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
  const lines = text.split('\n');
  for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
    const line = lines[lineNo].trim();
    if (line === '' || line.startsWith('#')) {
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
      console.warn('unhandled keyword:', keyword);  // eslint-disable-line no-console
      continue;
    }
    handler(parts, unparsedArgs);
  }

  // remove any arrays that have no entries.
  for (const geometry of geometries) {
    geometry.data = Object.fromEntries(
      Object.entries(geometry.data).filter(([, array]) => array.length > 0));
  }

  return {
    geometries,
    materialLibs,
  };
}

function calculateTangentsBitangents(positions, normals, uvs) {
  let tangents = [];
  let bitangents = [];
  let j=0;
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
          z: (deltaPos1.z * deltaUV2.v - deltaPos2.z * deltaUV1.v) * r
      };
      let bitangent = {
          x: (deltaPos2.x * deltaUV1.u - deltaPos1.x * deltaUV2.u) * r,
          y: (deltaPos2.y * deltaUV1.u - deltaPos1.y * deltaUV2.u) * r,
          z: (deltaPos2.z * deltaUV1.u - deltaPos1.z * deltaUV2.u) * r
      };

      // Store the tangent and bitangent for each vertex of the triangle
      //tangents.push(...Array(9).fill(tangent));
      tangents.push(tangent.x, tangent.y, tangent.z);
      tangents.push(tangent.x, tangent.y, tangent.z);
      tangents.push(tangent.x, tangent.y, tangent.z);
      bitangents.push(bitangent.x, bitangent.y, bitangent.z);
      bitangents.push(bitangent.x, bitangent.y, bitangent.z);
      bitangents.push(bitangent.x, bitangent.y, bitangent.z);
      //bitangents.push(...Array(9).fill(bitangent));
      j+=6;
  }

  return { tangents: tangents, bitangents: bitangents };
}

function compileShader(gl, shaderSource, shaderType) {
  const shader = gl.createShader(shaderType);
  gl.shaderSource(shader, shaderSource);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    console.error('An error occurred compiling the shader: ' + info);
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

async function getObj(filename) {
  return await fetch(filename)
    .then(response => response.text())
    .then(data => {
      console.log("found file")
      return parseOBJ(data)
    })
}

function createRenderable(data, shaderVariant, textures = [], normals = [], aoMaps = [], heightMaps = [], metallic = [], roughness = [], opacity = []) {
  meshes = []
  for (const geometry of data.geometries) {
    let tanbit = calculateTangentsBitangents(geometry.data.position, geometry.data.normal, geometry.data.texcoord);
    meshes.push(new Mesh(geometry.data.position, geometry.data.normal, geometry.data.texcoord, tanbit.tangents, tanbit.bitangents));
  }
  return new RenderableObject(meshes, shaderVariant, textures, normals, aoMaps, heightMaps, metallic, roughness, opacity);
}

async function loadTexture(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  return createImageBitmap(blob);
}

function createWebGLTexture(gl, image, srgb=false, repeated = false) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Set the parameters so we can render any size image
  if (repeated) {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // Upload the image into the texture
  if (srgb && srgb_ext){
    gl.texImage2D(gl.TEXTURE_2D, 0, srgb_ext.SRGB_ALPHA_EXT, srgb_ext.SRGB_ALPHA_EXT, gl.UNSIGNED_BYTE, image);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
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
    console.error('Error fetching file:', error);
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
    console.error('Error fetching file:', error);
  }
}

async function loadModel(modelDescription) {
  let textures = []
  let normals = []
  let aoMaps = []
  let heightMaps = []
  let metallic = []
  let roughness = []
  let opacity = []
  shaderVariant = 0
  try {
    for (const textureName of modelDescription.textures) {
      let textureImage = await (loadTexture("textures/" + textureName));
      let texture = createWebGLTexture(gl, textureImage, false, false);
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

  try {
    for (const textureName of modelDescription.metallic) {
      let metallicImage = await loadTexture("textures/" + textureName);
      let metallicTexture = createWebGLTexture(gl, metallicImage);
      metallic.push(metallicTexture);
    }
    shaderVariant |= shaderVariantPBR;
  } catch {
    console.log("Object " + modelDescription.model + " has no metallic texture")
  }

  try {
    for (const textureName of modelDescription.roughness) {
      let roughnessImage = await loadTexture("textures/" + textureName);
      let roughnessTexture = createWebGLTexture(gl, roughnessImage);
      roughness.push(roughnessTexture);
    }
    shaderVariant |= shaderVariantPBR;
  } catch {
    console.log("Object " + modelDescription.model + " has no roughness texture")
  }
  try {
    for (const textureName of modelDescription.opacity) {
      let opacityImage = await loadTexture("textures/" + textureName);
      let opacityTexture = createWebGLTexture(gl, opacityImage);
      opacity.push(opacityTexture);
    }
    shaderVariant |= ShaderVariantOpacityMap;
  } catch {
    console.log("Object " + modelDescription.model + " has no opacity texture")
  }

  let objectData = await (getObj('objects/' + modelDescription.model));
  console.log(objectData);
  return renderableObject = createRenderable(objectData, shaderVariant, textures, normals, aoMaps, heightMaps, metallic, roughness, opacity);
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
      vec3.transformMat4(vec3.create(), vec3.fromValues(farWidth / 2, -farHeight / 2, -zFar), inverseViewMatrix)
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

  points.forEach(point => {
    vec3.min(min, min, point);
    vec3.max(max, max, point);
  });

  return [min, max];
}

function calculateForwardVector(cameraPosition, targetPosition) {
  let forwardVector = vec3.subtract(vec3.create(), targetPosition, cameraPosition);
  vec3.normalize(forwardVector, forwardVector);
  return forwardVector;
}