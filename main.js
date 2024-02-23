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

var v0 = normalize([-1.0, -1.0,  1.0, 1], true);
var v1 = normalize([1.0, -1.0,  1.0, 1], true);
var v2 = normalize([1.0,  1.0,  1.0, 1], true);
var v3 = normalize([-1.0,  1.0,  1.0, 1], true);
var v4 = normalize([-1.0, -1.0, -1.0, 1], true);
var v5 = normalize([1.0, -1.0, -1.0, 1], true);
var v6 = normalize([1.0,  1.0, -1.0, 1], true);
var v7 = normalize([-1.0,  1.0, -1.0, 1], true);

async function main() {

  //let meshes = await loadAndParseGLB("objects/gltf/car.glb");
  let renderer = new WebGLRenderer("webgl-canvas");
  let nodes = await loadAndParseGLTF(renderer, "objects/gltf/dragon", "scene.gltf");
  console.log(nodes);
  nodes[0].transform.setLocalPosition([0, 0, 0]);
  // nodes[0].transform.setLocalRotationFromEuler([-Math.PI/2, 0, 0]);
  //nodes[0].transform.setLocalScale([0.01, 0.01, 0.01]);
  //nodes[0].transform.setLocalScale([0.1, 0.1, 0.1]);
  nodes[0].transform.setLocalScale([5, 5, 5]);
  nodes[0].transform.setLocalScale([40, 40, 40]);
  //nodes[0].transform.setLocalScale([100, 100, 100]);


  //nodes[0].transform.setLocalScale([100, 100, 100]);
  //renderer.removeObjectByName("Plane.035__0");

  //let terrain = await renderer.loadModel(await (loadJson("objects/descriptions/ground.json")));
  //renderer.addObject(terrain)

  let addedObjects = [];
  let animatedObjects = [];
  let currentSubdivisions = 0;
  let subdivisionData = cube(v0, v1, v2, v3, v4, v5, v6, v7, currentSubdivisions, false);
  let sphereData = cube(v0, v1, v2, v3, v4, v5, v6, v7, 4, false);

  let rock = await (renderer.loadModel(await (loadJson("objects/descriptions/rock_sphere.json"))));
  rock.transform.setLocalScale([5, 5, 5]);
  //rock.transform.setLocalRotation([0, 0, -Math.PI/2]);
  //renderer.addObject(rock);

  let aTrans = new Transform;
  aTrans.setLocalPosition([10, 0, 0]);
  aTrans.setLocalRotationFromEuler([0, Math.PI/4, 0]);
  let bTrans = new Transform;
  bTrans.setLocalPosition([0, 5, 0]);
  let aMat = aTrans.getLocalModelMatrix();
  bTrans.computeModelMatrixFromParent(aMat);


  let chaikin_iterations = 0;
  lines = {};
  let playTime = 5;

  let light_positions = [[5, 3, 5],
  [5, 3, -5],
  [-5, 3, -5],
  [-5, 3, 5 ],
  [5, 3, 5],
  [5, 3, -5]];

  let light2 = new Light(LightType.POINT, [9, 6, 7], [1, 1, 1], 400.0, 1.0, 0.09, 0.032);
  //renderer.addLight(light2);

  let light2Object = renderer.createObjectFromData(sphereData.pointsArray, sphereData.normalsArray, sphereData.texCoordArray, [], [light2.color[0]*255, light2.color[1]*255, light2.color[2]*255, 255], "light 2 object", true, 40.0);
  light2Object.transform.setLocalScale([0.4, 0.4, 0.4]);
  renderer.addObject(light2Object);
  light2.addChild(light2Object);
  //light2.addChild(renderer.currentScene.camera);


  let light3 = new Light(LightType.SPOT, [-3, 9, 0], [1, 1, 1], 1.0, 1.0, 0.01, 0.0032, [1, 0, -0.02], Math.PI / 8, Math.PI / 6);
  let light4 = new Light(LightType.SPOT, [10, 18, -4], [1, 1, 1], 1.0, 1.0, 0.01, 0.0032, [0.01, -1, 0.01], Math.PI / 8, Math.PI / 6);
  let light5 = new Light(LightType.DIRECTIONAL, [0,0,0], [0.5,0.5,0.5], 400.0, 0, 0, 0, [1, 1, 1]);
  let light6 = new Light(LightType.DIRECTIONAL, [0,0,0], [0.5,0.5,0.5], 30.0, 0, 0, 0, [-1.0001, 1, -1.0001]);

  renderer.addLight(light5);
  //renderer.addLight(light6);

  //lines[light1.localID] = setChaikin(light1, light_positions, 8, 3);
  //animatedObjects.push(light1);

  let light2ScaleObject = new SceneNode();
  light2ScaleObject.transform.setLocalScale([3, 3, 3]);
  light2ScaleObject.transform.setLocalPosition([0, 10, 0]);
  renderer.addNode(light2ScaleObject);
  light2ScaleObject.addChild(light2);




  document.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'm') {
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

main()