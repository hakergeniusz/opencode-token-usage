import { formatCost, formatInt, formatTokens, formatTotalsLine, topEntries } from "./format"
import { dayKey } from "./store"
import type { TokenUsageStore, Totals } from "./types"

export function buildSessionReport(store: TokenUsageStore, sessionID?: string): string[] {
  const lines: string[] = []
  const session = sessionID ? store.sessions[sessionID] : undefined
  if (session) {
    lines.push(formatTotalsLine(session))
  } else {
    lines.push("no usage recorded for this session yet")
  }
  lines.push(`global: ${formatTotalsLine(store.total)} across ${Object.keys(store.sessions).length} sessions`)
  return lines
}

export function buildGlobalReport(store: TokenUsageStore, days = 7): string[] {
  const lines: string[] = [
    formatTotalsLine(store.total),
    `${Object.keys(store.sessions).length} sessions tracked since ${new Date(store.since).toLocaleDateString()}`,
  ]

  const today = store.byDay[dayKey(Date.now())]
  if (today && today.requests > 0) lines.push(`today: ${formatTotalsLine(today)}`)

  const topModels = topEntries(store.byModel, 5)
  if (topModels.length > 0) {
    lines.push("top models:")
    for (const [model, t] of topModels) {
      lines.push(
        `  ${model}: ${formatTokens(t.input)} in · ${formatTokens(t.output)} out · ${formatCost(t.cost)}`,
      )
    }
  }

  const dayKeys = Object.keys(store.byDay).sort().slice(-days)
  if (dayKeys.length > 0) {
    lines.push(`last ${dayKeys.length} days:`)
    for (const day of dayKeys) {
      const t = store.byDay[day]
      lines.push(`  ${day}: ${formatTokens(t.total)} · ${formatCost(t.cost)} · ${t.requests} req`)
    }
  }
  return lines
}

export function buildModelsReport(store: TokenUsageStore, limit = 20): string[] {
  const top = topEntries(store.byModel, limit)
  return top.length > 0
    ? top.map(([m, t]) => `${m}: ${formatTotalsLine(t)}`)
    : ["no model usage tracked yet"]
}

export function buildDaysReport(store: TokenUsageStore, n: number): string[] {
  const dayKeys = Object.keys(store.byDay).sort().slice(-n)
  return dayKeys.length > 0
    ? dayKeys.map((d) => `${d}: ${formatTotalsLine(store.byDay[d])}`)
    : ["no daily usage tracked yet"]
}

export function buildCallText(store: TokenUsageStore, scope: string, days: number, sessionID?: string): string {
  let totals: Totals | undefined
  switch (scope) {
    case "session":
      totals = sessionID ? store.sessions[sessionID] : undefined
      return totals
        ? `Session usage: ${formatTotalsLine(totals)}`
        : "No usage recorded for this session yet."
    case "global":
      return `Global usage (${Object.keys(store.sessions).length} sessions): ${formatTotalsLine(store.total)}`
    case "models": {
      const top = topEntries(store.byModel, 10)
      return top.length > 0
        ? `Usage by model:\n${top.map(([m, t]) => `- ${m}: ${formatTotalsLine(t)}`).join("\n")}`
        : "No model usage tracked yet."
    }
    case "days": {
      const dayKeys = Object.keys(store.byDay).sort().slice(-days)
      return dayKeys.length > 0
        ? `Usage by day:\n${dayKeys.map((d) => `- ${d}: ${formatTotalsLine(store.byDay[d])}`).join("\n")}`
        : "No daily usage tracked yet."
    }
    default:
      return "Unknown scope. Use one of: session, global, models, days."
  }
}

export const COMMAND_DESCRIPTION =
  "Show token & cost usage. Args: global | models | days [n] | rebuild | reset [confirm] | session"

export const SUBCOMMANDS = ["global", "models", "days", "rebuild", "reset", "session"]
