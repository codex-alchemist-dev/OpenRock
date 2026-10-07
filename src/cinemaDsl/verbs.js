// Crystal Cinema verb registry: the ONE place that says which commands the
// language has, what positional values and keyword values each takes, and
// which keyword (if any) is the command's duration. The parser, validator
// and timeline compiler are all data-driven off this table, so adding a verb
// (here, or from a library via registerVerb) never touches them.
//
// Value types: "num" | "dur" | "str" | "ident" | "coord" |
// "target" (a cast name or a coord) | "flag" (keyword with no value).
// A spec is either a bare type string or { type, enum?, required? }.
"use strict";

const EASES = ["linear", "in", "out", "inOut", "inSine", "outSine", "inOutSine", "inQuad", "outQuad", "inOutQuad", "inCubic", "outCubic", "inOutCubic"];

const VERBS = new Map();

/**
 * @param {string} name space-separated words, e.g. "camera move"
 * @param {{pos?: any[], kw?: Record<string, any>, durationKw?: string, doc?: string}} def
 */
function registerVerb(name, def) {
    if (VERBS.has(name)) throw new Error(`cinema verb "${name}" is already registered`);
    const norm = spec => (typeof spec === "string" ? { type: spec } : { ...spec });
    VERBS.set(name, {
        name,
        words: name.split(" "),
        pos: (def.pos ?? []).map(norm),
        kw: Object.fromEntries(Object.entries(def.kw ?? {}).map(([k, v]) => [k, norm(v)])),
        durationKw: def.durationKw ?? null,
        actor: Boolean(def.actor),
        doc: def.doc ?? "",
    });
}

function getVerb(name) { return VERBS.get(name) ?? null; }
function allVerbs() { return [...VERBS.values()]; }

/** Longest registered verb whose words prefix `words`; null if none. */
function matchVerb(words) {
    for (let n = Math.min(words.length, 3); n >= 1; n--) {
        const v = VERBS.get(words.slice(0, n).join(" "));
        if (v) return v;
    }
    return null;
}

const ease = { type: "ident", enum: EASES };
const req = type => ({ type, required: true });

