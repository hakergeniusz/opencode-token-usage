import { formatCost, formatInt, formatTokens, formatTotalsLine, topEntries } from "./format"
import { dayKey } from "./store"
import type { TokenUsageStore, Totals } from "./types"

function topModel(store: TokenUsageStore): [string, Totals] | undefined {
  return topEntries(store.byModel, 1)[0]
}

function spark(values: number[]): string {
  if (values.length === 0) return ""
  const chars = "▁▂▃▄▅▆▇█"
  const max = Math.max(...values, 1)
  return values.map((v) => chars[Math.min(chars.length - 1, Math.floor((v / max) * (chars.length - 1)))]).join("")
}

function dayDetail(store: TokenUsageStore, day: string): string {
  const t = store.byDay[day]
  if (!t) return day
  const byModel = (store.byDayModel?.[day] ?? {}) as Record<string, Totals>
  const top = topEntries(byModel, 3)
  const topStr = top.length ? ` · top: ${top.map(([m, x]) => `${m} ${formatTokens(x.total)}`).join(", ")}` : ""
  return `${day}: ${formatTotalsLine(t)}${topStr}`
}

export function buildSessionReport(store: TokenUsageStore, sessionID?: string): string[] {
  const lines: string[] = []
  const session = sessionID ? store.sessions[sessionID] : undefined
  if (session) {
    lines.push(formatTotalsLine(session))
  } else {
    lines.push("no usage recorded for this session yet")
  }
  const tm = topModel(store)
  if (tm) lines.push(`top model: ${tm[0]} (${formatTokens(tm[1].total)} tok · ${formatCost(tm[1].cost)})`)
  lines.push(`global: ${formatTotalsLine(store.total)} across ${Object.keys(store.sessions).length} sessions`)
  return lines
}

export function buildGlobalReport(store: TokenUsageStore, days = 14): string[] {
  const lines: string[] = [
    formatTotalsLine(store.total),
    `${Object.keys(store.sessions).length} sessions tracked since ${new Date(store.since).toLocaleDateString()}`,
  ]

  const tm = topModel(store)
  if (tm) lines.push(`top model: ${tm[0]} — ${formatTokens(tm[1].total)} tok · ${formatCost(tm[1].cost)} · ${tm[1].requests} req`)

  const today = store.byDay[dayKey(Date.now())]
  if (today && today.requests > 0) lines.push(`today: ${formatTotalsLine(today)}`)

  const topModels = topEntries(store.byModel, 5)
  if (topModels.length > 0) {
    lines.push("top models:")
    for (const [model, t] of topModels) {
      lines.push(
        `  ${model}: ${formatTokens(t.input)} in · ${formatTokens(t.output)} out · ${formatTokens(t.total)} total · ${formatCost(t.cost)} · ${t.requests} req`,
      )
    }
  }

  const dayKeys = Object.keys(store.byDay).sort().slice(-days)
  if (dayKeys.length > 0) {
    const series = dayKeys.map((d) => store.byDay[d]?.total ?? 0)
    lines.push(`daily activity (last ${dayKeys.length} days): ${spark(series)}`)
    lines.push("days (hover-equivalent details):")
    for (const day of dayKeys) lines.push(`  ${dayDetail(store, day)}`)
  }
  return lines
}

export function buildModelsReport(store: TokenUsageStore, limit = 20): string[] {
  const top = topEntries(store.byModel, limit)
  if (top.length === 0) return ["no model usage tracked yet"]
  const lines = top.map(([m, t], i) => `${i === 0 ? "★ " : "  "}${m}: ${formatTotalsLine(t)}`)
  return lines
}

export function buildDaysReport(store: TokenUsageStore, n: number): string[] {
  const dayKeys = Object.keys(store.byDay).sort().slice(-n)
  if (dayKeys.length === 0) return ["no daily usage tracked yet"]
  const series = dayKeys.map((d) => store.byDay[d]?.total ?? 0)
  const lines = [`daily activity: ${spark(series)}`]
  for (const day of dayKeys) lines.push(dayDetail(store, day))
  return lines
}

export function buildCallText(store: TokenUsageStore, scope: string, days: number, sessionID?: string): string {
  let totals: Totals | undefined
  switch (scope) {
    case "session":
      totals = sessionID ? store.sessions[sessionID] : undefined
      return totals
        ? `Session usage: ${formatTotalsLine(totals)}`
        : "No usage recorded for this session yet."
    case "global": {
      const tm = topModel(store)
      const head = tm ? `\nTop model: ${tm[0]} (${formatTokens(tm[1].total)} tok, ${formatCost(tm[1].cost)})` : ""
      return `Global usage (${Object.keys(store.sessions).length} sessions): ${formatTotalsLine(store.total)}${head}`
    }
    case "models": {
      const top = topEntries(store.byModel, 10)
      return top.length > 0
        ? `Usage by model (★ = top):\n${top.map(([m, t], i) => `${i === 0 ? "★" : "-"} ${m}: ${formatTotalsLine(t)}`).join("\n")}`
        : "No model usage tracked yet."
    }
    case "days": {
      const dayKeys = Object.keys(store.byDay).sort().slice(-days)
      if (dayKeys.length === 0) return "No daily usage tracked yet."
      const series = dayKeys.map((d) => store.byDay[d]?.total ?? 0)
      return `Usage by day (${spark(series)}):\n${dayKeys.map((d) => `- ${dayDetail(store, d)}`).join("\n")}`
    }
    default:
      return "Unknown scope. Use one of: session, global, models, days."
  }
}

export const COMMAND_DESCRIPTION =
  "Show token & cost usage. Args: global | models | days [n] | rebuild | reset [confirm] | session"

export const SUBCOMMANDS = ["global", "models", "days", "rebuild", "reset", "session"]
