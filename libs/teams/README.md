# @openrock/teams

Generic team ARCHITECTURE: nested membership graph over any ids; all policy (caps, captains, invites, friendly fire) is opt-in via rules/hooks.

STATUS: stub. Every API function currently throws "not implemented"; the shape below is the contract to implement.

## API

- `createTeam`
- `destroyTeam`
- `addMember`
- `removeMember`
- `membersOf`
- `teamsOf`
- `isAlly`
- `registerRule`
- `onJoin`
- `onLeave`
