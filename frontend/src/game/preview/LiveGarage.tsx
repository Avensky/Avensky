import { Component, Suspense, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame, useLoader, useThree, type RootState } from "@react-three/fiber";
import { Box3, Mesh, PerspectiveCamera, Quaternion, type WebGLRenderTarget } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { prepareGarageDisplay } from "./prepareGarageDisplay";
import { garagePlacement } from "./garagePlacement";
import { applyGarageLighting } from "../../theme/garageLighting";
import { isUITheme } from "../../theme/catalog";
import { DEFAULT_GARAGE_THEME } from "../../theme/garageEntry";
import { collectGarageFixtures } from "./garageFixtures";
import { setFloorFinish } from "./mechanicsFloor";
import { installGarageEntryInteraction, type EntryMotion } from "./garageEntryInteraction";
import { restoreGaragePreferences } from "../../theme/garagePreferences";

declare const __GARAGE_MODEL_URL__: string;
const decoder = new DRACOLoader().setDecoderPath("/draco/");
const configure = (loader: GLTFLoader) => { loader.setDRACOLoader(decoder); };
type Preview = { contents: ReactNode; demand: boolean; dpr: number; shadows: boolean };
type GarageRuntime = { preview: Preview | null; listeners: Set<() => void>; motion: EntryMotion; input?: AbortController; owner?: string; legacy?: Promise<(next: Preview | null) => void> };
const shared = globalThis as typeof globalThis & { __avenskyGarage?: GarageRuntime };
const runtime = shared.__avenskyGarage ??= {
  preview: null, listeners: new Set(), motion: { yaw: .055, pitch: 0, dragging: false },
};
function subscribe(listener: () => void) {
  runtime.listeners.add(listener);
  return () => { runtime.listeners.delete(listener); };
}
export function setGaragePreview(next: Preview | null) {
  runtime.preview = next;
  for (const listener of runtime.listeners) listener();
  if (runtime.legacy) void runtime.legacy.then(update => update(runtime.preview));
}
function revealGarage(host: HTMLElement) {
  host.dataset.garageReady = "true";
  document.documentElement.dataset.garageReady = "true";
  window.dispatchEvent(new Event("avensky:garage-ready"));
}

