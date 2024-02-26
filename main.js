/**
 * Project 2 by Matthew Gomes
 * Extra credit features:
 * 1. Camera movement (Orbital camera, drag on canvas and scroll to move)<br>
 * 2. Newell vertex calculation (press "n" to toggle)<br>
 * 3. Primary light orbits scene, path shown with lines<br>
 * 4. Second light orbiting the object, using scene graph for transform inheritance<br>
 * 5. Arbitrary number of lights (Press "z" to add a light! It will be spawned at a random location, in a random orientation, with a random color, and float around the scene)<br>
 * 6. Arbitrary number of objects on path (Press "x" to add an object! It will be spawned at the beginning of the path, with a random color and speed)
 */

var v0 = normalize([-1.0, -1.0, 1.0, 1], true);
var v1 = normalize([1.0, -1.0, 1.0, 1], true);
var v2 = normalize([1.0, 1.0, 1.0, 1], true);
var v3 = normalize([-1.0, 1.0, 1.0, 1], true);
var v4 = normalize([-1.0, -1.0, -1.0, 1], true);
var v5 = normalize([1.0, -1.0, -1.0, 1], true);
var v6 = normalize([1.0, 1.0, -1.0, 1], true);
var v7 = normalize([-1.0, 1.0, -1.0, 1], true);

