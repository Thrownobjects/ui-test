// Home overview: no simulated balances, orders, or account connections.
// Uses a same-origin, read-only backend endpoint when available. See INTEGRATIONS.md.
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const metrics = ["metric-pnl","metric-orders","metric-positions","metric-gpus","metric-gpu-load","metric-models","metric-spend"];
  const currency = (n) => new Intl.NumberFormat("en-US", {style:"currency",currency:"USD",maximumFractionDigits:2}).format(n);
  const count = (n) => new Intl.NumberFormat("en-US", {maximumFractionDigits:0}).format(n);
  const finite = (n) => typeof n === "number" && Number.isFinite(n);
  function blank() {
    metrics.forEach((id) => { $(id).textContent = "—"; });
    $("status-alpaca").textContent = "Not connected";
    $("status-robinhood").textContent = "Not connected";
  }
  function brokerStatus(value) {
    return value === "connected" ? "Connected" : value === "error" ? "Connection error" : "Not connected";
  }
  function metric(id, value, formatter=count) {
    if (finite(value)) $(id).textContent = formatter(value);
  }
  async function refresh() {
    const refreshButton = $("refresh");
    refreshButton.disabled = true;
    $("feed-state").textContent = "Checking backend…";
    blank();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      let response;
      try {
        response = await fetch("api/dashboard", {cache:"no-store",credentials:"same-origin",signal:controller.signal,headers:{"Accept":"application/json"}});
      } finally { clearTimeout(timeout); }
      if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) throw new Error("No dashboard API");
      const data = await response.json();
      if (!data || typeof data !== "object" || data.schemaVersion !== 1) throw new Error("Unrecognized API response");
      $("status-alpaca").textContent = brokerStatus(data.brokerages?.alpacaPaper?.status);
      $("status-robinhood").textContent = brokerStatus(data.brokerages?.robinhood?.status);
      metric("metric-pnl", data.trading?.paperDayPnlUsd, currency);
      metric("metric-orders", data.trading?.openOrders);
      metric("metric-positions", data.trading?.positions);
      metric("metric-gpus", data.compute?.gpusOnline);
      metric("metric-gpu-load", data.compute?.gpuUtilizationPct, (n) => n.toFixed(0) + "%");
      metric("metric-models", data.ai?.modelsLoaded);
      metric("metric-spend", data.ai?.monthlyApiSpendUsd, currency);
      $("feed-state").textContent = "Backend responding";
      const serverTime = typeof data.asOf === "string" ? new Date(data.asOf) : null;
      $("last-updated").textContent = serverTime && Number.isFinite(serverTime.getTime())
        ? "Data as of " + serverTime.toLocaleString() : "Backend responded (data timestamp missing)";
    } catch (error) {
      $("feed-state").textContent = "No live backend connected";
      $("last-updated").textContent = "Connect a same-origin dashboard API to show real metrics";
    } finally { refreshButton.disabled = false; }
  }
  $("refresh").addEventListener("click", refresh);
  refresh();
})();
