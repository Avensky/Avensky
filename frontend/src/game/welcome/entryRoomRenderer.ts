import { entryRoomGeometry } from "./entryRoomGeometry";
import fragmentSource from "./entryRoom.frag?raw";
import vertexSource from "./entryRoom.vert?raw";

type V3 = [number, number, number];
function unit(v: V3): V3 {
  const length = Math.hypot(...v);
  return [v[0] / length, v[1] / length, v[2] / length];
}
function rgb(value: string, fallback: string): V3 {
  const hex = /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : fallback;
  return [parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255];
}

// Static architecture needs two draws per change and no animation loop.
export function createEntryRoomRenderer(canvas: HTMLCanvasElement, finish: HTMLImageElement | null) {
  const gl = canvas.getContext("webgl", {
    alpha: false, antialias: true, depth: true,
    powerPreference: "low-power", preserveDrawingBuffer: false
  });
  if (!gl) return null;
  const program = gl.createProgram()!;
  for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]] as const) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source); gl.compileShader(shader); gl.attachShader(program, shader); gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }
  gl.useProgram(program);
  const mesh = entryRoomGeometry(), buffer = gl.createBuffer(), texture = gl.createTexture();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
  for (const [name, count, offset] of [["position", 3, 0], ["normal", 3, 3], ["uv", 2, 6], ["material", 1, 8]] as const) {
    const attribute = gl.getAttribLocation(program, name);
    gl.enableVertexAttribArray(attribute);
    gl.vertexAttribPointer(attribute, count, gl.FLOAT, false, 36, 4 * offset);
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([230, 230, 230, 255]));
  if (finish) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, finish);
  const location = (name: string) => gl.getUniformLocation(program, name);
  const uniforms = {
    eye: location("eye"), right: location("right"), up: location("up"), forward: location("forward"),
    focal: location("focal"), wall: location("wall"), stripe: location("stripe"), panel: location("panel")
  };
  gl.enable(gl.DEPTH_TEST);
  return {
    draw(width: number, height: number, colors: readonly string[]) {
      if (gl.isContextLost() || width < 1 || height < 1) return false;
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      gl.viewport(0, 0, width, height);
      const aspect = width / height;
      const wide = Math.min(1, Math.max(0, (aspect - .8) / .9));
      const eye: V3 = [30 + wide * 104, 32 + wide * 3, 36 + wide * 107];
      const target: V3 = [-87 + wide * 71, 33, -98 + wide * 75];
      const f = unit([target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]]);
      const right = unit([-f[2], 0, f[0]]);
      const up: V3 = [-right[2] * f[1], right[2] * f[0] - right[0] * f[2], right[0] * f[1]];
      const focal = 1 / Math.tan((43 + 17 * Math.max(0, 1 - aspect / 1.6)) * Math.PI / 360);
      gl.uniform3fv(uniforms.eye, eye); gl.uniform3fv(uniforms.right, right);
      gl.uniform3fv(uniforms.up, up); gl.uniform3fv(uniforms.forward, f);
      gl.uniform2f(uniforms.focal, focal / aspect, focal);
      gl.uniform3fv(uniforms.panel, rgb(colors[0], "#816951"));
      gl.uniform3fv(uniforms.stripe, rgb(colors[1], "#cb904f"));
      gl.uniform3fv(uniforms.wall, rgb(colors[2], "#dac6af"));
      gl.clearColor(.12, .115, .11, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.solidCount);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false);
      gl.drawArrays(gl.TRIANGLES, mesh.solidCount, mesh.glowCount);
      gl.depthMask(true); gl.disable(gl.BLEND);
      return true;
    },
    dispose() {
      gl.deleteTexture(texture); gl.deleteBuffer(buffer); gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
