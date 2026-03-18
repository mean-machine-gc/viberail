// Check: every failure/success group should have at least one example

import type { CheckFn, CheckResult } from '../types.js'

export const checkExampleCompleteness: CheckFn = (ctx) => {
    const results: CheckResult[] = []
    const spec = ctx.spec as any

    // Failure groups without examples (and not inherited)
    for (const [key, group] of Object.entries(spec.shouldFailWith || {}) as any[]) {
        if (!group) continue
        if (group.examples?.length === 0 && !group.coveredBy) {
            results.push({
                specFile: ctx.modulePath,
                specName: ctx.exportName,
                check: 'example-completeness',
                severity: 'warning',
                message: `Failure group '${key}' has no examples`,
            })
        }
    }

    // Success groups without examples
    for (const [key, group] of Object.entries(spec.shouldSucceedWith || {}) as any[]) {
        if (!group) continue
        if (group.examples?.length === 0) {
            results.push({
                specFile: ctx.modulePath,
                specName: ctx.exportName,
                check: 'example-completeness',
                severity: 'warning',
                message: `Success group '${key}' has no examples`,
            })
        }
    }

    return results
}
