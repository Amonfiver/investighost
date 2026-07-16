import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Sha256ContributionIntegrityService } from '@modules/contributions/integrity'
import { MemoryContributionLocalRepository } from '@modules/contributions/memory-repository'
import { LocalContributionImportQueue } from '@modules/contributions/queue'
import { BoundedContributionRetryPolicy } from '@modules/contributions/retry-policy'
import { MockContributionRemoteSource, type MockContributionSeed } from '@modules/contributions/mock-remote'
import { ContributionImportService } from '@modules/contributions/import-service'
import { MemoryContributionBackupService, MemoryContributionFileStore } from './support/contribution-doubles'

const temporaryPaths: string[] = []

afterEach(async () => {
  await Promise.all(temporaryPaths.splice(0).map(item => rm(item, { recursive: true, force: true })))
})

async function setup(seeds: MockContributionSeed[]) {
  const root = await mkdtemp(path.join(tmpdir(), 'investighost-import-'))
  temporaryPaths.push(root)
  const integrity = new Sha256ContributionIntegrityService()
  const repository = new MemoryContributionLocalRepository()
  const remote = new MockContributionRemoteSource(seeds, integrity)
  const service = new ContributionImportService(
    remote,
    repository,
    new MemoryContributionFileStore(root, integrity),
    integrity,
    new LocalContributionImportQueue(repository),
    new BoundedContributionRetryPolicy(),
    new MemoryContributionBackupService(),
  )
  return { service, repository, remote }
}

describe('verified contribution import', () => {
  it('continues a partially successful batch after a network failure', async () => {
    const { service } = await setup([
      { remoteId: 'ok', content: 'válida' },
      { remoteId: 'network', content: 'falla', files: [{ id: 'a', name: 'a.jpg', mimeType: 'image/jpeg', bytes: new Uint8Array([1, 2]) }], failDownload: true },
    ])
    const summary = await service.importPending()
    expect(summary.found).toBe(2)
    expect(summary.deletedRemote).toBe(1)
    expect(summary.retrying).toBe(1)
  })

  it('detects a corrupt file and never deletes its remote record', async () => {
    const { service, remote } = await setup([{ remoteId: 'corrupt', content: 'foto', files: [{ id: 'photo', name: '../unsafe.jpg', mimeType: 'image/jpeg', bytes: new Uint8Array([1, 2, 3]) }], corruptFileIds: ['photo'] }])
    const summary = await service.importPending()
    expect(summary.retrying).toBe(1)
    expect(remote.deleted).not.toContain('corrupt')
  })

  it('detects a distinct payload hash', async () => {
    const { service, repository, remote } = await setup([{ remoteId: 'hash', content: 'contenido', payloadHashOverride: 'f'.repeat(64) }])
    const summary = await service.importPending()
    expect(summary.retrying).toBe(1)
    expect(repository.conflicts[0]?.kind).toBe('payload_hash')
    expect(remote.deleted).toHaveLength(0)
  })

  it('is idempotent when the same batch is requested twice', async () => {
    const { service, repository } = await setup([{ remoteId: 'duplicate', content: 'una vez' }])
    const first = await service.importPending()
    const second = await service.importPending()
    expect(first.deletedRemote).toBe(1)
    expect(second.found).toBe(0)
    expect(repository.contributions.size).toBe(1)
  })

  it('preserves local data and retries only remote deletion', async () => {
    const { service, repository, remote } = await setup([{ remoteId: 'delete-fail', content: 'persistida', failDelete: true }])
    const first = await service.importPending()
    const job = first.jobs[0]
    expect(job.status).toBe('deleting_remote')
    expect(repository.contributions.has('delete-fail')).toBe(true)
    remote.clearFailures('delete-fail')
    const retried = await service.retryJob(job.id)
    expect(retried.jobs[0].status).toBe('completed')
  })

  it('supports an individual retry after a transient file download error', async () => {
    const { service, remote } = await setup([{ remoteId: 'retry-one', content: 'reintento', files: [{ id: 'file', name: 'x.png', mimeType: 'image/png', bytes: new Uint8Array([4, 5]) }], failDownload: true }])
    const first = await service.importPending()
    expect(first.jobs[0].status).toBe('retry_pending')
    remote.clearFailures('retry-one')
    const retried = await service.retryJob(first.jobs[0].id)
    expect(retried.jobs[0].status).toBe('completed')
    expect(retried.jobs[0].attemptCount).toBe(2)
  })

  it('blocks path traversal and stores a generated safe filename', async () => {
    const { service, repository } = await setup([{ remoteId: '../../escape', content: 'segura', files: [{ id: 'file', name: '../../payload.jpg', mimeType: 'image/jpeg', bytes: new Uint8Array([7, 8, 9]) }] }])
    const summary = await service.importPending()
    expect(summary.jobs[0].status).toBe('completed')
    const stored = repository.contributions.get('../../escape')?.files[0]
    expect(stored?.relativePath).not.toContain('..')
    expect(stored?.safeLocalName).not.toBe('../../payload.jpg')
  })
})
