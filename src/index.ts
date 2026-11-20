import { Plugin } from "@opencode/plugin"
import { formatTotalsLine } from "./format"
import {
  COMMAND_DESCRIPTION,
  SUBCOMMANDS,
  buildCallText,
  buildDaysReport,
  buildGlobalReport,
  buildModelsReport,
  buildSessionReport,
} from "./report"
import { STORAGE_KEY, createUsageStore, totalsFromUsage } from "./store"
import type { CallRecord } from "./types"

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
              // Auxiliary calls have no primary model attribution, matching
              // the original extension's treatment of nested tool usage.
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

    // Tool so the agent can query usage itself.
    const toolReg = await c.tool.transform((editor: any) => {
      editor.add({
        name: "token_usage",
        description:
          "Query token and cost usage for the current session or globally across all OpenCode sessions.",
        input: {
          type: "object",
          properties: {
            scope: {
              type: "string",
              enum: ["session", "global", "models", "days"],
              description: "Which usage to report",
            },
            days: {
              type: "integer",
              minimum: 1,
              maximum: 90,
              description: "Days of history for scope=days",
            },
          },
          required: ["scope"],
          additionalProperties: false,
        },
        options: { codemode: true },
        execute: async (input: any, toolContext: any) => {
          await store.ready()
          const snapshot = await store.get()
          const scope = input?.scope ?? "session"
          const days = Math.min(Math.max(Number(input?.days) || 7, 1), 90)
          return {
            content: buildCallText(snapshot, scope, days, toolContext?.sessionID),
          }
        },
      })
    })

    // `/tokens` command removed by design: usage is exposed via the TUI footer status,
    // the `token_usage` tool, and OpenCode's built-in `/stats` (CLI/TUI). Keeping
    // reports available programmatically through the tool instead of a separate command.

    return () => {
      controller.abort()
      void modelHook.dispose()
      void toolReg.dispose()
      void commandReg.dispose()
    }
  },
})
