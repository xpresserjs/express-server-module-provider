import { configure, processCLIArgs, run } from '@japa/runner'
import { assert } from '@japa/assert'
import { apiClient } from '@japa/api-client'

processCLIArgs(process.argv.splice(2))
configure({
  files: ['tests/**/*.spec.ts'],
  plugins: [assert(), apiClient('http://localhost:3333')],
})

run()