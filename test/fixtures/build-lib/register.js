// Dummy build-time fixture library - buildPipeline.js's tests only care
// about its manifest.content.* directories, never require() this file.
"use strict";

module.exports = function register() {
    return { api: {} };
};
