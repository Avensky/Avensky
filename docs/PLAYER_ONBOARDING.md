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
- With automatic staging, set the staging game service's `AVENLAB_PLAYER_ACCOUNTS` to `1` in its operator-managed Compose configuration and follow the [staging backend rollout](FRONTEND_RELEASES.md#include-the-staging-game-server). Confirm that the staging socket's `welcome` message includes `player_accounts: true` before enabling the GitHub repository variable `STAGING_PLAYER_ONBOARDING=1`. Publish a fresh commit with that variable set. The release receiver reuses the installed build when the same commit is published again.
- Guests can try the game. Use a registered account for cross-device outfits and returning to a reserved session from a fresh sign-in. Equipped catalog outfits save after the game server confirms them. Individual fitting edits remain previews and eligible custom combinations can be kept under Saved outfits.
- A transport reconnect or a fresh sign-in can recover a deployment when the game server still holds an authenticated reservation. The default reservation is 30 seconds. A completed match or expired reservation requires a new queue or deployment.
- Verify guest entry, registration, saving a character and an approved outfit, signing out, and logging in on a second device. Confirm the same profile ID and outfit appear after restarting staging. Check the welcome layout in portrait and the Play screen in landscape on a phone.

## Branding and startup

The triangular Avensky emblem is available as `/images/logo.svg`, `/images/logo.png`, and `/favicon.ico`. The welcome screen uses a compressed render of the same mark. The welcome, queue, and loading screens share the lightweight purple sunflare still.

## Wardrobe follow-up

Verify the female rig first. Reproduce skirt and corset intersections, then check tie alignment, shoe contact and clipping, and hairstyle fit, color, and opacity. Keep saved outfit IDs and existing animation behavior. Check a representative phone at the same time as desktop. Use the verified workflow for the male outfit and hairstyle edits.

## Game master and shared content

Register your own account first. Its **Worlds & social → Profile → Your player code** is the stable profile ID. Set `AVENSKY_GAME_MASTER_ID` to that ID in the game server environment and recreate the staging game service with the updated environment. Use the staging profile ID for staging. The server starts with no staff privileges when the setting is empty. Guest profiles and display names cannot grant staff access.

- **Shared characters.** Open **Worlds & social → Profile → Shared character roster** to create or edit a named driver, choose its vehicle and rig, set its starting outfit, and pick its base and accent colors. Existing choices keep their IDs. Players see the shared drivers in character selection and can still customize their own equipped outfit.
- **Personal worlds.** Players create worlds under **Worlds & social → Worlds**. In the live editor, choose a matching world under **Save destination**. **Load saved world** opens its stored revision. **Save world & test drive** validates and saves to that world. Leave the destination world empty while saving. **Test session only** previews the draft in the editor room.
- **Shared main world.** Select **Set as main world** on a listed, unlocked world. Its original owner can still play there. The game master and explicitly assigned world editors can change its layout and handling. The selection drives the Open World entry. When upgrading a server with a legacy `VITE_OPEN_WORLD_ID`, select that world here.
- **Official game modes.** Select **Approve for game modes** on a listed, unlocked CTF-compatible world. Quickplay, Competitive and Skirmish use the selected world revisions. New servers and upgraded servers begin with an empty rotation until the game master makes a selection. Saving new geometry or changing a world's handling clears approval. Players can still use personal worlds, sandbox and the editor while the rotation is empty.
- **Future staff.** Set comma-separated registered profile IDs in `AVENSKY_CHARACTER_EDITOR_IDS` or `AVENSKY_WORLD_EDITOR_IDS` when you want to delegate roster or main-world editing. Both lists default to empty. Selection of the main world and official game-mode worlds stays with the game master.

With the automatic staging deploy helper, update the operator-owned staging Compose configuration and its environment file on Vultr. Recreate the staging game when changing staff environment values. The helper compares game image inputs for code releases. Published web bundles contain no privileged credential.
