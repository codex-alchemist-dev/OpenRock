// @openrock/runtime-addon's NODE-SIDE entry (CommonJS, for OpenRock's own
// build-time kernel/dependency graph) - deliberately a thin placeholder.
//
// The addon's REAL behavior (config aggregation, OP/password gating, the
// config screen) lives entirely in scripts/main.js, a genuine Bedrock ES
// module (import/export) that runs INSIDE Minecraft. It does NOT go
// through this file or OpenRock's CommonJS kernel at all - see
// buildPipeline.js's own header comment for the still-unresolved question
// of whether/how OpenRock's Node-side library system (this file's world)
// ever bridges into real in-game ES-module code. This addon sidesteps that
// question entirely by being self-contained: scripts/main.js implements
// its own minimal config registry directly against real @minecraft/server
// dynamic properties, never calling into @openrock/config's (also
// CommonJS, also unbridged) runtime functions.
//
// A consuming mod's OWN real script imports scripts/main.js's
// registerAddonConfig() by a plain relative path once both packages are
// bundled into the same build (see this library's own README section in
// the OpenRock README, "Hybrid libraries") - that relative import is the
// real integration point, not this file.
"use strict";

module.exports = function register() {
    return { api: {} };
};