async function main() {
  //let meshes = await loadAndParseGLB("objects/gltf/car.glb");
  let renderer = new WebGLRenderer("webgl-canvas");
  //let nodes = await loadAndParseGLTF(renderer, "objects/gltf/tiger", "scene.gltf");
  let tiger = await loadAndParseGLB(renderer.gl, "objects/gltf/tiger2.glb");
  let car = await loadAndParseGLB(renderer.gl, "objects/gltf/car.glb");
  car.sceneRoot.transform.setLocalPosition([0, 10, 0]);

  tiger.sceneRoot.transform.setLocalScale([0.1, 0.1, 0.1]);
  let scene = await parseGLBFromString(renderer.gl, dragonModel.data);
  scene.sceneRoot.transform.setLocalScale([10, 10, 10]);
  console.log(scene);
  renderer.currentScene.appendScene(car);
  scene.sceneRoot.transform.setLocalPosition([10, 0, 0]);
  //renderer.currentScene.appendScene(scene);
  tiger.sceneRoot.transform.setLocalPosition([0, 10, 0]);
  renderer.currentScene.appendScene(tiger);

  let terrain = await renderer.loadModel(await loadJson("objects/descriptions/ground.json"));
  terrain.transform.setLocalPosition([0, -5, 0]);
  renderer.currentScene.addObject(terrain);

  let dragon = await parseGLBFromString(renderer.gl, dragonModel.data);

  // let tiger = await loadAndParseGLB(renderer, "objects/gltf/tiger2.glb");
  // tiger[0].transform.setLocalPosition([0, 0, 0]);
  // tiger[0].transform.setLocalScale([0.5, 0.5, 0.5]);

  let addedObjects = [];
  let animatedObjects = [];
  let currentSubdivisions = 0;
  let subdivisionData = cube(v0, v1, v2, v3, v4, v5, v6, v7, currentSubdivisions, false);
  let sphereData = cube(v0, v1, v2, v3, v4, v5, v6, v7, 4, false);

  let rock = await renderer.loadModel(await loadJson("objects/descriptions/rock_sphere.json"));
  rock.transform.setLocalScale([5, 5, 5]);
  //rock.transform.setLocalRotation([0, 0, -Math.PI/2]);
  //renderer.currentScene.addObject(rock);

  let chaikin_iterations = 0;
  lines = {};
  let playTime = 5;

  let light_positions = [
    [5, 3, 5],
    [5, 3, -5],
    [-5, 3, -5],
    [-5, 3, 5],
    [5, 3, 5],
    [5, 3, -5],
  ];

  let light2 = new Light(LightType.POINT, [9, 6, 7], [1, 1, 1], 400.0, 1.0, 0.09, 0.032);
  //renderer.addLight(light2);

  let light2Object = renderer.createObjectFromData(sphereData.pointsArray, sphereData.normalsArray, sphereData.texCoordArray, [], [light2.color[0] * 255, light2.color[1] * 255, light2.color[2] * 255, 255], "light 2 object", true, 40.0);
  light2Object.transform.setLocalScale([0.4, 0.4, 0.4]);
  //renderer.currentScene.addObject(light2Object);
  light2.addChild(light2Object);
  //light2.addChild(renderer.currentScene.camera);

  let light3 = new Light(LightType.SPOT, [-3, 9, 0], [1, 1, 1], 1.0, 1.0, 0.01, 0.0032, [1, 0, -0.02], Math.PI / 8, Math.PI / 6);
  let light4 = new Light(LightType.SPOT, [10, 18, -4], [1, 1, 1], 1.0, 1.0, 0.01, 0.0032, [0.01, -1, 0.01], Math.PI / 8, Math.PI / 6);
  let light5 = new Light(LightType.DIRECTIONAL, [0, 0, 0], [0.5, 0.5, 0.5], 20.0, 0, 0, 0, [1, 1, 1]);
  let light6 = new Light(LightType.DIRECTIONAL, [0, 0, 0], [0.5, 0.5, 0.5], 30.0, 0, 0, 0, [-1.0001, 1, -1.0001]);

  renderer.addLightToCurrentScene(light5);
  //renderer.addLight(light6);

  //lines[light1.localID] = setChaikin(light1, light_positions, 8, 3);
  //animatedObjects.push(light1);

  let light2ScaleObject = new SceneNode();
  light2ScaleObject.transform.setLocalScale([3, 3, 3]);
  light2ScaleObject.transform.setLocalPosition([0, 10, 0]);
  renderer.currentScene.addNode(light2ScaleObject);
  light2ScaleObject.addChild(light2);

  let ws = new WebSocket("ws://localhost:3000");

  ws.onopen = function () {
    console.log("WebSocket connection established");
    // ws.send('Hello Server!');
  };

  addedActors = {};
  ws.onmessage = function (event) {
    //console.log("Message from server ", event.data);
    let message = JSON.parse(event.data);

    //console.log("got command!");
    if (!message.player_id) {
      return;
    }
    //console.log("Parsing command");
    if (addedActors[message.player_id] == undefined) {
      let actor = dragon;
      actor.sceneRoot.transform.setLocalPosition([message.location.x, message.location.y, message.location.z]);
      actor.sceneRoot.transform.setLocalScale([10, 10, 10]);
      let copy = renderer.currentScene.appendScene(actor);
      addedActors[message.player_id] = copy;
      console.log("added actor");
    }
    else {
      addedActors[message.player_id].transform.setLocalPosition([message.location.x, message.location.y, message.location.z]);
      addedActors[message.player_id].transform.setLocalRotationFromQuaternion([message.rotation.x, message.rotation.y, message.rotation.z, message.rotation.w]);
    }
  };
  // update renderer with the received data

  setInterval(() => {
    const rot = renderer.currentScene.camera.transform.rot;
    const pos = renderer.currentScene.camera.transform.getGlobalPosition();
    const message = {
      command: "updatePosition",
      position: { x: pos[0], y: pos[1], z: pos[2] },
      rotation: { x: rot[0], y: rot[1], z: rot[2], w: rot[3] },
    };
    ws.send(JSON.stringify(message));
  }, 10);

  document.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "m") {
      renderer.forceWireframe = !renderer.forceWireframe;
    }
  });

  await createDebugQuad(renderer.gl);
  async function drawScene() {
    renderer.drawScene();
    requestAnimationFrame(drawScene);
  }
  requestAnimationFrame(drawScene);
}

main();
