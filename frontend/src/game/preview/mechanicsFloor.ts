import { DoubleSide, Mesh, MeshStandardMaterial, type Object3D } from "three";

// BASE_Full contains the original two walls and the continuous slab underneath the black tile overlay.
export function fitMechanicsFloor(room: Object3D) {
  const shell = room.getObjectByName("BASE_Full");
  if (!(shell instanceof Mesh) || Array.isArray(shell.material)) return;
  const source = shell.geometry;
  const positions = source.getAttribute("position");
  const indices = source.index;
  const count = indices?.count ?? positions.count;
  const geometry = source.clone();
  geometry.clearGroups();
  let floorFaces = 0;
  for (let start = 0; start < count; start += 3) {
    const y = (i: number) => positions.getY(indices?.getX(start + i) ?? start + i);
    const horizontal = Math.max(y(0), y(1), y(2)) - Math.min(y(0), y(1), y(2)) < .0001;
    if (horizontal) floorFaces++;
    const slot = horizontal ? 1 : 0;
    const last = geometry.groups.at(-1);
    if (last?.materialIndex === slot) last.count += 3;
    else geometry.addGroup(start, 3, slot);
  }
  if (!floorFaces) { geometry.dispose(); return; }

  const concrete = new MeshStandardMaterial({
    name: "Sealed workshop concrete", color: "#978f82", roughness: .88, metalness: .025, side: DoubleSide,
  });
  concrete.onBeforeCompile = shader => {
    shader.vertexShader = "varying vec2 shopFloor;\n" + shader.vertexShader.replace(
      "#include <project_vertex>", "shopFloor = (modelMatrix * vec4(transformed, 1.)).xz;\n#include <project_vertex>",
    );
    shader.fragmentShader = `varying vec2 shopFloor;
      float shopNoise(vec2 p) {
        vec2 grid = floor(p), f = fract(p);
        f = f*f*(3.-2.*f);
        vec4 seed = vec4(dot(grid,vec2(127.1,311.7))) + vec4(0.,127.1,311.7,438.8);
        vec4 n = fract(sin(seed)*43758.5453);
        return mix(mix(n.x,n.y,f.x),mix(n.z,n.w,f.x),f.y);
      }\n` + shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
        vec2 p = shopFloor;
        float aggregate = (shopNoise(p * 78.) - .5) * (1.-smoothstep(.003,.018,max(fwidth(p.x),fwidth(p.y))));
        float wear = shopNoise(p * vec2(2.1,.44));
        vec2 bay = p / vec2(3.6,3.);
        vec2 edge = (.5-abs(fract(bay)-.5))*vec2(3.6,3.);
        float joint = min(edge.x,edge.y);
        float aa = max(.001, fwidth(joint));
        float sawCut = 1.-smoothstep(.004-aa,.009+aa,joint);
        diffuseColor.rgb *= (.89 + .12*shopNoise(p*.67) + .07*wear + .15*aggregate) * (1.-.28*sawCut);
      `);
  };
  shell.geometry = geometry;
  shell.material = [shell.material, concrete];
  // This mesh contains 47,520 tile triangles. The slab covers the entire empty vehicle bay.
  const tiles = room.getObjectByName("Sol_CUBE");
  if (tiles) tiles.visible = false;
  return () => { geometry.dispose(); concrete.dispose(); };
}
