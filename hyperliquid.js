// Read-only Hyperliquid perpetuals market overview; no wallet integration or order actions.
(() => {
  "use strict";
  const refresh = document.getElementById("hl-refresh");
  const rows = document.getElementById("hl-markets");
  const status = document.getElementById("hl-status");
  const updated = document.getElementById("hl-updated");
  const money = (n) => typeof n === "number" && Number.isFinite(n)
    ? new Intl.NumberFormat("en-US", {style:"currency", currency:"USD", maximumFractionDigits: n >= 100 ? 2 : 4}).format(n)
    : "—";
  const compact = (n) => typeof n === "number" && Number.isFinite(n)
    ? new Intl.NumberFormat("en-US", {style:"currency", currency:"USD", notation:"compact", maximumFractionDigits:2}).format(n)
    : "—";
  const percent = (n) => typeof n === "number" && Number.isFinite(n)
    ? (n >= 0 ? "+" : "") + n.toFixed(4) + "%" : "—";
  const safeSymbol = (s) => typeof s === "string" && /^[A-Z0-9]{2,15}$/.test(s) ? s : "Unknown";
  let busy = false;
  async function load() {
    if (busy) return;
    busy = true;
    refresh.disabled = true;
    status.textContent = "Checking Hyperliquid…";
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      let response;
      try { response = await fetch("api/hyperliquid/markets", {cache:"no-store", signal:controller.signal, headers:{"Accept":"application/json"}}); }
      finally { clearTimeout(timeout); }
      if (!response.ok) throw new Error("Market proxy unavailable");
      const data = await response.json();
      if (data.provider !== "Hyperliquid" || !Array.isArray(data.markets) || data.markets.length === 0)
        throw new Error("No market data");
      rows.replaceChildren();
      for (const market of data.markets) {
        const tr = document.createElement("tr");
        for (const [value, className] of [
          [safeSymbol(market.symbol), "sym"], [money(market.markPriceUsd), "num"],
          [percent(market.fundingRatePctHourly), "num"],
          [compact(market.openInterestUsd), "num"], [compact(market.volume24hUsd), "num"]
        ]) {
          const td = document.createElement("td");
          td.textContent = value;
          td.className = className;
          tr.append(td);
        }
        rows.append(tr);
      }
      status.textContent = "Market data connected";
      const at = new Date(data.asOf);
      updated.textContent = Number.isFinite(at.getTime())
        ? "Prices checked " + at.toLocaleString() + " • Funding shown as hourly rate"
        : "Funding shown as hourly rate • Timestamp unavailable";
    } catch {
      rows.innerHTML = '<tr class="empty"><td colspan="5">Hyperliquid market data unavailable. Start the local market server to connect.</td></tr>';
      status.textContent = "Not connected";
      updated.textContent = "No verified Hyperliquid data available.";
    } finally {
      busy = false;
      refresh.disabled = false;
    }
  }
  refresh.addEventListener("click", load);
  load();
  setInterval(() => { if (!document.hidden) load(); }, 30000);
})();
