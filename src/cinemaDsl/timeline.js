// Crystal Cinema timeline compiler + validator: AST -> a flat, time-sorted
// event table per cutscene.
//
// Time model (documented in docs/cinema.md):
//  - A cursor starts at 0 ticks. `wait D` advances it. `at T cmd` SETS the
//    cursor to T (absolute) - `at +T` advances it by T - and the statement
//    runs there. Timed commands (`over`/`for`) never block the cursor.
//  - `sequence { }` runs its children in order from the cursor, advancing it.
//  - `parallel { }` starts every child at the same cursor; afterwards the
//    cursor is the latest END time among the children (commands count their
//    own `over`/`for` duration toward their end).
//  - Time may never go backwards outside `parallel`.
"use strict";

const { CinemaSyntaxError } = require("./lexer.js");
const { getVerb } = require("./verbs.js");

class CinemaCompileError extends Error {
    constructor(message, node, source, filename) {
        super(message);
        this.name = "CinemaCompileError";
        if (node && source !== undefined) {
            const e = new CinemaSyntaxError(message, source, node.line, node.col, filename);
            this.message = e.message;
            this.cinemaLine = node.line;
            this.cinemaCol = node.col;
        }
    }
}

function compileCutscene(cutscene, { source, filename } = {}) {
    const fail = (msg, node) => { throw new CinemaCompileError(msg, node, source, filename); };

    const cast = [];
    const castNames = new Set();
    const events = [];
    const onSkip = [];
    let mode = "none";
    let locked = false;
    let hasSkipBlock = false;
    let maxEnd = 0;

    function declareCast(stmt) {
        if (castNames.has(stmt.name)) fail(`cast "${stmt.name}" is declared twice`, stmt);
        if (getVerb(stmt.name)) fail(`cast name "${stmt.name}" collides with a command name`, stmt);
        castNames.add(stmt.name);
        const { type, line, col, ...rest } = stmt;
        cast.push(rest);
    }

    // Declare all casts first so a statement may reference one declared later
    // in the same cutscene body (casts are setup, not timeline events).
    const hoist = body => { for (const s of body) { if (s.type === "cast") declareCast(s); } };
    hoist(cutscene.body);

    function checkRefs(stmt) {
        for (const ref of stmt.refs ?? []) {
            if (!castNames.has(ref.name)) fail(`"${ref.name}" is not a declared cast - add \`cast ${ref.name} = ...\` to this cutscene`, ref);
        }
    }

    function emit(list, t, stmt) {
        const verb = getVerb(stmt.verb);
        const op = stmt.verb.replace(/ /g, ".");
        const args = { ...stmt.args };
        const event = { t, op, args };
        if (stmt.actor) event.actor = stmt.actor;
        list.push(event);
        const dur = verb.durationKw && typeof args[verb.durationKw] === "number" ? args[verb.durationKw] : 0;
        return t + dur;
    }

    // Returns the cursor after running `body` starting at `start`; `end` is
    // the latest end time reached (for parallel max-end bookkeeping).
    function run(body, start, list, inParallel) {
        let cursor = start;
        let end = start;
        for (const stmt of body) {
            if (stmt.type === "cast") continue;
            if (stmt.at) {
                const target = stmt.at.mode === "rel" ? cursor + stmt.at.ticks : stmt.at.ticks;
                if (target < cursor && !inParallel) fail(`time goes backwards: \`at\` ${target / 20}s is before the current time ${cursor / 20}s (use \`parallel\` for overlapping tracks)`, stmt);
                cursor = target;
            }
            end = Math.max(end, cursor);
            switch (stmt.type) {
                case "wait":
                    cursor += stmt.ticks;
                    end = Math.max(end, cursor);
                    break;
                case "sequence": {
                    const r = run(stmt.body, cursor, list, false);
                    cursor = r.cursor;
                    end = Math.max(end, r.end);
                    break;
                }
                case "parallel": {
                    let latest = cursor;
                    for (const child of stmt.body) {
                        const r = run([child], cursor, list, true);
                        latest = Math.max(latest, r.end);
                    }
                    cursor = latest;
                    end = Math.max(end, latest);
                    break;
                }
                case "onSkip":
                    if (hasSkipBlock) fail("a cutscene may have only one `on skip` block", stmt);
                    hasSkipBlock = true;
                    run(stmt.body, 0, onSkip, false);
                    break;
                case "cmd": {
                    checkRefs(stmt);
                    if (stmt.verb === "lock") locked = stmt.args.pos[0] !== "none";
                    if (stmt.verb === "unlock") locked = false;
                    if (stmt.verb === "mode") mode = stmt.args.pos[0];
                    end = Math.max(end, emit(list, cursor, stmt));
                    break;
                }
                default:
                    fail(`internal: unknown statement type ${stmt.type}`, stmt);
            }
        }
        return { cursor, end };
    }

    const result = run(cutscene.body, 0, events, false);
    maxEnd = Math.max(result.end, result.cursor);
    if (locked) fail(`cutscene "${cutscene.id}" ends with the player still locked - finish with \`unlock\` so control is always returned`, cutscene);
    events.sort((a, b) => a.t - b.t); // Array#sort is stable: same-tick order = source order
    return { id: cutscene.id, durationTicks: maxEnd, mode, cast, events, onSkip };
}

/** Compiles every cutscene in a parsed Program; rejects duplicate ids. */
function compileProgram(program, opts = {}) {
    const seen = new Set();
    return program.cutscenes.map(c => {
        if (!/^[a-z0-9][a-z0-9_.-]*$/i.test(c.id)) throw new CinemaCompileError(`cutscene id "${c.id}" is invalid - use letters, digits, ".", "_" and "-" only`, c, opts.source, opts.filename);
        if (seen.has(c.id)) throw new CinemaCompileError(`duplicate cutscene id "${c.id}"`, c, opts.source, opts.filename);
        seen.add(c.id);
        return compileCutscene(c, opts);
    });
}

module.exports = { compileCutscene, compileProgram, CinemaCompileError };
