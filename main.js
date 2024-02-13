var v0 = normalize([-1.0, -1.0,  1.0, 1], true);
var v1 = normalize([1.0, -1.0,  1.0, 1], true);
var v2 = normalize([1.0,  1.0,  1.0, 1], true);
var v3 = normalize([-1.0,  1.0,  1.0, 1], true);
var v4 = normalize([-1.0, -1.0, -1.0, 1], true);
var v5 = normalize([1.0, -1.0, -1.0, 1], true);
var v6 = normalize([1.0,  1.0, -1.0, 1], true);
var v7 = normalize([-1.0,  1.0, -1.0, 1], true);

async function main() {

  let renderer = new WebGLRenderer("webgl-canvas");
  await(createDebugQuad(renderer.gl));
  //let terrain = await (renderer.loadModel(await (loadJson("objects/descriptions/ground.json"))));
  //let mainObject = await (renderer.loadModel(await (loadJson("objects/descriptions/rock_sphere.json"))));
  //let mainObject = await (renderer.loadModel(await (loadJson("objects/descriptions/sphere.json"))));

  let currentSubdivisions = 0;
  let subdivisionData = cube(v0, v1, v2, v3, v4, v5, v6, v7, currentSubdivisions);
  // let textureImage = await loadTexture("textures/stonewall/scpgdgca_8K_Albedo.jpg");
  // let texture = createWebGLTexture(renderer.gl, textureImage, true, true);
  // let normalImage = await loadTexture("textures/stonewall/scpgdgca_8K_Normal.jpg");
  // let normal = createWebGLTexture(renderer.gl, normalImage, true, true);
  // let heightImage = await loadTexture("textures/stonewall/scpgdgca_8K_Displacement.jpg");
  // let height = createWebGLTexture(renderer.gl, heightImage, true, true);
  // let roughnessImage = await loadTexture("textures/stonewall/scpgdgca_8K_Roughness.jpg");
  // let roughness = createWebGLTexture(renderer.gl, roughnessImage, true, true);
  let mainObject = renderer.createObjectFromData(subdivisionData.pointsArray, subdivisionData.normalsArray, subdivisionData.texCoordArray);
  mainObject.transform.setLocalScale([3, 3, 3]);
  let playTime = 15;
  let animation = new AnimationClip();
  let original_positions = [[11, 36, 17],
  [44, 49, 23],
  [0, 32, 30],
  [11, 36, 47 ],
  [50, 34, 46],
  [2, 27, 7 ],
  [30, 40, 4],
  [28, 38, 39 ],
  [36, 1, 27 ],
  [38, 16, 7] , [11, 36, 17], [44, 49, 23]];
  //reposition
  for(let position of original_positions){
    position[0] /=2;
    position[1] /=2;
    position[2] /=2;
    position[0] -=13;
    position[1] -=13;
    position[2] -=13;
  }
  let chaikin_iterations = 0
  changeChaikin(0);

  mainObject.animationController.pause();
  //let mainObject = await (renderer.loadModel(await (loadJson("objects/descriptions/house_pbr.json"))));
  //let sphereObject = await (renderer.loadModel(await (loadJson("objects/descriptions/brick_sphere.json"))));



  //currentScene.objects = [terrain, mainObject, sphereObject];
  //renderer.addObject(terrain);
  objectID = renderer.addObject(mainObject);
  //renderer.addObject(sphereObject);

  let light1 = new Light(LightType.POINT, [10, 10, -5], [4, 4, 4], 30.0, 1.0, 0.09, 0.032);
  let light2 = new Light(LightType.POINT, [9, 6, 7], [4, 4, 4], 1.0, 1.0, 0.09, 0.032);
  let light3 = new Light(LightType.SPOT, [-3, 9, 0], [1, 1, 1], 1.0, 1.0, 0.01, 0.0032, [1, 0, -0.02], Math.PI / 8, Math.PI / 6);
  let light4 = new Light(LightType.SPOT, [10, 18, -4], [1, 1, 1], 1.0, 1.0, 0.01, 0.0032, [0.01, -1, 0.01], Math.PI / 8, Math.PI / 6);
  let light5 = new Light(LightType.DIRECTIONAL, [0,0,0], [0.5,0.5,0.5], 1.0, 0, 0, 0, [1, 1, 1]);
  let light6 = new Light(LightType.DIRECTIONAL, [0,0,0], [0.5,0.5,0.5], 1.0, 0, 0, 0, [-1.0001, 1, -1.0001]);

  mainObject.addChild(light1);

  renderer.addLight(light1);
  //renderer.addLight(light2);
  //renderer.addLight(light3);
  //renderer.addLight(light4);
  //renderer.addLight(light5);
  //renderer.addLight(light6);
  let playing = false;

  function changeChaikin(amount){
    chaikin_iterations +=amount;
      if(chaikin_iterations>8){
        chaikin_iterations = 8;
      }
      if(chaikin_iterations<0){
        chaikin_iterations = 0;
      }
      positions = chaikin(original_positions, chaikin_iterations);
      lines = linesFromPositions(positions);
      let newAnimation = new AnimationClip();
      newAnimation.addPositionKeyframe(0, new Transform(positions[0]));
      for (let i=1; i<positions.length-1; i++){
        newAnimation.addPositionKeyframe(playTime/(positions.length-1), new Transform(positions[i]));
      }
      mainObject.animationController.setAnimationClip(newAnimation);
  }

  function changeSphereSubdivision(amount){
    currentSubdivisions+=amount;
    if (currentSubdivisions>5){
      currentSubdivisions = 5;
    }
    if (currentSubdivisions<0){
      currentSubdivisions = 0;
    }
    let newData = cube(v0, v1, v2, v3, v4, v5, v6, v7, currentSubdivisions);
    renderer.setObjectData(mainObject, newData.pointsArray, newData.normalsArray, newData.texCoordArray);
  }

  function toggleAnimation(){
    if(!playing){
      mainObject.animationController.unpause();
      playing = true;
    } else {
      mainObject.animationController.pause();
      playing = false;
    }
  }

  document.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'm') {
        renderer.forceWireframe = !renderer.forceWireframe;
      }
    else if (event.key.toLowerCase() === 'l') {
        renderer.forceGouraud = !renderer.forceGouraud;
      }
    else if (event.key.toLowerCase() === 'i'){
      changeChaikin(1);
    }else if (event.key.toLowerCase() === 'j'){
      changeChaikin(-1);
    }else if (event.key.toLowerCase() === 'q'){
      changeSphereSubdivision(-1);
    }else if (event.key.toLowerCase() === 'e'){
      changeSphereSubdivision(1);
    }else if (event.key.toLowerCase() === 'a'){
      toggleAnimation();
    }
  });
  
  let lastTime = new Date().getTime() / 1000;
  async function drawScene() {
    let currentTime = new Date().getTime() / 1000;
    let elapsed = currentTime - lastTime;
    lastTime = currentTime;
    mainObject.animationController.update(elapsed);
    await(renderer.drawScene());
    renderer.drawLines(lines);
    requestAnimationFrame(drawScene);
  }
  requestAnimationFrame(drawScene);
}

main()