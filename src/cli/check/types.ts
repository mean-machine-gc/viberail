// viberail/cli/check/types.ts — check infrastructure types

import type { Spec } from '../../spec-framework.js'
import type { DependencyGraph } from '../spec-tools.js'
import type { LoadedSpec } from '../spec-loader.js'

type AnyFn = { input: any; output: any; failures: string; successTypes: string; signature: any; asyncSignature: any; depSignature: any; result: any }

export type Severity = 'error' | 'warning'

export type CheckResult = {
    specFile: string       // relative path to .spec.ts
    specName: string       // export name
    check: string          // e.g. 'example-completeness'
    severity: Severity
    message: string        // human-readable detail
}

export type CheckContext = {
    spec: Spec<AnyFn>
    exportName: string
    filePath: string         // absolute
    modulePath: string       // relative from cwd
    graph: DependencyGraph
    allSpecs: LoadedSpec[]
}

export type CheckFn = (ctx: CheckContext) => CheckResult[]
