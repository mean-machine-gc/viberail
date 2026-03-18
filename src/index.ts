// viberail — typed behavioral specifications

export * from './spec-framework.js'
export * from './canonical.js'
export * from './cli/spec-loader.js'
export * from './cli/spec-tools.js'
export { runChecks, analyzeSpecs, type CheckSummary } from './cli/check/index.js'
export type { CheckResult, CheckContext, CheckFn, Severity } from './cli/check/types.js'
export type { ViberailTestReport, SpecTestResult, GroupTestResult, SuccessTestResult, ExampleResult } from './reporters/json-reporter.js'
export { generateSpecs, type GenerateOptions } from './cli/generate-specs.js'
