# viberail

Typed behavioral specifications — the blueprint for your functions.

Describe function behavior as typed data (`Spec<Fn>`), and everything else derives mechanically: tests, decision tables, dependency graphs, documentation.

## Install

```bash
npm install viberail
```

## Core idea

A **spec** is a typed object that declares what a function should do — its failure modes, success paths, examples, and assertions. No test framework DSL, no decorators, no magic strings. Just data.

```ts
import { Spec, SpecFn, Result } from 'viberail'

// 1. Define the function's type signature
type ParseEmail = SpecFn<
  string,                          // input
  { user: string; domain: string },// output
  'empty' | 'invalid-format',     // failure types
  'parsed'                         // success types
>

// 2. Write the spec
export const parseEmailSpec: Spec<ParseEmail> = {
  shouldFailWith: {
    'empty': {
      description: 'Rejects empty strings',
      examples: [
        { description: 'empty string', whenInput: '' },
      ],
    },
    'invalid-format': {
      description: 'Rejects strings without @',
      examples: [
        { description: 'no at sign', whenInput: 'foo' },
      ],
    },
  },
  shouldSucceedWith: {
    parsed: {
      description: 'Splits email into user and domain',
      examples: [
        {
          description: 'simple email',
          whenInput: 'alice@example.com',
          then: { user: 'alice', domain: 'example.com' },
        },
      ],
    },
  },
  shouldAssert: {
    parsed: {
      noEmptyParts: {
        description: 'Neither user nor domain is empty',
        assert: (_input, output) => output.user.length > 0 && output.domain.length > 0,
      },
    },
  },
}
```

## Testing

`testSpec` generates Jest tests from your spec — one test per example, plus assertion checks on every success example.

```ts
import { testSpec } from 'viberail'
import { parseEmailSpec } from './parse-email.spec'
import { parseEmail } from './parse-email'

testSpec('parseEmail', parseEmailSpec, parseEmail)
```

This generates a full test suite:

```
parseEmail
  failures
    empty — Rejects empty strings
      ✓ empty string
    invalid-format — Rejects strings without @
      ✓ no at sign
  successes
    parsed — Splits email into user and domain
      ✓ simple email
      ✓ simple email — Neither user nor domain is empty
```

Inherited failures from steps are auto-skipped with `coveredBy` attribution. Failures without examples show as `test.todo`.

## Canonical implementation

For flat functions (no decomposition into steps), `CanonicalFn` + `execCanonical` gives a standardized structure: **constraints → conditions → transform**.

```ts
import { CanonicalFn, execCanonical } from 'viberail'

const def: CanonicalFn<ParseEmail> = {
  constraints: {
    'empty': (input) => input.length > 0,           // true = valid
    'invalid-format': (input) => input.includes('@'),
  },
  conditions: {
    parsed: (_input) => true,  // only one success path
  },
  transform: {
    parsed: (input) => {
      const [user, domain] = input.split('@')
      return { user, domain }
    },
  },
}

export const parseEmail = execCanonical<ParseEmail>(def)
```

The executor checks all constraints (accumulating failures), finds the first matching condition, and runs its transform. Returns a `Result<O, F, S>`.

## Algorithm steps

Specs can declare an algorithm as a sequence of typed steps. This enables failure inheritance — child step failures automatically propagate to the parent spec.

```ts
import { Spec, StepInfo, asStepSpec } from 'viberail'

const steps: StepInfo[] = [
  { name: 'validateInput', type: 'step', description: 'Validate raw input', spec: asStepSpec(validateInputSpec) },
  { name: 'fetchUser', type: 'dep', description: 'Load user from database' },
  { name: 'normalize', type: 'safe-dep', description: 'Parse and normalize data', spec: asStepSpec(normalizeSpec) },
  { name: 'route', type: 'strategy', description: 'Route by account type', handlers: {
    free: freeHandlerSpec,
    paid: paidHandlerSpec,
  }},
]

export const processOrderSpec: Spec<ProcessOrder> = {
  steps,
  shouldFailWith: {
    // Only declare failures unique to this level.
    // Failures from validateInput, normalize, and strategy handlers
    // are inherited automatically via inheritFromSteps().
  },
  shouldSucceedWith: { /* ... */ },
  shouldAssert: { /* ... */ },
}
```

**Step types:**

| Type | Has spec? | Purpose |
|------|-----------|---------|
| `step` | optional | Composable domain logic |
| `safe-dep` | optional | Wraps external dependency with parsing/validation |
| `dep` | no | Infrastructure dependency (tested separately) |
| `strategy` | handlers | Conditional dispatch — one spec per case |

## Result type

All functions return `Result<T, F, S>`:

```ts
// Success
{ ok: true, value: T, successType: S[] }

// Failure
{ ok: false, errors: F[], details?: string[] }
```

## CLI

### `viberail gen`

Generates `.spec.md` documentation files and a Mermaid dependency graph from your specs.

```bash
npx viberail gen
```

For each `.spec.ts` file with `document: true`, generates a markdown file containing:
- Pipeline table (step sequence with types and failure modes)
- Decision table (all failure/success paths as a truth table)
- Strategy handler sub-tables

Also generates `docs/dependency-graph.md` with a Mermaid flowchart showing spec dependencies grouped by domain.

### `viberail check`

Validates your specs across 6 dimensions:

```bash
npx viberail check
```

| Check | Severity | What it catches |
|-------|----------|-----------------|
| Example completeness | warning | Failure/success groups with no examples |
| Assertion strength | warning | Success types with no assertions |
| Orphan detection | warning | Steps referencing specs not in the graph |
| Failure union drift | error | Dead failures — no examples and no `coveredBy` |
| Step-impl sync | warning | `.spec.ts` has steps but no sibling `.ts` implementation |
| Inheritance completeness | error | Inherited failure with no `coveredBy` chain |

Exits with code 1 if any errors are found.

## JSON test reporter

A custom Jest reporter that outputs structured test results:

```json
// jest.config.js
{
  "reporters": ["default", "viberail/dist/reporters/json-reporter.js"]
}
```

Outputs a JSON file with per-spec results, pass/fail/skip/todo counts, assertion breakdowns, and timing.

## Programmatic API

Everything is exported from the main entry point:

```ts
import {
  // Core types
  type Spec, type SpecFn, type Result, type Cmd,
  type StepInfo, type FailGroup, type SuccessGroup,

  // Test runner
  testSpec,

  // Failure inheritance
  inheritFromSteps,

  // Canonical pattern
  type CanonicalFn, execCanonical,

  // Spec loading & analysis
  loadSpecs,

  // Checks
  runChecks, analyzeSpecs,

  // Generation
  generateSpecs,
} from 'viberail'
```

## License

MIT
