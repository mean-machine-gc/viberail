// viberail/cli/spec-tools.ts

// =============================================================================
// Spec Tools — flatten specs into decision tables
// Strategy-aware: produces main table (linear) + per-handler sub-tables.
// Dependency graph: builds a navigable graph of spec nodes and step edges.
// =============================================================================

import type { Spec, StepInfo, StrategyStep } from '../spec-framework.js'
import { relative, dirname } from 'path'

// -- Dependency Graph ---------------------------------------------------------

export type SpecNode = {
    name: string          // kebab-case from filename
    specPath: string      // absolute path to .spec.md
    spec: object          // object reference (for lookup by identity)
    edges: SpecEdge[]     // outgoing deps (populated after all nodes built)
}

export type SpecEdge = {
    stepName: string      // e.g. 'checkActivatableState'
    type: 'step' | 'safe-dep' | 'dep' | 'strategy'
    target: SpecNode | null  // null for deps or unresolved refs
}

export type DependencyGraph = {
    nodes: Map<object, SpecNode>  // lookup by spec object identity
}

// -- Types --------------------------------------------------------------------

export type FlatConstraint = {
    step: string
    failure: string
    type: 'step' | 'safe-dep' | 'dep' | 'strategy'
}

export type StrategyTable = {
    stepName: string
    caseName: string
    columns: FlatConstraint[]
    successes: string[]
}

export type FlatTable = {
    columns: FlatConstraint[]     // linear constraints only (no strategy handler details)
    successes: string[]
    strategies: StrategyTable[]   // one sub-table per handler
}

// -- linkStep -----------------------------------------------------------------

function linkStep(
    stepName: string,
    specObj: object | undefined,
    graph?: DependencyGraph,
    currentPath?: string,
): string {
    if (!specObj || !graph || !currentPath) {
        return `\`${stepName}\``
    }
    const node = graph.nodes.get(specObj)
    if (!node) {
        return `\`${stepName}\``
    }
    const rel = relative(dirname(currentPath), node.specPath)
    return `[\`${stepName}\`](${rel})`
}

// -- flattenSpec --------------------------------------------------------------

export function flattenSpec(spec: any): FlatTable {
    const columns: FlatConstraint[] = []
    const strategies: StrategyTable[] = []

    if (spec.steps) {
        for (const step of spec.steps as StepInfo[]) {
            switch (step.type) {
                case 'step':
                case 'safe-dep':
                    if (step.spec) {
                        const stepColumns = flattenAtomicSpec(step.name, step.spec)
                        columns.push(...stepColumns.map(c => ({ ...c, type: step.type as FlatConstraint['type'] })))
                    } else {
                        columns.push({ step: step.name, failure: `(${step.name})`, type: step.type })
                    }
                    break

                case 'dep':
                    columns.push({ step: step.name, failure: `(${step.name})`, type: 'dep' })
                    break

                case 'strategy':
                    // Strategy appears as a single column in the main table
                    columns.push({ step: step.name, failure: `(${step.name})`, type: 'strategy' })

                    // Each handler gets its own sub-table
                    for (const [caseName, handlerSpec] of Object.entries(step.handlers)) {
                        const handlerColumns = flattenAtomicSpec(`${step.name}`, handlerSpec as any)
                        const handlerSuccesses = Object.keys((handlerSpec as any).shouldSucceedWith || {})
                        strategies.push({
                            stepName: step.name,
                            caseName,
                            columns: handlerColumns,
                            successes: handlerSuccesses,
                        })
                    }
                    break
            }
        }
    } else {
        // Atomic spec — collect directly from shouldFailWith
        for (const failure of Object.keys(spec.shouldFailWith || {})) {
            columns.push({ step: '(self)', failure, type: 'step' })
        }
    }

    // Own failures not inherited from steps — insert at the end of the linear columns
    const inheritedKeys = new Set(columns.map(c => c.failure))
    for (const [failure, group] of Object.entries(spec.shouldFailWith || {}) as any[]) {
        if (group && !inheritedKeys.has(failure)) {
            const stepName = group.coveredBy || '(own)'
            columns.push({ step: stepName, failure, type: 'step' })
        }
    }

    return {
        columns,
        successes: Object.keys(spec.shouldSucceedWith),
        strategies,
    }
}

