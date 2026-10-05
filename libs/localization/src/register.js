// @openrock/localization - see README. Pure functions are real top-level
// exports (usable from build scripts and tests without kernel wiring);
// register() exposes the same API object through the kernel.
"use strict";

// Load built-in HTTP providers
require("./providers/index.js");

const placeholders = require("./placeholders.js");
const langFile = require("./langFile.js");
const catalog = require("./catalog.js");
const extract = require("./extract.js");
const mtl = require("./mtl.js");
const sheet = require("./sheet.js");
const emit = require("./emit.js");
const project = require("./project.js");
const providers = require("./providers.js");
const prebuild = require("./prebuild.js");
const runtime = require("./runtime.js");

const api = { ...placeholders, ...langFile, ...catalog, ...extract, ...mtl, ...sheet, ...emit, ...project, ...providers, ...prebuild, ...runtime };

function register() {
    return { api };
}

module.exports = Object.assign(register, api);
