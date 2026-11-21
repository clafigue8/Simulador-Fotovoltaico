/* =====================================================================
   Interfaz del simulador
   ===================================================================== */
(function () {
  'use strict';
  const { PV, SOLAR, SYS, SIM, CHART } = window;
  const $ = id => document.getElementById(id);
  let LANG = 'es';
  const L = (es, en) => LANG === 'en' ? en : es;
  const fx = (x, d = 2) => isFinite(x) ? (+x).toLocaleString(LANG === 'en' ? 'en-US' : 'es-HN', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const today = (d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)(new Date());

  const CITIES = {
    tgu: { name: 'Tegucigalpa', lat: 14.0723, lon: -87.1921, alt: 990, Tmin: 17, Tmax: 28 },
    sps: { name: 'San Pedro Sula', lat: 15.5042, lon: -88.025, alt: 60, Tmin: 22, Tmax: 32 },
    cho: { name: 'Choluteca', lat: 13.3007, lon: -87.1908, alt: 50, Tmin: 23, Tmax: 35 },
    lce: { name: 'La Ceiba', lat: 15.7597, lon: -86.7822, alt: 10, Tmin: 22, Tmax: 30 },
    cop: { name: 'Santa Rosa de Copán', lat: 14.7667, lon: -88.7792, alt: 1150, Tmin: 15, Tmax: 26 },
    custom: { name: 'Personalizado', nameEn: 'Custom' }
  };

  /* ---------- Estado ---------- */
  const S = {
    tab: 'home',
    modId: 3,
    customCell: { Isc: 8.21, Voc: 0.607, n: 1.3, Rs: 0.004, Rsh: 12, Ki: 0.0032, Kv: -0.0021 },
    customMod: { rows: 9, cols: 4, groups: 3, noct: 45, A: 0.65 },
    model: { bishop: { on: true, a: 2e-3, m: 3, Vbr: -15 }, schottky: true },
    arr: { Ns: 2, Np: 2, block: true },
    G: [], T: [], bp: [],
    bat: { id: 'lfp24', ns: 1, np: 2, soc0: 0.6 },
    ctl: { mode: 'mppt', eta: 0.97, socMax: 0.98, lvdAuto: true, lvd: 0.2 },
    inv: { id: 'inv2k24', alwaysOn: true },
    load: { P: 300, prof: 'res', pf: 0.95 },
    wires: { pv: { len: 15, awg: '6', mat: 'cu' }, bat: { len: 2, awg: '4', mat: 'cu' }, ac: { len: 30, awg: '12', mat: 'cu' } },
    site: { city: 'tgu', src: 'tmy', lat: 14.0723, lon: -87.1921, tz: -6, alt: 990, date: today, tilt: 15, az: 180, albedo: 0.2, kt: 0.75, Tmin: 17, Tmax: 28, ws: 1.5, tmodel: 'faiman' },
    loss: { soil: 2, mism: 1, iam: true, degr: 0.5, year: 1 },
    po: { start: 0.8, dv: 1.0, steps: 60 },
    sel: { type: 'cell', s: 0, m: 0, c: 0 }, mode: 'select', brush: 300
  };
  let FIT = null;          // ajuste del módulo
  let OP = null;           // punto de operación actual
  let DAY = null, YEAR = null, TMYD = null, curH = 12;

  /* ---------- Módulo seleccionado ---------- */
  function applyModule() {
    if (S.modId === 'custom') {
      S.cell = { ...S.customCell }; S.mod = { rows: S.customMod.rows, cols: S.customMod.cols, groups: S.customMod.groups };
      const N = S.mod.rows * S.mod.cols;
      S.modInfo = { name: L('Módulo personalizado', 'Custom module'), noct: S.customMod.noct, Ncell: N, A: S.customMod.A, custom: true };
      FIT = null;
    } else {
      const m = window.MODULES[S.modId];
      FIT = PV.fitModuleAuto(m);
      S.cell = { ...FIT.cell };
      S.mod = { rows: m.rows, cols: m.cols, groups: m.groups };
      S.modInfo = { name: m.name, noct: m.noct, Ncell: m.Ns, A: m.A, m };
    }
    ensure();
  }
  function rs(a, n, v) { a = a || []; a.length = Math.min(a.length, n); while (a.length < n) a.push(typeof v === 'function' ? v() : v); return a; }
  function ensure() {
    const N = S.mod.rows * S.mod.cols; S.mod.groups = Math.max(1, Math.min(S.mod.groups, N));
    S.G = rs(S.G, S.arr.Np, null); S.T = rs(S.T, S.arr.Np, null); S.bp = rs(S.bp, S.arr.Np, null);
    for (let s = 0; s < S.arr.Np; s++) {
      S.G[s] = rs(S.G[s], S.arr.Ns, null); S.T[s] = rs(S.T[s], S.arr.Ns, null); S.bp[s] = rs(S.bp[s], S.arr.Ns, null);
      for (let m = 0; m < S.arr.Ns; m++) {
        if (!S.G[s][m] || S.G[s][m].length !== N) S.G[s][m] = rs(S.G[s][m] && S.G[s][m].length === N ? S.G[s][m] : [], N, 1000);
        if (!S.T[s][m] || S.T[s][m].length !== N) S.T[s][m] = rs([], N, 25);
        S.bp[s][m] = rs(S.bp[s][m], S.mod.groups, true);
      }
    }
    const q = S.sel; if (q.s >= S.arr.Np) q.s = 0; if (q.m >= S.arr.Ns) q.m = 0; if (q.c >= N) q.c = 0;
  }
  const N = () => S.mod.rows * S.mod.cols;
  const eachMod = f => { for (let s = 0; s < S.arr.Np; s++) for (let m = 0; m < S.arr.Ns; m++) f(s, m); };
  const cellXY = (c, r = S.mod.rows) => { const col = Math.floor(c / r), row = col % 2 === 0 ? c % r : r - 1 - c % r; return [col, row]; };
  const groupOf = c => PV.groupOf(c, N(), S.mod.groups);
  const kWp = () => (S.modId === 'custom' ? 0 : window.MODULES[S.modId].Pstc) * S.arr.Ns * S.arr.Np / 1000;

  /* ---------- Cálculo del punto de operación actual ---------- */
  function compute() {
    const cfg = SIM.arrayCfg(S, S.G, S.T);
    const cv = PV.arrayCurve(cfg, { NI: 220, NV: 360 }), mt = PV.metrics(cv);
    const C = SIM.components(S);
    let po = null;
    if (cv) po = PV.perturbObserve(cv, S.po.start * mt.Voc, S.po.dv, S.po.steps);
    const st = { soc: S.bat.soc0, Vprev: po ? po.V : 0 };
    const r = SIM.step(S, C, cv, mt, st, S.load.P, 1 / 60, 25);
    if (S.ctl.mode === 'po' && po) { r.Vop = po.V; }
    const cells = cv && r.Vop > 0 ? PV.cellStates(cfg, cv, r.Vop) : [];
    OP = { cfg, cv, mt, po, r, C, cells };
    return OP;
  }

  /* ======================= Navegación ======================= */
  const TABS = [
    ['home', 'Inicio', 'Home'], ['gen', 'Generador FV', 'PV generator'], ['iv', 'Curvas y MPPT', 'Curves & MPPT'], ['site', 'Sitio y clima', 'Site & weather'],
    ['bat', 'Baterías', 'Batteries'], ['conv', 'Conversión y distribución', 'Conversion & distribution'], ['grid', 'Red eléctrica', 'Power grid'],
    ['sim', 'Simulación', 'Simulation'], ['about', 'Metodología', 'Methodology'], ['install', 'Normativa e instalación', 'Regulations & installation']
  ];
  function renderTabs() {
    $('tabs').innerHTML = TABS.map(([k, es, en], i) => `<button class="tab ${S.tab === k ? 'on' : ''}" data-tab="${k}"><span class="n">${i + 1}</span>${L(es, en)}</button>`).join('');
    $('tabs').querySelectorAll('.tab').forEach(b => b.onclick = () => go(b.dataset.tab));
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('on', p.id === 'p-' + S.tab));
    document.querySelector('.summary').style.display = S.tab === 'home' || S.tab === 'grid' || S.tab === 'install' ? 'none' : '';
  }
  function go(tab) { S.tab = tab; try { history.replaceState(null, '', '#' + tab + (LANG === 'en' ? '?lang=en' : '')); } catch (e) { } renderTabs(); renderPage(); window.scrollTo({ top: 0 }); }

  function renderSummary() {
    const C = SIM.components(S), bm = C.bm;
    const mname = S.modId === 'custom' ? L('Personalizado', 'Custom') : window.MODULES[S.modId].name.replace(/ Inc\.| Co\., Ltd\.|Green Energy Technology/g, '');
    $('summary').innerHTML = [
      [L('Módulo', 'Module'), `${esc(mname)}`],
      [L('Arreglo', 'Array'), `${S.arr.Ns}S × ${S.arr.Np}P${kWp() ? ` · ${fx(kWp(), 2)} kWp` : ''}`],
      [L('Banco', 'Bank'), `${fx(bm.Vn, 1)} V · ${fx(bm.Q, 0)} Ah · ${fx(bm.Ecap, 1)} kWh`],
      [L('Inversor', 'Inverter'), C.inv.id === 'none' ? L('ninguno', 'none') : `${fx(C.inv.P / 1000, 1)} kW`],
      [L('Sitio', 'Site'), S.site.city === 'custom' ? L('personalizado', 'custom') : CITIES[S.site.city].name]
    ].map(([a, b]) => `<span>${a}: <b>${b}</b></span>`).join('');
  }

  /* ======================= Utilidades de formularios ======================= */
  const get = p => p.split('.').reduce((o, k) => o[k], S);
  const set = (p, v) => { const k = p.split('.'), l = k.pop(); k.reduce((o, x) => o[x], S)[l] = v; };
  function F(label, path, min, max, step, unit = '', help = '') {
    const v = get(path);
    return `<div class="field"><label for="f-${path}">${label}${unit ? ` <span style="color:var(--muted)">(${unit})</span>` : ''}${help ? `<small>${help}</small>` : ''}</label><input id="f-${path}" type="number" data-p="${path}" value="${+(+v).toPrecision(6)}" min="${min}" max="${max}" step="${step}"></div>`;
  }
  function Sel(label, path, opts, help = '') {
    const v = String(get(path));
    return `<div class="field"><label for="f-${path}">${label}${help ? `<small>${help}</small>` : ''}</label><select id="f-${path}" data-p="${path}">${opts.map(([k, t]) => `<option value="${k}" ${String(k) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`;
  }
  function Sw(label, path, help = '') { return `<label class="switch"><input type="checkbox" data-p="${path}" ${get(path) ? 'checked' : ''}><span>${label}${help ? `<br><small style="color:var(--muted)">${help}</small>` : ''}</span></label>`; }
  function bindFields(root, after) {
    root.querySelectorAll('[data-p]').forEach(el => el.addEventListener('change', () => {
      const p = el.dataset.p; let v;
      if (el.type === 'checkbox') v = el.checked;
      else if (el.tagName === 'SELECT') { v = el.value; if (v === 'true' || v === 'false') v = v === 'true'; else if (/^-?\d+(\.\d+)?$/.test(v) && typeof get(p) === 'number') v = +v; }
      else { v = parseFloat(el.value); if (!isFinite(v)) return; if (el.step === '1') v = Math.round(v); v = Math.min(+el.max, Math.max(+el.min, v)); el.value = v; }
      set(p, v); (after || refresh)(p);
    }));
  }
  const kpi = (label, val, unit = '', cls = '') => `<div class="kpi ${cls}"><small>${label}</small><b>${val}${unit ? `<span>${unit}</span>` : ''}</b></div>`;
  const chartBox = (id, h, name) => `<div class="chart"><canvas id="${id}" class="${h}"></canvas></div><div class="btns" style="margin-top:10px;justify-content:flex-end"><button class="btn sm" data-png="${id}" data-name="${name}">PNG</button><button class="btn sm" data-csv="${id}" data-name="${name}">CSV</button></div>`;
  function bindExports(root) {
    root.querySelectorAll('[data-png]').forEach(b => b.onclick = () => CHART.exportPNG($(b.dataset.png), b.dataset.name));
    root.querySelectorAll('[data-csv]').forEach(b => b.onclick = () => CHART.exportCSV($(b.dataset.csv), b.dataset.name));
  }

  /* ======================= Página 1: Generador FV ======================= */
  function gColor(G) { const t = Math.max(0, Math.min(1, G / 1000)); const a = [217, 212, 199], b = [24, 44, 84]; return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`; }
  function drawSch() {
    const { rows, cols, groups } = S.mod, { Ns, Np } = S.arr, n = N();
    const cs = Math.max(10, Math.min(18, Math.floor(170 / cols))), hdr = 26, pad = 10;
    const mw = Math.max(cols * cs + pad * 2, groups * 25 + 80), cx0 = (mw - cols * cs) / 2, mh = rows * cs + hdr + pad, gapS = 56, gapM = 18, top = 36;
    const W = Np * (mw + gapS) + 100, H = top + Ns * (mh + gapM) + 34;
    const hot = new Set((OP && OP.cells || []).filter(x => x.V < -0.5).map(x => `${x.s}.${x.m}.${x.c}`));
    let h = `<svg id="sch" xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${L('Esquema del arreglo', 'Array schematic')}">`;
    const busX = Np * (mw + gapS) + 24;
    h += `<line x1="${gapS / 2}" y1="16" x2="${busX}" y2="16" stroke="#b4283c" stroke-width="2.4"/><text x="${busX + 8}" y="20" font-size="13" fill="#b4283c" font-weight="600">(+)</text>`;
    h += `<line x1="${gapS / 2}" y1="${H - 12}" x2="${busX}" y2="${H - 12}" stroke="#334" stroke-width="2.4"/><text x="${busX + 8}" y="${H - 8}" font-size="13" fill="#334" font-weight="600">(−)</text>`;
    const q = S.sel;
    for (let s = 0; s < Np; s++) {
      const x0 = gapS / 2 + s * (mw + gapS), cx = x0 + mw / 2, sOn = q.type === 'str' && q.s === s;
      h += `<line x1="${cx}" y1="16" x2="${cx}" y2="${H - 12}" stroke="#8a93a3" stroke-width="1.6"/>`;
      if (S.arr.block) h += `<g transform="translate(${cx},25)"><polygon points="-6,5 6,5 0,-4" fill="#334"/><line x1="-7" y1="-4.5" x2="7" y2="-4.5" stroke="#334" stroke-width="1.8"/></g>`;
      h += `<text x="${x0}" y="${top - 4}" font-size="13" fill="${sOn ? '#b4283c' : '#5d6b80'}" data-t="str" data-s="${s}" style="cursor:pointer;font-weight:650">String ${s + 1}</text>`;
      for (let m = 0; m < Ns; m++) {
        const y0 = top + 4 + m * (mh + gapM), mOn = q.type === 'mod' && q.s === s && q.m === m;
        h += `<rect x="${x0}" y="${y0}" width="${mw}" height="${mh}" rx="5" fill="#fff" stroke="${mOn ? '#b4283c' : '#c3cad6'}" stroke-width="${mOn ? 2.2 : 1.2}"/>`;
        h += `<text x="${x0 + 8}" y="${y0 + 17}" font-size="12.5" font-weight="650" fill="#1d3b6e" data-t="mod" data-s="${s}" data-m="${m}" style="cursor:pointer">U2·${s + 1}.${m + 1}</text>`;
        for (let g = 0; g < groups; g++) {
          const on = S.bp[s][m][g], bx = x0 + mw - 8 - (groups - g) * 25;
          h += `<g data-t="bp" data-s="${s}" data-m="${m}" data-g="${g}" style="cursor:pointer"><rect data-t="bp" data-s="${s}" data-m="${m}" data-g="${g}" x="${bx}" y="${y0 + 5}" width="22" height="15" rx="3" fill="${on ? '#c98a1b' : '#fff'}" stroke="#c98a1b"/><text data-t="bp" data-s="${s}" data-m="${m}" data-g="${g}" x="${bx + 11}" y="${y0 + 16}" font-size="10" font-weight="600" text-anchor="middle" fill="${on ? '#fff' : '#c98a1b'}">D${g + 1}</text></g>`;
        }
        const selG = (q.type === 'cell' && q.s === s && q.m === m) ? groupOf(q.c) : -1;
        for (let c = 0; c < n; c++) {
          const [col, row] = cellXY(c), G = S.G[s][m][c];
          const sel = q.type === 'cell' && q.s === s && q.m === m && q.c === c, inG = groupOf(c) === selG, ht = hot.has(`${s}.${m}.${c}`);
          h += `<rect data-t="cell" data-s="${s}" data-m="${m}" data-c="${c}" x="${x0 + cx0 + col * cs + .5}" y="${y0 + hdr + row * cs + .5}" width="${cs - 1}" height="${cs - 1}" rx="1.5" fill="${gColor(G)}" stroke="${sel ? '#e3a63c' : ht ? '#e53950' : inG ? '#c98a1b' : '#fff'}" stroke-width="${sel ? 2.4 : ht ? 2 : inG ? 1.2 : .6}" style="cursor:pointer"/>`;
        }
      }
    }
    h += '</svg>';
    const w = $('schWrap'); if (!w) return; w.innerHTML = h; bindSch();
  }
  let painting = false;
  function bindSch() {
    const sv = $('sch'); if (!sv) return; sv.style.touchAction = S.mode === 'paint' ? 'none' : 'auto';
    const paintAt = el => {
      if (!el || el.dataset.t !== 'cell') return; const s = +el.dataset.s, m = +el.dataset.m, c = +el.dataset.c;
      if (S.G[s][m][c] !== S.brush) { S.G[s][m][c] = S.brush; el.setAttribute('fill', gColor(S.brush)); }
    };
    sv.addEventListener('pointerdown', e => {
      const t = e.target.dataset; if (!t.t) return;
      if (S.mode === 'paint' && t.t === 'cell') { painting = true; paintAt(e.target); e.preventDefault(); return; }
      if (t.t === 'bp') { S.bp[+t.s][+t.m][+t.g] = !S.bp[+t.s][+t.m][+t.g]; S.sel = { type: 'mod', s: +t.s, m: +t.m, c: 0 }; }
      else if (t.t === 'cell') S.sel = { type: 'cell', s: +t.s, m: +t.m, c: +t.c };
      else if (t.t === 'mod') S.sel = { type: 'mod', s: +t.s, m: +t.m, c: 0 };
      else if (t.t === 'str') S.sel = { type: 'str', s: +t.s, m: 0, c: 0 };
      refresh();
    });
    sv.addEventListener('pointermove', e => { if (painting) paintAt(document.elementFromPoint(e.clientX, e.clientY)); });
  }
  window.addEventListener('pointerup', () => { if (painting) { painting = false; refresh(); } });

  function pageGen() {
    const n = N();
    const step = (k, label, val, max, min = 1) => `<div class="step"><span>${label}</span><div class="ctl"><button data-k="${k}" data-d="-1" ${val <= min ? 'disabled' : ''} aria-label="${L('Quitar', 'Remove')} ${label}">−</button><b>${val}</b><button data-k="${k}" data-d="1" ${val >= max ? 'disabled' : ''} aria-label="${L('Agregar', 'Add')} ${label}">+</button></div></div>`;
    const custom = S.modId === 'custom';
    $('p-gen').innerHTML = `
      <div class="intro"><h2>${L('Generador fotovoltaico', 'PV generator')}</h2><p>${L('Elige un módulo comercial o define uno propio, arma el arreglo en serie y paralelo y aplica sombras celda por celda. Las celdas con borde rojo trabajan en polarización inversa (punto caliente).', 'Pick a commercial module or define your own, build the series–parallel array and apply shading cell by cell. Cells outlined in red operate in reverse bias (hot spot).')}</p></div>
      <div class="grid g-main">
        <div class="card">
          <div class="chead"><div><h3>${L('Esquema del arreglo', 'Array schematic')}</h3><p class="sub">${L('Toca una celda para editarla; las insignias D1…Dn activan o desactivan el diodo bypass.', 'Tap a cell to edit it; the D1…Dn badges toggle each bypass diode.')}</p></div></div>
          <div class="toolbar">
            <div class="seg"><button data-mode="select" class="${S.mode === 'select' ? 'on' : ''}">${L('Seleccionar', 'Select')}</button><button data-mode="paint" class="${S.mode === 'paint' ? 'on' : ''}">${L('Pintar sombra', 'Paint shade')}</button></div>
            <span id="brushBox" style="display:${S.mode === 'paint' ? 'inline-flex' : 'none'};align-items:center;gap:8px;font-size:14px">G <input type="range" id="brush" min="0" max="1000" step="50" value="${S.brush}" style="width:120px"><b style="font-family:var(--mono)" id="brushV">${S.brush}</b> W/m²</span>
          </div>
          <div class="btns" style="margin-bottom:14px">
            <button class="btn sm" data-preset="clear">${L('Sin sombra', 'No shade')}</button>
            <button class="btn sm" data-preset="one">${L('Sombra en 1 celda', 'Shade 1 cell')}</button>
            <button class="btn sm" data-preset="edge">${L('Sombra lateral', 'Edge shade')}</button>
            <button class="btn sm" data-preset="row">${L('Fila inferior (suciedad)', 'Bottom row (soiling)')}</button>
            <button class="btn sm" data-preset="rand">${L('Aleatoria', 'Random')}</button>
            <button class="btn sm" data-preset="bpOn">${L('Bypass: todos', 'Bypass: all')}</button>
            <button class="btn sm" data-preset="bpOff">${L('Bypass: ninguno', 'Bypass: none')}</button>
          </div>
          <div class="sizebar" id="sizebar" data-key="${[S.arr.Ns, S.arr.Np, S.mod.rows, S.mod.cols, S.mod.groups, S.modId].join(',')}">
            ${step('Ns', L('Módulos en serie', 'Modules in series'), S.arr.Ns, 8)}
            ${step('Np', L('Strings en paralelo', 'Parallel strings'), S.arr.Np, 6)}
            ${custom ? step('rows', L('Filas de celdas', 'Cell rows'), S.mod.rows, 16) + step('cols', L('Columnas', 'Columns'), S.mod.cols, 10) + step('groups', L('Grupos bypass', 'Bypass groups'), S.mod.groups, Math.min(6, n)) : ''}
            <span style="margin-left:auto;font-size:13.5px;color:var(--muted)">${L('Celdas por módulo', 'Cells per module')} <b style="color:var(--ink);font-family:var(--mono)">${n}</b> · ${L('total', 'total')} <b style="color:var(--ink);font-family:var(--mono)">${n * S.arr.Ns * S.arr.Np}</b></span>
          </div>
          <div class="schwrap" id="schWrap"></div>
          <div class="legend-g"><span>0 W/m²</span><span class="bar"></span><span>1000 W/m²</span><span style="margin-left:14px;display:inline-flex;align-items:center;gap:6px"><i style="width:12px;height:12px;border:2px solid #e53950;border-radius:2px;display:inline-block"></i>${L('celda en polarización inversa', 'cell in reverse bias')}</span></div>
          <div class="blocks">
            <button class="blk" data-go="iv"><b>${L('Curvas y MPPT', 'Curves & MPPT')}</b><span id="bIV"></span></button>
            <button class="blk" data-go="bat"><b>${L('Banco de baterías', 'Battery bank')}</b><span id="bBat"></span></button>
            <button class="blk" data-go="conv"><b>${L('Inversor y carga', 'Inverter & load')}</b><span id="bInv"></span></button>
            <button class="blk" data-go="sim"><b>${L('Simulación', 'Simulation')}</b><span>${L('Día y año con datos reales', 'Day and year with real data')}</span></button>
          </div>
        </div>
        <div class="stack">
          <div class="card" id="modCard"></div>
          <div class="card" id="insp"></div>
        </div>
      </div>`;
    const P = $('p-gen');
    P.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => { S.mode = b.dataset.mode; pageGen(); });
    const br = $('brush'); if (br) br.oninput = e => { S.brush = +e.target.value; $('brushV').textContent = S.brush; };
    P.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => preset(b.dataset.preset));
    P.querySelectorAll('#sizebar button').forEach(b => b.onclick = () => {
      const k = b.dataset.k, d = +b.dataset.d;
      if (k === 'Ns') S.arr.Ns = Math.max(1, Math.min(8, S.arr.Ns + d));
      else if (k === 'Np') S.arr.Np = Math.max(1, Math.min(6, S.arr.Np + d));
      else if (k === 'rows' || k === 'cols') { resizeCustom(k === 'rows' ? S.mod.rows + d : S.mod.rows, k === 'cols' ? S.mod.cols + d : S.mod.cols); }
      else if (k === 'groups') { S.customMod.groups = S.mod.groups = Math.max(1, Math.min(6, n, S.mod.groups + d)); }
      ensure(); refresh();
    });
    P.querySelectorAll('[data-go]').forEach(b => b.onclick = () => go(b.dataset.go));
    renderModCard(); renderInsp(); drawSch(); renderBlocks();
  }
  function refreshSizebar() {
    const sb = $('sizebar'); if (!sb) return;
    const key = [S.arr.Ns, S.arr.Np, S.mod.rows, S.mod.cols, S.mod.groups, S.modId].join(',');
    if (sb.dataset.key && sb.dataset.key !== key) { const y = window.scrollY; pageGen(); window.scrollTo(0, y); return; }
    sb.dataset.key = key;
  }
  function resizeCustom(rows, cols) {
    rows = Math.max(1, Math.min(16, rows)); cols = Math.max(1, Math.min(10, cols));
    const or = S.mod.rows;
    const remap = (arr, def) => { const g = new Map(); arr.forEach((v, c) => { const [col, row] = cellXY(c, or); g.set(col + ',' + row, v); }); const out = []; for (let c = 0; c < rows * cols; c++) { const [col, row] = cellXY(c, rows); out.push(g.has(col + ',' + row) ? g.get(col + ',' + row) : def); } return out; };
    eachMod((s, m) => { S.G[s][m] = remap(S.G[s][m], 1000); S.T[s][m] = remap(S.T[s][m], 25); });
    S.customMod.rows = S.mod.rows = rows; S.customMod.cols = S.mod.cols = cols;
  }
  function preset(p) {
    const n = N();
    if (['clear', 'one', 'edge', 'row', 'rand'].includes(p)) eachMod((s, m) => S.G[s][m].fill(1000));
    if (p === 'one') S.G[0][0][Math.floor(n / 2)] = 200;
    if (p === 'edge') for (let m = 0; m < S.arr.Ns; m++) for (let c = 0; c < n; c++) { if (cellXY(c)[0] === 0) S.G[0][m][c] = 250; }
    if (p === 'row') eachMod((s, m) => { for (let c = 0; c < n; c++) if (cellXY(c)[1] === S.mod.rows - 1) S.G[s][m][c] = 500; });
    if (p === 'rand') eachMod((s, m) => { for (let c = 0; c < n; c++) S.G[s][m][c] = Math.random() < 0.12 ? Math.round(Math.random() * 6) * 100 : 1000; });
    if (p === 'bpOn') eachMod((s, m) => S.bp[s][m].fill(true));
    if (p === 'bpOff') eachMod((s, m) => S.bp[s][m].fill(false));
    refresh();
  }
  function renderModCard() {
    const el = $('modCard'); if (!el) return;
    const opts = window.MODULES.map((m, i) => [i, `${m.name.replace('Co., Ltd.', '').replace('Inc.', '')} · ${m.Pstc.toFixed(0)} W`]);
    let h = `<h3>${L('Módulo fotovoltaico', 'PV module')}</h3><p class="sub">${L('Datos de hoja técnica (base de datos CEC). Los parámetros del modelo se ajustan automáticamente.', 'Datasheet values (CEC database). Model parameters are fitted automatically.')}</p>
      <select class="sel" id="modSel">${opts.map(([k, t]) => `<option value="${k}" ${S.modId === k ? 'selected' : ''}>${esc(t)}</option>`).join('')}<option value="custom" ${S.modId === 'custom' ? 'selected' : ''}>${L('Personalizado (celda genérica)', 'Custom (generic cell)')}</option></select>`;
    if (S.modId !== 'custom') {
      const m = window.MODULES[S.modId];
      h += `<h4 style="margin-top:18px">${L('Hoja técnica (STC)', 'Datasheet (STC)')}</h4>
      <div class="kv"><span>P<sub>max</sub></span><span>${fx(m.Pstc, 1)} W</span><span>V<sub>mp</sub> / I<sub>mp</sub></span><span>${fx(m.Vmp, 2)} V / ${fx(m.Imp, 2)} A</span><span>V<sub>oc</sub> / I<sub>sc</sub></span><span>${fx(m.Voc, 2)} V / ${fx(m.Isc, 2)} A</span><span>${L('Celdas', 'Cells')} · ${L('tecnología', 'technology')}</span><span>${m.Ns} · ${m.tech}</span><span>α<sub>Isc</sub> / β<sub>Voc</sub></span><span>${fx(m.aI * 1000, 2)} mA/K / ${fx(m.bV * 1000, 0)} mV/K</span><span>NOCT · ${L('área', 'area')}</span><span>${fx(m.noct, 1)} °C · ${fx(m.A, 2)} m²</span></div>
      <h4>${L('Parámetros ajustados (Villalva)', 'Fitted parameters (Villalva)')}</h4>
      <div class="kv"><span>${L('Factor de idealidad', 'Ideality factor')} n</span><span>${fx(FIT.n, 2)}</span><span>R<sub>s</sub> ${L('módulo', 'module')}</span><span>${fx(FIT.Rs, 3)} Ω</span><span>R<sub>sh</sub> ${L('módulo', 'module')}</span><span>${FIT.Rsh > 1e4 ? fx(FIT.Rsh / 1000, 1) + ' kΩ' : fx(FIT.Rsh, 0) + ' Ω'}</span><span>I<sub>ph</sub> / I<sub>0</sub></span><span>${fx(FIT.Iph, 3)} A / ${FIT.I0.toExponential(2)} A</span></div>
      <button class="btn sm" style="margin-top:14px" data-go2="iv">${L('Ver validación contra la hoja técnica →', 'See validation against datasheet →')}</button>`;
    } else {
      h += `<h4 style="margin-top:18px">${L('Parámetros de la celda (STC)', 'Cell parameters (STC)')}</h4>
      ${F('I<sub>sc</sub>', 'customCell.Isc', 0.1, 20, 0.01, 'A')}${F('V<sub>oc</sub>', 'customCell.Voc', 0.3, 0.9, 0.001, 'V')}${F(L('Factor de idealidad n', 'Ideality factor n'), 'customCell.n', 0.8, 2, 0.01)}${F('R<sub>s</sub>', 'customCell.Rs', 0, 0.1, 0.001, 'Ω')}${F('R<sub>sh</sub>', 'customCell.Rsh', 0.5, 1000, 0.5, 'Ω')}${F('α<sub>Isc</sub>', 'customCell.Ki', 0, 0.01, 0.0001, 'A/K')}${F('β<sub>Voc</sub>', 'customCell.Kv', -0.005, 0, 0.0001, 'V/K')}${F('NOCT', 'customMod.noct', 35, 55, 0.5, '°C')}${F(L('Área del módulo', 'Module area'), 'customMod.A', 0.05, 3, 0.01, 'm²')}`;
    }
    el.innerHTML = h;
    $('modSel').onchange = e => { S.modId = e.target.value === 'custom' ? 'custom' : +e.target.value; S.G = []; S.T = []; S.bp = []; applyModule(); S.sel = { type: 'cell', s: 0, m: 0, c: 0 }; refresh(); pageGen(); };
    el.querySelectorAll('[data-go2]').forEach(b => b.onclick = () => go(b.dataset.go2));
    bindFields(el, () => { applyModule(); refresh(); });
  }
  function renderInsp() {
    const el = $('insp'); if (!el) return;
    const q = S.sel; let h = '';
    const cs = OP && OP.cells || [];
    if (q.type === 'cell') {
      const G = S.G[q.s][q.m][q.c], T = S.T[q.s][q.m][q.c], st = cs.find(x => x.s === q.s && x.m === q.m && x.c === q.c);
      const Acell = S.modInfo.A / S.modInfo.Ncell * 0.92;
      const dT = st && st.P < 0 ? -st.P / (Acell * 30) : 0;
      h = `<h3>${L('Celda', 'Cell')} U1 · ${q.s + 1}.${q.m + 1}.${q.c + 1}</h3><p class="sub">${L(`Grupo de bypass D${groupOf(q.c) + 1} del módulo ${q.s + 1}.${q.m + 1}.`, `Bypass group D${groupOf(q.c) + 1} of module ${q.s + 1}.${q.m + 1}.`)}</p>
        <div class="field"><label>${L('Irradiancia', 'Irradiance')} G <span style="color:var(--muted)">(W/m²)</span></label><input type="number" id="cG" value="${G}" min="0" max="1200" step="10"></div>
        <input type="range" id="cGr" min="0" max="1200" step="10" value="${G}" style="margin:6px 0 4px">
        <div class="field"><label>${L('Temperatura', 'Temperature')} T <span style="color:var(--muted)">(°C)</span></label><input type="number" id="cT" value="${T}" min="-10" max="90" step="1"></div>
        <div class="btns" style="margin:10px 0 4px"><button class="btn sm" id="cAllMod">${L('Aplicar al módulo', 'Apply to module')}</button><button class="btn sm" id="cAll">${L('Aplicar a todas', 'Apply to all')}</button></div>
        <h4>${L('En el punto de operación', 'At the operating point')}</h4>
        ${st ? `<div class="kv"><span>${L('Corriente de la celda', 'Cell current')}</span><span>${fx(st.I, 3)} A</span><span>${L('Voltaje de la celda', 'Cell voltage')}</span><span style="color:${st.V < 0 ? 'var(--bad)' : 'inherit'}">${fx(st.V, 3)} V</span><span>${st.P >= 0 ? L('Potencia generada', 'Power generated') : L('Potencia disipada', 'Power dissipated')}</span><span>${fx(Math.abs(st.P), 2)} W</span>${st.Ib > 0 ? `<span>${L('Corriente por el bypass', 'Bypass current')}</span><span>${fx(st.Ib, 2)} A</span>` : ''}</div>
          ${st.V < -0.5 ? `<div class="alert bad"><b>${L('Punto caliente', 'Hot spot')}:</b> ${L(`la celda está en polarización inversa y disipa ${fx(-st.P, 1)} W. Calentamiento estimado ≈ +${fx(dT, 0)} °C sobre las demás celdas.`, `the cell is reverse-biased and dissipates ${fx(-st.P, 1)} W. Estimated heating ≈ +${fx(dT, 0)} °C above the other cells.`)}</div>` : ''}` : `<p class="note">${L('Sin generación en esta condición.', 'No generation in this condition.')}</p>`}`;
    } else if (q.type === 'mod') {
      const sh = S.G[q.s][q.m].filter(g => g < 1000).length;
      const bpI = cs.filter(x => x.s === q.s && x.m === q.m && x.Ib > 0);
      const gset = [...new Set(bpI.map(x => x.g))];
      h = `<h3>${L('Módulo', 'Module')} U2 · ${q.s + 1}.${q.m + 1}</h3><p class="sub">${esc(S.modInfo.name)}</p>
        <div class="kv"><span>${L('Celdas en serie', 'Cells in series')}</span><span>${N()}</span><span>${L('Celdas con sombra', 'Shaded cells')}</span><span>${sh}</span><span>${L('Bypass activos', 'Active bypass')}</span><span>${S.bp[q.s][q.m].filter(x => x).length}/${S.mod.groups}</span><span>${L('Bypass conduciendo', 'Bypass conducting')}</span><span>${gset.length ? gset.map(g => 'D' + (g + 1)).join(', ') : L('ninguno', 'none')}</span></div>
        ${gset.map(g => { const x = bpI.find(y => y.g === g); return `<p class="note">D${g + 1}: ${fx(x.Ib, 2)} A · ${fx(x.Pbp, 2)} W ${L('disipados', 'dissipated')}</p>`; }).join('')}
        <h4>${L('Diodos bypass', 'Bypass diodes')}</h4><div class="btns">${S.bp[q.s][q.m].map((on, g) => `<button data-bpg="${g}" class="btn sm ${on ? 'on' : ''}">D${g + 1} ${on ? L('activo', 'on') : L('inactivo', 'off')}</button>`).join('')}</div>
        <h4>${L('Sombra del módulo', 'Module shading')}</h4><div class="btns"><button class="btn sm" id="mClear">${L('Quitar sombra', 'Clear shade')}</button><button class="btn sm" id="mHalf">${L('50 % al módulo', '50 % on module')}</button></div>`;
    } else {
      const sI = OP && OP.cv ? OP.cv.Istr[q.s] : null;
      h = `<h3>String ${q.s + 1}</h3><p class="sub">${L(`${S.arr.Ns} módulo(s) en serie`, `${S.arr.Ns} module(s) in series`)}${S.arr.block ? L(' con diodo de bloqueo', ' with blocking diode') : ''}.</p>
        ${OP && OP.r.Vop ? `<div class="kv"><span>${L('Corriente del string', 'String current')}</span><span>${fx(PV.iAt({ V: OP.cv.V, I: sI }, OP.r.Vop), 2)} A</span><span>${L('Voltaje de operación', 'Operating voltage')}</span><span>${fx(OP.r.Vop, 2)} V</span></div>` : ''}
        <h4>${L('Opciones del arreglo', 'Array options')}</h4>${Sw(L('Diodo de bloqueo por string', 'Blocking diode per string'), 'arr.block')}`;
    }
    el.innerHTML = h;
    if (q.type === 'cell') {
      const upd = (k, v) => { S[k][q.s][q.m][q.c] = v; refresh(); };
      $('cG').onchange = e => upd('G', Math.max(0, Math.min(1200, +e.target.value)));
      $('cGr').oninput = e => { $('cG').value = e.target.value; };
      $('cGr').onchange = e => upd('G', +e.target.value);
      $('cT').onchange = e => upd('T', Math.max(-10, Math.min(90, +e.target.value)));
      $('cAllMod').onclick = () => { const G = S.G[q.s][q.m][q.c], T = S.T[q.s][q.m][q.c]; S.G[q.s][q.m].fill(G); S.T[q.s][q.m].fill(T); refresh(); };
      $('cAll').onclick = () => { const G = S.G[q.s][q.m][q.c], T = S.T[q.s][q.m][q.c]; eachMod((s, m) => { S.G[s][m].fill(G); S.T[s][m].fill(T); }); refresh(); };
    }
    if (q.type === 'mod') {
      el.querySelectorAll('[data-bpg]').forEach(b => b.onclick = () => { const g = +b.dataset.bpg; S.bp[q.s][q.m][g] = !S.bp[q.s][q.m][g]; refresh(); });
      $('mClear').onclick = () => { S.G[q.s][q.m].fill(1000); refresh(); };
      $('mHalf').onclick = () => { S.G[q.s][q.m].fill(500); refresh(); };
    }
    bindFields(el);
  }
  function renderBlocks() {
    if (!$('bIV') || !OP) return;
    const C = OP.C;
    $('bIV').textContent = OP.mt.Pmp > 0 ? `Pmp ${fx(OP.mt.Pmp, 0)} W · ${OP.mt.peaks.length} ${L(OP.mt.peaks.length === 1 ? 'máximo' : 'máximos', OP.mt.peaks.length === 1 ? 'peak' : 'peaks')}` : '—';
    $('bBat').textContent = `${C.bat.tech} · ${fx(C.bm.Vn, 1)} V · ${fx(C.bm.Ecap, 1)} kWh`;
    $('bInv').textContent = C.inv.id === 'none' ? L('Carga en CC', 'DC load') : `${fx(C.inv.P / 1000, 1)} kW · ${S.load.P} W ${L('pico', 'peak')}`;
  }

  /* ======================= Página 2: Curvas y MPPT ======================= */
  function pageIV() {
    const m = S.modId !== 'custom' ? window.MODULES[S.modId] : null;
    $('p-iv').innerHTML = `
      <div class="intro"><h2>${L('Curvas I‑V, P‑V y seguimiento del punto de máxima potencia', 'I‑V and P‑V curves and maximum power point tracking')}</h2><p>${L('Curvas del arreglo para la condición del esquema (irradiancia y temperatura de cada celda). Compara el máximo global con lo que encuentra un controlador real.', 'Array curves for the schematic condition (irradiance and temperature of each cell). Compare the global maximum with what a real controller finds.')}</p></div>
      <div class="grid g-main">
        <div class="card"><div class="chead"><div><h3>${L('Curvas del arreglo', 'Array curves')}</h3><p class="sub" id="ivSub"></p></div></div>${chartBox('cIV', 'h420', 'curvas-iv-pv')}<div class="kpis" id="ivK" style="margin-top:18px"></div></div>
        <div class="stack">
          <div class="card"><h3>${L('MPPT: Perturbar y Observar', 'MPPT: Perturb and Observe')}</h3><p class="sub">${L('El algoritmo sube o baja el voltaje en pasos fijos y sigue la dirección en que crece la potencia. Con sombras puede quedarse en un máximo local.', 'The algorithm moves the voltage in fixed steps and follows the direction in which power increases. With shading it can get stuck on a local peak.')}</p>
            ${F(L('Voltaje inicial', 'Start voltage'), 'po.start', 0.05, 1, 0.05, '× V<sub>oc</sub>')}${F(L('Paso de voltaje', 'Voltage step'), 'po.dv', 0.05, 10, 0.05, 'V')}${F(L('Iteraciones', 'Iterations'), 'po.steps', 5, 300, 1)}
            <div id="poRes"></div></div>
          <div class="card"><h3>${L('Opciones del modelo', 'Model options')}</h3>
            ${Sw(L('Ruptura en inversa (modelo de Bishop)', 'Reverse breakdown (Bishop model)'), 'model.bishop.on', L('Limita el voltaje inverso de la celda sombreada', 'Limits the reverse voltage of a shaded cell'))}
            ${S.model.bishop.on ? F(L('Voltaje de ruptura', 'Breakdown voltage'), 'model.bishop.Vbr', -40, -3, 0.5, 'V') + F(L('Factor de avalancha a', 'Avalanche factor a'), 'model.bishop.a', 0, 0.2, 0.0005) + F(L('Exponente m', 'Exponent m'), 'model.bishop.m', 1, 6, 0.1) : ''}
            ${Sw(L('Diodos bypass Schottky', 'Schottky bypass diodes'), 'model.schottky', L('Desactivado: diodo de unión PN (≈0,7 V)', 'Off: PN junction diode (≈0.7 V)'))}
            ${Sw(L('Diodo de bloqueo por string', 'Blocking diode per string'), 'arr.block')}
          </div>
          <div class="card"><h3>${L('Exportar a LTspice', 'Export to LTspice')}</h3><p class="sub">${L('Netlist del arreglo con un subcircuito por celda, cada una con su irradiancia y temperatura.', 'Array netlist with one subcircuit per cell, each with its own irradiance and temperature.')}</p><button class="btn" id="btnNet">${L('Generar netlist', 'Generate netlist')}</button></div>
        </div>
      </div>
      <div class="grid g-2" style="margin-top:24px">
        <div class="card"><h3>${L('Puntos calientes y diodos bypass', 'Hot spots and bypass diodes')}</h3><p class="sub">${L('Celdas que disipan potencia en el punto de operación actual.', 'Cells dissipating power at the current operating point.')}</p><div class="tscroll" id="hotT"></div></div>
        <div class="card"><h3>${L('Validación contra la hoja técnica', 'Validation against datasheet')}</h3><p class="sub">${m ? esc(m.name) + ' · STC (1000 W/m², 25 °C)' : L('Elige un módulo comercial para validar.', 'Pick a commercial module to validate.')}</p><div class="tscroll" id="valT"></div></div>
      </div>
      ${m ? `<div class="grid g-2" style="margin-top:24px">
        <div class="card"><h3>${L('Módulo a distinta irradiancia (25 °C)', 'Module at different irradiance (25 °C)')}</h3>${chartBox('cValG', 'h340', 'modulo-irradiancia')}</div>
        <div class="card"><h3>${L('Módulo a distinta temperatura (1000 W/m²)', 'Module at different temperature (1000 W/m²)')}</h3>${chartBox('cValT', 'h340', 'modulo-temperatura')}</div></div>` : ''}`;
    bindFields($('p-iv'), p => { refresh(); if (p.startsWith('model.bishop.on')) pageIV(); });
    $('btnNet').onclick = showNetlist;
    bindExports($('p-iv'));
    drawIV(); renderValidation();
  }
  function drawIV() {
    if (!$('cIV') || !OP) return;
    const { cv, mt, po, r } = OP;
    if (!cv) { CHART.draw($('cIV'), { xs: [0, 1], series: [], xl: 'V', yl: 'I' }); $('ivK').innerHTML = ''; return; }
    const series = [];
    if (S.arr.Np > 1) cv.Istr.forEach((ys, i) => series.push({ ys, color: css('--s6'), w: 1.2, dash: [5, 4], label: i === 0 ? L('Strings individuales', 'Individual strings') : '' }));
    series.push({ ys: cv.I, color: css('--s1'), label: L('Corriente I', 'Current I') }, { ys: cv.P, color: css('--s2'), side: 'r', label: L('Potencia P', 'Power P'), fill: true });
    const pts = mt.peaks.filter(k => k !== mt.k).map(k => ({ x: cv.V[k], y: cv.P[k], side: 'r', color: css('--s6'), r: 4.5, label: L('máx. local', 'local max') + ' ' + fx(cv.P[k], 0) + ' W' }));
    pts.push({ x: mt.Vmp, y: mt.Pmp, side: 'r', color: css('--accent'), label: `MPP ${fx(mt.Pmp, 1)} W` });
    if (po) pts.push({ x: po.V, y: po.P, side: 'r', color: css('--s3'), r: 5, label: Math.abs(po.P - mt.Pmp) > 0.01 * mt.Pmp ? `P&O ${fx(po.P, 0)} W` : '' });
    if (S.ctl.mode === 'pwm' && r.Vop) pts.push({ x: r.Vop, y: r.Ipv, color: css('--s5'), label: `PWM ${fx(r.Vop, 1)} V` });
    CHART.draw($('cIV'), { xs: cv.V, series, pts, xl: L('Voltaje del arreglo V (V)', 'Array voltage V (V)'), yl: L('Corriente I (A)', 'Current I (A)'), yr: L('Potencia P (W)', 'Power P (W)'), ymaxL: Math.max(...cv.I) * 1.08, ymaxR: mt.Pmp * 1.12 });
    $('ivSub').textContent = `${S.arr.Ns}S × ${S.arr.Np}P · ${esc(S.modInfo.name)}`;
    const lossPO = po ? (1 - po.P / mt.Pmp) * 100 : 0;
    $('ivK').innerHTML = kpi('P<sub>mp</sub>', fx(mt.Pmp, 1), 'W', 'hl') + kpi('V<sub>mp</sub> / I<sub>mp</sub>', `${fx(mt.Vmp, 1)} / ${fx(mt.Imp, 2)}`, 'V / A') + kpi('V<sub>oc</sub>', fx(mt.Voc, 2), 'V') + kpi('I<sub>sc</sub>', fx(mt.Isc, 2), 'A') + kpi(L('Factor de forma', 'Fill factor'), fx(mt.FF * 100, 1), '%') + kpi(L('Máximos en P‑V', 'Peaks on P‑V'), mt.peaks.length, '', mt.peaks.length > 1 ? 'bad' : '');
    if ($('poRes') && po) $('poRes').innerHTML = `<div class="kpis" style="margin-top:14px">${kpi(L('Potencia encontrada', 'Power found'), fx(po.P, 1), 'W')}${kpi(L('Pérdida vs. MPP global', 'Loss vs global MPP'), fx(Math.max(0, lossPO), 1), '%', lossPO > 1 ? 'bad' : 'ok')}</div>
      ${lossPO > 1 ? `<div class="alert bad">${L(`El algoritmo quedó atrapado en un máximo local a ${fx(po.V, 1)} V. El máximo global está en ${fx(mt.Vmp, 1)} V.`, `The algorithm got stuck on a local peak at ${fx(po.V, 1)} V. The global maximum is at ${fx(mt.Vmp, 1)} V.`)}</div>` : `<div class="alert ok">${L('El algoritmo encontró el máximo global.', 'The algorithm found the global maximum.')}</div>`}`;
    // tabla de puntos calientes
    const hot = OP.cells.filter(x => x.P < -0.05).sort((a, b) => a.P - b.P).slice(0, 12);
    const Acell = S.modInfo.A / S.modInfo.Ncell * 0.92;
    const bpd = []; const seen = new Set();
    OP.cells.filter(x => x.Ib > 0).forEach(x => { const k = `${x.s}.${x.m}.${x.g}`; if (!seen.has(k)) { seen.add(k); bpd.push(x); } });
    $('hotT').innerHTML = hot.length || bpd.length ? `<table class="t"><thead><tr><th>${L('Elemento', 'Element')}</th><th>V</th><th>I</th><th>${L('P disipada', 'P dissipated')}</th><th>ΔT ${L('est.', 'est.')}</th></tr></thead><tbody>
      ${hot.map(x => `<tr><td>${L('Celda', 'Cell')} ${x.s + 1}.${x.m + 1}.${x.c + 1}</td><td class="num">${fx(x.V, 2)} V</td><td class="num">${fx(x.I, 2)} A</td><td class="num" style="color:var(--bad)">${fx(-x.P, 2)} W</td><td class="num">+${fx(-x.P / (Acell * 30), 0)} °C</td></tr>`).join('')}
      ${bpd.map(x => `<tr><td>${L('Diodo bypass', 'Bypass diode')} D${x.g + 1} · ${x.s + 1}.${x.m + 1}</td><td class="num">${fx(PV.bypassV(SIM.arrayCfg(S, S.G, S.T).bypass, x.Ib, 25), 2)} V</td><td class="num">${fx(x.Ib, 2)} A</td><td class="num">${fx(x.Pbp, 2)} W</td><td class="num">—</td></tr>`).join('')}
      </tbody></table><p class="note">${L('ΔT: calentamiento medio de la celda estimado con un coeficiente de transferencia de 30 W/m²K. En la práctica el calentamiento es local y puede ser mayor.', 'ΔT: average cell heating estimated with a heat-transfer coefficient of 30 W/m²K. In practice heating is local and can be higher.')}</p>` : `<p class="note">${L('Ninguna celda en polarización inversa en este punto de operación.', 'No cells in reverse bias at this operating point.')}</p>`;
  }
  function moduleCurve(m, Gv, Tv) {
    const n = m.rows * m.cols;
    const cfg = { cell: { ...FIT.cell, bishop: { on: false } }, mod: { rows: m.rows, cols: m.cols, groups: m.groups }, Ns: 1, Np: 1, Gc: [[Array(n).fill(Gv)]], Tc: [[Array(n).fill(Tv)]], bp: [[Array(m.groups).fill(true)]], bypass: { n: 1.1, Is: 2e-6 }, block: { on: false } };
    return PV.arrayCurve(cfg, { NI: 260, NV: 420 });
  }
  function renderValidation() {
    if (!$('valT')) return;
    if (S.modId === 'custom') { $('valT').innerHTML = `<p class="note">${L('La validación está disponible para los módulos del catálogo.', 'Validation is available for catalog modules.')}</p>`; return; }
    const m = window.MODULES[S.modId], cv = moduleCurve(m, 1000, 25), mt = PV.metrics(cv);
    const cv50 = moduleCurve(m, 1000, 50), mt50 = PV.metrics(cv50);
    const row = (lab, ds, mo, u, d = 2) => { const e = (mo - ds) / Math.abs(ds) * 100; return `<tr><td>${lab}</td><td class="num">${fx(ds, d)} ${u}</td><td class="num">${fx(mo, d)} ${u}</td><td class="num"><span class="badge ${Math.abs(e) < 1 ? 'ok' : Math.abs(e) < 3 ? 'warn' : 'bad'}">${e >= 0 ? '+' : ''}${fx(e, 2)} %</span></td></tr>`; };
    $('valT').innerHTML = `<table class="t"><thead><tr><th>${L('Parámetro', 'Parameter')}</th><th>${L('Hoja técnica', 'Datasheet')}</th><th>${L('Modelo', 'Model')}</th><th>${L('Error', 'Error')}</th></tr></thead><tbody>
      ${row('P<sub>max</sub>', m.Vmp * m.Imp, mt.Pmp, 'W', 1)}${row('V<sub>mp</sub>', m.Vmp, mt.Vmp, 'V')}${row('I<sub>mp</sub>', m.Imp, mt.Imp, 'A')}${row('V<sub>oc</sub>', m.Voc, mt.Voc, 'V')}${row('I<sub>sc</sub>', m.Isc, mt.Isc, 'A')}
      ${row('β<sub>Voc</sub>', m.bV * 1000, (mt50.Voc - mt.Voc) / 25 * 1000, 'mV/K', 1)}${row('γ<sub>Pmax</sub>', m.gP, (mt50.Pmp / mt.Pmp - 1) / 25 * 100, '%/K', 3)}
      </tbody></table><p class="note">${L('Los coeficientes de temperatura del modelo se calculan entre 25 °C y 50 °C. γ<sub>Pmax</sub> no se impone en el ajuste: es un resultado del modelo, por eso su error es mayor.', 'Model temperature coefficients are computed between 25 °C and 50 °C. γ<sub>Pmax</sub> is not imposed by the fit: it is a model output, hence its larger error.')}</p>`;
    if ($('cValG')) {
      const Gs = [1000, 800, 600, 400, 200], cols = [css('--s1'), css('--s2'), css('--s3'), css('--s4'), css('--s5')];
      const cvs = Gs.map(g => moduleCurve(m, g, 25)), Vx = cvs[0].V;
      CHART.draw($('cValG'), { xs: Vx, series: cvs.map((c, i) => ({ ys: Vx.map(v => PV.iAt(c, v)), color: cols[i], label: Gs[i] + ' W/m²' })), pts: [{ x: 0, y: m.Isc, color: css('--ink'), r: 4 }, { x: m.Vmp, y: m.Imp, color: css('--ink'), r: 4, label: L('Hoja técnica', 'Datasheet') }, { x: m.Voc, y: 0, color: css('--ink'), r: 4 }], xl: L('Voltaje (V)', 'Voltage (V)'), yl: L('Corriente (A)', 'Current (A)'), ymaxL: m.Isc * 1.1, xmax: m.Voc * 1.08 });
      const Ts = [0, 25, 50, 75], cvt = Ts.map(t => moduleCurve(m, 1000, t)), Vt = cvt[0].V;
      CHART.draw($('cValT'), { xs: Vt, series: cvt.map((c, i) => ({ ys: Vt.map(v => PV.iAt(c, v)), color: cols[i], label: Ts[i] + ' °C' })), xl: L('Voltaje (V)', 'Voltage (V)'), yl: L('Corriente (A)', 'Current (A)'), ymaxL: m.Isc * 1.1, xmax: Math.max(...cvt.map(c => PV.metrics(c).Voc)) * 1.05 });
    }
  }

  function netlist() {
    const c = S.cell, n = N(), Vt = PV.Vt(298.15), I0 = c.Isc / (Math.exp(c.Voc / (c.n * Vt)) - 1);
    const L1 = [`* ${L('Arreglo FV', 'PV array')} ${S.arr.Ns}S x ${S.arr.Np}P, ${n} ${L('celdas por modulo', 'cells per module')} - ${L('modelo de un diodo', 'single-diode model')}`,
      `* ${S.modInfo.name}`,
      `.param Isc=${+c.Isc.toPrecision(6)} Ki=${+c.Ki.toPrecision(6)} Rs=${+c.Rs.toPrecision(6)} Rsh=${+c.Rsh.toPrecision(6)}`,
      `.subckt CELDA p n params: G=1000 T=25`, `Bph n d I=(Isc*(Rsh+Rs)/Rsh+Ki*(T-25))*G/1000`, `D1 d n DCELL temp={T}`, `Rsh d n {Rsh*1000/max(G,10)}`, `Rs d p {Rs}`, `.ends CELDA`,
      `.model DCELL D(Is=${I0.toExponential(4)} N=${+c.n.toPrecision(4)} Eg=1.12 XTI=3)`, S.model.schottky ? `.model DBP D(Is=2e-6 N=1.1 Rs=0.002)` : `.model DBP D(Is=1e-8 N=1.6 Rs=0.005)`, `.model DBLK D(Is=2e-6 N=1.1 Rs=0.002)`, ''];
    for (let s = 0; s < S.arr.Np; s++) {
      let node = '0';
      for (let m = 0; m < S.arr.Ns; m++) {
        let gStart = node;
        for (let k = 0; k < n; k++) {
          const nx = `s${s + 1}m${m + 1}c${k + 1}`;
          L1.push(`XU1_${s + 1}_${m + 1}_${k + 1} ${nx} ${node} CELDA params: G=${S.G[s][m][k]} T=${S.T[s][m][k]}`); node = nx;
          const g = groupOf(k);
          if (k === n - 1 || groupOf(k + 1) !== g) { if (S.bp[s][m][g]) L1.push(`DBP_${s + 1}_${m + 1}_${g + 1} ${gStart} ${node} DBP`); gStart = node; }
        }
      }
      L1.push(S.arr.block ? `DBLK_${s + 1} ${node} PV DBLK` : `R_${s + 1} ${node} PV 1u`, '');
    }
    const Voc = OP && OP.mt.Voc ? OP.mt.Voc : 50;
    L1.push('Vpv PV 0 0', `.dc Vpv 0 ${Math.ceil(Voc + 1)} 0.05`, `* ${L('Graficar -I(Vpv) y -V(PV)*I(Vpv)', 'Plot -I(Vpv) and -V(PV)*I(Vpv)')}`, '.end');
    return L1.join('\n');
  }
  function showNetlist() {
    $('dlgBody').innerHTML = `<h3 style="margin-bottom:6px">${L('Netlist LTspice del arreglo', 'Array LTspice netlist')}</h3><p class="note" style="margin:0 0 12px">${L('Pégalo en un archivo .cir y ejecútalo en LTspice. La ruptura de Bishop no se incluye en el netlist.', 'Paste it into a .cir file and run it in LTspice. Bishop breakdown is not included in the netlist.')}</p><textarea readonly id="netTxt"></textarea><div class="btns" style="justify-content:flex-end;margin-top:12px"><span class="note" id="cpMsg" style="margin:0 auto 0 0"></span><button class="btn" id="btnDl">${L('Descargar .cir', 'Download .cir')}</button><button class="btn" id="btnCopy">${L('Copiar', 'Copy')}</button><button class="btn pri" id="btnClose">${L('Cerrar', 'Close')}</button></div>`;
    const t = netlist(); $('netTxt').value = t; $('dlg').showModal();
    $('btnClose').onclick = () => $('dlg').close();
    $('btnCopy').onclick = async () => { try { await navigator.clipboard.writeText(t); $('cpMsg').textContent = L('Copiado.', 'Copied.'); } catch (e) { $('netTxt').select(); $('cpMsg').textContent = L('Selecciona y copia manualmente.', 'Select and copy manually.'); } };
    $('btnDl').onclick = () => { const a = document.createElement('a'); a.download = 'arreglo-fv.cir'; a.href = URL.createObjectURL(new Blob([t], { type: 'text/plain' })); a.click(); };
  }

  /* ======================= Página 3: Sitio y clima ======================= */
  function pageSite() {
    const cityOpts = Object.entries(CITIES).map(([k, v]) => [k, k === 'custom' ? L(v.name, v.nameEn) : v.name]);
    $('p-site').innerHTML = `
      <div class="intro"><h2>${L('Sitio, recurso solar y clima', 'Site, solar resource and weather')}</h2><p>${L('Datos horarios reales del año meteorológico típico (TMY) de PVGIS para cinco ciudades de Honduras, o un modelo de cielo despejado para cualquier sitio.', 'Real hourly typical meteorological year (TMY) data from PVGIS for five Honduran cities, or a clear-sky model for any site.')}</p></div>
      <div class="grid g-side">
        <div class="stack">
          <div class="card"><h3>${L('Ubicación y datos', 'Location and data')}</h3>
            ${Sel(L('Ciudad', 'City'), 'site.city', cityOpts)}
            ${Sel(L('Fuente de datos', 'Data source'), 'site.src', [['tmy', L('PVGIS TMY (datos reales)', 'PVGIS TMY (real data)')], ['clear', L('Cielo despejado × índice de cielo claro', 'Clear sky × clear-sky index')]])}
            ${S.site.city === 'custom' ? F(L('Latitud', 'Latitude'), 'site.lat', -60, 60, 0.0001, '°') + F(L('Longitud', 'Longitude'), 'site.lon', -180, 180, 0.0001, '°') + F(L('Zona horaria', 'Time zone'), 'site.tz', -12, 14, 1, 'UTC') + F(L('Altitud', 'Altitude'), 'site.alt', 0, 4000, 10, 'm') : ''}
            ${S.site.src === 'clear' ? F(L('Índice de cielo claro', 'Clear-sky index'), 'site.kt', 0.1, 1, 0.05, '', L('Fracción de la radiación de cielo despejado', 'Fraction of clear-sky radiation')) + F(L('T mínima', 'Min T'), 'site.Tmin', -10, 40, 1, '°C') + F(L('T máxima', 'Max T'), 'site.Tmax', 0, 50, 1, '°C') + F(L('Viento', 'Wind'), 'site.ws', 0, 15, 0.5, 'm/s') : ''}
            <div class="field"><label for="locDate">${L('Fecha', 'Date')}</label><input type="date" id="locDate" value="${S.site.date}"></div>
            <p class="note" id="srcNote"></p>
          </div>
          <div class="card"><h3>${L('Orientación y montaje', 'Orientation and mounting')}</h3>
            ${F(L('Inclinación', 'Tilt'), 'site.tilt', 0, 90, 1, '°')}${F(L('Orientación (180 = sur)', 'Azimuth (180 = south)'), 'site.az', 0, 359, 1, '°')}${F(L('Albedo del suelo', 'Ground albedo'), 'site.albedo', 0, 0.9, 0.05)}
            ${Sel(L('Temperatura de celda', 'Cell temperature'), 'site.tmodel', [['faiman', L('Faiman (con viento)', 'Faiman (with wind)')], ['noct', 'NOCT']])}
          </div>
          <div class="card"><h3>${L('Pérdidas', 'Losses')}</h3>
            ${F(L('Suciedad', 'Soiling'), 'loss.soil', 0, 20, 0.5, '%')}${F(L('Mismatch y tolerancia', 'Mismatch & tolerance'), 'loss.mism', 0, 10, 0.5, '%')}${F(L('Degradación anual', 'Annual degradation'), 'loss.degr', 0, 3, 0.1, '%/' + L('año', 'yr'))}${F(L('Año de operación', 'Operating year'), 'loss.year', 1, 30, 1)}
            ${Sw(L('Pérdidas por ángulo de incidencia (ASHRAE, b₀ = 0,05)', 'Incidence angle losses (ASHRAE, b₀ = 0.05)'), 'loss.iam')}
          </div>
        </div>
        <div class="stack">
          <div class="card"><h3>${L('Trayectoria del sol', 'Sun path')}</h3><svg id="scene" class="scene" viewBox="0 0 640 280"></svg>
            <div class="player"><button class="btn pri" id="play">▶ ${L('Animar día', 'Animate day')}</button><input type="range" id="hour" min="0" max="24" step="0.05" value="${curH}" aria-label="${L('Hora', 'Hour')}"><b id="hourV" style="font-family:var(--mono);min-width:52px">12:00</b></div>
            <div class="kpis" id="sunR" style="margin-top:16px"></div></div>
          <div class="card"><div class="chead"><div><h3>${L('Irradiación mensual', 'Monthly irradiation')}</h3><p class="sub" id="monSub"></p></div></div>${chartBox('cMon', 'h300', 'irradiacion-mensual')}<div class="kpis" id="monK" style="margin-top:14px"></div></div>
        </div>
      </div>`;
    bindFields($('p-site'), p => {
      if (p === 'site.city' && S.site.city !== 'custom') { const c = CITIES[S.site.city]; Object.assign(S.site, { lat: c.lat, lon: c.lon, alt: c.alt, Tmin: c.Tmin, Tmax: c.Tmax, tz: -6 }); }
      if (p === 'site.city' && S.site.city === 'custom') S.site.src = 'clear';
      if (p === 'site.src' && S.site.src === 'tmy' && S.site.city === 'custom') S.site.city = 'tgu';
      DAY = YEAR = null; loadTmy().then(() => { pageSite(); renderSummary(); });
    });
    $('locDate').onchange = e => { if (e.target.value) { S.site.date = e.target.value; DAY = null; drawScene(); } };
    $('hour').oninput = e => { stopPlay(); curH = +e.target.value; drawScene(); };
    $('play').onclick = () => { if (anim) { stopPlay(); return; } if (curH >= 24) curH = 0; $('play').textContent = '❚❚ ' + L('Pausar', 'Pause'); anim = requestAnimationFrame(playStep); };
    bindExports($('p-site'));
    drawScene(); drawMonthly();
  }
  let anim = 0, last = 0;
  function playStep(ts) { if (!last) last = ts; let h = curH + (ts - last) / 1000 * 2; last = ts; if (h >= 24) { h = 24; stopPlay(); } curH = h; if ($('hour')) $('hour').value = h; drawScene(); if (anim) anim = requestAnimationFrame(playStep); }
  function stopPlay() { cancelAnimationFrame(anim); anim = 0; last = 0; if ($('play')) $('play').textContent = '▶ ' + L('Animar día', 'Animate day'); }
  const hhmm = h => { h = ((h % 24) + 24) % 24; const H = Math.floor(h), M = Math.round((h - H) * 60); return `${String(M === 60 ? H + 1 : H).padStart(2, '0')}:${String(M % 60).padStart(2, '0')}`; };
  function useTmy() { return S.site.src === 'tmy' && TMYD && TMYD.key === S.site.city ? TMYD.d : null; }
  function loadTmy() {
    if (S.site.src !== 'tmy' || S.site.city === 'custom') return Promise.resolve();
    if (TMYD && TMYD.key === S.site.city) return Promise.resolve();
    return SOLAR.loadTMY(S.site.city).then(d => { TMYD = { key: S.site.city, d }; }).catch(() => { S.site.src = 'clear'; });
  }
  function drawScene() {
    if (!$('scene')) return;
    const doy = SOLAR.doyOf(S.site.date), w = SIM.weatherAt(S, useTmy(), doy, curH), sp = w.sp;
    const W = 640, Hh = 280, gy = 210, X = az => W / 2 + (az - S.site.az) / 130 * (W / 2 - 30), Y = el => gy - Math.max(-8, el) / 90 * (gy - 24);
    const e = sp.el, day = Math.max(0, Math.min(1, (e + 6) / 16));
    const mix = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(',')})`;
    const top = mix([16, 22, 40], [140, 175, 215], day), bot = mix([38, 46, 72], [232, 226, 210], day);
    let path = ''; for (let x = 0; x <= 24; x += 0.25) { const p = SOLAR.position(S.site, doy, x); if (p.el > -1) path += `${X(p.az).toFixed(1)},${Y(p.el).toFixed(1)} `; }
    let stars = ''; if (day < 0.6) for (let i = 0; i < 30; i++) stars += `<circle cx="${(i * 197) % W}" cy="${(i * 73) % 150 + 10}" r="${i % 3 ? 0.8 : 1.3}" fill="#fff" opacity="${(0.6 - day) * 1.4}"/>`;
    const sunX = X(sp.az), sunY = Y(e), glow = Math.max(0, Math.min(1, e / 10)), px = W / 2, py = gy - 6;
    const cloud = useTmy() && w.irr.ghi > 0 ? Math.max(0, 1 - w.irr.ghi / Math.max(1, SOLAR.clearSky(S.site, sp).ghi)) : 0;
    const ticks = [[90, 'E'], [135, 'SE'], [180, 'S'], [225, L('SO', 'SW')], [270, L('O', 'W')]].map(([a, l]) => `<text x="${X(a)}" y="${gy + 24}" text-anchor="middle" font-size="12" fill="#5d6b80">${l}</text>`).join('');
    $('scene').innerHTML = `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bot}"/></linearGradient><radialGradient id="glow"><stop offset="0" stop-color="#ffe7a8" stop-opacity=".9"/><stop offset="1" stop-color="#ffe7a8" stop-opacity="0"/></radialGradient></defs>
      <rect width="${W}" height="${gy}" fill="url(#sky)"/>${stars}
      <polyline points="${path}" fill="none" stroke="${day > 0.5 ? '#c98a1b' : '#c9b488'}" stroke-dasharray="3 4" stroke-width="1.3"/>
      ${e > -6 ? `<circle cx="${sunX}" cy="${sunY}" r="${34 * glow + 6}" fill="url(#glow)"/><circle cx="${sunX}" cy="${sunY}" r="11" fill="${e > 0 ? '#e8b84a' : '#c9864a'}" stroke="#fff3cf" stroke-width="1.5"/>` : ''}
      ${cloud > 0.25 && e > 0 ? `<g opacity="${Math.min(0.9, cloud)}" fill="#eef1f5"><ellipse cx="${sunX - 18}" cy="${sunY + 6}" rx="34" ry="13"/><ellipse cx="${sunX + 14}" cy="${sunY + 2}" rx="28" ry="15"/></g>` : ''}
      ${e > 0.5 ? `<line x1="${sunX}" y1="${sunY}" x2="${px}" y2="${py - 14}" stroke="#e8b84a" stroke-width="1" stroke-dasharray="2 5" opacity=".7"/>` : ''}
      <rect y="${gy}" width="${W}" height="${Hh - gy}" fill="${mix([44, 52, 46], [176, 170, 148], day)}"/>${ticks}
      <g transform="translate(${px},${py})"><line x1="0" y1="0" x2="0" y2="-10" stroke="#5d6b80" stroke-width="3"/><g transform="rotate(${-S.site.tilt})"><rect x="-62" y="-12" width="124" height="8" fill="#1d3b6e" stroke="#c9c3b4" stroke-width=".8"/></g></g>
      <text x="14" y="22" font-size="14" fill="${day > 0.5 ? '#0f1b2d' : '#e8e2d2'}" font-weight="650">${S.site.city === 'custom' ? L('Sitio personalizado', 'Custom site') : CITIES[S.site.city].name} · ${S.site.lat.toFixed(2)}°, ${S.site.lon.toFixed(2)}°</text>
      <text x="14" y="40" font-size="12" fill="${day > 0.5 ? '#2b3a52' : '#c9c3b4'}">${L('Inclinación', 'Tilt')} ${S.site.tilt}° · ${L('orientación', 'azimuth')} ${S.site.az}°</text>
      <text x="${W - 14}" y="26" text-anchor="end" font-size="22" font-family="JetBrains Mono, monospace" fill="${day > 0.5 ? '#0f1b2d' : '#e8e2d2'}">${hhmm(curH)}</text>`;
    $('sunR').innerHTML = kpi(L('Elevación', 'Elevation'), fx(Math.max(e, 0), 1), '°') + kpi(L('Azimut', 'Azimuth'), fx(sp.az, 1), '°') + kpi('GHI', fx(w.irr.ghi, 0), 'W/m²') + kpi(L('G en el plano', 'Plane-of-array G'), fx(w.poa.poa, 0), 'W/m²', 'hl') + kpi(L('T ambiente', 'Ambient T'), fx(w.Ta, 1), '°C') + kpi(L('T de celda', 'Cell T'), fx(w.Tc, 1), '°C') + kpi(L('Viento', 'Wind'), fx(w.ws, 1), 'm/s') + kpi(L('Salida / puesta', 'Sunrise / sunset'), `${hhmm(sp.rise)} / ${hhmm(sp.set)}`);
    $('hourV').textContent = hhmm(curH);
    const t = useTmy();
    $('srcNote').innerHTML = t ? `${L('Fuente', 'Source')}: ${esc(t.src)}. ${L('Meses típicos', 'Typical months')}: ${t.months.join(', ')}.` : L('Modelo de cielo despejado de Meinel escalado por el índice de cielo claro; separación directa/difusa con la correlación de Erbs.', 'Meinel clear-sky model scaled by the clear-sky index; beam/diffuse split with the Erbs correlation.');
  }
  function monthlyIrr() {
    const t = useTmy(), md = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const ghi = Array(12).fill(0), poa = Array(12).fill(0); let d = 1;
    for (let mo = 0; mo < 12; mo++) {
      for (let k = 0; k < md[mo]; k++, d++) {
        for (let h = 0; h < 24; h++) { const w = SIM.weatherAt(S, t, d, h + 0.5); ghi[mo] += w.irr.ghi / 1000; poa[mo] += w.poa.poa / 1000; }
      }
      ghi[mo] /= md[mo]; poa[mo] /= md[mo];
    }
    return { ghi, poa };
  }
  function drawMonthly() {
    if (!$('cMon')) return;
    const r = monthlyIrr(), months = L('Ene Feb Mar Abr May Jun Jul Ago Sep Oct Nov Dic', 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec').split(' ');
    const xs = r.ghi.map((_, i) => i + 1);
    CHART.draw($('cMon'), { xs, xmin: 0.5, xmax: 12.5, xticks: xs.map((x, i) => ({ x, label: months[i] })), series: [{ type: 'bar', ys: r.ghi, color: css('--s6'), bw: 0.36, off: -0.19, label: L('Horizontal (GHI)', 'Horizontal (GHI)') }, { type: 'bar', ys: r.poa, color: css('--s4'), bw: 0.36, off: 0.19, label: L('Plano del arreglo', 'Plane of array') }], xl: L('Mes', 'Month'), yl: 'kWh/m²·' + L('día', 'day'), ymaxL: Math.max(...r.poa, ...r.ghi) * 1.1 });
    const yg = r.ghi.reduce((a, b, i) => a + b * [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][i], 0), yp = r.poa.reduce((a, b, i) => a + b * [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][i], 0);
    $('monK').innerHTML = kpi(L('Irradiación anual horizontal', 'Annual horizontal irradiation'), fx(yg, 0), 'kWh/m²') + kpi(L('Irradiación anual en el plano', 'Annual plane-of-array irradiation'), fx(yp, 0), 'kWh/m²', 'hl') + kpi(L('Horas solares pico (plano)', 'Peak sun hours (plane)'), fx(yp / 365, 2), 'h/' + L('día', 'day')) + kpi(L('Mes más bajo', 'Lowest month'), months[r.poa.indexOf(Math.min(...r.poa))]);
    $('monSub').textContent = useTmy() ? 'PVGIS TMY' : L('Cielo despejado × índice de cielo claro', 'Clear sky × clear-sky index');
  }

  /* ======================= Página 4: Baterías ======================= */
  function pageBat() {
    const C = SIM.components(S), bm = C.bm, b = C.bat, dayE = S.load.P * SYS.LOADPROF[S.load.prof].reduce((a, x) => a + x, 0) / 1000;
    const techN = { FLA: L('Plomo-ácido', 'Lead-acid'), AGM: 'AGM', GEL: 'Gel', LFP: 'LiFePO₄' };
    $('p-bat').innerHTML = `
      <div class="intro"><h2>${L('Almacenamiento en baterías', 'Battery storage')}</h2><p>${L('Elige la tecnología y arma el banco en serie y paralelo. El voltaje sigue el modelo de Shepherd modificado (Tremblay), con ley de Peukert y eficiencia coulómbica. Los valores son típicos de cada tecnología.', 'Choose the technology and build the bank in series and parallel. Voltage follows the modified Shepherd model (Tremblay), with Peukert law and coulombic efficiency. Values are typical for each technology.')}</p></div>
      <div class="card"><h3>${L('Catálogo', 'Catalog')}</h3><p class="sub">${L('Toca una opción para usarla en el sistema.', 'Tap an option to use it in the system.')}</p>
        <div class="cards">${SYS.BATTERIES.map(x => `<button class="opt ${x.id === S.bat.id ? 'on' : ''}" data-bat="${x.id}"><span class="tag">${techN[x.tech]}</span><h5>${esc(L(x.name.es, x.name.en))}</h5><dl><dt>${L('Energía', 'Energy')}</dt><dd>${fx(x.V * x.C / 1000, 2)} kWh</dd><dt>${L('Profundidad de descarga', 'Depth of discharge')}</dt><dd>${fx(x.dod * 100, 0)} %</dd><dt>${L('Ciclos', 'Cycles')}</dt><dd>${x.cyc} @ ${fx(x.cycDod * 100, 0)} %</dd><dt>${L('Eficiencia', 'Efficiency')}</dt><dd>${fx(x.eta * 100, 0)} %</dd><dt>${L('Vida calendario', 'Calendar life')}</dt><dd>${x.life} ${L('años', 'years')}</dd><dt>${L('Peso', 'Weight')}</dt><dd>${x.mass} kg</dd></dl></button>`).join('')}</div>
      </div>
      <div class="grid g-side" style="margin-top:24px">
        <div class="card"><h3>${L('Configuración del banco', 'Bank configuration')}</h3>
          ${F(L('Baterías en serie', 'Batteries in series'), 'bat.ns', 1, 16, 1)}${F(L('Ramas en paralelo', 'Parallel strings'), 'bat.np', 1, 8, 1)}${F(L('Estado de carga inicial', 'Initial state of charge'), 'bat.soc0', 0.05, 1, 0.05, '0–1')}
          <h4>${L('Características del banco', 'Bank characteristics')}</h4>
          <div class="kpis">${kpi(L('Voltaje nominal', 'Nominal voltage'), fx(bm.Vn, 1), 'V')}${kpi(L('Capacidad', 'Capacity'), fx(bm.Q, 0), 'Ah')}${kpi(L('Energía total', 'Total energy'), fx(bm.Ecap, 2), 'kWh')}${kpi(L('Energía útil', 'Usable energy'), fx(bm.Ecap_use, 2), 'kWh', 'hl')}${kpi(L('Autonomía', 'Autonomy'), fx(bm.Ecap_use / Math.max(dayE, 0.01), 1), L('días', 'days'))}${kpi(L('Peso total', 'Total weight'), fx(b.mass * S.bat.ns * S.bat.np, 0), 'kg')}${kpi(L('Resistencia interna', 'Internal resistance'), fx(bm.R * 1000, 1), 'mΩ')}${kpi(L('Baterías', 'Batteries'), S.bat.ns * S.bat.np)}</div>
          <div id="batWarn"></div>
          <p class="note">${L(`Autonomía calculada con el consumo diario de la carga (${fx(dayE, 2)} kWh/día) y la energía útil según la profundidad de descarga recomendada.`, `Autonomy computed with the daily load consumption (${fx(dayE, 2)} kWh/day) and usable energy at the recommended depth of discharge.`)}</p>
        </div>
        <div class="card"><h3>${L('Curvas de descarga del banco', 'Bank discharge curves')}</h3><p class="sub">${L('Voltaje en bornes según la profundidad de descarga para distintas corrientes (C/n).', 'Terminal voltage versus depth of discharge for different currents (C/n).')}</p>${chartBox('cBat', 'h380', 'curvas-descarga')}</div>
      </div>
      <div class="card" style="margin-top:24px"><h3>${L('Comparación de tecnologías para este sistema', 'Technology comparison for this system')}</h3><p class="sub">${L('Mismo voltaje del banco; capacidad ajustada para la misma energía útil.', 'Same bank voltage; capacity adjusted for the same usable energy.')}</p><div class="tscroll" id="batCmp"></div></div>`;
    $('p-bat').querySelectorAll('[data-bat]').forEach(x => x.onclick = () => { S.bat.id = x.dataset.bat; DAY = YEAR = null; refresh(); pageBat(); });
    bindFields($('p-bat'), () => { DAY = YEAR = null; refresh(); pageBat(); });
    bindExports($('p-bat'));
    const warn = [];
    if (C.inv.id !== 'none' && Math.abs(C.inv.Vdc - bm.Vn) / C.inv.Vdc > 0.15) warn.push(L(`El inversor seleccionado es de ${C.inv.Vdc} V CC y el banco es de ${fx(bm.Vn, 1)} V. Ajusta las baterías en serie o cambia el inversor.`, `The selected inverter is ${C.inv.Vdc} V DC and the bank is ${fx(bm.Vn, 1)} V. Adjust series batteries or change the inverter.`));
    $('batWarn').innerHTML = warn.map(w => `<div class="alert warn">${w}</div>`).join('');
    const rates = [20, 10, 5, 2], cols = [css('--s1'), css('--s3'), css('--s4'), css('--s2')], xs = [];
    for (let i = 0; i <= 100; i++) xs.push(i);
    CHART.draw($('cBat'), { xs, series: rates.map((n, i) => ({ ys: xs.map(d => { const soc = 1 - d / 100, I = bm.Q / n; const v = bm.vt(soc, I); return v; }), color: cols[i], label: `C/${n}` })), xl: L('Profundidad de descarga (%)', 'Depth of discharge (%)'), yl: L('Voltaje del banco (V)', 'Bank voltage (V)'), yminL: Math.floor(bm.Vcut * 0.95), ymaxL: bm.vt(1, 0) * 1.02, xmax: 100, xstep: 10 });
    const Euse = bm.Ecap_use;
    $('batCmp').innerHTML = `<table class="t"><thead><tr><th>${L('Tecnología', 'Technology')}</th><th>${L('Capacidad', 'Capacity')}</th><th>${L('Energía total', 'Total energy')}</th><th>${L('Peso', 'Weight')}</th><th>${L('Ciclos a la DoD', 'Cycles at DoD')}</th><th>${L('Eficiencia', 'Efficiency')}</th><th>${L('Vida calendario', 'Calendar life')}</th></tr></thead><tbody>
      ${SYS.BATTERIES.filter((x, i, a) => a.findIndex(y => y.tech === x.tech) === i).map(x => { const Q = Euse * 1000 / (bm.Vn * x.dod), units = Math.ceil(Q / x.C) * Math.max(1, Math.round(bm.Vn / x.V)); return `<tr class="${x.tech === b.tech ? 'sel' : ''}"><td>${techN[x.tech]}</td><td class="num">${fx(Q, 0)} Ah</td><td class="num">${fx(Q * bm.Vn / 1000, 1)} kWh</td><td class="num">≈ ${fx(units * x.mass, 0)} kg</td><td class="num">${x.cyc} @ ${fx(x.cycDod * 100, 0)} %</td><td class="num">${fx(x.eta * 100, 0)} %</td><td class="num">${x.life} ${L('años', 'yr')}</td></tr>`; }).join('')}
      </tbody></table><p class="note">${L('Valores típicos de catálogo de fabricantes para cada tecnología; consulta la hoja técnica del modelo exacto antes de dimensionar.', 'Typical manufacturer catalog values for each technology; check the exact model datasheet before sizing.')}</p>`;
  }

  /* ======================= Página 5: Conversión y distribución ======================= */
  function pageConv() {
    const C = SIM.components(S), bm = C.bm, inv = C.inv, r = OP ? OP.r : null;
    const awgOpts = SYS.AWG.map(a => [a.g, `${a.g} AWG · ${a.A} mm²`]), matOpts = [['cu', L('Cobre', 'Copper')], ['al', L('Aluminio', 'Aluminum')]];
    const Vac = inv.id === 'none' ? bm.Vn : inv.Vac;
    const Ipv = OP && OP.mt ? OP.mt.Imp : 0, Vpv = OP && OP.mt ? OP.mt.Vmp : 0;
    const PinvIn = SYS.invInput(inv, S.load.P), Ibat = PinvIn / bm.Vn, Iac = S.load.P / (Vac * S.load.pf);
    const segs = [
      ['pv', L('Arreglo FV → controlador (CC)', 'PV array → controller (DC)'), Ipv, Vpv, 3],
      ['bat', L('Batería → inversor (CC)', 'Battery → inverter (DC)'), Ibat, bm.Vn, 2],
      ['ac', inv.id === 'none' ? L('Línea de distribución a la carga (CC)', 'Distribution line to load (DC)') : L('Línea de distribución a la carga (CA)', 'Distribution line to load (AC)'), Iac, Vac, 3]
    ];
    $('p-conv').innerHTML = `
      <div class="intro"><h2>${L('Conversión, distribución y carga', 'Conversion, distribution and load')}</h2><p>${L('Controlador de carga, inversor, conductores y línea de distribución hasta la carga. Se calculan la caída de tensión, las pérdidas y la ampacidad de cada tramo.', 'Charge controller, inverter, conductors and the distribution line to the load. Voltage drop, losses and ampacity are computed for each segment.')}</p></div>
      <div class="card"><h3>${L('Diagrama unifilar', 'Single-line diagram')}</h3><p class="sub">${L('Valores en la condición actual (carga pico).', 'Values at the current condition (peak load).')}</p><div style="overflow-x:auto" id="sld"></div></div>
      <div class="grid g-3" style="margin-top:24px">
        <div class="card"><h3>${L('Controlador de carga', 'Charge controller')}</h3>
          ${Sel(L('Tipo de seguimiento', 'Tracking type'), 'ctl.mode', [['mppt', L('MPPT ideal (máximo global)', 'Ideal MPPT (global maximum)')], ['po', L('MPPT Perturbar y Observar', 'MPPT Perturb and Observe')], ['pwm', L('PWM (acople directo)', 'PWM (direct coupling)')]])}
          ${S.ctl.mode !== 'pwm' ? F(L('Eficiencia del convertidor', 'Converter efficiency'), 'ctl.eta', 0.8, 1, 0.005) : ''}
          ${F(L('SOC de fin de carga', 'End-of-charge SOC'), 'ctl.socMax', 0.5, 1, 0.01)}
          ${Sw(L('Desconexión por bajo voltaje automática', 'Automatic low-voltage disconnect'), 'ctl.lvdAuto', L(`Según la DoD de la batería (SOC ${fx((1 - C.bat.dod) * 100, 0)} %)`, `From battery DoD (SOC ${fx((1 - C.bat.dod) * 100, 0)} %)`))}
          ${!S.ctl.lvdAuto ? F(L('SOC de desconexión', 'Disconnect SOC'), 'ctl.lvd', 0, 0.8, 0.01) : ''}
        </div>
        <div class="card"><h3>${L('Inversor', 'Inverter')}</h3>
          <select class="sel" id="invSel">${SYS.INVERTERS.map(x => `<option value="${x.id}" ${x.id === S.inv.id ? 'selected' : ''}>${esc(L(x.name.es, x.name.en))}</option>`).join('')}</select>
          ${inv.id !== 'none' ? `<div class="kv" style="margin-top:14px"><span>${L('Potencia nominal', 'Rated power')}</span><span>${fx(inv.P, 0)} W</span><span>${L('Eficiencia máxima', 'Peak efficiency')}</span><span>${fx(inv.eta * 100, 1)} %</span><span>${L('Consumo en vacío', 'No-load consumption')}</span><span>${fx(SYS.invParams(inv).P0, 1)} W</span><span>${L('Eficiencia a la carga pico', 'Efficiency at peak load')}</span><span>${fx(S.load.P / PinvIn * 100, 1)} %</span></div>
          ${Sw(L('Encendido las 24 h (consumo en vacío)', 'On 24 h (no-load consumption)'), 'inv.alwaysOn')}` : ''}
          <div id="invWarn"></div>
          ${inv.id !== 'none' ? `<div style="margin-top:12px">${chartBox('cInv', 'h260', 'eficiencia-inversor')}</div>` : ''}
        </div>
        <div class="card"><h3>${L('Carga', 'Load')}</h3>
          ${F(L('Potencia pico', 'Peak power'), 'load.P', 0, 10000, 10, 'W')}
          ${Sel(L('Perfil diario', 'Daily profile'), 'load.prof', [['res', L('Residencial', 'Residential')], ['com', L('Comercial / escuela', 'Commercial / school')], ['flat', L('Constante', 'Constant')]])}
          ${F(L('Factor de potencia', 'Power factor'), 'load.pf', 0.5, 1, 0.01)}
          <div class="kpis" style="margin-top:12px">${kpi(L('Consumo diario', 'Daily consumption'), fx(S.load.P * SYS.LOADPROF[S.load.prof].reduce((a, x) => a + x, 0) / 1000, 2), 'kWh')}</div>
          <div style="margin-top:12px">${chartBox('cLoad', 'h260', 'perfil-carga')}</div>
        </div>
      </div>
      <div class="card" style="margin-top:24px"><h3>${L('Conductores y línea de distribución', 'Conductors and distribution line')}</h3><p class="sub">${L('Resistencia de ida y vuelta con corrección por temperatura. Recomendación: caída ≤ 3 % en CC y en la línea de distribución; ampacidad ≥ 125 % de la corriente (NEC).', 'Round-trip resistance with temperature correction. Recommendation: drop ≤ 3 % on DC and on the distribution line; ampacity ≥ 125 % of current (NEC).')}</p>
        <div class="tscroll"><table class="t"><thead><tr><th>${L('Tramo', 'Segment')}</th><th>${L('Longitud', 'Length')} (m)</th><th>${L('Calibre', 'Gauge')}</th><th>${L('Material', 'Material')}</th><th>I (A)</th><th>V (V)</th><th>ΔV</th><th>${L('Pérdida', 'Loss')}</th><th>${L('Ampacidad', 'Ampacity')}</th><th>${L('Sugerido', 'Suggested')}</th></tr></thead><tbody>
        ${segs.map(([k, lab, I, V, lim]) => { const w = S.wires[k], c = SYS.wireCheck(w, I, V, 50), sug = SYS.wireSuggest(w, I, V, lim, 50); return `<tr><td>${lab}</td><td><input class="inp" style="width:90px" type="number" data-p="wires.${k}.len" value="${w.len}" min="0.5" max="3000" step="0.5"></td><td><select class="inp" style="width:150px;font-family:var(--sans)" data-p="wires.${k}.awg">${awgOpts.map(([g, t]) => `<option value="${g}" ${g === w.awg ? 'selected' : ''}>${t}</option>`).join('')}</select></td><td><select class="inp" style="width:110px;font-family:var(--sans)" data-p="wires.${k}.mat">${matOpts.map(([g, t]) => `<option value="${g}" ${g === w.mat ? 'selected' : ''}>${t}</option>`).join('')}</select></td><td class="num">${fx(I, 1)}</td><td class="num">${fx(V, 0)}</td><td class="num"><span class="badge ${c.dVpct <= lim ? 'ok' : c.dVpct <= 2 * lim ? 'warn' : 'bad'}">${fx(c.dVpct, 2)} %</span></td><td class="num">${fx(c.Ploss, 1)} W</td><td class="num"><span class="badge ${c.amp >= 1.25 * I ? 'ok' : 'bad'}">${fx(c.amp, 0)} A</span></td><td class="num">${sug} AWG</td></tr>`; }).join('')}
        </tbody></table></div>
        <div class="grid g-2" style="margin-top:20px">
          <div><h4>${L('Pérdidas en la línea según la distancia', 'Line losses versus distance')}</h4>${chartBox('cLine', 'h300', 'perdidas-linea')}</div>
          <div><h4>${L('¿Por qué importa el voltaje de distribución?', 'Why does distribution voltage matter?')}</h4><p class="note" style="margin-top:0">${L('Para la misma potencia, la corriente es inversamente proporcional al voltaje y las pérdidas crecen con el cuadrado de la corriente (P = I²R). Duplicar el voltaje de 120 V a 240 V reduce las pérdidas a la cuarta parte con el mismo conductor. Por eso la energía se transmite a alto voltaje y se distribuye a 120/240 V cerca de la carga.', 'For the same power, current is inversely proportional to voltage and losses grow with the square of the current (P = I²R). Doubling the voltage from 120 V to 240 V cuts losses to one quarter with the same conductor. That is why energy is transmitted at high voltage and distributed at 120/240 V close to the load.')}</p><div class="kpis" id="lineK" style="margin-top:12px"></div></div>
        </div>
      </div>`;
    const P = $('p-conv');
    $('invSel').onchange = e => { S.inv.id = e.target.value; DAY = YEAR = null; refresh(); pageConv(); };
    bindFields(P, () => { DAY = YEAR = null; refresh(); pageConv(); });
    bindExports(P);
    const warn = [];
    if (inv.id !== 'none' && Math.abs(inv.Vdc - bm.Vn) / inv.Vdc > 0.15) warn.push(['bad', L(`Voltaje incompatible: inversor de ${inv.Vdc} V CC con banco de ${fx(bm.Vn, 1)} V.`, `Incompatible voltage: ${inv.Vdc} V DC inverter with a ${fx(bm.Vn, 1)} V bank.`)]);
    if (inv.id !== 'none' && S.load.P > inv.P) warn.push(['bad', L('La carga pico supera la potencia nominal del inversor.', 'Peak load exceeds the inverter rated power.')]);
    if (inv.id !== 'none' && S.load.P < 0.1 * inv.P) warn.push(['warn', L('El inversor está sobredimensionado: trabajará con baja eficiencia la mayor parte del tiempo.', 'The inverter is oversized: it will run at low efficiency most of the time.')]);
    $('invWarn').innerHTML = warn.map(([c, w]) => `<div class="alert ${c}">${w}</div>`).join('');
    if ($('cInv')) { const xs = []; for (let i = 1; i <= 100; i++) xs.push(i); CHART.draw($('cInv'), { xs, series: [{ ys: xs.map(p => { const Po = p / 100 * inv.P; return Po / SYS.invInput(inv, Po) * 100; }), color: css('--s1'), label: L('Eficiencia', 'Efficiency') }], pts: [{ x: S.load.P / inv.P * 100, y: S.load.P / PinvIn * 100, color: css('--accent'), label: L('carga pico', 'peak load') }], xl: L('Carga (% de la nominal)', 'Load (% of rated)'), yl: '%', ymaxL: 100, yminL: 50, xmax: 100, xstep: 20 }); }
    const prof = SYS.LOADPROF[S.load.prof], hx = []; for (let h = 0; h < 24; h++) hx.push(h + 0.5);
    CHART.draw($('cLoad'), { xs: hx, xmin: 0, xmax: 24, xstep: 6, series: [{ type: 'bar', ys: prof.map(x => x * S.load.P), color: css('--s2'), bw: 0.8, label: L('Demanda', 'Demand') }], xl: L('Hora', 'Hour'), yl: 'W', ymaxL: S.load.P * 1.1 || 1 });
    // pérdidas en la línea vs distancia para 120 y 240 V
    const xs = []; for (let d = 0; d <= 500; d += 10) xs.push(d);
    const wl = S.wires.ac, Pld = Math.max(S.load.P, 1);
    const lossPct = V => xs.map(d => { const R = SYS.wireR({ ...wl, len: d }, 50), I = Pld / (V * S.load.pf); return I * I * R / Pld * 100; });
    CHART.draw($('cLine'), { xs, series: [{ ys: lossPct(120), color: css('--s2'), label: '120 V' }, { ys: lossPct(240), color: css('--s1'), label: '240 V' }, { ys: xs.map(() => 3), color: css('--s6'), dash: [5, 5], w: 1.2, label: L('límite 3 %', '3 % limit') }], xl: L('Longitud de la línea (m)', 'Line length (m)'), yl: L('Pérdida (% de la potencia)', 'Loss (% of power)'), ymaxL: Math.min(30, Math.max(5, ...lossPct(120)) * 1.05), xmax: 500, xstep: 50 });
    const c120 = SYS.wireCheck(wl, Pld / (120 * S.load.pf), 120, 50), c240 = SYS.wireCheck(wl, Pld / (240 * S.load.pf), 240, 50);
    $('lineK').innerHTML = kpi(L(`Pérdida a 120 V (${wl.len} m)`, `Loss at 120 V (${wl.len} m)`), fx(c120.Ploss / Pld * 100, 2), '%') + kpi(L(`Pérdida a 240 V (${wl.len} m)`, `Loss at 240 V (${wl.len} m)`), fx(c240.Ploss / Pld * 100, 2), '%', 'ok');
    drawSLD();
  }
  function drawSLD() {
    if (!$('sld') || !OP) return;
    const C = OP.C, r = OP.r, inv = C.inv;
    const box = (x, label, val, col) => `<g transform="translate(${x},40)"><rect width="170" height="84" rx="10" fill="var(--surface2)" stroke="${col}" stroke-width="2"/><text x="85" y="28" text-anchor="middle" font-size="14" font-weight="650" fill="var(--ink)">${label}</text><text x="85" y="52" text-anchor="middle" font-size="12" fill="var(--muted)">${val[0]}</text><text x="85" y="70" text-anchor="middle" font-size="12" fill="var(--muted)">${val[1] || ''}</text></g>`;
    const arrow = (x1, x2, lab, sub) => `<line x1="${x1}" y1="82" x2="${x2 - 6}" y2="82" stroke="var(--axis)" stroke-width="2"/><polygon points="${x2},82 ${x2 - 9},77 ${x2 - 9},87" fill="var(--axis)"/><text x="${(x1 + x2) / 2}" y="70" text-anchor="middle" font-size="12" fill="var(--ink2)" font-weight="600">${lab}</text><text x="${(x1 + x2) / 2}" y="104" text-anchor="middle" font-size="11.5" fill="var(--muted)">${sub}</text>`;
    const bm = C.bm;
    let h = `<svg width="1260" height="160" viewBox="0 0 1260 160" style="min-width:1060px;width:100%;height:auto">`;
    h += box(0, L('Arreglo FV', 'PV array'), [`${fx(OP.mt.Pmp, 0)} W MPP`, `${fx(r.Vop, 1)} V · ${fx(r.Ipv, 1)} A`], 'var(--s4)');
    h += arrow(170, 260, `${fx(r.Pdc, 0)} W`, `−${fx(r.loss.pvwire, 1)} W ${L('cable', 'cable')}`);
    h += box(260, L('Controlador', 'Controller'), [S.ctl.mode === 'pwm' ? 'PWM' : S.ctl.mode === 'po' ? 'MPPT P&O' : 'MPPT', `η ${fx((S.ctl.mode === 'pwm' ? 0.98 : S.ctl.eta) * 100, 1)} %`], 'var(--s1)');
    h += arrow(430, 520, `${fx(r.Pctl, 0)} W`, `${fx(bm.Vn, 0)} V ${L('CC', 'DC')}`);
    h += box(520, L('Batería', 'Battery'), [`${fx(bm.Vn, 1)} V · ${fx(bm.Ecap, 1)} kWh · SOC ${fx(S.bat.soc0 * 100, 0)} %`, `${r.Pb >= 0 ? L('cargando', 'charging') : L('descargando', 'discharging')} ${fx(Math.abs(r.Pb), 0)} W`], 'var(--s3)');
    if (inv.id !== 'none') {
      h += arrow(690, 780, `${fx(r.Idc, 1)} A`, `−${fx(r.loss.batwire, 1)} W ${L('cable', 'cable')}`);
      h += box(780, L('Inversor', 'Inverter'), [`${fx(inv.P, 0)} W · ${inv.Vac} V ${L('CA', 'AC')}`, `${L('pérdida', 'loss')} ${fx(r.loss.inv, 0)} W`], 'var(--s5)');
      h += arrow(950, 1060, `${fx(r.Iac, 2)} A`, `${S.wires.ac.len} m · −${fx(r.loss.ac, 1)} W`);
    } else h += arrow(690, 1060, `${fx(r.Iac, 2)} A ${L('CC', 'DC')}`, `${S.wires.ac.len} m · −${fx(r.loss.ac, 1)} W`);
    h += box(1060, L('Carga', 'Load'), [`${fx(r.served, 0)} W`, r.note === 'lvd' ? L('desconectada (LVD)', 'disconnected (LVD)') : `FP ${S.load.pf}`], 'var(--s2)');
    h += '</svg>';
    $('sld').innerHTML = h;
  }

  /* ======================= Página 6: Simulación ======================= */
  function pageSim() {
    $('p-sim').innerHTML = `
      <div class="intro"><h2>${L('Simulación del sistema completo', 'Full system simulation')}</h2><p>${L('Un día con paso de 15 minutos o un año completo hora por hora, con el patrón de sombras del esquema, el clima del sitio, el controlador, la batería, el inversor y los conductores.', 'One day at 15-minute steps or a full year hour by hour, with the schematic shading pattern, site weather, controller, battery, inverter and conductors.')}</p></div>
      <div class="card"><div class="chead"><div><h3 id="dayT">${L('Simulación de un día', 'One-day simulation')}</h3><p class="sub" id="daySub"></p></div><div class="btns"><input type="date" class="inp" style="width:170px;font-family:var(--sans)" id="simDate" value="${S.site.date}"><button class="btn pri" id="btnDay">${L('Simular día', 'Simulate day')}</button></div></div>
        ${chartBox('cDay', 'h380', 'simulacion-dia')}
        <div class="kpis" id="dayM" style="margin-top:16px"></div>
      </div>
      <div class="card" style="margin-top:24px"><div class="chead"><div><h3>${L('Simulación anual', 'Annual simulation')}</h3><p class="sub">${L('8 760 horas con el año meteorológico típico. Tarda unos segundos.', '8,760 hours with the typical meteorological year. Takes a few seconds.')}</p></div><button class="btn pri" id="btnYear">${L('Simular año', 'Simulate year')}</button></div>
        <div class="progress" id="yProg" style="display:none"><i></i></div>
        <div id="yearOut"></div>
      </div>`;
    $('simDate').onchange = e => { if (e.target.value) { S.site.date = e.target.value; DAY = null; runDay(); } };
    $('btnDay').onclick = runDay; $('btnYear').onclick = runYear;
    bindExports($('p-sim'));
    if (DAY) drawDay(); else runDay();
    if (YEAR) drawYear();
  }
  function runDay() { loadTmy().then(() => { DAY = SIM.simDay(S, useTmy(), SOLAR.doyOf(S.site.date)); drawDay(); }); }
  function drawDay() {
    if (!$('cDay') || !DAY) return;
    const s = DAY.series, E = DAY.E, mx = Math.max(...s.pmpp, ...s.dem, 1);
    CHART.draw($('cDay'), { xs: s.t, xmax: 24, xstep: 3, series: [{ ys: s.pmpp, color: css('--s4'), w: 1.4, dash: [5, 4], label: L('P máxima disponible', 'Max available P') }, { ys: s.ppv, color: css('--s1'), fill: true, label: L('P FV entregada', 'Delivered PV power') }, { ys: s.dem, color: css('--s2'), w: 1.4, dash: [2, 3], label: L('Demanda', 'Demand') }, { ys: s.load, color: css('--s2'), label: L('Carga atendida', 'Load served') }, { ys: s.soc, color: css('--s3'), side: 'r', label: 'SOC' }], xl: L('Hora del día', 'Time of day'), yl: L('Potencia (W)', 'Power (W)'), yr: 'SOC (%)', ymaxL: mx * 1.1, ymaxR: 100 });
    const city = S.site.city === 'custom' ? L('sitio personalizado', 'custom site') : CITIES[S.site.city].name;
    $('daySub').textContent = `${city} · ${S.site.date} · ${useTmy() ? 'PVGIS TMY' : L('cielo despejado', 'clear sky')}`;
    const unserved = E.Edem - E.Eserved;
    $('dayM').innerHTML = kpi(L('Irradiación en el plano', 'Plane-of-array irradiation'), fx(E.Hpoa / 1000, 2), 'kWh/m²') + kpi(L('Energía FV entregada', 'Delivered PV energy'), fx(E.Ectl / 1000, 2), 'kWh', 'hl') + kpi(L('Energía demandada', 'Energy demanded'), fx(E.Edem / 1000, 2), 'kWh') + kpi(L('Energía atendida', 'Energy served'), fx(E.Eserved / 1000, 2), 'kWh') + kpi(L('No atendida', 'Unserved'), fx(unserved / 1000, 2), 'kWh', unserved > 1 ? 'bad' : 'ok') + kpi(L('Energía desperdiciada (batería llena)', 'Curtailed energy (battery full)'), fx(E.Ecurt / 1000, 2), 'kWh') + kpi(L('SOC final', 'Final SOC'), fx(E.socEnd * 100, 1), '%') + kpi(L('SOC mínimo', 'Minimum SOC'), fx(E.socMin * 100, 1), '%');
  }
  function runYear() {
    $('yProg').style.display = 'block'; $('btnYear').disabled = true;
    loadTmy().then(() => SIM.simYear(S, useTmy(), p => { const b = $('yProg'); if (b) b.firstChild.style.width = (p * 100) + '%'; })).then(res => { YEAR = res; if ($('btnYear')) { $('btnYear').disabled = false; $('yProg').style.display = 'none'; } drawYear(); });
  }
  function drawYear() {
    const el = $('yearOut'); if (!el || !YEAR) return;
    const E = YEAR.E, Pk = kWp() || 1, months = L('Ene Feb Mar Abr May Jun Jul Ago Sep Oct Nov Dic', 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec').split(' ');
    const yieldK = E.Ectl / 1000 / Pk, PR = E.Ectl / 1000 / (E.Hpoa / 1000 * Pk), cover = E.Eserved / Math.max(E.Edem, 1);
    el.innerHTML = `<div class="kpis" style="margin-top:6px">${kpi(L('Energía FV entregada', 'Delivered PV energy'), fx(E.Ectl / 1000, 0), 'kWh/' + L('año', 'yr'), 'hl')}${kpi(L('Producción específica', 'Specific yield'), fx(yieldK, 0), 'kWh/kWp')}${kpi(L('Índice de rendimiento (PR)', 'Performance ratio (PR)'), fx(PR * 100, 1), '%')}${kpi(L('Demanda cubierta', 'Load covered'), fx(cover * 100, 1), '%', cover < 0.95 ? 'bad' : 'ok')}${kpi(L('Horas sin servicio', 'Hours without service'), E.hoursLost, 'h', E.hoursLost > 0 ? 'bad' : 'ok')}${kpi(L('Energía desperdiciada', 'Curtailed energy'), fx(E.Ecurt / 1000, 0), 'kWh')}${kpi(L('Ciclos equivalentes', 'Equivalent cycles'), fx(E.cycles, 0), '/' + L('año', 'yr'))}${kpi(L('Vida estimada de la batería', 'Estimated battery life'), fx(E.batLife, 1), L('años', 'years'))}</div>
      <div class="grid g-2" style="margin-top:24px">
        <div><h4>${L('Energía mensual', 'Monthly energy')}</h4>${chartBox('cYear', 'h340', 'energia-mensual')}</div>
        <div><h4>${L('Flujo de energía y pérdidas', 'Energy flow and losses')}</h4><div class="flow" id="flow"></div></div>
      </div>`;
    const xs = months.map((_, i) => i + 1), m = YEAR.monthly;
    CHART.draw($('cYear'), { xs, xmin: 0.5, xmax: 12.5, xticks: xs.map((x, i) => ({ x, label: months[i] })), series: [{ type: 'bar', ys: m.map(x => x.Ectl / 1000), color: css('--s1'), bw: 0.28, off: -0.28, label: L('FV entregada', 'PV delivered') }, { type: 'bar', ys: m.map(x => x.Eserved / 1000), color: css('--s3'), bw: 0.28, off: 0, label: L('Carga atendida', 'Load served') }, { type: 'bar', ys: m.map(x => (x.Edem - x.Eserved) / 1000), color: css('--s2'), bw: 0.28, off: 0.28, label: L('No atendida', 'Unserved') }], xl: L('Mes', 'Month'), yl: 'kWh', ymaxL: Math.max(...m.map(x => x.Ectl / 1000), ...m.map(x => x.Edem / 1000)) * 1.1 });
    const Lr = E.L, rows = [
      [L('Disponible en el MPP del arreglo', 'Available at array MPP'), E.Empp, 'in'],
      [L('Pérdida de seguimiento MPPT', 'MPPT tracking loss'), -Lr.track], [L('Mismatch y tolerancia', 'Mismatch & tolerance'), -Lr.mism], [L('Cableado del arreglo', 'Array wiring'), -Lr.pvwire], [L('Controlador de carga', 'Charge controller'), -Lr.ctl],
      [L('Desperdiciada (batería llena)', 'Curtailed (battery full)'), -E.Ecurt], [L('Pérdidas internas de la batería', 'Battery internal losses'), -Lr.batint], [L('Cable batería–inversor', 'Battery–inverter cable'), -Lr.batwire], [L('Inversor', 'Inverter'), -Lr.inv], [L('Línea de distribución', 'Distribution line'), -Lr.ac],
      [L('Energía entregada a la carga', 'Energy delivered to load'), E.Eserved, 'out']
    ];
    const mxv = E.Empp || 1;
    $('flow').innerHTML = rows.map(([l, v, t]) => `<div class="row"><span class="lbl">${l}</span><span><span class="bar ${t || 'loss'}" style="display:block;width:${Math.max(0.3, Math.abs(v) / mxv * 100)}%"></span></span><span class="val">${v < 0 ? '−' : ''}${fx(Math.abs(v) / 1000, 1)} kWh</span></div>`).join('') + `<p class="note">${L('La batería también cambia de estado de carga entre el inicio y el final del año; por eso el balance no cierra exactamente.', 'The battery state of charge also changes between the start and end of the year, so the balance does not close exactly.')}</p>`;
    bindExports(el);
  }

  /* ======================= Página 7: Metodología ======================= */
  function pageAbout() {
    $('p-about').innerHTML = `
      <div class="intro"><h2>${L('Metodología y modelos', 'Methodology and models')}</h2><p>${L('Resumen de las ecuaciones, supuestos y fuentes de datos del simulador.', 'Summary of the simulator equations, assumptions and data sources.')}</p></div>
      <div class="grid g-2">
        <div class="card"><h3>${L('Celda y módulo', 'Cell and module')}</h3>
          <p class="note">${L('Modelo de un diodo con resistencias serie y paralelo [1] y término de ruptura en inversa de Bishop [5]:', 'Single-diode model with series and shunt resistances [1] and Bishop reverse-breakdown term [5]:')}</p>
          <div class="eq">I = I<sub>ph</sub> − I<sub>0</sub>[e<sup>V<sub>d</sub>/(nV<sub>t</sub>)</sup> − 1] − (V<sub>d</sub>/R<sub>sh</sub>)[1 + a(1 − V<sub>d</sub>/V<sub>br</sub>)<sup>−m</sup>],&nbsp; V = V<sub>d</sub> − IR<sub>s</sub></div>
          <p class="note">${L('I<sub>ph</sub> varía con la irradiancia y α<sub>Isc</sub>; I<sub>0</sub> se calcula para reproducir V<sub>oc</sub>(T) con β<sub>Voc</sub> [1]; R<sub>sh</sub> ∝ 1/G [2]. R<sub>s</sub> y R<sub>sh</sub> se ajustan para que el modelo pase por (V<sub>mp</sub>, I<sub>mp</sub>) con dP/dV = 0 [1]. Diodos bypass Schottky con modelo exponencial.', 'I<sub>ph</sub> varies with irradiance and α<sub>Isc</sub>; I<sub>0</sub> is computed to reproduce V<sub>oc</sub>(T) with β<sub>Voc</sub> [1]; R<sub>sh</sub> ∝ 1/G [2]. R<sub>s</sub> and R<sub>sh</sub> are fitted so the model passes through (V<sub>mp</sub>, I<sub>mp</sub>) with dP/dV = 0 [1]. Schottky bypass diodes with an exponential model.')}</p>
          <h4>MPPT</h4><p class="note">${L('Ideal: máximo global de la curva P‑V. Perturbar y Observar [6], [7]: escalado de colina desde el voltaje anterior, que puede quedar en un máximo local con sombras parciales [3]. PWM: el arreglo opera al voltaje de la batería.', 'Ideal: global maximum of the P‑V curve. Perturb and Observe [6], [7]: hill climbing from the previous voltage, which can stay on a local peak under partial shading [3]. PWM: the array operates at the battery voltage.')}</p>
        </div>
        <div class="card"><h3>${L('Recurso solar y temperatura', 'Solar resource and temperature')}</h3>
          <p class="note">${L('Posición solar con declinación de Cooper, ecuación del tiempo de Spencer y ángulo horario [10]. Datos horarios TMY de PVGIS 5.2 (radiación PVGIS‑NSRDB, meteorología ERA5, 2005–2015). Sin datos: cielo despejado de Meinel [13] × índice de cielo claro, con separación directa/difusa de Erbs.', 'Solar position with Cooper declination, Spencer equation of time and hour angle [10]. Hourly TMY data from PVGIS 5.2 (PVGIS‑NSRDB radiation, ERA5 meteorology, 2005–2015). Without data: Meinel clear sky [13] × clear-sky index, with Erbs beam/diffuse split.')}</p>
          <div class="eq">G<sub>POA</sub> = G<sub>b</sub>cos θ + G<sub>d</sub>[(1 − A<sub>i</sub>)(1 + cos β)/2 + A<sub>i</sub>R<sub>b</sub>] + ρG<sub>h</sub>(1 − cos β)/2 &nbsp;(Hay–Davies)</div>
          <div class="eq">T<sub>c</sub> = T<sub>a</sub> + G<sub>POA</sub>/(U<sub>0</sub> + U<sub>1</sub>·v), &nbsp;U<sub>0</sub> = 25 W/m²K, U<sub>1</sub> = 6,84 W·s/m³K &nbsp;(Faiman)</div>
          <p class="note">${L('Pérdidas por ángulo de incidencia ASHRAE: IAM = 1 − b<sub>0</sub>(1/cos θ − 1). Las sombras del esquema escalan la irradiancia de cada celda.', 'ASHRAE incidence angle losses: IAM = 1 − b<sub>0</sub>(1/cos θ − 1). Schematic shading scales the irradiance of each cell.')}</p>
        </div>
        <div class="card"><h3>${L('Batería', 'Battery')}</h3>
          <div class="eq">V = E<sub>0</sub> − S·(it/Q) − K·Q/(Q − it)·it + A·e<sup>−B·it</sup> − R·i</div>
          <p class="note">${L('Modelo de Shepherd modificado (Tremblay et al., 2007) con un término lineal para plomo‑ácido. Descarga con ley de Peukert (exponente k), carga con eficiencia coulómbica. Vida: ciclos a la DoD media (ley de potencia, exponente 1,3) limitada por la vida calendario.', 'Modified Shepherd model (Tremblay et al., 2007) with a linear term for lead-acid. Discharge with Peukert law (exponent k), charge with coulombic efficiency. Life: cycles at mean DoD (power law, exponent 1.3) capped by calendar life.')}</p>
        </div>
        <div class="card"><h3>${L('Inversor y conductores', 'Inverter and conductors')}</h3>
          <div class="eq">P<sub>in</sub> = P<sub>out</sub> + P<sub>0</sub> + k·P<sub>out</sub>²/P<sub>n</sub> &nbsp;&nbsp; R = 2ρ(1 + α(T − 20))L/A</div>
          <p class="note">${L('Eficiencia máxima al 25 % de la carga nominal. Conductores de cobre o aluminio, resistencia de ida y vuelta a 50 °C, ampacidad según NEC 310.16 (75 °C).', 'Peak efficiency at 25 % of rated load. Copper or aluminum conductors, round-trip resistance at 50 °C, ampacity per NEC 310.16 (75 °C).')}</p>
        </div>
      </div>
      <div class="card" style="margin-top:24px"><h3>${L('Referencias', 'References')}</h3><ol class="refs">
        <li>M. G. Villalva, J. R. Gazoli, and E. Ruppert F., "Comprehensive approach to modeling and simulation of photovoltaic arrays," <i>IEEE Trans. Power Electron.</i>, vol. 24, no. 5, pp. 1198–1208, 2009.</li>
        <li>W. De Soto, S. A. Klein, and W. A. Beckman, "Improvement and validation of a model for photovoltaic array performance," <i>Solar Energy</i>, vol. 80, no. 1, pp. 78–88, 2006.</li>
        <li>H. Patel and V. Agarwal, "MATLAB-based modeling to study the effects of partial shading on PV array characteristics," <i>IEEE Trans. Energy Convers.</i>, vol. 23, no. 1, pp. 302–310, 2008.</li>
        <li>V. Quaschning and R. Hanitsch, "Numerical simulation of current-voltage characteristics of photovoltaic systems with shaded solar cells," <i>Solar Energy</i>, vol. 56, no. 6, pp. 513–520, 1996.</li>
        <li>J. W. Bishop, "Computer simulation of the effects of electrical mismatches in photovoltaic cell interconnection circuits," <i>Solar Cells</i>, vol. 25, no. 1, pp. 73–89, 1988.</li>
        <li>T. Esram and P. L. Chapman, "Comparison of photovoltaic array maximum power point tracking techniques," <i>IEEE Trans. Energy Convers.</i>, vol. 22, no. 2, pp. 439–449, 2007.</li>
        <li>N. Femia, G. Petrone, G. Spagnuolo, and M. Vitelli, "Optimization of perturb and observe maximum power point tracking method," <i>IEEE Trans. Power Electron.</i>, vol. 20, no. 4, pp. 963–973, 2005.</li>
        <li>O. Tremblay, L.-A. Dessaint, and A.-I. Dekkiche, "A generic battery model for the dynamic simulation of hybrid electric vehicles," in <i>Proc. IEEE Vehicle Power and Propulsion Conf.</i>, 2007, pp. 284–289.</li>
        <li>D. G. Erbs, S. A. Klein, and J. A. Duffie, "Estimation of the diffuse radiation fraction for hourly, daily and monthly-average global radiation," <i>Solar Energy</i>, vol. 28, no. 4, pp. 293–302, 1982.</li>
        <li>J. A. Duffie, W. A. Beckman, and N. Blair, <i>Solar Engineering of Thermal Processes, Photovoltaics and Wind</i>, 5th ed. Hoboken, NJ, USA: Wiley, 2020.</li>
        <li>D. Faiman, "Assessing the outdoor operating temperature of photovoltaic modules," <i>Prog. Photovolt.: Res. Appl.</i>, vol. 16, no. 4, pp. 307–315, 2008.</li>
        <li>T. Huld, R. Müller, and A. Gambardella, "A new solar radiation database for estimating PV performance in Europe and Africa," <i>Solar Energy</i>, vol. 86, no. 6, pp. 1803–1815, 2012. ${L('Datos: PVGIS 5.2, Comisión Europea (JRC).', 'Data: PVGIS 5.2, European Commission (JRC).')}</li>
        <li>A. B. Meinel and M. P. Meinel, <i>Applied Solar Energy: An Introduction</i>. Reading, MA, USA: Addison-Wesley, 1976.</li>
        <li>${L('Base de datos de módulos e inversores CEC (California Energy Commission), distribuida con SAM (NREL) y pvlib-python, versión 2019-03-05.', 'CEC module and inverter database (California Energy Commission), distributed with SAM (NREL) and pvlib-python, version 2019-03-05.')}</li>
        <li>D. L. King, S. Gonzalez, G. M. Galbraith, and W. E. Boyson, "Performance model for grid-connected photovoltaic inverters," Sandia National Laboratories, SAND2007-5036, 2007.</li>
        <li>IEC TR 61000-3-6:2008, <i>Electromagnetic compatibility (EMC) – Part 3-6: Limits – Assessment of emission limits for the connection of distorting installations to MV, HV and EHV power systems</i>.</li>
        <li>${L('Comisión Reguladora de Energía Eléctrica (CREE), «Reglamento de la Ley General de la Industria Eléctrica», versión compilada, abr. 2026 (Título VII, Usuarios Autoproductores, Arts. 47–50).', 'Comisión Reguladora de Energía Eléctrica (CREE), “Reglamento de la Ley General de la Industria Eléctrica”, compiled version, Apr. 2026 (Title VII, Self-generating Users, Arts. 47–50).')}</li>
        <li>${L('CREE, «Norma Técnica de Calidad de Distribución», <i>La Gaceta</i>, No. 34,491, 14 nov. 2017.', 'CREE, “Norma Técnica de Calidad de Distribución”, <i>La Gaceta</i>, No. 34,491, Nov. 14, 2017.')}</li>
        <li>${L('CREE, Informe de la consulta pública de la Norma Técnica de Usuarios Autoproductores Residenciales y Comerciales, Acuerdo CREE-25-2022.', 'CREE, Public consultation report on the Technical Standard for Residential and Commercial Self-generating Users, Agreement CREE-25-2022.')}</li>
        <li>${L('CREE, Tarifas vigentes ENEE (a partir de octubre de 2026), cree.gob.hn.', 'CREE, ENEE tariffs in force (from October 2026), cree.gob.hn.')}</li>
      </ol></div>
      <div class="card" style="margin-top:24px"><h3>${L('Limitaciones', 'Limitations')}</h3><ul class="refs">
        <li>${L('Los parámetros de batería e inversor son típicos por tecnología, no de un modelo comercial específico.', 'Battery and inverter parameters are typical per technology, not from a specific commercial model.')}</li>
        <li>${L('Todas las celdas de la simulación horaria comparten la misma temperatura; el calentamiento de puntos calientes solo se estima en el punto de operación.', 'All cells in the hourly simulation share the same temperature; hot-spot heating is only estimated at the operating point.')}</li>
        <li>${L('El patrón de sombras es fijo durante todo el día y el año (no hay modelo geométrico de sombras).', 'The shading pattern is fixed for the whole day and year (no geometric shading model).')}</li>
        <li>${L('El paso horario no representa la dinámica rápida del algoritmo MPPT ni los transitorios de nubes.', 'The hourly time step does not capture fast MPPT dynamics or cloud transients.')}</li>
      </ul></div>`;
  }

  /* ======================= General ======================= */
  function renderPage() {
    stopPlay();
    const ext = window.PAGES_EXT || {};
    ({ gen: pageGen, iv: pageIV, site: pageSite, bat: pageBat, conv: pageConv, sim: pageSim, about: pageAbout, home: ext.home, grid: ext.grid, install: ext.install })[S.tab]();
  }
  function refresh() {
    ensure(); compute(); renderSummary();
    if (S.tab === 'gen') { refreshSizebar(); drawSch(); renderInsp(); renderBlocks(); }
    if (S.tab === 'iv') { drawIV(); }
    DAY = null; YEAR = S.tab === 'sim' ? YEAR : null;
  }
  function setLang(l) {
    LANG = l === 'en' ? 'en' : 'es'; document.documentElement.lang = LANG;
    document.title = L('Simulador Fotovoltaico', 'Photovoltaic Simulator');
    document.querySelectorAll('[data-en]').forEach(el => { if (el.dataset.es == null) el.dataset.es = el.innerHTML; el.innerHTML = LANG === 'en' ? el.dataset.en : el.dataset.es; });
    document.querySelectorAll('.lang button').forEach(b => b.classList.toggle('on', b.dataset.lang === LANG));
    try { localStorage.setItem('lang', LANG); } catch (e) { }
    try { const u = new URL(location.href); u.searchParams.set('lang', LANG); history.replaceState(null, '', u); } catch (e) { }
    $('foot').innerHTML = `${L('Seminario de Investigación · Ingeniería Eléctrica · Universidad Nacional Autónoma de Honduras', 'Research Seminar · Electrical Engineering · National Autonomous University of Honduras')}<br>Claudia Figueroa · Dennis Johan López · M.Sc. Daniel Flores`;
    applyModule(); compute(); renderTabs(); renderSummary(); renderPage();
  }
  window.APP = { S, get LANG() { return LANG; }, L, fx, esc, css, kpi, chartBox, bindExports, go, refresh: () => refresh(), applyModule, loadTmy, useTmy, CITIES, renderSummary };
  window.addEventListener('resize', () => { if (S.tab === 'iv') { drawIV(); renderValidation(); } if (S.tab === 'sim') { drawDay(); drawYear(); } if (S.tab === 'site') drawMonthly(); if (S.tab === 'bat' || S.tab === 'conv' || S.tab === 'grid') renderPage(); });
  document.querySelectorAll('.lang button').forEach(b => b.onclick = () => setLang(b.dataset.lang));

  // inicio
  (() => {
    let l = null; try { l = new URL(location.href).searchParams.get('lang'); } catch (e) { }
    if (!l) { try { l = localStorage.getItem('lang'); } catch (e) { } }
    if (!l) l = (navigator.language || 'es').toLowerCase().startsWith('es') ? 'es' : 'en';
    const h = (location.hash || '').slice(1).split('?')[0]; if (TABS.some(t => t[0] === h)) S.tab = h;
    LANG = l === 'en' ? 'en' : 'es';
    applyModule();
    loadTmy().finally(() => setLang(LANG));
  })();
})();
