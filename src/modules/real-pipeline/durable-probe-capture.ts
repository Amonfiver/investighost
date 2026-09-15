import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type DurableProbeStatus = 'running' | 'completed' | 'incomplete' | 'failed' | 'timeout'

export interface DurableProbeRecord {
  version: 1
  probeId: string
  status: DurableProbeStatus
  startedAt: string
  completedAt?: string
  durationMs?: number
  payload?: Record<string, unknown>
}

export class DurableProbeCaptureError extends Error {
  constructor(readonly code: 'PROBE_ALREADY_RUNNING' | 'PROBE_NOT_STARTED', message: string) {
    super(message)
    this.name = 'DurableProbeCaptureError'
  }
}

/**
 * Captura local atómica para una sonda autorizada. El fichero se escribe antes
 * de iniciar la operación remota, por lo que un stdout efímero no es fuente de
 * verdad del resultado.
 */
export class DurableProbeCapture {
  constructor(
    private readonly file: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async begin(probeId: string, payload: Record<string, unknown>): Promise<DurableProbeRecord> {
    const existing = await this.read()
    if (existing?.status === 'running') {
      throw new DurableProbeCaptureError('PROBE_ALREADY_RUNNING', 'La sonda durable ya está en ejecución')
    }
    const record: DurableProbeRecord = {
      version: 1,
      probeId,
      status: 'running',
      startedAt: this.now().toISOString(),
      payload: structuredClone(payload),
    }
    await this.persist(record)
    return structuredClone(record)
  }

  async complete(
    status: Exclude<DurableProbeStatus, 'running'>,
    durationMs: number,
    payload: Record<string, unknown>,
  ): Promise<DurableProbeRecord> {
    const current = await this.read()
    if (!current) {
      throw new DurableProbeCaptureError('PROBE_NOT_STARTED', 'La sonda durable no fue inicializada')
    }
    const record: DurableProbeRecord = {
      ...current,
      status,
      completedAt: this.now().toISOString(),
      durationMs: Math.max(0, Math.round(durationMs)),
      payload: structuredClone(payload),
    }
    await this.persist(record)
    return structuredClone(record)
  }

  async read(): Promise<DurableProbeRecord | undefined> {
    try {
      return parseRecord(JSON.parse(await readFile(this.file, 'utf8')))
    } catch (error) {
      if (isFileNotFound(error)) return undefined
      throw error
    }
  }

  private async persist(record: DurableProbeRecord): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true })
    const temporary = `${this.file}.tmp`
    await writeFile(temporary, JSON.stringify(record), { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, this.file)
  }
}

function parseRecord(value: unknown): DurableProbeRecord {
  if (!value || typeof value !== 'object') throw new TypeError('Durable probe record inválido')
  const record = value as Record<string, unknown>
  const status = record.status
  if (
    record.version !== 1
    || typeof record.probeId !== 'string'
    || !['running', 'completed', 'incomplete', 'failed', 'timeout'].includes(String(status))
    || typeof record.startedAt !== 'string'
  ) throw new TypeError('Durable probe record inválido')
  return record as unknown as DurableProbeRecord
}

function isFileNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
}
