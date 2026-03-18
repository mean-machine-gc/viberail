// viberail/cli/check/index.ts — check orchestrator

import { loadSpecs, type SpecAnalysis } from '../spec-loader.js'
import type { CheckFn, CheckResult, CheckContext } from './types.js'
import { formatResults } from './formatter.js'
import { checkExampleCompleteness } from './checks/example-completeness.js'
import { checkAssertionStrength } from './checks/assertion-strength.js'
import { checkOrphanDetection, checkGlobalOrphans } from './checks/orphan-detection.js'
import { checkFailureUnionDrift } from './checks/failure-union-drift.js'
import { checkStepImplSync } from './checks/step-impl-sync.js'
import { checkInheritanceCompleteness } from './checks/inheritance-completeness.js'

const allChecks: CheckFn[] = [
    checkExampleCompleteness,
    checkAssertionStrength,
    checkOrphanDetection,
    checkFailureUnionDrift,
    checkStepImplSync,
    checkInheritanceCompleteness,
]

export type CheckSummary = {
    results: CheckResult[]
    summary: { errors: number; warnings: number; specCount: number }
}

/**
 * Run all checks against a loaded SpecAnalysis. Pure — no I/O.
 */
export function analyzeSpecs(analysis: SpecAnalysis): CheckSummary {
    const { specs, graph } = analysis
    const results: CheckResult[] = []

    for (const loaded of specs) {
        const ctx: CheckContext = {
            spec: loaded.spec,
            exportName: loaded.exportName,
            filePath: loaded.filePath,
            modulePath: loaded.modulePath,
            graph,
            allSpecs: specs,
        }
        for (const check of allChecks) {
            results.push(...check(ctx))
        }
    }

    // Global checks (cross-spec)
    results.push(...checkGlobalOrphans(specs, graph))

    const errors = results.filter(r => r.severity === 'error').length
    const warnings = results.filter(r => r.severity === 'warning').length

    return { results, summary: { errors, warnings, specCount: specs.length } }
}

/**
 * CLI entry point — loads specs, runs checks, prints results, returns exit code.
 */
export async function runChecks(opts?: { specGlob?: string }): Promise<number> {
    const analysis = await loadSpecs(opts)

    if (analysis.specs.length === 0) {
        console.log('No specs found — nothing to check.')
        return 0
    }

    const { results, summary } = analyzeSpecs(analysis)

    formatResults(results, summary.specCount)

    return summary.errors > 0 ? 1 : 0
}
