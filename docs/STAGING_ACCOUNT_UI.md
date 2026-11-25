# Staging identity, character profile and account UI

## UX and theme
Authenticated staging testers should skip sign-in. The saved-character selector has an image-led layout with a large portrait and details alongside, without a redundant Choose your character title. It uses an explicit Log out instead of Back. The separate staging sign-in prescreen is for logged-out visitors only. The Character editor retains the existing angled tabs and one back icon, with Profile and Account sections after authentication.

The React app and the standalone staging sign-in portal share frontend/src/theme/palettes.json as their single theme palette source. The game uses --app-* CSS variables. The login portal exposes the same tokens and reads the same local Avensky preference, defaulting to Navy. No independently maintained purple login palette.

## Secure accounts
The admin-only Profile invitation form uses the same backend staging invitation authority. Account offers a verified email-change request, a password-confirmed profile deletion request, and Log out. Neither request immediately mutates the login email or deletes game data; the administrator must reconcile linked worlds, characters, session security and external verification first. JSON endpoints enforce server-side cookie access, role checks and exact Origin for every write. Frontend passwords are not persisted.

## Deployment caveat
The main-branch workflow publishes the SPA. The staging alpha-access Node portal is a separate service, and cannot be assumed updated by a successful frontend build. Verify that a signed-in GET /__alpha/session returns the account email/admin role, that unsigned calls return 401, and that non-admin invite POSTs return 403 before announcing account controls available on staging. The frontend handles an old portal gracefully, providing a link to existing Account. Never deploy to live as part of this alpha test.

## Acceptance checks
1. Logged out: Sign in only; no Account or Log out in the prescreen; remembered theme displays immediately.
2. Logged in: no second prescreen; portrait large and profile facts alongside; Log out visible; no heading or duplicate Back.
3. Character editor: existing themed tabs, one back icon; Profile and Account visible only for staging accounts.
4. Admin can invite testers; non-admin cannot access the invite endpoint.
5. Password-confirmed email and deletion requests queue for review without mutating accounts/game data.
6. Repeat on Navy, Hacker Green, Deep Purple, Strawberry and mobile landscape. Preserve production sign-in and release gates.
