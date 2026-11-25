import { Component, Suspense, useLayoutEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useLoader, useThree, type RootState } from "@react-three/fiber";
import { Box3, PerspectiveCamera } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { prepareGarageDisplay } from "./prepareGarageDisplay";
import { garagePlacement } from "./garagePlacement";
import { applyGarageLighting } from "../../theme/garageLighting";
import { isUITheme } from "../../theme/catalog";
import { DEFAULT_GARAGE_THEME } from "../../theme/garageEntry";
import { ShowroomLights } from "./Showroom";

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

function GarageObject({ host }: { host: HTMLElement }) {
  const { scene } = useLoader(GLTFLoader, __GARAGE_MODEL_URL__, configure);
  const invalidate = useThree(state => state.invalidate);
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
    return { ...garage, envelope: { bounds } };
  }, [scene]);
  useLayoutEffect(() => {
    const root = document.documentElement;
    const repaint = () => {
      const theme = root.dataset.garageTheme;
      const value = Number(root.dataset.garageBrightness ?? 1);
      applyGarageLighting(display.root, isUITheme(theme) ? theme : DEFAULT_GARAGE_THEME,
        root.dataset.highContrast === "true", Number.isFinite(value) ? value * .64 : .64);
      invalidate();
    };
    const changes = new MutationObserver(repaint);
    changes.observe(root, { attributes: true, attributeFilter: ["data-garage-theme", "data-garage-brightness", "data-high-contrast"] });
    repaint();
    host.dataset.garageObject = display.root.uuid;
    return () => { changes.disconnect(); delete host.dataset.garageObject; display.dispose(); };
  }, [display, host, invalidate]);
  return <>
    <primitive object={display.root} dispose={null} />
    <object3D name="garage-camera-envelope" userData={display.envelope} />
  </>;
}

function EntryCamera({ camera }: { camera: PerspectiveCamera }) {
  const size = useThree(state => state.size);
  const invalidate = useThree(state => state.invalidate);
  useLayoutEffect(() => {
    const portrait = size.width < size.height;
    if (portrait) {
      camera.position.set(3.7, 1.55, 3.9);
      camera.lookAt(-1.35, 2.4, -4.65);
    } else {
      camera.position.set(5.7, 1.8, 4.9);
      camera.lookAt(-.6, 1.65, -5.3);
    }
    camera.aspect = size.width / Math.max(1, size.height);
    camera.fov = portrait ? 65 : 55;
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, size, invalidate]);
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
      <EntryCamera camera={camera} />
      <ShowroomLights />
      <GarageFailure host={host}><Suspense fallback={null}><GarageObject host={host} /></Suspense></GarageFailure>
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
  host.dataset.garageMounted = import.meta.url;
  createRoot(host).render(<LiveGarage host={host} />);
}
