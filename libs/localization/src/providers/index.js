// Provider registry: loads and exports built-in HTTP adapters.
"use strict";

const { registerProvider } = require("../providers.js");

registerProvider("claude", require("./claude.js"));
registerProvider("deepl", require("./deepl.js"));
registerProvider("libretranslate", require("./libretranslate.js"));

module.exports = { registerProvider };