registerVerb("lock", { pos: [{ type: "ident", enum: ["cinematic", "position", "free"], required: true }], doc: "cinematic = camera+movement locked; position = movement locked, rotation free (360); free = free-cam, creator beware" });
registerVerb("unlock", { doc: "release camera and movement locks, restore control" });
registerVerb("mode", { pos: [{ type: "ident", enum: ["none", "letterbox"], required: true }], doc: "letterbox bars (drawn by the game's UI hook)" });
registerVerb("fade", { pos: [{ type: "ident", enum: ["in", "out"], required: true }, req("dur")] });
registerVerb("camera cut", { kw: { to: req("coord"), look_at: "target", fov: "num" } });
registerVerb("camera move", { kw: { to: req("coord"), over: req("dur"), ease, look_at: "target" }, durationKw: "over" });
registerVerb("camera look_at", { pos: [req("target")], kw: { over: "dur", ease }, durationKw: "over" });
registerVerb("camera follow", { pos: [req("ident")] });
registerVerb("camera orbit", { kw: { around: req("target"), radius: "num", speed: "num", over: req("dur") }, durationKw: "over" });
registerVerb("camera shake", { kw: { strength: "num", for: req("dur") }, durationKw: "for" });
registerVerb("camera fov", { pos: [req("num")], kw: { over: "dur", ease }, durationKw: "over" });
registerVerb("camera pan_up", { kw: { over: req("dur"), ease }, durationKw: "over", doc: "tilt the camera up to look at the sky (pitch -90), keeping its yaw" });
registerVerb("screen show", { pos: [req("str")], kw: { fill: "flag", fade: "dur" } });
registerVerb("screen hide", { kw: { fade: "dur" } });
// FMBE display entities (see docs/fmbe.md): any block or item, shown with its real model anywhere in the world.
// A display has a NAME chosen at `display show`; every later display verb refers to it. Positions are world
// coordinates, `rot` is degrees (x, y, z), `scale` 1 = a full block.
const KINDS = ["block", "block2d", "item"];
registerVerb("display show", {
    pos: [req("ident"), { type: "ident", enum: KINDS, required: true }, req("str")],
    kw: { at: req("coord"), rot: "coord", scale: "num", base: "coord", system: { type: "ident", enum: ["advanced", "basic", "static"] }, for: "dur" },
    durationKw: "for",
    doc: "show <name> <block|block2d|item> \"<id>\" at <coord> [rot] [scale] [base] [system] [for]: spawn a display; `for` removes it again",
});
registerVerb("display scene", {
    pos: [req("ident"), req("str")],
    kw: { at: req("coord"), yaw: "num", scale: "num", for: "dur" },
    durationKw: "for",
    doc: "scene <name> \"<scene id>\" at <coord> [yaw] [scale] [for]: spawn a compiled FMBE scene (content.fmbeDsl)",
});
registerVerb("display move", { pos: [req("ident")], kw: { to: req("coord"), over: req("dur"), ease }, durationKw: "over", doc: "move a display to a world coordinate (client-side within ~4 blocks, otherwise the entity glides)" });
registerVerb("display rotate", { pos: [req("ident")], kw: { to: req("coord"), over: req("dur"), ease, loop: { type: "ident", enum: ["none", "repeat", "pingpong"] } }, durationKw: "over", doc: "rotate to (x, y, z) degrees; any angle (720 = two turns) is exact" });
registerVerb("display spin", { pos: [req("ident")], kw: { by: req("num"), over: req("dur"), ease }, durationKw: "over", doc: "turn about the vertical axis by <by> degrees" });
registerVerb("display scale", { pos: [req("ident")], kw: { to: req("num"), over: req("dur"), ease }, durationKw: "over" });
registerVerb("display item", { pos: [req("ident"), req("str")], doc: "swap what the display shows" });
registerVerb("display play", { pos: [req("ident"), req("str")], doc: "run a named animation of a scene display" });
registerVerb("display stop", { pos: [req("ident"), req("str")], doc: "freeze a named animation of a scene display" });
registerVerb("display hide", { pos: [req("ident")] });
registerVerb("particles", { pos: [req("str")], kw: { at: req("coord"), radius: "num", count: "num", for: "dur" }, durationKw: "for" });
registerVerb("sound", { pos: [req("str")], kw: { at: "coord", volume: "num", pitch: "num" } });
registerVerb("title", { pos: [req("str")], kw: { subtitle: "str", for: "dur", fade: "dur" }, durationKw: "for" });
registerVerb("call", { pos: [req("str")], doc: "invoke a registered script function by name" });
registerVerb("emit", { pos: [req("str")], doc: "emit a named script event" });
registerVerb("mark_seen", { pos: [req("str")], doc: "mark a cutscene id as seen for the player" });
registerVerb("camera dolly", { kw: { by: req("coord"), over: req("dur") }, durationKw: "over" });
registerVerb("weather", { pos: [{ type: "ident", enum: ["clear", "rain", "thunder"], required: true }] });
registerVerb("time", { pos: [req("num")] });
registerVerb("clear_effects", {});
registerVerb("give_effect", { pos: [req("str")], kw: { for: "dur", level: "num" }, durationKw: "for" });
registerVerb("teleport_player", { pos: [req("coord")] });
registerVerb("heal", {});
registerVerb("set_flag", { pos: [req("str")] });

registerVerb("actor play", { actor: true, pos: [req("str")], kw: { loop: "flag" } });
registerVerb("actor say", { actor: true, pos: [req("str")], kw: { for: "dur" }, durationKw: "for" });
registerVerb("actor emote", { actor: true, pos: [req("str")] });
registerVerb("actor teleport", { actor: true, pos: [req("coord")] });
registerVerb("actor face", { actor: true, pos: [req("target")] });
registerVerb("actor move", { actor: true, pos: [req("coord")], kw: { over: req("dur") }, durationKw: "over" });
registerVerb("actor despawn", { actor: true });

module.exports = { EASES, registerVerb, getVerb, allVerbs, matchVerb };
