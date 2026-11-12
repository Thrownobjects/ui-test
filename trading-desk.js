// Trading desk main page. Prices are simulated until a market data feed is wired in.
(() => {
  "use strict";

  const SEED = [
    ["AAPL", "Apple Inc.", 228.4],
    ["MSFT", "Microsoft Corp.", 431.2],
    ["NVDA", "NVIDIA Corp.", 142.65],
    ["AMZN", "Amazon.com Inc.", 201.1],
    ["GOOGL", "Alphabet Inc. Class A", 176.3],
    ["META", "Meta Platforms Inc.", 589.75],
    ["JPM", "JPMorgan Chase & Co.", 241.9],
    ["XOM", "Exxon Mobil Corp.", 118.2],
    ["TSLA", "Tesla Inc.", 312.4],
    ["BRK.B", "Berkshire Hathaway Class B", 471.05],
    ["UNH", "UnitedHealth Group", 584.6],
    ["KO", "Coca-Cola Co.", 64.85],
  ];

  const css = getComputedStyle(document.documentElement);
  const color = (name) => css.getPropertyValue(name).trim();
  const $ = (id) => document.getElementById(id);
  const fmt = (n, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const money = (n, d = 0) => (n < 0 ? "−$" : "$") + fmt(Math.abs(n), d);
  const signed = (n, d = 2) => (n > 0 ? "+" : n < 0 ? "−" : "") + fmt(Math.abs(n), d);
  const cls = (n) => (n > 0 ? "up" : n < 0 ? "down" : "");
  const round2 = (n) => Math.round(n * 100) / 100;

  // ---- State ----
  const instruments = new Map();
  for (const [sym, name, prev] of SEED) {
    const hist = [prev];
    for (let i = 0; i < 180; i++) hist.push(round2(hist[hist.length - 1] * (1 + (Math.random() - 0.495) * 0.004)));
    const last = hist[hist.length - 1];
    instruments.set(sym, {
      sym, name, prev, last, open: hist[1],
      high: Math.max(...hist.slice(1)), low: Math.min(...hist.slice(1)),
      vol: Math.round(2e6 + Math.random() * 8e6), hist,
    });
  }

  const positions = new Map();
  const orders = [];
  let nextId = 1001;
  let selected = "AAPL";
  let blotterView = "all";

  const spread = (px) => Math.max(0.01, round2(px * 0.0002));
  const bid = (i) => round2(i.last - spread(i.last) / 2);
  const ask = (i) => round2(i.last + spread(i.last) / 2);

  function applyFill(sym, side, qty, px) {
    const p = positions.get(sym) || { qty: 0, avg: 0, realized: 0 };
    const s = side === "BUY" ? 1 : -1;
    if (p.qty === 0 || Math.sign(p.qty) === s) {
      p.avg = (p.avg * Math.abs(p.qty) + px * qty) / (Math.abs(p.qty) + qty);
      p.qty += s * qty;
    } else {
      const closing = Math.min(Math.abs(p.qty), qty);
      p.realized += closing * (px - p.avg) * Math.sign(p.qty);
      p.qty += s * qty;
      if (p.qty === 0) p.avg = 0;
      else if (qty > closing) p.avg = px; // position flipped
    }
    positions.set(sym, p);
  }

  // Starting book so the page isn't empty on first load.
  applyFill("AAPL", "BUY", 1200, 224.1);
  applyFill("NVDA", "BUY", 3000, 138.9);
  applyFill("TSLA", "SELL", 500, 318.75);
  applyFill("JPM", "BUY", 800, 236.4);

  // ---- Watchlist ----
  const wlBody = $("wl-body");
  function renderWatchlist() {
    const q = $("wl-filter").value.trim().toUpperCase();
    const rows = [...instruments.values()].filter((i) => !q || i.sym.includes(q) || i.name.toUpperCase().includes(q));
    if (!rows.length) {
      wlBody.innerHTML = `<tr class="empty"><td colspan="3">No symbols match “${escapeHtml(q)}”.</td></tr>`;
      return;
    }
    wlBody.innerHTML = rows.map((i) => {
      const pct = ((i.last - i.prev) / i.prev) * 100;
      return `<tr data-sym="${i.sym}" tabindex="0" aria-selected="${i.sym === selected}">
        <td class="sym">${i.sym}</td>
        <td class="num" data-cell="last">${fmt(i.last)}</td>
        <td class="num ${cls(pct)}" data-cell="pct">${signed(pct)}%</td></tr>`;
    }).join("");
  }
  function updateWatchRow(i, dir) {
    const row = wlBody.querySelector(`tr[data-sym="${CSS.escape(i.sym)}"]`);
    if (!row) return;
    const pct = ((i.last - i.prev) / i.prev) * 100;
    row.querySelector('[data-cell="last"]').textContent = fmt(i.last);
    const pc = row.querySelector('[data-cell="pct"]');
    pc.textContent = `${signed(pct)}%`;
    pc.className = `num ${cls(pct)}`;
    if (dir) {
      row.classList.remove("flash-up", "flash-down");
      void row.offsetWidth;
      row.classList.add(dir > 0 ? "flash-up" : "flash-down");
    }
  }
  wlBody.addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-sym]");
    if (tr) select(tr.dataset.sym);
  });
  wlBody.addEventListener("keydown", (e) => {
    const tr = e.target.closest("tr[data-sym]");
    if (!tr) return;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(tr.dataset.sym); }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = e.key === "ArrowDown" ? tr.nextElementSibling : tr.previousElementSibling;
      if (next && next.dataset.sym) { select(next.dataset.sym); wlBody.querySelector(`tr[data-sym="${CSS.escape(next.dataset.sym)}"]`).focus(); }
    }
  });
  $("wl-filter").addEventListener("input", renderWatchlist);

  function select(sym) {
    selected = sym;
    for (const tr of wlBody.querySelectorAll("tr[data-sym]")) tr.setAttribute("aria-selected", tr.dataset.sym === sym);
    $("t-sym").value = sym;
    renderFocus();
    updateEstimate();
  }

  // ---- Focus instrument ----
  function renderFocus() {
    const i = instruments.get(selected);
    const chg = i.last - i.prev, pct = (chg / i.prev) * 100;
    $("focus-sym").textContent = i.sym;
    $("focus-name").textContent = i.name;
    $("focus-last").textContent = fmt(i.last);
    const fc = $("focus-chg");
    fc.textContent = `${signed(chg)} (${signed(pct)}%)`;
    fc.className = cls(chg);
    $("q-bid").textContent = fmt(bid(i));
    $("q-ask").textContent = fmt(ask(i));
    $("q-open").textContent = fmt(i.open);
    $("q-high").textContent = fmt(i.high);
    $("q-low").textContent = fmt(i.low);
    $("q-vol").textContent = (i.vol / 1e6).toFixed(2) + "M";
    drawChart(i);
  }

  const canvas = $("chart");
  function drawChart(i) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const data = i.hist;
    const padR = 64, padT = 8, padB = 8;
    const lo = Math.min(...data, i.prev), hi = Math.max(...data, i.prev);
    const range = hi - lo || 1;
    const x = (k) => (k / (data.length - 1)) * (w - padR);
    const y = (v) => padT + (1 - (v - lo) / range) * (h - padT - padB);
    const lineColor = i.last >= i.prev ? color("--up") : color("--down");

    // Gridlines and price scale
    ctx.font = `12px ${color("--font")}`;
    ctx.textBaseline = "middle";
    ctx.fillStyle = color("--muted");
    ctx.strokeStyle = color("--line");
    ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const v = lo + (range * g) / 4, yy = Math.round(y(v)) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(w - padR, yy); ctx.stroke();
      if (Math.abs(yy - y(i.last)) > 22) ctx.fillText(fmt(v), w - padR + 8, Math.min(Math.max(yy, 8), h - 8));
    }

    // Previous close
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = color("--muted");
    const yc = Math.round(y(i.prev)) + 0.5;
    ctx.beginPath(); ctx.moveTo(0, yc); ctx.lineTo(w - padR, yc); ctx.stroke();
    ctx.setLineDash([]);

    // Area + line
    ctx.beginPath();
    data.forEach((v, k) => (k ? ctx.lineTo(x(k), y(v)) : ctx.moveTo(x(k), y(v))));
    ctx.strokeStyle = lineColor; ctx.lineWidth = 1.75; ctx.stroke();
    ctx.lineTo(x(data.length - 1), h); ctx.lineTo(0, h); ctx.closePath();
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, lineColor + "33"); grad.addColorStop(1, lineColor + "00");
    ctx.fillStyle = grad; ctx.fill();

    // Last price tag
    const yl = y(i.last);
    ctx.fillStyle = lineColor;
    ctx.fillRect(w - padR + 2, yl - 10, padR - 2, 20);
    ctx.fillStyle = color("--ink");
    ctx.font = `600 12px ${color("--font")}`;
    ctx.fillText(fmt(i.last), w - padR + 8, yl);
  }
  window.addEventListener("resize", () => drawChart(instruments.get(selected)));

  // ---- Order ticket ----
  const form = $("ticket-form");
  $("t-sym").innerHTML = [...instruments.keys()].map((s) => `<option>${s}</option>`).join("");
  $("t-sym").value = selected;

  const side = () => form.side.value;
  function updateTicketSide() {
    const b = $("t-submit"), s = side();
    b.className = `submit ${s === "BUY" ? "buy" : "sell"}`;
    b.textContent = s === "BUY" ? "Send buy order" : "Send sell order";
    updateEstimate();
  }
  function updateEstimate() {
    const i = instruments.get($("t-sym").value);
    const qty = parseInt($("t-qty").value, 10);
    const isLmt = $("t-type").value === "LMT";
    const px = isLmt ? parseFloat($("t-limit").value) : side() === "BUY" ? ask(i) : bid(i);
    $("t-est").textContent = qty > 0 && px > 0 ? money(qty * px) : "—";
  }
  form.addEventListener("change", (e) => {
    if (e.target.name === "side") updateTicketSide();
    if (e.target.id === "t-type") {
      const lmt = e.target.value === "LMT";
      $("t-limit-wrap").hidden = !lmt;
      if (lmt && !$("t-limit").value) $("t-limit").value = instruments.get($("t-sym").value).last.toFixed(2);
    }
    if (e.target.id === "t-sym") select(e.target.value);
    updateEstimate();
  });
  form.addEventListener("input", updateEstimate);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const err = $("t-error");
    const sym = $("t-sym").value;
    const qty = parseInt($("t-qty").value, 10);
    const type = $("t-type").value;
    const limit = type === "LMT" ? parseFloat($("t-limit").value) : null;
    if (!(qty > 0)) { err.textContent = "Enter a quantity of at least 1 share."; $("t-qty").focus(); return; }
    if (type === "LMT" && !(limit > 0)) { err.textContent = "Enter a limit price above zero."; $("t-limit").focus(); return; }
    err.textContent = "";

    const order = { id: nextId++, time: new Date(), side: side(), sym, qty, type, limit, status: "WORKING", fillPx: null };
    orders.unshift(order);
    tryFill(order);
    toast(order.status === "FILLED"
      ? `${order.side === "BUY" ? "Bought" : "Sold"} ${fmt(qty, 0)} ${sym} at ${fmt(order.fillPx)}`
      : `${order.side === "BUY" ? "Buy" : "Sell"} order for ${fmt(qty, 0)} ${sym} sent, working at ${fmt(limit)}`);
    renderBook();
  });

  function tryFill(o) {
    if (o.status !== "WORKING") return false;
    const i = instruments.get(o.sym);
    const px = o.side === "BUY" ? ask(i) : bid(i);
    const ok = o.type === "MKT" || (o.side === "BUY" ? px <= o.limit : px >= o.limit);
    if (!ok) return false;
    o.fillPx = o.type === "LMT" ? (o.side === "BUY" ? Math.min(px, o.limit) : Math.max(px, o.limit)) : px;
    o.status = "FILLED";
    applyFill(o.sym, o.side, o.qty, o.fillPx);
    return true;
  }

  // ---- Positions, blotter, desk stats ----
  function renderBook() {
    // Positions
    const rows = [...positions.entries()].filter(([, p]) => p.qty !== 0 || p.realized !== 0);
    let gross = 0, net = 0, pnl = 0;
    $("pos-body").innerHTML = rows.length ? rows.map(([sym, p]) => {
      const last = instruments.get(sym).last;
      const mv = p.qty * last, unrl = p.qty * (last - p.avg);
      gross += Math.abs(mv); net += mv; pnl += unrl + p.realized;
      return `<tr><td class="sym">${sym}</td>
        <td class="num ${cls(p.qty)}">${p.qty > 0 ? "" : p.qty < 0 ? "−" : ""}${fmt(Math.abs(p.qty), 0)}</td>
        <td class="num">${p.qty ? fmt(p.avg) : "—"}</td>
        <td class="num">${fmt(last)}</td>
        <td class="num">${money(mv)}</td>
        <td class="num ${cls(unrl)}">${money(unrl)}</td>
        <td class="num ${cls(p.realized)}">${money(p.realized)}</td></tr>`;
    }).join("") : `<tr class="empty"><td colspan="7">No positions. Orders you fill from the ticket show up here.</td></tr>`;

    // Blotter
    const view = orders.filter((o) => blotterView === "all" || (blotterView === "working" ? o.status === "WORKING" : o.status === "FILLED"));
    const emptyMsg = { all: "No orders yet today. Send one from the order ticket.", working: "No working orders.", filled: "No fills yet today." }[blotterView];
    $("blot-body").innerHTML = view.length ? view.map((o) => `<tr>
        <td>${o.time.toLocaleTimeString("en-US", { hour12: false, timeZone: "America/New_York" })}</td>
        <td class="muted">${o.id}</td>
        <td class="${o.side === "BUY" ? "up" : "down"}">${o.side === "BUY" ? "Buy" : "Sell"}</td>
        <td class="sym">${o.sym}</td>
        <td class="num">${fmt(o.qty, 0)}</td>
        <td>${o.type === "MKT" ? "Market" : "Limit"}</td>
        <td class="num">${o.limit ? fmt(o.limit) : "—"}</td>
        <td class="num">${o.fillPx ? fmt(o.fillPx) : "—"}</td>
        <td><span class="status ${o.status}">${{ WORKING: "Working", FILLED: "Filled", CANCELLED: "Cancelled" }[o.status]}</span></td>
        <td>${o.status === "WORKING" ? `<button class="cancel" data-id="${o.id}">Cancel</button>` : ""}</td></tr>`).join("")
      : `<tr class="empty"><td colspan="10">${emptyMsg}</td></tr>`;

    // Stats
    const sp = $("stat-pnl");
    sp.textContent = money(pnl); sp.className = cls(pnl);
    $("stat-gross").textContent = money(gross);
    const sn = $("stat-net");
    sn.textContent = money(net);
    $("stat-open").textContent = orders.filter((o) => o.status === "WORKING").length;
  }

  $("blot-body").addEventListener("click", (e) => {
    const b = e.target.closest(".cancel");
    if (!b) return;
    const o = orders.find((x) => x.id === +b.dataset.id);
    if (o && o.status === "WORKING") { o.status = "CANCELLED"; toast(`Cancelled order ${o.id}`); renderBook(); }
  });
  for (const tab of document.querySelectorAll(".tabs button")) {
    tab.addEventListener("click", () => {
      blotterView = tab.dataset.view;
      document.querySelectorAll(".tabs button").forEach((t) => t.setAttribute("aria-selected", t === tab));
      renderBook();
    });
  }

  // ---- Toast ----
  let toastTimer;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
  }

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // ---- Clock and simulated feed ----
  function tickClock() {
    const now = new Date();
    $("clock").textContent = now.toLocaleTimeString("en-US", { hour12: false, timeZone: "America/New_York" }) + " ET";
    // US regular session: weekdays 9:30–16:00 ET (holidays not handled yet).
    const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
    const mins = et.getHours() * 60 + et.getMinutes();
    const open = et.getDay() > 0 && et.getDay() < 6 && mins >= 570 && mins < 960;
    const s = $("session");
    s.lastChild.textContent = open ? "Market open" : "Market closed";
    s.classList.toggle("closed", !open);
  }

  function tickPrices() {
    for (const i of instruments.values()) {
      if (Math.random() > 0.45) continue;
      const before = i.last;
      i.last = round2(i.last * (1 + (Math.random() - 0.495) * 0.0016));
      i.high = Math.max(i.high, i.last); i.low = Math.min(i.low, i.last);
      i.vol += Math.round(Math.random() * 20000);
      i.hist.push(i.last);
      if (i.hist.length > 390) i.hist.shift();
      if (i.last !== before) updateWatchRow(i, i.last - before);
    }
    const filled = orders.filter(tryFill);
    filled.forEach((o) => toast(`Limit order ${o.id} filled: ${o.side === "BUY" ? "bought" : "sold"} ${fmt(o.qty, 0)} ${o.sym} at ${fmt(o.fillPx)}`));
    renderFocus();
    renderBook();
    updateEstimate();
  }

  renderWatchlist();
  renderFocus();
  renderBook();
  updateTicketSide();
  tickClock();
  setInterval(tickClock, 1000);
  setInterval(tickPrices, 1000);
})();
