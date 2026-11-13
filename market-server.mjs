// Read-only Jupiter + Hyperliquid local API proxy and static preview server.
// Run with Node.js 20+: node market-server.mjs
// Binds to 127.0.0.1 and performs no trading, signing, or account lookups.
import http from "node:http";
import { createConnectors } from "./connectors.mjs";
import { readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8787);
const host = "127.0.0.1";
const assets = new Set([
  "index.html", "home-dashboard.js", "connection-panels.js", "tradingview.js", "trading-controls.js", "nav.js", "styles.css", "charts.js",
  "crypto-trading.html", "crypto-trading.js", "hyperliquid.js",
  "trading-desk.html", "trading-desk.js",
  "gpu.html", "gpu.js", "home-systems.html", "home-systems.js",
  "liquidity.html", "liquidity.js", "treasury.html", "treasury.js", "treasury-overview.js",
  "ai-models.html", "ai-models.js"
]);
const contentTypes = { ".html":"text/html; charset=utf-8", ".js":"application/javascript; charset=utf-8", ".css":"text/css; charset=utf-8" };
let cachedMarkets = null;
let lastFetchMs = 0;
let inFlight = null;

const num = raw => {
  const n = Number(raw);
  return raw == null || raw === "" || !Number.isFinite(n) ? null : n;
};
export function normalizeMarkets(payload) {
  if (!Array.isArray(payload) || !Array.isArray(payload[0]?.universe) || !Array.isArray(payload[1]))
    throw new Error("Unrecognized Hyperliquid market response");
  const universe = payload[0].universe;
  const contexts = payload[1];
  const symbols = new Set(["BTC","ETH","SOL","HYPE","DOGE"]);
  const markets = universe.flatMap((asset, i) => {
    if (!symbols.has(asset.name)) return [];
    const ctx = contexts[i];
    const markPriceUsd = num(ctx?.markPx);
    const funding = num(ctx?.funding);
    const openInterest = num(ctx?.openInterest);
    const volume = num(ctx?.dayNtlVlm);
    if (markPriceUsd === null || markPriceUsd <= 0) return [];
    return [{
      symbol: asset.name,
      markPriceUsd,
      // Funding is an hourly fractional rate in the response.
      fundingRatePctHourly: funding === null ? null : funding * 100,
      openInterestUsd: openInterest === null ? null : openInterest * markPriceUsd,
      volume24hUsd: volume
    }];
  });
  return markets.sort((a,b)=> ["BTC","ETH","SOL","HYPE","DOGE"].indexOf(a.symbol)-["BTC","ETH","SOL","HYPE","DOGE"].indexOf(b.symbol));
}
async function hyperliquidMarkets() {
  if (cachedMarkets && Date.now() - lastFetchMs < 15000) return cachedMarkets;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const response = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: {"content-type":"application/json"},
      body: JSON.stringify({type:"metaAndAssetCtxs"}),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error("Hyperliquid upstream unavailable");
    const payload = await response.json();
    const markets = normalizeMarkets(payload);
    if (markets.length === 0) throw new Error("No requested Hyperliquid markets were returned");
    cachedMarkets = {provider:"Hyperliquid", asOf:new Date().toISOString(), markets};
    lastFetchMs = Date.now();
    return cachedMarkets;
  })();
  try {return await inFlight;} finally {inFlight = null;}
}

