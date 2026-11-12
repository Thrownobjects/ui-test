// Page switcher shared by every page. Add new pages here.
window.PAGES = [
  ["index.html", "Home", "Every page in one place"],
  ["trading-desk.html", "Trading desk", "Watchlist, orders, positions and blotter"],
  ["gpu.html", "Computer and GPUs", "GPU usage, temperatures, controls and processes"],
  ["home-systems.html", "Home systems", "Climate, security, lights, energy and upkeep"],
  ["liquidity.html", "Liquidity pools", "Positions, price ranges, fees and pool stats"],
  ["treasury.html", "Treasury", "Balances, allocation, T-bills, cash flow and runway"],
];
(() => {
  const nav = document.querySelector(".topnav");
  if (!nav) return;
  const here = location.pathname.split("/").pop() || "index.html";
  nav.innerHTML = window.PAGES.map(([href, label]) =>
    `<a href="${href}"${href === here ? ' aria-current="page"' : ""}>${label}</a>`).join("");
})();
