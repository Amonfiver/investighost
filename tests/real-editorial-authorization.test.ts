import { describe, expect, it } from 'vitest'
import {
  REAL_EDITORIAL_FEATURE_ENV,
  readRealEditorialAuthorization,
} from '../src/main/real-editorial-authorization'
import {
  REAL_EDITORIAL_FEATURE_TOKEN,
} from '@shared/real-editorial-pilot-contracts'
import {
  REAL_EXECUTION_FEATURE_TOKEN,
} from '@modules/real-pipeline/real-pilot-gate'

describe('contrato de autorización del piloto editorial real', () => {
  it('permanece cerrado sin la variable editorial exacta', () => {
    expect(readRealEditorialAuthorization({})).toEqual({
      enabled: false,
      featureToken: undefined,
    })
    expect(readRealEditorialAuthorization({
      INVESTIGHOST_REAL_EXECUTION_TOKEN: REAL_EXECUTION_FEATURE_TOKEN,
    })).toEqual({
      enabled: false,
      featureToken: undefined,
    })
  })

  it('habilita las operaciones editoriales con el token independiente exacto', () => {
    expect(REAL_EDITORIAL_FEATURE_ENV).toBe('INVESTIGHOST_REAL_EDITORIAL_TOKEN')
    expect(readRealEditorialAuthorization({
      [REAL_EDITORIAL_FEATURE_ENV]: REAL_EDITORIAL_FEATURE_TOKEN,
    })).toEqual({
      enabled: true,
      featureToken: REAL_EDITORIAL_FEATURE_TOKEN,
    })
  })

  it('rechaza valores booleanos textuales y tokens de otro gate', () => {
    for (const value of ['true', '1', REAL_EXECUTION_FEATURE_TOKEN]) {
      expect(readRealEditorialAuthorization({
        [REAL_EDITORIAL_FEATURE_ENV]: value,
      }).enabled).toBe(false)
    }
  })
})
