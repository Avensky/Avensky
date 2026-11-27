import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import { garageEditorDisplayedCamera } from "../../game/preview/garageRoomEditorCamera";
import { GARAGE_FIXED_OBSTACLES, GARAGE_FLOOR_BOUNDS, GARAGE_PROP_IDS, GARAGE_PROP_LABELS, GARAGE_RESERVED_AREAS,
  garagePropFootprint, type GaragePropId, type GaragePropPose, type GarageRoomLayout, type GarageParkingObstacle } from "../../game/preview/garageServiceLayout";
import { usePersonalGarage } from "../../store/social/personalGarage";
import { planPoint, snapValue } from "../document/planProjection";
import { garageFloorPoint, pickGarageProp } from "./garagePlacement";
import { selectGarageProp } from "./garageEditorState";

const bounds = GARAGE_FLOOR_BOUNDS;
const view = { x: bounds.minX, z: bounds.minZ, width: bounds.maxX - bounds.minX, depth: bounds.maxZ - bounds.minZ };
const transform = (box: GarageParkingObstacle) => `translate(${box.x} ${box.z}) rotate(${-box.yaw * 180 / Math.PI})`;
function rect(box: GarageParkingObstacle) {
  return { transform: transform(box), x: -box.halfWidth, y: -box.halfLength, width: box.halfWidth * 2, height: box.halfLength * 2 };
}

type ReadPoint = (x: number, y: number) => readonly [number, number] | null;
type Drag = { pointer: number; id: GaragePropId; pose: GaragePropPose; start: readonly [number, number];
  layout: GarageRoomLayout; read: ReadPoint; moved: boolean };

export function GaragePlacementSurface({ selected, layout, disabled, move, record }: {
  selected: GaragePropId; layout: GarageRoomLayout; disabled: boolean;
  move: (id: GaragePropId, pose: GaragePropPose) => boolean;
  record: (before: GarageRoomLayout) => void;
}) {
  const drag = useRef<Drag | null>(null);
  const start = (event: ReactPointerEvent<Element>, plan: boolean) => {
    if (disabled || drag.current || event.button !== 0) return;
    const host = event.currentTarget, area = host.getBoundingClientRect();
    const { clientX: x, clientY: y } = event;
    // Freeze the displayed lens for this gesture so a traveling camera does not move a held item.
    const camera = plan ? null : garageEditorDisplayedCamera()?.clone();
    const read: ReadPoint = plan ? (x, y) => planPoint(x, y, area, view) : (x, y) => camera ? garageFloorPoint(x, y, area, camera) : null;
    const point = read(x, y);
    const id = plan ? (event.target as Element).closest<SVGElement>("[data-prop]")?.dataset.prop as GaragePropId | undefined
      : pickGarageProp(x, y, area, layout);
    if (!point || !id || !GARAGE_PROP_IDS.includes(id)) return;
    event.preventDefault();
    host.setPointerCapture(event.pointerId);
    selectGarageProp(id, false);
    drag.current = { pointer: event.pointerId, id, pose: layout[id], layout, start: point, read, moved: false };
  };
  const update = (event: ReactPointerEvent<Element>) => {
    const d = drag.current;
    if (!d || disabled || d.pointer !== event.pointerId) return;
    const point = d.read(event.clientX, event.clientY);
    if (!point) return;
    const dx = snapValue(point[0] - d.start[0], .25), dz = snapValue(point[1] - d.start[1], .25);
    if (move(d.id, { ...d.pose, x: d.pose.x + dx, z: d.pose.z + dz })) d.moved ||= Boolean(dx || dz);
  };
  const finish = (event: ReactPointerEvent<Element>, cancel = false) => {
    const d = drag.current;
    if (d?.pointer !== event.pointerId) return;
    drag.current = null;
    if (cancel && d.moved) usePersonalGarage.getState().setLayout(d.layout);
    else if (d.moved) record(d.layout);
    else selectGarageProp(d.id);
  };
  const events = { onPointerMove: update, onPointerUp: (event: ReactPointerEvent<Element>) => finish(event),
    onPointerCancel: (event: ReactPointerEvent<Element>) => finish(event, true), onLostPointerCapture: (event: ReactPointerEvent<Element>) => finish(event, true) };
  return <>
    <div className="garage-edit-stage" aria-label="Move garage furniture in 3D" {...events} onPointerDown={e => start(e, false)} />
    <svg className="garage-floor-plan" viewBox={[view.x, view.z, view.width, view.depth].join(" ")}
      role="img" aria-label="Garage floor plan" {...events} onPointerDown={e => start(e, true)}>
      <rect {...{ x: view.x, y: view.z, width: view.width, height: view.depth }} className="garage-plan-floor" />
      {GARAGE_RESERVED_AREAS.map((area, i) => <rect key={i} {...rect(area)} className="garage-plan-lane" />)}
      {GARAGE_FIXED_OBSTACLES.map((area, i) => <rect key={i} {...rect(area)} className="garage-plan-fixture"/>)}
      {GARAGE_PROP_IDS.map(id => {
        const box = garagePropFootprint(id, layout[id]);
        return <g key={id} data-prop={id} data-active={selected === id}>
          <title>{GARAGE_PROP_LABELS[id]}</title>
          <circle cx={box.x} cy={box.z} r={.65} fill="transparent" stroke="none" />
          <rect {...rect(box)} className="garage-plan-prop"/>
          <path transform={transform(box)} d="M0 0v-.5l-.17.18m.17-.18.17.18" fill="none" className="garage-plan-heading"/>
        </g>;
      })}
    </svg>
  </>;
}
