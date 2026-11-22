# Social menus

SocialPanel owns tabs/status and one in-flight command. WorldsPage, PeoplePages
and InvitationsPage render server state and submit named actions through the one
socialClient request owner. No component decides permissions, edits authoritative
memberships or spawns physics. navigation.ts hands a joined map to the existing
garage. invitationLinks.ts only handles public world codes. useFormNavigation owns
controller form focus; the shared text keyboard has routing priority.

See docs/SOCIAL_WORLDS.md for scope, persistence, capacity and installation.

## Shared open world

An operator can create an unlocked, listed world from Worlds & social using an installed map. Its owner can read the World ID from the current-world card. Set that numeric ID as `VITE_OPEN_WORLD_ID` in the frontend environment and rebuild to enable Open World in the main menu. Use a separate world ID for each environment. The application confirms that the configured world is listed, unlocked, and suitable for free driving before offering the join button.

Open World takes players to the shared-world card. Joining uses the existing garage and server admission flow. Play still opens matchmaking directly. After leaving the hub, players can open Play or rejoin Open World from the main menu.
