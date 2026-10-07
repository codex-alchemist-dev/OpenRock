#!/usr/bin/env node
// Run: node test/crystalCore.test.js
// Crystal Core: the lexical syntax every Crystal language shares. The line-based languages lex with src/crystal/lexer.js;
// the Crystal TS dialects ARE TypeScript - so the claim "same strings, numbers and comments everywhere" is checked
// against the TypeScript scanner itself.
"use strict";

const assert = require("assert");
const ts = require("typescript");
const { lex } = require("../src/crystal/lexer.js");
const { textOf, snakeToCamel } = require("../src/crystal/text.js");
const { CrystalSyntaxError } = require("../src/crystal/errors.js");
const { parse: parseCinema } = require("../src/cinemaDsl/parser.js");
const { parse: parseFmbe } = require("../src/fmbeDsl/parser.js");

let passed = 0;
function test(name, fn) {
    try { fn(); passed++; console.log(`ok - ${name}`); }
    catch (e) { console.error(`FAIL - ${name}`); console.error(e); process.exitCode = 1; }
}
const L = (src, opts) => lex(src, { punct: { "(": "LPAREN", ")": "RPAREN", "{": "LBRACE", "}": "RBRACE", ",": "COMMA" }, ...opts });
const kinds = src => L(src).filter(t => t.type !== "NEWLINE" && t.type !== "EOF");

/** TypeScript's reading of `text`: the first non-trivia token's kind and cooked value. */
function tsToken(text) {
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text);
    const kind = scanner.scan();
    return { kind, value: scanner.getTokenValue() };
}

test("strings: every escape and quote style cooks to exactly what the TypeScript scanner says", () => {
    const samples = [
        '"plain"', "'single'", '"tab\\there"', '"nl\\nx"', '"cr\\rx"', '"q\\"uote"', "'q\\'uote'", '"back\\\\slash"', '"nul\\0x"',
        '"hex\\x41\\x7a"', '"uni\\u0041\\u00e9"', '"cp\\u{1F600}"', '"bvf\\b\\f\\v"', '"odd\\qescape"', '"cont\\\nued"',
        "`tpl`", "`two\nlines`", "`esc\\n\\u0041`", "`tab\\t`", '""', "''", "``", '"emoji 😀 text"',
    ];
    for (const s of samples) {
        const ours = kinds(s);
        assert.strictEqual(ours.length, 1, `one token for ${JSON.stringify(s)}`);
        assert.strictEqual(ours[0].type, "STR");
        const theirs = tsToken(s);
        assert.ok([ts.SyntaxKind.StringLiteral, ts.SyntaxKind.NoSubstitutionTemplateLiteral].includes(theirs.kind), `${s} is a string for TypeScript`);
        assert.strictEqual(ours[0].value, theirs.value, `value of ${JSON.stringify(s)}`);
    }
});

test("numbers: decimal, fraction, leading dot, exponent, hex and separators read like JavaScript; a minus folds into the number", () => {
    for (const s of ["0", "12", "1.5", ".5", "1e3", "2.5E-2", "0xFF", "0x1f", "1_000", "1_0.5_0"]) {
        const ours = kinds(s);
        assert.strictEqual(ours.length, 1, s);
        assert.strictEqual(ours[0].type, "NUM");
        const theirs = tsToken(s);
        assert.strictEqual(theirs.kind, ts.SyntaxKind.NumericLiteral);
        assert.strictEqual(ours[0].value, Number(theirs.value), s);
    }
    assert.strictEqual(kinds("-3.5")[0].value, -3.5);
    assert.strictEqual(kinds("-.5")[0].value, -0.5);
    assert.throws(() => L("1__0"), /numeric separator/);
});

test("comments: // and /* */ (also across lines) vanish exactly where TypeScript skips them", () => {
    for (const src of ["// whole line", "/* block */", "/* two\nlines */", "x // tail", "/* a */ x /* b */"]) {
        const ours = kinds(src).map(t => t.value);
        const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, src);
        const theirs = [];
        for (let k = scanner.scan(); k !== ts.SyntaxKind.EndOfFileToken; k = scanner.scan()) theirs.push(scanner.getTokenText());
        assert.deepStrictEqual(ours, theirs, JSON.stringify(src));
    }
    assert.throws(() => L("/* never closed"), /unterminated \/\* comment/);
    assert.deepStrictEqual(kinds('"// not a comment" x').map(t => t.value), ["// not a comment", "x"]);
    assert.deepStrictEqual(kinds('"/* nor this */" x').map(t => t.value), ["/* nor this */", "x"]);
});

