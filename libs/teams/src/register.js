// @openrock/teams - Generic team ARCHITECTURE: nested membership graph over any ids; all policy (caps, captains, invites, friendly fire) is opt-in via rules/hooks.
// Stub: replace each TODO-throwing function with a real implementation.
// Pure functions stay real top-level exports; register() exposes the same API through the kernel.
"use strict";

const api = {
    createTeam() { throw new Error("@openrock/teams: createTeam is not implemented"); },
    destroyTeam() { throw new Error("@openrock/teams: destroyTeam is not implemented"); },
    addMember() { throw new Error("@openrock/teams: addMember is not implemented"); },
    removeMember() { throw new Error("@openrock/teams: removeMember is not implemented"); },
    membersOf() { throw new Error("@openrock/teams: membersOf is not implemented"); },
    teamsOf() { throw new Error("@openrock/teams: teamsOf is not implemented"); },
    isAlly() { throw new Error("@openrock/teams: isAlly is not implemented"); },
    registerRule() { throw new Error("@openrock/teams: registerRule is not implemented"); },
    onJoin() { throw new Error("@openrock/teams: onJoin is not implemented"); },
    onLeave() { throw new Error("@openrock/teams: onLeave is not implemented"); },
};

function register(kernel, ctx) {
    return { api };
}

module.exports = Object.assign(register, api);
