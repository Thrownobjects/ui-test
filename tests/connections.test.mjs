import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createConnectors} from '../connectors.mjs';
import {createServer} from '../market-server.mjs';
const env={ALPACA_PAPER_KEY_ID:'test-key',ALPACA_PAPER_SECRET_KEY:'secret-value',OLLAMA_ENABLED:'true'};
function upstream(calls) {return async (url, options) => {
  calls.push({url,options});
  let data;
  if(url.endsWith('/account')) data={equity:'10100',last_equity:'10000',cash:'100',buying_power:'200'};
  else if(url.endsWith('/positions')) data=[{symbol:'IBIT',qty:'100',market_value:'10000',unrealized_pl:'20'}];
  else if(url.includes('/orders?')) data=[{symbol:'IBIT',side:'buy',qty:'100',status:'new'}];
  else if(url.endsWith('/api/ps')) data={models:[{name:'qwen',size:1000}]};
  else throw Error('Unexpected request');
  return {ok:true,json:async()=>data};
};}
test('missing credentials never calls providers or invents zero balances',async()=>{
  const c=createConnectors({env:{},fetchImpl:()=>{throw Error('Must not fetch');}});
  const s=await c.dashboard();
  assert.equal(s.brokerages.alpacaPaper.status,'disconnected');assert.equal(s.trading.positions,null);assert.equal(s.ai.modelsLoaded,null);
});
test('paper reads normalize data, share requests and omit secrets',async()=>{
  const calls=[];const c=createConnectors({env,fetchImpl:upstream(calls)});
  const [s,d]=await Promise.all([c.snapshot(),c.dashboard()]);
  assert.equal(s.alpaca.currentEquityUsd,10100);assert.equal(s.alpaca.positions[0].quantity,100);
  assert.equal(d.trading.equityChangeUsd,100);assert.equal(d.trading.paperDayPnlUsd,null);assert.equal(d.ai.modelsLoaded,1);
  await c.snapshot();assert.equal(calls.length,4);
  for(const {url,options} of calls){assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.ok(url.startsWith('https://paper-api.alpaca.markets/')||url==='http://127.0.0.1:11434/api/ps');}
  assert.ok(!JSON.stringify(s).includes('secret-value'));assert.ok(!JSON.stringify(s).includes('test-key'));
});
test('upstream failures are isolated and messages cannot leak credentials',async()=>{
 const c=createConnectors({env,fetchImpl:async url=>{if(url.includes('alpaca'))throw Error('secret-value');return {ok:true,json:async()=>({models:[]})};}});
 const s=await c.snapshot();assert.equal(s.alpaca.status,'error');assert.equal(s.ollama.status,'connected');assert.ok(!JSON.stringify(s).includes('secret-value'));
});
test('malformed provider data fails closed',async()=>{
 const c=createConnectors({env,fetchImpl:async()=>({ok:true,json:async()=>({})})});
 const s=await c.snapshot();assert.equal(s.alpaca.status,'error');assert.equal(s.ollama.status,'error');
});
test('HTTP routes serve UI and verified data, reject writes, cross-origin and secret files',async t=>{
 const server=createServer({env,fetchImpl:upstream([])});
 // Exercise the actual HTTP listener without opening a socket (restricted runners).
 const handler=server.listeners('request')[0];
 const base='http://127.0.0.1:8787';
 const fetch=async (url,options={})=>{
   let status,headers,body;
   await handler({url:new URL(url).pathname,method:options.method||'GET',headers:{host:'127.0.0.1:8787',...options.headers}},
     {writeHead(s,h){status=s;headers=h;},end(b){body=String(b);}});
   return {status,headers:{get:key=>headers[key]},json:async()=>JSON.parse(body)};
 };
 const dash=await (await fetch(base+'/api/dashboard')).json();assert.equal(dash.brokerages.alpacaPaper.status,'connected');
 const sum=await (await fetch(base+'/api/trading/account-summary')).json();assert.equal(sum.currentEquityUsd,10100);assert.equal(sum.netExternalFlowsUsd,null);
 for(const path of ['/','/trading-desk.html','/ai-models.html','/connection-panels.js']) assert.equal((await fetch(base+path)).status,200);
 for(const path of ['/.env','/connectors.mjs','/api/trading/orders']) assert.equal((await fetch(base+path)).status,404);
 assert.equal((await fetch(base+'/api/connections',{method:'POST'})).status,405);
 assert.equal((await fetch(base+'/api/connections',{headers:{origin:'https://attacker.example'}})).status,403);
 assert.equal((await fetch(base+'/api/connections',{headers:{host:'attacker.example'}})).status,403);
 const r=await fetch(base+'/api/connections');assert.equal(r.headers.get('cache-control'),'no-store');
});
