// Read-only account-wide P&L preview; automation controls are intentionally disabled.
// The dashboard is not connected to a trusted trading engine.
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const cash = n => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(n);
  const finite = v => typeof v === "number" && Number.isFinite(v);
  async function refresh() {
    $("account-pnl-refresh").disabled=true;
    for (const id of ["account-total-pnl","account-equity","account-starting-equity","account-net-flows"])
      $(id).textContent="—";
    $("account-summary-state").textContent="Checking Alpaca paper account API…";
    try {
      const controller = new AbortController();
      const timer = setTimeout(()=>controller.abort(),6500);
      let response;
      try { response = await fetch("api/trading/account-summary",{cache:"no-store",credentials:"same-origin",headers:{"Accept":"application/json"},signal:controller.signal}); }
      finally { clearTimeout(timer); }
      if(!response.ok || !(response.headers.get("content-type")||"").includes("application/json")) throw new Error("No backend");
      const data=await response.json();
      if(data?.schemaVersion!==1 || data.accountType!=="alpaca-paper" ||
        !finite(data.currentEquityUsd) || !finite(data.baselineEquityUsd) || !finite(data.netExternalFlowsUsd))
          throw new Error("Unverified account data");
      // This period's P&L = equity change minus outside deposits plus outside withdrawals.
      // Must be cash-flow adjusted to avoid confusing deposits with profits.
      const pnl = data.currentEquityUsd-data.baselineEquityUsd-data.netExternalFlowsUsd;
      $("account-total-pnl").textContent=cash(pnl);
      $("account-total-pnl").className=pnl>0?"up":pnl<0?"down":"";
      $("account-equity").textContent=cash(data.currentEquityUsd);
      $("account-starting-equity").textContent=cash(data.baselineEquityUsd);
      $("account-net-flows").textContent=cash(data.netExternalFlowsUsd);
      const date = new Date(data.asOf);
      $("account-summary-state").textContent=Number.isFinite(date.getTime()) ? "Alpaca paper data as of "+date.toLocaleString():"Paper account data loaded; timestamp unavailable";
    } catch {
      $("account-summary-state").textContent="Alpaca paper account not connected; P&L unavailable";
    } finally {
      $("account-pnl-refresh").disabled=false;
    }
  }
  $("account-pnl-refresh").addEventListener("click",refresh);
  refresh();
})();
