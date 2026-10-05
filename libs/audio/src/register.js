// @openrock/audio - Sound/music director: playlists, crossfade by state/region, ducking during cinema/dialogue.
// Stub: replace each TODO-throwing function with a real implementation.
// Pure functions stay real top-level exports; register() exposes the same API through the kernel.
"use strict";

const api = {
    definePlaylist() { throw new Error("@openrock/audio: definePlaylist is not implemented"); },
    setState() { throw new Error("@openrock/audio: setState is not implemented"); },
    duck() { throw new Error("@openrock/audio: duck is not implemented"); },
    unduck() { throw new Error("@openrock/audio: unduck is not implemented"); },
    stop() { throw new Error("@openrock/audio: stop is not implemented"); },
};

function register(kernel, ctx) {
    return { api };
}

module.exports = Object.assign(register, api);
