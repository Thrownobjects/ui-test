// Small canvas chart helpers shared by the liquidity and treasury pages.
window.Charts = (() => {
  const css = () => getComputedStyle(document.documentElement);
  const color = (n) => (n.startsWith("--") ? css().getPropertyValue(n).trim() : n);

  function setup(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return null;
    canvas.width = w * dpr; canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.font = `12px ${color("--font")}`;
    return { ctx, w, h };
  }

  function gridY(ctx, { x0, x1, y, lo, hi, steps = 4, label, labelX, align = "left" }) {
    ctx.lineWidth = 1;
    ctx.textBaseline = "middle";
    ctx.textAlign = align;
    for (let g = 0; g <= steps; g++) {
      const v = lo + ((hi - lo) * g) / steps, yy = Math.round(y(v)) + 0.5;
      ctx.strokeStyle = color("--line");
      ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke();
      ctx.fillStyle = color("--muted");
      ctx.fillText(label(v), labelX, Math.max(8, Math.min(yy, ctx.canvas.clientHeight - 8)));
    }
    ctx.textAlign = "left";
  }

  // Bars grouped along x. series: [{values, color}] stacked in order.
  function stackedBars(canvas, { labels, series, fmt, labelEvery = 1, highlight = -1 }) {
    const s = setup(canvas);
    if (!s) return;
    const { ctx, w, h } = s;
    const padL = 56, padB = 22, padT = 8;
    const totals = labels.map((_, i) => series.reduce((a, se) => a + (se.values[i] || 0), 0));
    const hi = niceMax(Math.max(...totals, 1));
    const y = (v) => padT + (1 - v / hi) * (h - padT - padB);
    gridY(ctx, { x0: padL, x1: w, y, lo: 0, hi, label: fmt, labelX: padL - 8, align: "right" });
    const bw = (w - padL) / labels.length;
    labels.forEach((lab, i) => {
      let acc = 0;
      for (const se of series) {
        const v = se.values[i] || 0;
        if (!v) continue;
        ctx.fillStyle = color(se.color);
        ctx.globalAlpha = highlight < 0 || highlight === i ? 1 : 0.8;
        ctx.fillRect(padL + i * bw + 2, y(acc + v), Math.max(1, bw - 4), y(acc) - y(acc + v));
        acc += v;
      }
      ctx.globalAlpha = 1;
      if (i % labelEvery === 0) {
        ctx.fillStyle = color("--muted");
        ctx.textBaseline = "alphabetic";
        ctx.textAlign = "center";
        ctx.fillText(lab, padL + i * bw + bw / 2, h - 4);
        ctx.textAlign = "left";
      }
    });
  }

  function niceMax(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }

  return { setup, gridY, stackedBars, niceMax, color };
})();
