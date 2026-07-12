import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import type { ContributionImportJob } from '@shared/contracts'
import type {
  ContributionLocalRepository,
  ImportAttempt,
  ImportBatch,
  ImportConflict,
  LocalBackupRecord,
  PersistedContribution,
} from './types'

type JobRow = Record<string, unknown>

export class SqliteContributionLocalRepository implements ContributionLocalRepository {
  private readonly database: Database.Database

  constructor(readonly databasePath: string) {
    mkdirSync(path.dirname(databasePath), { recursive: true })
    this.database = new Database(databasePath)
    this.database.pragma('journal_mode = WAL')
    this.database.pragma('foreign_keys = ON')
    this.initialize()
  }

  close(): void { this.database.close() }
  checkpoint(): void { this.database.pragma('wal_checkpoint(TRUNCATE)') }

  async createBatch(batch: ImportBatch): Promise<void> {
    this.database.prepare('INSERT INTO import_batches (id,status,found_count,created_at) VALUES (?,?,?,?)')
      .run(batch.id, batch.status, batch.foundCount, batch.createdAt.toISOString())
  }

  async completeBatch(batch: ImportBatch): Promise<void> {
    this.database.prepare('UPDATE import_batches SET status=?, found_count=?, completed_at=? WHERE id=?')
      .run(batch.status, batch.foundCount, batch.completedAt?.toISOString() ?? null, batch.id)
  }

  async upsertJob(job: ContributionImportJob): Promise<ContributionImportJob> {
    this.database.prepare(`INSERT INTO contribution_import_jobs (
      id,batch_id,remote_id,source_type,status,attempt_count,last_error,next_retry_at,
      remote_checksum,local_checksum,remote_payload_size,local_payload_size,downloaded_at,
      verified_at,deleted_remote_at,completed_at,idempotency_key,version,created_at,updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(remote_id) DO UPDATE SET
      status=excluded.status,attempt_count=excluded.attempt_count,last_error=excluded.last_error,
      next_retry_at=excluded.next_retry_at,remote_checksum=excluded.remote_checksum,
      local_checksum=excluded.local_checksum,remote_payload_size=excluded.remote_payload_size,
      local_payload_size=excluded.local_payload_size,downloaded_at=excluded.downloaded_at,
      verified_at=excluded.verified_at,deleted_remote_at=excluded.deleted_remote_at,
      completed_at=excluded.completed_at,updated_at=excluded.updated_at`)
      .run(job.id, job.batchId, job.remoteId, job.sourceType, job.status, job.attemptCount,
        job.lastError ?? null, this.date(job.nextRetryAt), job.remoteChecksum ?? null,
        job.localChecksum ?? null, job.remotePayloadSize ?? null, job.localPayloadSize ?? null,
        this.date(job.downloadedAt), this.date(job.verifiedAt), this.date(job.deletedRemoteAt),
        this.date(job.completedAt), job.idempotencyKey, job.version, job.createdAt.toISOString(), job.updatedAt.toISOString())
    return (await this.getJobByRemoteId(job.remoteId)) ?? job
  }

  async getJobByRemoteId(remoteId: string): Promise<ContributionImportJob | null> {
    return this.toJob(this.database.prepare('SELECT * FROM contribution_import_jobs WHERE remote_id=?').get(remoteId) as JobRow | undefined)
  }

  async getJob(id: string): Promise<ContributionImportJob | null> {
    return this.toJob(this.database.prepare('SELECT * FROM contribution_import_jobs WHERE id=?').get(id) as JobRow | undefined)
  }

  async listJobs(): Promise<ContributionImportJob[]> {
    return (this.database.prepare('SELECT * FROM contribution_import_jobs ORDER BY updated_at DESC').all() as JobRow[])
      .map(row => this.toJob(row) as ContributionImportJob)
  }

  async persistVerifiedContribution(contribution: PersistedContribution): Promise<void> {
    const transaction = this.database.transaction(() => {
      this.database.prepare(`INSERT INTO imported_contributions
        (id,job_id,remote_id,source_type,payload_json,payload_sha256,payload_size,version,imported_at)
        VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(remote_id) DO NOTHING`)
        .run(contribution.id, contribution.jobId, contribution.remote.remoteId, contribution.remote.sourceType,
          contribution.normalizedPayload, contribution.remote.payloadSha256, contribution.remote.payloadSize,
          contribution.remote.version, contribution.importedAt.toISOString())
      const insertFile = this.database.prepare(`INSERT OR IGNORE INTO contribution_files
        (id,contribution_id,remote_file_id,safe_local_name,relative_path,mime_type,size,sha256,verified_at)
        VALUES (?,?,?,?,?,?,?,?,?)`)
      for (const file of contribution.files) insertFile.run(file.id, contribution.id, file.remoteFileId,
        file.safeLocalName, file.relativePath, file.mimeType, file.localSize, file.localSha256, contribution.importedAt.toISOString())
    })
    transaction()
  }

  async addAttempt(attempt: ImportAttempt): Promise<void> {
    this.database.prepare('INSERT INTO import_attempts (id,job_id,operation,outcome,error_code,error_message,attempted_at) VALUES (?,?,?,?,?,?,?)')
      .run(attempt.id, attempt.jobId, attempt.operation, attempt.outcome, attempt.errorCode ?? null, attempt.errorMessage ?? null, attempt.attemptedAt.toISOString())
  }

