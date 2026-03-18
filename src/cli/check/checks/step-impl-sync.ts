// Check: steps array declares names but sibling .ts file missing

import { existsSync } from 'fs'
import type { CheckFn, CheckResult } from '../types.js'

export const checkStepImplSync: CheckFn = (ctx) => {
    const results: CheckResult[] = []
    const spec = ctx.spec as any

    if (!spec.steps) return results

    // The implementation file is the .spec.ts path with .spec.ts → .ts
    const implPath = ctx.filePath.replace(/\.spec\.ts$/, '.ts')

    if (!existsSync(implPath)) {
        results.push({
            specFile: ctx.modulePath,
            specName: ctx.exportName,
            check: 'step-impl-sync',
            severity: 'warning',
            message: `Implementation file not found: ${implPath.replace(/.*\/src\//, 'src/')}`,
        })
    }

    return results
}
