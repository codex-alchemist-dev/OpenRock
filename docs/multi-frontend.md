# Multi-frontend compiler shape (OR-Track P)

OpenRock's real script build today is a single frontend (TypeScript/JavaScript
authoring against `@openrock/*` libraries) compiled by a single, already-shared
backend: `buildPipeline.js`'s `bundleScripts()`, a real `esbuild` bundle that
resolves cross-package bare-specifier imports via each dependency's declared
entry file and leaves Bedrock's own `@minecraft/*` modules external.

This document is **not a proposal to replace TypeScript**. It exists because
demand 2 of the session that produced OR-Track M/N/O asked, explicitly:
*"the same compiler that manages those [a GDScript-like language, Kotlin]
should also be able to compile JS that uses OpenRock functions into JS that
is minecraft-native."* The real, load-bearing work behind that request is
**OR-Track N** (making every `@openrock/*` library's top-level exports real,
tree-shaking-safe CommonJS/ESM, done and BDS-verified) — that's what makes
the *existing* TS/JS frontend able to genuinely `import` OpenRock library
code and have it bundle correctly. This document records the shape a
*second* frontend would plug into, so that work is a real, scoped addition
later rather than a redesign.

## Precedent

The shape mirrors two real, shipped systems: LLVM's frontend → IR → backend
split (many frontends - Clang, Rust, Swift - target one shared IR and one
set of backends), and Kotlin K2's source → FIR → shared IR → per-target
backend pipeline (Kotlin/JVM, Kotlin/JS, Kotlin/Native share lowering and
backend infrastructure while each source language/target pair gets its own
frontend). Neither precedent is cited to justify building either system here
— only to ground the shape below in something real and proven.

## Why TS/JS needs no separate "lowering" step

For the one frontend that exists today, there is no IR distinct from the
compiled JS itself: `tsc`'s output **is** the IR, and `bundleScripts()`
**is** already the shared backend. It just was never framed that way,
because there was never a second frontend to distinguish it from.

## The contract

A future frontend (a GDScript-like scripting language, a Kotlin-to-JS
target, or anything else) implements exactly one function:

```
FrontendAdapter = (sourceFiles) => { entryFile: string, generatedDir: string }
```

That is: parse your own source syntax, emit real, valid ES module source
files on disk (referencing the same `@openrock/*` package names any TS/JS
mod would import), and hand back the one file `bundleScripts()` should treat
as the bundling entry point. From that point on, the existing pipeline runs
completely unmodified — `resolveMap`/`alias` resolution, `external` handling
for Bedrock's built-in modules, real source maps, everything `buildMod()`
already does for a TS/JS mod today.

A frontend adapter is responsible for:
- Its own parsing/type-checking/error reporting.
- Emitting real ESM `import`/`export` statements against real
  `@openrock/*` package names — not some other module format the shared
  backend would need special-cased handling for.
- Nothing else. It does not touch `bundleScripts()`, `resolveBundledLibraryDirs()`,
  or any other part of the existing pipeline.

## What this document is not

No frontend beyond TS/JS is implemented as part of this track. This is a
written interface contract plus this one page of documentation — real,
citable, and enough for a future implementer to build against without
guessing the shape — and nothing more. Building an actual GDScript-like or
Kotlin frontend is real, separate, future work, explicitly out of scope
here per the user's own stated priority ("those are not the priority").
