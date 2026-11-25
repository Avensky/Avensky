import { useLayoutEffect, useState } from "react";
import { GameButton } from "../../components/GameButton";

export function GarageCredentialFields({ portal = false, disabled = false, login = "", password = "", onReady }: {
  portal?: boolean; disabled?: boolean; login?: string; password?: string; onReady?: () => void;
}) {
  useLayoutEffect(() => { onReady?.(); }, [onReady]);
  const [visible, setVisible] = useState(false);
  const [selection, setSelection] = useState("login");
  const identity = portal ? "Email" : "Email or account name";
  return <fieldset disabled={disabled}>
    <label className="garage-field" data-controller-row data-selected={selection === "login"}>
      <span className="garage-field-name">{identity}</span>
      <span className="garage-field-icon garage-email" aria-hidden="true" />
      <input name={portal ? "email" : "login"} type={portal ? "email" : "text"} autoComplete="username"
        inputMode="email" autoCapitalize="none" spellCheck={false} maxLength={254} placeholder={identity}
        defaultValue={login} required onFocus={() => setSelection("login")} />
    </label>
    <div className="garage-field garage-password" data-controller-row data-selected={selection === "password"}>
      <label htmlFor="alpha-password" className="garage-field-name">Password</label>
      <span className="garage-field-icon garage-lock" aria-hidden="true" />
      <input id="alpha-password" type={visible ? "text" : "password"} name="password" autoComplete="current-password"
        maxLength={portal ? 128 : 256} placeholder="Password" defaultValue={password} required
        onFocus={() => setSelection("password")} />
      <GameButton className="garage-eye" variant="menu" aria-controls="alpha-password"
        aria-label={visible ? "Hide password" : "Show password"} disabled={disabled}
        selected={selection === "eye"} onFocus={() => setSelection("eye")} onPress={() => setVisible(value => !value)}>
        {visible ? "Hide password" : "Show password"}
      </GameButton>
    </div>
    <div data-controller-row>
      <GameButton className="garage-sign-in" variant="menu" disabled={disabled}
        selected={selection === "submit"} onFocus={() => setSelection("submit")}
        onPress={() => document.getElementById("alpha-password")?.closest("form")?.requestSubmit()}>
        Sign in
      </GameButton>
    </div>
  </fieldset>;
}
