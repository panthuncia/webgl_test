class Mesh {
  constructor(gl, vertices, normals, texcoords, baryCoords, tangents = null, bitangents = null, indices = [], joints = null, weights = null) {
    this.vertices = vertices;
    this.normals = normals;
    this.indices = indices;
    this.tangents = tangents;
    this.bitangents = bitangents;
    this.baryCoords = baryCoords;
    this.gl = gl;
    this.shaderVariant = 0;
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

    let currentAttribIndex = 4;
    // Tangents and bitangents (if present)
    //if (tangents != null) {
    this.tangentBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.tangentBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tangents), gl.STATIC_DRAW);
    gl.vertexAttribPointer(currentAttribIndex, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(currentAttribIndex);
    currentAttribIndex++;

    this.bitangentBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bitangentBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(bitangents), gl.STATIC_DRAW);
    gl.vertexAttribPointer(currentAttribIndex, 3, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(currentAttribIndex);
    currentAttribIndex++;
    //}

    //joints and weights (if present)
    if (joints && weights) {
      this.shaderVariant |= SHADER_VARIANTS.SHADER_VARIANT_SKINNED;
      this.jointBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.jointBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Uint32Array(joints), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(currentAttribIndex);
      gl.vertexAttribIPointer(currentAttribIndex, 4, gl.UNSIGNED_INT, 0, 0);
      currentAttribIndex++;

      this.weightBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.weightBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(weights), gl.STATIC_DRAW);
      gl.vertexAttribPointer(currentAttribIndex, 4, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(currentAttribIndex);
      currentAttribIndex++;
    }

    // Index buffer (if present)
    this.hasIndexBuffer = false;
    if (indices.length > 0) {
      this.indexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
      this.draw = this.drawElementsInternal;
      this.hasIndexBuffer = true;
    } else {
      this.draw = this.drawArraysInternal;
    }

    // Unbind VAO
    gl.bindVertexArray(null);
  }
  drawArraysInternal(gl) {
    gl.drawArrays(gl.TRIANGLES, 0, this.vertices.length / 3);
  }
  drawElementsInternal(gl) {
    gl.drawElements(gl.TRIANGLES, this.indices.length, gl.UNSIGNED_INT, 0);
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
  copy()  {
    let transform = new Transform();
    transform.setLocalPosition(vec3.fromValues(this.pos[0], this.pos[1], this.pos[2]));
    transform.setLocalScale(vec3.fromValues(this.scale[0], this.scale[1], this.scale[2]));
    transform.setLocalRotationFromQuaternion(quat.fromValues(this.rot[0], this.rot[1], this.rot[2], this.rot[3]));
    return transform;
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
  setLocalRotationFromEuler(rot) {
    // Why TF does quat.fromEuler use degrees
    // Who uses degrees
    quat.fromEuler(this.rot, rot[0] * (180 / Math.PI), rot[1] * (180 / Math.PI), rot[2] * (180 / Math.PI));
    //quat.fromEuler(this.rot, rot[0], rot[1], rot[2]);
    this.isDirty = true;
  }
  setLocalRotationFromQuaternion(quat) {
    this.rot = quat;
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
      quat.setAxisAngle(rotationQuat, perpendicularAxis, Math.PI);
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
    this.positionKeyframes.push(new Keyframe(time, position));
    this.updateDuration(time);
  }

  addRotationKeyframe(time, rotation) {
    this.rotationKeyframes.push(new Keyframe(time, rotation));
    this.updateDuration(time);
  }

  addScaleKeyframe(time, scale) {
    this.scaleKeyframes.push(new Keyframe(time, scale));
    this.updateDuration(time);
  }

  updateDuration(time) {
    // Update the total duration of the animation based on the latest keyframe time
    if (time > this.duration) {
      this.duration = time;
    }
  }

  findBoundingKeyframes(currentTime, keyframes) {
    let prevKeyframe = keyframes[0];
    let nextKeyframe = keyframes[keyframes.length - 1];

    for (let i = 0; i < keyframes.length - 1; i++) {
      if (currentTime >= keyframes[i].time && currentTime < keyframes[i + 1].time) {
        prevKeyframe = keyframes[i];
        nextKeyframe = keyframes[i + 1];
        break;
      }
    }

    return { prevKeyframe, nextKeyframe };
  }
}

class Animation {
  constructor(name) {
    this.nodesMap = {};
    this.name = name;
    // let i=0;
    // for (let node of nodes){
    //   this.nodesMap[node.localID] = clips[i]
    //   i++;
    // }
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
    //dummy update to fix positions
    this.node.forceUpdate();
    this.updateTransform(0);
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
    if (!force && (!this.isPlaying || !this.animationClip)) return;

    // Loop the animation
    this.currentTime += elapsedTime;
    this.currentTime %= this.animationClip.duration;

    // Update the relevant node's transform based on the current time
    // Hard update for now, should really have some kind of "soft update"
    // to account for other offsets or animation blending
    this.updateTransform();
  }

  updateTransform() {
    let boundingPositionFrames = this.animationClip.findBoundingKeyframes(this.currentTime, this.animationClip.positionKeyframes);
    if (boundingPositionFrames.prevKeyframe && boundingPositionFrames.nextKeyframe) {
      const timeElapsed = this.currentTime - boundingPositionFrames.prevKeyframe.time;
      const diff = boundingPositionFrames.nextKeyframe.time - boundingPositionFrames.prevKeyframe.time;
      const t = diff > 0 ? timeElapsed / diff : 0;
      let interpolatedPosition = lerpVec3(boundingPositionFrames.prevKeyframe.transform, boundingPositionFrames.nextKeyframe.transform, t);
      this.node.transform.setLocalPosition(interpolatedPosition);
    }
    let boundingRotationFrames = this.animationClip.findBoundingKeyframes(this.currentTime, this.animationClip.rotationKeyframes);
    if (boundingRotationFrames.prevKeyframe && boundingRotationFrames.nextKeyframe) {
      const timeElapsed = this.currentTime - boundingRotationFrames.prevKeyframe.time;
      const diff = boundingRotationFrames.nextKeyframe.time - boundingRotationFrames.prevKeyframe.time;
      const t = diff > 0 ? timeElapsed / diff : 0;
      let interpolatedRotation = lerpRotation(boundingRotationFrames.prevKeyframe.transform, boundingRotationFrames.nextKeyframe.transform, t);
      this.node.transform.setLocalRotationFromQuaternion(interpolatedRotation);
    }
    let boundingScaleFrames = this.animationClip.findBoundingKeyframes(this.currentTime, this.animationClip.scaleKeyframes);
    if (boundingScaleFrames.prevKeyframe && boundingScaleFrames.nextKeyframe) {
      const timeElapsed = this.currentTime - boundingScaleFrames.prevKeyframe.time;
      const diff = boundingScaleFrames.nextKeyframe.time - boundingScaleFrames.prevKeyframe.time;
      const t = diff > 0 ? timeElapsed / diff : 0;
      let interpolatedScale = lerpVec3(boundingScaleFrames.prevKeyframe.transform, boundingScaleFrames.nextKeyframe.transform, t);
      this.node.transform.setLocalScale(interpolatedScale);
    }
  }
}

class Skeleton {
  constructor(nodes, inverseBindMatrices) {
    this.nodes = nodes;
    this.inverseBindMatrices = new Float32Array(inverseBindMatrices);
    this.boneTransforms = new Float32Array(nodes.length * 16);
    this.animations = [];
    this.animationsByName = {};
    this.userIDs = [];
  }
  addAnimation(animation) {
    if (animation.name in this.animationsByName) {
      console.warn("Duplicate animation names are not allowed in a single skeleton");
      return;
    }
    this.animations.push(animation);
    this.animationsByName[animation.name] = animation;
  }
  setAnimation(index) {
    if (this.animations.length <= index) {
      console.warn("Animation index out of range");
      return;
    }
    let animation = this.animations[index];
    for (let node of this.nodes) {
      if (animation.nodesMap[node.localID] != undefined) {
        node.animationController.setAnimationClip(animation.nodesMap[node.localID]);
      }
    }
  }
  updateTransforms() {
    for (let i = 0; i < this.nodes.length; i++) {
      if (this.nodes[i].transform.isDirty){
        console.warn("Skeleton node wasn't updated!");
        //this.nodes[i].update();
      }
      this.boneTransforms.set(this.nodes[i].transform.modelMatrix, i * 16);
    }
  }
}

// This class forms the basis for the renderer's scene graph
class SceneNode {
  constructor(name = null) {
    this.children = {};
    this.parent = null;
    this.transform = new Transform();
    this.animationController = new AnimationController(this);
    this.localID = -1;
    this.name = name;
  }
  addChild(node) {
    this.children[node.localID] = node;
    // A node can only inheret from one parent, and may only be a child of its parent
    if (node.parent != null) {
      node.parent.removeChild(node.localID);
    }
    node.parent = this;
  }
  removeChild(childId) {
    delete this.children[childId];
  }
  update() {
    if (this.transform.isDirty) {
      this.forceUpdate();
    }
    for (let childKey in this.children) {
      this.children[childKey].update();
    }
  }
  forceUpdate() {
    if (this.parent) {
      this.transform.computeModelMatrixFromParent(this.parent.transform.modelMatrix);
    } else {
      this.transform.computeLocalModelMatrix();
    }
    for (let childKey in this.children) {
      this.children[childKey].forceUpdate();
    }
  }
}

// This constructor is stupid
// IDK how to fix it though
class Material {
  constructor(texture, normal = null, invertNormalMap = false, aoMap = null, heightMap = null, metallic = null, roughness = null, combinedMetallicRoughness = false, metallicFactor = null, roughnessFactor = null, baseColorFactor = [1, 1, 1, 1], opacity = null, blendMode = BLEND_MODE.BLEND_MODE_OPAQUE, emissiveTexture = null, emissiveFactor = null, textureScale = 1.0, skipLighting = false, ambientStrength = 0.5, specularStrength = 2.0) {
    this.ambientStrength = ambientStrength;
    this.specularStrength = specularStrength;
    this.textureScale = textureScale;
    this.texture = texture;
    this.normal = normal;
    this.aoMap = aoMap;
    this.heightMap = heightMap;
    this.metallic = metallic;
    this.roughness = roughness;
    this.metallicFactor = metallicFactor;
    this.roughnessFactor = roughnessFactor;
    if (baseColorFactor == null) {
      baseColorFactor = [1, 1, 1, 1];
    }
    this.baseColorFactor = baseColorFactor;
    this.opacity = opacity;
    this.blendMode = blendMode;
    this.skipLighting = skipLighting;
    this.emissiveTexture = emissiveTexture;
    //if we have emissive texture, emissive factor is a multiplier. Else, it's a static offset.
    if (emissiveFactor == null) {
      if (emissiveTexture == null) {
        emissiveFactor = [0, 0, 0, 1];
      } else {
        emissiveFactor = [1, 1, 1, 1];
      }
    }
    this.emissiveFactor = emissiveFactor;

    this.shaderVariant = 0;
    if (skipLighting) {
      this.shaderVariant |= SHADER_VARIANTS.SHADER_VARIANT_SKIP_LIGHTING;
    }
    if (normal != null) {
      this.shaderVariant |= SHADER_VARIANTS.SHADER_VARIANT_NORMAL_MAP;
    }
    if (aoMap != null) {
      this.shaderVariant |= SHADER_VARIANTS.SHADER_VARIANT_BAKED_AO;
    }
    if (heightMap != null) {
      this.shaderVariant |= SHADER_VARIANTS.SHADER_VARIANT_PARALLAX;
    }
    if (metallic != null || roughness != null || metallicFactor != null || roughnessFactor != null) {
      this.shaderVariant |= SHADER_VARIANTS.SHADER_VARIANT_PBR;
      if (metallic != null || roughness != null) {
        this.shaderVariant |= SHADER_VARIANTS.SHADER_VARIANT_PBR_MAPS;
      }
    }
    if (this.shaderVariant & SHADER_VARIANTS.SHADER_VARIANT_PBR_MAPS)
      if (invertNormalMap == true) {
        this.shaderVariant |= SHADER_VARIANTS.SHADER_VARIANT_INVERT_NORMAL_MAP;
      }
    if (combinedMetallicRoughness == true) {
      this.shaderVariant |= SHADER_VARIANTS.SHADER_VARIANT_COMBINED_METALLIC_ROUGHNESS;
    }
    if (emissiveTexture != null) {
      this.shaderVariant |= SHADER_VARIANTS.SHADER_VARIANT_EMISSIVE_TEXTURE;
    }
  }
}

class RenderableObject extends SceneNode {
  constructor(meshes = null, material = null, name = null) {
    super();
    this.setData(meshes, material);
    this.name = name;
    this.hasUnskinned = false;
    this.hasSkinned = false;
    this.skinnedMeshes = [];
    this.unskinnedMeshes = [];
    this.skeleton = null;
    // Sort meshes into skinned and unskinned, as they need different shader programs
    // Having two arrays prevents the need to re-bind a bunch of stuff when switching between variants
    if (meshes) {
      for (let mesh of meshes) {
        if (mesh.shaderVariant & SHADER_VARIANTS.SHADER_VARIANT_SKINNED) {
          this.hasSkinned = true;
          this.skinnedMeshes.push(mesh);
        } else {
          this.hasUnskinned = true;
          this.unskinnedMeshes.push(mesh);
        }
      }
    }
  }
  setSkin(skeleton) {
    this.skeleton = skeleton;
    skeleton.userIDs.push(this.localID);
  }
  setMeshes(meshes) {
    this.meshes = meshes;
  }
  setData(meshes, material) {
    this.meshes = meshes;
    this.material = material;
  }
  bindTextures(gl, bindOffset, programInfo) {
    let textureUnit = bindOffset;
    let currentVariant = this.material.shaderVariant;
    //base texture
    gl.activeTexture(gl.TEXTURE0 + textureUnit);
    gl.bindTexture(gl.TEXTURE_2D, this.material.texture);
    gl.uniform1i(programInfo.uniformLocations.objectTexture, textureUnit);
    textureUnit += 1;

    //if we have a normal map for this mesh
    if (currentVariant & SHADER_VARIANTS.SHADER_VARIANT_NORMAL_MAP) {
      //normal map
      gl.activeTexture(gl.TEXTURE0 + textureUnit);
      gl.bindTexture(gl.TEXTURE_2D, this.material.normal);
      gl.uniform1i(programInfo.uniformLocations.normalTexture, textureUnit);
      textureUnit += 1;
    }
    //ao texture
    if (currentVariant & SHADER_VARIANTS.SHADER_VARIANT_BAKED_AO) {
      gl.activeTexture(gl.TEXTURE0 + textureUnit);
      gl.bindTexture(gl.TEXTURE_2D, this.material.aoMap);
      gl.uniform1i(programInfo.uniformLocations.aoTexture, textureUnit);
      textureUnit += 1;
    }
    //height texture
    if (currentVariant & SHADER_VARIANTS.SHADER_VARIANT_PARALLAX) {
      gl.activeTexture(gl.TEXTURE0 + textureUnit);
      gl.bindTexture(gl.TEXTURE_2D, this.material.heightMap);
      gl.uniform1i(programInfo.uniformLocations.heightMap, textureUnit);
      textureUnit += 1;
    }
    //PBR metallic & roughness textures
    if (currentVariant & SHADER_VARIANTS.SHADER_VARIANT_PBR) {
      if (currentVariant & SHADER_VARIANTS.SHADER_VARIANT_COMBINED_METALLIC_ROUGHNESS) {
        gl.activeTexture(gl.TEXTURE0 + textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, this.material.metallic);
        gl.uniform1i(programInfo.uniformLocations.metallicRoughness, textureUnit);
        textureUnit += 1;
      } else {
        gl.activeTexture(gl.TEXTURE0 + textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, this.material.metallic);
        gl.uniform1i(programInfo.uniformLocations.metallic, textureUnit);
        textureUnit += 1;
        gl.activeTexture(gl.TEXTURE0 + textureUnit);
        gl.bindTexture(gl.TEXTURE_2D, this.material.roughness);
        gl.uniform1i(programInfo.uniformLocations.roughness, textureUnit);
        textureUnit += 1;
      }
    }
    //Opacity texture, if object uses one
    if (currentVariant & SHADER_VARIANTS.SHADER_VARIANT_OPACITY_MAP) {
      gl.activeTexture(gl.TEXTURE0 + textureUnit);
      gl.bindTexture(gl.TEXTURE_2D, this.material.opacity);
      gl.uniform1i(programInfo.uniformLocations.opacity, textureUnit);
      textureUnit += 1;
    }

    if (currentVariant & SHADER_VARIANTS.SHADER_VARIANT_EMISSIVE_TEXTURE) {
      gl.activeTexture(gl.TEXTURE0 + textureUnit);
      gl.bindTexture(gl.TEXTURE_2D, this.material.emissiveTexture);
      gl.uniform1i(programInfo.uniformLocations.emissive, textureUnit);
      textureUnit += 1;
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
        for (let i = 0; i < 6; i++) {
          this.lightCubemapMatrices[i] = mat4.create();
        }
    }
  }
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
  // Cubemap matrices for rendering from this light's perspective
  getCubemapViewMatrices() {
    // Create six camera directions for each face
    const directions = [
      { dir: vec3.fromValues(1, 0, 0), up: vec3.fromValues(0, 1, 0) },
      { dir: vec3.fromValues(-1, 0, 0), up: vec3.fromValues(0, 1, 0) },
      { dir: vec3.fromValues(0, 1, 0), up: vec3.fromValues(0, 0, 1) }, // up needs to be different here because of axis alignment
      { dir: vec3.fromValues(0, -1, 0), up: vec3.fromValues(0, 0, -1) }, // here too
      { dir: vec3.fromValues(0, 0, 1), up: vec3.fromValues(0, 1, 0) },
      { dir: vec3.fromValues(0, 0, -1), up: vec3.fromValues(0, 1, 0) },
    ];
    //create view matrices for each dir
    const viewMatrices = [];
    for (let dir of directions) {
      const viewMatrix = mat4.create();
      let target = vec3.create();
      let pos = this.transform.getGlobalPosition();
      vec3.add(target, pos, dir.dir);
      mat4.lookAt(viewMatrix, pos, target, dir.up);
      viewMatrices.push(viewMatrix);
    }
    return viewMatrices;
  }
  getPerspectiveProjectionMatrix() {
    let aspect = 1;
    let near = 1.0;
    let far = 100;
    let lightProjection = mat4.create();
    switch (this.type) {
      case LightType.SPOT:
        mat4.perspective(lightProjection, this.outerConeAngle * 2, aspect, near, far);
        break;
      case LightType.POINT:
        mat4.perspective(lightProjection, Math.PI / 2, aspect, near, far);
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
    if (this.type != LightType.SPOT) {
      console.warn("Calling setConeAngles on light of type other than spot!");
      return;
    }
    this.innerConeAngle = innerConeAngle;
    this.innerConeCos = Math.cos(innerConeAngle);
    this.outerConeAngle = outerConeAngle;
    this.outerConeCos = Math.cos(outerConeAngle);
    // Recalculate projection matrix with new fov
    this.projectionMatrix = this.getPerspectiveProjectionMatrix();
  }
  // Override these methods to recalculate view and projection matrices
  update() {
    if (this.transform.isDirty) {
      this.forceUpdate();
    }
    for (let childKey in this.children) {
      this.children[childKey].update();
    }
  }
  forceUpdate() {
    if (this.parent) {
      this.transform.computeModelMatrixFromParent(this.parent.transform.modelMatrix);
    } else {
      this.transform.computeLocalModelMatrix();
    }
    // Recalculate view matrix with new location
    switch (this.type) {
      case LightType.SPOT:
        this.viewMatrix = this.getViewMatrix();
        mat4.multiply(this.lightSpaceMatrix, this.projectionMatrix, this.viewMatrix);
        break;
      case LightType.POINT:
        this.cubemapViewMatrices = this.getCubemapViewMatrices();
        for (let i = 0; i < 6; i++) {
          mat4.multiply(this.lightCubemapMatrices[i], this.projectionMatrix, this.cubemapViewMatrices[i]);
        }
        break;
    }
    for (let childKey in this.children) {
      this.children[childKey].forceUpdate();
    }
  }
}

class Camera extends SceneNode {
  constructor(lookAt, up, fov, aspect, zNear, zFar) {
    super();
    // Camera setup
    this.lookAt = lookAt;
    this.up = up;
    this.viewMatrix = mat4.create();
    this.viewMatrixInverse = mat4.create();
    this.projectionMatrix = mat4.create();
    this.fieldOfView = fov;
    this.aspect = aspect;
    this.zNear = zNear;
    this.zFar = zFar;

    mat4.perspective(this.projectionMatrix, this.fieldOfView, this.aspect, this.zNear, this.zFar);
  }

  update() {
    if (this.transform.isDirty) {
      this.forceUpdate();
    }
    for (let childKey in this.children) {
      this.children[childKey].update();
    }
  }
  forceUpdate() {
    if (this.parent) {
      this.transform.computeModelMatrixFromParent(this.parent.transform.modelMatrix);
    } else {
      this.transform.computeLocalModelMatrix();
    }
    mat4.lookAt(this.viewMatrix, this.transform.getGlobalPosition(), this.lookAt, this.up);
    mat4.invert(this.viewMatrixInverse, this.viewMatrix);
    for (let childKey in this.children) {
      this.children[childKey].forceUpdate();
    }
  }
}

class Scene {
  constructor() {
    this.nextNodeID = 0;
    this.shadowScene = {};
    this.lights = {};
    this.lightsByName = {};
    this.numLights = 0;
    this.objects = {};
    this.objectsByName = {};
    this.skeletons = [];
    this.animatedSkeletons = [];
    //skinning and transparency need to be drawn in batches
    this.skinnedOpaqueObjects = {};
    this.skinnedTransparentObjects = {};
    this.unskinnedOpaqueObjects = {};
    this.unskinnedTransparentObjects = {};
    this.nodes = {};
    this.nodesByName = {};
    this.numObjects = 0;
    this.sceneRoot = new SceneNode();
  }
  setCamera(lookAt, up, fov, aspect, zNear, zFar) {
    let camera = new Camera(lookAt, up, fov, aspect, zNear, zFar);
    this.addNode(camera);
    this.camera = camera;
  }
  // Add a renderable object to the current scene
  addObject(object) {
    this.numObjects++;
    object.localID = this.nextNodeID;
    //if (!object.parent) {
      this.sceneRoot.addChild(object);
    //}
    this.objects[this.nextNodeID] = object;
    this.nextNodeID++;
    if (object.name != null || object.name === "") {
      if (this.objectsByName[object.name] != undefined) {
        console.warn("Renderable object added with identical name to existing object. This will make the old object inaccessable by name.");
      }
      this.objectsByName[object.name] = object;
    }
    if (object.hasSkinned) {
      if (object.material.blendMode == BLEND_MODE.BLEND_MODE_OPAQUE) {
        this.skinnedOpaqueObjects[object.localID] = object;
      } else {
        this.skinnedTransparentObjects[object.localID] = object;
      }
    }
    if (object.hasUnskinned) {
      if (object.material.blendMode == BLEND_MODE.BLEND_MODE_OPAQUE) {
        this.unskinnedOpaqueObjects[object.localID] = object;
      } else {
        this.unskinnedTransparentObjects[object.localID] = object;
      }
    }
    return object.localID;
  }

  //Like addNode, if node ids need to be pre-assigned
  createNode(name = null) {
    let node = new SceneNode(name);
    this.addNode(node);
    return node;
  }

  // Add a plain node to the current scene (useful for offset transforms)
  addNode(node) {
    node.localID = this.nextNodeID;
    //if (!node.parent) {
      this.sceneRoot.addChild(node);
    //}
    this.nodes[this.nextNodeID] = node;
    this.nextNodeID++;
    if (node.name != null || node.name === "") {
      if (this.nodesByName[node.name] != undefined) {
        console.warn("Node added with identical name to existing node. This will make the old node inaccessible by name.");
      }
      this.nodesByName[node.name] = node;
    }
    return node.localID;
  }

  // Remove a renderable object from the current scene
  removeObject(objectID) {
    this.numObjects--;
    let object = this.objects[objectID];
    if (object.parent != null) {
      object.parent.removeChild(objectID);
    }
    if (object.name != null) {
      delete this.objectsByName[object.name];
    }
    if (object.hasSkinned) {
      if (object.material.blendMode == BLEND_MODE.BLEND_MODE_OPAQUE) {
        delete this.skinnedOpaqueObjects[object.localID];
      } else {
        delete this.skinnedTransparentObjects[object.localID];
      }
    }
    if (object.hasUnskinned) {
      if (object.material.blendMode == BLEND_MODE.BLEND_MODE_OPAQUE) {
        delete this.unskinnedOpaqueObjects[object.localID];
      } else {
        delete this.unskinnedTransparentObjects[object.localID];
      }
    }
    delete this.objects[objectID];
  }

  removeObjectByName(name) {
    this.removeObject(this.objectsByName[name].localID);
  }

  removeNode(nodeID) {
    let node = this.nodes[nodeID];
    if (node.parent != null) {
      node.parent.removeChild(nodeID);
    }
    if (node.name != null) {
      delete this.nodesByName[node.name];
    }
    delete this.nodes[nodeID];
  }

  // Get an SceneNode of any kind by ID
  getEntityById(objectID) {
    let object = this.objects[objectID];
    if (object === undefined) {
      object = this.lights[objectID];
    }
    if (object === undefined) {
      object = this.nodes[objectID];
    }
    return object;
  }

  // Add a light to the current scene
  addLight(light) {
    this.numLights++;
    light.localID = this.nextNodeID;
    //if (!light.parent) {
      this.sceneRoot.addChild(light);
    //}
    this.lights[this.nextNodeID] = light;
    this.nextNodeID++;
  }

  //adds a skeleton to the scene, so we can update it properly in our update() step
  addSkeleton(skeleton) {
    this.skeletons.push(skeleton);
    if (skeleton.animations.length > 0) {
      skeleton.setAnimation(skeleton.animations.length-1);
      this.animatedSkeletons.push(skeleton);
    }
  }
  createRenderableObject(gl, mesh, material, name) {
    let object = createRenderableObject(gl, mesh, material, name);
    this.addObject(object);
    return object;
  }

  // Combine two scenes, remapping child IDs
  appendScene(scene) {
    let idMap = {};

    let oldRootID = parseInt(scene.sceneRoot.localID);
    let newRootNode = new SceneNode();
    for (let key in scene.sceneRoot.children){
      let child = scene.sceneRoot.children[key];
      newRootNode.addChild(child);
    }
    newRootNode.transform = scene.sceneRoot.transform.copy();
    let newRootID = this.addNode(newRootNode);
    idMap[oldRootID] = newRootID;

    let newEntities = [];

    // Move nodes and build ID mapping
    for (let key in scene.lights) {
      let light = scene.lights[key];
      let oldID = light.localID;
      let newLight = new Light();
      Object.assign(newLight, light);
      newLight.transform = light.transform.copy();
      let newID = this.addLight(newLight);
      idMap[oldID] = newID;
      newEntities.push(newLight);
    }
    for (let key in scene.objects) {
      let object = scene.objects[key];
      let oldID = object.localID;
      let newObject = new RenderableObject(object.meshes, object.material, object.name);
      for (let key in object.children){
        let child = object.children[key];
        newObject.addChild(child);
      }
      newObject.transform = object.transform.copy();
      // if(object.hasSkinned){
      //   newObject.setSkin(object.skeleton)
      // }
      let newID = this.addObject(newObject);
      idMap[oldID] = newID;
      newEntities.push(newObject);
    }
    for (let key in scene.nodes) {
      let node = scene.nodes[key];
      let oldID = node.localID;
      let newNode = new SceneNode();
      for (let key in node.children){
        let child = node.children[key];
        newNode.addChild(child);
      }
      newNode.transform = node.transform.copy();
      let newID = this.addNode(newNode);
      idMap[oldID] = newID;
      newEntities.push(newNode);
    }
    for (let skeleton of scene.skeletons) {
      let newJoints = [];
      for (let joint of skeleton.nodes) {
        newJoints.push(this.getEntityById(idMap[joint.localID]));
      }
      let newSkeleton = new Skeleton(newJoints, skeleton.inverseBindMatrices);
      //remap node id maps in animations
      for(let animation of skeleton.animations){
        let newAnimation = new Animation(animation.name);
        for(let key in animation.nodesMap){
          newAnimation.nodesMap[idMap[key]] = animation.nodesMap[key];
        }
        newSkeleton.addAnimation(newAnimation);
      }
      //remap skeleton & users to their corrected ids
      let idsCopy = [...skeleton.userIDs];
      for (let oldID of idsCopy){
        this.getEntityById(idMap[oldID]).setSkin(newSkeleton);
      }
      this.addSkeleton(newSkeleton);
    }

    // Rebuild parent-child mapping
    let oldRootChildren = {}
    Object.assign(oldRootChildren, newRootNode.children);
    newRootNode.children = {};
    for (let key in oldRootChildren) {
      if (key in idMap) {
        newRootNode.addChild(this.getEntityById(idMap[key]));
      }
    }
    for (let entity of newEntities) { 
      let oldChildren = {};
      Object.assign(oldChildren, entity.children);
      entity.children = {};
      for (let key in oldChildren) {
        if (key in idMap) {
          entity.addChild(this.getEntityById(idMap[key]));
        } else {
          console.error("node missing from id map!");
        }
      }
    }
    return newRootNode;
  }
}