test("a hash comment still works but is reported as deprecated", () => {
    const t = L("a # old\nb");
    assert.deepStrictEqual(t.filter(x => x.type === "IDENT").map(x => x.value), ["a", "b"]);
    assert.strictEqual(t.warnings.length, 1);
    assert.match(t.warnings[0].message, /deprecated.*\/\//);
    assert.throws(() => L("a # old\nb", { hashComments: false }), /unexpected character "#"/);
});

test("statements end at a newline OR a semicolon, interchangeably", () => {
    const types = src => L(src).map(t => t.type);
    assert.deepStrictEqual(types("a b\nc"), ["IDENT", "IDENT", "NEWLINE", "IDENT", "NEWLINE", "EOF"]);
    assert.deepStrictEqual(types("a b; c"), types("a b\nc"));
    assert.deepStrictEqual(types("a;;\n;b;"), ["IDENT", "NEWLINE", "IDENT", "NEWLINE", "EOF"], "empty statements vanish");
    assert.deepStrictEqual(kinds('a "x;y" b').map(t => t.value), ["a", "x;y", "b"], "a semicolon inside a string is text");
});

test("durations normalise to ticks; positions are 1-based and survive multi-line tokens", () => {
    assert.deepStrictEqual(kinds("1.5s 250ms 7t 2s").map(t => [t.type, t.value]), [["DUR", 30], ["DUR", 5], ["DUR", 7], ["DUR", 40]]);
    const t = L("a `x\ny` b");
    assert.deepStrictEqual(t.filter(x => x.type !== "NEWLINE" && x.type !== "EOF").map(x => [x.value, x.line, x.col]), [["a", 1, 1], ["x\ny", 1, 3], ["b", 2, 4]]);
});

test("backtick strings span lines; ${ is rejected; plain quotes may not", () => {
    assert.strictEqual(kinds("`a\nb`")[0].value, "a\nb");
    assert.strictEqual(kinds("`a\nb`")[0].multiline, true);
    assert.throws(() => L("`cost ${price}`"), /interpolation is not supported/);
    assert.throws(() => L('"line one\nline two"'), /backtick string/);
    assert.throws(() => L('"never closed'), /unterminated string/);
    assert.throws(() => L('"bad \\x4"'), /\\x escape/);
    assert.throws(() => L('"bad \\u12"'), /\\u escape/);
});

test("textOf dedents multi-line backtick text like JSX text; everything else is untouched", () => {
    const text = src => textOf(kinds(src)[0]);
    assert.strictEqual(text("`\n    Welcome back.\n      It has been a long time.\n  `"), "Welcome back.\n  It has been a long time.");
    assert.strictEqual(text("`  keep  `"), "  keep  ", "one-line backticks are exact");
    assert.strictEqual(text('"  keep  "'), "  keep  ");
    assert.strictEqual(text("`a\n\n  b`"), "a\n\nb", "text starting on the opening line stays; continuation lines are dedented");
});

test("Cinema and FMBE share it: `;`, `//`, `/* */`, backticks and one error type", () => {
    const c = parseCinema('cutscene "c" { /* hi */ lock cinematic; wait 1s; title `Chapter\n    One` ; unlock }', "c.cinema");
    assert.deepStrictEqual(c.cutscenes[0].body.map(s => s.verb ?? s.type), ["lock", "wait", "title", "unlock"]);
    assert.strictEqual(c.cutscenes[0].body[2].args.pos[0], "Chapter\nOne");
    const f = parseFmbe('scene "s" { display a block "minecraft:stone"; display b block "minecraft:dirt" at (1,0,0) // two on a line\n}', "s.fmbe");
    assert.deepStrictEqual(f.scenes[0].body.map(n => n.name), ["a", "b"]);
    for (const fn of [() => parseCinema('cutscene "c" { bogus }', "c.cinema"), () => parseFmbe('scene "s" { bogus }', "s.fmbe")]) {
        assert.throws(fn, e => e instanceof CrystalSyntaxError && /\n\s+\d+ \| /.test(e.message) && typeof e.crystalLine === "number");
    }
});

test("one naming convention: Crystal keywords are camelCase; snake_case still parses but warns", () => {
    assert.strictEqual(snakeToCamel("look_at"), "lookAt");
    assert.strictEqual(snakeToCamel("plain"), "plain");
    const ok = parseCinema('cutscene "c" {\n  lock cinematic\n  camera lookAt (1,2,3)\n  giveEffect "slowness" for 2s\n  unlock\n}', "c.cinema");
    assert.deepStrictEqual(ok.warnings, []);
    const old = parseCinema('cutscene "c" {\n  lock cinematic\n  camera look_at (1,2,3)\n  give_effect "slowness" for 2s\n  camera cut to (0,0,0) look_at (1,1,1)\n  unlock\n}', "c.cinema");
    assert.strictEqual(old.warnings.length, 3);
    assert.match(old.warnings[0].message, /`camera look_at` is deprecated - write `camera lookAt`/);
    assert.match(old.warnings[2].message, /`look_at` is deprecated - write `lookAt`/);
    assert.strictEqual(old.cutscenes[0].body[3].args.lookAt.length, 3, "the option is stored under its canonical name");
    const fm = parseFmbe('scene "s" {\n  display a block "x:y" scalexz 2 system basic\n}', "s.fmbe");
    assert.match(fm.warnings[0].message, /`scalexz` is deprecated - write `scaleXZ`/);
    assert.strictEqual(fm.scenes[0].body[0].props.scaleXZ, 2);
});

console.log(`\n${passed} passed`);
