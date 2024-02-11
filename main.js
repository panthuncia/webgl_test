var v0 = normalize([-1.0, -1.0,  1.0, 1], true);
var v1 = normalize([1.0, -1.0,  1.0, 1], true);
var v2 = normalize([1.0,  1.0,  1.0, 1], true);
var v3 = normalize([-1.0,  1.0,  1.0, 1], true);
var v4 = normalize([-1.0, -1.0, -1.0, 1], true);
var v5 = normalize([1.0, -1.0, -1.0, 1], true);
var v6 = normalize([1.0,  1.0, -1.0, 1], true);
var v7 = normalize([-1.0,  1.0, -1.0, 1], true);

async function main() {

  //let programInfo = await createProgramVariants("shaders/vertex.glsl", "shaders/fragment.glsl");
  let renderer = new WebGLRenderer("webgl-canvas");
  //let terrain = await (renderer.loadModel(await (loadJson("objects/descriptions/ground.json"))));
  //let mainObject = await (renderer.loadModel(await (loadJson("objects/descriptions/rock_sphere.json"))));
  //let mainObject = await (renderer.loadModel(await (loadJson("objects/descriptions/sphere.json"))));

  let subdivisionData = cube(v0, v1, v2, v3, v4, v5, v6, v7, 2);
  let mainObject = renderer.createObjectFromData(subdivisionData.pointsArray, subdivisionData.normalsArray, subdivisionData.texCoordArray);
  let subdivisionData1 = cube(v0, v1, v2, v3, v4, v5, v6, v7, 0);
  let mainObject1 = renderer.createObjectFromData(subdivisionData1.pointsArray, subdivisionData1.normalsArray, subdivisionData1.texCoordArray);

  let playTime = 5;
  let animation = new AnimationClip();
  let original_positions = [[0, 0, 0], [10, 0, 0], [0, 10, 0], [0, 0, 0], [10, 0, 0]];
  let chaikin_iterations = 0
  positions = chaikin(original_positions, chaikin_iterations);
  let lines = linesFromPositions(positions);
  animation.addPositionKeyframe(0, new Transform(positions[0]));
  for (let i=1; i<positions.length-1; i++){
    animation.addPositionKeyframe(playTime/(positions.length-1), new Transform(positions[i]));
  }
  mainObject.animationController.setAnimationClip(animation);
  //let mainObject = await (renderer.loadModel(await (loadJson("objects/descriptions/house_pbr.json"))));
  //let sphereObject = await (renderer.loadModel(await (loadJson("objects/descriptions/brick_sphere.json"))));

  //terrain.transform.setLocalPosition([0, 0, -100])
  //terrain.transform.setLocalScale([2, 2, 2])

  //mainObject.transform.setLocalRotation([0, 0, 0]);
  //mainObject.transform.setLocalPosition([8, 10, 0]);
  //mainObject.transform.setLocalScale([20, 20, 20]);
  //mainObject1.transform.setLocalScale([20, 20, 20]);

  //sphereObject.transform.setLocalPosition([10, 10, 10]);
  //sphereObject.transform.setLocalScale([4, 4, 4]);

  //currentScene.objects = [terrain, mainObject, sphereObject];
  //renderer.addObject(terrain);
  renderer.addObject(mainObject);
  //renderer.addObject(mainObject1);
  //renderer.addObject(sphereObject);

  let light1 = new Light(LightType.POINT, [10, 10, -5], [4, 4, 4], 1.0, 1.0, 0.09, 0.032);
  let light2 = new Light(LightType.POINT, [9, 6, 7], [4, 4, 4], 1.0, 1.0, 0.09, 0.032);
  let light3 = new Light(LightType.SPOT, [-3, 9, 0], [1, 1, 1], 1.0, 1.0, 0.01, 0.0032, [1, 0, -0.02], Math.PI / 8, Math.PI / 6);
  let light4 = new Light(LightType.SPOT, [10, 18, -4], [1, 1, 1], 1.0, 1.0, 0.01, 0.0032, [0.01, -1, 0.01], Math.PI / 8, Math.PI / 6);
  let light5 = new Light(LightType.DIRECTIONAL, [0,0,0], [0.5,0.5,0.5], 1.0, 0, 0, 0, [1, 1, 1]);
  let light6 = new Light(LightType.DIRECTIONAL, [0,0,0], [0.5,0.5,0.5], 1.0, 0, 0, 0, [-1.0001, 1, -1.0001]);

  //renderer.addLight(light1);
  //renderer.addLight(light2);
  //renderer.addLight(light3);
  //renderer.addLight(light4);
  renderer.addLight(light5);
  renderer.addLight(light6);
  
  document.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'm') {
        console.log("toggling wireframe");
        renderer.forceWireframe = !renderer.forceWireframe;
      }
    else if (event.key.toLowerCase() === 'l') {
        console.log("toggling gouraud");
        renderer.forgeGouraud = !renderer.forgeGouraud;
      }
    else if (event.key.toLowerCase() === 'i'){
      chaikin_iterations +=1;
      if(chaikin_iterations>8){
        chaikin_iterations = 8;
      }
      positions = chaikin(original_positions, chaikin_iterations);
      lines = linesFromPositions(positions);
    }
    else if (event.key.toLowerCase() === 'j'){
      chaikin_iterations -=1;
      if(chaikin_iterations<0){
        chaikin_iterations = 0;
      }
      positions = chaikin(original_positions, chaikin_iterations);
      lines = linesFromPositions(positions);
    }
  });


  createDebugTriangle(renderer.gl);
  await(createDebugQuad(renderer.gl));
  var startTime = new Date().getTime() / 1000;
  mainObject.animationController.play(startTime);
  async function drawScene() {
    let currentTime = new Date().getTime() / 1000;
    mainObject.animationController.update(currentTime);
    await(renderer.drawScene());
    renderer.drawLines(lines);
    requestAnimationFrame(drawScene);
  }
  requestAnimationFrame(drawScene);
}

main()