var mouseDown = false;
var lastMouseX = null;
var lastMouseY = null;

// Camera control parameters
var horizontalAngle = Math.PI/2;
var verticalAngle = Math.PI/2;
var distanceFromOrigin = 40; // Adjust as necessary

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
    distanceFromOrigin += delta * 5; // Adjust zoom speed as necessary
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

    currentScene.camera.position[0] = x;
    currentScene.camera.position[1] = y;
    currentScene.camera.position[2] = z;

    // Update view matrix
    
    mat4.lookAt(globalMatrices.viewMatrix, [x, y, z], [0, 0, 0], [0, 1, 0]); // Adjust up vector as needed
    mat4.invert(globalMatrices.viewMatrixInverse, globalMatrices.viewMatrix);
}