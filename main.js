
async function main() {

  //let programInfo = await createProgramVariants("shaders/vertex.glsl", "shaders/fragment.glsl");
  let renderer = new WebGLRenderer("webgl-canvas");
  let terrain = await (renderer.loadModel(await (loadJson("objects/descriptions/ground.json"))));
  let mainObject = await (renderer.loadModel(await (loadJson("objects/descriptions/house_pbr.json"))));
  let sphereObject = await (renderer.loadModel(await (loadJson("objects/descriptions/brick_sphere.json"))));

  //terrain.transform.setLocalPosition([0, 0, -100])
  terrain.transform.setLocalScale([2, 2, 2])

  mainObject.transform.setLocalRotation([0, 0, 0]);
  mainObject.transform.setLocalPosition([8, 4, 0]);

  sphereObject.transform.setLocalPosition([0, 10, 0]);
  sphereObject.transform.setLocalScale([.1, .1, .1]);

  //currentScene.objects = [terrain, mainObject, sphereObject];
  renderer.addObject(terrain);
  renderer.addObject(mainObject);
  renderer.addObject(sphereObject);

  let light1 = new Light(LightType.POINT, [10, 10, -5], [4, 4, 4], 1.0, 1.0, 0.09, 0.032);
  let light2 = new Light(LightType.POINT, [9, 6, 7], [4, 4, 4], 1.0, 1.0, 0.09, 0.032);
  let light3 = new Light(LightType.SPOT, [-10, 2, 0], [1, 1, 1], 4.0, 1.0, 0.09, 0.032, [1, 0, -0.2], Math.PI / 8, Math.PI / 6);
  let light4 = new Light(LightType.SPOT, [10, 18, -4], [1, 1, 1], 1.0, 1.0, 0.01, 0.0032, [0.01, -1, 0.01], Math.PI / 8, Math.PI / 6);
  let light5 = new Light(LightType.DIRECTIONAL, [0,0,0], [0.5,0.5,0.5], 1.0, 0, 0, 0, [1, 1, 1]);
  let light6 = new Light(LightType.DIRECTIONAL, [0,0,0], [0.5,0.5,0.5], 1.0, 0, 0, 0, [-1.0001, 1, -1.0001]);

  renderer.addLight(light1);
  renderer.addLight(light2);
  renderer.addLight(light3);
  renderer.addLight(light4);
  renderer.addLight(light5);
  renderer.addLight(light6);
  createDebugTriangle(renderer.gl);
  await(createDebugQuad(renderer.gl));
  async function drawScene() {
    await(renderer.drawScene());
    requestAnimationFrame(drawScene);
  }
  requestAnimationFrame(drawScene);
}

main()