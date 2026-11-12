// Hyperliquid read-only local proxy + static preview server.
// Run with Node.js 20+: node market-server.mjs
// Binds to 127.0.0.1 and performs no trading, signing, or account lookups.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8787);
const host = "127.0.0.1";
const assets = new Set([
  "index.html", "home-dashboard.js", "nav.js", "styles.css", "charts.js",
  "crypto-trading.html", "crypto-trading.js", "hyperliquid.js",
  "trading-desk.html", "trading-desk.js",
  "gpu.html", "gpu.js", "home-systems.html", "home-systems.js",
  "liquidity.html", "liquidity.js", "treasury.html", "treasury.js",
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
function sendJson(res, status, data) {
  res.writeHead(status, {
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
    "x-content-type-options":"nosniff"
  });
  res.end(JSON.stringify(data));
}
export function createServer() {
  return http.createServer(async (req, res) => {
    if (req.method !== "GET") return sendJson(res, 405, {error:"Method not allowed"});
    const url = new URL(req.url, "http://localhost");
    if (url.pathname === "/api/hyperliquid/markets") {
      try {return sendJson(res, 200, await hyperliquidMarkets());}
      catch {return sendJson(res, 502, {error:"Hyperliquid market data temporarily unavailable"});}
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
