// Crystal Cinema's lexer: the shared Crystal Core lexer (src/crystal/lexer.js) with Cinema's punctuation.
// `CinemaSyntaxError` is kept as an alias of the shared CrystalSyntaxError.
"use strict";

const { lex: coreLex, TICKS_PER_SECOND } = require("../crystal/lexer.js");
const { CrystalSyntaxError } = require("../crystal/errors.js");

const PUNCT = { "(": "LPAREN", ")": "RPAREN", "{": "LBRACE", "}": "RBRACE", ",": "COMMA", "=": "EQ", "+": "PLUS", "~": "TILDE" };

/** @returns {Array<{type: string, value?: any, line: number, col: number}> & {warnings: object[]}} */
function lex(source, filename) {
    return coreLex(source, { filename, punct: PUNCT });
}

module.exports = { lex, CinemaSyntaxError: CrystalSyntaxError, CrystalSyntaxError, TICKS_PER_SECOND };
