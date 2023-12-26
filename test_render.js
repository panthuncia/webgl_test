var canvas = document.getElementById('webgl-canvas');
var gl = canvas.getContext('webgl');

// Vertex shader program
var vsSource = `#version 100
precision mediump float;
attribute vec3 a_position;
attribute vec3 a_normal;
attribute vec2 a_texCoord;

uniform mat4 u_modelViewMatrix; // Model-View matrix
uniform mat4 u_projectionMatrix; // Projection matrix
uniform mat3 u_normalMatrix; // Normal matrix (for transforming normals)

varying vec3 v_normal;
varying vec3 v_fragPos;
varying vec2 v_texCoord;

void main() {
    // Transform the position
    v_fragPos = vec3(u_modelViewMatrix * vec4(a_position, 1.0));

    // Transform the normal
    v_normal = u_normalMatrix * a_normal;

    //pass texcoord to fs
    v_texCoord = a_texCoord;

    // Set the position
    gl_Position = u_projectionMatrix * vec4(v_fragPos, 1.0);
}
`;

// Fragment shader program
var fsSource = `#version 100
precision mediump float;

varying vec3 v_normal;
varying vec3 v_fragPos;
varying vec2 v_texCoord;  // Received from vertex shader

uniform sampler2D u_baseColorTexture;
uniform sampler2D u_normalMap;

uniform vec3 u_lightPos; // Position of the light
uniform vec3 u_viewPos; // Position of the camera
uniform vec4 u_lightColor; // Color of the light
uniform vec4 u_objectColor; // Color of the object

void main() {
    vec4 baseColor = texture2D(u_baseColorTexture, v_texCoord);

    // Normalize the normal
    vec3 normal = normalize(v_normal + texture2D(u_normalMap, v_texCoord).rgb);

    // Calculate ambient light
    float ambientStrength = 0.1;
    vec4 ambient = ambientStrength * u_lightColor;

    // Calculate diffuse light
    vec3 lightDir = normalize(u_lightPos - v_fragPos);
    float diff = max(dot(normal, lightDir), 0.0);
    vec4 diffuse = diff * u_lightColor;

    // Calculate specular light
    float specularStrength = 0.5;
    vec3 viewDir = normalize(u_viewPos - v_fragPos);
    vec3 reflectDir = reflect(-lightDir, normal);
    float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);
    vec4 specular = specularStrength * spec * u_lightColor;

    // Combine results
    vec4 color = (ambient + diffuse + specular) * baseColor;
    
    gl_FragColor = color;
}
`;

class Mesh {
    constructor(vertices, normals, texcoords, indices = null) {
        this.vertices = vertices;
        this.normals = normals;
        this.indices = indices;
        this.vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

        this.normalBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);

        this.texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texcoords), gl.STATIC_DRAW);

        if (indices != null){
            this.indexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
        }
      }
}
class RenderableObject {
    constructor(meshes, shaderProgram, texture, normal){
        this.shaderProgram = shaderProgram;
        this.meshes = meshes;
        this.modelMatrix = mat4.create();
        this.texture = texture;
        this.normal = normal
    }
}