// Restrict Jupiter requests to a fixed token allowlist. No wallet address or signing ever sent.
const jupiterMints = Object.freeze({
  SOL: {mint:"So11111111111111111111111111111111111111112",decimals:9},
  USDC:{mint:"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",decimals:6},
  JUP: {mint:"JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",decimals:6}
});
let jupiterPricesCache = null;
let jupiterPricesFetched = 0;
let jupiterQueue = Promise.resolve();
let jupiterLastCall = 0;
function smallestUnits(str, decimals) {
  if (!/^\d{1,9}(?:\.\d{1,9})?$/.test(str)) throw new Error("Invalid amount");
  const [whole, frac=""] = str.split(".");
  if (frac.length > decimals) throw new Error("Too many decimal places");
  const value = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals,"0") || "0");
  if (value <= 0n || value > 1000000000000000000n) throw new Error("Invalid amount");
  return value.toString();
}
function displayUnits(amount, decimals) {
  const n = BigInt(String(amount));
  if (n < 0n) throw new Error("Invalid token units");
  const whole = n / 10n ** BigInt(decimals);
  const frac = (n % 10n ** BigInt(decimals)).toString().padStart(decimals,"0").replace(/0+$/,"");
  return whole.toString() + (frac ? "." + frac : "");
}
function jupiterGet(path) {
  const task = jupiterQueue.then(async () => {
    const delay = Math.max(0, jupiterLastCall + (process.env.JUPITER_API_KEY ? 250 : 2200) - Date.now());
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    jupiterLastCall = Date.now();
    const response = await fetch("https://api.jup.ag" + path, {
      headers: process.env.JUPITER_API_KEY ? {"x-api-key":process.env.JUPITER_API_KEY} : {},
      signal: AbortSignal.timeout(8500)
    });
    if (!response.ok) throw new Error("Jupiter data temporarily unavailable");
    return await response.json();
  });
  jupiterQueue = task.catch(() => {});
  return task;
}
async function jupiterPrices() {
  if (jupiterPricesCache && Date.now() - jupiterPricesFetched < 25000) return jupiterPricesCache;
  const ids = Object.values(jupiterMints).map(t => t.mint).join(",");
  const result = await jupiterGet("/price/v3?ids=" + encodeURIComponent(ids));
  const tokens = {};
  for (const [sym,t] of Object.entries(jupiterMints)) {
    const v = result[t.mint];
    const usdPrice = num(v?.usdPrice);
    const change = num(v?.priceChange24h);
    tokens[sym] = usdPrice === null || usdPrice <= 0
      ? null : {usdPrice,priceChange24h:change};
  }
  jupiterPricesCache = {provider:"Jupiter",asOf:new Date().toISOString(),tokens};
  jupiterPricesFetched = Date.now();
  return jupiterPricesCache;
}
async function jupiterQuote(url) {
  const input = url.searchParams.get("input");
  const output = url.searchParams.get("output");
  const amountUi = url.searchParams.get("amount") || "";
  if (!jupiterMints[input] || !jupiterMints[output] || input === output) {
    throw new RangeError("Choose two different supported tokens");
  }
  let raw;
  try { raw = smallestUnits(amountUi, jupiterMints[input].decimals); }
  catch { throw new RangeError("Enter a valid positive amount"); }
  const params = new URLSearchParams({
    inputMint:jupiterMints[input].mint,
    outputMint:jupiterMints[output].mint,
    amount:raw
  });
  // Without a taker address, Swap V2 /order yields only quote data, not a transaction.
  const order = await jupiterGet("/swap/v2/order?" + params.toString());
  if (typeof order.outAmount !== "string" || !/^\d+$/.test(order.outAmount)) throw new Error("No swap quote available");
  return {
    provider:"Jupiter",
    asOf:new Date().toISOString(),
    inAmountUi:displayUnits(order.inAmount ?? raw,jupiterMints[input].decimals),
    outAmountUi:displayUnits(order.outAmount,jupiterMints[output].decimals),
    router:typeof order.router==="string" ? order.router : "Jupiter Swap V2"
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
    "x-content-type-options":"nosniff"
  });
  res.end(JSON.stringify(data));
}
export function createServer(options = {}) {
  const connectors = createConnectors(options);
  return http.createServer(async (req, res) => {
    // Local-only dashboard: reject DNS rebinding and cross-origin browser requests.
    const expected = `http://${req.headers.host}`;
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '') ||
        (req.headers.origin && req.headers.origin !== expected) ||
        req.headers['sec-fetch-site'] === 'cross-site') return sendJson(res, 403, {error:'Local same-origin access required'});
    if (req.method !== "GET") return sendJson(res, 405, {error:"Method not allowed"});
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === '/api/dashboard') return sendJson(res, 200, await connectors.dashboard());
    if (url.pathname === '/api/connections') return sendJson(res, 200, await connectors.snapshot());
    if (url.pathname === '/api/trading/account-summary') {
      const s = await connectors.snapshot();
      return sendJson(res, s.alpaca.status === 'connected' ? 200 : 503,
        {schemaVersion:1, asOf:s.asOf, ...s.alpaca, baselineEquityUsd:null, netExternalFlowsUsd:null});
    }
    if (url.pathname === "/api/hyperliquid/markets") {
      try {return sendJson(res, 200, await hyperliquidMarkets());}
      catch {return sendJson(res, 502, {error:"Hyperliquid market data temporarily unavailable"});}
    }
    if (url.pathname === "/api/crypto/prices") {
      try { return sendJson(res, 200, await jupiterPrices()); }
      catch { return sendJson(res, 502, {error:"Jupiter price data temporarily unavailable"}); }
    }
    if (url.pathname === "/api/crypto/quote") {
      try { return sendJson(res, 200, await jupiterQuote(url)); }
      catch(e) {
        if (e instanceof RangeError) return sendJson(res, 400, {error:e.message});
        return sendJson(res, 502, {error:"Jupiter quote temporarily unavailable"});
      }
    }
    const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    if (!assets.has(file)) return sendJson(res, 404, {error:"Not found"});
    try {
      const content = await readFile(join(root, file));
      res.writeHead(200, {
        "content-type": contentTypes[extname(file)] || "application/octet-stream",
        "cache-control":"no-store",
        "x-content-type-options":"nosniff"
      });
      res.end(content);
    } catch {sendJson(res, 404, {error:"Not found"});}
  });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  createServer().listen(port, host, () => {
    console.log("Dashboard preview: http://" + host + ":" + port);
  });
}

