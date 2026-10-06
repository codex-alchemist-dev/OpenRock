"use strict";

// Runs a spec's generated commands through the Molang interpreter the way the client does (each frame the variables
// command assigns first, then the render chain reads them), and returns the variables the fox model ends up with.
// Used by `openrock fmbe preview`, by the DSL linter (finite values, no unset reads) and by tests.

const { commandsFor } = require("./commands.cjs");
const { run, expressionOf } = require("./molangEval.cjs");

/**
 * @param {object} spec normalized spec
 * @param {{lifeTime?: number}} [opts] value of q.life_time (seconds)
 * @returns {{vars: Object<string, number>, undefinedReads: string[], nonFinite: string[]}}
 */
function simulate(spec, { lifeTime = 1 } = {}) {
    const { render, vars } = commandsFor(spec);
    const env = {};
    const undefinedReads = new Set();
    const query = { life_time: lifeTime };
    const frame = () => { for (const c of [vars, ...render]) if (c) run(expressionOf(c), env, { query, undefinedReads }); };
    frame();
    undefinedReads.clear();
    frame(); // second frame: reads of variables that only exist after the first frame are not "unset"
    const nonFinite = Object.entries(env).filter(([, v]) => !Number.isFinite(v)).map(([k]) => k);
    return { vars: env, undefinedReads: [...undefinedReads], nonFinite };
}

module.exports = { simulate };
