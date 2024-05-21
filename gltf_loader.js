function extractDataFromBuffer(binaryData, accessorData) {
    const { accessor, bufferView } = accessorData;
    const numComponents = numComponentsForType(accessor.type);
  
    // Calculate byte stride; use the provided byteStride from bufferView if present, otherwise calculate it
    const byteStride = bufferView.byteStride ? bufferView.byteStride : numComponents * bytesPerComponent(accessor.componentType);
  
    let effectiveByteOffset = bufferView.byteOffset;
    if (effectiveByteOffset == undefined) {
      effectiveByteOffset = 0;
    }
    if (accessor.byteOffset != undefined) {
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
      case 5120:
        return 1; // BYTE
      case 5121:
        return 1; // UNSIGNED_BYTE
      case 5122:
        return 2; // SHORT
      case 5123:
        return 2; // UNSIGNED_SHORT
      case 5125:
        return 4; // UNSIGNED_INT
      case 5126:
        return 4; // FLOAT
      default:
        throw new Error("Unsupported component type");
    }
  }
  
  function createTypedArray(componentType, buffer, byteOffset, length) {
    switch (componentType) {
      case 5120:
        return new Int8Array(buffer, byteOffset, length);
      case 5121:
        return new Uint8Array(buffer, byteOffset, length);
      case 5122:
        return new Int16Array(buffer, byteOffset, length);
      case 5123:
        return new Uint16Array(buffer, byteOffset, length);
      case 5125:
        return new Uint32Array(buffer, byteOffset, length);
      case 5126:
        return new Float32Array(buffer, byteOffset, length);
      default:
        throw new Error("Unsupported component type");
    }
  }
  
  function readComponent(buffer, componentType, byteOffset) {
    const dataView = new DataView(buffer);
    switch (componentType) {
      case 5120:
        return dataView.getInt8(byteOffset);
      case 5121:
        return dataView.getUint8(byteOffset);
      case 5122:
        return dataView.getInt16(byteOffset, true);
      case 5123:
        return dataView.getUint16(byteOffset, true);
      case 5125:
        return dataView.getUint32(byteOffset, true);
      case 5126:
        return dataView.getFloat32(byteOffset, true);
      default:
        throw new Error("Unsupported component type");
    }
  }
  
  function writeComponent(dataView, componentType, index, value) {
    const byteOffset = index * bytesPerComponent(componentType);
    switch (componentType) {
      case 5120:
        dataView.setInt8(byteOffset, value);
        break;
      case 5121:
        dataView.setUint8(byteOffset, value);
        break;
      case 5122:
        dataView.setInt16(byteOffset, value, true);
        break;
      case 5123:
        dataView.setUint16(byteOffset, value, true);
        break;
      case 5125:
        dataView.setUint32(byteOffset, value, true);
        break;
      case 5126:
        dataView.setFloat32(byteOffset, value, true);
        break;
      default:
        throw new Error("Unsupported component type");
    }
  }
  
  function numComponentsForType(type) {
    switch (type) {
      case "SCALAR":
        return 1;
      case "VEC2":
        return 2;
      case "VEC3":
        return 3;
      case "VEC4":
        return 4;
      case "MAT2":
        return 4;
      case "MAT3":
        return 9;
      case "MAT4":
        return 16;
      default:
        throw new Error("Unsupported type");
    }
  }
  
  function getAccessorData(gltfData, accessorIndex) {
    const accessor = gltfData.accessors[accessorIndex];
    const bufferView = gltfData.bufferViews[accessor.bufferView];
    return { accessor, bufferView };
  }
  
  function parseGLTFNodeHierarchy(gl, scene, gltfData, meshesAndMaterials, maxBonesPerMesh) {
    const nodes = [];
    // create SceneNode instances for each GLTF node
    for (let gltfNode of gltfData.nodes) {
      let node = null;
      if (gltfNode.mesh != undefined) {
        let data = meshesAndMaterials[gltfNode.mesh];
        node = scene.createRenderableObject(gl, data.mesh, gltfNode.name, maxBonesPerMesh);
        if (gltfNode.skin != undefined) {
          console.log("found skinned mesh");
          node.skinInstance = gltfNode.skin; //hack for setting skins later
        }
      } else {
        node = scene.createNode(gltfData.name);
        node.originalIndex = nodes.length;
      }
      if (gltfNode.matrix != undefined) {
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
      } else {
        if (gltfNode.translation != undefined) {
          node.transform.setLocalPosition(gltfNode.translation);
        }
        if (gltfNode.scale != undefined) {
          node.transform.setLocalScale(gltfNode.scale);
        }
        if (gltfNode.rotation != undefined) {
          node.transform.setLocalRotationFromQuaternion(gltfNode.rotation);
        }
      }
      node.templateMarker = true;
      nodes.push(node);
    }
  
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
    const rootNodes = nodes.filter((node) => node.parent.localID == -1);
    return { nodes, rootNodes };
  }
  
  function createDefaultTexture(gl) {
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
  async function getGLTFImages(gltfData, dir) {
    let images = [];
    if (!gltfData.images) {
      return images;
    }
    for (gltfImage of gltfData.images) {
      const image = await loadTexture(dir + "/" + gltfImage.uri);
      images.push(image);
    }
    return images;
  }
  
  //Load images stored in binary format
  async function getGLTFImagesFromBinary(gltfData, binaryData) {
    let images = [];
    if (!gltfData.images) {
      return images;
    }
    for (const gltfImage of gltfData.images) {
      let imageBuffer;
  
      if (gltfImage.uri) {
        if (gltfImage.uri.startsWith("data:")) {
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
  
  async function parseGLTFMaterials(gl, gltfData, dir, linearBaseColor = false, binaryData = null) {
    let defaultTexture = createDefaultTexture(gl);
    let images = null;
    if (binaryData != null) {
      images = await getGLTFImagesFromBinary(gltfData, binaryData);
    } else {
      images = await getGLTFImages(gltfData, dir);
    }
    let linearTextures = [];
    let srgbTextures = [];
    let materials = [];
  
    // Create linear and sRGB texture for each, because glTF doesn't specify usage in the texture definition :/
    // we will just delete the unused one.
  
    if (gltfData.textures) {
      gltfData.textures.forEach((gltfTexture, index) => {
        if (images[gltfTexture.source]) {
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
      });
    }
    gltfData.materials.forEach((gltfMaterial, index) => {
      let texture = null,
        normal = null,
        aoMap = null,
        heightMap = null,
        metallicRoughness = null,
        opacity = null,
        emissiveTexture = null;
  
      let metallicFactor = null,
        roughnessFactor = null,
        baseColorFactor = null,
        emissiveFactor = [0, 0, 0, 1];
      if (gltfMaterial.pbrMetallicRoughness) {
        if (gltfMaterial.pbrMetallicRoughness.baseColorTexture) {
          if (srgbTextures[gltfMaterial.pbrMetallicRoughness.baseColorTexture.index]) {
            if (linearBaseColor){
              texture = linearTextures[gltfMaterial.pbrMetallicRoughness.baseColorTexture.index];
              gl.deleteTexture(srgbTextures[gltfMaterial.pbrMetallicRoughness.baseColorTexture.index]);
            } else {
              texture = srgbTextures[gltfMaterial.pbrMetallicRoughness.baseColorTexture.index];
              gl.deleteTexture(linearTextures[gltfMaterial.pbrMetallicRoughness.baseColorTexture.index]);
            }
          } else {
            texture = defaultTexture;
          }
        } else {
          texture = defaultTexture;
        }
        if (gltfMaterial.pbrMetallicRoughness.metallicRoughnessTexture) {
          if (linearTextures[gltfMaterial.pbrMetallicRoughness.metallicRoughnessTexture.index]) {
            metallicRoughness = linearTextures[gltfMaterial.pbrMetallicRoughness.metallicRoughnessTexture.index];
            gl.deleteTexture(srgbTextures[gltfMaterial.pbrMetallicRoughness.metallicRoughnessTexture.index]);
          } else {
            metallicRoughness = defaultTexture;
          }
        }
        if (gltfMaterial.pbrMetallicRoughness.metallicFactor != undefined) {
          metallicFactor = gltfMaterial.pbrMetallicRoughness.metallicFactor;
        } else {
          metallicFactor = 1.0;
        }
        if (gltfMaterial.pbrMetallicRoughness.roughnessFactor != undefined) {
          roughnessFactor = gltfMaterial.pbrMetallicRoughness.roughnessFactor;
        } else {
          roughnessFactor = 1.0;
        }
        if (gltfMaterial.pbrMetallicRoughness.baseColorFactor != undefined) {
          baseColorFactor = gltfMaterial.pbrMetallicRoughness.baseColorFactor;
        } else {
          baseColorFactor = [1, 1, 1, 1];
        }
      }
  
      if (gltfMaterial.normalTexture) {
        if (linearTextures[gltfMaterial.normalTexture.index]) {
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
      if (gltfMaterial.emissiveTexture) {
        if (srgbTextures[gltfMaterial.emissiveTexture.index]) {
          emissiveTexture = srgbTextures[gltfMaterial.emissiveTexture.index];
          gl.deleteTexture(linearTextures[gltfMaterial.emissiveTexture.index]);
          emissiveFactor = [1, 1, 1, 1];
        } else {
          emissiveTexture = defaultTexture;
        }
      }
      if (gltfMaterial.emissiveFactor != undefined) {
        emissiveFactor = [...gltfMaterial.emissiveFactor, 1];
      }
  
      let blendMode = BLEND_MODE.BLEND_MODE_BLEND;
      if (gltfMaterial.alphaMode == "OPAQUE" || gltfMaterial.alphaMode == undefined) {
        blendMode = BLEND_MODE.BLEND_MODE_OPAQUE;
      } else if (gltfMaterial.alphaMode == "MASK") {
        blendMode = BLEND_MODE.BLEND_MODE_MASK;
      }
  
      const material = new Material(gltfMaterial.name, texture, normal, true, aoMap, heightMap, metallicRoughness, metallicRoughness, true, metallicFactor, roughnessFactor, baseColorFactor, opacity, blendMode, emissiveTexture, emissiveFactor);
      materials.push(material);
    });
    return materials;
  }
  
  function parseGLTFSkins(gltfData, nodes, binaryData, animations) {
    let skins = [];
    if (gltfData.skins == undefined) {
      return skins;
    }
    for (let skin of gltfData.skins) {
      const inverseBindMatrices = extractDataFromBuffer(binaryData, getAccessorData(gltfData, skin.inverseBindMatrices));
      let joints = [];
      for (let joint of skin.joints) {
        joints.push(nodes[joint]);
      }
      let skeleton = new Skeleton(joints, inverseBindMatrices);
      //register animations that reference joints in this skeleton
      for (let joint of skin.joints) {
        for (let animation of animations) {
          if (nodes[joint].localID in animation.nodesMap && !(animation.name in skeleton.animationsByName)) {
            skeleton.addAnimation(animation);
          }
        }
      }
      skins.push(skeleton);
    }
    return skins;
  }
  
  function setSkins(skins, nodes) {
    for (let node of nodes) {
      if (node.skinInstance != undefined) {
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
    const animation = new Animation(gltfAnimation.name); // new AnimationClip();
  
    for (const channel of gltfAnimation.channels) {
      const sampler = gltfAnimation.samplers[channel.sampler];
      const inputAccessor = getAccessorData(gltfData, sampler.input);
      const outputAccessor = getAccessorData(gltfData, sampler.output);
  
      const inputs = extractDataFromBuffer(binaryData, inputAccessor); // Time keyframes
      const outputs = extractDataFromBuffer(binaryData, outputAccessor); // Value keyframes
  
      const path = channel.target.path; // "translation", "rotation", or "scale"
      const node = nodes[channel.target.node].localID;
      if (animation.nodesMap[node] == undefined) {
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
  
  async function loadAndParseGLTF(renderer, dir, filename, maxBonesPerMesh, linearBaseColor = false) {
    const gl = renderer.gl;
    let meshesAndMaterials = [];
    let scene = new Scene();
    try {
      // Fetch the GLTF JSON file
      const url = dir + "/" + filename;
      const gltfResponse = await fetch(url);
      if (!gltfResponse.ok) {
        throw new Error(`HTTP error! status: ${gltfResponse.status}`);
      }
      const gltfData = await gltfResponse.json();
  
      // Load external BIN files specified in the GLTF
      const binBuffers = await Promise.all(
        gltfData.buffers.map(async (buffer) => {
          if (buffer.uri) {
            const binUrl = dir + "/" + buffer.uri;
            const binResponse = await fetch(binUrl);
            if (!binResponse.ok) {
              throw new Error(`HTTP error! status: ${binResponse.status}`);
            }
            return binResponse.arrayBuffer();
          }
        })
      );
  
      let materials = await parseGLTFMaterials(gl, gltfData, dir, linearBaseColor);
      for(let material of materials){
        if(material.name & material.name != ""){
          renderer.materialsByName[material.name] = material;
        }
      }
  
      const binaryData = binBuffers[0]; // One .bin file for now
      for (const mesh of gltfData.meshes) {
        let data = {
          mesh: {
            geometries: [],
          }
        }
        for(let primitive of mesh.primitives){
          let primitiveData = {
            data: {
              positions: extractDataFromBuffer(binaryData, getAccessorData(gltfData, primitive.attributes.POSITION)),
              normals: extractDataFromBuffer(binaryData, getAccessorData(gltfData, primitive.attributes.NORMAL)),
              indices: extractDataFromBuffer(binaryData, getAccessorData(gltfData, primitive.indices)),
              material: materials[primitive.material],
            },
          }
          if (primitive.attributes.TEXCOORD_0) {
            primitiveData.data.texcoords = extractDataFromBuffer(binaryData, getAccessorData(gltfData, primitive.attributes.TEXCOORD_0));
          }
          if (primitive.attributes.JOINTS_0) {
            primitiveData.data.joints = extractDataFromBuffer(binaryData, getAccessorData(gltfData, primitive.attributes.JOINTS_0));
            primitiveData.data.weights = extractDataFromBuffer(binaryData, getAccessorData(gltfData, primitive.attributes.WEIGHTS_0));
          }
          data.mesh.geometries.push(primitiveData);
        }
  
        meshesAndMaterials.push(data);
      }
      //console.log(meshes);
      let { nodes, rootNodes } = parseGLTFNodeHierarchy(gl, scene, gltfData, meshesAndMaterials, maxBonesPerMesh);
      let animations = parseGLTFAnimations(gltfData, binaryData, nodes);
      let skins = parseGLTFSkins(gltfData, nodes, binaryData, animations);
      for (let skeleton of skins) {
        scene.addSkeleton(skeleton);
      }
      setSkins(skins, nodes);
      console.log(animations);
    } catch (error) {
      console.error(error);
    }
    return scene;
  }
  
  function arrayBufferToBase64(buffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    let string = window.btoa(binary);
    return string;
  }
  
  function Base64ToArrayBuffer(str) {
    let binaryString = window.atob(str);
    let len = binaryString.length;
    let bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
  
    let arrayBuffer = bytes.buffer;
    return arrayBuffer;
  }
  
  function setDownload(dataString) {
    document.getElementById("downloadBtn").addEventListener("click", () => {
      const myObj = {
        data: dataString,
      };
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(myObj));
      const downloadAnchorNode = document.createElement("a");
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", "myData.json");
      document.body.appendChild(downloadAnchorNode); // Required for Firefox
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    });
  }
  
  async function loadAndParseGLB(renderer, url, maxBonesPerMesh, linearBaseColor = false) {
    const glbArrayBuffer = await fetchGLB(url);
    //setDownload(arrayBufferToBase64(glbArrayBuffer));
    return parseGLB(renderer, glbArrayBuffer, maxBonesPerMesh, linearBaseColor);
  }
  
  async function parseGLBFromString(renderer, string, maxBonesPerMesh, linearBaseColor = false) {
    const glbArrayBuffer = Base64ToArrayBuffer(string);
    return parseGLB(renderer, glbArrayBuffer, maxBonesPerMesh, linearBaseColor);
  }
  
  //https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#binary-gltf-layout
  async function parseGLB(renderer, glbArrayBuffer, maxBonesPerMesh, linearBaseColor) {
    const gl = renderer.gl;
    let meshesAndMaterials = [];
    let scene = new Scene();
    try {
      const header = parseGLBHeader(glbArrayBuffer);
      const chunks = parseGLBChunks(glbArrayBuffer);
  
      const jsonChunk = chunks.find((chunk) => chunk.chunkType === 0x4e4f534a); // 'JSON' in ASCII
      if (!jsonChunk) {
        throw new Error("JSON chunk not found");
      }
  
      const binChunk = chunks.find((chunk) => chunk.chunkType === 0x4e4942); // 'BIN' in ASCII
  
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
  
      let materials = await parseGLTFMaterials(gl, gltfData, "", linearBaseColor, binaryData);
      for(let material of materials){
        if(material.name && material.name != ""){
          renderer.materialsByName[material.name] = material;
        }
      }
      for (const mesh of gltfData.meshes) {
        let data = {
          mesh: {
            geometries: [],
          }
        }
        for(let primitive of mesh.primitives){
          let primitiveData = {
            data: {
              positions: extractDataFromBuffer(binaryData, getAccessorData(gltfData, primitive.attributes.POSITION)),
              normals: extractDataFromBuffer(binaryData, getAccessorData(gltfData, primitive.attributes.NORMAL)),
              indices: extractDataFromBuffer(binaryData, getAccessorData(gltfData, primitive.indices)),
              material: materials[primitive.material],
            },
          }
          if (primitive.attributes.TEXCOORD_0) {
            primitiveData.data.texcoords = extractDataFromBuffer(binaryData, getAccessorData(gltfData, primitive.attributes.TEXCOORD_0));
          }
          if (primitive.attributes.JOINTS_0) {
            primitiveData.data.joints = extractDataFromBuffer(binaryData, getAccessorData(gltfData, primitive.attributes.JOINTS_0));
            primitiveData.data.weights = extractDataFromBuffer(binaryData, getAccessorData(gltfData, primitive.attributes.WEIGHTS_0));
          }
          data.mesh.geometries.push(primitiveData);
        }
        meshesAndMaterials.push(data);
      }
      //console.log(meshes);
      let { nodes, rootNodes } = parseGLTFNodeHierarchy(gl, scene, gltfData, meshesAndMaterials, maxBonesPerMesh);
      let animations = parseGLTFAnimations(gltfData, binaryData, nodes);
      let skins = parseGLTFSkins(gltfData, nodes, binaryData, animations);
      for (let skeleton of skins) {
        scene.addSkeleton(skeleton);
      }
      setSkins(skins, nodes);
      console.log(animations);
    } catch (error) {
      console.error(error);
    }
    return scene;
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
  
    if (magic !== 0x46546c67) {
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