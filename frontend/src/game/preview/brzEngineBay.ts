import { Group, Mesh, Raycaster, Vector3 } from "three";

const contacts = [
  ["brace", "ENGINE_04", .40, .634, -1.950],
  ["intake", "ENGINE", -.10, .662, -1.792],
  ["fitting", "ENGINE", -.171, .634, -1.745],
] as const;

export type BrzEngineBay = Record<typeof contacts[number][0], Group>;

/** Fit contact locators to the streamed mesh, using its unmodified bind poses. */
export function fitBrzEngineBay(root: Group): BrzEngineBay | undefined {
  const locators: Partial<BrzEngineBay> = {};
  const ray = new Raycaster();
  root.updateWorldMatrix(true, true);
  for (const [id, name, x, y, z] of contacts) {
    const mesh = root.getObjectByName(name);
    if (!(mesh instanceof Mesh)) return undefined;
    const origin = mesh.localToWorld(new Vector3(x, y + .08, z));
    const direction = mesh.localToWorld(new Vector3(x, y, z)).sub(origin).normalize();
    ray.set(origin, direction);
    const hit = ray.intersectObject(mesh, false)[0];
    if (!hit || Math.abs(mesh.worldToLocal(hit.point.clone()).y - y) > .008) return undefined;
    const locator = new Group();
    locator.name = `brz-engine-${id}`;
    locator.position.copy(root.worldToLocal(hit.point));
    locators[id] = locator;
  }
  const { brace, intake, fitting } = locators;
  if (!brace || !intake || !fitting) return undefined;
  root.add(brace, intake, fitting);
  return { brace, intake, fitting };
}
