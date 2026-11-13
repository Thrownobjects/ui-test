# UI Home Dashboard

Eight static pages that share one stylesheet and a page switcher. There's no build step: open `index.html` in a browser, or serve the folder with any static server (for example `python3 -m http.server`).

| Page | File | What it shows |
| --- | --- | --- |
| UI Home Dashboard | `index.html` | Status of Alpaca Paper and Robinhood plus read-only trading, compute and AI overview (blank until API connected) |
| Crypto Trading | `crypto-trading.html` | Read-only Jupiter Solana token prices/swaps and Hyperliquid perpetuals markets; local proxy needed |
| Trading desk | `trading-desk.html` | Watchlist, price chart, order ticket, positions and P&L, blotter |
| Computer and GPUs | `gpu.html` | GPU usage, temperature, memory and power, controls, processes, power actions |
| Home systems | `home-systems.html` | Heating and cooling, locks and alarm, lights, energy use, upkeep |
| Liquidity pools | `liquidity.html` | LP positions and price ranges, fees, comparison with holding, watched pools |
| Treasury | `treasury.html` | Consolidated bank cash, crypto by wallet, LP positions and combined total (real values only when API connected); existing demos kept separate |
| AI models | `ai-models.html` | API spend against a monthly budget, usage by model, local models (load and unload), price-versus-score comparison |

The Home Dashboard, Crypto Trading and Treasury consolidated overview fail closed when a backend is unavailable. Other legacy pages are simulated in the browser. The home overview never fabricates metrics: it shows blank values unless the optional same-origin `GET /api/dashboard` endpoint returns valid JSON. See [INTEGRATIONS.md](INTEGRATIONS.md) for the Alpaca Paper and Robinhood server-side integration contract.

## Files

- `home-dashboard.js`: fail-closed optional dashboard status reader
- `market-server.mjs`: local Node.js server for read-only Jupiter and Hyperliquid endpoints; start with `node market-server.mjs` (Jupiter requires a developer API key for Swap V2)
- `treasury-overview.js`: verified bank, wallet and LP balances, blank until `/api/treasury` exists
- `INTEGRATIONS.md`: brokerage integration boundaries and planned API shape
- `styles.css`: shared styles for every page
- `nav.js`: the page switcher; add a line to `PAGES` to add a page
- `charts.js`: small canvas chart helpers used by the liquidity, treasury and AI models pages
- One `.js` file per page with that page's data and behaviour


## Run the connected dashboard locally

Requires Node.js 22+. Copy `.env.example` to `.env`, set your **paper** Alpaca key and secret, and run `npm start`. Open http://127.0.0.1:8787. A plain static server cannot run the connections. Never commit `.env`.

- Home reads `/api/dashboard`; Home, Trading Desk and AI Models read `/api/connections`.
- Alpaca reads account, positions and open orders from the fixed paper API. The Trading Desk shows these separately from its browser simulation. Equity change is **not cash-flow-adjusted P&L**; that metric remains unavailable without verified cash flows.
- Set `OLLAMA_ENABLED=true` to read running models from local Ollama. This does not download or run models.
- Jupiter and Hyperliquid retain their existing read-only market adapters. Jupiter needs its own API key.
- Robinhood, bank balances, wallet/LP holdings and hardware telemetry remain disconnected until their integrations are supplied. ChatGPT connector credentials are not automatically available to this application.

This server is loopback-only, with Host and Origin validation, no CORS, no write routes and no credential responses. Do not publish it as a shared backend without adding authenticated sessions and authorization. Provider reads time out after 3.5 seconds; connector snapshots are cached for 10 seconds and concurrent reads share one request. Refresh replaces old data with unavailable/error states when reads fail.

Run `npm test` for connector and HTTP security checks.