  async addConflict(conflict: ImportConflict): Promise<void> {
    this.database.prepare('INSERT INTO import_conflicts (id,job_id,kind,expected_value,actual_value,created_at) VALUES (?,?,?,?,?,?)')
      .run(conflict.id, conflict.jobId, conflict.kind, conflict.expectedValue ?? null, conflict.actualValue ?? null, conflict.createdAt.toISOString())
  }

  async saveBackup(record: LocalBackupRecord): Promise<void> {
    this.database.prepare('INSERT INTO local_backup_records (id,path,database_sha256,file_count,status,created_at,verified_at) VALUES (?,?,?,?,?,?,?)')
      .run(record.id, record.path, record.databaseSha256 ?? null, record.fileCount, record.status, record.createdAt.toISOString(), this.date(record.verifiedAt))
  }

  private date(value?: Date): string | null { return value?.toISOString() ?? null }

  private toJob(row?: JobRow): ContributionImportJob | null {
    if (!row) return null
    const optionalDate = (key: string): Date | undefined => row[key] ? new Date(String(row[key])) : undefined
    const optionalString = (key: string): string | undefined => row[key] === null ? undefined : String(row[key])
    const optionalNumber = (key: string): number | undefined => row[key] === null ? undefined : Number(row[key])
    return {
      id: String(row.id), batchId: String(row.batch_id), remoteId: String(row.remote_id),
      sourceType: String(row.source_type) as ContributionImportJob['sourceType'],
      status: String(row.status) as ContributionImportJob['status'], attemptCount: Number(row.attempt_count),
      lastError: optionalString('last_error'), nextRetryAt: optionalDate('next_retry_at'),
      remoteChecksum: optionalString('remote_checksum'), localChecksum: optionalString('local_checksum'),
      remotePayloadSize: optionalNumber('remote_payload_size'), localPayloadSize: optionalNumber('local_payload_size'),
      downloadedAt: optionalDate('downloaded_at'), verifiedAt: optionalDate('verified_at'),
      deletedRemoteAt: optionalDate('deleted_remote_at'), completedAt: optionalDate('completed_at'),
      idempotencyKey: String(row.idempotency_key), version: Number(row.version),
      createdAt: new Date(String(row.created_at)), updatedAt: new Date(String(row.updated_at)),
    }
  }

  private initialize(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS import_batches (id TEXT PRIMARY KEY,status TEXT NOT NULL,found_count INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,completed_at TEXT);
      CREATE TABLE IF NOT EXISTS contribution_import_jobs (id TEXT PRIMARY KEY,batch_id TEXT NOT NULL REFERENCES import_batches(id),remote_id TEXT NOT NULL UNIQUE,source_type TEXT NOT NULL,status TEXT NOT NULL,attempt_count INTEGER NOT NULL DEFAULT 0,last_error TEXT,next_retry_at TEXT,remote_checksum TEXT,local_checksum TEXT,remote_payload_size INTEGER,local_payload_size INTEGER,downloaded_at TEXT,verified_at TEXT,deleted_remote_at TEXT,completed_at TEXT,idempotency_key TEXT NOT NULL UNIQUE,version INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS imported_contributions (id TEXT PRIMARY KEY,job_id TEXT NOT NULL REFERENCES contribution_import_jobs(id),remote_id TEXT NOT NULL UNIQUE,source_type TEXT NOT NULL,payload_json TEXT NOT NULL,payload_sha256 TEXT NOT NULL,payload_size INTEGER NOT NULL,version INTEGER NOT NULL,imported_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS contribution_files (id TEXT PRIMARY KEY,contribution_id TEXT NOT NULL REFERENCES imported_contributions(id),remote_file_id TEXT NOT NULL,safe_local_name TEXT NOT NULL,relative_path TEXT NOT NULL,mime_type TEXT NOT NULL,size INTEGER NOT NULL,sha256 TEXT NOT NULL,verified_at TEXT NOT NULL,UNIQUE(contribution_id,remote_file_id));
      CREATE TABLE IF NOT EXISTS import_attempts (id TEXT PRIMARY KEY,job_id TEXT NOT NULL REFERENCES contribution_import_jobs(id),operation TEXT NOT NULL,outcome TEXT NOT NULL,error_code TEXT,error_message TEXT,attempted_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS import_conflicts (id TEXT PRIMARY KEY,job_id TEXT NOT NULL REFERENCES contribution_import_jobs(id),kind TEXT NOT NULL,expected_value TEXT,actual_value TEXT,created_at TEXT NOT NULL,resolved_at TEXT);
      CREATE TABLE IF NOT EXISTS local_backup_records (id TEXT PRIMARY KEY,path TEXT NOT NULL,database_sha256 TEXT,file_count INTEGER NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL,verified_at TEXT);
      CREATE INDEX IF NOT EXISTS idx_import_jobs_status_retry ON contribution_import_jobs(status,next_retry_at);
      CREATE INDEX IF NOT EXISTS idx_import_attempts_job ON import_attempts(job_id,attempted_at);
    `)
  }
}

