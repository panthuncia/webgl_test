var debugTriangle = {

}
function drawDebugTriangle(gl){
     gl.useProgram(debugTriangle.shaderProgram);

     const vertices = new Float32Array([
         0.0,  1.0,
        -1.0, -1.0,
         1.0, -1.0
     ]);

     const vertexBuffer = gl.createBuffer();
     gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
     gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

     const posAttribLocation = gl.getAttribLocation(debugTriangle.shaderProgram, 'aVertexPosition');
     gl.enableVertexAttribArray(posAttribLocation);
     gl.vertexAttribPointer(posAttribLocation, 2, gl.FLOAT, false, 0, 0);

     gl.clearColor(0.0, 0.0, 0.0, 1.0);
     gl.clear(gl.COLOR_BUFFER_BIT);

     gl.drawArrays(gl.TRIANGLES, 0, 3);
}
function createDebugTriangle(gl){
 const vsSource = `#version 300 es
 in vec4 aVertexPosition;
 void main() {
     gl_Position = aVertexPosition;
 }
`;

const fsSource = `#version 300 es
 precision highp float;
 out vec4 fragColor;
 void main() {
     fragColor = vec4(1.0, 0.5, 0.0, 1.0); // Orange color
 }
`;
        const vertexShader = compileShader(gl, vsSource, gl.VERTEX_SHADER);
        const fragmentShader = compileShader(gl, fsSource, gl.FRAGMENT_SHADER);
        debugTriangle.shaderProgram = gl.createProgram();
        gl.attachShader(debugTriangle.shaderProgram, vertexShader);
        gl.attachShader(debugTriangle.shaderProgram, fragmentShader);
        gl.linkProgram(debugTriangle.shaderProgram);
        if (!gl.getProgramParameter(debugTriangle.shaderProgram, gl.LINK_STATUS)) {
            alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(debugTriangle.shaderProgram));
            return;
        }
}