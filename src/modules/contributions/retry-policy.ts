import type { ContributionRetryPolicy } from './types'

export class BoundedContributionRetryPolicy implements ContributionRetryPolicy {
  private readonly delaysMs = [0, 30_000, 120_000, 600_000] as const

  nextRetry(attemptCount: number, now = new Date()): Date | null {
    const delay = this.delaysMs[attemptCount]
    return delay === undefined ? null : new Date(now.getTime() + delay)
  }

  isRetryable(error: unknown): boolean {
    if (!(error instanceof Error)) return true
    return !error.message.startsWith('INVALID_PAYLOAD')
  }
}

