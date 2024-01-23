class Mesh {
    constructor(gl, vertices, normals, texcoords, tangents = null, bitangents = null, indices = null) {
      this.vertices = vertices;
      this.normals = normals;
      this.indices = indices;
      this.tangents = tangents;
      this.bitangents = bitangents;

      // Create a VAO
      this.vao = gl.createVertexArray();
      gl.bindVertexArray(this.vao);

      // Vertex buffer
      this.vertexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(0);

      // Normal buffer
      this.normalBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(1);

      // Texture coordinate buffer
      this.texCoordBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texcoords), gl.STATIC_DRAW);
      gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(2);

      // Tangents and bitangents (if present)
      if (tangents != null) {
          this.tangentBuffer = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, this.tangentBuffer);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tangents), gl.STATIC_DRAW);
          gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0);
          gl.enableVertexAttribArray(3);

          this.bitangentBuffer = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, this.bitangentBuffer);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(bitangents), gl.STATIC_DRAW);
          gl.vertexAttribPointer(4, 3, gl.FLOAT, false, 0, 0);
          gl.enableVertexAttribArray(4);
      }

      // Index buffer (if present)
      if (indices != null) {
          this.indexBuffer = gl.createBuffer();
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
          gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
      }

      // Unbind the VAO
      gl.bindVertexArray(null);
  }
}

class Transform {
  constructor(pos = [0.0, 0.0, 0.0], rot = [0.0, 0.0, 0.0], scale = [1.0, 1.0, 1.0],){
    this.pos = pos; 
    this.rot = quat.create();
    quat.fromEuler(this.rot, rot[0], rot[1], rot[2]);
    this.scale = scale;
    this.isDirty = false;
    this.modelMatrix = mat4.create();
  }
  getLocalModelMatrix(){
    let matRotation = mat4.create();
    mat4.fromQuat(matRotation, this.rot);

    let matTranslation = mat4.create();
    mat4.fromTranslation(matTranslation, this.pos);

    let matScale = mat4.create();
    mat4.fromScaling(matScale, this.scale);

    let localMatrix = mat4.create();
    mat4.multiply(localMatrix, matTranslation, matRotation);
    mat4.multiply(localMatrix, localMatrix, matScale);
    return localMatrix;
  }
  computeLocalModelMatrix(){
    this.modelMatrix = this.getLocalModelMatrix();
    this.isDirty = false;
  }
  computeModelMatrixFromParent(parentGlobalModelMatrix){
    mat4.multiply(this.modelMatrix, parentGlobalModelMatrix, this.getLocalModelMatrix());
    this.isDirty = false;
  }
  setLocalPosition(newPosition){
    this.pos = newPosition;
		this.isDirty = true;
  }
  setLocalRotation(rot){
    //Why TF does quat.fromEuler use degrees
    //Who uses degrees
    quat.fromEuler(this.rot, rot[0]*(180/Math.PI), rot[1]*(180/Math.PI), rot[2]*(180/Math.PI));
    //quat.fromEuler(this.rot, rot[0], rot[1], rot[2]);
    this.isDirty = true;
  }
  setDirection(dir) {
    let targetDirection = vec3.fromValues(dir[0], dir[1], dir[2]);
    vec3.normalize(targetDirection, targetDirection);

    let dotProduct = vec3.dot(defaultDirection, targetDirection);

    // Calculate the rotation quaternion
    let rotationQuat = quat.create();

    if (dotProduct < -0.9999) {
        // The vectors are anti-parallel
        // Find an arbitrary perpendicular axis
        let perpendicularAxis = vec3.cross(vec3.create(), defaultDirection, vec3.fromValues(1, 0, 0));
        if (vec3.length(perpendicularAxis) < 0.01) {
            perpendicularAxis = vec3.cross(vec3.create(), defaultDirection, vec3.fromValues(0, 1, 0));
        }
        vec3.normalize(perpendicularAxis, perpendicularAxis);
        quat.setAxisAngle(rotationQuat, perpendicularAxis, Math.PI); // 180 degrees rotation
    } else if (dotProduct > 0.9999) {
        // The vectors are parallel
        quat.identity(rotationQuat);
    } else {
        // General case
        let rotationAxis = vec3.cross(vec3.create(), defaultDirection, targetDirection);
        vec3.normalize(rotationAxis, rotationAxis);
        let rotationAngle = Math.acos(dotProduct);
        quat.setAxisAngle(rotationQuat, rotationAxis, rotationAngle);
    }

    this.rot = rotationQuat;
}
  setLocalScale(newScale){
    this.scale = newScale;
    this.isDirty = true;
  }
  // getLocalRotationEuler(){
  //   //let rotationMatrix3x3 = mat3.fromMat4(mat3.create(), this.modelMatrix);

