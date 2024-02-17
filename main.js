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

  let renderer = new WebGLRenderer("webgl-canvas");

  let addedObjects = [];
  let animatedObjects = [];
  let currentSubdivisions = 0;
  let subdivisionData = cube(v0, v1, v2, v3, v4, v5, v6, v7, currentSubdivisions, false);
  let sphereData = cube(v0, v1, v2, v3, v4, v5, v6, v7, 4, false);

  //let terrain = await (renderer.loadModel(await (loadJson("objects/descriptions/ground.json"))));
  //terrain.transform.setLocalScale([2, 2, 2])
  //renderer.addObject(terrain);
  let rock = await (renderer.loadModel(await (loadJson("objects/descriptions/rock_sphere.json"))));
  rock.transform.setLocalScale([5, 5, 5]);
  //rock.transform.setLocalRotation([0, 0, -Math.PI/2]);
  renderer.addObject(rock);


  let mainObject = renderer.createObjectFromData(subdivisionData.pointsArray, subdivisionData.normalsArray, subdivisionData.texCoordArray, [58, 58, 47, 255]);
  //objectID = renderer.addObject(mainObject);

  mainObject.transform.setLocalScale([3, 3, 3]);
  let playTime = 3;
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
  let chaikin_iterations = 0;
  lines = {}
  //lines[mainObject.localID] = setChaikin(mainObject, original_positions, chaikin_iterations, playTime);
  mainObject.animationController.pause();
  animatedObjects.push(mainObject);

  let light_positions = [[5, 3, 5],
  [5, 3, -5],
  [-5, 3, -5],
  [-5, 3, 5 ],
  [5, 3, 5],
  [5, 3, -5]];

  let light1 = new Light(LightType.POINT, [10, 10, -5], [0, 1, 0], 0.0, 1.0, 0.09, 0.032);
  //renderer.addLight(light1);
  let light1Object = renderer.createObjectFromData(sphereData.pointsArray, sphereData.normalsArray, sphereData.texCoordArray, [light1.color[0]*255, light1.color[1]*255, light1.color[2]*255, 255], true, 40.0);
  light1Object.transform.setLocalScale([0.4, 0.4, 0.4]);
  //renderer.addObject(light1Object);
  light1.addChild(light1Object);

  let light2 = new Light(LightType.POINT, [9, 6, 7], [1, 1, 1], 40.0, 1.0, 0.09, 0.032);
  renderer.addLight(light2);
  let light2Object = renderer.createObjectFromData(sphereData.pointsArray, sphereData.normalsArray, sphereData.texCoordArray, [light2.color[0]*255, light2.color[1]*255, light2.color[2]*255, 255], true, 40.0);
  light2Object.transform.setLocalScale([0.4, 0.4, 0.4]);
  renderer.addObject(light2Object);
  light2.addChild(light2Object);


  let light3 = new Light(LightType.SPOT, [-3, 9, 0], [1, 1, 1], 1.0, 1.0, 0.01, 0.0032, [1, 0, -0.02], Math.PI / 8, Math.PI / 6);
  let light4 = new Light(LightType.SPOT, [10, 18, -4], [1, 1, 1], 1.0, 1.0, 0.01, 0.0032, [0.01, -1, 0.01], Math.PI / 8, Math.PI / 6);
  let light5 = new Light(LightType.DIRECTIONAL, [0,0,0], [0.5,0.5,0.5], 10.0, 0, 0, 0, [1, 1, 1]);
  let light6 = new Light(LightType.DIRECTIONAL, [0,0,0], [0.5,0.5,0.5], 30.0, 0, 0, 0, [-1.0001, 1, -1.0001]);

  //renderer.addLight(light5);
  //renderer.addLight(light6);

  //lines[light1.localID] = setChaikin(light1, light_positions, 8, 3);
  //animatedObjects.push(light1);
  light1.animationController.pause();

  mainObject.addChild(light1);

  let light2ScaleObject = new SceneNode();
  light2ScaleObject.transform.setLocalScale([3, 3, 3]);
  renderer.addNode(light2ScaleObject);
  light2ScaleObject.addChild(light2);

  lines[light2.localID] = setChaikin(light2, light_positions, 8, playTime);
  animatedObjects.push(light2)
  light2.animationController.pause();

  let playing = false;
  let newellMethod = false;
  function setChaikin(object, points, amount, playTime){
      let positions = chaikin(points, amount);
      let newAnimation = new AnimationClip();
      newAnimation.addPositionKeyframe(0, new Transform(positions[0]));
      for (let i=1; i<positions.length-1; i++){
        newAnimation.addPositionKeyframe(playTime/(positions.length-1), new Transform(positions[i]));
      }
      object.animationController.setAnimationClip(newAnimation);
      return linesFromPositions(positions);
  }

  function changeSphereSubdivision(amount){
    currentSubdivisions+=amount;
    if (currentSubdivisions>5){
      currentSubdivisions = 5;
      return;
    }
    if (currentSubdivisions<0){
      currentSubdivisions = 0;
      return;
    }
    let newData = cube(v0, v1, v2, v3, v4, v5, v6, v7, currentSubdivisions, newellMethod);
    subdivisionData = newData;
    renderer.setObjectData(mainObject, newData.pointsArray, newData.normalsArray, newData.texCoordArray);
    for (let object of addedObjects){
      renderer.setObjectData(object, newData.pointsArray, newData.normalsArray, newData.texCoordArray);
    }
  }

  function toggleAnimation(){
    if(!playing){
      for (let anim of animatedObjects){
        anim.animationController.unpause();
      }
      //mainObject.animationController.unpause();
      playing = true;
    } else {
      for (let anim of animatedObjects){
        anim.animationController.pause();
      }
      playing = false;
    }
  }
  playtimes = {}
  function addNewCube(){
    let color = generateStrongColor();
    let object = renderer.createObjectFromData(subdivisionData.pointsArray, subdivisionData.normalsArray, subdivisionData.texCoordArray, [color.r, color.g, color.b, 255]);
    renderer.addObject(object);
    let thisPlaytime = Math.random()*15+8;
    playtimes[object.localID] = thisPlaytime;
    setChaikin(object, original_positions, chaikin_iterations, thisPlaytime);
    animatedObjects.push(object);
    addedObjects.push(object);
  }

  function addRandomLight(){
    if(renderer.currentScene.numLights>=renderer.MAX_POINT_LIGHTS){
      console.log("Reached max number of lights");
      return;
    }
    let color = generateStrongColor();
    let light = new Light(LightType.POINT, [0, 0, 0], [color.r/255, color.g/255, color.b/255], 30.0, 1.0, 0.09, 0.032);
    renderer.addLight(light);
    let lightTransformObject = new SceneNode();
    lightTransformObject.transform.setLocalScale([3, 3, 3]);
    
    let x = getRandomInt(40)-20;
    let y = getRandomInt(40)-20;
    let z = getRandomInt(40)-20;
    lightTransformObject.transform.setLocalPosition([x, y, z]);

    let eulx = getRandomInt(360)*(Math.PI/180);
    let euly = getRandomInt(360)*(Math.PI/180);
    let eulz = getRandomInt(360)*(Math.PI/180);
    lightTransformObject.transform.setLocalRotation([eulx, euly, eulz]);

    let lightObject = renderer.createObjectFromData(sphereData.pointsArray, sphereData.normalsArray, sphereData.texCoordArray, [light.color[0]*255, light.color[1]*255, light.color[2]*255, 255], true, 40.0);
    lightObject.transform.setLocalScale([0.4, 0.4, 0.4]);
    renderer.addObject(lightObject);
    light.addChild(lightObject);

    renderer.addNode(lightTransformObject);
    lightTransformObject.addChild(light);
    let time = getRandomInt(10)+5;
    setChaikin(light, light_positions, 8, time);
    animatedObjects.push(light);
    if(!playing){
      light.animationController.pause();
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
      chaikin_iterations++
      if(chaikin_iterations>8){
        chaikin_iterations = 8;
        return;
      }
      lines[mainObject.localID] = setChaikin(mainObject, original_positions, chaikin_iterations, playTime);
      for (let object of addedObjects){
        setChaikin(object, original_positions, chaikin_iterations, playtimes[object.localID]);
      }
    }else if (event.key.toLowerCase() === 'j'){
      chaikin_iterations--;
      if(chaikin_iterations<0){
        chaikin_iterations = 0;
        return;
      }
      lines[mainObject.localID] = setChaikin(mainObject, original_positions, chaikin_iterations, playTime);
      for (let object of addedObjects){
        setChaikin(object, original_positions, chaikin_iterations, playtimes[object.localID]);
      }
    }else if (event.key.toLowerCase() === 'q'){
      changeSphereSubdivision(-1);
    }else if (event.key.toLowerCase() === 'e'){
      changeSphereSubdivision(1);
    }else if (event.key.toLowerCase() === 'a'){
      toggleAnimation();
    } else if (event.key.toLowerCase() === 'n'){
      newellMethod = !newellMethod;
      // Rebuild sphere
      changeSphereSubdivision(0);
    } else if (event.key.toLowerCase() === 'z') {
      addRandomLight();
    } else if (event.key.toLowerCase() === 'x') {
      addNewCube();
    }
  });
  
  let lastTime = new Date().getTime() / 1000;
  await createDebugQuad(renderer.gl);
  async function drawScene() {
    let currentTime = new Date().getTime() / 1000;
    let elapsed = currentTime - lastTime;
    lastTime = currentTime;
    for (let anim of animatedObjects){
      anim.animationController.update(elapsed);
    }
    
    renderer.drawScene();
    for (let key in lines){
      let object = renderer.getEntityById(key);
      renderer.drawLines(lines[key], object.parent.transform.modelMatrix);
    }
    requestAnimationFrame(drawScene);
  }
  requestAnimationFrame(drawScene);
}

main()