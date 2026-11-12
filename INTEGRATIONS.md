# Integration plan — Alpaca Paper + Robinhood

This repository is currently a **static, simulated UI**. The dashboard has no brokerage credentials or live trade capability.

## Boundaries
- Keep Alpaca and any Robinhood authentication **server-side**. Never commit tokens, session cookies, passwords, or API keys. Never expose them in HTML or browser JavaScript.
- Use **Alpaca paper trading only** initially. Do not enable live orders, transfers, or automated placement in this UI.
- Treat Robinhood as **read-only/connection pending** until a supported authorized method is selected, reviewed and implemented. Do not rely on scraped credentials or browser session automation.
- The current Trading Desk order form creates **only simulated browser orders**. Its values and fills must never be presented as real account activity.
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

## Next backend work
1. Implement an authenticated server-side Alpaca **paper-only**, **read-only** account adapter, gathering account equity, positions, orders, fills and prices.
2. Normalize and timestamp data through `/api/dashboard` and later a separate authenticated trading-desk read endpoint.
3. Identify a supported user-authorized Robinhood data integration; start with read-only holdings and account data, if available.
4. Separate demos from live feeds across all pages. Add explicit stale-data/error indicators and tests for disconnection and credential protection.
5. Only after review consider adding paper order entry, with dedicated permissions, risk controls, server-side validation and audit logging. Real-money trading remains off.
