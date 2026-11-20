import { Plugin, usePlugin } from "@opencode/plugin/tui"
import { For, Show, createMemo, createSignal, onMount } from "solid-js"
import { TokenUsage } from "./rpc"

type DayModel = {
  name: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
  cost: number
  requests: number
}
type DayEntry = {
  date: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  total: number
  cost: number
  requests: number
  models: DayModel[]
}
type DailyPayload = {
  since: number
  updatedAt: number
  total: DayModel
  days: DayEntry[]
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "0"
  if (n < 1000) return `${Math.round(n)}`
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

function fmtInt(n: number): string {
  if (!Number.isFinite(n)) return "0"
  return Math.round(n).toLocaleString("en-US")
}

function fmtCost(cost: number): string {
  if (!Number.isFinite(cost)) return "$0.0000"
  return `$${cost > 0.5 ? cost.toFixed(2) : cost.toFixed(4)}`
}

function localDateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function startOfWeekMonday(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = x.getDay() // 0 Sun .. 6 Sat
  const diff = dow === 0 ? -6 : 1 - dow
  x.setDate(x.getDate() + diff)
  return x
}

function levelFor(total: number, max: number): number {
  if (!Number.isFinite(total) || total <= 0 || max <= 0) return 0
  const r = total / max
  if (r >= 0.75) return 4
  if (r >= 0.45) return 3
  if (r >= 0.2) return 2
  return 1
}

function dayDetailText(day: DayEntry): string {
  const lines = [
    `${day.date}`,
    `${fmtInt(day.total)} tokens · ${fmtCost(day.cost)} · ${day.requests} req`,
    `↑${fmtInt(day.input)} in · ↓${fmtInt(day.output)} out · cache r/w ${fmtInt(day.cacheRead)}/${fmtInt(day.cacheWrite)}`,
  ]
  const top = (day.models ?? []).slice(0, 5)
  if (top.length > 0) {
    lines.push("Models:")
    for (const m of top) {
      lines.push(`  • ${m.name}: ${fmt(m.total)} tok · ${fmtCost(m.cost)} · ${m.requests} req`)
    }
  } else {
    lines.push("No model breakdown recorded.")
  }
  return lines.join("\n")
}

function TokenStatus(props: { getSessionID?: () => string | undefined }) {
  const context = usePlugin()
  const usage = createMemo(() => {
    try {
      const id = props.getSessionID?.() ?? (context.data.session.list() ?? [])[0]?.id
      if (!id) return undefined
      const messages = context.data.session.message.list(id) ?? []
      let input = 0
      let output = 0
      let cost = 0
      const byModel: Record<string, number> = {}
      for (const message of messages as any[]) {
        if (message?.type !== "assistant") continue
        const tokens = message.tokens
        let msgTotal = 0
        if (tokens) {
          const inp = (tokens.input ?? 0) + (tokens.cache?.read ?? 0) + (tokens.cache?.write ?? 0)
          const out = (tokens.output ?? 0) + (tokens.reasoning ?? 0)
          input += inp
          output += out
          msgTotal = inp + out
        }
        cost += message.cost ?? 0
        const model = message.modelID ? `${message.providerID ?? "?"}/${message.modelID}` : undefined
        if (model && msgTotal > 0) byModel[model] = (byModel[model] ?? 0) + msgTotal
      }
      if (input === 0 && output === 0 && cost === 0) return undefined
      const top = Object.entries(byModel).sort((a, b) => b[1] - a[1])[0]?.[0]
      return { input, output, cost, top }
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
      {value.top ? ` · ★ ${value.top}` : ""}
    </text>
  )
}

function DailyUsageView() {
  const context = usePlugin()
  const [payload, setPayload] = createSignal<DailyPayload | undefined>()
  const [hovered, setHovered] = createSignal<{ date: string; entry?: DayEntry } | null>(null)
  const [error, setError] = createSignal<string | undefined>()

  const load = async () => {
    try {
      const data = (await context.client.rpc(TokenUsage).daily({})) as DailyPayload
      setPayload(data)
      setError(undefined)
    } catch (e) {
      setError(String(e))
    }
  }

  onMount(() => {
    void load()
  })

  const byDate = createMemo(() => {
    const map = new Map<string, DayEntry>()
    for (const d of payload()?.days ?? []) map.set(d.date, d)
    return map
  })

  const calendar = createMemo(() => {
    const today = new Date()
    const end = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    const start = addDays(end, -364)
    const gridStart = startOfWeekMonday(start)
    const days: Date[] = []
    for (let d = new Date(gridStart); d <= end; d = addDays(d, 1)) days.push(new Date(d))
    const weeks: Date[][] = []
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7))
    return { weeks, start, end }
  })

  const maxTotal = createMemo(() => {
    let m = 0
    for (const d of payload()?.days ?? []) if (d.total > m) m = d.total
    return m
  })

  const colorForLevel = (level: number): string => {
    if (level <= 0) return (context.theme.text as any).muted ?? context.theme.text.base
    if (level === 1) return context.theme.diff?.added ?? context.theme.text.base
    if (level === 2) return context.theme.syntax?.string ?? context.theme.text.base
    if (level === 3) return context.theme.syntax?.keyword ?? context.theme.text.base
    return context.theme.syntax?.function ?? context.theme.text.base
  }

  const charForLevel = (level: number): string => (level <= 0 ? "·" : "■")

  const monthLabels = createMemo(() => {
    const weeks = calendar().weeks
    const labels: Array<{ index: number; label: string }> = []
    let lastMonth = -1
    weeks.forEach((week, i) => {
      const first = week[0]
      const month = first.getMonth()
      if (month !== lastMonth) {
        labels.push({ index: i, label: first.toLocaleString("en-US", { month: "short" }) })
        lastMonth = month
      }
    })
    return labels
  })

  const showDayDialog = async (day: DayEntry | undefined, date: string) => {
    if (day) {
      await context.ui.dialog.alert({ title: `Token usage — ${date}`, message: dayDetailText(day) })
      return
    }
    await context.ui.dialog.alert({ title: `Token usage — ${date}`, message: `${date}\nNo usage recorded.` })
  }

  const hoverInfo = () => {
    const h = hovered()
    if (!h) return "Hover a day cell to see token usage for that day. Click a day for details."
    if (h.entry) return dayDetailText(h.entry)
    return `${h.date}\nNo usage recorded.`
  }

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

  return (
    <box flexDirection="column" padding={1} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={context.theme.text.base}>
          Token usage by day (hover a cell for details)
        </text>
        <text fg={(context.theme.text as any).muted ?? context.theme.text.base}>
          {payload() ? `${Object.keys(byDate() as any).length ? payload()!.days.length : 0} active days` : "Loading…"}
        </text>
      </box>

      <Show when={error()}>
        <text fg={context.theme.diff?.removed ?? context.theme.text.base}>
          Failed to load usage data: {error()} (is the server plugin loaded?)
        </text>
      </Show>

      <Show when={payload()} fallback={<text fg={(context.theme.text as any).muted ?? context.theme.text.base}>Loading token usage…</text>}>
        <box flexDirection="column" gap={0}>
          <box flexDirection="row">
            <text>{"    "}</text>
            <For each={calendar().weeks}>
              {(week, i) => {
                const label = monthLabels().find((m) => m.index === i())?.label ?? ""
                return <text fg={(context.theme.text as any).muted ?? context.theme.text.base}>{(label + "  ").slice(0, 2) + " "}</text>
              }}
            </For>
          </box>

          <For each={dayLabels}>
            {(label, row) => (
              <box flexDirection="row">
                <text fg={(context.theme.text as any).muted ?? context.theme.text.base}>{label.padEnd(4)}</text>
                <For each={calendar().weeks}>
                  {(week) => {
                    const d = week[row()]
                    if (!d) return <text>{"   "}</text>
                    const key = localDateKey(d)
                    const inRange = d >= calendar().start && d <= calendar().end
                    const entry = () => (inRange ? byDate().get(key) : undefined)
                    const level = () => (entry() ? levelFor(entry()!.total, maxTotal()) : 0)
                    const fg = () => (inRange ? colorForLevel(level()) : (context.theme.text as any).muted ?? context.theme.text.base)
                    const ch = () => (inRange ? charForLevel(level()) : " ")
                    return (
                      <box
                        onMouseOver={() => inRange && setHovered({ date: key, entry: entry() })}
                        onMouseOut={() => setHovered((h) => (h && h.date === key ? null : h))}
                        onMouseDown={() => inRange && void showDayDialog(entry(), key)}
                      >
                        <text fg={fg()}>{ch() + "  "}</text>
                      </box>
                    )
                  }}
                </For>
              </box>
            )}
          </For>
        </box>

        <box flexDirection="row" gap={2}>
          <text fg={(context.theme.text as any).muted ?? context.theme.text.base}>
            Less {charForLevel(0)} {charForLevel(1)} {charForLevel(2)} {charForLevel(3)} {charForLevel(4)} More
          </text>
          <text fg={(context.theme.text as any).muted ?? context.theme.text.base}>
            Total: {fmtInt(payload()!.total.total)} tok · {fmtCost(payload()!.total.cost)}
          </text>
        </box>

        <box border padding={1} flexDirection="column">
          <text fg={context.theme.text.base}>
            {hoverInfo()}
          </text>
        </box>
      </Show>

      <text fg={(context.theme.text as any).muted ?? context.theme.text.base}>
        Tip: open via command palette “Token usage: daily stats” (plugin route). Built-in /stats heatmap cannot be modified by plugins; this view shows per-day token usage on hover/click.
      </text>
    </box>
  )
}

export default Plugin.define({
  id: "opencode-token-usage.tui",
  setup(context) {
    const cleanups: Array<() => void> = []

    try {
      const unregister = context.ui.slot({
        append: "prompt.footer.status",
        render: (input: any) => <TokenStatus getSessionID={() => input?.sessionID} />,
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

    try {
      const unroute = context.ui.router.register({
        name: "token-usage",
        render: () => <DailyUsageView />,
      })
      cleanups.push(unroute)
    } catch (err) {
      console.error(`[token-usage] failed to register route: ${err}`)
    }

    try {
      context.keymap.layer(() => ({
        mode: "global",
        priority: 10,
        commands: [
          {
            id: "token-usage.daily",
            title: "Token usage: daily stats",
            description: "Show daily token/cost usage heatmap (hover a day for details)",
            group: "Token usage",
            palette: true,
            slash: { name: "token-stats" },
            run: () => {
              context.ui.router.navigate({ type: "plugin", name: "token-usage" })
            },
          },
        ],
      }))
    } catch (err) {
      console.error(`[token-usage] failed to register command: ${err}`)
    }

    return () => cleanups.forEach((fn) => fn())
  },
})
