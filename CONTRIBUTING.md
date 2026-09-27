# Contributing to OpenRock

Thanks for taking a look. This project is young and still finding its
shape - the manifest/kernel API in particular is expected to keep
changing for a while, so it's worth opening an issue to discuss a
non-trivial change before writing a lot of code against it.

## Ground rules

- **No runtime dependencies.** This project (and everything it wraps -
  MinUI, MCLite) is deliberately dependency-free Node, resolved via plain
  `require()`/`import`, not npm packages. Keep it that way unless there's
  a very strong reason not to.
- **`node --check` every file you touch** before opening a PR (`.js` files
  should parse cleanly as both the module system they're actually written
  in). If you added or changed logic, add or update a test in
  `test/kernel.test.js` (or the equivalent suite in whichever repo you're
  changing) - this project has no CI yet, so a PR without a way to verify
  it works by hand or by test is much harder to review.
- **Small, focused PRs.** One logical change per PR - easier to review,
  easier to revert if something's wrong.
- **Explain the "why."** A PR description that says what changed and why
  (not just what) makes review much faster, especially while the
  architecture is still moving.

## Pull request process

1. Fork the repo and create a branch off `main` for your change.
2. Make your change, following the ground rules above.
3. Run whatever test suite exists in the repo you're changing
   (`npm test` where one is set up).
4. Open a PR against `main`. Fill out the PR template - it's short.
5. Address review feedback. A maintainer will merge once it looks good.

## Reporting bugs / requesting features

Open an issue. For a bug, include what you expected, what actually
happened, and how to reproduce it. For a feature request, a short
explanation of the use case helps more than a fully-specced design - the
maintainers will work through the design with you if it's a good fit.

## Code of conduct

Be respectful, assume good faith, keep disagreements about the code, not
the person. That's it.
