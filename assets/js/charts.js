/* Gráficos en canvas con exportación PNG (alta resolución) y CSV */
(function (G) {
  'use strict';
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function nice(x) { if (!(x > 0)) return 1; const p = Math.pow(10, Math.floor(Math.log10(x))), n = x / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
  const fmt = v => { const a = Math.abs(v); return a >= 1000 ? (+(v / 1000).toPrecision(3)) + 'k' : +v.toPrecision(3) + ''; };

  // o: {xs, series:[{ys,color,w,dash,side,label,fill,type:'bar'}], xl, yl, yr, xmax, xmin, xstep, ymaxL, ymaxR, yminL, vline, pts:[{x,y,side,color,label,r}], xticks:[{x,label}], title}
  function draw(cv, o, scaleOverride) {
    const dpr = scaleOverride || window.devicePixelRatio || 1;
    const W = cv.clientWidth || 800, H = cv.clientHeight || 360;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    g.fillStyle = css('--surface') || '#fff'; g.fillRect(0, 0, W, H);
    const font = "13px Inter, system-ui, sans-serif", small = "12px Inter, system-ui, sans-serif";
    const hasLegend = o.series.some(s => s.label);
    const Lm = 60, Rm = o.yr ? 62 : 22, Tm = hasLegend ? 40 : 16, Bm = 46, pw = W - Lm - Rm, ph = H - Tm - Bm;
    const xmin = o.xmin ?? 0, xmax = o.xmax ?? (Math.max(...o.xs) || 1);
    const lo = o.yminL || 0, hiL = Math.max(o.ymaxL || 1, lo + 1e-9), stL = nice((hiL - lo) / 5), nd = Math.max(2, Math.ceil((hiL - lo) / stL - 1e-9));
    const yl = { l: lo + nd * stL, r: nice((o.ymaxR || 1) / nd) * nd }, y0 = { l: lo, r: 0 };
    const X = x => Lm + pw * (x - xmin) / (xmax - xmin || 1), Y = (y, s = 'l') => Tm + ph * (1 - (y - y0[s]) / (yl[s] - y0[s]));
    const grid = css('--grid') || '#e8ecf2', axis = css('--axis') || '#8a93a3', mut = css('--muted') || '#5b6475', ink = css('--ink') || '#111';
    g.lineWidth = 1; g.font = small;
    for (let i = 0; i <= nd; i++) {
      const y = Tm + ph * i / nd; g.strokeStyle = grid; g.beginPath(); g.moveTo(Lm, y); g.lineTo(Lm + pw, y); g.stroke();
      g.fillStyle = mut; g.textAlign = 'right'; g.fillText(fmt(+(yl.l - (yl.l - y0.l) * i / nd).toPrecision(6)), Lm - 8, y + 4);
      if (o.yr) { g.textAlign = 'left'; g.fillText(fmt(+(yl.r * (1 - i / nd)).toPrecision(6)), Lm + pw + 8, y + 4); }
    }
    g.textAlign = 'center';
    if (o.xticks) for (const t of o.xticks) { g.strokeStyle = grid; g.beginPath(); g.moveTo(X(t.x), Tm); g.lineTo(X(t.x), Tm + ph); g.stroke(); g.fillStyle = mut; g.fillText(t.label, X(t.x), Tm + ph + 18); }
    else { const xs = o.xstep || nice((xmax - xmin) / 7); for (let x = Math.ceil(xmin / xs) * xs; x <= xmax + 1e-9; x += xs) { g.strokeStyle = grid; g.beginPath(); g.moveTo(X(x), Tm); g.lineTo(X(x), Tm + ph); g.stroke(); g.fillStyle = mut; g.fillText(fmt(+x.toFixed(6)), X(x), Tm + ph + 18); } }
    g.strokeStyle = axis; g.strokeRect(Lm + .5, Tm + .5, pw, ph);
    g.font = font; g.fillStyle = ink; g.fillText(o.xl || '', Lm + pw / 2, H - 8);
    g.save(); g.translate(16, Tm + ph / 2); g.rotate(-Math.PI / 2); g.fillText(o.yl || '', 0, 0); g.restore();
    if (o.yr) { g.save(); g.translate(W - 12, Tm + ph / 2); g.rotate(Math.PI / 2); g.fillText(o.yr, 0, 0); g.restore(); }
    g.save(); g.beginPath(); g.rect(Lm, Tm, pw, ph); g.clip();
    for (const s of o.series) {
      const side = s.side || 'l';
      if (s.type === 'bar') {
        const n = s.ys.length, bw = pw / n * (s.bw || 0.7), off = (s.off || 0) * pw / n;
        g.fillStyle = s.color;
        s.ys.forEach((y, i) => { const x = X(o.xs[i]) - bw / 2 + off, yy = Y(Math.max(0, y), side); g.fillRect(x, yy, bw, Tm + ph - yy); });
        continue;
      }
      g.strokeStyle = s.color; g.lineWidth = s.w || 2.2; g.setLineDash(s.dash || []); g.beginPath();
      s.ys.forEach((y, i) => { const px = X(o.xs[i]), py = Y(s.clip === false ? y : Math.max(y0[side], y), side); i ? g.lineTo(px, py) : g.moveTo(px, py); });
      g.stroke();
      if (s.fill) { g.lineTo(X(o.xs[o.xs.length - 1]), Y(0, side)); g.lineTo(X(o.xs[0]), Y(0, side)); g.closePath(); g.globalAlpha = 0.12; g.fillStyle = s.color; g.fill(); g.globalAlpha = 1; }
    }
    g.setLineDash([]); g.restore();
    if (o.vline != null) { g.strokeStyle = css('--accent'); g.lineWidth = 1.2; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(X(o.vline), Tm); g.lineTo(X(o.vline), Tm + ph); g.stroke(); g.setLineDash([]); }
    for (const p of o.pts || []) {
      const px = X(p.x), py = Y(p.y, p.side || 'l');
      g.fillStyle = p.color; g.strokeStyle = css('--surface'); g.lineWidth = 2; g.beginPath(); g.arc(px, py, p.r || 5.5, 0, 7); g.fill(); g.stroke();
      if (p.label) { g.font = "600 12.5px Inter, system-ui, sans-serif"; const right = px > Lm + pw * 0.7; g.textAlign = right ? 'right' : 'left'; g.fillStyle = ink; g.fillText(p.label, px + (right ? -10 : 10), py - 10); }
    }
    if (hasLegend) {
      g.font = small; let x = Lm; const y = 18;
      for (const s of o.series) {
        if (!s.label) continue;
        g.fillStyle = s.color; g.strokeStyle = s.color;
        if (s.type === 'bar') g.fillRect(x, y - 6, 14, 10);
        else { g.lineWidth = 2.5; g.setLineDash(s.dash || []); g.beginPath(); g.moveTo(x, y - 1); g.lineTo(x + 18, y - 1); g.stroke(); g.setLineDash([]); }
        g.fillStyle = mut; g.textAlign = 'left'; g.fillText(s.label, x + 24, y + 3);
        x += 24 + g.measureText(s.label).width + 22;
      }
    }
    cv._chart = o;
  }

  function exportPNG(cv, name) {
    const o = cv._chart; if (!o) return;
    const c2 = document.createElement('canvas'); c2.style.width = cv.clientWidth + 'px'; c2.style.height = cv.clientHeight + 'px';
    Object.defineProperty(c2, 'clientWidth', { value: cv.clientWidth }); Object.defineProperty(c2, 'clientHeight', { value: cv.clientHeight });
    draw(c2, o, 3);
    const a = document.createElement('a'); a.download = name + '.png'; a.href = c2.toDataURL('image/png'); a.click();
  }
  function exportCSV(cv, name) {
    const o = cv._chart; if (!o) return;
    const head = [o.xl || 'x', ...o.series.map((s, i) => s.label || 'serie ' + (i + 1))];
    const rows = o.xs.map((x, i) => [x, ...o.series.map(s => s.ys[i])].map(v => typeof v === 'number' ? +v.toPrecision(6) : v).join(','));
    const blob = new Blob(['﻿' + head.join(',') + '\n' + rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.download = name + '.csv'; a.href = URL.createObjectURL(blob); a.click();
  }

  G.CHART = { draw, exportPNG, exportCSV, nice };
})(window);
