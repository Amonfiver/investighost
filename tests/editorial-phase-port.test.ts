import { describe, expect, it } from 'vitest'
import { classifyBatchWorkerError } from '@modules/factory-batches'

describe('batch worker error classification', () => {
  it('ERROR_CODE_PRESERVED_ON_FAILURE keeps typed geographic failure codes', () => {
    const error = Object.assign(new Error('No se pudo crear la identidad geográfica'), { code: 'GEOGRAPHY_IDENTITY_CREATE_FAILED' })
    expect(classifyBatchWorkerError(error)).toMatchObject({ code: 'GEOGRAPHY_IDENTITY_CREATE_FAILED', classification: 'TERMINAL' })
  })
})
