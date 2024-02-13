class Mesh {
  constructor(gl, vertices, normals, texcoords, baryCoords, tangents = null, bitangents = null, indices = null) {
    this.vertices = vertices;
    this.normals = normals;
    this.indices = indices;
    this.tangents = tangents;
    this.bitangents = bitangents;
    this.baryCoords = baryCoords;

    // Create VAO
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

    // Barycentric coord buffer
    this.baryBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.baryBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(baryCoords), gl.STATIC_DRAW);
    gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(3);

    // Tangents and bitangents (if present)
    if (tangents != null) {
      this.tangentBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.tangentBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tangents), gl.STATIC_DRAW);
      gl.vertexAttribPointer(4, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(4);

      this.bitangentBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.bitangentBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(bitangents), gl.STATIC_DRAW);
      gl.vertexAttribPointer(5, 3, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(5);
    }

    // Index buffer (if present)
    if (indices != null) {
      this.indexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    }

    // Unbind VAO
    gl.bindVertexArray(null);
  }
}

class Transform {
  constructor(pos = [0.0, 0.0, 0.0], rot = [0.0, 0.0, 0.0], scale = [1.0, 1.0, 1.0]) {
    this.pos = pos;
    this.rot = quat.create();
    quat.fromEuler(this.rot, rot[0], rot[1], rot[2]);
    this.scale = scale;
    this.isDirty = false;
    this.modelMatrix = mat4.create();
  }
  getLocalModelMatrix() {
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
  computeLocalModelMatrix() {
    this.modelMatrix = this.getLocalModelMatrix();
    this.isDirty = false;
  }
  computeModelMatrixFromParent(parentGlobalModelMatrix) {
    mat4.multiply(this.modelMatrix, parentGlobalModelMatrix, this.getLocalModelMatrix());
    this.isDirty = false;
  }
  setLocalPosition(newPosition) {
    this.pos = newPosition;
    this.isDirty = true;
  }
  setLocalRotation(rot) {
    // Why TF does quat.fromEuler use degrees
    // Who uses degrees
    quat.fromEuler(this.rot, rot[0] * (180 / Math.PI), rot[1] * (180 / Math.PI), rot[2] * (180 / Math.PI));
    //quat.fromEuler(this.rot, rot[0], rot[1], rot[2]);
    this.isDirty = true;
  }
  setDirection(dir) {
    let targetDirection = vec3.fromValues(dir[0], dir[1], dir[2]);
    vec3.normalize(targetDirection, targetDirection);

    let dotProduct = vec3.dot(defaultDirection, targetDirection);

    // Calculate the rotation quaternion
    let rotationQuat = quat.create();
    // Handlers for parallel and anti-parallel special cases
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
  setLocalScale(newScale) {
    this.scale = newScale;
    this.isDirty = true;
  }
  getGlobalPosition() {
    let position = vec3.fromValues(this.modelMatrix[12], this.modelMatrix[13], this.modelMatrix[14]);
    return position;
  }
}

class Keyframe {
  constructor(time, transform) {
    this.time = time;
    this.transform = transform;
  }
}

class AnimationClip {
  constructor() {
    this.positionKeyframes = [];
    this.rotationKeyframes = [];
    this.scaleKeyframes = [];
    this.duration = 0;
  }

  addPositionKeyframe(time, position) {
    this.positionKeyframes.push(new Keyframe(this.duration+time, position));
    this.duration+=time;
  }

  addRotationKeyframe(time, rotation) {
    this.rotationKeyframes.push(new Keyframe(time, rotation));
    this.duration+=time;
  }

  addScaleKeyframe(time, scale) {
    this.scaleKeyframes.push(new Keyframe(time, scale));
    this.duration+=time;
  }

  findBoundingKeyframes(currentTime){
    let prevKeyframe = this.positionKeyframes[0];
    let nextKeyframe = this.positionKeyframes[this.positionKeyframes.length - 1];
    let index = 0;
    if (this.positionKeyframes.length === 0) {
      return false;
    } else {
      for (let i = 0; i < this.positionKeyframes.length - 1; i++) {
        if (currentTime >= this.positionKeyframes[i].time && currentTime <= this.positionKeyframes[i+1].time) {
          prevKeyframe = this.positionKeyframes[i];
          nextKeyframe = this.positionKeyframes[i + 1];
          index = i;
          break;
        }
      }
    }
  
    return {position:{index, prevKeyframe, nextKeyframe }};
  }
}

class AnimationController {
  constructor(node) {
    this.node = node;
    this.animationClip = null;
    this.currentTime = 0; // Current time in the animation playback
    this.isPlaying = true;
  }

  setAnimationClip(animationClip) {
    this.animationClip = animationClip;
  }

  reset() {
    this.currentTime = 0;
  }

  pause() {
    this.isPlaying = false;
  }

  unpause() {
    this.isPlaying = true;
  }

  update(elapsedTime, force = false) {
    if (!force &&(!this.isPlaying || !this.animationClip)) return;
    
    
    // Loop the animation
    this.currentTime+=elapsedTime;
    this.currentTime%=this.animationClip.duration;

    // Update the relevant node's transform based on the current time
    // Hard update for now, should really have some kind of "soft update"
    // to account for other offsets or animation blending
    this.updateTransform();
  }

  updateTransform() {
    let boundingFrames = this.animationClip.findBoundingKeyframes(this.currentTime);
    const timeElapsed = this.currentTime - boundingFrames.position.prevKeyframe.time;
    const diff = boundingFrames.position.nextKeyframe.time-boundingFrames.position.prevKeyframe.time;
    const t = diff > 0 ? timeElapsed / diff : 0;
    let interpolatedPosition = lerpTransform(boundingFrames.position.prevKeyframe.transform, boundingFrames.position.nextKeyframe.transform, t);
    this.node.transform.setLocalPosition(interpolatedPosition.pos);
  }
}

class SceneNode {
  constructor() {
    this.children = [];
    this.parent = null;
    this.transform = new Transform();
    this.animationController = new AnimationController(this);
    this.localID = 0;
  }
  addChild(node) {
    this.children.push(node);
    node.parent = this;
  }
  update() {
    if (this.transform.isDirty) {
      this.forceUpdate();
      return;
    }
    for (child of this.children) {
      child.update();
    }
  }
  forceUpdate() {
    if (this.parent) {
      this.transform.computeModelMatrixFromParent(this.parent.transform.modelMatrix);
    } else {
      this.transform.computeLocalModelMatrix();
    }
  }
}

class Material {
  constructor(textureScale){
    this.ambientStrength = 0.01;
    this.specularStrength = 1.0;
    this.textureScale = textureScale;
  }
}

class RenderableObject extends SceneNode {
  constructor(meshes, shaderVariant, textures, normals, aoMaps, heightMaps, metallic, roughness, opacity, textureScale) {
    super();
    this.material = new Material(textureScale);
    this.shaderVariant = shaderVariant;
    this.meshes = meshes;
    this.textures = [];
    this.normals = [];
    this.aoMaps = [];
    this.heightMaps = [];
    this.metallic = [];
    this.roughness = [];
    this.opacity = [];
    for (let i = 0; i < meshes.length; i++) {
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
  DIRECTIONAL: 2,
};
class Light extends SceneNode {
  constructor(type, position, color, intensity, constantAttenuation = 0, linearAttenuation = 0, quadraticAttenuation = 0, direction = [0, 0, 0], innerConeAngle = 20, outerConeAngle = 30) {
    super();
    this.type = type;
    this.transform.setLocalPosition(vec3.fromValues(position[0], position[1], position[2]));
    this.color = vec3.fromValues(color[0], color[1], color[2]);
    vec3.normalize(this.color, this.color);
    this.intensity = intensity;
    this.constantAttenuation = constantAttenuation;
    this.linearAttenuation = linearAttenuation;
    this.quadraticAttenuation = quadraticAttenuation;
    //let direction_vec = vec3.fromValues(direction[0], direction[1], direction[2]);
    // vec3.normalize(direction_vec, direction_vec);
    this.transform.setDirection(direction);
    this.innerConeAngle = innerConeAngle;
    this.innerConeCos = Math.cos(innerConeAngle);
    this.outerConeAngle = outerConeAngle;
    this.outerConeCos = Math.cos(outerConeAngle);

    this.dirtyFlag = true;
    switch (type) {
      case LightType.DIRECTIONAL:
        break;
      case LightType.SPOT:
        this.projectionMatrix = this.getPerspectiveProjectionMatrix();
        this.viewMatrix = this.getViewMatrix();
        this.lightSpaceMatrix = mat4.create();
        mat4.multiply(this.lightSpaceMatrix, this.projectionMatrix, this.viewMatrix);
        this.farPlane = this.calculateFarPlane();
        break;
      case LightType.POINT:
        this.projectionMatrix = this.getPerspectiveProjectionMatrix();
        this.cubemapViewMatrices = this.getCubemapViewMatrices();
        this.lightCubemapMatrices = [];
        for(let i=0; i<6; i++){
          this.lightCubemapMatrices[i] = mat4.create();
        }
    }
  }
  //TODO: don't calculate every time
  getViewMatrix() {
    let normalizedDirection = vec3.create();
    vec3.normalize(normalizedDirection, this.getLightDir());
    let targetPosition = vec3.create();
    let lightPosition = this.transform.getGlobalPosition();
    let up = [0, 1, 0];
    vec3.add(targetPosition, lightPosition, normalizedDirection);
    let lightView = mat4.create();
    mat4.lookAt(lightView, lightPosition, targetPosition, up);
    return lightView;
  }
  getCubemapViewMatrices() {
    //create six camera directions for each face
    const directions = [
      { dir: vec3.fromValues(1, 0, 0), up: vec3.fromValues(0, 1, 0) },
      { dir: vec3.fromValues(-1, 0, 0), up: vec3.fromValues(0, 1, 0) },
      { dir: vec3.fromValues(0, 1, 0), up: vec3.fromValues(0, 0, 1) }, //up needs to be different here because of axis alignment
      { dir: vec3.fromValues(0, -1, 0), up: vec3.fromValues(0, 0, -1) }, //here too
      { dir: vec3.fromValues(0, 0, 1), up: vec3.fromValues(0, 1, 0) },
      { dir: vec3.fromValues(0, 0, -1), up: vec3.fromValues(0, 1, 0) },
    ];
    //create view matrices for each dir
    const viewMatrices = [];
    for(let dir of directions){
      const viewMatrix = mat4.create();
      let target = vec3.create();
      vec3.add(target, this.transform.pos, dir.dir);
      mat4.lookAt(viewMatrix, this.transform.pos, target, dir.up);
      viewMatrices.push(viewMatrix);
    }
    return viewMatrices;
  }
  getPerspectiveProjectionMatrix() {
    let aspect = 1;
    let near = 1.0;
    let far = 100;
    let lightProjection = mat4.create();
    switch(this.type){
      case LightType.SPOT:
        mat4.perspective(lightProjection, this.outerConeAngle * 2, aspect, near, far);
        break;
      case LightType.POINT:
        mat4.perspective(lightProjection, Math.PI/2, aspect, near, far);
        break;
    }
    return lightProjection;
  }
  calculateFarPlane() {
    const A = this.quadraticAttenuation;
    const B = this.linearAttenuation;
    const C = this.constantAttenuation - this.intensity / 0.1;

    //quadratic equation
    const discriminant = B * B - 4 * A * C;
    if (discriminant < 0) {
      return Infinity;
    }

    const d1 = (-B + Math.sqrt(discriminant)) / (2 * A);
    const d2 = (-B - Math.sqrt(discriminant)) / (2 * A);
    return Math.max(d1, d2);
  }
  getLightDir() {
    const lightDirection = vec3.create();
    vec3.transformQuat(lightDirection, defaultDirection, this.transform.rot);
    return lightDirection;
  }
  setConeAngles(innerConeAngle, outerConeAngle) {
    if (this.type != LightType.SPOT){
      console.warn("Calling setConeAngles on light of type other than spot!")
      return;
    }
    this.innerConeAngle = innerConeAngle;
    this.innerConeCos = Math.cos(innerConeAngle);
    this.outerConeAngle = outerConeAngle;
    this.outerConeCos = Math.cos(outerConeAngle);
    //recalculate projection matrix with new fov
    this.projectionMatrix = this.getPerspectiveProjectionMatrix();
  }
  //override these methods to calculate view and projection matrices
  update() {
    if (this.transform.isDirty) {
      this.forceUpdate();
      return;
    }
    for (child of this.children) {
      child.update();
    }
  }
  forceUpdate() {
    this.dirtyFlag = true;
    if (this.parent) {
      this.transform.computeModelMatrixFromParent(this.parent.transform.modelMatrix);
    } else {
      this.transform.computeLocalModelMatrix();
    }
    //recalculate view matrix with new location
    switch (this.type) {
      case LightType.SPOT:
        this.viewMatrix = this.getViewMatrix();
        mat4.multiply(this.lightSpaceMatrix, this.projectionMatrix, this.viewMatrix);
        break;
      case LightType.POINT:
        this.cubemapViewMatrices = this.getCubemapViewMatrices();
        for(let i=0; i<6; i++){
          mat4.multiply(this.lightCubemapMatrices[i], this.projectionMatrix, this.cubemapViewMatrices[i]);
        }
        break;
    }
  }
}