// viberail/spec-framework.ts

// =============================================================================
// Spec Framework — types, test runner, and failure inheritance
// =============================================================================

// -- Cmd ----------------------------------------------------------------------
// Generic command envelope for the domain API. The command handler routes on
// `type` and validates `payload` before dispatching to the appropriate shell.

export type Cmd<T extends string = string, P = unknown> = { type: T; payload: P }

// -- Result -------------------------------------------------------------------

export type Result<T, F extends string = string, S extends string = string> =
    | { ok: true; value: T; successType: S[] }
    | { ok: false; errors: F[]; details?: string[] }

// -- SpecFn -------------------------------------------------------------------

export type SpecFn<I, O, F extends string, S extends string> = {
    signature: (i: I) => Result<O, F, S>
    asyncSignature: (i: I) => Promise<Result<O, F, S>>
    depSignature: (i: I) => Promise<{ ok: true; value: O; successType: S[] }>
    result: Result<O, F, S>
    input: I
    failures: F
    successTypes: S
    output: O
}
export type AnyFn = SpecFn<any, any, any, any>

// -- StrategyFn ---------------------------------------------------------------
// Phantom type bundle for strategies — enforces that all handlers share
// the same input and output types. The factory dispatch line
// `steps.strategy[tag](input)` is only sound when this holds.

export type StrategyFn<N extends string, I, O, C extends string, F extends string, S extends string> = {
    name: N
    input: I
    output: O
    cases: C
    failures: F
    successTypes: S
    handlers: Record<C, (i: I) => Result<O, F, S>>
}
export type AnyStrategyFn = StrategyFn<any, any, any, any, any, any>

// -- Steps — discriminated union ----------------------------------------------
// Each step type carries only the fields that belong to it.
//   step     → has optional spec (for failure inheritance)
//   safe-dep → wraps a raw dep with parsing/validation; has optional spec (for failure inheritance)
//   dep      → no spec (infrastructure, tested separately)
//   strategy → has handlers (Record of handler specs, keyed by case name)

export type StepStep = {
    name: string
    type: 'step'
    description: string
    spec?: Spec<AnyFn>
}

export type SafeDepStep = {
    name: string
    type: 'safe-dep'
    description: string
    spec?: Spec<AnyFn>
}

export type DepStep = {
    name: string
    type: 'dep'
    description: string
}

export type StrategyStep = {
    name: string
    type: 'strategy'
    description: string
    handlers: Record<string, Spec<AnyFn>>
}

export type StepInfo = StepStep | SafeDepStep | DepStep | StrategyStep

// -- Examples -----------------------------------------------------------------

export type FailExample<Fn extends AnyFn> = {
    description: string
    whenInput: Fn['input']
}

export type SuccessExample<Fn extends AnyFn> = {
    description: string
    whenInput: Fn['input']
    then: Fn['output']
}

// -- Groups -------------------------------------------------------------------

export type FailGroup<Fn extends AnyFn> = {
    description: string
    examples: FailExample<Fn>[]
    coveredBy?: string
}

export type SuccessGroup<Fn extends AnyFn> = {
    description: string
    examples: SuccessExample<Fn>[]
}

// -- Assertions ---------------------------------------------------------------

export type SpecAssert<Fn extends AnyFn> = (input: Fn['input'], output: Fn['output']) => boolean

export type AssertionGroup<Fn extends AnyFn> = {
    [k: string]: {
        description: string
        assert: SpecAssert<Fn>
    }
}

// -- Spec ---------------------------------------------------------------------
// Behavioral contract + optional algorithm decomposition.
// steps is the "how" — visible, reviewable, and the source for auto-inherited failures.
// When steps is present, shouldFailWith is partial — inherited failures are resolved at runtime.
// document: true opts in to .spec.md generation via `viberail gen`.

export type Spec<Fn extends AnyFn> = {
    document?: boolean
    steps?: StepInfo[]
    shouldFailWith: Partial<Record<Fn['failures'], FailGroup<Fn>>>
    shouldSucceedWith: Record<Fn['successTypes'], SuccessGroup<Fn>>
    shouldAssert: Record<Fn['successTypes'], AssertionGroup<Fn>>
}

// -- asStepSpec ---------------------------------------------------------------
// Absorbs the AnyFn erasure cast. Steps with `never` failures or any SpecFn
// variant can be passed to StepInfo.spec without `as unknown as Spec<AnyFn>`.

export const asStepSpec = <Fn extends AnyFn>(spec: Spec<Fn>): Spec<AnyFn> =>
    spec as unknown as Spec<AnyFn>

