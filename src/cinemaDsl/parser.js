// Crystal Cinema parser: tokens -> AST. Fully driven by the verb registry
// (verbs.js) - this file knows the statement SHAPES (cutscene/cast/wait/at/
// parallel/sequence/on skip/command) but nothing about any specific verb.
//
// AST:
//   Program   { cutscenes: Cutscene[] }
//   Cutscene  { id, line, col, body: Stmt[] }
//   Stmt      { type: "cast"|"mode"|"wait"|"cmd"|"parallel"|"sequence"|"onSkip",
//               line, col, at?: {mode:"abs"|"rel", ticks}, ... }
//   cmd       { verb, actor?, args: {pos: any[], ...kw}, refs: [{name,line,col}] }
"use strict";

const { lex } = require("./lexer.js");
const { CrystalSyntaxError } = require("../crystal/errors.js");
const { textOf, snakeToCamel } = require("../crystal/text.js");
const { resolveRef } = require("../crystal/refs.js");
const { getVerb, matchVerb } = require("./verbs.js");

function parse(source, filename, { ns = null } = {}) {
    const tokens = lex(source, filename);
    const links = [];   // every `@ns:name` read, for the build-time linker (crystal/refs.js)
    let p = 0;
    const peek = (o = 0) => tokens[p + o];
    const next = () => tokens[p++];
    const fail = (msg, tok = peek()) => { throw new CrystalSyntaxError(msg, source, tok.line, tok.col, filename); };
    const describe = t => (t.type === "EOF" ? "end of file" : t.type === "NEWLINE" ? "end of line" : JSON.stringify(t.value));
    const expect = (type, what) => {
        const t = peek();
        if (t.type !== type) fail(`expected ${what ?? type} but found ${describe(t)}`);
        return next();
    };
    const skipNewlines = () => { while (peek().type === "NEWLINE") p++; };
    const endStatement = () => {
        const t = peek();
        if (t.type !== "NEWLINE" && t.type !== "EOF" && t.type !== "RBRACE") fail(`unexpected ${describe(t)} - expected end of line`);
        if (t.type === "NEWLINE") p++;
    };

    function parseNumber() { return expect("NUM", "a number").value; }

    // One coordinate component: `12.5` (absolute) or `~`, `~3`, `~-2` (relative to where the cutscene starts: {rel: n}).
    function parseComponent() {
        if (peek().type !== "TILDE") return parseNumber();
        next();
        return { rel: peek().type === "NUM" ? next().value : 0 };
    }

    function parseCoord() {
        expect("LPAREN", "\"(\" starting a coordinate");
        const x = parseComponent(); expect("COMMA", "\",\"");
        const y = parseComponent(); expect("COMMA", "\",\"");
        const z = parseComponent(); expect("RPAREN", "\")\"");
        return [x, y, z];
    }

    /** A `@ns:name` Crystal Ref (or, in older files, a plain string) for a slot of the given kind. */
    function parseRef(kind, ctx) {
        const t = peek();
        if (t.type === "STR") return textOf(next());
        if (t.type !== "REF") return fail(`expected @namespace:name (or a quoted string) for ${ctx} but found ${describe(t)}`);
        next();
        let r;
        try { r = resolveRef(t.value, kind, ns); } catch (e) { return fail(e.message, t); }
        links.push({ kind, ns: r.ns, id: r.id, file: filename ?? null, line: t.line, col: t.col, source });
        return r.value;
    }

    // Returns the plain JSON value; pushes any cast-name reference onto `refs`.
    function parseValue(spec, refs, ctx) {
        const t = peek();
        switch (spec.type) {
            case "num": return parseNumber();
            case "dur": return expect("DUR", `a duration with a unit (e.g. 1.5s, 20t, 500ms) for ${ctx}`).value;
            case "str": return textOf(expect("STR", `a quoted string for ${ctx}`));
            case "ref": return parseRef(spec.kind, ctx);
            case "coord": return parseCoord();
            case "target":
                if (t.type === "LPAREN") return parseCoord();
                if (t.type === "IDENT") { next(); refs.push({ name: t.value, line: t.line, col: t.col }); return t.value; }
                return fail(`expected a cast name or (x, y, z) for ${ctx} but found ${describe(t)}`);
            case "ident": {
                const id = expect("IDENT", `a name for ${ctx}`);
                if (spec.enum && !spec.enum.includes(id.value)) fail(`"${id.value}" is not valid for ${ctx} - use one of: ${spec.enum.join(", ")}`, id);
                if (ctx.startsWith("camera follow")) refs.push({ name: id.value, line: id.line, col: id.col });
                return id.value;
            }
            default: return fail(`internal: unknown value type ${spec.type}`);
        }
    }

    function parseCommand(at) {
        const head = peek();
        const refs = [];
        let verb, actor = null;

        if (head.type === "IDENT" && head.value.includes(".") && !getVerb(head.value)) {
            const dot = head.value.indexOf(".");
            actor = head.value.slice(0, dot);
            const method = head.value.slice(dot + 1);
            verb = getVerb(`actor ${method}`);
            if (!verb) fail(`unknown actor action "${method}" on "${actor}"`, head);
            next();
            refs.push({ name: actor, line: head.line, col: head.col });
        } else {
            const words = [];
            for (let o = 0; peek(o).type === "IDENT" && o < 3; o++) words.push(peek(o).value);
            verb = matchVerb(words);
            if (!verb) {
                const camel = words.map(snakeToCamel);
                verb = camel.join(" ") !== words.join(" ") ? matchVerb(camel) : null;
                if (verb) tokens.warnings.push({ line: head.line, col: head.col, message: `\`${words.slice(0, verb.words.length).join(" ")}\` is deprecated - write \`${verb.name}\` (Crystal keywords are camelCase)` });
            }
            if (!verb) fail(`unknown command ${describe(head)}`, head);
            p += verb.words.length;
        }

        const args = { pos: [] };
        for (const spec of verb.pos) {
            const t = peek();
            if (t.type === "NEWLINE" || t.type === "EOF" || t.type === "RBRACE" || (t.type === "IDENT" && verb.kw[t.value] && !spec.required)) {
                if (spec.required) fail(`"${verb.name}" is missing a required ${spec.type} value`, t);
                break;
            }
            args.pos.push(parseValue(spec, refs, verb.name));
        }

        const seen = new Set();
        while (peek().type === "IDENT") {
            const k = next();
            let key = k.value;
            if (!verb.kw[key] && verb.kw[snakeToCamel(key)]) {
                tokens.warnings.push({ line: k.line, col: k.col, message: `\`${key}\` is deprecated - write \`${snakeToCamel(key)}\` (Crystal keywords are camelCase)` });
                key = snakeToCamel(key);
            }
            const spec = verb.kw[key];
            if (!spec) fail(`"${k.value}" is not a valid option for "${verb.name}"${Object.keys(verb.kw).length ? " - valid: " + Object.keys(verb.kw).join(", ") : " (it takes no options)"}`, k);
            if (seen.has(key)) fail(`option "${key}" given twice`, k);
            seen.add(key);
            args[key] = spec.type === "flag" ? true : parseValue(spec, refs, `${verb.name} ${key}`);
        }
        for (const [k, spec] of Object.entries(verb.kw)) {
            if (spec.required && !seen.has(k)) fail(`"${verb.name}" requires "${k}"`, head);
        }
        endStatement();
        return { type: "cmd", verb: verb.name, actor, args, refs, line: head.line, col: head.col, ...(at ? { at } : {}) };
    }

    function parseBlock() {
        expect("LBRACE", "\"{\"");
        if (peek().type === "NEWLINE") p++;   // a statement may start right after `{` on the same line
        const body = [];
        skipNewlines();
        while (peek().type !== "RBRACE") {
            if (peek().type === "EOF") fail("missing closing \"}\"");
            body.push(parseStatement());
            skipNewlines();
        }
        next();
        if (peek().type === "NEWLINE") p++;
        return body;
    }

    function parseStatement() {
        const t = peek();
        let at = null;
        if (t.type === "IDENT" && t.value === "at") {
            next();
            const rel = peek().type === "PLUS";
            if (rel) next();
            const d = expect("DUR", "a time like 2s after \"at\"");
            at = { mode: rel ? "rel" : "abs", ticks: d.value };
        }
        const s = peek();
        if (s.type !== "IDENT") fail(`expected a command but found ${describe(s)}`);
        const loc = { line: s.line, col: s.col };
        const withAt = node => (at ? { ...node, at } : node);

        if (s.value === "wait") {
            next();
            const d = expect("DUR", "a duration like 2s after \"wait\"");
            endStatement();
            return withAt({ type: "wait", ticks: d.value, ...loc });
        }
        if (s.value === "parallel" || s.value === "sequence") {
            next();
            return withAt({ type: s.value, body: parseBlock(), ...loc });
        }
        if (s.value === "on" && peek(1).type === "IDENT" && peek(1).value === "skip") {
            next(); next();
            return { type: "onSkip", body: parseBlock(), ...loc };
        }
        if (s.value === "cast") {
            next();
            const name = expect("IDENT", "a cast name").value;
            expect("EQ", "\"=\"");
            const kind = expect("IDENT", "\"player\" or \"entity\"");
            const node = { type: "cast", name, ...loc };
            if (kind.value === "player") {
                node.kind = "player";
                node.index = peek().type === "NUM" ? next().value : 0;
            } else if (kind.value === "entity") {
                node.kind = "entity";
                node.entityType = parseRef("entity", "the cast entity type");
                if (peek().type === "IDENT" && peek().value === "at") { next(); node.at = parseCoord(); }
            } else {
                fail(`cast kind must be "player" or "entity", got "${kind.value}"`, kind);
            }
            endStatement();
            return node;
        }
        return parseCommand(at);
    }

    const cutscenes = [];
    skipNewlines();
    while (peek().type !== "EOF") {
        const head = expect("IDENT", "\"cutscene\"");
        if (head.value !== "cutscene") fail(`expected "cutscene" but found "${head.value}"`, head);
        const id = expect("STR", "a quoted cutscene id").value;
        const body = parseBlock();
        cutscenes.push({ id, body, line: head.line, col: head.col });
        skipNewlines();
    }
    return { cutscenes, warnings: tokens.warnings, links };
}

module.exports = { parse };
