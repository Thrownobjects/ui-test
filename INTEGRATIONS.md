# Integration plan — Alpaca Paper + Robinhood

This dashboard uses a local read-only backend for paper-account data and market feeds. Credentials must be configured server-side; no trade execution is enabled.

## Boundaries
- Keep Alpaca and any Robinhood authentication **server-side**. Never commit tokens, session cookies, passwords, or API keys. Never expose them in HTML or browser JavaScript.
- Use **Alpaca paper trading only** initially. Do not enable live orders, transfers, or automated placement in this UI.
- Treat Robinhood as **read-only/connection pending** until a supported authorized method is selected, reviewed and implemented. Do not rely on scraped credentials or browser session automation.
- The Trading Desk uses real paper-account reads and TradingView charts. Its former simulated order form is no longer loaded.
- Require server-side authentication, rate limits, access control, structured audit logs, paper-vs-live environment checks, and explicit user confirmation before enabling any order-submission endpoint.

## Backend contract for Home Dashboard

The static home page can read `GET /api/dashboard` from the **same origin**. It expects JSON with `schemaVersion: 1`; omit unavailable fields or use null. No secret should appear in the response.

Example shape (illustrative schema, **not actual account data**):

```json
{
  "schemaVersion": 1,
  "asOf": "2026-11-12T19:51:00Z",
  "brokerages": {
    "alpacaPaper": { "status": "disconnected" },
    "robinhood": { "status": "disconnected" }
  },
  "trading": {
    "paperDayPnlUsd": null,
    "openOrders": null,
    "positions": null
  },
  "compute": { "gpusOnline": null, "gpuUtilizationPct": null },
  "ai": { "modelsLoaded": null, "monthlyApiSpendUsd": null }
}
```

Use one of `connected`, `disconnected`, `error` for brokerage status. Return `connected` only after authenticated server-side health verification. The home UI shows `—` for null or missing figures rather than substituting made-up data.

## Remaining backend work (local read adapter implemented below)
1. Add authenticated multi-user access before remote hosting; the current read adapter is loopback-only.
2. Add verified cash-flow-adjusted P&L and fills; normalized timestamped account, position and order reads are implemented.
3. Identify a supported user-authorized Robinhood data integration; start with read-only holdings and account data, if available.
4. Separate demos from live feeds across all pages. Add explicit stale-data/error indicators and tests for disconnection and credential protection.
5. Only after review consider adding paper order entry, with dedicated permissions, risk controls, server-side validation and audit logging. Real-money trading remains off.


## Implemented local adapters

`connectors.mjs` now implements the paper-only Alpaca read adapter and opt-in local Ollama monitoring. `market-server.mjs` serves `/api/dashboard`, `/api/connections`, and `/api/trading/account-summary`. See README for configuration. The Trading Desk now renders API account data and TradingView charts; its old simulation script is no longer loaded. Other legacy pages retain labeled demos.

The server is local-only, not a deployed authenticated multi-user API. Never expose it remotely without adding authentication and per-user authorization. Broker secrets are server environment variables; no credential input is accepted from the browser. Robinhood remains pending. Account P&L is intentionally unavailable until a cash-flow-adjusted baseline is implemented; equity change is labeled separately.

Provider references: https://docs.alpaca.markets/us/reference/getaccount-1 , https://docs.alpaca.markets/us/reference/getallopenpositions , https://docs.alpaca.markets/us/reference/getallorders-1 , https://docs.ollama.com/api/ps .
