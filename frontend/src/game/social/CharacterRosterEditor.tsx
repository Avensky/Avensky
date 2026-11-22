import { useState } from "react";
import { CHARACTERS, ROOK_ID, VILLAGER_ID } from "../characters/characterCatalog";
import { sharedDrivers, type VehicleDriver } from "../characters/driverRoster";
import { vehicleCatalog } from "../../store/selection/vehicleCatalog";
import type { SocialCommand } from "./types";

export function CharacterRosterEditor({ overrides, command }: { overrides: VehicleDriver[]; command: SocialCommand }) {
  const roster = sharedDrivers(overrides);
  const makeDriver = (): VehicleDriver => ({ ...roster[0], id: "", name: "" });
  const [draft, setDraft] = useState<VehicleDriver>(makeDriver);
  const outfits = (gender: VehicleDriver["gender"]) =>
    CHARACTERS.find(rig => rig.id === (gender === "female" ? VILLAGER_ID : ROOK_ID))!.outfits;
  return <section className="social-card">
    <h2>Shared character roster</h2>
    <label>Character<select value={draft.id} onChange={e =>
      setDraft(roster.find(driver => driver.id === e.target.value) ?? makeDriver())}>
      <option value="">Create a character</option>
      {roster.map(driver => <option key={driver.id} value={driver.id}>{driver.name}</option>)}
    </select></label>
    <form onSubmit={async e => {
      e.preventDefault();
      const result = await command("roster_save", { driver: draft }, "Shared character saved");
      if (typeof result?.driver_id === "string") setDraft({ ...draft, id: result.driver_id });
    }}>
      <label>Name<input required maxLength={32} value={draft.name} onChange={e => setDraft({ ...draft, name:e.target.value })}/></label>
      <label>Rig<select value={draft.gender} disabled={!!draft.id} onChange={e => {
        const gender = e.target.value as VehicleDriver["gender"];
        setDraft({ ...draft, gender, outfit:outfits(gender)[0].id });
      }}><option value="female">Female</option><option value="male">Male</option></select></label>
      <label>Vehicle<select value={draft.vehicle} onChange={e => setDraft({ ...draft, vehicle:e.target.value as VehicleDriver["vehicle"] })}>
        {vehicleCatalog.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select></label>
      <label>Starting outfit<select value={draft.outfit} onChange={e => setDraft({ ...draft, outfit:e.target.value })}>
        {outfits(draft.gender).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select></label>
      <div className="social-form-row">
        <label>Base color<input type="color" value={draft.color} onChange={e => setDraft({ ...draft, color:e.target.value })}/></label>
        <label>Accent<input type="color" value={draft.accent} onChange={e => setDraft({ ...draft, accent:e.target.value })}/></label>
      </div>
      <button type="submit" className="menu-control">{draft.id ? "Save character" : "Create character"}</button>
    </form>
  </section>;
}
