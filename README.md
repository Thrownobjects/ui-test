# UI Home Dashboard

Seven static pages that share one stylesheet and a page switcher. There's no build step: open `index.html` in a browser, or serve the folder with any static server (for example `python3 -m http.server`).

| Page | File | What it shows |
| --- | --- | --- |
| UI Home Dashboard | `index.html` | Status of Alpaca Paper and Robinhood plus read-only trading, compute and AI overview (blank until API connected) |
| Trading desk | `trading-desk.html` | Watchlist, price chart, order ticket, positions and P&L, blotter |
| Computer and GPUs | `gpu.html` | GPU usage, temperature, memory and power, controls, processes, power actions |
| Home systems | `home-systems.html` | Heating and cooling, locks and alarm, lights, energy use, upkeep |
| Liquidity pools | `liquidity.html` | LP positions and price ranges, fees, comparison with holding, watched pools |
| Treasury | `treasury.html` | Balances by account, allocation, 90-day cash forecast, T-bill ladder, moving money |
| AI models | `ai-models.html` | API spend against a monthly budget, usage by model, local models (load and unload), price-versus-score comparison |

All other pages are simulated in the browser for now. The home overview never fabricates metrics: it shows blank values unless the optional same-origin `GET /api/dashboard` endpoint returns valid JSON. See [INTEGRATIONS.md](INTEGRATIONS.md) for the Alpaca Paper and Robinhood server-side integration contract.

## Files

- `home-dashboard.js`: fail-closed optional dashboard status reader
- `INTEGRATIONS.md`: brokerage integration boundaries and planned API shape
- `styles.css`: shared styles for every page
- `nav.js`: the page switcher; add a line to `PAGES` to add a page
- `charts.js`: small canvas chart helpers used by the liquidity, treasury and AI models pages
- One `.js` file per page with that page's data and behaviour