  //   // Decompose to Euler angles
  //   //let rot = decomposeRotationMatrixToEuler(rotationMatrix3x3);
  //   let eulerFromQuaternion = vec3.create();
  //   quat.getEuler(eulerFromQuaternion, this.rot);
  //   return eulerFromQuaternion;
  // }
}

class SceneNode {
  constructor(){
    this.children = [];
    this.parent = null;
    this.transform = new Transform(); 
  }
  addChild(node){
    this.children.push(node);
    node.parent = this;
  }
  updateSelfAndChildren(){
    if(this.transform.isDirty){
      this.forceUpdateSelfAndChildren();
      return;
    }
    for(child of this.children){
      child.updateSelfAndChildren();
    }
  }
  forceUpdateSelfAndChildren(){
    if(this.parent){
      this.transform.computeModelMatrixFromParent(this.parent.transform.modelMatrix);
    } else {
      this.transform.computeLocalModelMatrix();
    }
  }
}

class RenderableObject extends SceneNode{
  constructor(meshes, shaderVariant, textures, normals, aoMaps, heightMaps, metallic, roughness, opacity){
    super();
    this.shaderVariant = shaderVariant;
    this.meshes = meshes;
    this.textures = [];
    this.normals = [];
    this.aoMaps = [];
    this.heightMaps = [];
    this.metallic = [];
    this.roughness = [];
    this.opacity = [];
    for (let i=0; i<meshes.length; i++){
      if (textures.length >= i + 1) {
        this.textures.push(textures[i]);
      } else {
        this.textures.push(null);
      }
      if (normals.length >= i + 1) {
        this.normals.push(normals[i]);
      } else {
        this.normals.push(null);
      }
      if (aoMaps.length >= i + 1) {
        this.aoMaps.push(aoMaps[i]);
      } else {
        this.aoMaps.push(null);
      }
      if (heightMaps.length >= i + 1) {
        this.heightMaps.push(heightMaps[i]);
      } else {
        this.heightMaps.push(null);
      }
      if (metallic.length >= i + 1) {
        this.metallic.push(metallic[i]);
      } else {
        this.metallic.push(null);
      }
      if (roughness.length >= i + 1) {
        this.roughness.push(roughness[i]);
      } else {
        this.roughness.push(null);
      }
      if (opacity.length >= i + 1) {
        this.opacity.push(opacity[i]);
      } else {
        this.opacity.push(null);
      }
    }
  }
}
const LightType = {
  POINT: 0,
  SPOT: 1,
  DIRECTIONAL: 2
}
class Light extends SceneNode{
  constructor(type, position, color, constantAttenuation = 0, linearAttenuation = 0, quadraticAttenuation = 0, direction = [0,0,0], innerConeAngle = 20, outerConeAngle = 30){
    super();
    this.type = type;
    this.transform.setLocalPosition(vec3.fromValues(position[0], position[1], position[2]));
    this.color = color;
    this.constantAttenuation = constantAttenuation;
    this.linearAttenuation = linearAttenuation;
    this.quadraticAttenuation = quadraticAttenuation;
    //let direction_vec = vec3.fromValues(direction[0], direction[1], direction[2]);
    // vec3.normalize(direction_vec, direction_vec);
    this.transform.setDirection(direction);
    this.innerConeAngle = innerConeAngle;
    this.outerConeAngle = outerConeAngle;
  }
  //TODO: don't calculate every time
  getDynamicLightViewMatrix(center) {
    const lightDirection = this.getLightDir();
    let lightPos = vec3.add(vec3.create(), center, vec3.scale(vec3.create(), lightDirection, 1)); // Adjust distance as needed
    let target = center;
    let up = vec3.fromValues(1.0, 0.0, 0.0);
    let lightViewMatrix = mat4.create();
    mat4.lookAt(lightViewMatrix, lightPos, target, up);
    return lightViewMatrix;
  }
  getDynamicLightProjectionMatrix(lightViewMatrix, cameraFrustumCorners) {
    // Transform camera frustum corners to light space
    let transformedCorners = cameraFrustumCorners.map(corner => {
      let corner4d = glMatrix.vec4.fromValues(corner[0], corner[1], corner[2], 1.0);
      let transformed = glMatrix.vec4.transformMat4(glMatrix.vec4.create(), corner4d, lightViewMatrix);
      return [transformed[0], transformed[1], transformed[2]];
    });
  
    // Compute AABB in light space
    let [min, max] = computeAABB(transformedCorners);
  
    let lightProjectionMatrix = mat4.create();
    mat4.ortho(lightProjectionMatrix, min[0]/5, max[0]/5, min[1]/5, max[1]/5, -max[2]/5, -min[2]/5);
    return lightProjectionMatrix;
  }
  getLightDir() {
    const lightDirection = vec3.create();
    vec3.transformQuat(lightDirection, defaultDirection, this.transform.rot);
    return lightDirection;
  }
}