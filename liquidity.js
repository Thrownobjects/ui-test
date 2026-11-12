// Liquidity pool tracker. Prices and fees are simulated until it's connected to your wallets.
// Position math follows concentrated liquidity (Uniswap v3 style): value depends on where price sits in your range.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const { color } = Charts;
  const money = (n, d = 0) => (n < 0 ? "−$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const signedMoney = (n) => (n > 0 ? "+" : "") + money(n);
  const px = (p) => p >= 1000 ? p.toLocaleString("en-US", { maximumFractionDigits: 0 }) : p >= 10 ? p.toFixed(2) : p.toFixed(4);
  const cls = (n) => (n > 0 ? "up" : n < 0 ? "down" : "");
  const SERIES = ["--up", "--blue", "--focus", "--violet"];
  const HIST = 180;

  const positions = [
    { pair: "ETH / USDC", base: "ETH", quote: "USDC", fee: "0.05%", venue: "Uniswap v3 on Ethereum", lo: 2900, hi: 3800, entry: 3250, deposit: 120000, apr: 0.31, vol: 0.0012 },
    { pair: "WBTC / USDC", base: "WBTC", quote: "USDC", fee: "0.30%", venue: "Uniswap v3 on Arbitrum", lo: 88000, hi: 110000, entry: 96000, deposit: 80000, apr: 0.22, vol: 0.0009 },
    { pair: "SOL / USDC", base: "SOL", quote: "USDC", fee: "0.04%", venue: "Orca on Solana", lo: 150, hi: 205, entry: 182, deposit: 45000, apr: 0.48, vol: 0.0016, start: 207 },
    { pair: "USDC / USDT", base: "USDC", quote: "USDT", fee: "0.01%", venue: "Uniswap v3 on Base", lo: 0.998, hi: 1.002, entry: 1.0, deposit: 60000, apr: 0.07, vol: 0.00008, start: 1.0003 },
  ];

  // ---- Concentrated liquidity math ----
  function amounts(p, P) {
    const sa = Math.sqrt(p.lo), sb = Math.sqrt(p.hi);
    const s = Math.sqrt(Math.min(Math.max(P, p.lo), p.hi));
    return { x: p.L * (1 / s - 1 / sb), y: p.L * (s - sa) }; // x = base token, y = quote token
  }
  const valueAt = (p, P) => { const a = amounts(p, P); return a.x * P + a.y; };

  for (const [i, p] of positions.entries()) {
    p.id = i;
    p.L = 1;
    p.L = p.deposit / valueAt(p, p.entry);
    p.hold = amounts(p, p.entry); // what you'd have if you'd just held the deposit
    p.price = p.start || p.entry * (1 + (Math.random() - 0.5) * 0.04);
    p.hist = [];
    let q = p.price;
    for (let k = 0; k < HIST; k++) { p.hist.unshift(q); q = q / (1 + (Math.random() - 0.5) * p.vol * 6); }
    p.unclaimed = p.deposit * p.apr * (4 + Math.random() * 6) / 365;
    p.collected = p.deposit * p.apr * (20 + Math.random() * 20) / 365;
    // 30 days of daily fees; less on days the price spent outside the range.
    p.daily = Array.from({ length: 30 }, () => p.deposit * p.apr / 365 * (0.4 + Math.random() * 1.2));
    if (p.start) p.daily.slice(-3).forEach((_, k, arr) => (p.daily[27 + k] *= 0.25));
  }
  const inRange = (p) => p.price >= p.lo && p.price <= p.hi;
  let selected = 0;

  // ---- Positions table with range bars ----
  function rangeBar(p) {
    const span = p.hi - p.lo;
    const vlo = Math.min(p.lo - span * 0.35, p.price), vhi = Math.max(p.hi + span * 0.35, p.price);
    const pos = (v) => ((v - vlo) / (vhi - vlo)) * 100;
    const ok = inRange(p);
    return `<div class="range" role="img" aria-label="Range ${px(p.lo)} to ${px(p.hi)}, price ${px(p.price)}">
        <span class="range-band" style="left:${pos(p.lo)}%;width:${pos(p.hi) - pos(p.lo)}%"></span>
        <span class="range-mark ${ok ? "in" : "out"}" style="left:${pos(p.price)}%"></span>
      </div>
      <div class="range-ends"><span>${px(p.lo)}</span><span>${px(p.hi)}</span></div>`;
  }
  function renderPositions() {
    const focused = document.activeElement?.closest?.("#lp-body tr[data-id]")?.dataset.id;
    $("lp-body").innerHTML = positions.map((p) => {
      const v = valueAt(p, p.price), hold = p.hold.x * p.price + p.hold.y, diff = v - hold;
      const ok = inRange(p);
      return `<tr data-id="${p.id}" tabindex="0" aria-selected="${p.id === selected}">
        <td><span class="sym">${p.pair}</span> <span class="muted small">${p.fee}</span><div class="muted small">${p.venue}</div></td>
        <td class="num">${money(v)}</td>
        <td class="range-cell">${rangeBar(p)}</td>
        <td class="${ok ? "up" : "warn"}">${ok ? "In range" : p.price > p.hi ? "Above range" : "Below range"}</td>
        <td class="num">${money(p.unclaimed, 2)}</td>
        <td class="num">${ok ? (p.apr * 100).toFixed(1) + "%" : "<span class=\"muted\">Not earning</span>"}</td>
        <td class="num ${cls(diff)}">${signedMoney(diff)}</td>
      </tr>`;
    }).join("");
    if (focused !== undefined) $("lp-body").querySelector(`tr[data-id="${focused}"]`)?.focus();
  }
  $("lp-body").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (tr) select(+tr.dataset.id);
  });
  $("lp-body").addEventListener("keydown", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    let id = +tr.dataset.id;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(id); return; }
    if (e.key === "ArrowDown") id = Math.min(positions.length - 1, id + 1);
    else if (e.key === "ArrowUp") id = Math.max(0, id - 1);
    else return;
    e.preventDefault(); select(id);
    $("lp-body").querySelector(`tr[data-id="${id}"]`)?.focus();
  });
  function select(id) {
    selected = id;
    $("lp-confirm").hidden = true;
    renderPositions(); renderDetail(); drawFees();
  }

  // ---- Detail: price chart with range band ----
  function drawPrice(p) {
    const s = Charts.setup($("lp-chart"));
    if (!s) return;
    const { ctx, w, h } = s;
    const padR = 72, padT = 8, padB = 8;
    const lo = Math.min(...p.hist, p.lo) , hi = Math.max(...p.hist, p.hi);
    const m = (hi - lo) * 0.08;
    const yLo = lo - m, yHi = hi + m;
    const x = (k) => (k / (p.hist.length - 1)) * (w - padR);
    const y = (v) => padT + (1 - (v - yLo) / (yHi - yLo)) * (h - padT - padB);
    Charts.gridY(ctx, { x0: 0, x1: w - padR, y, lo: yLo, hi: yHi, label: px, labelX: w - padR + 8 });

    // Range band
    ctx.fillStyle = color("--up") + "1f";
    ctx.fillRect(0, y(p.hi), w - padR, y(p.lo) - y(p.hi));
    ctx.strokeStyle = color("--up") + "88";
    ctx.setLineDash([5, 4]);
    for (const v of [p.lo, p.hi]) { ctx.beginPath(); ctx.moveTo(0, Math.round(y(v)) + 0.5); ctx.lineTo(w - padR, Math.round(y(v)) + 0.5); ctx.stroke(); }
    ctx.setLineDash([]);

    // Price line, coloured by whether each stretch is in range
    ctx.lineWidth = 1.75;
    for (let k = 1; k < p.hist.length; k++) {
      const a = p.hist[k - 1], b = p.hist[k];
      ctx.strokeStyle = b >= p.lo && b <= p.hi ? color("--text") : color("--focus");
      ctx.beginPath(); ctx.moveTo(x(k - 1), y(a)); ctx.lineTo(x(k), y(b)); ctx.stroke();
    }
    // Entry price
    ctx.fillStyle = color("--muted");
    ctx.textBaseline = "bottom";
    ctx.fillText(`Entry ${px(p.entry)}`, 6, y(p.entry) - 3);
    ctx.fillRect(0, Math.round(y(p.entry)), 6, 1);

    // Last price tag
    const ok = inRange(p);
    ctx.fillStyle = ok ? color("--up") : color("--focus");
    ctx.fillRect(w - padR + 2, y(p.price) - 10, padR - 2, 20);
    ctx.fillStyle = color("--ink");
    ctx.textBaseline = "middle";
    ctx.font = `600 12px ${color("--font")}`;
    ctx.fillText(px(p.price), w - padR + 8, y(p.price));
  }

  function renderDetail() {
    const p = positions[selected];
    const a = amounts(p, p.price);
    const v = a.x * p.price + a.y;
    const hold = p.hold.x * p.price + p.hold.y;
    $("d-pool").textContent = p.pair;
    $("d-venue").textContent = `${p.venue}, ${p.fee} fee tier`;
    $("d-price").textContent = px(p.price);
    $("d-range").textContent = `Your range ${px(p.lo)} to ${px(p.hi)} ${p.quote} per ${p.base}`;
    drawPrice(p);

    const baseShare = v ? (a.x * p.price) / v : 0;
    $("mix-bar").innerHTML = `<span style="width:${(baseShare * 100).toFixed(1)}%;background:var(--blue)"></span><span style="width:${((1 - baseShare) * 100).toFixed(1)}%;background:var(--violet)"></span>`;
    $("mix-list").innerHTML = `
      <div><dt><span class="swatch" style="background:var(--blue)"></span>${p.base}</dt><dd>${a.x.toLocaleString("en-US", { maximumFractionDigits: a.x < 10 ? 4 : 0 })} <span class="muted">${money(a.x * p.price)} (${Math.round(baseShare * 100)}%)</span></dd></div>
      <div><dt><span class="swatch" style="background:var(--violet)"></span>${p.quote}</dt><dd>${a.y.toLocaleString("en-US", { maximumFractionDigits: 0 })} <span class="muted">${money(a.y)} (${Math.round((1 - baseShare) * 100)}%)</span></dd></div>`;
    $("d-kv").innerHTML = `
      <div><dt>Deposited</dt><dd>${money(p.deposit)}</dd></div>
      <div><dt>Worth now</dt><dd>${money(v)}</dd></div>
      <div><dt>If you'd held</dt><dd>${money(hold)}</dd></div>
      <div><dt>Fees earned, all time</dt><dd class="up">${money(p.collected + p.unclaimed)}</dd></div>
      <div><dt>Net result</dt><dd class="${cls(v + p.collected + p.unclaimed - p.deposit)}">${signedMoney(v + p.collected + p.unclaimed - p.deposit)}</dd></div>`;
    $("d-collect").disabled = p.unclaimed < 0.01;
    $("d-collect").textContent = `Collect ${money(p.unclaimed, 2)}`;
  }

  $("d-collect").addEventListener("click", () => {
    const p = positions[selected];
    const amt = p.unclaimed;
    p.collected += amt; p.unclaimed = 0;
    toast(`Collected ${money(amt, 2)} in fees from ${p.pair}`);
    renderAll();
  });
  $("d-remove").addEventListener("click", () => {
    const p = positions[selected];
    $("lp-confirm-text").textContent = `Remove all liquidity from ${p.pair}? You'll receive about ${money(valueAt(p, p.price))} plus ${money(p.unclaimed, 2)} in fees, and stop earning fees.`;
    $("lp-confirm").hidden = false;
    $("lp-confirm-no").focus();
  });
  $("lp-confirm-no").addEventListener("click", () => ($("lp-confirm").hidden = true));
  $("lp-confirm-yes").addEventListener("click", () => {
    const p = positions[selected];
    toast(`Removed liquidity from ${p.pair}. Withdrawal sent to your wallet.`);
    $("lp-confirm").hidden = true;
  });

  // ---- Fees chart ----
  function drawFees() {
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(Date.now() - (29 - i) * 86400000);
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    });
    Charts.stackedBars($("fees-chart"), {
      labels: days,
      series: positions.map((p) => ({ values: p.daily, color: SERIES[p.id] })),
      fmt: (v) => money(v),
      labelEvery: 7,
    });
    const total = positions.reduce((s, p) => s + p.daily.reduce((a, b) => a + b, 0), 0);
    $("fees-total").textContent = `${money(total)} total`;
  }
  $("fees-legend").innerHTML = positions.map((p) => `<li><span class="swatch" style="background:var(${SERIES[p.id]})"></span>${p.pair}</li>`).join("");

  // ---- Watched pools ----
  const market = [
    { pair: "ETH / USDC 0.05%", where: "Uniswap v3 on Ethereum", tvl: 312e6, vol: 498e6, apr: 0.29 },
    { pair: "WBTC / ETH 0.30%", where: "Uniswap v3 on Ethereum", tvl: 228e6, vol: 61e6, apr: 0.12 },
    { pair: "SOL / USDC 0.04%", where: "Orca on Solana", tvl: 96e6, vol: 410e6, apr: 0.62 },
    { pair: "ETH / USDC 0.05%", where: "Uniswap v3 on Arbitrum", tvl: 84e6, vol: 205e6, apr: 0.44 },
    { pair: "USDC / USDT 0.01%", where: "Uniswap v3 on Base", tvl: 51e6, vol: 140e6, apr: 0.1 },
  ];
  const compact = (n) => "$" + (n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : (n / 1e6).toFixed(0) + "M");
  function renderMarket() {
    const maxT = Math.max(...market.map((m) => m.tvl)), maxV = Math.max(...market.map((m) => m.vol));
    $("mkt-body").innerHTML = market.map((m) => `<tr>
      <td class="sym">${m.pair}</td>
      <td class="muted">${m.where}</td>
      <td class="num"><div class="inline-bar"><span style="width:${(m.tvl / maxT) * 100}%"></span></div>${compact(m.tvl)}</td>
      <td class="num"><div class="inline-bar alt"><span style="width:${(m.vol / maxV) * 100}%"></span></div>${compact(m.vol)}</td>
      <td class="num">${(m.apr * 100).toFixed(1)}%</td></tr>`).join("");
  }

  // ---- Header ----
  function renderHeader() {
    let value = 0, unclaimed = 0, collected = 0, vsHold = 0;
    for (const p of positions) {
      const v = valueAt(p, p.price);
      value += v; unclaimed += p.unclaimed; collected += p.collected;
      vsHold += v - (p.hold.x * p.price + p.hold.y);
    }
    $("lp-value").textContent = money(value);
    $("lp-fees").textContent = money(unclaimed, 2);
    $("lp-collected").textContent = money(collected);
    const il = $("lp-il");
    il.textContent = signedMoney(vsHold);
    il.className = cls(vsHold);
    const out = positions.filter((p) => !inRange(p));
    const h = $("lp-health");
    h.lastChild.textContent = out.length ? `${out.map((p) => p.pair).join(", ")} out of range` : "All positions in range";
    h.classList.toggle("alert", out.length > 0);
  }

  // ---- Shared ----
  let toastTimer;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
  }

  function renderAll() { renderPositions(); renderDetail(); renderHeader(); }
  function tick() {
    for (const p of positions) {
      const pull = p.base === "USDC" ? (1 - p.price) * 0.3 : 0;
      p.price *= 1 + (Math.random() - 0.5) * p.vol * 2 + pull * 0.01;
      p.hist.push(p.price);
      if (p.hist.length > HIST) p.hist.shift();
      if (inRange(p)) p.unclaimed += (valueAt(p, p.price) * p.apr) / (365 * 86400) * 2;
    }
    renderAll();
  }

  renderMarket();
  renderAll();
  drawFees();
  window.addEventListener("resize", () => { renderDetail(); drawFees(); });
  setInterval(tick, 2000);
})();
