# opencode-token-usage

Global token and cost accounting for [OpenCode](https://opencode.ai). Tracks usage across sessions, persists totals in plugin storage, and shows daily token/cost usage in a TUI view.

## What it does

- Records every LLM call: primary agent steps, plus auxiliary title / compaction / generate usages emitted by OpenCode.
- Keeps cumulative totals across **all sessions** — grand total, per model, per day (with per-day per-model breakdown), and per session — persisted durably in plugin storage.
- Deduplicates calls by id so redelivered events never double-count.
- Formats totals in a compact style: `1.2k` / `3.45M` token counts and `$0.0234`-style costs.
- **No `token_usage` tool** is registered.
- Adds a compact live token/cost readout to the TUI prompt footer.
- Registers a **daily usage view** (plugin route) showing a calendar heatmap of token usage. Hover a day cell to see that day’s token/cost usage (and top models); click a day to open full details.

> **Note:** OpenCode’s built-in `/stats` view/heatmap cannot be modified by the TUI plugin API. This plugin provides its own daily usage view instead. Use OpenCode’s built-in `/stats` for native stats, and this view for persistent token/cost-per-day details.

## Install / load

```jsonc title="opencode.jsonc"
{
  "plugins": [
    "opencode-token-usage"
  ]
}
```

The server part (`.`), TUI part (`./tui`), and RPC contract (`./rpc`) load together as a package. For a TUI-only setup against a remote server, add the package to `cli.json` (ensure the server part is loaded on the server).

### Options

No options are required. The storage key can be overridden through the plugin options object:

```jsonc title="opencode.jsonc"
{
  "plugins": [
    {
      "package": "opencode-token-usage",
      "options": { "storeKey": "token-usage/custom-store" }
    }
  ]
}
```

## Usage

- **Open daily usage view:** run the palette/slash command **`Token usage: daily stats`** (`/token-stats`) to open the plugin route with the daily heatmap.
- **Hover a day:** move the mouse over a day cell to show that day’s token usage (tokens, cost, in/out/cache, requests, and top models) in the details panel.
- **Click a day:** opens a dialog with the full details for that day.
- **Footer:** shows a compact live session token/cost readout in the prompt footer.

## Storage and behavior notes

- **Storage location** — data lives in OpenCode plugin storage (durable JSON under a key), not in an external file.
- **Aggregation** — live deduplicated events are accumulated durably; per-day and per-day-per-model totals are derived from recorded calls.
- **Coverage** — only usages OpenCode emits as usage events are captured. Nested LLM usage inside ordinary tool results is not exposed as a separate usage event.
- **Context window** — the plugin does not compute a context-window percentage; OpenCode’s own stats surfaces provide that.
- **Accounting** — reasoning tokens are folded into `output`, and `total` is `input + output` (cache tokens tracked separately).

## Development

```bash
bun install
```

MIT licensed. Copyright 2026 hakergeniusz.
