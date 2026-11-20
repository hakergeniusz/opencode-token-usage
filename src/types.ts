/** Structural token usage as reported by OpenCode's `TokenUsage.Info`. */
export interface UsageInfo {
  input?: number
  output?: number
  reasoning?: number
  cache?: {
    read?: number
    write?: number
  }
}

/** Accumulated numbers for one scope (session, model, day, or grand total). */
export interface Totals {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
  cost: number
  requests: number
}

/** One recorded LLM call. Also the source of truth for `rebuild`. */
export interface CallRecord {
  id: string
  sessionID: string
  modelKey?: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
  cost: number
  ts: number
}

/**
 * Persisted store. Kept in plugin storage under a single key as the durable
 * source for accounting and reports.
 */
export interface TokenUsageStore {
  version: 1
  total: Totals
  byModel: Record<string, Totals>
  byDay: Record<string, Totals>
  /** Per-day per-model breakdown, derived from calls (added for graph/tooltips). */
  byDayModel?: Record<string, Record<string, Totals>>
  sessions: Record<string, Totals>
  calls: Record<string, CallRecord>
  since: number
  updatedAt: number
}

/** Minimal structural type for the plugin storage API (avoids SDK type imports). */
export interface StorageLike {
  get(key: string): Promise<unknown>
  set(key: string, value: any): Promise<void>
}
