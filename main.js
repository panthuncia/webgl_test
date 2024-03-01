async function main() {
  //let meshes = await loadAndParseGLB("objects/gltf/car.glb");
  let renderer = new WebGLRenderer("webgl-canvas");
  lines = {};
  let animatedObjects = [];
  //let nodes = await loadAndParseGLTF(renderer, "objects/gltf/tiger", "scene.gltf");
  //let car_lowpoly = await loadAndParseGLB(renderer, "objects/gltf/car_lowpoly.glb");


  // Load street and modify materials
  let street = await parseGLBFromString(renderer, streetModel.data);
  
  let tileHeightImage = await base64ToImageBitmap(tileHeightmapImage.data);
  let tileHeightMap = createWebGLTexture(renderer.gl, tileHeightImage, false, true);
  renderer.materialsByName["Tiles"].setHeightMap(tileHeightMap);

  let asphaltHeightImage = await base64ToImageBitmap(asphaltHeightmapImage.data);
  let asphaltHeightMap = createWebGLTexture(renderer.gl, asphaltHeightImage, false, true);
  renderer.materialsByName["Asphalt"].setHeightMap(asphaltHeightMap);
  renderer.materialsByName["Asphalt"].heightMapScale = 0.025;

  let paintHeightImage = await base64ToImageBitmap(paintHeightmapImage.data);
  let paintHeightMap = createWebGLTexture(renderer.gl, paintHeightImage, false, true);
  renderer.materialsByName["Paint"].setHeightMap(paintHeightMap);
  renderer.materialsByName["Paint"].heightMapScale = 0.01;

  renderer.currentScene.appendScene(street);

  // Load lamp
  let lamp = await parseGLBFromString(renderer, lampModel.data);
  renderer.currentScene.appendScene(lamp);

  //load and animate car
  let car = await parseGLBFromString(renderer, carModel.data);
  carRoot = renderer.currentScene.appendScene(car);
  carRoot.transform.setLocalPosition([0, 0.4, 0]);
  carRoot.transform.setLocalScale([0.4, 0.4, 0.4]);
  let carPosNode = new SceneNode();
  renderer.currentScene.addNode(carPosNode);
  carPosNode.addChild(carRoot);
  let playTime = 10;
  let car_positions = [
    [3, 0, 3],
    [3, 0, -3],
    [-3, 0, -3],
    [-3, 0, 3],
    [3, 0, 3],
    [3, 0, -3],
  ];
  lines[carPosNode.localID] = setChaikin(carPosNode, car_positions, 8, playTime);
  animatedObjects.push(carPosNode);

  let carCameraNode = new SceneNode();
  renderer.currentScene.addNode(carCameraNode);
  carCameraNode.transform.setLocalPosition([0.8, 0.8, 3]);
  carCameraNode.transform.setLocalRotationFromEuler([0, (5*Math.PI)/4, 0]);
  carRoot.addChild(carCameraNode);
  let lookAt = vec3.fromValues(0, 0, 1);
  let up = vec3.fromValues(0, 1, 0);
  let fov = (80 * Math.PI) / 180; // in radians
  let aspect = renderer.gl.canvas.clientWidth / renderer.gl.canvas.clientHeight;
  let zNear = 0.1;
  let zFar = 1000.0;
  let carCamera = new Camera(lookAt, up, fov, aspect, zNear, zFar);
  renderer.currentScene.addNode(carCamera);
  carCameraNode.addChild(carCamera);

  let rabbit = await parseGLBFromString(renderer, bunnyModel.data);
  let rabbitRoot = renderer.currentScene.appendScene(rabbit);
  rabbitRoot.transform.setLocalScale([3, 3, 3]);
  rabbitRoot.transform.setLocalPosition([1.5, 0.5, 4.5]);
  carRoot.addChild(rabbitRoot);

  let sign = await parseGLBFromString(renderer, signModel.data);
  sign.sceneRoot.transform.setLocalPosition([4.5, 0, 2]);
  sign.sceneRoot.transform.setLocalRotationFromEuler([0, -Math.PI/2, 0]);
  renderer.currentScene.appendScene(sign);

  let camera_positions = [
    [7, 5, 7],
    [7, 1, -7],
    [-7, 5, -7],
    [-7, 1, 7],
    [7, 5, 7],
    [7, 1, -7],
  ];
  lines[renderer.currentScene.camera.localID] = setChaikin(renderer.currentScene.camera, camera_positions, 8, 16, 1);


  let tiger = await parseGLBFromString(renderer, tigerModel.data);
  tiger.sceneRoot.transform.setLocalScale([0.1, 0.1, 0.1]);
  tiger.sceneRoot.transform.setLocalPosition([-4, 0, -4]);
  renderer.currentScene.appendScene(tiger);

  let dragon = await parseGLBFromString(renderer, dragonModel.data);
  dragon.sceneRoot.transform.setLocalScale([10, 10, 10]);
  dragon.sceneRoot.transform.setLocalPosition([4, -3, 4]);
  renderer.currentScene.appendScene(dragon);

  let cubemap = await createCubemap(renderer.gl);
  renderer.skyboxCubemap = cubemap;


  let addedObjects = [];
  let currentSubdivisions = 0;
  let subdivisionData = cube(v0, v1, v2, v3, v4, v5, v6, v7, currentSubdivisions, false);
  let sphereData = cube(v0, v1, v2, v3, v4, v5, v6, v7, 4, false);


  //let rock = await renderer.loadModel(await loadJson("objects/descriptions/rock_sphere.json"));
  //rock.transform.setLocalScale([5, 5, 5]);
  //rock.transform.setLocalRotation([0, 0, -Math.PI/2]);
  //renderer.currentScene.addObject(rock);

  let light2 = new Light(LightType.POINT, [0, 3.05, 0], [0.64, 0.639, 0.416], 50.0, 1.0, 0.09, 0.032);
  //renderer.addLight(light2);

  let light2Object = renderer.createObjectFromData(sphereData.pointsArray, sphereData.normalsArray, sphereData.texCoordArray, [], [light2.color[0] * 255, light2.color[1] * 255, light2.color[2] * 255, 255], "light 2 object", true, 40.0);
  light2Object.transform.setLocalScale([0.07, 0.07, 0.07]);
  light2Object.transform.setLocalPosition([0.0, -0.05, 0.0]);
  renderer.currentScene.addObject(light2Object);
  light2.addChild(light2Object);
  renderer.addLightToCurrentScene(light2);


  let light3 = new Light(LightType.SPOT, [-3, 9, 0], [1, 1, 1], 1.0, 1.0, 0.01, 0.0032, [1, 0, -0.02], Math.PI / 8, Math.PI / 6);
  let light4 = new Light(LightType.SPOT, [10, 18, -4], [1, 1, 1], 1.0, 1.0, 0.01, 0.0032, [0.01, -1, 0.01], Math.PI / 8, Math.PI / 6);
  let light5 = new Light(LightType.DIRECTIONAL, [0, 0, 0], [0.5, 0.5, 0.5], 10.0, 0, 0, 0, [1, 1, 0.2]);
  let light6 = new Light(LightType.DIRECTIONAL, [0, 0, 0], [0.5, 0.5, 0.5], 30.0, 0, 0, 0, [-1.0001, 1, -1.0001]);

  renderer.addLightToCurrentScene(light5);
  //renderer.addLight(light6);

  //lines[light1.localID] = setChaikin(light1, light_positions, 8, 3);
  //animatedObjects.push(light1);

  function setChaikin(object, points, amount, playTime, mode = 0){
    let positions = chaikin(points, amount);
    let newAnimation = new AnimationClip();
    newAnimation.addPositionKeyframe(0, vec3.fromValues(...positions[0]));
    for (let i=1; i<positions.length-1; i++){
      newAnimation.addPositionKeyframe(i*(playTime/(positions.length-1)), vec3.fromValues(...positions[i]));
    }
    switch (mode){
      //calculate rotation keyframes that always point to the next position keyframe
      case 0:
        for (let i = 0; i < positions.length - 1; i++) {
          let currentPos = positions[i];
          let nextPos = positions[i + 1];
          let direction = vec3.subtract(vec3.create(), vec3.fromValues(...currentPos), vec3.fromValues(...nextPos));
          let rotationQuat = quaternionFromDirection(direction);
          newAnimation.addRotationKeyframe(i * (playTime / (positions.length - 1)), rotationQuat);
        }
        break;
      //calculate rotation keyframes that always point to the origin
      case 1:
        for (let i = 0; i < positions.length; i++) {
          let position = positions[i];
          let target = vec3.fromValues(0, 0, 0);
          let rotationQuat = quaternionLookAt(position, target, defaultDirection);
      
          newAnimation.addRotationKeyframe(i * (playTime / (positions.length - 1)), rotationQuat);
        }
        break;
    }
    object.animationController.setAnimationClip(newAnimation);
    return linesFromPositions(positions);
}

  let playing = true;
  function toggleAnimation(){
    if(!playing){
      for (let anim of animatedObjects){
        anim.animationController.unpause();
      }
      playing = true;
    } else {
      for (let anim of animatedObjects){
        anim.animationController.pause();
      }
      playing = false;
    }
  }

  let mainCamera = renderer.currentScene.camera;
  let directedCamera = true;
  let cameraPlaying = true;
  let sunlight = true;
  let sunColor = light5.color;
  document.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "m") {
      renderer.forceWireframe = !renderer.forceWireframe;
    }
    if (event.key.toLowerCase() === "z") {
      renderer.showShadowBuffer = !renderer.showShadowBuffer;
    }
    if (event.key.toLowerCase() === "f") {
      renderer.materialsByName["Bunny"].shaderVariant ^= SHADER_VARIANTS.SHADER_VARIANT_ENVIRONMENT_MAP; //toggle env mapping
      renderer.materialsByName["Bunny"].shaderVariant ^= SHADER_VARIANTS.SHADER_VARIANT_REFRACT;

      renderer.materialsByName["StingrayPBS1"].shaderVariant ^= SHADER_VARIANTS.SHADER_VARIANT_ENVIRONMENT_MAP; //toggle env mapping
      renderer.materialsByName["StingrayPBS1"].shaderVariant ^= SHADER_VARIANTS.SHADER_VARIANT_REFRACT;
    }
    if (event.key.toLowerCase() === "r") {
      renderer.materialsByName["clay"].shaderVariant ^= SHADER_VARIANTS.SHADER_VARIANT_ENVIRONMENT_MAP; //toggle env mapping
      renderer.materialsByName["clay"].shaderVariant ^= SHADER_VARIANTS.SHADER_VARIANT_REFLECT;

      renderer.materialsByName["Material_0"].shaderVariant ^= SHADER_VARIANTS.SHADER_VARIANT_ENVIRONMENT_MAP; //toggle env mapping
      renderer.materialsByName["Material_0"].shaderVariant ^= SHADER_VARIANTS.SHADER_VARIANT_REFLECT;
    }
    if (event.key.toLowerCase() === "d") {
      if (directedCamera){
        directedCamera = false;
        renderer.currentScene.camera = carCamera;
      } else {
        directedCamera = true;
        renderer.currentScene.camera = mainCamera;
      }
    }
    if (event.key.toLowerCase() === "s") {
      renderer.drawShadows = ! renderer.drawShadows;
      renderer.clearShadows();
    }
    //hack, just sets all light colors to 0,0,0
    if (event.key.toLowerCase() === "l") {
      renderer.lightScene = ! renderer.lightScene;
    }
    if (event.key.toLowerCase() === "m") {
      toggleAnimation();
    }
    if (event.key.toLowerCase() === "e") {
      renderer.showSkybox = ! renderer.showSkybox;
    }
    if (event.key.toLowerCase() === "c") {
      if(!cameraPlaying){
        mainCamera.animationController.unpause();
        cameraPlaying = true;
      } else {
        mainCamera.animationController.pause();
        cameraPlaying = false;
      }
    }
    if (event.key.toLowerCase() === "g") {
      if(sunlight){
        sunlight = false;
        light5.color = [0, 0, 0];
      } else {
        sunlight = true;
        light5.color = sunColor;
      }
    }
  });

  await createDebugQuad(renderer.gl);

  let lastTime = new Date().getTime() / 1000;
  async function drawScene() {
    let currentTime = new Date().getTime() / 1000;
    let elapsed = currentTime - lastTime;
    lastTime = currentTime;
    for (let anim of animatedObjects){
      anim.animationController.update(elapsed);
    }
    mainCamera.animationController.update(elapsed);
    renderer.drawScene();
    for (let key in lines){
      let object = renderer.currentScene.getEntityById(key);
      //renderer.drawLines(lines[key], object.parent.transform.modelMatrix);
    }
    requestAnimationFrame(drawScene);
  }
  requestAnimationFrame(drawScene);
}

main();
