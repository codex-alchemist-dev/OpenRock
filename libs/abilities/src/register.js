// @openrock/abilities - Cooldowns, resource meters, charge triggers and an ability registry with activation hooks. No preset abilities.
// Stub: replace each TODO-throwing function with a real implementation.
// Pure functions stay real top-level exports; register() exposes the same API through the kernel.
"use strict";

const api = {
    registerAbility() { throw new Error("@openrock/abilities: registerAbility is not implemented"); },
    activate() { throw new Error("@openrock/abilities: activate is not implemented"); },
    cooldownOf() { throw new Error("@openrock/abilities: cooldownOf is not implemented"); },
    defineMeter() { throw new Error("@openrock/abilities: defineMeter is not implemented"); },
    adjustMeter() { throw new Error("@openrock/abilities: adjustMeter is not implemented"); },
};

function register(kernel, ctx) {
    return { api };
}

module.exports = Object.assign(register, api);
