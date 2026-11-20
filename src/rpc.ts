import { Rpc } from "@opencode/plugin/rpc"

export const TokenUsage = Rpc.define({
  id: "opencode-token-usage",
  methods: {
    daily: {
      output: {
        type: "object",
        properties: {
          since: { type: "number" },
          updatedAt: { type: "number" },
          total: {
            type: "object",
            properties: {
              input: { type: "number" },
              output: { type: "number" },
              cacheRead: { type: "number" },
              cacheWrite: { type: "number" },
              total: { type: "number" },
              cost: { type: "number" },
              requests: { type: "number" },
            },
            required: ["input", "output", "cacheRead", "cacheWrite", "total", "cost", "requests"],
            additionalProperties: false,
          },
          days: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string" },
                input: { type: "number" },
                output: { type: "number" },
                cacheRead: { type: "number" },
                cacheWrite: { type: "number" },
                total: { type: "number" },
                cost: { type: "number" },
                requests: { type: "number" },
                models: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      input: { type: "number" },
                      output: { type: "number" },
                      cacheRead: { type: "number" },
                      cacheWrite: { type: "number" },
                      total: { type: "number" },
                      cost: { type: "number" },
                      requests: { type: "number" },
                    },
                    required: [
                      "name",
                      "input",
                      "output",
                      "cacheRead",
                      "cacheWrite",
                      "total",
                      "cost",
                      "requests",
                    ],
                    additionalProperties: false,
                  },
                },
              },
              required: [
                "date",
                "input",
                "output",
                "cacheRead",
                "cacheWrite",
                "total",
                "cost",
                "requests",
                "models",
              ],
              additionalProperties: false,
            },
          },
        },
        required: ["since", "updatedAt", "total", "days"],
        additionalProperties: false,
      },
    },
  },
  events: {},
})