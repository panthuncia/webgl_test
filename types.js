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
  constructor(meshes, shaderVariant, textures, normals, aoMaps, heightMaps){
    this.shaderVariant = shaderVariant;
    this.meshes = meshes;
    this.modelMatrix = mat4.create();
    this.textures = [];
    this.normals = [];
    this.aoMaps = [];
    this.heightMaps = [];
    for (let i=0; i<meshes.length; i++){
      if(textures.length>=i+1){
          this.textures.push(textures[i]);
      }
      else{
        this.textures.push(null);
      }
      if(normals.length>=i+1){
        this.normals.push(normals[i]);
      }
      else{
        this.normals.push(null);
      }
      if(aoMaps.length>=i+1){
        this.aoMaps.push(aoMaps[i]);
      }
      else{
        this.aoMaps.push(null);
      }
      if(heightMaps.length >= i + 1){
          this.heightMaps.push(heightMaps[i]);
      } else {
          this.heightMaps.push(null);
      }
    }
  }
}