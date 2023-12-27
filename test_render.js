async function createProgram(vsPath, fsPath){
  let fsSource = await(loadText(fsPath));
  let vsSource = await(loadText(vsPath));

  let vertexShader = compileShader(gl, vsSource, gl.VERTEX_SHADER);
  let fragmentShader = compileShader(gl, fsSource, gl.FRAGMENT_SHADER);

  let shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);
  programInfo = {
    program: shaderProgram,
    attribLocations: {
        vertexPosition: gl.getAttribLocation(shaderProgram, 'a_position'),
        vertexNormal: gl.getAttribLocation(shaderProgram, 'a_normal'),
        texCoord: gl.getAttribLocation(shaderProgram, 'a_texCoord')
    },
    uniformLocations: {
        projectionMatrix: gl.getUniformLocation(shaderProgram, 'u_projectionMatrix'),
        modelViewMatrix: gl.getUniformLocation(shaderProgram, 'u_modelViewMatrix'),
        normalMatrix: gl.getUniformLocation(shaderProgram, 'u_normalMatrix'),
        lightPos: gl.getUniformLocation(shaderProgram, 'u_lightPos'),
        viewPos: gl.getUniformLocation(shaderProgram, 'u_viewPos'),
        lightColor: gl.getUniformLocation(shaderProgram, 'u_lightColor'),
        objectTexture: gl.getUniformLocation(shaderProgram, 'u_baseColorTexture'),
        normalTexture: gl.getUniformLocation(shaderProgram, 'u_normalMap'),
        aoTexture: gl.getUniformLocation(shaderProgram, 'u_aoMap'),
        heightMap: gl.getUniformLocation(shaderProgram, 'u_heightMap')
    },
  }
  return programInfo;
}

var globalMatrices = {
    viewMatrix: mat4.create(),
    projectionMatrix: mat4.create()
};

var currentScene = {

}

function drawScene(){
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    for(const object of currentScene.objects){
        programInfo = object.programInfo
        gl.useProgram(programInfo.program)
        
        gl.uniform3f(programInfo.uniformLocations.lightPos, 0, 10, 0);
        gl.uniform3f(programInfo.uniformLocations.viewPos, 0, 0, 0);
        gl.uniform4f(programInfo.uniformLocations.lightColor, 1, 1, 1, 1); //white
        gl.uniform4f(programInfo.uniformLocations.objectColor, 0, 0, 1, 1); //blue
        let modelViewMatrix = mat4.create();
        mat4.multiply(modelViewMatrix, globalMatrices.viewMatrix, object.modelMatrix);
        
        gl.uniformMatrix4fv(programInfo.uniformLocations.modelViewMatrix, false, modelViewMatrix);
        gl.uniformMatrix4fv(
            programInfo.uniformLocations.projectionMatrix,
            false,
            globalMatrices.projectionMatrix);
        let normalMatrix = calculateNormalMatrix(modelViewMatrix);
        gl.uniformMatrix3fv(programInfo.uniformLocations.normalMatrix, false, normalMatrix);
        let i=0;
        for(const mesh of object.meshes){
            //vertices
            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vertexBuffer);
            gl.vertexAttribPointer(programInfo.attribLocations.vertexPosition, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(programInfo.attribLocations.vertexPosition);
            //normals
            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.normalBuffer);
            gl.vertexAttribPointer(programInfo.attribLocations.vertexNormal, 3, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(programInfo.attribLocations.vertexNormal);
            //texcoords
            gl.bindBuffer(gl.ARRAY_BUFFER, mesh.texCoordBuffer);
            gl.vertexAttribPointer(programInfo.attribLocations.texCoord, 2, gl.FLOAT, false, 0, 0);
            gl.enableVertexAttribArray(programInfo.attribLocations.texCoord);
            //base texture
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, object.textures[i]);
            gl.uniform1i(programInfo.uniformLocations.objectTexture, 0);
            //normal texture
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, object.normals[i]);
            gl.uniform1i(programInfo.uniformLocations.normalTexture, 1);
            //ao texture
            gl.activeTexture(gl.TEXTURE2);
            gl.bindTexture(gl.TEXTURE_2D, object.aoMaps[i]);
            gl.uniform1i(programInfo.uniformLocations.aoTexture, 2);
            //height texture
            gl.activeTexture(gl.TEXTURE3);
            gl.bindTexture(gl.TEXTURE_2D, object.heightMaps[i]);
            gl.uniform1i(programInfo.uniformLocations.heightMap, 3);


            gl.drawArrays(gl.TRIANGLES, 0, mesh.vertices.length/3);

            i+=1;
        }
        //console.log("done with object")
    }
    updateCamera();
    requestAnimationFrame(drawScene);
}

async function main(){

    let programInfo = await createProgram("shaders/vertex.glsl", "shaders/fragment.glsl");

    let fieldOfView = 45 * Math.PI / 180; // in radians
    let aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    let zNear = 0.1;
    let zFar = 100.0;
    let projectionMatrix = mat4.create();
    mat4.perspective(projectionMatrix, fieldOfView, aspect, zNear, zFar);
    globalMatrices.projectionMatrix = projectionMatrix

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);

    let textures = []
    let normals = []
    let aoMaps = []
    let heightMaps = []

    let houseImage = await(loadTexture("textures/Cottage_Clean_Base_Color.png"));
    let houseTexture = createWebGLTexture(gl, houseImage);
    textures.push(houseTexture);

    let houseNormalImage = await(loadTexture("textures/Cottage_Clean_Normal.png"));
    let houseNormalTexture = createWebGLTexture(gl, houseNormalImage);
    normals.push(houseNormalTexture);

    let houseAoImage = await(loadTexture("textures/Cottage_Clean_AO.png"));
    let houseAoTexture = createWebGLTexture(gl, houseAoImage);
    aoMaps.push(houseAoTexture);

    let heightMapImage = await loadTexture("textures/Cottage_Clean_Height.png");
    let heightMapTexture = createWebGLTexture(gl, heightMapImage);
    heightMaps.push(heightMapTexture);

    let mainData = await(getObj('objects/Cottage_FREE.obj'));
    console.log(mainData);
    let mainObject = createRenderable(mainData, programInfo, textures, normals, aoMaps, heightMaps);

    
    let sphereData = await(getObj('objects/sphere.obj'));
    let sphereObject = createRenderable(sphereData, programInfo);

    mat4.translate(sphereObject.modelMatrix, sphereObject.modelMatrix, [0.0, 10.0, 0.0])
    mat4.scale(sphereObject.modelMatrix, sphereObject.modelMatrix, vec3.fromValues(.1, .1, .1))

    currentScene.objects = [mainObject, sphereObject];

    requestAnimationFrame(drawScene)
}

main()