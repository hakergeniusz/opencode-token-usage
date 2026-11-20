import { Plugin } from "@opencode/plugin"
import { TokenUsage } from "./rpc"
import { STORAGE_KEY, createUsageStore, totalsFromUsage } from "./store"
import type { CallRecord, Totals } from "./types"

export default Plugin.define({
  id: "opencode-token-usage",
  async setup(ctx) {
    // The V2 context shape is large and versioned; access it through a loose
    // alias so this plugin keeps running across minor SDK revisions.
    const c: any = ctx
    const options = (c.options ?? {}) as Record<string, unknown>
    const storeKey =
      typeof options.storeKey === "string" ? (options.storeKey as string) : STORAGE_KEY

    const store = createUsageStore(c.storage, storeKey)

    // The `context` hook carries the resolved model for each primary agent
    // step. Remember it so `session.step.ended` can attribute usage per model.
    const pendingModel = new Map<string, string>()
    const modelHook = await c.session.hook("context", (event: any) => {
      const model = event?.model
      if (!event?.sessionID || !model?.providerID || !model?.id) return
      pendingModel.set(event.sessionID, `${model.providerID}/${model.id}`)
    })

    // Live accounting: one record per primary model step, plus auxiliary
    // usages (title / compaction / generate) reported by OpenCode itself.
    const controller = new AbortController()
    void (async () => {
      for await (const raw of c.event.subscribe({
        types: ["session.step.ended", "session.usage.recorded"],
        signal: controller.signal,
      })) {
        const event = raw as any
        try {
          if (event.type === "session.step.ended") {
            const d = event.data ?? {}
            if (!d.tokens) continue
            const modelKey = pendingModel.get(d.sessionID)
            pendingModel.delete(d.sessionID)
            const call: CallRecord = {
              id: `step:${d.assistantMessageID ?? event.id}`,
              sessionID: d.sessionID,
              modelKey,
              ...totalsFromUsage(d.tokens, d.cost),
              ts: event.created ?? Date.now(),
            }
            await store.recordCall(call)
          } else if (event.type === "session.usage.recorded") {
            const d = event.data ?? {}
            if (!d.tokens) continue
            const call: CallRecord = {
              id: `usage:${d.source ?? "unknown"}:${event.id}`,
              sessionID: d.sessionID,
              // Auxiliary calls have no primary model attribution.
              ...totalsFromUsage(d.tokens, d.cost),
              ts: event.created ?? Date.now(),
            }
            await store.recordCall(call)
          }
        } catch (err) {
          console.error(`[token-usage] failed to record usage: ${err}`)
        }
      }
    })()

    const toModelEntry = (name: string, t: Totals) => ({
      name,
      input: t.input,
      output: t.output,
      cacheRead: t.cacheRead,
      cacheWrite: t.cacheWrite,
      total: t.total,
      cost: t.cost,
      requests: t.requests,
    })

    const rpc = await c.rpc.register(TokenUsage, {
      daily: async () => {
        await store.ready()
        const snapshot = await store.get()
        const days = Object.keys(snapshot.byDay)
          .sort()
          .map((date) => {
            const t = snapshot.byDay[date]
            const byModel = snapshot.byDayModel?.[date] ?? {}
            const models = Object.entries(byModel)
              .map(([name, mt]) => toModelEntry(name, mt as Totals))
              .sort((a, b) => b.total - a.total)
            return {
              date,
              input: t.input,
              output: t.output,
              cacheRead: t.cacheRead,
              cacheWrite: t.cacheWrite,
              total: t.total,
              cost: t.cost,
              requests: t.requests,
              models,
            }
          })
        return {
          since: snapshot.since,
          updatedAt: snapshot.updatedAt,
          total: {
            input: snapshot.total.input,
            output: snapshot.total.output,
            cacheRead: snapshot.total.cacheRead,
            cacheWrite: snapshot.total.cacheWrite,
            total: snapshot.total.total,
            cost: snapshot.total.cost,
            requests: snapshot.total.requests,
          },
          days,
        }
      },
    })

    return () => {
      controller.abort()
      void modelHook.dispose()
      void rpc.dispose()
    }
  },
})
