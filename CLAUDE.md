# viberail

Typed behavioral specifications — the blueprint for your functions.

## What this is

A TypeScript library + CLI for spec-driven development. You describe function behavior as typed data (`Spec<Fn>`), and everything else derives mechanically: tests, decision tables, dependency graphs, documentation.

## Project structure

- `src/spec-framework.ts` — core types (`Result`, `SpecFn`, `Spec`, `StepInfo`) + test runner (`testSpec`) + failure inheritance (`inheritFromSteps`)
- `src/canonical.ts` — canonical implementation pattern (`CanonicalFn`, `execCanonical`)
- `src/index.ts` — re-exports everything
- `src/cli/spec-loader.ts` — shared spec discovery and graph building (`loadSpecs`)
- `src/cli/` — CLI tools: spec generation, decision tables, dependency graphs, spec checks
- `.claude/skills/` — AI companion skills for the viberail workflow

## Commands

- `npm run build` — compile TypeScript
- `npx viberail gen` — generate `.spec.md` files and dependency graph from a project
- `npx viberail check` — validate specs: example coverage, assertion strength, orphans, failure drift, inheritance completeness

## Key concepts

- `Spec<Fn>` — behavioral contract: failures, successes, assertions, optional algorithm (steps)
- `CanonicalFn<Fn>` — standardized flat implementation: constraints → conditions → transform
- `StepInfo` — algorithm step types: step, safe-dep, dep, strategy
- `testSpec()` — universal test runner, auto-inherits failures from steps
- Decision tables — generated truth tables showing all failure/success paths
