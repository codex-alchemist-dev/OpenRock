#!/usr/bin/env node
// Generates the VS Code grammar for the line-based Crystal languages (.cinema, .fmbe) from the verb registry, so the editor
// highlights exactly the keywords the compiler accepts.   node tools/genCrystalGrammar.js [--check]
"use strict";

const fs = require("fs");
const path = require("path");
const { allVerbs } = require("../src/cinemaDsl/verbs.js");

const OUT = path.join(__dirname, "vscode-crystal", "syntaxes", "crystal.tmLanguage.json");
const words = list => [...new Set(list)].sort().join("|");

function build() {
    const verbWords = allVerbs().flatMap(v => v.words);
    const options = allVerbs().flatMap(v => Object.keys(v.kw));
    const structure = ["cutscene", "scene", "cast", "group", "display", "anim", "parallel", "sequence", "on", "skip", "wait", "at", "persist", "player", "entity", "tween", "over", "ease", "loop", "steps", "auto"];
    const fmbeProps = ["base", "rot", "scale", "scaleXZ", "scaleY", "system", "extend", "tag", "var", "name", "xrot", "yrot", "pos", "item"];
    const easings = ["linear", "in", "out", "inOut", ...["Sine", "Quad", "Cubic", "Quart", "Quint", "Expo", "Circ", "Back", "Elastic", "Bounce"].flatMap(f => ["in", "out", "inOut"].map(m => m + f))];
    return {
        $schema: "https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json",
        name: "Crystal",
        scopeName: "source.crystal",
        patterns: [
            { name: "comment.line.double-slash.crystal", match: "//.*$" },
            { name: "comment.line.number-sign.deprecated.crystal", match: "#.*$" },
            { name: "comment.block.crystal", begin: "/\*", end: "\*/" },
            { name: "string.quoted.double.crystal", begin: "\"", end: "\"", patterns: [{ name: "constant.character.escape.crystal", match: "\\(?:[nrtbfv0'\"`\\]|x[0-9a-fA-F]{2}|u[0-9a-fA-F]{4}|u\{[0-9a-fA-F]+\})" }] },
            { name: "string.quoted.single.crystal", begin: "'", end: "'", patterns: [{ name: "constant.character.escape.crystal", match: "\\." }] },
            { name: "string.template.crystal", begin: "`", end: "`", patterns: [{ name: "constant.character.escape.crystal", match: "\\." }, { name: "invalid.illegal.interpolation.crystal", match: "\$\{" }] },
            { name: "entity.name.type.reference.crystal", match: "@[A-Za-z_][A-Za-z0-9_-]*?:[A-Za-z_][A-Za-z0-9_./-]*|@:[A-Za-z_][A-Za-z0-9_./-]*" },
            { name: "constant.numeric.duration.crystal", match: "(?<![\w.])-?(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:ms|s|t|px)\b" },
            { name: "constant.numeric.crystal", match: "(?<![\w.])-?(?:0[xX][0-9a-fA-F_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?)\b" },
            { name: "keyword.control.structure.crystal", match: `\b(?:${words(structure)})\b` },
            { name: "support.function.verb.crystal", match: `\b(?:${words(verbWords)})\b` },
            { name: "variable.parameter.option.crystal", match: `\b(?:${words([...options, ...fmbeProps])})\b` },
            { name: "support.constant.easing.crystal", match: `\b(?:${words(easings)})\b` },
            { name: "keyword.operator.relative.crystal", match: "~" },
            { name: "punctuation.terminator.statement.crystal", match: ";" },
            { name: "support.variable.cast.crystal", match: "\b[A-Za-z_][A-Za-z0-9_]*(?=\.[a-z][A-Za-z]*\b)" },
        ],
    };
}

const text = JSON.stringify(build(), null, 2) + "\n";
if (process.argv.includes("--check")) {
    if (!fs.existsSync(OUT) || fs.readFileSync(OUT, "utf8") !== text) { console.error("crystal.tmLanguage.json is out of date - run node tools/genCrystalGrammar.js"); process.exit(1); }
} else fs.writeFileSync(OUT, text);
module.exports = { build };