function flattenAtomicSpec(stepName: string, spec: any): FlatConstraint[] {
    const result: FlatConstraint[] = []

    if (spec.steps) {
        // Composed spec — recurse
        for (const step of spec.steps as StepInfo[]) {
            if ((step.type === 'step' || step.type === 'safe-dep') && step.spec) {
                const nested = flattenAtomicSpec(step.name, step.spec)
                for (const entry of nested) {
                    result.push({ ...entry, step: `${stepName}.${entry.step}` })
                }
            }
        }
    } else {
        // Atomic — collect from shouldFailWith
        for (const failure of Object.keys(spec.shouldFailWith || {})) {
            result.push({ step: stepName, failure, type: 'step' })
        }
    }

    return result
}

// -- toMainTable --------------------------------------------------------------

export function toMainTable(table: FlatTable): string {
    const { columns, successes, strategies } = table

    const realColumns = columns.filter(c => !c.failure.startsWith('(') || c.type === 'strategy')

    const header = [
        'Scenario',
        ...realColumns.map(c =>
            c.type === 'strategy'
                ? `\`${c.step}\` _(strategy)_`
                : `\`${c.step}\` :${c.failure}`
        ),
        'Outcome',
    ]
    const separator = ['---', ...realColumns.map(() => ':---:'), '---']

    const successRows = successes.map(s => [
        `OK ${s}`,
        ...realColumns.map(c =>
            c.type === 'strategy'
                ? `pass _(${findHandlerForSuccess(strategies, c.step, s)})_`
                : 'pass'
        ),
        s,
    ])

    const failureRows = realColumns
        .filter(c => c.type !== 'strategy')
        .map((c, _i) => {
            const colIndex = realColumns.indexOf(c)
            return [
                `FAIL ${c.failure}`,
                ...realColumns.map((_, j) =>
                    j < colIndex ? 'pass' : j === colIndex ? 'FAIL' : '--'
                ),
                `Fails: \`${c.failure}\``,
            ]
        })

    // Strategy note rows
    const strategyNoteRows = strategies.length > 0
        ? [[
            `_strategy_`,
            ...realColumns.map(() => ''),
            `_See handler tables below_`,
        ]]
        : []

    const rows = [header, separator, ...successRows, ...failureRows, ...strategyNoteRows]
    return rows.map(r => `| ${r.join(' | ')} |`).join('\n')
}

function findHandlerForSuccess(strategies: StrategyTable[], stepName: string, success: string): string {
    for (const s of strategies) {
        if (s.stepName === stepName && s.successes.includes(success)) {
            return s.caseName
        }
    }
    return '?'
}

// -- toHandlerTables ----------------------------------------------------------

export function toHandlerTables(table: FlatTable): string {
    if (table.strategies.length === 0) return ''

    const sections: string[] = []

    // Group by strategy step name
    const byStep = new Map<string, StrategyTable[]>()
    for (const s of table.strategies) {
        const list = byStep.get(s.stepName) || []
        list.push(s)
        byStep.set(s.stepName, list)
    }

    for (const [stepName, handlers] of byStep) {
        sections.push(`### Strategy: \`${stepName}\`\n`)

        for (const handler of handlers) {
            sections.push(`#### Handler: \`${handler.caseName}\`\n`)

            if (handler.columns.length === 0) {
                sections.push('_No constraints — handler always succeeds._\n')
                continue
            }

            const header = [
                'Scenario',
                ...handler.columns.map(c => `\`${c.step}\` :${c.failure}`),
                'Outcome',
            ]
            const separator = ['---', ...handler.columns.map(() => ':---:'), '---']

            const successRows = handler.successes.map(s => [
                `OK ${s}`,
                ...handler.columns.map(() => 'pass'),
                s,
            ])

            const failureRows = handler.columns.map((c, i) => [
                `FAIL ${c.failure}`,
                ...handler.columns.map((_, j) => j < i ? 'pass' : j === i ? 'FAIL' : '--'),
                `Fails: \`${c.failure}\``,
            ])

            const rows = [header, separator, ...successRows, ...failureRows]
            sections.push(rows.map(r => `| ${r.join(' | ')} |`).join('\n'))
            sections.push('')
        }
    }

    return sections.join('\n')
}

