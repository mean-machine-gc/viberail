// Check: after inheritFromSteps(), failures in step specs not accounted for in parent

import type { CheckFn, CheckResult } from '../types.js'
import { inheritFromSteps } from '../../../spec-framework.js'

export const checkInheritanceCompleteness: CheckFn = (ctx) => {
    const results: CheckResult[] = []
    const spec = ctx.spec as any

    if (!spec.steps) return results

    // Get all failures that should be inherited from steps
    const inherited = inheritFromSteps(spec.steps)

    // Get all failures explicitly declared in the parent spec
    const explicit = spec.shouldFailWith || {}

    // Check: every inherited failure should either be present in explicit
    // (as an override with examples) or remain as inherited (with coveredBy).
    // If a failure appears in inherited but the parent spec has the same key
    // with no examples and no coveredBy, it's incomplete.
    for (const [key, inheritedGroup] of Object.entries(inherited) as any[]) {
        const explicitGroup = explicit[key]

        if (explicitGroup) {
            // Parent has an explicit override — that's fine, it takes precedence
            continue
        }

        // Inherited but not explicitly declared — this is normal (shows as test.skip).
        // But if the inherited group itself has no coveredBy, something is wrong
        // in the inheritance chain.
        if (!inheritedGroup.coveredBy) {
            results.push({
                specFile: ctx.modulePath,
                specName: ctx.exportName,
                check: 'inheritance-completeness',
                severity: 'error',
                message: `Inherited failure '${key}' has no coveredBy attribution — broken inheritance chain`,
            })
        }
    }

    return results
}
