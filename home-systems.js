// Home systems page. Readings are simulated until it's connected to a hub (Home Assistant, SmartThings, etc.).
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const css = getComputedStyle(document.documentElement);
  const color = (n) => css.getPropertyValue(n).trim();
  const DAY = 86400000;
  const today = new Date();
  const daysFrom = (n) => new Date(today.getTime() + n * DAY);
  const shortDate = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  // ---- State ----
  let hvacMode = "Auto";
  let alarm = "Home";
  let outside = 41;

  const zones = [
    { name: "Living areas", temp: 69.4, target: 70, humidity: 38 },
    { name: "Bedrooms", temp: 67.8, target: 68, humidity: 40 },
    { name: "Basement", temp: 63.1, target: 64, humidity: 52 },
  ];

  const locks = [
    { name: "Front door", kind: "lock", state: true },
    { name: "Back door", kind: "lock", state: true },
    { name: "Garage door", kind: "garage", state: false },
    { name: "Side gate", kind: "sensor", state: true },
  ];

  const lights = [
    { name: "Kitchen", on: true, level: 80 },
    { name: "Living room", on: true, level: 55 },
    { name: "Office", on: true, level: 100 },
    { name: "Primary bedroom", on: false, level: 40 },
    { name: "Porch", on: false, level: 100 },
    { name: "Driveway", on: false, level: 100 },
  ];

  const systems = [
    { name: "Furnace filter", reading: () => "Installed 74 days ago", status: "warn", statusText: "Replace soon", next: daysFrom(16), action: "Mark replaced" },
    { name: "Water heater", reading: () => "122°F, 50 gal", status: "ok", statusText: "Normal", next: daysFrom(142), action: "Mark flushed" },
    { name: "Sump pump", reading: () => "Last ran 2 days ago", status: "ok", statusText: "Normal", next: daysFrom(48), action: "Mark tested" },
    { name: "Leak sensors", reading: () => "4 sensors, all dry", status: "ok", statusText: "Normal", next: null },
    { name: "Smoke and CO detectors", reading: () => "6 detectors", status: "warn", statusText: "Hallway battery at 18%", next: daysFrom(0), action: "Mark battery changed" },
    { name: "Water softener", reading: () => "Salt at 35%", status: "ok", statusText: "Normal", next: daysFrom(21), action: "Mark refilled" },
    { name: "Internet", reading: () => "940 / 38 Mbps", status: "ok", statusText: "Online", next: null },
  ];

  // Hourly kWh so far today, plus a live reading.
  const hour = today.getHours();
  const kwh = Array.from({ length: 24 }, (_, h) => (h > hour ? null : +(0.6 + Math.sin((h - 6) / 24 * Math.PI * 2) * 0.35 + (h >= 17 && h <= 21 ? 0.9 : 0) + Math.random() * 0.4).toFixed(2)));
  let usingNow = 1.8;
  const RATE = 0.14; // $ per kWh

  // ---- Climate ----
  function zoneAction(z) {
    if (hvacMode === "Off") return "Off";
    const diff = z.target - z.temp;
    if ((hvacMode === "Heat" || hvacMode === "Auto") && diff > 0.5) return "Heating";
    if ((hvacMode === "Cool" || hvacMode === "Auto") && diff < -0.5) return "Cooling";
    return "Holding";
  }
  function renderZones() {
    const f = document.activeElement?.closest?.("#zones button[data-zone]");
    const keep = f ? `button[data-zone="${f.dataset.zone}"][data-d="${f.dataset.d}"]` : null;
    $("zones").innerHTML = zones.map((z, i) => {
      const act = zoneAction(z);
      return `<li class="zone">
        <h3>${z.name}</h3>
        <p class="zone-temp">${z.temp.toFixed(1)}°</p>
        <p class="muted small">${act === "Off" ? "System off" : `${act}, set to ${z.target}°`}, ${z.humidity}% humidity</p>
        <div class="stepper" role="group" aria-label="${z.name} target temperature">
          <button type="button" data-zone="${i}" data-d="-1" aria-label="Lower ${z.name} target">−</button>
          <output>${z.target}°</output>
          <button type="button" data-zone="${i}" data-d="1" aria-label="Raise ${z.name} target">+</button>
        </div>
      </li>`;
    }).join("");
    if (keep) $("zones").querySelector(keep).focus();
  }
  $("zones").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-zone]");
    if (!b) return;
    const z = zones[+b.dataset.zone];
    z.target = Math.max(55, Math.min(85, z.target + +b.dataset.d));
    renderZones();
    $("zones").querySelector(`button[data-zone="${b.dataset.zone}"][data-d="${b.dataset.d}"]`).focus();
  });
  $("hvac-mode").addEventListener("change", (e) => {
    hvacMode = e.target.value;
    toast(hvacMode === "Off" ? "Heating and cooling turned off" : `Heating and cooling set to ${hvacMode.toLowerCase()}`);
    renderZones();
  });

  // ---- Security ----
  const lockLabel = (l) => l.kind === "lock" ? (l.state ? "Locked" : "Unlocked")
    : l.kind === "garage" ? (l.state ? "Closed" : "Open") : (l.state ? "Closed" : "Open");
  const lockAction = (l) => l.kind === "lock" ? (l.state ? "Unlock" : "Lock")
    : l.kind === "garage" ? (l.state ? "Open" : "Close") : null;
  function renderLocks() {
    $("locks").innerHTML = locks.map((l, i) => `<li>
      <span>${l.name}</span>
      <span class="${l.state ? "up" : "warn"}">${lockLabel(l)}</span>
      ${lockAction(l) ? `<button type="button" class="cancel" data-lock="${i}">${lockAction(l)}</button>` : "<span></span>"}
    </li>`).join("");
    const open = locks.filter((l) => !l.state).length;
    $("h-alarm").textContent = alarm === "Off" ? "Off" : alarm === "Home" ? "Armed home" : "Armed away";
    renderStatus(open);
  }
  $("locks").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-lock]");
    if (!b) return;
    const l = locks[+b.dataset.lock];
    const verb = lockAction(l);
    l.state = !l.state;
    toast(`${l.name} ${verb === "Unlock" ? "unlocked" : verb === "Lock" ? "locked" : verb === "Open" ? "opening" : "closing"}`);
    renderLocks();
    $("locks").querySelector(`button[data-lock="${b.dataset.lock}"]`).focus();
  });
  for (const r of document.querySelectorAll('input[name="alarm"]')) {
    r.addEventListener("change", () => {
      alarm = r.value;
      const open = locks.filter((l) => !l.state);
      toast(alarm === "Off" ? "Alarm turned off"
        : `Alarm ${alarm === "Home" ? "armed home" : "armed away"}${open.length ? `. Still open: ${open.map((l) => l.name.toLowerCase()).join(", ")}` : ""}`);
      renderLocks();
    });
  }

  // ---- Lights ----
  function renderLights() {
    $("light-list").innerHTML = lights.map((l, i) => `<li>
      <label class="switch"><input type="checkbox" data-light="${i}" ${l.on ? "checked" : ""}><span aria-hidden="true"></span>${l.name}</label>
      <input type="range" min="5" max="100" step="5" value="${l.level}" data-level="${i}" aria-label="${l.name} brightness" ${l.on ? "" : "disabled"}>
      <span class="muted small level">${l.on ? l.level + "%" : "Off"}</span>
    </li>`).join("");
  }
  $("light-list").addEventListener("change", (e) => {
    const i = e.target.dataset.light;
    if (i === undefined) return;
    lights[+i].on = e.target.checked;
    renderLights();
    $("light-list").querySelector(`[data-light="${i}"]`).focus();
  });
  $("light-list").addEventListener("input", (e) => {
    const i = e.target.dataset.level;
    if (i === undefined) return;
    lights[+i].level = +e.target.value;
    e.target.nextElementSibling.textContent = e.target.value + "%";
  });
  $("all-off").addEventListener("click", () => {
    lights.forEach((l) => (l.on = false));
    renderLights();
    toast("All lights turned off");
  });

  // ---- Energy chart ----
  const canvas = $("energy-chart");
  function drawEnergy() {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const padL = 40, padB = 20, padT = 6;
    const max = Math.ceil(Math.max(3, ...kwh.filter((v) => v !== null)));
    const bw = (w - padL) / 24;
    const y = (v) => padT + (1 - v / max) * (h - padT - padB);
    ctx.font = `12px ${color("--font")}`;
    ctx.textBaseline = "middle";
    ctx.lineWidth = 1;
    for (let g = 0; g <= max; g++) {
      const yy = Math.round(y(g)) + 0.5;
      ctx.strokeStyle = color("--line");
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w, yy); ctx.stroke();
      ctx.fillStyle = color("--muted");
      ctx.fillText(g + " kWh", 0, yy);
    }
    kwh.forEach((v, hr) => {
      if (v === null) return;
      const x = padL + hr * bw + 2;
      ctx.fillStyle = hr === hour ? color("--focus") : color("--blue");
      ctx.fillRect(x, y(v), Math.max(1, bw - 4), y(0) - y(v));
    });
    ctx.fillStyle = color("--muted");
    ctx.textBaseline = "alphabetic";
    for (const hr of [0, 6, 12, 18]) {
      const label = hr === 0 ? "12 am" : hr === 12 ? "12 pm" : hr < 12 ? hr + " am" : hr - 12 + " pm";
      ctx.fillText(label, padL + hr * bw + 2, h - 4);
    }
  }
  window.addEventListener("resize", drawEnergy);

  // ---- Systems ----
  function renderSystems() {
    $("sys-body").innerHTML = systems.map((s, i) => `<tr>
      <td>${s.name}</td>
      <td class="muted">${s.reading()}</td>
      <td class="${s.status === "ok" ? "up" : s.status === "warn" ? "warn" : "down"}">${s.statusText}</td>
      <td>${s.next ? (s.next.toDateString() === today.toDateString() ? "Today" : shortDate(s.next)) : "—"}</td>
      <td>${s.action && s.status !== "ok" ? `<button type="button" class="cancel" data-sys="${i}">${s.action}</button>` : ""}</td>
    </tr>`).join("");
  }
  $("sys-body").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-sys]");
    if (!b) return;
    const s = systems[+b.dataset.sys];
    s.status = "ok"; s.statusText = "Normal";
    if (s.name === "Furnace filter") { s.reading = () => "Installed today"; s.next = daysFrom(90); }
    if (s.name.startsWith("Smoke")) { s.next = daysFrom(365); }
    toast(`${s.name}: ${s.action.replace("Mark ", "marked ")}`);
    renderSystems();
    renderLocks();
  });

  // ---- Header ----
  function renderStatus(openCount) {
    const warn = systems.filter((s) => s.status !== "ok").length;
    const issues = [];
    if (warn) issues.push(`${warn} upkeep item${warn > 1 ? "s" : ""} due`);
    if (alarm !== "Off" && openCount) issues.push(`${openCount} door${openCount > 1 ? "s" : ""} open`);
    const el = $("h-status");
    el.lastChild.textContent = issues.length ? issues.join(", ") : "Everything normal";
    el.classList.toggle("alert", issues.length > 0);
  }
  function renderHeader() {
    $("h-outside").textContent = `${Math.round(outside)}°F`;
    $("h-now").textContent = `${usingNow.toFixed(1)} kW`;
    const total = kwh.reduce((s, v) => s + (v || 0), 0);
    $("h-today").textContent = `${total.toFixed(1)} kWh`;
    $("en-cost").textContent = `About $${(total * RATE).toFixed(2)} so far at $${RATE.toFixed(2)}/kWh`;
  }

  // ---- Shared ----
  let toastTimer;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
  }

  // ---- Simulated readings ----
  function tick() {
    outside += (Math.random() - 0.5) * 0.1;
    for (const z of zones) {
      const act = zoneAction(z);
      const drift = act === "Heating" ? 0.05 : act === "Cooling" ? -0.05 : (outside - z.temp) * 0.002;
      z.temp += drift + (Math.random() - 0.5) * 0.04;
    }
    const lightLoad = lights.reduce((s, l) => s + (l.on ? l.level * 0.0006 : 0), 0);
    const hvacLoad = zones.some((z) => zoneAction(z) !== "Holding" && zoneAction(z) !== "Off") ? 1.2 : 0;
    usingNow = 0.45 + lightLoad + hvacLoad + Math.random() * 0.15;
    kwh[hour] = +(kwh[hour] + usingNow / 3600 * 5).toFixed(3);
    renderZones();
    renderHeader();
    drawEnergy();
  }

  renderZones();
  renderLocks();
  renderLights();
  renderSystems();
  renderHeader();
  drawEnergy();
  setInterval(tick, 5000);
})();