// -- toStepTable --------------------------------------------------------------

export function toStepTable(spec: any, graph?: DependencyGraph, currentPath?: string): string {
    if (!spec.steps) return '_Atomic function — no pipeline steps._'

    const rows: string[][] = [
        ['#', 'Name', 'Type', 'Description', 'Failure Codes'],
        ['---', '---', '---', '---', '---'],
    ]

    for (let i = 0; i < spec.steps.length; i++) {
        const step = spec.steps[i]
        let failures: string[] = []
        let typeStr: string

        switch (step.type) {
            case 'step':
                typeStr = '`STEP`'
                if (step.spec) {
                    failures = Object.keys(step.spec.shouldFailWith || {})
                }
                break
            case 'safe-dep':
                typeStr = '`SAFE-DEP`'
                if (step.spec) {
                    failures = Object.keys(step.spec.shouldFailWith || {})
                }
                break
            case 'dep':
                typeStr = '`DEP`'
                break
            case 'strategy':
                typeStr = '`STRATEGY`'
                if (step.handlers) {
                    for (const [caseName, handlerSpec] of Object.entries(step.handlers) as any[]) {
                        const handlerFailures = Object.keys(handlerSpec.shouldFailWith || {})
                        failures.push(...handlerFailures.map((f: string) => `${f} _(${caseName})_`))
                    }
                }
                break
        }

        const failStr = failures.length > 0
            ? failures.map(f => f.startsWith('`') ? f : `\`${f}\``).join(', ')
            : '--'

        const nameCell = (step.type === 'step' || step.type === 'safe-dep')
            ? linkStep(step.name, step.spec, graph, currentPath)
            : `\`${step.name}\``

        rows.push([String(i + 1), nameCell, typeStr!, step.description, failStr])
    }

    return rows.map(r => `| ${r.join(' | ')} |`).join('\n')
}

// -- buildSpecMd --------------------------------------------------------------

export function buildSpecMd(name: string, spec: any, graph?: DependencyGraph, currentPath?: string): string {
    const pipeline = toStepTable(spec, graph, currentPath)
    const table = flattenSpec(spec)
    const main = toMainTable(table)
    const handlers = toHandlerTables(table)

    const parts = [
        `# ${name}`,
        '',
        `> Auto-generated from \`${name}.spec.ts\`. Do not edit — run \`viberail gen\` to regenerate.`,
    ]

    if (spec.document) {
        parts.push(`> For business-friendly documentation, see \`/docs/\`.`)
    }

    parts.push(
        '',
        '---',
        '',
        '## Pipeline',
        '',
        pipeline,
        '',
        '---',
        '',
        '## Decision Table',
        '',
        main,
    )

    if (handlers) {
        parts.push('', '---', '', handlers)
    }

    return parts.join('\n') + '\n'
}

// -- buildDependencyGraphMd ---------------------------------------------------

