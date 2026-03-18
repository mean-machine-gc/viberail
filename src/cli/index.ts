#!/usr/bin/env node

// viberail CLI entry point

import { generateSpecs } from './generate-specs.js'
import { runChecks } from './check/index.js'

const command = process.argv[2]

switch (command) {
    case 'gen':
        generateSpecs().catch(err => {
            console.error('viberail gen failed:', err)
            process.exit(1)
        })
        break

    case 'check':
        runChecks().then(exitCode => process.exit(exitCode)).catch(err => {
            console.error('viberail check failed:', err)
            process.exit(1)
        })
        break

    default:
        console.log(`viberail — typed behavioral specifications

Usage:
  viberail gen      Generate .spec.md files and dependency graph
  viberail check    Validate specs: coverage, assertions, orphans, inheritance

Options are configured in viberail.config.ts (future).
`)
        if (command && command !== 'help' && command !== '--help') {
            console.error(`Unknown command: ${command}`)
            process.exit(1)
        }
        break
}
