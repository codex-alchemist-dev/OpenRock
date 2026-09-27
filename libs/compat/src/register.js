// @openrock/compat - the programmatic, requireable-by-name surface of
// src/compat.js's version-selection logic. libLoader.js already applies
// this automatically to every "library"-type dependency (see its own
// header comment) - this library exists for anything that wants to do the
// same resolution manually (a debugging tool, the future CLI's
// `openrock info`), or for a provider library that wants to build its own
// version-keyed API map using the same isVersionedApi() heuristic
// libLoader.js checks against.
//
// See "OpenRock Ecosystem Expansion Roadmap", OR-Track B2, in the project
// plan document.
"use strict";

const { isVersionedApi, selectApiVersion } = require("../../../src/compat.js");

module.exports = function register() {
    return { api: { isVersionedApi, selectApiVersion } };
};
