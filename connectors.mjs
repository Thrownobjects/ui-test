// Server-only, read-only adapters. Credentials never enter browser responses.
const numeric = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
export function createConnectors({env = process.env, fetchImpl = fetch} = {}) {
  let cached, pending;
  async function json(url, headers = {}) {
    const response = await fetchImpl(url, {method:'GET', headers, redirect:'error', signal:AbortSignal.timeout(3500)});
    if (!response.ok) throw new Error('Provider unavailable');
    return response.json();
  }
  async function alpaca() {
    if (!env.ALPACA_PAPER_KEY_ID || !env.ALPACA_PAPER_SECRET_KEY)
      return {status:'disconnected', message:'Set Alpaca paper credentials on the server.'};
    try {
      const headers = {'APCA-API-KEY-ID':env.ALPACA_PAPER_KEY_ID, 'APCA-API-SECRET-KEY':env.ALPACA_PAPER_SECRET_KEY};
      const get = path => json('https://paper-api.alpaca.markets/v2/' + path, headers);
      const [account, positions, orders] = await Promise.all([get('account'), get('positions'), get('orders?status=open&limit=500&nested=false')]);
      if (numeric(account.equity) === null || !Array.isArray(positions) || !Array.isArray(orders)) throw new Error('Invalid account data');
      return {status:'connected', accountType:'alpaca-paper', currentEquityUsd:numeric(account.equity),
        cashUsd:numeric(account.cash), buyingPowerUsd:numeric(account.buying_power),
        // This is equity change, not cash-flow-adjusted profit.
        equityChangeUsd:numeric(account.last_equity) === null ? null : numeric(account.equity)-numeric(account.last_equity),
        openOrders:orders.length < 500 ? orders.length : null, ordersTruncated:orders.length === 500,
        positions:positions.map(p => ({symbol:String(p.symbol || ''), quantity:numeric(p.qty), marketValueUsd:numeric(p.market_value), unrealizedPnlUsd:numeric(p.unrealized_pl)})),
        orders:orders.map(o => ({symbol:String(o.symbol || ''), side:String(o.side || ''), quantity:numeric(o.qty), status:String(o.status || '')}))};
    } catch { return {status:'error', message:'Alpaca paper connection failed. Check server credentials and connectivity.'}; }
  }
  async function ollama() {
    if (env.OLLAMA_ENABLED !== 'true') return {status:'disconnected', message:'Enable local Ollama monitoring on the server.'};
    try {
      const result = await json('http://127.0.0.1:11434/api/ps');
      if (!Array.isArray(result.models)) throw new Error('Invalid model data');
      return {status:'connected', models:result.models.map(m => ({name:String(m.name || m.model || ''), sizeBytes:numeric(m.size)}))};
    } catch {return {status:'error', message:'Local Ollama is unavailable.'};}
  }
  async function snapshot() {
    if (cached && Date.now()-cached.time < 10000) return cached.data;
    if (pending) return pending;
    pending = (async () => {
      const [paper, models] = await Promise.all([alpaca(), ollama()]);
      const data = {schemaVersion:1, asOf:new Date().toISOString(), alpaca:paper, ollama:models};
      cached = {time:Date.now(), data};
      return data;
    })();
    try {return await pending;} finally {pending = null;}
  }
  return {snapshot, async dashboard() {
    const s = await snapshot();
    return {schemaVersion:1, asOf:s.asOf,
      brokerages:{alpacaPaper:{status:s.alpaca.status}, robinhood:{status:'disconnected'}},
      trading:{paperDayPnlUsd:null, equityChangeUsd:s.alpaca.equityChangeUsd ?? null, openOrders:s.alpaca.openOrders ?? null, positions:s.alpaca.positions?.length ?? null},
      ai:{modelsLoaded:s.ollama.models?.length ?? null, monthlyApiSpendUsd:null}, compute:{gpusOnline:null,gpuUtilizationPct:null}};
  }};
}
