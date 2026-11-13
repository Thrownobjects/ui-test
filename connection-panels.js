// Render verified connector data separately from legacy simulation widgets.
(() => {
  const panel = document.getElementById('connected-data');
  if (!panel) return;
  const button = document.createElement('button');
  button.className = 'overview-refresh'; button.textContent = 'Refresh connections';
  const body = document.createElement('div'); body.setAttribute('aria-live','polite');
  panel.append(button, body);
  const line = text => { const p=document.createElement('p'); p.textContent=text; body.append(p); };
  const money = n => typeof n === 'number' && Number.isFinite(n) ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n) : '—';
  const table = (title, headers, rows) => {
    const h=document.createElement('h3'); h.textContent=title; body.append(h);
    if (!rows.length) {line('None reported by the connected account.'); return;}
    const t=document.createElement('table'); t.className='grid';
    const head=t.createTHead().insertRow(); headers.forEach(v=>{const th=document.createElement('th'); th.textContent=v; head.append(th);});
    const tb=t.createTBody(); rows.forEach(values=>{const row=tb.insertRow(); values.forEach(v=>{row.insertCell().textContent=v ?? '—';});}); body.append(t);
  };
  function renderMetrics(account) {
    for(const [id,value] of [['live-equity',account.currentEquityUsd],['live-cash',account.cashUsd],['live-change',account.equityChangeUsd]]) {
      const el=document.getElementById(id); if(el) el.textContent=money(value);
    }
    const orders=document.getElementById('live-orders'); if(orders) orders.textContent=account.openOrders ?? '—';
    const state=document.getElementById('account-feed-state'); if(state) state.textContent=account.status==='connected' ? 'Paper account connected · 10-second refresh' : 'Paper account unavailable · values cleared';
  }
  async function refresh() {
    if(button.disabled) return;
    button.disabled=true; body.replaceChildren(); line('Checking connections…');
    try {
      const r=await fetch('/api/connections',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(5000)});
      if(!r.ok) throw Error();
      const s=await r.json();
      if(s.schemaVersion!==1 || !s.alpaca || !s.ollama) throw Error();
      body.replaceChildren();
      renderMetrics(s.alpaca);
      line('Alpaca Paper: '+s.alpaca.status+(s.alpaca.message ? ' — '+s.alpaca.message : ''));
      if(s.alpaca.status==='connected') {
        line('Paper equity: '+money(s.alpaca.currentEquityUsd)+' · Cash: '+money(s.alpaca.cashUsd)+' · Buying power: '+money(s.alpaca.buyingPowerUsd));
        line('Equity change since previous close: '+money(s.alpaca.equityChangeUsd)+' (not adjusted for deposits or withdrawals).');
        if(document.body.dataset.connections==='trading') {
          table('Connected paper positions',['Symbol','Quantity','Market value','Unrealized P&L'],s.alpaca.positions.map(p=>[p.symbol,p.quantity,money(p.marketValueUsd),money(p.unrealizedPnlUsd)]));
          table('Connected paper open orders',['Symbol','Side','Quantity','Status'],s.alpaca.orders.map(o=>[o.symbol,o.side,o.quantity,o.status]));
          if(s.alpaca.ordersTruncated) line('Showing the first 500 open orders; total count unavailable.');
        }
      }
      line('Ollama: '+s.ollama.status+(s.ollama.message ? ' — '+s.ollama.message : ''));
      if(s.ollama.status==='connected') line('Loaded models: '+(s.ollama.models.map(m=>m.name).join(', ') || 'None'));
      line('Robinhood: pending supported account integration.');
      line('Bank, wallet, liquidity-pool holdings and GPU telemetry: not connected.');
      line('Snapshot: '+new Date(s.asOf).toLocaleString()+'. Auto-refresh: 10 seconds.');
    } catch {renderMetrics({});body.replaceChildren();line('Connection backend unavailable. Start the local dashboard server and refresh.');}
    finally {button.disabled=false;}
  }
  button.addEventListener('click',refresh); refresh();
  setInterval(() => { if(!document.hidden) refresh(); },10000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden) refresh();});
})();
