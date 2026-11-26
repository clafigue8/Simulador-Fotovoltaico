/* =====================================================================
   Configuración del sitio administrable desde el panel (admin.html).
   - Valores por defecto (los originales del simulador).
   - Lee el documento sitio/config de Firestore (API REST, sin librerías) y lo
     guarda en el navegador para aplicarlo al instante en la siguiente visita.
   - Aplica: datos técnicos, equipos agregados u ocultos, textos, aviso,
     pestañas ocultas y colores.
   - Cuenta visitas de forma anónima (sección, celular/computadora, idioma, fecha).
   ===================================================================== */
(function () {
  'use strict';
  const FB = (window.SITE_CONFIG || {}).firebase || {};
  const LIVE = FB.apiKey && !/PEGAR_AQUI/.test(FB.apiKey);
  const REST = LIVE ? `https://firestore.googleapis.com/v1/projects/${FB.projectId}/databases/(default)/documents` : '';
  const KEY = 'sitio-config';

  /* ---------- Valores por defecto ---------- */
  const DEFAULTS = {
    tarifas: {   // CREE, estructura tarifaria ENEE a partir de octubre de 2026
      period: { es: 'octubre de 2026', en: 'October 2026' },
      res: { fixed: 59.74, e1: 5.0031, e2: 6.5102, block: 50 },
      bt: { fixed: 59.74, e: 6.5115 },
      mt: { fixed: 2703.07, dem: 340.417, e: 4.3305 }
    },
    excedentes: { bt: 92.50, mt: 111.27 },   // USD/MWh, Acuerdo CREE-89-2026
    fx: 27.07,                               // L/USD, BCH
    costos: { res: 1.10, apt: 1.00, com: 0.85, gas: 0.90, farm: 0.69 },   // USD/Wp instalado
    ley: { limite: 100, perdidas: 7 },
    // Supuestos del análisis financiero (caso base)
    finanzas: { horizonte: 25, degr: 0.5, om: 1, aumTarifa: 0, aumOM: 0, financ: 'prestamo', pctFin: 80, plazo: 5, tasa: 9, descuento: 10, reemplazoAnio: 13, reemplazoPct: 10 },
    textos: {
      titulo: { es: 'Simulador de Sistemas Fotovoltaicos', en: 'Photovoltaic System Simulator' },
      subtitulo: { es: 'Sistemas fotovoltaicos residenciales e industriales · Seminario de Investigación, Ingeniería Eléctrica UNAH', en: 'Residential and industrial PV systems · Research Seminar, Electrical Engineering, UNAH' },
      autores: 'Claudia Figueroa · Dennis Johan López · M.Sc. Daniel Flores'
    },
    aviso: { on: false, tipo: 'info', es: '', en: '' },
    ocultas: [],
    colores: null,   // null = paleta original
    equipos: { paneles: [], inversores: [], baterias: [], aislados: [], ocultos: { paneles: [], inversores: [], baterias: [], aislados: [] } }
  };
  const clone = o => JSON.parse(JSON.stringify(o));
  // copia profunda de b sobre a conservando las referencias de los objetos de a
  function merge(a, b) {
    for (const k of Object.keys(b || {})) {
      const v = b[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) merge(a[k], v);
      else a[k] = clone(v);
    }
    return a;
  }
  const DATA = clone(DEFAULTS);
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { }
  if (cached) merge(DATA, cached);

  /* ---------- Equipos ---------- */
  const PANEL_GRID = Ns => Ns === 36 ? { rows: 9, cols: 4, groups: 2 } : { rows: Math.max(1, Math.round(Ns / 6)), cols: 6, groups: Ns >= 54 ? 3 : 2 };
  function buildPanel(p) {
    const Ns = +p.Ns || 72, g = PANEL_GRID(Ns);
    const m = { name: p.name, tech: p.tech || 'Mono-c-Si', Ns, ...g, Pstc: +p.Pstc, W: +p.W || 1.134, H: +p.H || 2.278, Vmp: +p.Vmp, Imp: +p.Imp, Voc: +p.Voc, Isc: +p.Isc, pI: +p.pI || 0.045, pV: +p.pV || -0.27, gP: +p.gP || -0.35, noct: +p.noct || 45, fmts: p.fmts && p.fmts.length ? p.fmts : ['res', 'com'], custom: true, uid: p.uid };
    if (p.bifacial) m.bifacial = 0.7;
    m.A = +(m.W * m.H).toFixed(3); m.aI = m.Isc * m.pI / 100; m.bV = m.Voc * m.pV / 100; m.cec = null;
    return m;
  }
  function buildInverter(v) {
    const P = +v.Paco, eff = (+v.eff || 96.5) / 100;
    return { name: v.name, cec: null, type: v.type || 'string', seg: v.seg || 'res', Vac: +v.Vac || 240, ph: +v.ph || 1, Paco: P, Pdco: P / eff, Vdco: ((+v.Vmin || 100) + (+v.Vmax || 500)) / 2, Pso: P * 0.004, C0: 0, C1: 0, C2: 0, C3: 0, Pnt: 1, Vdcmax: +v.Vdcmax || 600, Idcmax: +v.Idcmax || 15, Iscmax: v.Iscmax ? +v.Iscmax : undefined, Vstart: v.Vstart ? +v.Vstart : undefined, Vmin: +v.Vmin || 100, Vmax: +v.Vmax || 500, noAuto: !v.auto, custom: true, uid: v.uid };
  }
  function buildBattery(b, list) {
    const t = list.find(x => x.tech === b.tech && !x.custom) || list[0], V = +b.V || t.V, C = +b.C || t.C, k = V / t.V;
    return { ...t, id: 'c-' + b.uid, uid: b.uid, custom: true, name: { es: b.name, en: b.name }, V, C, Rint: t.Rint * k * t.C / C, Vfull: t.Vfull * k, Vexp: t.Vexp * k, Vnom: t.Vnom * k, Vcut: t.Vcut * k, S: t.S * k, dod: (+b.dod || t.dod * 100) / 100, cyc: +b.cyc || t.cyc, cycDod: (+b.dod || t.dod * 100) / 100, eta: (+b.eta || t.eta * 100) / 100, life: +b.life || t.life, mass: +b.mass || t.mass };
  }
  function applyEquipment(D) {
    const E = D.equipos || {}, O = E.ocultos || {};
    if (window.MODULES) {
      window.MODULES = window.MODULES.filter(m => !m.custom);
      window.MODULES.forEach(m => { m.hidden = (O.paneles || []).includes(m.name); });
      (E.paneles || []).forEach(p => { try { window.MODULES.push(buildPanel(p)); } catch (e) { } });
    }
    if (window.INVERTERS_GRID) {
      for (let i = window.INVERTERS_GRID.length - 1; i >= 0; i--) if (window.INVERTERS_GRID[i].custom) window.INVERTERS_GRID.splice(i, 1);
      window.INVERTERS_GRID.forEach(v => { v.hidden = (O.inversores || []).includes(v.name); });
      (E.inversores || []).forEach(v => { try { window.INVERTERS_GRID.push(buildInverter(v)); } catch (e) { } });
    }
    if (window.SYS) {
      const B = window.SYS.BATTERIES, I = window.SYS.INVERTERS;
      for (let i = B.length - 1; i >= 0; i--) if (B[i].custom) B.splice(i, 1);
      for (let i = I.length - 1; i >= 0; i--) if (I[i].custom) I.splice(i, 1);
      B.forEach(b => { b.hidden = (O.baterias || []).includes(b.id); });
      I.forEach(v => { v.hidden = (O.aislados || []).includes(v.id); });
      (E.baterias || []).forEach(b => { try { B.push(buildBattery(b, B)); } catch (e) { } });
      (E.aislados || []).forEach(v => { try { I.splice(I.length - 1, 0, { id: 'c-' + v.uid, uid: v.uid, custom: true, name: { es: v.name, en: v.name }, P: +v.P, Vdc: +v.Vdc, Vac: +v.Vac || 120, eta: (+v.eta || 90) / 100 }); } catch (e) { } });
    }
  }

  /* ---------- Colores ---------- */
  function applyColors(c) {
    let st = document.getElementById('sitecfg-colors');
    if (!c) { if (st) st.remove(); return; }
    if (!st) { st = document.createElement('style'); st.id = 'sitecfg-colors'; document.head.appendChild(st); }
    st.textContent = `:root[data-theme="light"]{--primary:${c.primary};--primary2:${c.primary2};--primarySoft:color-mix(in srgb,${c.primary} 10%,#fff);--accent:${c.accent};--accentSoft:color-mix(in srgb,${c.accent} 12%,#fff);--s1:${c.primary};--s4:${c.accent}}
:root:not([data-theme="light"]){--accent:${c.accent};--s4:${c.accent}}
.top{background:linear-gradient(180deg,${c.header1},${c.header2})!important}
.logo{background:linear-gradient(135deg,${c.primary2},${c.primary})!important}`;
  }

  /* ---------- Textos, aviso y pestañas ---------- */
  function paint() {
    const D = DATA, lang = document.documentElement.lang === 'en' ? 'en' : 'es';
    const h1 = document.querySelector('.top .brand h1'), p = document.querySelector('.top .brand p');
    if (h1 && D.textos.titulo) { h1.dataset.es = D.textos.titulo.es; h1.dataset.en = D.textos.titulo.en || D.textos.titulo.es; if (h1.innerHTML !== h1.dataset[lang]) h1.innerHTML = h1.dataset[lang]; }
    if (p && D.textos.subtitulo) { p.dataset.es = D.textos.subtitulo.es; p.dataset.en = D.textos.subtitulo.en || D.textos.subtitulo.es; if (p.innerHTML !== p.dataset[lang]) p.innerHTML = p.dataset[lang]; }
    let bar = document.getElementById('siteAviso');
    const msg = D.aviso && D.aviso.on ? (D.aviso[lang] || D.aviso.es) : '';
    if (!msg) { if (bar) bar.remove(); return; }
    if (!bar) { bar = document.createElement('div'); bar.id = 'siteAviso'; const top = document.querySelector('header.top'); if (top) top.after(bar); else document.body.prepend(bar); }
    bar.className = 'siteaviso ' + (D.aviso.tipo === 'importante' ? 'imp' : 'info');
    bar.innerHTML = `<div class="wrap"><span>${D.aviso.tipo === 'importante' ? '⚠️' : '📢'}</span><span>${String(msg).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]))}</span></div>`;
  }

  function applyAll() { applyEquipment(DATA); applyColors(DATA.colores); }
  applyAll();

  /* ---------- Lectura de Firestore (REST) ---------- */
  async function fetchConfig() {
    if (!LIVE) return null;
    const r = await fetch(`${REST}/sitio/config?key=${FB.apiKey}`);
    if (r.status === 404) return {};
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(), s = j.fields && j.fields.json && j.fields.json.stringValue;
    return s ? JSON.parse(s) : {};
  }
  let onChange = null;
  fetchConfig().then(cfg => {
    if (cfg == null) return;
    const before = JSON.stringify(cached || {}), now = JSON.stringify(cfg);
    try { localStorage.setItem(KEY, now); } catch (e) { }
    if (before === now) return;
    // reconstruir desde los valores por defecto y volver a pintar el sitio
    const fresh = merge(clone(DEFAULTS), cfg);
    for (const k of Object.keys(DATA)) if (!(k in fresh)) delete DATA[k];
    merge(DATA, fresh); DATA.ocultas = fresh.ocultas || []; DATA.colores = fresh.colores || null; DATA.equipos = fresh.equipos;
    applyAll(); if (onChange) onChange();
  }).catch(() => { });

  /* ---------- Visitas anónimas ---------- */
  const SES = (() => { try { let s = sessionStorage.getItem('ses'); if (!s) { s = Math.random().toString(36).slice(2, 14); sessionStorage.setItem('ses', s); } return s; } catch (e) { return 'x'; } })();
  const seen = new Set();
  function track(seccion) {
    if (!LIVE || !/simuladorfotovoltaico\.online$/.test(location.hostname) || seen.has(seccion)) return;
    seen.add(seccion);
    const disp = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'movil' : 'escritorio';
    const id = SES + '-' + seccion + '-' + Date.now().toString(36);
    const body = { writes: [{ update: { name: `projects/${FB.projectId}/databases/(default)/documents/visitas/${id}`, fields: { seccion: { stringValue: String(seccion).slice(0, 20) }, disp: { stringValue: disp }, ses: { stringValue: SES }, lang: { stringValue: document.documentElement.lang === 'en' ? 'en' : 'es' } } }, updateTransforms: [{ fieldPath: 'fecha', setToServerValue: 'REQUEST_TIME' }], currentDocument: { exists: false } }] };
    fetch(`${REST}:commit?key=${FB.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).catch(() => { });
  }

  window.SITECFG = { DEFAULTS, data: DATA, paint, track, merge, clone, buildPanel, buildInverter, applyEquipment, applyColors, set onChange(f) { onChange = f; } };
})();
