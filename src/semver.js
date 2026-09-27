// A scoped-down, dependency-free reimplementation of the real npm-style
// semver range grammar - not the full `node-semver` package. Covers exact
// pins, caret (^) and tilde (~) ranges, x-ranges/wildcards, hyphen ranges,
// and space-separated comparator conjunctions (">=1.2.3 <2.0.0"). Does NOT
// support "||" (a set of alternative ranges) - if that's ever genuinely
// needed, pull in real node-semver rather than growing this file to match
// it; OpenRock's own manifests only ever need one range per dependency.
//
// See "OpenRock Ecosystem Expansion Roadmap", OR-Track A2, in the project
// plan document.
"use strict";

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

/**
 * Parses a strict "major.minor.patch[-prerelease][+build]" string. Build
 * metadata is accepted but discarded (it never affects precedence, per the
 * semver spec). Returns null for anything that doesn't parse.
 */
function parse(versionStr) {
    if (typeof versionStr !== "string") return null;
    const m = VERSION_RE.exec(versionStr.trim());
    if (!m) return null;
    return {
        major: Number(m[1]),
        minor: Number(m[2]),
        patch: Number(m[3]),
        prerelease: m[4] ? m[4].split(".") : [],
    };
}

function isValidVersion(versionStr) {
    return parse(versionStr) !== null;
}

/** Compares two parsed-or-string versions. Returns -1, 0, or 1. */
function compare(a, b) {
    const va = typeof a === "string" ? parse(a) : a;
    const vb = typeof b === "string" ? parse(b) : b;
    if (!va || !vb) throw new Error(`compare(): both arguments must be valid versions, got ${JSON.stringify(a)} and ${JSON.stringify(b)}`);
    for (const key of ["major", "minor", "patch"]) {
        if (va[key] !== vb[key]) return va[key] < vb[key] ? -1 : 1;
    }
    // No prerelease sorts higher than any prerelease (1.0.0 > 1.0.0-rc.1).
    if (va.prerelease.length === 0 && vb.prerelease.length > 0) return 1;
    if (va.prerelease.length > 0 && vb.prerelease.length === 0) return -1;
    const len = Math.max(va.prerelease.length, vb.prerelease.length);
    for (let i = 0; i < len; i++) {
        const pa = va.prerelease[i];
        const pb = vb.prerelease[i];
        if (pa === undefined) return -1;
        if (pb === undefined) return 1;
        const na = Number(pa), nb = Number(pb);
        const numericA = String(na) === pa, numericB = String(nb) === pb;
        if (numericA && numericB) { if (na !== nb) return na < nb ? -1 : 1; }
        else if (numericA !== numericB) return numericA ? -1 : 1; // numeric identifiers sort lower than alphanumeric
        else if (pa !== pb) return pa < pb ? -1 : 1;
    }
    return 0;
}

// --- Partial version parsing, for x-ranges and hyphen-range bounds ---

// Splits "1.2.x" / "1.x" / "1" / "*" / "" into up to 3 numeric-or-null
// components. A missing/wildcard trailing component is represented as null.
function parsePartial(str) {
    const trimmed = (str ?? "").trim();
    if (trimmed === "" || trimmed === "*" || trimmed.toLowerCase() === "x") return [null, null, null];
    const parts = trimmed.replace(/^v/, "").split(".");
    const out = [];
    for (let i = 0; i < 3; i++) {
        const p = parts[i];
        if (p === undefined || p === "" || p.toLowerCase() === "x" || p === "*") out.push(null);
        else if (/^\d+$/.test(p)) out.push(Number(p));
        else return null; // not a valid partial version at all
    }
    return out;
}

/** A partial used as a range's lower bound: missing components default to 0. */
function partialAsMin(parts) {
    return { major: parts[0] ?? 0, minor: parts[1] ?? 0, patch: parts[2] ?? 0, prerelease: [] };
}

/**
 * A partial used as a range's upper bound. A fully-specified version is
 * an INCLUSIVE upper bound; a partial one means "anything with that
 * prefix", which becomes an EXCLUSIVE bound at the next unit up.
 * Returns { version, inclusive }.
 */
function partialAsMax(parts) {
    if (parts[0] === null) return { version: null, inclusive: true }; // "*" - no upper bound at all
    if (parts[1] === null) return { version: { major: parts[0] + 1, minor: 0, patch: 0, prerelease: [] }, inclusive: false };
    if (parts[2] === null) return { version: { major: parts[0], minor: parts[1] + 1, patch: 0, prerelease: [] }, inclusive: false };
    return { version: { major: parts[0], minor: parts[1], patch: parts[2], prerelease: [] }, inclusive: true };
}

function gte(v, bound) { return compare(v, bound) >= 0; }
function lte(v, bound) { return compare(v, bound) <= 0; }
function lt(v, bound) { return compare(v, bound) < 0; }

