# Player accounts and onboarding

The staging welcome screen runs before the main menu. Players can register a profile, log in with an account name and password, or enter a display name and play as a guest. The vehicle selector shows a female and male driver for each of the 17 vehicles. Confirming a driver saves the choice before opening the menu. Play and vehicle selection display the saved driver. Match vehicle and role rules still apply.

The 34 named drivers share two existing rigs and use existing outfit IDs with their own color and trim. The catalog lives in [vehicle-drivers.json](../packages/wardrobe-catalog/vehicle-drivers.json). Mara Vega keeps the existing `mara-vega` rig ID. The separate driver ID stays stable when the wardrobe changes. The picker can generate a model portrait for the selected driver when the browser supports it. It uses lightweight art while the portrait is unavailable. The first release uses the base rigs and palettes so the menu can ship independently of new hair and wardrobe fits.

## How the save works

1. The browser connects through Caddy to the staging Rust WebSocket. The server advertises that accounts are available. The frontend uses WSS outside localhost for credentials.
2. Rust normalizes account names, hashes passwords with Argon2id off the game scheduler, and limits attempts per account and per server. Registration can upgrade the connected device or guest profile in place. A successful login issues a random, expiring session token. SQLite stores the token hash. A browser remembers its token, and signing out revokes that token. A registered account supports multiple saved device sessions with one active game connection at a time.
3. The Rust server writes a SQLite transaction before acknowledging an equip, saved outfit, or other profile change. Fit previews continue to be local until an equip or save. Each player has a row. A separate row stores the social control-plane document. Unchanged rows stay untouched. Career archives keep their existing sidecar files and recovery process.

See [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) and [SQLite deployment tradeoffs](https://www.sqlite.org/whentouse.html).

## Staging rollout

- Use the staging Compose project and its dedicated volume. `AVENLAB_PLAYER_ACCOUNTS=1` creates `/data/staging/social.sqlite3` and imports the existing `social.json` once. The import preserves profile IDs, server ID, worlds, and outfits. The original file remains available as the pre-migration snapshot.
- Back up the staging volume and career archives before restarting the staging backend. For subsequent cold backups, stop the staging writer and copy the whole data directory. The original JSON file becomes stale once SQLite is active. A rollback to an older JSON-only binary restores the pre-migration state unless an explicit export is prepared. Keep both storage snapshots.
- Pair the account-enabled backend with a staging frontend built with `VITE_PLAYER_ONBOARDING=1`. The flag is public build configuration. Account passwords, token hashes, and provider keys stay outside build files. Keep the existing staging access controls. The feature currently uses username and password only. Password recovery is pending before a wider release.
- Verify guest entry, registration, saving a character and an approved outfit, signing out, and logging in on a second device. Confirm the same profile ID and outfit appear after restarting staging. Check the welcome layout in portrait and the Play screen in landscape on a phone.

## Branding and startup

The triangular Avensky emblem is available as `/images/logo.svg`, `/images/logo.png`, and `/favicon.ico`. The welcome screen uses a compressed render of the same mark. The menu, queue, and loading backgrounds share a still from the purple sunflare clip. The app fetches an image and uses CSS for the layout, which removes the old video downloads and decode work.

## Wardrobe follow-up

Verify the female rig first. Reproduce skirt and corset intersections, then check tie alignment, shoe contact and clipping, and hairstyle fit, color, and opacity. Keep saved outfit IDs and existing animation behavior. Check a representative phone at the same time as desktop. Use the verified workflow for the male outfit and hairstyle edits.
