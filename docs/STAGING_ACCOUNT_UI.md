# Staging identity, character profile and account UI

## UX and theme
Authenticated staging testers should skip sign-in. The saved-character selector has an image-led layout with a large portrait and details alongside, without a redundant Choose your character title. It uses an explicit Log out instead of Back. The separate staging sign-in prescreen is for logged-out visitors only. The Character editor retains the existing angled tabs and one back icon, with Profile and Account sections after authentication.

The public `/sign-in` page uses the game logo, angled header geometry, and a static still of the empty game garage. The original segmented counter reads 0999. Settings → Garage → Garage theme chooses a wall finish or follows the interface palette. Portal entry assets are read from `/srv/avensky-staging/frontend/current/images/`.

The React app and the standalone staging sign-in portal share frontend/src/theme/palettes.json as their single theme palette source. The game uses --app-* CSS variables. The login portal exposes the same tokens and reads the same local Avensky preference, defaulting to Navy. No independently maintained purple login palette.

## Secure accounts
The admin-only Profile invitation form uses the same backend staging invitation authority. Account offers a verified email-change request, a password-confirmed profile deletion request, and Log out. Neither request immediately mutates the login email or deletes game data; the administrator must reconcile linked worlds, characters, session security and external verification first. JSON endpoints enforce server-side cookie access, role checks and exact Origin for every write. Frontend passwords are not persisted.

## Deployment caveat
The main-branch workflow publishes the SPA. For the single-database host upgrade follow the [staging cutover](STAGING_UNIFIED_SIGN_IN.md#vultr-cutover). The staging alpha-access Node portal is a separate service, and cannot be assumed updated by a successful frontend build. Verify that a signed-in GET /__alpha/session returns the account email/admin role, that unsigned calls return 401, and that non-admin invite POSTs return 403 before announcing account controls available on staging. The frontend handles an old portal gracefully, providing a link to existing Account. Never deploy to live as part of this alpha test.

## Acceptance checks
1. Logged out: Sign in only; no Account or Log out in the prescreen; remembered theme displays immediately.
2. Logged in: no second prescreen; portrait large and profile facts alongside; Log out visible; no heading or duplicate Back.
3. Character editor: existing themed tabs, one back icon; Profile and Account visible only for staging accounts.
4. Admin can invite testers; non-admin cannot access the invite endpoint.
5. Password-confirmed email and deletion requests queue for review without mutating accounts/game data.
6. Repeat on Navy, Hacker Green, Deep Purple, Strawberry and mobile landscape. Preserve production sign-in and release gates.

## Garage background performance

The entry screen previously referenced a 10,450-byte sunflare image and a 712,928-byte looping video. The original garage still was 55,970 bytes. The themed still is 56,260 bytes and the mask is 12,708 bytes. Changing finish reuses both. It decodes asynchronously while the sign-in controls are available. The browser caches the versioned URL. The React menu keeps the same image element through account, character selection, Main and the queue. A retained 3D preview has its frame loop stopped while the menu covers it.

With the same 1,364,240-byte Garage Special GLB served to an 844 × 390 Chromium session, the signed-out form issued zero model requests. After sign-in, one model request started before any canvas mounted. Opening the live room twice and switching from Navy to Forest kept the total at one. The four wall faces add 24 triangles and three material groups. The first counter digit shares its 24 triangles with an existing digit. To repeat, record the GLB request in a fresh authenticated session, open Heroes, change the garage theme, leave the preview and reopen it.

To reproduce the network check, open the signed-out portal in a fresh browser profile with the Network panel recording and caching enabled. Toggle password visibility, open Forgot password, then return to sign-in. Filter for WebP, MP4 and GLB. In Chromium at 844 × 390, the first page fetched the garage once and password recovery transferred zero additional garage bytes. Sign-in requested no video or 3D model. These measurements cover resource loading in Chromium. Physical-phone frame time still needs measurement.

## Garage still credit

The login background is a lit still of Avensky’s Garage Special scene with its vehicle omitted, a restored 0999 counter and new panelled walls. The static entry and the live room use the same wall colors from `frontend/src/theme/palettes.json`. A single wall mask lets the browser recolor the still without another photograph. After portal sign-in, the app starts the real garage GLB through the same loader cache used by the live preview. The source model is [Garage followers special! by Ahad4940](https://sketchfab.com/3d-models/garage-followers-special-71b1b4d569ec4c9788c76f4c3d56b461), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The credit is also embedded in the WebP metadata.
