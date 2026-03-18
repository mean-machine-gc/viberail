// viberail/cli/spec-loader.ts — shared spec discovery and graph building

import { globSync } from 'glob'
import { resolve, basename } from 'path'
import type { Spec } from '../spec-framework.js'
import type { DependencyGraph, SpecNode, SpecEdge } from './spec-tools.js'

type AnyFn = { input: any; output: any; failures: string; successTypes: string; signature: any; asyncSignature: any; depSignature: any; result: any }

export type LoadedSpec = {
    exportName: string
    spec: Spec<AnyFn>
    filePath: string       // absolute path to .spec.ts
    modulePath: string     // relative from cwd (the original glob match)
}

export type SpecAnalysis = {
    specs: LoadedSpec[]
    graph: DependencyGraph
}

export function isSpec(value: unknown): boolean {
    return (
        value !== null &&
        typeof value === 'object' &&
        'shouldSucceedWith' in value &&
        'shouldAssert' in value
    )
}

export interface LoadOptions {
    /** Glob pattern for spec files (default: 'src/domain/**\/*.spec.ts') */
    specGlob?: string
    /** Working directory (default: process.cwd()) */
    cwd?: string
}

export async function loadSpecs(opts: LoadOptions = {}): Promise<SpecAnalysis> {
    const specGlob = opts.specGlob ?? 'src/domain/**/*.spec.ts'
    const cwd = opts.cwd ?? process.cwd()

    const specFiles = globSync(specGlob, { cwd })

    if (specFiles.length === 0) {
        return { specs: [], graph: { nodes: new Map() } }
    }

    // -- Pass 1: import all modules, build graph nodes and LoadedSpec list -----

    const graph: DependencyGraph = { nodes: new Map() }
    const specs: LoadedSpec[] = []
    const modules: Array<{ file: string; mod: any }> = []

    for (const file of specFiles) {
        const resolvedPath = resolve(cwd, file)
        const mod = await import(resolvedPath)
        modules.push({ file, mod })

        const mdPath = resolvedPath.replace(/\.spec\.ts$/, '.spec.md')
        const name = basename(file, '.spec.ts')

        for (const [exportName, value] of Object.entries(mod)) {
            if (isSpec(value)) {
                const node: SpecNode = {
                    name,
                    specPath: mdPath,
                    spec: value as object,
                    edges: [],
                }
                graph.nodes.set(value as object, node)
                specs.push({
                    exportName,
                    spec: value as Spec<AnyFn>,
                    filePath: resolvedPath,
                    modulePath: file,
                })
            }
        }
    }

    // -- Pass 2: resolve edges ------------------------------------------------

    for (const node of graph.nodes.values()) {
        const spec = node.spec as any
        if (!spec.steps) continue

        for (const step of spec.steps) {
            const edge: SpecEdge = {
                stepName: step.name,
                type: step.type,
                target: null,
            }

            if ((step.type === 'step' || step.type === 'safe-dep') && step.spec) {
                edge.target = graph.nodes.get(step.spec) ?? null
            }

            node.edges.push(edge)
        }
    }

    return { specs, graph }
}

/**
 * Returns the modules loaded during spec discovery.
 * Used by generateSpecs() for markdown generation.
 */
export async function loadSpecsWithModules(opts: LoadOptions = {}): Promise<{
    analysis: SpecAnalysis
    modules: Array<{ file: string; mod: any }>
}> {
    const specGlob = opts.specGlob ?? 'src/domain/**/*.spec.ts'
    const cwd = opts.cwd ?? process.cwd()

    const specFiles = globSync(specGlob, { cwd })

    if (specFiles.length === 0) {
        return {
            analysis: { specs: [], graph: { nodes: new Map() } },
            modules: [],
        }
    }

    const graph: DependencyGraph = { nodes: new Map() }
    const specs: LoadedSpec[] = []
    const modules: Array<{ file: string; mod: any }> = []

    for (const file of specFiles) {
        const resolvedPath = resolve(cwd, file)
        const mod = await import(resolvedPath)
        modules.push({ file, mod })

        const mdPath = resolvedPath.replace(/\.spec\.ts$/, '.spec.md')
        const name = basename(file, '.spec.ts')

        for (const [exportName, value] of Object.entries(mod)) {
            if (isSpec(value)) {
                const node: SpecNode = {
                    name,
                    specPath: mdPath,
                    spec: value as object,
                    edges: [],
                }
                graph.nodes.set(value as object, node)
                specs.push({
                    exportName,
                    spec: value as Spec<AnyFn>,
                    filePath: resolvedPath,
                    modulePath: file,
                })
            }
        }
    }

    for (const node of graph.nodes.values()) {
        const spec = node.spec as any
        if (!spec.steps) continue

        for (const step of spec.steps) {
            const edge: SpecEdge = {
                stepName: step.name,
                type: step.type,
                target: null,
            }

            if ((step.type === 'step' || step.type === 'safe-dep') && step.spec) {
                edge.target = graph.nodes.get(step.spec) ?? null
            }

            node.edges.push(edge)
        }
    }

    return { analysis: { specs, graph }, modules }
}
