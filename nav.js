// Page switcher shared by every page. Add new pages here.
window.PAGES = [
  ["index.html", "UI Home Dashboard", "Overview of trading, compute, AI, liquidity, treasury and home systems"],
  ["trading-desk.html", "Trading desk", "Watchlist, orders, positions and blotter"],
  ["crypto-trading.html", "Crypto Trading", "Jupiter Solana swaps and Hyperliquid perpetuals (read-only)"],
  ["gpu.html", "Computer and GPUs", "GPU usage, temperatures, controls and processes"],
  ["home-systems.html", "Home systems", "Climate, security, lights, energy and upkeep"],
  ["liquidity.html", "Liquidity pools", "Positions, price ranges, fees and pool stats"],
  ["treasury.html", "Treasury", "Bank cash, crypto by wallet, LP positions, aggregate total and cash-flow demo"],
  ["ai-models.html", "AI models", "API spend and budget, local models, model comparison"],
];
(() => {
  const nav = document.querySelector(".topnav");
  if (!nav) return;
  const here = location.pathname.split("/").pop() || "index.html";
  nav.innerHTML = window.PAGES.map(([href, label]) =>
    `<a href="${href}"${href === here ? ' aria-current="page"' : ""}>${label}</a>`).join("");
})();
