// AI models page. Usage, local models and comparison figures are all sample data for now.
// To make it real: pull usage from each provider's usage/billing API, local models from Ollama's /api/ps and /api/tags,
// and comparison figures from a pricing and benchmark source you trust.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const { color } = Charts;
  const money = (n, d = 2) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const big = (n) => n >= 1e9 ? (n / 1e9).toFixed(2) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(Math.round(n));
  const SERIES = ["--violet", "--blue", "--up", "--focus", "--down"];

  // ---- API usage (sample) ----
  const apiModels = [
    { name: "Claude Opus 5.5", provider: "Anthropic", inP: 15, outP: 75, reqs: 4210, share: 0.18, inTok: 6200, outTok: 1400, latency: 9.8, err: 0.004 },
    { name: "Claude Sonnet 5.5", provider: "Anthropic", inP: 3, outP: 15, reqs: 18950, share: 0.42, inTok: 4100, outTok: 900, latency: 4.2, err: 0.003 },
    { name: "Claude Haiku 5.5", provider: "Anthropic", inP: 0.8, outP: 4, reqs: 52300, share: 0.25, inTok: 1800, outTok: 300, latency: 1.1, err: 0.002 },
    { name: "GPT-5", provider: "OpenAI", inP: 1.25, outP: 10, reqs: 6120, share: 0.1, inTok: 3500, outTok: 800, latency: 5.6, err: 0.011 },
    { name: "Gemini 2.5 Pro", provider: "Google", inP: 1.25, outP: 10, reqs: 2380, share: 0.05, inTok: 9000, outTok: 700, latency: 6.3, err: 0.021 },
  ];
  for (const m of apiModels) {
    m.inTotal = m.reqs * m.inTok; m.outTotal = m.reqs * m.outTok;
    m.cost = (m.inTotal * m.inP + m.outTotal * m.outP) / 1e6;
  }
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  // Spread each model's month-to-date cost across the days so far, with weekday bumps.
  for (const m of apiModels) {
    const w = Array.from({ length: dayOfMonth }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), i + 1).getDay();
      return (d === 0 || d === 6 ? 0.45 : 1) * (0.7 + Math.random() * 0.6);
    });
    const sum = w.reduce((a, b) => a + b, 0);
    m.daily = w.map((x) => (x / sum) * m.cost);
  }
  let budget = 4000;
  let reqsToday = 2140, tokensToday = 7.9e6;

  const totalSpend = () => apiModels.reduce((s, m) => s + m.cost, 0);

  function drawSpend() {
    Charts.stackedBars($("spend-chart"), {
      labels: Array.from({ length: daysInMonth }, (_, i) => String(i + 1)),
      series: apiModels.map((m, i) => ({ values: m.daily, color: SERIES[i] })),
      fmt: (v) => "$" + Math.round(v),
      labelEvery: 5,
      highlight: dayOfMonth - 1,
    });
    $("spend-note").textContent = `${money(totalSpend() / dayOfMonth)} a day on average`;
  }
  $("spend-legend").innerHTML = apiModels.map((m, i) => `<li><span class="swatch" style="background:var(${SERIES[i]})"></span>${m.name}</li>`).join("");

  function renderBudget() {
    const spent = totalSpend();
    const projected = (spent / dayOfMonth) * daysInMonth;
    const cap = Math.max(budget, projected, spent);
    $("b-used").textContent = money(spent, 0);
    $("b-cap").textContent = money(budget, 0);
    const bar = $("b-bar");
    bar.querySelector(".used").style.width = (spent / cap) * 100 + "%";
    bar.querySelector(".proj").style.width = (Math.max(0, projected - spent) / cap) * 100 + "%";
    bar.style.setProperty("--cap", (budget / cap) * 100 + "%");
    bar.setAttribute("aria-label", `Spent ${money(spent, 0)}, on track for ${money(projected, 0)}, budget ${money(budget, 0)}`);
    const over = projected > budget;
    const proj = $("b-proj");
    proj.textContent = over
      ? `On track for ${money(projected, 0)} by month end, ${money(projected - budget, 0)} over budget.`
      : `On track for ${money(projected, 0)} by month end, ${money(budget - projected, 0)} under budget.`;
    proj.className = "small " + (over ? "down" : "muted");
    bar.classList.toggle("over", over);

    const byProv = {};
    for (const m of apiModels) byProv[m.provider] = (byProv[m.provider] || 0) + m.cost;
    const rows = Object.entries(byProv).sort((a, b) => b[1] - a[1]);
    const max = rows[0][1];
    $("b-providers").innerHTML = rows.map(([p, c]) => `<li><span>${p}</span><span class="hbar"><span style="width:${(c / max) * 100}%;background:var(--blue)"></span></span><span class="num">${money(c, 0)}</span></li>`).join("");
    $("ai-spend").textContent = money(spent, 0);
    $("ai-spend").className = over ? "warn" : "";
    if (document.activeElement !== $("b-input")) $("b-input").value = budget;
  }
  $("b-save").addEventListener("click", () => {
    const v = parseFloat($("b-input").value);
    if (!(v > 0)) { toast("Enter a budget above zero."); $("b-input").focus(); return; }
    budget = v;
    renderBudget();
    toast(`Monthly budget set to ${money(budget, 0)}`);
  });

  function renderUsage() {
    const maxCost = Math.max(...apiModels.map((m) => m.cost));
    $("usage-body").innerHTML = apiModels.map((m, i) => `<tr>
      <td><span class="swatch" style="background:var(${SERIES[i]})"></span><span class="sym">${m.name}</span></td>
      <td class="muted">${m.provider}</td>
      <td class="num">${m.reqs.toLocaleString()}</td>
      <td class="num">${big(m.inTotal)}</td>
      <td class="num">${big(m.outTotal)}</td>
      <td class="share-cell"><div class="inline-bar"><span style="width:${(m.cost / maxCost) * 100}%;background:var(${SERIES[i]})"></span></div>${money(m.cost, 0)}</td>
      <td class="num">${m.latency.toFixed(1)} s</td>
      <td class="num ${m.err > 0.015 ? "warn" : ""}">${(m.err * 100).toFixed(1)}%</td></tr>`).join("");
  }

  // ---- Local models (sample, shaped like Ollama) ----
  const VRAM_TOTAL = 48 * 4;
  const local = [
    { name: "llama3.3:70b", params: "70B", quant: "Q4", vram: 43, loaded: true, gpu: "GPU 3", tps: 24, reqs: 61 },
    { name: "qwen2.5-coder:32b", params: "32B", quant: "Q4", vram: 21, loaded: true, gpu: "GPU 3", tps: 41, reqs: 118 },
    { name: "mistral-small:24b", params: "24B", quant: "Q4", vram: 15, loaded: false, gpu: "—", tps: 0, reqs: 0 },
    { name: "nomic-embed-text", params: "137M", quant: "F16", vram: 0.5, loaded: true, gpu: "GPU 3", tps: 0, reqs: 940, embed: true },
    { name: "llava:13b", params: "13B", quant: "Q4", vram: 9, loaded: false, gpu: "—", tps: 0, reqs: 0 },
  ];
  const baseTps = { "llama3.3:70b": 24, "qwen2.5-coder:32b": 41, "mistral-small:24b": 55, "llava:13b": 68 };
  function renderLocal() {
    const maxV = Math.max(...local.map((m) => m.vram));
    const focused = document.activeElement?.dataset?.local;
    $("local-body").innerHTML = local.map((m, i) => `<tr>
      <td class="sym">${m.name}</td>
      <td class="muted">${m.params}, ${m.quant}</td>
      <td class="${m.loaded ? "up" : "muted"}">${m.loading ? "Loading…" : m.loaded ? `Loaded on ${m.gpu}` : "Not loaded"}</td>
      <td class="share-cell"><div class="inline-bar"><span style="width:${(m.vram / maxV) * 100}%;background:${m.loaded ? "var(--blue)" : "var(--line)"}"></span></div>${m.vram} GB</td>
      <td class="num">${m.embed ? "<span class=\"muted\">Embeddings</span>" : m.loaded ? `${Math.round(m.tps)} tokens/s` : "—"}</td>
      <td class="num">${m.reqs.toLocaleString()}</td>
      <td><button type="button" class="cancel" data-local="${i}" ${m.loading ? "disabled" : ""}>${m.loaded ? "Unload" : "Load"}</button></td></tr>`).join("");
    if (focused !== undefined) $("local-body").querySelector(`[data-local="${focused}"]`)?.focus();
    const used = local.filter((m) => m.loaded).reduce((s, m) => s + m.vram, 0);
    $("local-note").textContent = `${used.toFixed(1)} of ${VRAM_TOTAL} GB GPU memory used by models`;
    $("ai-loaded").textContent = `${local.filter((m) => m.loaded).length} of ${local.length}`;
  }
  $("local-body").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-local]");
    if (!b) return;
    const m = local[+b.dataset.local];
    if (m.loaded) {
      m.loaded = false; m.gpu = "—"; m.tps = 0;
      toast(`Unloaded ${m.name}, freed ${m.vram} GB`);
      renderLocal();
    } else {
      m.loading = true; renderLocal();
      setTimeout(() => {
        m.loading = false; m.loaded = true; m.gpu = "GPU 3"; m.tps = baseTps[m.name] || 0;
        toast(`Loaded ${m.name} on GPU 3`);
        renderLocal();
      }, 1500);
    }
  });

  // ---- Comparison (sample figures) ----
  const compare = [
    { name: "Claude Opus 5.5", maker: "Anthropic", inPrice: 15, outPrice: 75, context: 200, score: 92 },
    { name: "Claude Sonnet 5.5", maker: "Anthropic", inPrice: 3, outPrice: 15, context: 200, score: 88 },
    { name: "Claude Haiku 5.5", maker: "Anthropic", inPrice: 0.8, outPrice: 4, context: 200, score: 78 },
    { name: "GPT-5", maker: "OpenAI", inPrice: 1.25, outPrice: 10, context: 400, score: 87 },
    { name: "Gemini 2.5 Pro", maker: "Google", inPrice: 1.25, outPrice: 10, context: 1000, score: 85 },
    { name: "Llama 3.3 70B (local)", maker: "Meta", inPrice: 0.1, outPrice: 0.1, context: 128, score: 70 },
    { name: "Qwen2.5 Coder 32B (local)", maker: "Alibaba", inPrice: 0.05, outPrice: 0.05, context: 128, score: 68 },
  ];
  const MAKER_COLOR = { Anthropic: "--violet", OpenAI: "--up", Google: "--blue", Meta: "--focus", Alibaba: "--down" };
  const blended = (m) => (m.inPrice * 3 + m.outPrice) / 4; // 3:1 input to output mix
  let sortKey = "score", sortDir = -1, hover = null;

  function renderCompare() {
    const rows = [...compare].sort((a, b) => (typeof a[sortKey] === "string" ? a[sortKey].localeCompare(b[sortKey]) : a[sortKey] - b[sortKey]) * sortDir);
    $("cmp-body").innerHTML = rows.map((m) => `<tr data-name="${m.name}" class="${hover === m.name ? "hl" : ""}">
      <td><span class="swatch" style="background:var(${MAKER_COLOR[m.maker]})"></span>${m.name}</td>
      <td class="muted">${m.maker}</td>
      <td class="num">${m.inPrice.toFixed(2)}</td>
      <td class="num">${m.outPrice.toFixed(2)}</td>
      <td class="num">${m.context >= 1000 ? m.context / 1000 + "M" : m.context + "K"}</td>
      <td class="num"><strong>${m.score}</strong></td></tr>`).join("");
    for (const btn of document.querySelectorAll(".sortable button")) {
      const th = btn;
      th.setAttribute("aria-sort", btn.dataset.sort === sortKey ? (sortDir < 0 ? "descending" : "ascending") : "none");
    }
  }
  document.querySelector(".sortable thead").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-sort]");
    if (!b) return;
    if (sortKey === b.dataset.sort) sortDir *= -1;
    else { sortKey = b.dataset.sort; sortDir = typeof compare[0][sortKey] === "string" ? 1 : -1; }
    renderCompare();
  });
  $("cmp-body").addEventListener("mouseover", (e) => {
    const tr = e.target.closest("tr[data-name]");
    if (tr && hover !== tr.dataset.name) { hover = tr.dataset.name; drawScatter(); }
  });
  $("cmp-body").addEventListener("mouseleave", () => { hover = null; drawScatter(); });

  function drawScatter() {
    const s = Charts.setup($("cmp-chart"));
    if (!s) return;
    const { ctx, w, h } = s;
    const padL = 40, padB = 24, padT = 10, padR = 16;
    const xs = compare.map(blended);
    const lx0 = Math.log10(Math.min(...xs) / 2), lx1 = Math.log10(Math.max(...xs) * 2);
    const x = (v) => padL + ((Math.log10(v) - lx0) / (lx1 - lx0)) * (w - padL - padR);
    const y = (v) => padT + (1 - (v - 60) / 40) * (h - padT - padB);
    Charts.gridY(ctx, { x0: padL, x1: w - padR, y, lo: 60, hi: 100, label: (v) => String(Math.round(v)), labelX: padL - 8, align: "right" });
    ctx.fillStyle = color("--muted"); ctx.textBaseline = "alphabetic"; ctx.textAlign = "center";
    let lastEnd = -Infinity;
    for (const t of [0.05, 0.1, 0.5, 1, 5, 10, 50]) {
      if (Math.log10(t) < lx0 || Math.log10(t) > lx1) continue;
      const half = ctx.measureText("$" + t).width / 2;
      if (x(t) - half < lastEnd + 8) continue;
      ctx.fillText("$" + t, x(t), h - 6);
      lastEnd = x(t) + half;
    }
    ctx.textAlign = "left";
    // Points and labels; nudge a label down when it would sit on top of another one.
    const placed = compare.map((m) => ({ x: x(blended(m)) - 7, y: y(m.score), w: 14 }));
    for (const m of [...compare].sort((a, b) => b.score - a.score)) {
      const px = x(blended(m)), py = y(m.score);
      const on = hover === m.name;
      ctx.globalAlpha = hover && !on ? 0.35 : 1;
      ctx.fillStyle = color(MAKER_COLOR[m.maker]);
      ctx.beginPath(); ctx.arc(px, py, on ? 7 : 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color("--text");
      ctx.font = `${on ? 600 : 400} 12px ${color("--font")}`;
      const label = m.name.replace(" (local)", "");
      const tw = ctx.measureText(label).width;
      // Try right of the dot, then left, then slightly above or below on either side.
      const right = px + 9, left = px - 9 - tw;
      const spots = [[right, py], [left, py], [right, py - 12], [left, py - 12], [right, py + 12], [left, py + 12]]
        .filter(([lx]) => lx >= padL && lx + tw <= w - padR);
      const clear = ([lx, ly]) => !placed.some((r) => lx < r.x + r.w && lx + tw > r.x && Math.abs(ly - r.y) < 13);
      const [lxp, ly] = spots.find(clear) || spots[0] || [right, py];
      placed.push({ x: lxp, y: ly, w: tw });
      ctx.textBaseline = "middle";
      ctx.fillText(label, lxp, ly);
    }
    ctx.globalAlpha = 1;
  }

  // ---- Header ----
  function renderHeader() {
    $("ai-reqs").textContent = reqsToday.toLocaleString();
    $("ai-tokens").textContent = big(tokensToday);
    const flaky = apiModels.filter((m) => m.err > 0.015);
    const h = $("ai-health");
    h.lastChild.textContent = flaky.length ? `${flaky.map((m) => m.provider).join(", ")} error rate above 1.5%` : "All providers responding";
    h.classList.toggle("alert", flaky.length > 0);
  }

  // ---- Shared ----
  let toastTimer;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
  }

  function tick() {
    const n = Math.round(Math.random() * 6);
    reqsToday += n;
    tokensToday += n * (2000 + Math.random() * 4000);
    for (let k = 0; k < n; k++) {
      const m = apiModels[Math.floor(Math.random() * apiModels.length)];
      const c = (m.inTok * m.inP + m.outTok * m.outP) / 1e6;
      m.reqs++; m.inTotal += m.inTok; m.outTotal += m.outTok; m.cost += c; m.daily[dayOfMonth - 1] += c;
    }
    for (const m of local) if (m.loaded && !m.embed) m.tps = (baseTps[m.name] || m.tps) * (0.9 + Math.random() * 0.2);
    renderHeader(); renderUsage(); renderBudget(); renderLocal(); drawSpend();
  }

  renderHeader(); renderUsage(); renderBudget(); renderLocal(); renderCompare();
  drawSpend(); drawScatter();
  window.addEventListener("resize", () => { drawSpend(); drawScatter(); });
  setInterval(tick, 3000);
})();
