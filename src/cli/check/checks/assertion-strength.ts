// Check: flag success types with empty shouldAssert groups

import type { CheckFn, CheckResult } from '../types.js'

export const checkAssertionStrength: CheckFn = (ctx) => {
    const results: CheckResult[] = []
    const spec = ctx.spec as any

    for (const [successType, group] of Object.entries(spec.shouldAssert || {}) as any[]) {
        if (!group || Object.keys(group).length === 0) {
            results.push({
                specFile: ctx.modulePath,
                specName: ctx.exportName,
                check: 'assertion-strength',
                severity: 'warning',
                message: `Success type '${successType}' has no assertions`,
            })
        }
    }

    return results
}