//https://webglfundamentals.org/webgl/lessons/webgl-load-obj.html
function parseOBJ(text) {
    // because indices are base 1 let's just fill in the 0th data
    const objPositions = [[0, 0, 0]];
    const objTexcoords = [[0, 0]];
    const objNormals = [[0, 0, 0]];
  
    // same order as `f` indices
    const objVertexData = [
      objPositions,
      objTexcoords,
      objNormals,
    ];
  
    // same order as `f` indices
    let webglVertexData = [
      [],   // positions
      [],   // texcoords
      [],   // normals
    ];
  
    const materialLibs = [];
    const geometries = [];
    let geometry;
    let groups = ['default'];
    let material = 'default';
    let object = 'default';
  
    const noop = () => {};
  
    function newGeometry() {
      // If there is an existing geometry and it's
      // not empty then start a new one.
      if (geometry && geometry.data.position.length) {
        geometry = undefined;
      }
    }
  
    function setGeometry() {
      if (!geometry) {
        const position = [];
        const texcoord = [];
        const normal = [];
        webglVertexData = [
          position,
          texcoord,
          normal,
        ];
        geometry = {
          object,
          groups,
          material,
          data: {
            position,
            texcoord,
            normal,
          },
        };
        geometries.push(geometry);
      }
    }
  
    function addVertex(vert) {
      const ptn = vert.split('/');
      ptn.forEach((objIndexStr, i) => {
        if (!objIndexStr) {
          return;
        }
        const objIndex = parseInt(objIndexStr);
        const index = objIndex + (objIndex >= 0 ? 0 : objVertexData[i].length);
        webglVertexData[i].push(...objVertexData[i][index]);
      });
    }
  
    const keywords = {
      v(parts) {
        objPositions.push(parts.map(parseFloat));
      },
      vn(parts) {
        objNormals.push(parts.map(parseFloat));
      },
      vt(parts) {
        // should check for missing v and extra w?
        objTexcoords.push(parts.map(parseFloat));
      },
      f(parts) {
        setGeometry();
        const numTriangles = parts.length - 2;
        for (let tri = 0; tri < numTriangles; ++tri) {
          addVertex(parts[0]);
          addVertex(parts[tri + 1]);
          addVertex(parts[tri + 2]);
        }
      },
      s: noop,    // smoothing group
      mtllib(parts, unparsedArgs) {
        // the spec says there can be multiple filenames here
        // but many exist with spaces in a single filename
        materialLibs.push(unparsedArgs);
      },
      usemtl(parts, unparsedArgs) {
        material = unparsedArgs;
        newGeometry();
      },
      g(parts) {
        groups = parts;
        newGeometry();
      },
      o(parts, unparsedArgs) {
        object = unparsedArgs;
        newGeometry();
      },
    };
  
    const keywordRE = /(\w*)(?: )*(.*)/;
    const lines = text.split('\n');
    for (let lineNo = 0; lineNo < lines.length; ++lineNo) {
      const line = lines[lineNo].trim();
      if (line === '' || line.startsWith('#')) {
        continue;
      }
      const m = keywordRE.exec(line);
      if (!m) {
        continue;
      }
      const [, keyword, unparsedArgs] = m;
      const parts = line.split(/\s+/).slice(1);
      const handler = keywords[keyword];
      if (!handler) {
        console.warn('unhandled keyword:', keyword);  // eslint-disable-line no-console
        continue;
      }
      handler(parts, unparsedArgs);
    }
  
    // remove any arrays that have no entries.
    for (const geometry of geometries) {
      geometry.data = Object.fromEntries(
          Object.entries(geometry.data).filter(([, array]) => array.length > 0));
    }
  
    return {
      geometries,
      materialLibs,
    };
  }

function compileShader(gl, shaderSource, shaderType) {
    const shader = gl.createShader(shaderType);
    gl.shaderSource(shader, shaderSource);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(shader);
        console.error('An error occurred compiling the shader: ' + info);
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}

// Initialize shaders
let vertexShader = compileShader(gl, vsSource, gl.VERTEX_SHADER);
let fragmentShader = compileShader(gl, fsSource, gl.FRAGMENT_SHADER);

var shaderProgram = gl.createProgram();
gl.attachShader(shaderProgram, vertexShader);
gl.attachShader(shaderProgram, fragmentShader);
gl.linkProgram(shaderProgram);

var programInfo = {
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
        objectColor: gl.getUniformLocation(shaderProgram, 'u_objectColor'),
        objectTexture: gl.getUniformLocation(shaderProgram, 'u_baseColorTexture'),
        normalTexture: gl.getUniformLocation(shaderProgram, 'u_normalMap')
    },
    viewMatrix: mat4.create(),
    projectionMatrix: mat4.create()
};

var mouseDown = false;
var lastMouseX = null;
var lastMouseY = null;

// Camera control parameters
var horizontalAngle = Math.PI/2;
var verticalAngle = Math.PI/2;
var distanceFromOrigin = 5; // Adjust as necessary

// Event listeners
canvas.onmousedown = function(event) {
    mouseDown = true;
    lastMouseX = event.clientX;
    lastMouseY = event.clientY;
};

document.onmouseup = function(event) {
    mouseDown = false;
};

document.onmousemove = function(event) {
    if (!mouseDown) {
        return;
    }
    var newX = event.clientX;
    var newY = event.clientY;

    var deltaX = newX - lastMouseX;
    var deltaY = newY - lastMouseY;

    horizontalAngle += deltaX * 0.005; // Adjust sensitivity
    verticalAngle -= deltaY * 0.005; // Adjust sensitivity
    //console.log(verticalAngle)
    if (verticalAngle<0.0000001){
      verticalAngle=0.0000001
    }
    if(verticalAngle>Math.PI){
      verticalAngle=Math.PI
    }

    updateCamera();
    
    lastMouseX = newX;
    lastMouseY = newY;
};

// Scroll wheel event listener
canvas.addEventListener('wheel', function(event) {
    // Determine the direction of scrolling (normalize across different browsers)
    var delta = Math.sign(event.deltaY);

    // Adjust zoom level
    distanceFromOrigin += delta * 0.5; // Adjust zoom speed as necessary
    distanceFromOrigin = Math.max(0.1, distanceFromOrigin); // Prevents zooming too close, adjust as necessary

    // Update camera
    updateCamera();
});

