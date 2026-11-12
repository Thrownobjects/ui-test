// Treasury consolidated holdings. Never invents balances; reads from a future authenticated API.
// Each holding must be counted exactly once: do not also count LP collateral in wallet available balances.
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const money = v => new Intl.NumberFormat("en-US", {style:"currency",currency:"USD"}).format(v);
  const valid = v => typeof v === "number" && Number.isFinite(v) && v >= 0;
  const clear = () => {
    for(const id of ["ct-bank","ct-crypto","ct-lps","ct-total"]) $(id).textContent = "—";
    $("ct-bank-rows").replaceChildren();
    $("ct-wallet-rows").replaceChildren();
    $("ct-lp-rows").replaceChildren();
  };
  function addEmptyRow(body,message,cols) {
    const tr=document.createElement("tr"),td=document.createElement("td");
    td.colSpan=cols;td.textContent=message;td.className="muted";tr.append(td);body.append(tr);
  }
  function populate(body, items, mapper) {
    body.replaceChildren();
    if (!items.length) return addEmptyRow(body,"No verified holdings available.",mapper.length);
    items.forEach(item => {
      const tr=document.createElement("tr");
      mapper.forEach(fn=> {
        const td=document.createElement("td");
        td.textContent=fn(item);
        tr.append(td);
      });
      body.append(tr);
    });
  }
  async function load() {
    const button=$("ct-refresh");
    button.disabled=true; clear();
    $("ct-status").textContent="Checking treasury API…";
    try {
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),6500);
      let res;
      try {res=await fetch("api/treasury",{credentials:"same-origin",cache:"no-store",headers:{"Accept":"application/json"},signal:controller.signal});}
      finally {clearTimeout(timer);}
      if(!res.ok || !(res.headers.get("content-type")||"").includes("application/json")) throw new Error("Not connected");
      const data=await res.json();
      if(data?.schemaVersion!==1 || !Array.isArray(data.bankCash) || !Array.isArray(data.wallets) || !Array.isArray(data.liquidityPools))
        throw new Error("Unexpected treasury data");
      const banks=data.bankCash, wallets=data.wallets, pools=data.liquidityPools;
      const validEntries=(rows,id)=>rows.every(row=>row && typeof row[id]==="string" && valid(row.usdValue));
      if(!validEntries(banks,"account") || !validEntries(wallets,"wallet") || !validEntries(pools,"pool"))
        throw new Error("Incomplete treasury data");
      // The API contract requires non-overlapping holdings to prevent double counting LP deposits.
      const sum=rows=>rows.reduce((n,row)=>n+row.usdValue,0);
      const bank=sum(banks),crypto=sum(wallets),lp=sum(pools),total=bank+crypto+lp;
      $("ct-bank").textContent=money(bank);$("ct-crypto").textContent=money(crypto);
      $("ct-lps").textContent=money(lp);$("ct-total").textContent=money(total);
      populate($("ct-bank-rows"),banks,[a=>a.account,a=>a.institution||"—",a=>money(a.usdValue)]);
      populate($("ct-wallet-rows"),wallets,[w=>w.wallet,w=>w.network||"—",w=>w.assets||"—",w=>money(w.usdValue)]);
      populate($("ct-lp-rows"),pools,[p=>p.pool,p=>p.protocol||"—",p=>p.wallet||"—",p=>money(p.usdValue)]);
      const asOf=new Date(data.asOf);
      $("ct-status").textContent=Number.isFinite(asOf.getTime()) ? "Verified data as of "+asOf.toLocaleString():"Data timestamp unavailable";
    } catch {
      clear();
      addEmptyRow($("ct-bank-rows"),"Bank account data not connected.",3);
      addEmptyRow($("ct-wallet-rows"),"No wallet data connected.",4);
      addEmptyRow($("ct-lp-rows"),"No liquidity-pool data connected.",4);
      $("ct-status").textContent="Not connected — consolidated total unavailable";
    } finally {button.disabled=false;}
  }
  $("ct-refresh").addEventListener("click",load);
  load();
})();
