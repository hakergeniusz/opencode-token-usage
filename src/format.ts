import type { Totals } from "./types"

/** Compact number formatting in the style of Claude Code. */
export function formatTokens(n: number): string {
  if (!Number.isFinite(n)) return "0"
  if (n < 1000) return `${Math.round(n)}`
  if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

export function formatInt(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

/** Four decimals below $0.50, two above — same rule as Claude Code. */
export function formatCost(cost: number): string {
  if (!Number.isFinite(cost)) return "$0.0000"
  return `$${cost > 0.5 ? cost.toFixed(2) : cost.toFixed(4)}`
}

export function formatTotalsLine(t: Totals): string {
  const parts = [`↑${formatInt(t.input)} in`, `↓${formatInt(t.output)} out`]
  if (t.cacheRead > 0 || t.cacheWrite > 0) {
    parts.push(`${formatInt(t.cacheRead)} cache-read`, `${formatInt(t.cacheWrite)} cache-write`)
  }
  parts.push(`${formatInt(t.total)} total`, formatCost(t.cost), `${t.requests} req`)
  return parts.join(" · ")
}

export function topEntries(
  map: Record<string, Totals>,
  limit: number,
): Array<[string, Totals]> {
  return Object.entries(map)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, limit)
}
