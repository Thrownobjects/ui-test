// Treasury page. Balances are sample data until it's connected to your bank, broker and wallets.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const { color } = Charts;
  const DAY = 86400000;
  const money = (n) => (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
  const compact = (n) => n === 0 ? "$0" : (n < 0 ? "−$" : "$") + (Math.abs(n) >= 1e6 ? (Math.abs(n) / 1e6).toFixed(2) + "M" : Math.round(Math.abs(n) / 1e3) + "K");
  const shortDate = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const TYPES = {
    Operating: { color: "--blue", label: "Operating cash" },
    MMF: { color: "--up", label: "Money market" },
    TBill: { color: "--focus", label: "T-bills" },
    Stable: { color: "--violet", label: "Stablecoins" },
    Crypto: { color: "--down", label: "Exchange" },
  };

  const accounts = [
    { id: "op", name: "Operating checking", at: "Chase", type: "Operating", bal: 412000, yld: 0.0, access: "Same day", liquid: true },
    { id: "pay", name: "Payroll account", at: "Chase", type: "Operating", bal: 96000, yld: 0.0, access: "Same day", liquid: true },
    { id: "mmf", name: "Treasury money market", at: "Fidelity", type: "MMF", bal: 1150000, yld: 0.0412, access: "Next day", liquid: true },
    { id: "tb", name: "T-bill ladder", at: "Schwab", type: "TBill", bal: 1800000, yld: 0.0398, access: "At maturity", liquid: false },
    { id: "usdc", name: "USDC wallet", at: "Coinbase Prime", type: "Stable", bal: 520000, yld: 0.035, access: "Same day", liquid: true },
    { id: "ex", name: "Exchange margin", at: "Kraken", type: "Crypto", bal: 140000, yld: 0.0, access: "Same day", liquid: true },
  ];
  const MIN_OPERATING = 250000;
  const MONTHLY_BURN = 285000;

  // T-bill ladder: face value maturing by month
  const ladder = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() + i + 1, 1);
    return { month: d.toLocaleDateString("en-US", { month: "short" }), face: [250000, 300000, 300000, 350000, 300000, 300000][i], rate: [0.0405, 0.0401, 0.0398, 0.0395, 0.0392, 0.039][i], date: d };
  });

  const flows = [
    { day: 3, label: "Vendor bills", amt: -48000 },
    { day: 5, label: "Payroll", amt: -142000 },
    { day: 9, label: "Acme invoice paid", amt: 85000 },
    { day: 14, label: "Pool fees", amt: 9200 },
    { day: 19, label: "Payroll", amt: -142000 },
    { day: 20, label: "T-bill matures", amt: 250000 },
    { day: 28, label: "Rent and software", amt: -61000 },
    { day: 33, label: "Payroll", amt: -142000 },
    { day: 45, label: "Quarterly estimated tax", amt: -120000 },
    { day: 47, label: "Payroll", amt: -142000 },
    { day: 50, label: "T-bill matures", amt: 300000 },
    { day: 58, label: "Rent and software", amt: -61000 },
    { day: 61, label: "Payroll", amt: -142000 },
    { day: 70, label: "Northwind invoice paid", amt: 120000 },
    { day: 75, label: "Payroll", amt: -142000 },
    { day: 81, label: "T-bill matures", amt: 300000 },
    { day: 88, label: "Rent and software", amt: -61000 },
  ];

  // ---- Totals ----
  const total = () => accounts.reduce((s, a) => s + a.bal, 0);
  const available = () => accounts.filter((a) => a.liquid).reduce((s, a) => s + a.bal, 0);
  const operating = () => accounts.filter((a) => a.type === "Operating").reduce((s, a) => s + a.bal, 0);

  function renderHeader() {
    const t = total();
    $("t-total").textContent = compact(t);
    $("t-avail").textContent = compact(available());
    $("t-yield").textContent = ((accounts.reduce((s, a) => s + a.bal * a.yld, 0) / t) * 100).toFixed(2) + "%";
    $("t-runway").textContent = `${(t / MONTHLY_BURN).toFixed(1)} months`;
    const op = operating(), h = $("t-health");
    const ok = op >= MIN_OPERATING;
    h.lastChild.textContent = ok ? "Operating cash above minimum" : `Operating cash ${compact(MIN_OPERATING - op)} below minimum`;
    h.classList.toggle("alert", !ok);
  }

  // ---- Allocation bar ----
  function renderAlloc() {
    const t = total();
    const byType = Object.keys(TYPES).map((k) => ({ k, v: accounts.filter((a) => a.type === k).reduce((s, a) => s + a.bal, 0) })).filter((x) => x.v > 0);
    $("alloc-bar").innerHTML = byType.map((x) => `<span style="width:${(x.v / t) * 100}%;background:var(${TYPES[x.k].color})" title="${TYPES[x.k].label} ${money(x.v)}"></span>`).join("");
    $("alloc-bar").setAttribute("aria-label", byType.map((x) => `${TYPES[x.k].label} ${Math.round((x.v / t) * 100)}%`).join(", "));
    $("alloc-legend").innerHTML = byType.map((x) => `<li><span class="swatch" style="background:var(${TYPES[x.k].color})"></span><span>${TYPES[x.k].label}</span><strong>${compact(x.v)}</strong><span class="muted">${Math.round((x.v / t) * 100)}%</span></li>`).join("");
    $("alloc-note").textContent = `${money(t)} across ${accounts.length} accounts`;
  }

  // ---- Accounts ----
  function renderAccounts() {
    const t = total();
    $("acct-body").innerHTML = accounts.map((a) => `<tr>
      <td><span class="swatch" style="background:var(${TYPES[a.type].color})"></span>${a.name}</td>
      <td class="muted">${a.at}</td>
      <td class="num">${money(a.bal)}</td>
      <td class="share-cell"><div class="inline-bar"><span style="width:${(a.bal / t) * 100}%;background:var(${TYPES[a.type].color})"></span></div><span class="muted small">${((a.bal / t) * 100).toFixed(1)}%</span></td>
      <td class="num">${a.yld ? (a.yld * 100).toFixed(2) + "%" : "<span class=\"muted\">None</span>"}</td>
      <td class="${a.liquid ? "" : "warn"}">${a.access}</td></tr>`).join("");
  }

  // ---- Move money ----
  const movable = () => accounts.filter((a) => a.liquid);
  function fillSelects() {
    const opts = movable().map((a) => `<option value="${a.id}">${a.name} (${compact(a.bal)})</option>`).join("");
    const f = $("m-from").value, t = $("m-to").value;
    $("m-from").innerHTML = opts; $("m-to").innerHTML = opts;
    $("m-from").value = f || "mmf"; $("m-to").value = t || "op";
    noteMove();
  }
  function noteMove() {
    const from = accounts.find((a) => a.id === $("m-from").value);
    const to = accounts.find((a) => a.id === $("m-to").value);
    $("m-note").textContent = from && to ? `Arrives ${from.access === "Next day" || to.access === "Next day" ? "next business day" : "today"}.` : "";
  }
  $("move-form").addEventListener("change", noteMove);
  $("move-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const err = $("m-error");
    const from = accounts.find((a) => a.id === $("m-from").value);
    const to = accounts.find((a) => a.id === $("m-to").value);
    const amt = parseFloat($("m-amt").value);
    if (from === to) { err.textContent = "Pick two different accounts."; return; }
    if (!(amt > 0)) { err.textContent = "Enter an amount above zero."; $("m-amt").focus(); return; }
    if (amt > from.bal) { err.textContent = `${from.name} only has ${money(from.bal)}.`; $("m-amt").focus(); return; }
    err.textContent = "";
    from.bal -= amt; to.bal += amt;
    $("m-amt").value = "";
    toast(`Moved ${money(amt)} from ${from.name} to ${to.name}`);
    renderAll();
  });

  // ---- Forecast chart ----
  function projection() {
    const pts = [];
    let bal = available();
    for (let d = 0; d <= 90; d++) {
      for (const f of flows) if (f.day === d) bal += f.amt;
      pts.push(bal);
    }
    return pts;
  }
  function drawForecast() {
    const s = Charts.setup($("fc-chart"));
    if (!s) return;
    const { ctx, w, h } = s;
    const pts = projection();
    const padL = 64, padB = 22, padT = 10;
    const hi = Math.ceil((Math.max(...pts) * 1.05) / 500000) * 500000, lo = 0;
    const x = (d) => padL + (d / 90) * (w - padL - 8);
    const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (h - padT - padB);
    Charts.gridY(ctx, { x0: padL, x1: w, y, lo, hi, steps: Math.round(hi / 500000) || 4, label: compact, labelX: padL - 8, align: "right" });

    // Minimum operating cash
    ctx.strokeStyle = color("--down"); ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, y(MIN_OPERATING)); ctx.lineTo(w, y(MIN_OPERATING)); ctx.stroke();
    ctx.setLineDash([]);

    // Area + step line
    ctx.beginPath(); ctx.moveTo(x(0), y(pts[0]));
    pts.forEach((v, d) => { if (d) { ctx.lineTo(x(d), y(pts[d - 1])); ctx.lineTo(x(d), y(v)); } });
    ctx.strokeStyle = color("--blue"); ctx.lineWidth = 2; ctx.stroke();
    ctx.lineTo(x(90), y(0)); ctx.lineTo(x(0), y(0)); ctx.closePath();
    ctx.fillStyle = color("--blue") + "22"; ctx.fill();

    // Flow markers
    for (const f of flows) {
      ctx.fillStyle = f.amt > 0 ? color("--up") : color("--down");
      ctx.beginPath(); ctx.arc(x(f.day), y(pts[f.day]), 3, 0, Math.PI * 2); ctx.fill();
    }
    // Month labels
    ctx.fillStyle = color("--muted"); ctx.textBaseline = "alphabetic"; ctx.textAlign = "center";
    for (const d of [0, 30, 60, 90]) ctx.fillText(d === 0 ? "Today" : shortDate(new Date(today.getTime() + d * DAY)), Math.min(Math.max(x(d), padL + 20), w - 24), h - 4);
    ctx.textAlign = "left";
  }

  // ---- Upcoming flows ----
  function renderFlows() {
    const t = total();
    const maxAbs = Math.max(...flows.map((f) => Math.abs(f.amt)));
    $("flow-list").innerHTML = flows.filter((f) => f.day <= 30).map((f) => `<li>
      <span class="flow-date">${shortDate(new Date(today.getTime() + f.day * DAY))}</span>
      <span class="flow-label">${f.label}</span>
      <span class="flow-bar ${f.amt > 0 ? "in" : "out"}"><span style="width:${(Math.abs(f.amt) / maxAbs) * 100}%"></span></span>
      <span class="num ${f.amt > 0 ? "up" : "down"}">${f.amt > 0 ? "+" : ""}${money(f.amt)}</span>
    </li>`).join("");
  }

  // ---- Ladder ----
  function drawLadder() {
    Charts.stackedBars($("ladder-chart"), {
      labels: ladder.map((l) => l.month),
      series: [{ values: ladder.map((l) => l.face), color: "--focus" }],
      fmt: compact,
    });
    const avg = ladder.reduce((s, l) => s + l.rate * l.face, 0) / ladder.reduce((s, l) => s + l.face, 0);
    $("ladder-note").textContent = `Average yield ${(avg * 100).toFixed(2)}%`;
  }

  // ---- Yield bars ----
  function renderYields() {
    const rows = accounts.filter((a) => a.yld > 0).map((a) => ({ a, inc: a.bal * a.yld })).sort((p, q) => q.inc - p.inc);
    const max = Math.max(...rows.map((r) => r.inc));
    $("yield-bars").innerHTML = rows.map(({ a, inc }) => `<li>
      <span>${a.name}</span>
      <span class="hbar"><span style="width:${(inc / max) * 100}%;background:var(${TYPES[a.type].color})"></span></span>
      <span class="num">${compact(inc)}</span></li>`).join("") +
      `<li class="hbar-total"><span>Total</span><span></span><span class="num">${compact(rows.reduce((s, r) => s + r.inc, 0))}</span></li>`;
  }

  // ---- Shared ----
  let toastTimer;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
  }

  function renderAll() {
    renderHeader(); renderAlloc(); renderAccounts(); fillSelects();
    drawForecast(); renderFlows(); drawLadder(); renderYields();
  }
  renderAll();
  window.addEventListener("resize", () => { drawForecast(); drawLadder(); });
  // Interest accrues on yielding accounts every few seconds.
  setInterval(() => {
    for (const a of accounts) a.bal += (a.bal * a.yld) / (365 * 86400) * 5;
    renderHeader(); renderAlloc(); renderAccounts(); renderYields();
  }, 5000);
})();
