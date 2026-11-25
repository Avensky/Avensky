attribute vec3 position;
attribute vec3 normal;
attribute vec2 uv;
attribute float material;
uniform vec3 eye, right, up, forward;
uniform vec2 focal;
varying vec3 world, face;
varying vec2 tex;
varying float kind;
void main() {
  vec3 ray = position - eye;
  float depth = dot(ray,forward);
  gl_Position = vec4(dot(ray,right)*focal.x, dot(ray,up)*focal.y, 1.001*depth-.35, depth);
  world=position; face=normal; tex=uv; kind=material;
}
