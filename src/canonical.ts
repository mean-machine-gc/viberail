// viberail/canonical.ts

// =============================================================================
// Canonical Function — standardized implementation structure
// =============================================================================

import type { AnyFn } from './spec-framework.js'

// -- CanonicalFn --------------------------------------------------------------
// Standardized implementation structure for flat functions (no decomposition).
// The canonical formula: constraints → conditions → transform.
//
// - constraints: Record<F, predicate>  — returns true when input is VALID
//                                        (constraint satisfied). False → failure.
// - conditions:  Record<S, predicate>  — first match wins. Determines success type.
// - transform:   Record<S, fn>         — produces the output for the matched condition.

export type CanonicalFn<Fn extends AnyFn> = {
    constraints: Record<Fn['failures'], (input: Fn['input']) => boolean>
    conditions:  Record<Fn['successTypes'], (input: Fn['input']) => boolean>
    transform:   Record<Fn['successTypes'], (input: Fn['input']) => Fn['output']>
}

// -- execCanonical ------------------------------------------------------------
// Executes the canonical formula:
//   1. Check all constraints — accumulate failures (predicate returns false → fail)
//   2. Find first matching condition (first match wins — declaration order matters)
//   3. Transform via the matched condition's transform function
//
// Returns Fn['signature'] — a standard (input) => Result<O, F, S> function.

export const execCanonical = <Fn extends AnyFn>(
    def: CanonicalFn<Fn>,
): Fn['signature'] =>
    (input: Fn['input']): Fn['result'] => {
        // 1. Check all constraints — accumulate failures
        const errors: Fn['failures'][] = []
        for (const [failure, predicate] of Object.entries(def.constraints) as [Fn['failures'], (i: Fn['input']) => boolean][]) {
            if (!predicate(input)) errors.push(failure)
        }
        if (errors.length > 0) return { ok: false, errors }

        // 2. Find matching success condition (first match wins)
        for (const [successType, condition] of Object.entries(def.conditions) as [Fn['successTypes'], (i: Fn['input']) => boolean][]) {
            if (condition(input)) {
                // 3. Transform
                const value = def.transform[successType](input)
                return { ok: true, value, successType: [successType] }
            }
        }

        // No condition matched — should not happen if conditions are exhaustive
        return { ok: false, errors: [] as unknown as Fn['failures'][] }
    }
