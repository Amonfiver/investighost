import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'

describe('batch retry authorization precondition', () => {
  it('MISSING_AUTHORIZATION_DOES_NOT_INCREMENT_ATTEMPT_OR_START_WORKER', async () => {
    const main = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8')
    const handler = main.slice(main.indexOf("ipcMain.handle('factory-batches:retry-job'"), main.indexOf("ipcMain.handle('factory-batches:authorization-status'"))
    expect(handler).toContain('readBatchResumePlan(client, job)')
    expect(handler).toContain('BATCH_PROVIDER_AUTHORIZATION_REQUIRED')
    expect(handler.indexOf('BATCH_PROVIDER_AUTHORIZATION_REQUIRED')).toBeLessThan(handler.indexOf('getDestinationBatchRuntime()).retry'))
    expect(handler.indexOf('BATCH_PROVIDER_AUTHORIZATION_REQUIRED')).toBeLessThan(handler.indexOf('worker.runJob'))
  })

  it('RECONCILED_RESPONSE_LOST projects the historical failed job as retryable and persists that eligibility only on retry', async () => {
    const main = await readFile(new URL('../src/main/index.ts', import.meta.url), 'utf8')
    const readHandler = main.slice(main.indexOf("ipcMain.handle('factory-batches:read'"), main.indexOf("ipcMain.handle('factory-batches:retry-job'"))
    const retryHandler = main.slice(main.indexOf("ipcMain.handle('factory-batches:retry-job'"), main.indexOf("ipcMain.handle('factory-batches:authorization-status'"))
    expect(readHandler).toContain('canRetryReconciledAnalysis(job, resume)')
    expect(readHandler).toContain('retryable: true')
    expect(retryHandler).toContain('await repository.updateJob({ ...job, retryable: true')
    expect(retryHandler.indexOf('repository.updateJob')).toBeLessThan(retryHandler.indexOf('getDestinationBatchRuntime()).retry'))
  })
})