function GarageObject({ host, camera, entry }: { host: HTMLElement; camera: PerspectiveCamera; entry: boolean }) {
  const { scene } = useLoader(GLTFLoader, __GARAGE_MODEL_URL__, configure);
  const invalidate = useThree(state => state.invalidate);
  const gl = useThree(state => state.gl);
  const world = useThree(state => state.scene);
  const introduced = useRef(false);
  useFrame(() => {
    if (!introduced.current) {
      introduced.current = true;
      requestAnimationFrame(() => revealGarage(host));
    }
  }, -2);
  const display = useMemo(() => {
    const garage = prepareGarageDisplay(scene);
    garage.root.name = "garage-special-environment";
    garage.root.scale.multiplyScalar(.06);
    const [x, y, z] = garagePlacement(garage.root, "Plane_PISTE");
    garage.root.position.set(x, y, z);
    // The vehicle preview supplies the optional rotating disk.
    for (const name of ["Plane_PISTE", "RB_Tour", "RB_Tour001", "RB_Tour.001"]) {
      const part = garage.root.getObjectByName(name);
      if (part) part.visible = false;
    }
    garage.root.updateWorldMatrix(true, true);
    const walls = garage.root.getObjectByName("SEMI_Murs") ?? garage.root;
    const bounds = new Box3().setFromObject(walls);
    bounds.min.y = 0;
    const ceiling = garage.root.getObjectByName("FOND_01");
    if (ceiling) {
      const height = new Box3().setFromObject(ceiling).min.y;
      if (height > 1) bounds.max.y = height;
    }
    return { ...garage, fixtures: collectGarageFixtures(garage.root), envelope: { bounds } };
  }, [scene]);
  useLayoutEffect(() => {
    const root = document.documentElement;
    let probe: WebGLRenderTarget | undefined;
    let lightingKey = "";
    let floorKey = "";
    const slab = display.root.getObjectByName("BASE_Full");
    const repaint = () => {
      const { garageTheme, garageBrightness, highContrast, garageEnvironment, garageFloor, garageReflectivity, garageRack, garageWork, garageCeiling, garageGlow } = root.dataset;
      const nextFloorKey = [garageFloor, garageReflectivity].join("|");
      const floorChanged = floorKey !== nextFloorKey;
      if (floorChanged && slab instanceof Mesh && Array.isArray(slab.material))
        setFloorFinish(slab.material[1], garageFloor === "metal", Number(garageReflectivity ?? 1));
      floorKey = nextFloorKey;
      const key = [garageTheme, garageBrightness, highContrast, garageEnvironment, garageRack, garageWork, garageCeiling, garageGlow].join("|");
      const lightingChanged = lightingKey !== key;
      if (lightingChanged) {
        lightingKey = key;
        applyGarageLighting(display.root, isUITheme(garageTheme) ? garageTheme : DEFAULT_GARAGE_THEME,
          highContrast === "true", Number(garageBrightness ?? 1) * .64);
        display.fixtures.updateEmission({ rack: Number(garageRack ?? 1), work: Number(garageWork ?? 1), ceiling: Number(garageCeiling ?? 1), glow: Number(garageGlow ?? .5) });
        const next = garageEnvironment === "false" ? undefined : display.fixtures.capture(gl);
        world.environment = next?.texture ?? null;
        probe?.dispose();
        probe = next;
      }
      if (lightingChanged || floorChanged) invalidate();
    };
    const changes = new MutationObserver(repaint);
    changes.observe(root, { attributes: true, attributeFilter: ["data-garage-theme", "data-garage-brightness", "data-high-contrast",
      "data-garage-environment", "data-garage-floor", "data-garage-reflectivity", "data-garage-rack", "data-garage-work", "data-garage-ceiling", "data-garage-glow"] });
    repaint();
    host.dataset.garageObject = display.root.uuid;
    return () => {
      changes.disconnect();
      delete host.dataset.garageObject;
      world.environment = null;
      probe?.dispose();
      display.fixtures.dispose();
      display.dispose();
    };
  }, [display, host, invalidate, gl, world]);
  return <>
    <primitive object={display.root} dispose={null} />
    <primitive object={display.fixtures.lights} />
    <EntryCamera camera={camera} active={entry} />
    <object3D name="garage-camera-envelope" userData={display.envelope} />
  </>;
}

function EntryCamera({ camera, active }: { camera: PerspectiveCamera; active: boolean }) {
  const { width, height } = useThree(state => state.size);
  const dpr = useThree(state => state.viewport.dpr);
  const invalidate = useThree(state => state.invalidate);
  const previousFrame = useRef(performance.now());
  const reducedMotion = useMemo(() => window.matchMedia?.("(prefers-reduced-motion: reduce)"), []);
  const restingOrientation = useMemo(() => new Quaternion(), []);
  const settledAngleSquared = useRef(0);
  useLayoutEffect(() => {
    if (!active) return;
    const portrait = width < height;
    camera.position.set(portrait ? 4.6 : 5.55, portrait ? 1.72 : 1.57, 4.95);
    camera.lookAt(portrait ? -3.1 : -4.7, portrait ? 2.22 : 1.95, -5.55);
    restingOrientation.copy(camera.quaternion);
    camera.aspect = width / Math.max(1, height);
    camera.fov = portrait ? 70 : 59;
    camera.updateProjectionMatrix();
    // A small rotation moves details fastest near the corners of a perspective image.
    // Stop when even a corner would travel less than a quarter of a rendered pixel.
    const projection = camera.projectionMatrix.elements;
    const focalPixels = .5 * Math.max(1, height * dpr) * projection[5];
    const cornerScale = 1 + (1 / projection[0]) ** 2 + (1 / projection[5]) ** 2;
    settledAngleSquared.current = (.25 / (focalPixels * cornerScale)) ** 2;
    runtime.motion.invalidate = invalidate;
    previousFrame.current = performance.now();
    const changed = () => invalidate();
    const preferences = new MutationObserver(changed);
    preferences.observe(document.documentElement, { attributes: true, attributeFilter: ["data-reduce-motion"] });
    reducedMotion?.addEventListener("change", changed);
    invalidate();
    return () => {
      runtime.motion.invalidate = undefined;
      preferences.disconnect();
      reducedMotion?.removeEventListener("change", changed);
    };
  }, [active, width, height, dpr, invalidate, reducedMotion, camera, restingOrientation]);
  useFrame(() => {
    if (!active || document.hidden) return;
    const motion = runtime.motion;
    const now = performance.now();
    const started = motion.dragging ? motion.dragStarted : motion.lastInput;
    const elapsed = Math.max(0, now - Math.max(previousFrame.current, started ?? 0)) / 1000;
    previousFrame.current = now;
    const yaw = motion.dragging ? motion.targetYaw ?? motion.yaw : 0;
    const pitch = motion.dragging ? motion.targetPitch ?? motion.pitch : 0;
    const immediate = reducedMotion?.matches || document.documentElement.dataset.reduceMotion === "true";
    const blend = immediate ? 1 : -Math.expm1(-(motion.dragging ? 16 : 1.7) * elapsed);
    motion.yaw += (yaw - motion.yaw) * blend;
    motion.pitch += (pitch - motion.pitch) * blend;
    const moving = (yaw - motion.yaw) ** 2 + (pitch - motion.pitch) ** 2 > settledAngleSquared.current;
    if (!moving) {
      motion.yaw = yaw;
      motion.pitch = pitch;
    }
    camera.quaternion.copy(restingOrientation);
    camera.rotateY(motion.yaw);
    camera.rotateX(motion.pitch);
    if (moving) invalidate();
  }, -1);
  return null;
}

