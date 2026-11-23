import { VehicleScene } from "../../../vehicles/VehicleScene";
import { CityScene } from "../../../world";
import { FirstFrameReady } from "../tools/FirstFrameReady";
import { HubAvatars } from "../../hub/HubAvatars";
import { useHubStore } from "../../hub/hubStore";

export function Sandbox() {
  const hub = useHubStore(s => s.world !== null);
  return (
    <>
      <FirstFrameReady />
      <VehicleScene />
      <CityScene />
      {hub && <HubAvatars />}
    </>
  );
}
