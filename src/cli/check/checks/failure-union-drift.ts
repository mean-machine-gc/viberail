// Check: post-inheritance, failure codes with no examples AND no coveredBy — dead codes

import type { CheckFn, CheckResult } from '../types.js'
import { inheritFromSteps } from '../../../spec-framework.js'

export const checkFailureUnionDrift: CheckFn = (ctx) => {
    const results: CheckResult[] = []
    const spec = ctx.spec as any

    // Resolve all failures: inherited + explicit
    const inherited = spec.steps ? inheritFromSteps(spec.steps) : {}
    const explicit = spec.shouldFailWith || {}

    // Merge: explicit overrides inherited
    const resolved: Record<string, any> = { ...inherited }
    for (const [key, group] of Object.entries(explicit)) {
        if (group) resolved[key] = group
    }

    // Find failures with no examples and no coveredBy
    for (const [key, group] of Object.entries(resolved) as any[]) {
        if (!group) continue
        const hasExamples = group.examples?.length > 0
        const hasCoveredBy = !!group.coveredBy
        if (!hasExamples && !hasCoveredBy) {
            results.push({
                specFile: ctx.modulePath,
                specName: ctx.exportName,
                check: 'failure-union-drift',
                severity: 'error',
                message: `Failure '${key}' has no examples and no inheritance — dead failure code`,
            })
        }
    }

    return results
}
