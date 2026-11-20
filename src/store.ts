import type {
  CallRecord,
  StorageLike,
  TokenUsageStore,
  Totals,
  UsageInfo,
} from "./types"

export const STORAGE_KEY = "token-usage/store"

export function zeroTotals(): Totals {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    total: 0,
    cost: 0,
    requests: 0,
  }
}

export function freshStore(): TokenUsageStore {
  const now = Date.now()
  return {
    version: 1,
    total: zeroTotals(),
    byModel: {},
    byDay: {},
    sessions: {},
    calls: {},
    since: now,
    updatedAt: now,
  }
}

/** Local YYYY-MM-DD (en-CA formats exactly that way). */
export function dayKey(ts: number): string {
  return new Date(ts).toLocaleDateString("en-CA")
}

export function addInto(dst: Totals, src: Totals): void {
  dst.input += src.input
  dst.output += src.output
  dst.cacheRead += src.cacheRead
  dst.cacheWrite += src.cacheWrite
  dst.total += src.total
  dst.cost += src.cost
  dst.requests += src.requests
}

/**
 * Convert OpenCode's `TokenUsage.Info` (+ call cost) into our Totals shape.
 * `reasoning` is folded into `output` so no generated tokens are lost;
 * `total` is input + output (cache excluded).
 */
export function totalsFromUsage(usage: UsageInfo, cost?: number): Totals {
  const input = usage.input ?? 0
  const output = (usage.output ?? 0) + (usage.reasoning ?? 0)
  const cacheRead = usage.cache?.read ?? 0
  const cacheWrite = usage.cache?.write ?? 0
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    total: input + output,
    cost: cost ?? 0,
    requests: 1,
  }
}

function totalsFromCall(call: CallRecord): Totals {
  return {
    input: call.input,
    output: call.output,
    cacheRead: call.cacheRead,
    cacheWrite: call.cacheWrite,
    total: call.total,
    cost: call.cost,
    requests: 1,
  }
}

function aggregate(store: TokenUsageStore, call: CallRecord): void {
  const t = totalsFromCall(call)
  addInto(store.total, t)

  store.sessions[call.sessionID] ??= zeroTotals()
  addInto(store.sessions[call.sessionID], t)

  if (call.modelKey) {
    store.byModel[call.modelKey] ??= zeroTotals()
    addInto(store.byModel[call.modelKey], t)
  }

  const day = dayKey(call.ts)
  store.byDay[day] ??= zeroTotals()
  addInto(store.byDay[day], t)

  store.byDayModel ??= {}
  store.byDayModel[day] ??= {}
  const modelKey = call.modelKey ?? "unknown"
  store.byDayModel[day][modelKey] ??= zeroTotals()
  addInto(store.byDayModel[day][modelKey], t)
}

async function load(storage: StorageLike, key: string): Promise<TokenUsageStore> {
  try {
    const raw = await storage.get(key)
    if (!raw || typeof raw !== "object") return freshStore()
    const parsed = raw as Partial<TokenUsageStore>
    const base = freshStore()
    const store: TokenUsageStore = {
      ...base,
      ...parsed,
      version: 1,
      total: { ...zeroTotals(), ...(parsed.total ?? {}) },
      byModel: parsed.byModel ?? {},
      byDay: parsed.byDay ?? {},
      byDayModel: parsed.byDayModel ?? {},
      sessions: parsed.sessions ?? {},
      calls: parsed.calls ?? {},
    }
    // Backfill per-day per-model breakdown for stores created before this field existed.
    if (Object.keys(store.calls).length > 0 && Object.keys(store.byDayModel ?? {}).length === 0) {
      for (const call of Object.values(store.calls)) {
        const day = dayKey(call.ts)
        store.byDayModel![day] ??= {}
        const modelKey = call.modelKey ?? "unknown"
        store.byDayModel![day][modelKey] ??= zeroTotals()
        addInto(store.byDayModel![day][modelKey], totalsFromCall(call))
      }
    }
    return store
  } catch {
    return freshStore()
  }
}

/**
 * Create a store bound to a plugin's storage context. All reads and writes go
 * through a single queue so concurrent usage events cannot lose updates.
 */
export function createUsageStore(storage: StorageLike, key: string = STORAGE_KEY) {
  let queue: Promise<unknown> = Promise.resolve()

  function enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = queue.then(fn, fn)
    queue = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  const ready = () => enqueue(async () => undefined)

  const get = () => enqueue(async () => load(storage, key))

  /** Record one call, deduplicated by `id`. */
  const recordCall = (call: CallRecord) =>
    enqueue(async () => {
      const store = await load(storage, key)
      if (store.calls[call.id]) return
      store.calls[call.id] = call
      aggregate(store, call)
      store.updatedAt = Date.now()
      await storage.set(key, store)
    })

  /** Recompute every aggregate from the stored call log. */
  const rebuild = () =>
    enqueue(async () => {
      const existing = await load(storage, key)
      const store = freshStore()
      store.since = existing.since
      for (const call of Object.values(existing.calls)) {
        store.calls[call.id] = call
        aggregate(store, call)
      }
      store.updatedAt = Date.now()
      await storage.set(key, store)
      return {
        sessions: Object.keys(store.sessions).length,
        calls: Object.keys(store.calls).length,
      }
    })

  /** Clear global history, re-baselining the given session when provided. */
  const reset = (sessionID?: string) =>
    enqueue(async () => {
      const existing = await load(storage, key)
      const store = freshStore()
      if (sessionID) {
        for (const call of Object.values(existing.calls)) {
          if (call.sessionID !== sessionID) continue
          store.calls[call.id] = call
          aggregate(store, call)
        }
      }
      await storage.set(key, store)
    })

  return { ready, get, recordCall, rebuild, reset }
}

export type UsageStore = ReturnType<typeof createUsageStore>