function updateCamera() {
    // Ensure the vertical angle is within limits
    verticalAngle = Math.max(0, Math.min(Math.PI, verticalAngle));

    // Calculate camera position using spherical coordinates
    var x = distanceFromOrigin * Math.sin(verticalAngle) * Math.cos(horizontalAngle);
    var y = distanceFromOrigin * Math.cos(verticalAngle);
    var z = distanceFromOrigin * Math.sin(verticalAngle) * Math.sin(horizontalAngle);

    // Update view matrix
    mat4.lookAt(programInfo.viewMatrix, [x, y, z], [0, 0, 0], [0, 1, 0]); // Adjust up vector as needed
}

var currentScene = {

}

function calculateNormalMatrix(modelViewMatrix){
  // Create a new 3x3 matrix as a subset of the model-view matrix
  var normalMatrix = mat3.create(); // Using glMatrix library for matrix operations
  mat3.fromMat4(normalMatrix, modelViewMatrix); // Extract the upper-left 3x3 part

  // Invert and transpose the matrix
  mat3.invert(normalMatrix, normalMatrix);
  mat3.transpose(normalMatrix, normalMatrix);

  return normalMatrix;
}

function drawScene(){
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    for(const object of currentScene.objects){
        gl.useProgram(object.shaderProgram)
        
        gl.uniform3f(programInfo.uniformLocations.lightPos, 0, 10, 0);
        gl.uniform3f(programInfo.uniformLocations.viewPos, 0, 0, 0);
        gl.uniform4f(programInfo.uniformLocations.lightColor, 1, 1, 1, 1); //white
        gl.uniform4f(programInfo.uniformLocations.objectColor, 0, 0, 1, 1); //blue
        let modelViewMatrix = mat4.create();
        mat4.multiply(modelViewMatrix, programInfo.viewMatrix, object.modelMatrix);
        
        gl.uniformMatrix4fv(programInfo.uniformLocations.modelViewMatrix, false, modelViewMatrix);
        gl.uniformMatrix4fv(
            programInfo.uniformLocations.projectionMatrix,
            false,
            programInfo.projectionMatrix);
        let normalMatrix = calculateNormalMatrix(modelViewMatrix);
        gl.uniformMatrix3fv(programInfo.uniformLocations.normalMatrix, false, normalMatrix);
        
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
            gl.activeTexture(gl.TEXTURE0); // e.g., gl.TEXTURE0
            gl.bindTexture(gl.TEXTURE_2D, object.texture);
            gl.uniform1i(programInfo.uniformLocations.objectTexture, 0);
            //normal texture
            gl.activeTexture(gl.TEXTURE1); // e.g., gl.TEXTURE0
            gl.bindTexture(gl.TEXTURE_2D, object.normal);
            gl.uniform1i(programInfo.uniformLocations.normalTexture, 1);

            gl.drawArrays(gl.TRIANGLES, 0, mesh.vertices.length/3);
        }
        //console.log("done with object")
    }
    updateCamera();
    requestAnimationFrame(drawScene);
}

async function getObj(filename){
  return await fetch(filename)
    .then(response => response.text())
    .then(data => {
        console.log("found file")
        return parseOBJ(data)
    })
}

function getRenderableFromData(data, texture = null, normal=null){
  meshes = []
    for(const geometry of data.geometries){
        meshes.push(new Mesh(geometry.data.position, geometry.data.normal, geometry.data.texcoord));
    }
    return new RenderableObject(meshes, programInfo.program, texture, normal);
}

async function loadTexture(url) {
  const response = await fetch(url);
  const blob = await response.blob();
  return createImageBitmap(blob);
}

function createWebGLTexture(gl, image) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Set the parameters so we can render any size image
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  // Upload the image into the texture
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  return texture;
}

async function main(){
    let fieldOfView = 45 * Math.PI / 180; // in radians
    let aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    let zNear = 0.1;
    let zFar = 100.0;
    let projectionMatrix = mat4.create();
    mat4.perspective(projectionMatrix, fieldOfView, aspect, zNear, zFar);
    programInfo.projectionMatrix = projectionMatrix

    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);

    let houseImage = await(loadTexture("textures/Cottage_Clean_Base_Color.png"));
    let houseTexture = createWebGLTexture(gl, houseImage);

    let houseNormalImage = await(loadTexture("textures/Cottage_Clean_Normal.png"));
    let houseNormalTexture = createWebGLTexture(gl, houseNormalImage);

    let dragonData = await(getObj('cottage_FREE.obj'));
    console.log(dragonData);
    let dragonObject = getRenderableFromData(dragonData, houseTexture, houseNormalTexture);

    
    let sphereData = await(getObj('sphere.obj'));
    let sphereObject = getRenderableFromData(sphereData);

    mat4.translate(sphereObject.modelMatrix, sphereObject.modelMatrix, [0.0, 10.0, 0.0])
    mat4.scale(sphereObject.modelMatrix, sphereObject.modelMatrix, vec3.fromValues(.1, .1, .1))

    currentScene.objects = [dragonObject, sphereObject];

    requestAnimationFrame(drawScene)
}

main()