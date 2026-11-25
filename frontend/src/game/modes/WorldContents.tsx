import { lazy } from "react";
import { Cameras } from "../../effects";
import { useBuilderStore } from "../../worldBuilder/state/builderStore";
import { Sandbox } from "./sandbox/SandBox";

const WorldBuilderScene = lazy(() => import("../../worldBuilder/scene/WorldBuilderScene"));

/** The live world's geometry and collision catalogs are needed only inside its canvas. */
export default function WorldContents({ screen, editorOpen }: {
  screen: "sandbox" | "world_builder"; editorOpen: boolean;
}) {
  const workspace = useBuilderStore(state => state.workspace);
  if (screen === "world_builder" || (editorOpen && workspace !== "vehicle")) return <WorldBuilderScene />;
  return <><Sandbox /><Cameras /></>;
}
