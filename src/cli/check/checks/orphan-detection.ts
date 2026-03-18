// Check: specs referenced as steps but not found in graph; unreferenced sub-specs

import type { CheckFn, CheckResult } from '../types.js'
import type { SpecNode } from '../../spec-tools.js'

export const checkOrphanDetection: CheckFn = (ctx) => {
    const results: CheckResult[] = []
    const spec = ctx.spec as any

    if (!spec.steps) return results

    for (const step of spec.steps) {
        // Steps/safe-deps that reference a spec not found in the graph
        if ((step.type === 'step' || step.type === 'safe-dep') && step.spec) {
            const target = ctx.graph.nodes.get(step.spec)
            if (!target) {
                results.push({
                    specFile: ctx.modulePath,
                    specName: ctx.exportName,
                    check: 'orphan-detection',
                    severity: 'warning',
                    message: `Step '${step.name}' references a spec not found in the dependency graph`,
                })
            }
        }

        // Strategy handlers with specs not found in the graph
        if (step.type === 'strategy' && step.handlers) {
            for (const [caseName, handlerSpec] of Object.entries(step.handlers)) {
                const target = ctx.graph.nodes.get(handlerSpec as object)
                if (!target) {
                    results.push({
                        specFile: ctx.modulePath,
                        specName: ctx.exportName,
                        check: 'orphan-detection',
                        severity: 'warning',
                        message: `Strategy handler '${step.name}.${caseName}' references a spec not found in the dependency graph`,
                    })
                }
            }
        }
    }

    return results
}

/**
 * Global orphan check — finds specs that are never referenced by any parent.
 * Run once after all per-spec checks.
 */
export function checkGlobalOrphans(
    allSpecs: { exportName: string; spec: any; modulePath: string }[],
    graph: { nodes: Map<object, SpecNode> },
): CheckResult[] {
    const results: CheckResult[] = []

    // Build set of all specs that are referenced as step targets
    const referenced = new Set<object>()
    for (const node of graph.nodes.values()) {
        for (const edge of node.edges) {
            if (edge.target) {
                referenced.add(edge.target.spec)
            }
        }
        // Also check strategy handlers
        const spec = node.spec as any
        if (spec.steps) {
            for (const step of spec.steps) {
                if (step.type === 'strategy' && step.handlers) {
                    for (const handlerSpec of Object.values(step.handlers)) {
                        referenced.add(handlerSpec as object)
                    }
                }
            }
        }
    }

    // Specs with steps (composed) that are never referenced are likely roots — that's OK.
    // Specs without steps (atomic) that are never referenced are orphans.
    for (const loaded of allSpecs) {
        const spec = loaded.spec as any
        if (!spec.steps && !referenced.has(loaded.spec)) {
            // Atomic spec not referenced by any parent — potential orphan
            // Only warn if it's not a dep spec (dep specs are used at infrastructure boundary)
            const hasFailures = Object.keys(spec.shouldFailWith || {}).length > 0
            const hasExamples = Object.values(spec.shouldSucceedWith || {}).some(
                (g: any) => g.examples?.length > 0
            )
            // Dep specs typically have no failures and no examples — skip those
            if (hasFailures || hasExamples) {
                results.push({
                    specFile: loaded.modulePath,
                    specName: loaded.exportName,
                    check: 'orphan-detection',
                    severity: 'warning',
                    message: `Atomic spec is not referenced by any parent spec's steps array`,
                })
            }
        }
    }

    return results
}
