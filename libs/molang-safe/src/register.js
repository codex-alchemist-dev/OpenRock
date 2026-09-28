// @openrock/molang-safe - a small validated Molang-expression builder,
// generalizing MinUI's own real, in-game-confirmed crash findings
// (lib/lintjsonui.js) so any mod authoring raw JSON UI or entity Molang -
// not just mods going through MinUI's compiler - gets the same protection.
// Three confirmed client-crashing patterns:
//   1. `>=` is not safely supported in some Molang binding contexts.
//   2. A bare empty string literal `''` crashes the client.
//   3. Division (`/`) applied to a STRING-valued property (e.g. the
//      notoriously string-typed `#inventory_stack_count`) crashes the
//      client - Molang bindings often read as strings, not numbers.
// This library both VALIDATES a hand-written expression string (catches
// mistakes after the fact) and provides safe BUILDER functions that make
// the unsafe patterns structurally impossible to write in the first place -
// prefer the builders; use validateExpression() as a last-resort check on
// anything authored outside them.
//
// See "OR-Track L", Part 1, item 6, in the project plan document.
"use strict";

module.exports = function register() {
    /** Scans a raw Molang expression string for the known-crashing patterns. Never mutates, just reports. */
    function validateExpression(expr) {
        const issues = [];
        if (typeof expr !== "string") return { valid: false, issues: ["expression must be a string"] };
        if (/>=/.test(expr)) issues.push(`contains ">=" - not safely supported in some Molang binding contexts; use not(lt(a,b)) instead`);
        if (/''/.test(expr)) issues.push(`contains a bare empty string literal '' - known to crash the client; use a real placeholder value instead`);
        if (/'[^']*'\s*\/|\/\s*'[^']*'/.test(expr)) issues.push(`contains division directly against a quoted string literal - division on a string-typed value crashes the client`);
        return { valid: issues.length === 0, issues };
    }

    // --- safe builders: structurally avoid the unsafe patterns ---

    function eq(a, b) { return `(${a} = ${b})`; }
    function neq(a, b) { return `(${a} != ${b})`; }
    function lt(a, b) { return `(${a} < ${b})`; }
    function not(expr) { return `!(${expr})`; }
    /** The safe replacement for `a >= b` - Molang's `!(a < b)` never uses the unsafe `>=` token. */
    function gte(a, b) { return not(lt(a, b)); }
    function and(...exprs) {
        if (exprs.length < 2) throw new Error("@openrock/molang-safe: and() needs at least 2 expressions");
        return `(${exprs.join(" && ")})`;
    }
    function or(...exprs) {
        if (exprs.length < 2) throw new Error("@openrock/molang-safe: or() needs at least 2 expressions");
        return `(${exprs.join(" || ")})`;
    }

    /**
     * Casts a Molang property read to a real number, per the proven
     * `(#property - 0)` technique (Bedrock bindings often surface a value
     * as a string; subtracting 0 forces real numeric coercion).
     */
    function asNumber(propertyExpr) { return `((${propertyExpr}) - 0)`; }

    /**
     * Division that can NEVER hit the string-division crash, because both
     * operands are always forced through asNumber() first - the unsafe
     * pattern is structurally unreachable through this function.
     */
    function safeDivide(numeratorExpr, denominatorExpr) {
        return `(${asNumber(numeratorExpr)} / ${asNumber(denominatorExpr)})`;
    }

    /**
     * A quoted string literal - throws instead of silently emitting the
     * known-crashing bare `''` for an empty string.
     */
    function stringLiteral(value) {
        if (value === "") throw new Error(`@openrock/molang-safe: stringLiteral("") would emit the known-crashing bare '' - pass a real placeholder value instead`);
        return `'${String(value).replace(/'/g, "\\'")}'`;
    }

    /**
     * The proven "write a constant through a property reference" technique
     * (`((#v = #v) * N)`) - used where Molang requires reading a real
     * `#property` rather than a bare numeric literal.
     */
    function bakedConstant(propertyRef, n) { return `((${propertyRef} = ${propertyRef}) * ${n})`; }

    return {
        api: {
            validateExpression,
            eq, neq, lt, not, gte, and, or,
            asNumber, safeDivide, stringLiteral, bakedConstant,
        },
    };
};