class GarageFailure extends Component<{ children: ReactNode; host: HTMLElement }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.host.dataset.garageUnavailable = ""; revealGarage(this.props.host); }
  render() { return this.state.failed ? null : this.props.children; }
}

function LiveGarage({ host }: { host: HTMLElement }) {
  const view = useSyncExternalStore(subscribe, () => runtime.preview);
  const coarse = useMemo(() => window.matchMedia?.("(pointer: coarse)")?.matches, []);
  const camera = useMemo(() => new PerspectiveCamera(55, 1, .05, 150), []);
  const onCreated = (state: RootState) => { state.gl.setClearColor("#080808", 1); };
  return <GarageFailure host={host}>
    <Canvas className={view ? "garage-canvas" : undefined} camera={camera} onCreated={onCreated}
      dpr={view?.dpr ?? (coarse ? 1 : [1, 1.5])} shadows={view?.shadows ?? false}
      frameloop={view && !view.demand ? "always" : "demand"}
      gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }} fallback={null}>
      <GarageFailure host={host}><Suspense fallback={null}><GarageObject host={host} camera={camera} entry={!view} /></Suspense></GarageFailure>
      {view?.contents}
    </Canvas>
  </GarageFailure>;
}

export function mountGarage(host: HTMLElement) {
  if (host.dataset.garageMounted !== undefined) {
    // Older releases used a module-local store. Bridge to their already-loaded
    // module during sign-in handoff without replacing its room or renderer.
    if (!runtime.owner && !runtime.legacy) {
      runtime.legacy = import(/* @vite-ignore */ host.dataset.garageMounted)
        .then(module => {
          const update = module.setGaragePreview as (next: Preview | null) => void;
          update(runtime.preview);
          return update;
        });
    }
    return;
  }
  runtime.owner = import.meta.url;
  runtime.input ??= installGarageEntryInteraction(runtime.motion, () => runtime.preview !== null);
  restoreGaragePreferences(document.documentElement);
  if ((window.navigator as Navigator & { standalone?: boolean }).standalone || window.matchMedia?.("(display-mode: standalone)")?.matches) {
    document.documentElement.dataset.garageStandalone = "true";
    host.style.setProperty("--garage-screen-long-edge", `${Math.max(window.screen.width, window.screen.height)}px`);
  }
  host.dataset.garageMounted = import.meta.url;
  if (typeof window.WebGL2RenderingContext === "undefined") {
    host.dataset.garageUnavailable = "";
    revealGarage(host);
  } else {
    createRoot(host).render(<LiveGarage host={host} />);
  }
}
