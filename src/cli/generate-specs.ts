// viberail/cli/generate-specs.ts

import { writeFileSync } from 'fs'
import { resolve, basename } from 'path'
import { buildSpecMd, buildDependencyGraphMd } from './spec-tools.js'
import { isSpec, loadSpecsWithModules } from './spec-loader.js'

export interface GenerateOptions {
    /** Glob pattern for spec files (default: 'src/domain/**\/*.spec.ts') */
    specGlob?: string
    /** Output path for dependency graph (default: 'docs/dependency-graph.md') */
    graphOutputPath?: string
    /** Regex to extract domain path from spec path (default: /src\/domain\/(.+)\.spec\.md$/) */
    domainPattern?: RegExp
}

export async function generateSpecs(opts: GenerateOptions = {}) {
    const graphOutputPath = opts.graphOutputPath ?? 'docs/dependency-graph.md'
    const domainPattern = opts.domainPattern

    const { analysis, modules } = await loadSpecsWithModules({
        specGlob: opts.specGlob,
    })

    const { graph } = analysis

    if (modules.length === 0) {
        console.log('No .spec.ts files found.')
        return
    }

    // -- Generate .spec.md files ----------------------------------------------

    let generated = 0
    const writtenPaths = new Set<string>()

    for (const { file, mod } of modules) {
        const resolvedPath = resolve(file)
        const mdPath = resolvedPath.replace(/\.spec\.ts$/, '.spec.md')
        if (writtenPaths.has(mdPath)) continue

        const specs = Object.entries(mod).filter(([_, v]) => isSpec(v))
        if (specs.length === 0) continue

        // Pick primary: prefer document:true, then has steps, then first
        const primary = specs.find(([_, v]) => (v as any).document === true)
            ?? specs.find(([_, v]) => (v as any).steps)
            ?? specs[0]

        const [exportName, value] = primary
        const name = basename(file, '.spec.ts')
        const content = buildSpecMd(name, value, graph, mdPath)
        writeFileSync(mdPath, content)
        writtenPaths.add(mdPath)
        console.log(`  ${name} (${exportName}): wrote ${mdPath}`)
        generated++
    }

    // -- Generate dependency graph --------------------------------------------

    const graphMd = buildDependencyGraphMd(graph, { domainPattern })
    const graphPath = resolve(graphOutputPath)
    writeFileSync(graphPath, graphMd)
    console.log(`  dependency-graph: wrote ${graphPath}`)

    if (generated === 0) {
        console.log('No spec exports found — nothing to generate.')
    } else {
        console.log(`\nGenerated ${generated} .spec.md file(s) + dependency graph.`)
    }
}
