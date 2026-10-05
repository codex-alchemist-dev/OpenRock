// @openrock/dialogue - Branching conversation engine with a .dialogue text DSL; conditions/actions registered by the mod.
// Stub: replace each TODO-throwing function with a real implementation.
// Pure functions stay real top-level exports; register() exposes the same API through the kernel.
"use strict";

const api = {
    startDialogue() { throw new Error("@openrock/dialogue: startDialogue is not implemented"); },
    registerCondition() { throw new Error("@openrock/dialogue: registerCondition is not implemented"); },
    registerAction() { throw new Error("@openrock/dialogue: registerAction is not implemented"); },
    endDialogue() { throw new Error("@openrock/dialogue: endDialogue is not implemented"); },
};

function register(kernel, ctx) {
    return { api };
}

module.exports = Object.assign(register, api);
