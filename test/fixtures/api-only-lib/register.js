// A minimal fixture library with NO content.scriptsDir at all - only
// provides.api - matching the real shape of OpenRock's own libs/pathfinding
// etc. (OR-Track N). Proves buildPipeline.js's alias resolution reaches a
// library like this, not just ones that also happen to declare scripts.
"use strict";

function double(n) { return n * 2; }

function register() {
    return { api: { double } };
}

module.exports = register;
module.exports.double = double;
