import { Component, Suspense, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame, useLoader, useThree, type RootState } from "@react-three/fiber";
import { Box3, Mesh, PerspectiveCamera, type WebGLRenderTarget } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { prepareGarageDisplay } from "./prepareGarageDisplay";
import { garagePlacement } from "./garagePlacement";
import { applyGarageLighting } from "../../theme/garageLighting";
import { isUITheme } from "../../theme/catalog";
import { DEFAULT_GARAGE_THEME } from "../../theme/garageEntry";
import { collectGarageFixtures } from "./garageFixtures";
import { setFloorFinish } from "./mechanicsFloor";
import { restoreGaragePreferences } from "../../theme/garagePreferences";

declare const __GARAGE_MODEL_URL__: string;
const decoder = new DRACOLoader().setDecoderPath("/draco/");
const configure = (loader: GLTFLoader) => { loader.setDRACOLoader(decoder); };
type Preview = { contents: ReactNode; demand: boolean; dpr: number; shadows: boolean };
let preview: Preview | null = null;
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function setGaragePreview(next: Preview | null) {
  preview = next;
  for (const listener of listeners) listener();
}

function GarageObject({ host, camera, entry }: { host: HTMLElement; camera: PerspectiveCamera; entry: boolean }) {
  const { scene } = useLoader(GLTFLoader, __GARAGE_MODEL_URL__, configure);
  const invalidate = useThree(state => state.invalidate);
  const gl = useThree(state => state.gl);
  const world = useThree(state => state.scene);
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
    const slab = display.root.getObjectByName("BASE_Full");
    const repaint = () => {
      const { garageTheme, garageBrightness, highContrast, garageEnvironment, garageFloor, garageReflectivity } = root.dataset;
      if (slab instanceof Mesh && Array.isArray(slab.material))
        setFloorFinish(slab.material[1], garageFloor === "metal", Number(garageReflectivity ?? 1));
      const key = [garageTheme, garageBrightness, highContrast, garageEnvironment].join("|");
      if (lightingKey !== key) {
        lightingKey = key;
        applyGarageLighting(display.root, isUITheme(garageTheme) ? garageTheme : DEFAULT_GARAGE_THEME,
          highContrast === "true", Number(garageBrightness ?? 1) * .64);
        display.fixtures.updateEmission();
        const next = garageEnvironment === "false" ? undefined : display.fixtures.capture(gl);
        world.environment = next?.texture ?? null;
        probe?.dispose();
        probe = next;
      }
      invalidate();
    };
    const changes = new MutationObserver(repaint);
    changes.observe(root, { attributes: true, attributeFilter: ["data-garage-theme", "data-garage-brightness", "data-high-contrast",
      "data-garage-environment", "data-garage-floor", "data-garage-reflectivity"] });
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
  const invalidate = useThree(state => state.invalidate);
  // Keep progress with the room through recovery, login, and camera ownership changes.
  const elapsed = useRef(0);
  const lastFrame = useRef<number | null>(null);
  const settled = useRef(false);
  const motion = useMemo(() => matchMedia("(prefers-reduced-motion: reduce)"), []);
  useLayoutEffect(() => {
    lastFrame.current = null;
    if (!active) return;
    const changed = () => { lastFrame.current = null; settled.current = false; invalidate(); };
    const prefs = new MutationObserver(changed);
    prefs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-reduce-motion"] });
    motion.addEventListener("change", changed);
    document.addEventListener("visibilitychange", changed);
    changed();
    return () => {
      prefs.disconnect();
      motion.removeEventListener("change", changed);
      document.removeEventListener("visibilitychange", changed);
    };
  }, [active, width, height, invalidate, motion]);
  useFrame(() => {
    if (!active || settled.current || document.hidden) { lastFrame.current = null; return; }
    const now = performance.now();
    const duration = 6500;
    const reduced = motion.matches || document.documentElement.dataset.reduceMotion === "true";
    elapsed.current = reduced ? duration : Math.min(duration, elapsed.current + (lastFrame.current === null ? 0 : now - lastFrame.current));
    lastFrame.current = now;
    const t = elapsed.current / duration;
    const blend = t * t * (3 - 2 * t);
    const portrait = width < height;
    // From the neon-rack corner to the work-lamp corner, staying inside the authored bay.
    camera.position.set(portrait ? 4.6 : 5.55, portrait ? 1.72 : 1.57, 4.95);
    camera.lookAt((portrait ? -5.5 : -7.3) + blend * (portrait ? 5.7 : 5.6),
      portrait ? 2.22 : 1.95, -5.25 - blend * .4);
    camera.aspect = width / Math.max(1, height);
    camera.fov = portrait ? 70 : 59;
    camera.updateProjectionMatrix();
    settled.current = t === 1;
    if (!settled.current) invalidate();
  }, -1);
  return null;
}

class GarageFailure extends Component<{ children: ReactNode; host: HTMLElement }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.host.dataset.garageUnavailable = ""; }
  render() { return this.state.failed ? null : this.props.children; }
}

function LiveGarage({ host }: { host: HTMLElement }) {
  const view = useSyncExternalStore(subscribe, () => preview);
  const camera = useMemo(() => new PerspectiveCamera(55, 1, .05, 150), []);
  const onCreated = (state: RootState) => { state.gl.setClearColor("#201a16", 1); };
  return <GarageFailure host={host}>
    <Canvas className={view ? "garage-canvas" : undefined} camera={camera} onCreated={onCreated}
      dpr={view?.dpr ?? [1, 1.5]} shadows={view?.shadows ?? false}
      frameloop={view && !view.demand ? "always" : "demand"}
      gl={{ antialias: false, alpha: false, powerPreference: "high-performance" }} fallback={null}>
      <GarageFailure host={host}><Suspense fallback={null}><GarageObject host={host} camera={camera} entry={!view} /></Suspense></GarageFailure>
      {view?.contents}
    </Canvas>
  </GarageFailure>;
}

export function mountGarage(host: HTMLElement) {
  if (host.dataset.garageMounted !== undefined) {
    // If a deployment landed during sign-in, bootstrap the protected document on its own release.
    if (host.dataset.garageMounted !== import.meta.url) location.reload();
    return;
  }
  restoreGaragePreferences(document.documentElement);
  host.dataset.garageMounted = import.meta.url;
  createRoot(host).render(<LiveGarage host={host} />);
}
