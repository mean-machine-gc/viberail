// viberail/decider.ts

// =============================================================================
// Decider — event-first implementation structure (functional event-sourcing:
// "decide / evolve")
// =============================================================================
//
// Where a CanonicalFn picks ONE condition (first match wins) and hand-builds the
// output, a Decider lets NON-exclusive conditions EACH contribute an event, then
// derives the resulting state by folding the aggregate's `evolve` over exactly
// those events.
//
// Why this is better where multiple facts can co-occur:
//   • State can't drift from events — it IS the fold of them (one source of truth).
//   • Multi-event outcomes are first-class (a command can produce 0, 1, or many).
//   • Non-exclusive conditions are a FEATURE, not the "first match wins" footgun.
//   • "No condition fired" is a legitimate idempotent no-op — unchanged state, no
//     events — which is exactly what safe at-least-once redelivery needs.
//
// The formula: constraints → conditions (non-exclusive) → events → evolve.
//
//   - constraints: Record<F, predicate>  — true when input is VALID; false → failure (accumulated).
//   - conditions:  Record<S, predicate>  — EACH true condition fires; S IS the event/success type.
//   - events:      Record<S, fn>         — builds the event payload for a fired condition, from input.
//   - evolve:      (state, event) => state — the aggregate fold; state = events.reduce(evolve, input.state).

import type { AnyFn } from './spec-framework.js'

// State & Event are carried by the Fn's output = Outcome<State> = { state: State; events: Event[] }.
// They can be overridden (see below) to the aggregate-wide types, since `evolve` is aggregate-scoped.
type StateOf<Fn extends AnyFn> = Fn['output'] extends { state: infer St } ? St : never
type EventOf<Fn extends AnyFn> = Fn['output'] extends { events: ReadonlyArray<infer Ev> } ? Ev : never

// -- DeciderFn ----------------------------------------------------------------
// `State`/`Event` default to what the Fn's output implies, but a consumer can widen them to the whole
// aggregate (e.g. `DeciderFn<NoteAuditedCoreFn, PageAudit, PageAuditEvent>`) so the shared aggregate
// `evolve` — typed `(AggregateState, AggregateEvent) => AggregateState` — slots in without a cast.

export type DeciderFn<
    Fn extends AnyFn,
    State = StateOf<Fn>,
    Event = EventOf<Fn>,
> = {
    constraints: Record<Fn['failures'], (input: Fn['input']) => boolean>
    conditions:  Record<Fn['successTypes'], (input: Fn['input']) => boolean>
    events:      Record<Fn['successTypes'], (input: Fn['input']) => Event>
    evolve:      (state: State, event: Event) => State
}

// -- execDecider --------------------------------------------------------------
// Executes the decider formula:
//   1. Check all constraints — accumulate failures (predicate false → fail).
//   2. Collect EVERY firing condition's event, in declaration order (= fold order).
//   3. Derive state by folding `evolve` over those events, seeded from the current state.
//      No condition fired → empty events, unchanged state: a legitimate idempotent no-op.
//
// Returns Fn['signature'] — a standard (input) => Result<O, F, S> function.

export const execDecider = <Fn extends AnyFn, State = StateOf<Fn>, Event = EventOf<Fn>>(
    def: DeciderFn<Fn, State, Event>,
): Fn['signature'] =>
    (input: Fn['input']): Fn['result'] => {
        // 1. Constraints — accumulate failures
        const errors: Fn['failures'][] = []
        for (const [failure, predicate] of Object.entries(def.constraints) as [Fn['failures'], (i: Fn['input']) => boolean][]) {
            if (!predicate(input)) errors.push(failure)
        }
        if (errors.length > 0) return { ok: false, errors }

        // 2. Every firing condition contributes its event, in declaration order
        const successType: Fn['successTypes'][] = []
        const events: Event[] = []
        for (const [type, condition] of Object.entries(def.conditions) as [Fn['successTypes'], (i: Fn['input']) => boolean][]) {
            if (condition(input)) {
                successType.push(type)
                events.push(def.events[type](input))
            }
        }

        // 3. Derive state by folding evolve over the produced events, seeded from the current state.
        //    (reduce over [] returns the seed → unchanged state for the no-op case.)
        const seed = (input as { state: State }).state
        const state = events.reduce((s, e) => def.evolve(s, e), seed)

        // Final cast absorbs the State/Event ⇄ Fn['output'] variance (evolve is aggregate-scoped).
        return { ok: true, value: { state, events } as Fn['output'], successType }
    }
