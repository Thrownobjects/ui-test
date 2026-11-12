// Live market data through same-origin Jupiter proxy. No wallet and no order execution.
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const tokens = ["SOL","USDC","JUP"];
  const money = n => "$" + Number(n).toLocaleString("en-US", {maximumFractionDigits: n < 1 ? 6 : 4,minimumFractionDigits:2});
  const escape = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  let lastPriceLoad = 0;
  async function json(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
      const response = await fetch(url, {headers:{"Accept":"application/json"},cache:"no-store",credentials:"same-origin",signal:controller.signal});
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "Backend error (" + response.status + ")");
      return body;
    } finally { clearTimeout(timeout); }
  }
  async function refreshPrices() {
    const button = $("crypto-refresh");
    button.disabled = true;
    $("crypto-asof").textContent = "Checking Jupiter prices…";
    try {
      const payload = await json("api/crypto/prices");
      if (!payload || payload.provider !== "Jupiter" || !payload.tokens) throw new Error("Unexpected response from price feed");
      $("crypto-prices").innerHTML = tokens.map(sym => {
        const item = payload.tokens[sym];
        const price = typeof item?.usdPrice === "number" && Number.isFinite(item.usdPrice) ? money(item.usdPrice) : "—";
        const chg = typeof item?.priceChange24h === "number" && Number.isFinite(item.priceChange24h) ? (item.priceChange24h >= 0 ? "+" : "") + item.priceChange24h.toFixed(2) + "%" : "—";
        const colour = item?.priceChange24h > 0 ? "up" : item?.priceChange24h < 0 ? "down" : "";
        return '<tr><td class="sym">' + escape(sym) + '</td><td class="num">' + price + '</td><td class="num ' + colour + '">' + chg + '</td><td class="muted">Jupiter V3</td></tr>';
      }).join("");
      $("crypto-status").classList.remove("closed");
      $("crypto-status").lastChild.textContent = "Price API responding";
      $("crypto-price-connection").textContent = "Connected through backend";
      const date = new Date(payload.asOf);
      $("crypto-asof").textContent = Number.isFinite(date.getTime()) ? "Checked " + date.toLocaleString() : "Prices fetched; timestamp unavailable";
      lastPriceLoad = Date.now();
    } catch(e) {
      $("crypto-prices").innerHTML = '<tr class="empty"><td colspan="4">Live prices unavailable — no simulated fallback.</td></tr>';
      $("crypto-status").classList.add("closed");
      $("crypto-status").lastChild.textContent = "Price feed unavailable";
      $("crypto-price-connection").textContent = "Unavailable";
      $("crypto-asof").textContent = e.message;
    } finally { button.disabled = false; }
  }
  $("crypto-refresh").addEventListener("click", refreshPrices);
  $("crypto-input").addEventListener("change", () => {
    if ($("crypto-input").value === $("crypto-output").value) $("crypto-output").value = tokens.find(t => t !== $("crypto-input").value);
  });
  $("crypto-output").addEventListener("change", () => {
    if ($("crypto-output").value === $("crypto-input").value) $("crypto-input").value = tokens.find(t => t !== $("crypto-output").value);
  });
  $("crypto-quote-form").addEventListener("submit", async e => {
    e.preventDefault();
    const input = $("crypto-input").value, output = $("crypto-output").value, amount = $("crypto-amount").value.trim();
    const result = $("crypto-quote-result"), btn = $("crypto-get-quote");
    if (input === output || !/^(?:\d{1,9})(?:\.\d{1,9})?$/.test(amount) || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      result.textContent = "Choose different tokens and enter a positive decimal amount.";
      return;
    }
    btn.disabled = true;
    result.textContent = "Requesting a Jupiter quote…";
    try {
      const q = await json("api/crypto/quote?input=" + encodeURIComponent(input) + "&output=" + encodeURIComponent(output) + "&amount=" + encodeURIComponent(amount));
      if (!q || q.provider !== "Jupiter" || !q.outAmountUi) throw new Error("No quote was returned");
      result.textContent = "Indicative quote: " + q.inAmountUi + " " + input + " → " + q.outAmountUi + " " + output
        + ". Router: " + (q.router || "not specified") + ". This is not a trade or a guaranteed execution price.";
    } catch(e) { result.textContent = "Quote unavailable: " + e.message; }
    finally { btn.disabled = false; }
  });
  refreshPrices();
  setInterval(() => { if (Date.now() - lastPriceLoad >= 30000 && !document.hidden) refreshPrices(); }, 30000);
})();