// --- Single-token comparators (^, ~, plain comparator ops, bare x-ranges) ---

const OP_RE = /^(\^|~|>=|<=|>|<|=)?(.+)$/;

/** Builds a `(parsedVersion) => boolean` predicate for one range token. */
function tokenToPredicate(token) {
    const m = OP_RE.exec(token.trim());
    if (!m) throw new Error(`semver: unparseable range token "${token}"`);
    const [, op, rest] = m;

    if (op === "^" || op === "~") {
        const parts = parsePartial(rest);
        if (!parts) throw new Error(`semver: invalid version in "${token}"`);
        const min = partialAsMin(parts);
        let max;
        if (op === "~") {
            // ~1.2.3 := >=1.2.3 <1.3.0 | ~1.2 := >=1.2.0 <1.3.0 | ~1 := >=1.0.0 <2.0.0
            max = parts[1] === null ? { major: parts[0] + 1, minor: 0, patch: 0, prerelease: [] }
                                     : { major: parts[0], minor: parts[1] + 1, patch: 0, prerelease: [] };
        } else {
            // ^ - up to (not including) the next change that semver allows a
            // consumer to assume is breaking, with the well-known 0.x
            // special cases: ^0.2.3 := >=0.2.3 <0.3.0, ^0.0.3 := >=0.0.3 <0.0.4.
            if (parts[0] !== 0) max = { major: parts[0] + 1, minor: 0, patch: 0, prerelease: [] };
            else if (parts[1] === null) max = { major: 1, minor: 0, patch: 0, prerelease: [] };
            else if (parts[1] !== 0) max = { major: 0, minor: parts[1] + 1, patch: 0, prerelease: [] };
            else if (parts[2] === null) max = { major: 0, minor: 1, patch: 0, prerelease: [] };
            else max = { major: 0, minor: 0, patch: parts[2] + 1, prerelease: [] };
        }
        return v => gte(v, min) && lt(v, max);
    }

    if (op === ">=") { const b = parse(rest); if (!b) throw new Error(`semver: invalid version in "${token}"`); return v => gte(v, b); }
    if (op === "<=") { const b = parse(rest); if (!b) throw new Error(`semver: invalid version in "${token}"`); return v => lte(v, b); }
    if (op === ">")  { const b = parse(rest); if (!b) throw new Error(`semver: invalid version in "${token}"`); return v => compare(v, b) > 0; }
    if (op === "<")  { const b = parse(rest); if (!b) throw new Error(`semver: invalid version in "${token}"`); return v => lt(v, b); }

    // No operator (or explicit "=") - either an exact pin or a bare x-range/partial.
    const parts = parsePartial(rest);
    if (!parts) throw new Error(`semver: invalid version in "${token}"`);
    if (parts[0] === null) return () => true; // "*" / "" - matches anything
    const min = partialAsMin(parts);
    const { version: max, inclusive } = partialAsMax(parts);
    if (max === null) return v => gte(v, min);
    return v => gte(v, min) && (inclusive ? lte(v, max) : lt(v, max));
}

const HYPHEN_RE = /^\s*(\S+)\s+-\s+(\S+)\s*$/;

/** Builds a `(parsedVersion) => boolean` predicate for a full range string. */
function rangeToPredicate(range) {
    const trimmed = (range ?? "").trim();
    if (trimmed === "" || trimmed === "*") return () => true;

    const hyphen = HYPHEN_RE.exec(trimmed);
    if (hyphen) {
        const lowParts = parsePartial(hyphen[1]);
        const highParts = parsePartial(hyphen[2]);
        if (!lowParts || !highParts) throw new Error(`semver: invalid hyphen range "${range}"`);
        const min = partialAsMin(lowParts);
        const { version: max, inclusive } = partialAsMax(highParts);
        return v => gte(v, min) && (max === null ? true : (inclusive ? lte(v, max) : lt(v, max)));
    }

    // Space-separated tokens are ANDed together (npm's "simple range" form).
    // "||" (alternative range sets) is deliberately unsupported - see the
    // file header.
    if (trimmed.includes("||")) throw new Error(`semver: "||" alternative range sets are not supported by this scoped-down implementation: "${range}"`);
    const predicates = trimmed.split(/\s+/).map(tokenToPredicate);
    return v => predicates.every(p => p(v));
}

/** True if `versionStr` satisfies `range`. Throws if either fails to parse. */
function satisfies(versionStr, range) {
    const v = parse(versionStr);
    if (!v) throw new Error(`semver: "${versionStr}" is not a valid version`);
    return rangeToPredicate(range)(v);
}

/** Non-throwing check that a range string is at least well-formed. */
function isValidRange(range) {
    try { rangeToPredicate(range); return true; }
    catch { return false; }
}

module.exports = { parse, isValidVersion, compare, satisfies, isValidRange };
