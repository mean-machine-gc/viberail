# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# viberail

Typed behavioral specifications — the blueprint for your functions.

## What this is

A TypeScript library + CLI for spec-driven development. You describe function behavior as typed data (`Spec<Fn>`), and everything else derives mechanically: tests, decision tables, dependency graphs, documentation.

## Commands

- `npm run build` — compile TypeScript to `dist/`
- `npx viberail gen` — generate `.spec.md` files and `docs/dependency-graph.md` from specs in a project
- `npx viberail check` — validate specs: example coverage, assertion strength, orphans, failure drift, inheritance completeness

Tests run via Jest (peer dependency). `testSpec()` generates Jest `describe`/`test` blocks — no special test script exists in this package itself.

## Project structure

- `src/spec-framework.ts` — core types (`Result`, `SpecFn`, `Spec`, `StepInfo`) + test runner (`testSpec`) + failure inheritance (`inheritFromSteps`)
- `src/canonical.ts` — canonical implementation pattern (`CanonicalFn`, `execCanonical`)
- `src/index.ts` — re-exports everything public
- `src/cli/spec-loader.ts` — shared spec discovery and dependency graph building (`loadSpecs`)
- `src/cli/spec-tools.ts` — decision table and dependency graph markdown generators
- `src/cli/generate-specs.ts` — `.spec.md` file generation (`generateSpecs`)
- `src/cli/index.ts` — CLI entry point (`gen` / `check` commands)
- `src/cli/check/` — 6 check implementations + orchestrator (`runChecks`, `analyzeSpecs`)
- `src/reporters/json-reporter.ts` — Jest custom reporter (`ViberailJsonReporter`)

## Key architectural concepts

### `Spec<Fn>` — the behavioral contract

`Fn` is a phantom type (`SpecFn<I, O, F, S>`) carrying input, output, failure codes, and success types as type parameters. A spec has:
- `shouldFailWith` — failure groups, each with description + examples
- `shouldSucceedWith` — success groups with examples
- `shouldAssert` — post-condition assertion functions per success type
- `steps?` — optional algorithm as `StepInfo[]`
- `document?: true` — marks the primary spec for `viberail gen` (when a module has multiple specs)

### `CanonicalFn<Fn>` — standardized implementation shape

Three ordered phases: **constraints → conditions → transform**
- `constraints`: predicates returning `true` = valid (i.e., the input satisfies this constraint; `false` = emit this failure)
- `conditions`: predicates selecting which success path applies (first match wins)
- `transform`: maps valid input to output for each success type

Run via `execCanonical(canonical, input)`.

### `StepInfo` — algorithm step types

Four step kinds: `step` (pipeline step with spec), `safe-dep` (external dep that can fail, with spec), `dep` (infrastructure dep, no spec), `strategy` (conditional dispatch with per-handler specs).

### `testSpec()` — universal Jest test runner

Auto-inherits failures from steps via `inheritFromSteps()`. Inherited failures are skipped (marked `coveredBy`). Failures with no examples become `test.todo()`.

### Failure inheritance

`inheritFromSteps(steps)` recursively traverses the step graph and hoists all descendant failure groups into the parent spec, tagging each with `coveredBy` to indicate which step already tests it.

### `loadSpecs` default glob

When used as a library, `loadSpecs()` defaults to `'src/domain/**/*.spec.ts'`. Pass `specGlob` option to override.

### Check system (`viberail check`)

Six checks in `src/cli/check/checks/`:
1. `example-completeness` — failure/success groups missing examples (warning)
2. `assertion-strength` — empty `shouldAssert` groups (warning)
3. `orphan-detection` — step references to unknown specs; atomic specs never referenced (warning)
4. `failure-union-drift` — failure codes with no examples and no `coveredBy` (error)
5. `step-impl-sync` — spec has steps but no sibling `.ts` implementation file (warning)
6. `inheritance-completeness` — inherited failures without `coveredBy` attribution (error)

`analyzeSpecs()` is a pure function; `runChecks()` is the CLI entry point that exits 1 on errors.

### JSON reporter

`ViberailJsonReporter` is a Jest custom reporter. Configure in `jest.config.ts`:
```ts
reporters: [['viberail/reporters/json-reporter', { outputFile: 'viberail-results.json' }]]
```
Outputs structured `ViberailTestReport` with per-spec pass/fail/skip/todo counts and assertion breakdowns.
