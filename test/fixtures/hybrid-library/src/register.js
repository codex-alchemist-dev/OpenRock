// Dummy fixture hybrid library (OR-Track K) - buildPipeline.js's own
// tests only care about manifest.content.*/packs, never require() this.
"use strict";

module.exports = function register() {
    return { api: {} };
};
