// viberail JSON reporter — Jest custom reporter that writes spec-level test results
// Usage: jest --reporters=viberail/dist/reporters/json-reporter.js

import { writeFileSync } from 'fs'
import { resolve } from 'path'

// --- Output types ---

export type SpecTestResult = {
    specName: string
    failures: Record<string, GroupTestResult>
    successes: Record<string, SuccessTestResult>
    totalTests: number
    passed: number
    failed: number
    skipped: number
    todo: number
}

export type GroupTestResult = {
    status: 'pass' | 'fail' | 'skip' | 'todo' | 'empty'
    examples: ExampleResult[]
}

export type SuccessTestResult = GroupTestResult & {
    assertions: Record<string, AssertionResult>
}

export type ExampleResult = {
    description: string
    status: 'pass' | 'fail' | 'skip'
    duration?: number
    failureMessage?: string
}

export type AssertionResult = {
    description: string
    examples: ExampleResult[]
}

export type ViberailTestReport = {
    timestamp: string
    duration: number
    totalSpecs: number
    totalTests: number
    passed: number
    failed: number
    skipped: number
    todo: number
    specs: SpecTestResult[]
}

// --- Jest reporter interface ---

type JestTestResult = {
    testResults: Array<{
        ancestorTitles: string[]
        title: string
        status: 'passed' | 'failed' | 'pending' | 'todo' | 'skipped'
        duration: number | null
        failureMessages: string[]
    }>
}

type JestAggregatedResult = {
    testResults: Array<{
        testResults: JestTestResult['testResults']
        testFilePath: string
    }>
    startTime: number
}

class ViberailJsonReporter {
    private outputFile: string

    constructor(_globalConfig: unknown, options?: { outputFile?: string }) {
        this.outputFile = options?.outputFile || 'viberail-results.json'
    }

    onRunComplete(_contexts: unknown, results: JestAggregatedResult) {
        const allTests = results.testResults.flatMap(suite => suite.testResults)
        const report = buildReport(allTests, results.startTime)

        const outPath = resolve(process.cwd(), this.outputFile)
        writeFileSync(outPath, JSON.stringify(report, null, 2))
        console.log(`\nviberail: wrote ${outPath} (${report.totalSpecs} specs, ${report.totalTests} tests)`)
    }
}

function buildReport(tests: JestTestResult['testResults'], startTime: number): ViberailTestReport {
    // Group tests by spec name (top-level describe)
    const specMap = new Map<string, JestTestResult['testResults']>()

    for (const test of tests) {
        const specName = test.ancestorTitles[0]
        if (!specName) continue
        const list = specMap.get(specName) || []
        list.push(test)
        specMap.set(specName, list)
    }

    const specs: SpecTestResult[] = []

    for (const [specName, specTests] of specMap) {
        const result = buildSpecResult(specName, specTests)
        specs.push(result)
    }

    const totals = specs.reduce((acc, s) => ({
        totalTests: acc.totalTests + s.totalTests,
        passed: acc.passed + s.passed,
        failed: acc.failed + s.failed,
        skipped: acc.skipped + s.skipped,
        todo: acc.todo + s.todo,
    }), { totalTests: 0, passed: 0, failed: 0, skipped: 0, todo: 0 })

    return {
        timestamp: new Date().toISOString(),
        duration: Date.now() - startTime,
        totalSpecs: specs.length,
        ...totals,
        specs,
    }
}

function buildSpecResult(specName: string, tests: JestTestResult['testResults']): SpecTestResult {
    const failures: Record<string, GroupTestResult> = {}
    const successes: Record<string, SuccessTestResult> = {}
    let passed = 0, failed = 0, skipped = 0, todo = 0

    for (const test of tests) {
        const [_spec, section, groupTitle, ...rest] = test.ancestorTitles
        const status = mapStatus(test.status)

        if (status === 'pass') passed++
        else if (status === 'fail') failed++
        else if (status === 'skip') skipped++

        if (section === 'failures') {
            const failureKey = extractGroupKey(groupTitle || test.title)
            if (!failures[failureKey]) {
                failures[failureKey] = { status: 'empty', examples: [] }
            }

            // Check if this is a todo or skip marker
            if (test.status === 'todo') {
                failures[failureKey].status = 'todo'
                todo++
                continue
            }
            if (test.status === 'pending' || test.status === 'skipped') {
                if (failures[failureKey].status === 'empty') {
                    failures[failureKey].status = 'skip'
                }
                // Skip marker from coveredBy — count but don't add example
                if (!groupTitle) {
                    continue
                }
            }

            failures[failureKey].examples.push({
                description: test.title,
                status,
                duration: test.duration ?? undefined,
                ...(test.failureMessages.length > 0
                    ? { failureMessage: test.failureMessages.join('\n') }
                    : {}),
            })

            // Update group status
            if (status === 'fail') failures[failureKey].status = 'fail'
            else if (status === 'pass' && failures[failureKey].status !== 'fail') {
                failures[failureKey].status = 'pass'
            }
        } else if (section === 'successes') {
            const successKey = extractGroupKey(groupTitle || '')
            if (!successes[successKey]) {
                successes[successKey] = { status: 'empty', examples: [], assertions: {} }
            }

            // Check if this is an assertion test (title contains " — " with assertion desc)
            const isAssertion = rest.length === 0 && test.title.includes(' — ')
            if (isAssertion && groupTitle) {
                const dashIdx = test.title.lastIndexOf(' — ')
                const exampleDesc = test.title.substring(0, dashIdx)
                const assertDesc = test.title.substring(dashIdx + 3)

                if (!successes[successKey].assertions[assertDesc]) {
                    successes[successKey].assertions[assertDesc] = {
                        description: assertDesc,
                        examples: [],
                    }
                }
                successes[successKey].assertions[assertDesc].examples.push({
                    description: exampleDesc,
                    status,
                    duration: test.duration ?? undefined,
                    ...(test.failureMessages.length > 0
                        ? { failureMessage: test.failureMessages.join('\n') }
                        : {}),
                })
            } else {
                successes[successKey].examples.push({
                    description: test.title,
                    status,
                    duration: test.duration ?? undefined,
                    ...(test.failureMessages.length > 0
                        ? { failureMessage: test.failureMessages.join('\n') }
                        : {}),
                })
            }

            // Update group status
            if (status === 'fail') successes[successKey].status = 'fail'
            else if (status === 'pass' && successes[successKey].status !== 'fail') {
                successes[successKey].status = 'pass'
            }
        }
    }

    return {
        specName,
        failures,
        successes,
        totalTests: passed + failed + skipped + todo,
        passed,
        failed,
        skipped,
        todo,
    }
}

// Extract group key from "failureCode — description" or "successType — description"
function extractGroupKey(title: string): string {
    const dashIdx = title.indexOf(' — ')
    return dashIdx >= 0 ? title.substring(0, dashIdx) : title
}

function mapStatus(jestStatus: string): 'pass' | 'fail' | 'skip' {
    switch (jestStatus) {
        case 'passed': return 'pass'
        case 'failed': return 'fail'
        default: return 'skip'
    }
}

export default ViberailJsonReporter
