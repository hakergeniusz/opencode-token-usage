import { Plugin, usePlugin } from "@opencode/plugin/tui"
import { createMemo } from "solid-js"

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0"
  if (n < 1000) return `${Math.round(n)}`
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

function fmtCost(cost: number): string {
  if (!Number.isFinite(cost)) return "$0.0000"
  return `$${cost > 0.5 ? cost.toFixed(2) : cost.toFixed(4)}`
}

/**
 * Compact live readout for the current session. It mirrors the numbers the
 * server part accumulates, sourced from OpenCode's own cached session data.
 */
function TokenStatus(props: { getSessionID?: () => string | undefined }) {
  const context = usePlugin()

  const usage = createMemo(() => {
    try {
      const id =
        props.getSessionID?.() ?? (context.data.session.list() ?? [])[0]?.id
      if (!id) return undefined

      const messages = context.data.session.message.list(id) ?? []
      let input = 0
      let output = 0
      let cost = 0
      for (const message of messages as any[]) {
        if (message?.type !== "assistant") continue
        const tokens = message.tokens
        if (tokens) {
          input += (tokens.input ?? 0) + (tokens.cache?.read ?? 0) + (tokens.cache?.write ?? 0)
          output += (tokens.output ?? 0) + (tokens.reasoning ?? 0)
        }
        cost += message.cost ?? 0
      }
      if (input === 0 && output === 0 && cost === 0) return undefined
      return { input, output, cost }
    } catch {
      return undefined
    }
  })

  const value = usage()
  if (!value) return null

  const fg = (context.theme.text as any).muted ?? context.theme.text.base
  return (
    <text fg={fg}>
      {"◈ "}
      {fmt(value.input)}
      {" in · "}
      {fmt(value.output)}
      {" out · "}
      {fmtCost(value.cost)}
    </text>
  )
}

export default Plugin.define({
  id: "opencode-token-usage.tui",
  setup(context) {
    const cleanups: Array<() => void> = []

    try {
      const unregister = context.ui.slot({
        append: "prompt.footer.status",
        render: (input: any) => (
          <TokenStatus getSessionID={() => input?.sessionID} />
        ),
      })
      cleanups.push(unregister)
    } catch (err) {
      console.error(`[token-usage] failed to register status slot: ${err}`)
    }

    try {
      const stop = context.data.listen(({ details }: any) => {
        const type = details?.type
        if (
          type === "session.step.ended" ||
          type === "session.usage.recorded" ||
          type === "session.compaction.ended" ||
          type === "session.execution.succeeded"
        ) {
          const sessionID = details?.data?.sessionID
          if (sessionID) void context.data.session.message.sync(sessionID)
        }
      })
      cleanups.push(stop)
    } catch (err) {
      console.error(`[token-usage] failed to register event listener: ${err}`)
    }

    return () => cleanups.forEach((fn) => fn())
  },
})
