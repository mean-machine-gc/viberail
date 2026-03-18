// viberail/cli/check/formatter.ts — terminal output formatting

import type { CheckResult, Severity } from './types.js'

const COLORS = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    cyan: '\x1b[36m',
}

function severityLabel(severity: Severity): string {
    switch (severity) {
        case 'error':
            return `${COLORS.red}ERROR${COLORS.reset}  `
        case 'warning':
            return `${COLORS.yellow}WARNING${COLORS.reset}`
    }
}

export function formatResults(results: CheckResult[], specCount: number): void {
    if (results.length === 0) {
        console.log(`\n${COLORS.green}✓${COLORS.reset} All checks passed across ${specCount} specs.\n`)
        return
    }

    // Group by spec file
    const byFile = new Map<string, CheckResult[]>()
    for (const r of results) {
        const list = byFile.get(r.specFile) || []
        list.push(r)
        byFile.set(r.specFile, list)
    }

    console.log('')

    for (const [file, fileResults] of byFile) {
        console.log(`${COLORS.bold}${file}${COLORS.reset}`)
        for (const r of fileResults) {
            const label = severityLabel(r.severity)
            const check = `${COLORS.dim}${r.check}${COLORS.reset}`
            console.log(`  ${label}  ${check}  ${r.message}`)
        }
        console.log('')
    }

    // Summary
    const errors = results.filter(r => r.severity === 'error').length
    const warnings = results.filter(r => r.severity === 'warning').length
    const parts: string[] = []
    if (errors > 0) parts.push(`${COLORS.red}${errors} error${errors !== 1 ? 's' : ''}${COLORS.reset}`)
    if (warnings > 0) parts.push(`${COLORS.yellow}${warnings} warning${warnings !== 1 ? 's' : ''}${COLORS.reset}`)

    console.log(`Summary: ${parts.join(', ')} across ${specCount} specs.\n`)
}