// -- inheritFromSteps() -------------------------------------------------------
// Auto-inherits failure groups from all step specs in a steps array.

const inheritFromSpec = (
    stepName: string,
    spec: Spec<AnyFn>,
    result: Record<string, FailGroup<any>>,
) => {
    // Direct failures from this spec
    for (const [key, group] of Object.entries(spec.shouldFailWith) as [string, FailGroup<any>][]) {
        if (!(key in result)) {
            result[key] = {
                description: group.description,
                examples: [],
                coveredBy: stepName,
            }
        }
    }
    // Recurse into nested steps (fractal composition)
    if (spec.steps) {
        const nested = inheritFromSteps(spec.steps)
        for (const [key, group] of Object.entries(nested)) {
            if (!(key in result)) {
                result[key] = {
                    ...group,
                    coveredBy: `${stepName} → ${group.coveredBy}`,
                }
            }
        }
    }
}

export const inheritFromSteps = (steps: StepInfo[]): Record<string, FailGroup<any>> => {
    const result: Record<string, FailGroup<any>> = {}

    for (const step of steps) {
        switch (step.type) {
            case 'step':
            case 'safe-dep':
                if (step.spec) {
                    inheritFromSpec(step.name, step.spec, result)
                }
                break

            case 'strategy':
                for (const [caseName, handlerSpec] of Object.entries(step.handlers)) {
                    inheritFromSpec(`${step.name} (${caseName})`, handlerSpec, result)
                }
                break

            case 'dep':
                // Nothing to inherit — deps are infrastructure
                break
        }
    }

    return result
}

// -- testSpec -----------------------------------------------------------------
// Universal runner. Handles both sync (Fn['signature']) and async (Fn['asyncSignature']).

export const testSpec = <Fn extends AnyFn>(
    name: string,
    spec: Spec<Fn>,
    fn: Fn['signature'] | Fn['asyncSignature'],
) => {
    // Normalize to async for uniform handling
    const run = async (input: Fn['input']): Promise<Fn['result']> => fn(input) as any

    // -- Resolve failures: merge inherited from steps + explicit overrides -----
    const resolvedFailures: Record<string, FailGroup<Fn>> = {}

    if (spec.steps) {
        const inherited = inheritFromSteps(spec.steps)
        for (const [key, group] of Object.entries(inherited)) {
            resolvedFailures[key] = group
        }
    }

    // Explicit entries override inherited ones
    for (const [key, group] of Object.entries(spec.shouldFailWith) as [string, FailGroup<Fn>][]) {
        if (group) resolvedFailures[key] = group
    }

    describe(name, () => {
        // -- Failures ---------------------------------------------------------
        describe('failures', () => {
            for (const [failure, group] of Object.entries(resolvedFailures) as [Fn['failures'], FailGroup<Fn>][]) {
                if (group.examples.length > 0) {
                    describe(`${failure} — ${group.description}`, () => {
                        for (const example of group.examples) {
                            test(example.description, async () => {
                                const result = await run(example.whenInput)
                                expect(result.ok).toBe(false)
                                if (!result.ok) {
                                    expect(result.errors).toContain(failure)
                                }
                            })
                        }
                    })
                } else if (group.coveredBy) {
                    test.skip(`${failure} — ${group.description} (covered by ${group.coveredBy})`, () => {})
                } else {
                    test.todo(`${failure} — ${group.description}`)
                }
            }
        })

        // -- Successes --------------------------------------------------------
        describe('successes', () => {
            for (const [success, group] of Object.entries(spec.shouldSucceedWith) as [Fn['successTypes'], SuccessGroup<Fn>][]) {
                describe(`${success} — ${group.description}`, () => {
                    for (const example of group.examples) {
                        test(example.description, async () => {
                            const result = await run(example.whenInput)
                            expect(result.ok).toBe(true)
                            if (result.ok) {
                                expect(result.successType).toContain(success)
                                expect(result.value).toEqual(example.then)
                            }
                        })
                    }

                    const assertions = spec.shouldAssert[success]
                    if (assertions) {
                        for (const [_, assertion] of Object.entries(assertions)) {
                            for (const example of group.examples) {
                                test(`${example.description} — ${assertion.description}`, async () => {
                                    const result = await run(example.whenInput)
                                    expect(result.ok).toBe(true)
                                    if (result.ok) {
                                        expect(assertion.assert(example.whenInput, result.value)).toBe(true)
                                    }
                                })
                            }
                        }
                    }
                })
            }
        })
    })
}