export function buildDependencyGraphMd(graph: DependencyGraph, opts?: { domainPattern?: RegExp }): string {
    const domainPattern = opts?.domainPattern ?? /src\/domain\/(.+)\.spec\.md$/
    const lines: string[] = []

    // Collect all nodes that have edges (factories/composed specs)
    const nodesWithEdges: SpecNode[] = []
    const referencedNodes = new Set<SpecNode>()

    for (const node of graph.nodes.values()) {
        if (node.edges.length > 0) {
            nodesWithEdges.push(node)
            for (const edge of node.edges) {
                if (edge.target) referencedNodes.add(edge.target)
            }
        }
    }

    // Deduplicate nodes
    const seen = new Set<string>()
    const uniqueNodes = nodesWithEdges.filter(n => {
        if (seen.has(n.specPath)) return false
        seen.add(n.specPath)
        return true
    })

    // Build stable node IDs from spec paths
    const nodeId = (node: SpecNode): string => {
        const match = node.specPath.match(domainPattern)
        return match ? match[1].replace(/\//g, '_') : node.name
    }

    const nodeLabel = (node: SpecNode): string => {
        const match = node.specPath.match(domainPattern)
        return match ? match[1] : node.name
    }

    let depCounter = 0
    const depNodes: string[] = []

    const nodeDomain = (node: SpecNode): string => {
        const label = nodeLabel(node)
        return label.split('/')[0]
    }

    const shortLabel = (node: SpecNode): string => {
        const label = nodeLabel(node)
        const slash = label.indexOf('/')
        return slash >= 0 ? label.slice(slash + 1) : label
    }

    const domainTitle = (domain: string): string =>
        domain.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')

    lines.push('```mermaid')
    lines.push("%%{init: {'flowchart': {'useMaxWidth': false, 'nodeSpacing': 75, 'rankSpacing': 75, 'diagramPadding': 40, 'curve': 'linear'}}}%%")
    lines.push('flowchart LR')

    // Collect all nodes grouped by domain
    const nodesByDomain = new Map<string, { id: string; label: string }[]>()
    const declaredIds = new Set<string>()

    const declareNode = (node: SpecNode) => {
        const id = nodeId(node)
        if (declaredIds.has(id)) return
        declaredIds.add(id)
        const domain = nodeDomain(node)
        if (!nodesByDomain.has(domain)) nodesByDomain.set(domain, [])
        nodesByDomain.get(domain)!.push({ id, label: shortLabel(node) })
    }

    for (const node of uniqueNodes) {
        declareNode(node)
        for (const edge of node.edges) {
            if (edge.target) declareNode(edge.target)
        }
    }

    // Emit subgraphs grouped by domain
    for (const [domain, nodes] of nodesByDomain) {
        lines.push(`    subgraph ${domain}["${domainTitle(domain)}"]`)
        for (const { id, label } of nodes) {
            lines.push(`        ${id}["${label}"]`)
        }
        lines.push('    end')
    }

    // Declare edges
    for (const node of uniqueNodes) {
        const sourceId = nodeId(node)
        for (const edge of node.edges) {
            if (edge.target) {
                const targetId = nodeId(edge.target)
                const label = edge.type === 'strategy' ? 'strategy' : edge.stepName
                lines.push(`    ${sourceId} -->|${label}| ${targetId}`)
            } else if (edge.type === 'dep') {
                const depId = `dep_${depCounter++}`
                depNodes.push(depId)
                lines.push(`    ${depId}[/"${edge.stepName} (dep)"/]`)
                lines.push(`    ${sourceId} -.->|${edge.stepName}| ${depId}`)
            }
        }
    }

    // Style dep nodes
    if (depNodes.length > 0) {
        lines.push(`    style ${depNodes.join(',')} fill:#f5f5f5,stroke:#999,stroke-dasharray: 5 5`)
    }

    lines.push('```')

    const parts = [
        '---',
        'title: Dependency Graph',
        'nav_order: 99',
        'mermaid: true',
        '---',
        '',
        '# Dependency Graph',
        '',
        '> Auto-generated by `viberail gen`. Do not edit.',
        '',
        '---',
        '',
        ...lines,
        '',
    ]

    return parts.join('\n') + '\n'
}
