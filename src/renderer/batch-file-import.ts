import type { DestinationBatchImportResult } from '@shared/factory-batch-contracts'
import { validateBatchFile } from './factory-presentation'

export type BatchFileLike = Pick<File, 'name' | 'type' | 'text'>

export type BatchFileImportOutcome =
  | { ok: true; result: DestinationBatchImportResult }
  | { ok: false; error: string }

/** UI boundary for a user-selected batch file. The main-process importer owns
 * JSON parsing, schema validation and the all-or-nothing durable write. */
export async function importBatchFile(
  file: BatchFileLike,
  importer: (jsonText: string) => Promise<DestinationBatchImportResult>,
): Promise<BatchFileImportOutcome> {
  const invalid = validateBatchFile(file)
  if (invalid) return { ok: false, error: invalid }

  try {
    return { ok: true, result: await importer(await file.text()) }
  } catch {
    return { ok: false, error: 'Este archivo no contiene un lote compatible.' }
  }
}
