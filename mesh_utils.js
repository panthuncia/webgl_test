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
  
      // uvs
      let uv0 = { u: uvs[j], v: uvs[j + 1] };
      let uv1 = { u: uvs[j + 2], v: uvs[j + 3] };
      let uv2 = { u: uvs[j + 4], v: uvs[j + 5] };
  
      // deltas
      let deltaPos1 = { x: v1.x - v0.x, y: v1.y - v0.y, z: v1.z - v0.z };
      let deltaPos2 = { x: v2.x - v0.x, y: v2.y - v0.y, z: v2.z - v0.z };
      let deltaUV1 = { u: uv1.u - uv0.u, v: uv1.v - uv0.v };
      let deltaUV2 = { u: uv2.u - uv0.u, v: uv2.v - uv0.v };
  
      // tangent
      let r = 1.0 / (deltaUV1.u * deltaUV2.v - deltaUV1.v * deltaUV2.u);
      let tangent = {
        x: (deltaPos1.x * deltaUV2.v - deltaPos2.x * deltaUV1.v) * r,
        y: (deltaPos1.y * deltaUV2.v - deltaPos2.y * deltaUV1.v) * r,
        z: (deltaPos1.z * deltaUV2.v - deltaPos2.z * deltaUV1.v) * r,
      };
      // bitangent
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
  
  function calculateTangentsBitangentsIndexed(positions, normals, uvs, indices) {
    let tangents = new Array(positions.length).fill(0);
    let bitangents = new Array(positions.length).fill(0);
  
    for (let i = 0; i < indices.length; i += 3) {
      // Indices
      const i0 = indices[i] * 3;
      const i1 = indices[i + 1] * 3;
      const i2 = indices[i + 2] * 3;
  
      const uvIndex0 = indices[i] * 2;
      const uvIndex1 = indices[i + 1] * 2;
      const uvIndex2 = indices[i + 2] * 2;
  
      // vertices
      const v0 = { x: positions[i0], y: positions[i0 + 1], z: positions[i0 + 2] };
      const v1 = { x: positions[i1], y: positions[i1 + 1], z: positions[i1 + 2] };
      const v2 = { x: positions[i2], y: positions[i2 + 1], z: positions[i2 + 2] };
  
      // uvs
      const uv0 = { u: uvs[uvIndex0], v: uvs[uvIndex0 + 1] };
      const uv1 = { u: uvs[uvIndex1], v: uvs[uvIndex1 + 1] };
      const uv2 = { u: uvs[uvIndex2], v: uvs[uvIndex2 + 1] };
  
      // deltas
      const deltaPos1 = { x: v1.x - v0.x, y: v1.y - v0.y, z: v1.z - v0.z };
      const deltaPos2 = { x: v2.x - v0.x, y: v2.y - v0.y, z: v2.z - v0.z };
      const deltaUV1 = { u: uv1.u - uv0.u, v: uv1.v - uv0.v };
      const deltaUV2 = { u: uv2.u - uv0.u, v: uv2.v - uv0.v };
  
      // tangent
      const r = 1.0 / (deltaUV1.u * deltaUV2.v - deltaUV1.v * deltaUV2.u);
      const tangent = {
        x: (deltaPos1.x * deltaUV2.v - deltaPos2.x * deltaUV1.v) * r,
        y: (deltaPos1.y * deltaUV2.v - deltaPos2.y * deltaUV1.v) * r,
        z: (deltaPos1.z * deltaUV2.v - deltaPos2.z * deltaUV1.v) * r,
      };
  
      // bitangent
      const bitangent = {
        x: (deltaPos2.x * deltaUV1.u - deltaPos1.x * deltaUV2.u) * r,
        y: (deltaPos2.y * deltaUV1.u - deltaPos1.y * deltaUV2.u) * r,
        z: (deltaPos2.z * deltaUV1.u - deltaPos1.z * deltaUV2.u) * r,
      };
  
      // A vertex can belong to multiple triangles
      for (let j of [i0, i1, i2]) {
        tangents[j] += tangent.x;
        tangents[j + 1] += tangent.y;
        tangents[j + 2] += tangent.z;
  
        bitangents[j] += bitangent.x;
        bitangents[j + 1] += bitangent.y;
        bitangents[j + 2] += bitangent.z;
      }
    }
  
    return { tangents, bitangents };
  }

  function padArray(array, value, amount) {
    for (let i = 0; i < amount; i++) {
      array.push(value);
    }
  }
  
  //create an array of barycentric coordinates
  function getBarycentricCoordinates(length) {
    let choices = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    let coords = [];
    for (let i = 0; i < length / 3; i++) {
      for (let num of choices) {
        coords.push(num);
      }
    }
    return coords;
  }
  
  // Pre-process skinned mesh data, splitting it into chunks where no one chunk requires more than N joints
  function splitMeshData(vertices, normals, texcoords, baryCoords, tangents, bitangents, indices, joints, weights, N) {
    let subMeshes = [];
    let currentMesh = createNewMesh();
  
    let currentIndex = 0;
  
    for (let i = 0; i < indices.length; i += 3) {
      let triangleIndices = [indices[i], indices[i + 1], indices[i + 2]];
      let triangleVertices = [];
      let triangleNormals = [];
      let triangleTexcoords = [];
      let triangleBaryCoords = [];
      let triangleTangents = [];
      let triangleBitangents = [];
      let triangleJoints = [];
      let triangleWeights = [];
  
      let jointSet = new Set();
  
      triangleIndices.forEach(index => {
        triangleVertices.push(...vertices.slice(index * 3, index * 3 + 3));
        triangleNormals.push(...normals.slice(index * 3, index * 3 + 3));
        triangleTexcoords.push(...texcoords.slice(index * 2, index * 2 + 2));
        triangleBaryCoords.push(...baryCoords.slice(index * 3, index * 3 + 3));
        triangleTangents.push(...tangents.slice(index * 3, index * 3 + 3));
        triangleBitangents.push(...bitangents.slice(index * 3, index * 3 + 3));
        triangleJoints.push(...joints.slice(index * 4, index * 4 + 4));
        triangleWeights.push(...weights.slice(index * 4, index * 4 + 4));
  
        joints.slice(index * 4, index * 4 + 4).forEach(joint => {
          if (joint !== 0) {
            jointSet.add(joint);
          }
        });
      });
  
      if (jointSet.size > N) {
        throw new Error(`Triangle requires more than ${N} joints, which is not supported.`);
      }
  
      let meshFound = false;
      for (let mesh of subMeshes) {
        if (canMeshAccommodateJoints(mesh, jointSet, N)) {
          addTriangleToMesh(mesh, triangleIndices, triangleVertices, triangleNormals, triangleTexcoords, triangleBaryCoords, triangleTangents, triangleBitangents, triangleJoints, triangleWeights, mesh.vertexMap);
          meshFound = true;
          break;
        }
      }
  
      if (!meshFound) {
        if (currentMesh.jointSet.size + jointSet.size > N) {
          subMeshes.push(currentMesh);
          currentMesh = createNewMesh();
          currentIndex = 0;
        }
        addTriangleToMesh(currentMesh, triangleIndices, triangleVertices, triangleNormals, triangleTexcoords, triangleBaryCoords, triangleTangents, triangleBitangents, triangleJoints, triangleWeights, currentMesh.vertexMap);
      }
    }
  
    if (currentMesh.vertices.length > 0) {
      subMeshes.push(currentMesh);
    }
  
    return subMeshes;
  }
  
  function createNewMesh() {
    return {
      vertices: [],
      normals: [],
      texcoords: [],
      baryCoords: [],
      tangents: [],
      bitangents: [],
      indices: [],
      joints: [],
      weights: [],
      indexMap: new Map(),
      jointMap: new Map(),
      jointSet: new Set(),
      vertexMap: new Map()
    };
  }
  
  // Check if the union of a mesh's joints and a new joint set exceeds the max allowable
  function canMeshAccommodateJoints(mesh, jointSet, N) {
    let totalJointSet = new Set([...mesh.jointSet, ...jointSet]);
    return totalJointSet.size <= N;
  }
  
  // Add triangle data to a given sub-mesh
  function addTriangleToMesh(mesh, triangleIndices, triangleVertices, triangleNormals, triangleTexcoords, triangleBaryCoords, triangleTangents, triangleBitangents, triangleJoints, triangleWeights, vertexMap) {
    let currentIndex = mesh.vertices.length / 3;
  
    triangleIndices.forEach((index, i) => {
      if (!vertexMap.has(index)) {
        mesh.vertices.push(...triangleVertices.slice(i * 3, i * 3 + 3));
        mesh.normals.push(...triangleNormals.slice(i * 3, i * 3 + 3));
        mesh.texcoords.push(...triangleTexcoords.slice(i * 2, i * 2 + 2));
        mesh.baryCoords.push(...triangleBaryCoords.slice(i * 3, i * 3 + 3));
        mesh.tangents.push(...triangleTangents.slice(i * 3, i * 3 + 3));
        mesh.bitangents.push(...triangleBitangents.slice(i * 3, i * 3 + 3));
        mesh.joints.push(...triangleJoints.slice(i * 4, i * 4 + 4));
        mesh.weights.push(...triangleWeights.slice(i * 4, i * 4 + 4));
  
        vertexMap.set(index, currentIndex++);
      }
      mesh.indices.push(vertexMap.get(index));
    });
  
    triangleJoints.forEach(joint => {
      if (joint !== 0) {
        mesh.jointSet.add(joint);
      }
    });
  }
  
  function remapJointIndices(subMeshes) {
    subMeshes.forEach(mesh => {
      let newJoints = [];
      for (let i = 0; i < mesh.joints.length; i += 4) {
        newJoints.push(
          mesh.jointMap.get(mesh.joints[i]),
          mesh.jointMap.get(mesh.joints[i + 1]),
          mesh.jointMap.get(mesh.joints[i + 2]),
          mesh.jointMap.get(mesh.joints[i + 3])
        );
      }
      mesh.joints = newJoints;
    });
  }
  
  function createSubMeshes(gl, vertices, normals, texcoords, baryCoords, material, tangents, bitangents, indices, joints, weights, N) {
    
    // Split the data into sub-meshes
    let subMeshes = splitMeshData(vertices, normals, texcoords, baryCoords, tangents, bitangents, indices, joints, weights, N);
  
    // Remap joint indices in sub-meshes
    //remapJointIndices(subMeshes);
  
    // Create new Mesh instances for each sub-mesh
    let newMeshes = subMeshes.map(mesh => new Mesh(
      gl,
      mesh.vertices,
      mesh.normals,
      mesh.texcoords,
      mesh.baryCoords,
      material,
      mesh.tangents,
      mesh.bitangents,
      mesh.indices,
      mesh.joints,
      mesh.weights
    ));
  
    return newMeshes;
  }