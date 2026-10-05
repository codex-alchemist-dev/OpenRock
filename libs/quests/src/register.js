// @openrock/quests - Generic objective/state-machine engine; objective and reward types registered by the mod; per-subject state.
// Stub: replace each TODO-throwing function with a real implementation.
// Pure functions stay real top-level exports; register() exposes the same API through the kernel.
"use strict";

const api = {
    defineQuest() { throw new Error("@openrock/quests: defineQuest is not implemented"); },
    registerObjectiveType() { throw new Error("@openrock/quests: registerObjectiveType is not implemented"); },
    registerRewardType() { throw new Error("@openrock/quests: registerRewardType is not implemented"); },
    start() { throw new Error("@openrock/quests: start is not implemented"); },
    progress() { throw new Error("@openrock/quests: progress is not implemented"); },
    stateOf() { throw new Error("@openrock/quests: stateOf is not implemented"); },
};

function register(kernel, ctx) {
    return { api };
}

module.exports = Object.assign(register, api);
