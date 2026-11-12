// Computer and GPU page. Readings are simulated until it's connected to an agent on the machine.
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const css = getComputedStyle(document.documentElement);
  const color = (n) => css.getPropertyValue(n).trim();
  const SERIES = ["--up", "--focus", "--blue", "--violet"];
  const HISTORY = 120;
  const DEFAULT = { mode: "Balanced", limit: 350, fan: "auto", fanPct: 60 };
  const MODE_CLOCK = { Quiet: 1650, Balanced: 2100, Max: 2520 };

  const gpus = [0, 1, 2, 3].map((id) => ({
    id, name: "RTX 6000 Ada", memTotal: 48,
    util: 30 + Math.random() * 50, temp: 55, power: 200, fanPct: 45, clock: 2100,
    ...DEFAULT, hist: { util: [], temp: [], power: [] },
  }));

  const procs = [
    { pid: 48211, name: "python train.py", user: "nate", gpu: 0, mem: 31.2, load: 0.9 },
    { pid: 48302, name: "python train.py", user: "nate", gpu: 1, mem: 30.8, load: 0.85 },
    { pid: 51877, name: "blender --render scene_04", user: "nate", gpu: 2, mem: 18.4, load: 0.7 },
    { pid: 12044, name: "ollama serve", user: "ollama", gpu: 3, mem: 22.1, load: 0.35 },
    { pid: 9921, name: "Xorg", user: "root", gpu: 0, mem: 0.6, load: 0.02 },
  ];

  let selected = 0;
  let metric = "util";
  const bootedAt = Date.now() - (3 * 86400 + 7 * 3600 + 12 * 60) * 1000;

  // ---- Simulation ----
  function step() {
    for (const g of gpus) {
      const mine = procs.filter((p) => p.gpu === g.id);
      const target = Math.min(100, mine.reduce((s, p) => s + p.load * 100, 0)) * (g.mode === "Quiet" ? 0.8 : 1);
      g.util = clamp(g.util + (target - g.util) * 0.2 + (Math.random() - 0.5) * 8, 0, 100);
      g.memUsed = Math.min(g.memTotal, mine.reduce((s, p) => s + p.mem, 0.4));
      g.power = clamp(35 + (g.limit - 35) * (g.util / 100) * (0.85 + Math.random() * 0.15), 30, g.limit);
      const fanAuto = clamp(30 + (g.temp - 45) * 1.6, 30, 100);
      g.fanPct = g.fan === "auto" ? fanAuto : g.fanPct0;
      const targetTemp = 32 + g.power * 0.13 - (g.fanPct - 30) * 0.12;
      g.temp = g.temp + (targetTemp - g.temp) * 0.15;
      g.clock = g.util < 5 ? 210 : MODE_CLOCK[g.mode] - Math.max(0, g.temp - 80) * 15 + Math.round((Math.random() - 0.5) * 30);
      for (const k of ["util", "temp", "power"]) {
        g.hist[k].push(g[k]);
        if (g.hist[k].length > HISTORY) g.hist[k].shift();
      }
    }
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  for (const g of gpus) g.fanPct0 = DEFAULT.fanPct;
  for (let i = 0; i < HISTORY; i++) step();

  // ---- GPU table ----
  const tempClass = (t) => (t >= 83 ? "down" : t >= 75 ? "warn" : "");
  function bar(pct, label, extra = "") {
    return `<div class="meter-wrap"><div class="meter ${extra}" title="${label}"><span style="width:${pct.toFixed(1)}%"></span></div><span class="meter-label">${label}</span></div>`;
  }
  function renderGpus() {
    const focused = document.activeElement?.closest?.("#gpu-body tr[data-id]")?.dataset.id;
    $("gpu-body").innerHTML = gpus.map((g) => `
      <tr data-id="${g.id}" tabindex="0" aria-selected="${g.id === selected}">
        <td><span class="sym">GPU ${g.id}</span> <span class="muted small">${g.name}</span></td>
        <td class="meter-cell">${bar(g.util, Math.round(g.util) + "%")}</td>
        <td class="num ${tempClass(g.temp)}">${Math.round(g.temp)}°C</td>
        <td class="meter-cell">${bar((g.memUsed / g.memTotal) * 100, `${g.memUsed.toFixed(1)} / ${g.memTotal} GB`, "mem")}</td>
        <td class="num">${Math.round(g.power)} / ${g.limit} W</td>
        <td class="num">${Math.round(g.fanPct)}%${g.fan === "manual" ? " <span class=\"muted small\">fixed</span>" : ""}</td>
        <td class="num">${g.clock.toLocaleString()} MHz</td>
        <td>${g.mode === "Max" ? "Max performance" : g.mode}</td>
      </tr>`).join("");
    if (focused !== undefined) $("gpu-body").querySelector(`tr[data-id="${focused}"]`).focus();
  }
  $("gpu-body").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (tr) select(+tr.dataset.id);
  });
  $("gpu-body").addEventListener("keydown", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (!tr) return;
    let id = +tr.dataset.id;
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(id); return; }
    if (e.key === "ArrowDown") id = Math.min(gpus.length - 1, id + 1);
    else if (e.key === "ArrowUp") id = Math.max(0, id - 1);
    else return;
    e.preventDefault();
    select(id);
    $("gpu-body").querySelector(`tr[data-id="${id}"]`).focus();
  });

  function select(id) {
    selected = id;
    renderGpus();
    loadControls();
    drawChart();
  }

  // ---- Chart ----
  const canvas = $("gpu-chart");
  const METRIC = {
    util: { min: 0, max: 100, unit: "%" },
    temp: { min: 30, max: 95, unit: "°C" },
    power: { min: 0, max: 450, unit: " W" },
  };
  function drawChart() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const m = METRIC[metric], padR = 48, padT = 8, padB = 8;
    const x = (k) => (k / (HISTORY - 1)) * (w - padR);
    const y = (v) => padT + (1 - (v - m.min) / (m.max - m.min)) * (h - padT - padB);

    ctx.font = `12px ${color("--font")}`;
    ctx.textBaseline = "middle";
    ctx.lineWidth = 1;
    for (let g = 0; g <= 4; g++) {
      const v = m.min + ((m.max - m.min) * g) / 4, yy = Math.round(y(v)) + 0.5;
      ctx.strokeStyle = color("--line");
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(w - padR, yy); ctx.stroke();
      ctx.fillStyle = color("--muted");
      ctx.fillText(Math.round(v) + m.unit, w - padR + 8, clamp(yy, 8, h - 8));
    }
    // Draw the selected GPU last so it sits on top.
    const order = gpus.filter((g) => g.id !== selected).concat(gpus[selected]);
    for (const g of order) {
      const data = g.hist[metric];
      ctx.beginPath();
      data.forEach((v, k) => (k ? ctx.lineTo(x(k), y(v)) : ctx.moveTo(x(k), y(v))));
      ctx.strokeStyle = color(SERIES[g.id]);
      ctx.globalAlpha = g.id === selected ? 1 : 0.35;
      ctx.lineWidth = g.id === selected ? 2 : 1.25;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  $("legend").innerHTML = gpus.map((g) => `<li><span class="swatch" style="background:var(${SERIES[g.id]})"></span>GPU ${g.id}</li>`).join("");
  for (const tab of document.querySelectorAll(".history .tabs button")) {
    tab.addEventListener("click", () => {
      metric = tab.dataset.metric;
      document.querySelectorAll(".history .tabs button").forEach((t) => t.setAttribute("aria-selected", t === tab));
      drawChart();
    });
  }
  window.addEventListener("resize", drawChart);

  // ---- Controls ----
  const form = $("ctl-form");
  function syncOutputs() {
    $("c-power-out").textContent = $("c-power").value + " W";
    $("c-fan-out").textContent = $("c-fan").value + "%";
    $("c-fan-wrap").hidden = form.fan.value !== "manual";
  }
  function loadControls() {
    const g = gpus[selected];
    $("ctl-gpu").textContent = `GPU ${g.id}`;
    $("c-mode").value = g.mode;
    $("c-power").value = g.limit;
    form.fan.value = g.fan;
    $("c-fan").value = g.fanPct0;
    syncOutputs();
  }
  form.addEventListener("input", syncOutputs);
  form.addEventListener("change", syncOutputs);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const g = gpus[selected];
    g.mode = $("c-mode").value;
    g.limit = +$("c-power").value;
    g.fan = form.fan.value;
    g.fanPct0 = +$("c-fan").value;
    toast(`Applied to GPU ${g.id}: ${g.mode === "Max" ? "max performance" : g.mode.toLowerCase()}, ${g.limit} W limit, fan ${g.fan === "auto" ? "automatic" : g.fanPct0 + "%"}`);
    renderGpus();
  });
  $("c-reset").addEventListener("click", () => {
    const g = gpus[selected];
    Object.assign(g, { mode: DEFAULT.mode, limit: DEFAULT.limit, fan: DEFAULT.fan, fanPct0: DEFAULT.fanPct });
    loadControls();
    toast(`GPU ${g.id} reset to default settings`);
    renderGpus();
  });

  // ---- Processes ----
  function renderProcs() {
    $("proc-body").innerHTML = procs.length ? procs.map((p) => `<tr>
        <td class="muted">${p.pid}</td>
        <td>${escapeHtml(p.name)}</td>
        <td>${p.user}</td>
        <td>GPU ${p.gpu}</td>
        <td class="num">${p.mem.toFixed(1)} GB</td>
        <td class="num">${Math.round(p.load * 100 * (0.9 + Math.random() * 0.2))}%</td>
        <td><button class="cancel" data-pid="${p.pid}">End process</button></td></tr>`).join("")
      : `<tr class="empty"><td colspan="7">No processes are using the GPUs.</td></tr>`;
  }
  $("proc-body").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pid]");
    if (!b) return;
    const i = procs.findIndex((p) => p.pid === +b.dataset.pid);
    if (i < 0) return;
    const [p] = procs.splice(i, 1);
    toast(`Ended ${p.name} (PID ${p.pid})`);
    renderProcs();
  });

  // ---- Computer power actions ----
  let pending = null;
  $("power-actions").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-action]");
    if (!b) return;
    const action = b.dataset.action;
    if (action === "Lock" || action === "Sleep") {
      toast(action === "Lock" ? "Computer locked" : "Computer is going to sleep");
      return;
    }
    pending = action;
    $("confirm-text").textContent = `${action} ${$("host").textContent}? ${procs.length} GPU process${procs.length === 1 ? "" : "es"} will be stopped.`;
    $("confirm-yes").textContent = action;
    $("confirm").hidden = false;
    $("confirm-no").focus();
  });
  $("confirm-no").addEventListener("click", () => { $("confirm").hidden = true; pending = null; });
  $("confirm-yes").addEventListener("click", () => {
    toast(pending === "Restart" ? "Restart sent. The computer will be back in about a minute." : "Shut down sent.");
    $("confirm").hidden = true; pending = null;
  });

  // ---- Header ----
  function renderHeader() {
    const s = Math.floor((Date.now() - bootedAt) / 1000);
    $("uptime").textContent = `Up ${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
    $("sys-cpu").textContent = Math.round(18 + Math.random() * 14) + "%";
    $("sys-mem").textContent = `${(84 + Math.random() * 4).toFixed(1)} / 256 GB`;
    $("sys-power").textContent = Math.round(gpus.reduce((s, g) => s + g.power, 0)) + " W";
    const hot = gpus.reduce((a, b) => (b.temp > a.temp ? b : a));
    const hs = $("sys-hot");
    hs.textContent = `GPU ${hot.id}, ${Math.round(hot.temp)}°C`;
    hs.className = tempClass(hot.temp);
    const health = $("health");
    const over = gpus.filter((g) => g.temp >= 83);
    health.lastChild.textContent = over.length ? `${over.map((g) => "GPU " + g.id).join(", ")} running hot` : "All GPUs healthy";
    health.classList.toggle("alert", over.length > 0);
  }

  // ---- Shared bits ----
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

  function tick() {
    step();
    renderGpus();
    drawChart();
    renderHeader();
  }
  renderGpus();
  loadControls();
  renderProcs();
  renderHeader();
  drawChart();
  setInterval(tick, 1000);
  setInterval(renderProcs, 3000);
})();
