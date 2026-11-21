/* =====================================================================
   Inicio: dimensionamiento rápido con vista 3D, normativa de Honduras
   ===================================================================== */
(function () {
  'use strict';
  const EXT = window.PAGES_EXT = window.PAGES_EXT || {};

  /* ---------- Datos regulatorios y tarifarios (Honduras) ---------- */
  const TARIFF = {   // CREE, estructura tarifaria ENEE a partir de octubre de 2026
    period: { es: 'octubre de 2026', en: 'October 2026' },
    res: { fixed: 59.74, e1: 5.0031, e2: 6.5102, block: 50 },
    bt: { fixed: 59.74, e: 6.5115 },
    mt: { fixed: 2703.07, dem: 340.417, e: 4.3305 }
  };
  const EXCESS_USD_MWH = { bt: 92.50, mt: 111.27 };   // Acuerdo CREE-89-2026 (según pv magazine, 19/11/2026)
  const FX_DEFAULT = 27.07;                          // BCH, venta, 12/11/2026

  const HOME = {
    kind: 'res', kwh: 350, dmax: 0, cover: 0.9, cells: 60, modId: 3, invIdx: 'auto', tilt: 20, az: 180,
    volt: 'bt', cost: { res: 1.10, com: 0.85 }, fx: FX_DEFAULT, hour: 10.5, month: 3
  };
  let scene = null, calc = null, anim = 0, lastT = 0;

  const A = () => window.APP;
  const L = (es, en) => A().L(es, en);
  const $ = id => document.getElementById(id);

  function modsByCells(n) { return window.MODULES.map((m, i) => ({ m, i })).filter(x => x.m.Ns === n).sort((a, b) => b.m.Pstc - a.m.Pstc); }
  function invs() { return window.INVERTERS_GRID.map((v, i) => ({ v, i })).filter(x => HOME.kind === 'res' ? x.v.seg === 'res' : true); }

  /* ---------- Modelo de inversor de Sandia ---------- */
  function sandia(v, Pdc, Vdc) {
    if (Pdc <= 0) return 0;
    const dv = (Vdc || v.Vdco) - v.Vdco, Ap = v.Pdco * (1 + v.C1 * dv), Bp = v.Pso * (1 + v.C2 * dv), Cp = v.C0 * (1 + v.C3 * dv);
    const p = (v.Paco / (Ap - Bp) - Cp * (Ap - Bp)) * (Pdc - Bp) + Cp * (Pdc - Bp) * (Pdc - Bp);
    return Math.max(0, Math.min(v.Paco, p));
  }

  /* ---------- Cálculo principal ---------- */
  function compute() {
    const S = A().S, t = A().useTmy(), m = window.MODULES[HOME.modId];
    const dmax = HOME.dmax > 0 ? HOME.dmax : estDmax();
    const site = { ...S.site, tilt: HOME.tilt, az: HOME.az };
    const prof = window.SYS.LOADPROF[HOME.kind === 'res' ? 'res' : 'com'], psum = prof.reduce((a, b) => a + b, 0);
    const md = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const lossDC = 0.93;        // suciedad 2 %, mismatch 2 %, cableado 2 %, LID 1 %
    // 1) producción específica (kWh/kWp) con datos horarios
    const Sx = { ...S, site, loss: { soil: 0, mism: 0, iam: true, degr: 0, year: 1 }, modInfo: { noct: m.noct } };
    const hourly = new Float32Array(8760), tamb = new Float32Array(8760); let Ykwp = 0, Tmin = 99;
    for (let d = 1, k = 0; d <= 365; d++) for (let h = 0; h < 24; h++, k++) {
      const w = window.SIM.weatherAt(Sx, t, d, h + 0.5);
      const p = w.Geff / 1000 * (1 + m.gP / 100 * (w.Tc - 25)) * lossDC;  // kW por kWp
      hourly[k] = Math.max(0, p); tamb[k] = w.Ta; Ykwp += hourly[k]; if (w.Ta < Tmin) Tmin = w.Ta;
    }
    const Eyear = HOME.kwh * 12;
    // 2) número de paneles
    const Pmod = m.Pstc / 1000;
    let n = Math.max(1, Math.ceil(Eyear * HOME.cover / (Ykwp * Pmod * 0.965)));
    const nLawE = Math.floor(Eyear / (Ykwp * Pmod * 0.965) * 0.999);  // producción < consumo anual (Art. 47 A.ii)
    let capped = false; if (n > nLawE && nLawE >= 1) { n = nLawE; capped = true; }
    let kWp = n * Pmod;
    // 3) inversores (automático: relación CC/CA cercana a 1,15 respetando la demanda máxima, Art. 47 A.i)
    const sizeFor = v => { const ni = v.type === 'micro' ? n : Math.max(1, Math.round(kWp * 1000 / (v.Paco * 1.15))); return { ni, kWac: ni * v.Paco / 1000, dcac: kWp * 1000 / (ni * v.Paco) }; };
    let autoInv = null;
    if (HOME.invIdx === 'auto') {
      let best = null;
      invs().filter(x => x.v.type !== 'hybrid').forEach(x => { const z = sizeFor(x.v), sc = Math.abs(z.dcac - 1.15) + (z.kWac > dmax ? 10 + z.kWac - dmax : 0) + (z.ni > 1 && x.v.type !== 'micro' ? (z.ni - 1) * 0.08 : 0) + (x.v.type === 'micro' ? 0.12 : 0); if (!best || sc < best.sc) best = { sc, i: x.i }; });
      autoInv = best.i;
    }
    const inv = window.INVERTERS_GRID[HOME.invIdx === 'auto' ? autoInv : HOME.invIdx];
    let nInv, perInv, strings = null, strErr = '';
    if (inv.type === 'micro') { nInv = n; perInv = 1; }
    else {
      nInv = Math.max(1, Math.round(kWp * 1000 / (inv.Paco * 1.15)));
      perInv = Math.ceil(n / nInv);
    }
    const dcac = kWp * 1000 / (nInv * inv.Paco);
    // diseño de strings (inversores de string sin optimizadores)
    const opt = /SolarEdge/.test(inv.name), batt = /OutBack/.test(inv.name);
    if (inv.type !== 'micro' && !opt && !batt) {
      const TcCold = Tmin - 2, TcHot = 70;
      const VocC = m.Voc + m.bV * (TcCold - 25), VmpH = m.Vmp + m.bV * (TcHot - 25), VmpS = m.Vmp;
      const sMax = Math.floor(inv.Vdcmax / VocC), sMin = Math.ceil(inv.Vmin / VmpH), sMaxMp = Math.floor(inv.Vmax / VmpS);
      const hi = Math.min(sMax, Math.max(sMaxMp, sMin));
      if (sMin > hi) strErr = L(`El voltaje de un string no encaja en el rango del inversor (mínimo ${sMin} y máximo ${sMax} paneles).`, `String voltage does not fit the inverter range (minimum ${sMin} and maximum ${sMax} panels).`);
      else {
        let best = null; const cap = nLawE >= 1 ? nLawE : 1e9;
        for (let s = sMin; s <= hi; s++) for (let ns = 1; ns <= Math.max(1, Math.ceil(perInv / s) + 1); ns++) {
          const tot = s * ns * nInv; const sc = Math.abs(tot - n) + (tot > cap ? 1000 : 0) + ns * 0.01;
          if (!best || sc < best.sc) best = { s, ns, sc };
        }
        strings = { s: best.s, ns: best.ns, VocC: VocC * best.s, VmpH: VmpH * best.s, sMin, sMax };
        perInv = best.s * best.ns; n = perInv * nInv; kWp = n * Pmod;
      }
    }
    const kWpF = n * Pmod, kWac = nInv * inv.Paco / 1000;
    // 4) producción horaria en CA, autoconsumo y excedentes
    const mon = Array.from({ length: 12 }, () => ({ pv: 0, load: 0, self: 0, exp: 0, imp: 0 }));
    let d = 1, mo = 0, acc = 0, peakExp = 0, peakPV = 0;
    for (let k = 0; k < 8760; k++) {
      d = Math.floor(k / 24) + 1; while (d > acc + md[mo]) { acc += md[mo]; mo++; }
      const h = k % 24;
      const Pdc = hourly[k] * kWpF * 1000 / nInv;
      const Pac = sandia(inv, Pdc) * nInv / 1000;               // kW
      const load = HOME.kwh / md[mo] * prof[h] / psum * (12 / 12);  // kWh en la hora
      const self = Math.min(Pac, load), ex = Pac - self, im = load - self;
      const M = mon[mo]; M.pv += Pac; M.load += load; M.self += self; M.exp += ex; M.imp += im;
      if (ex > peakExp) peakExp = ex; if (Pac > peakPV) peakPV = Pac;
    }
    const tot = mon.reduce((a, x) => { for (const k in x) a[k] = (a[k] || 0) + x[k]; return a; }, {});
    // 5) facturas
    const level = HOME.kind === 'res' ? 'res' : HOME.volt;
    const exRate = EXCESS_USD_MWH[level === 'mt' ? 'mt' : 'bt'] / 1000 * HOME.fx;  // HNL/kWh
    const bill = E => level === 'res' ? TARIFF.res.fixed + Math.min(E, TARIFF.res.block) * TARIFF.res.e1 + Math.max(0, E - TARIFF.res.block) * TARIFF.res.e2
      : level === 'bt' ? TARIFF.bt.fixed + E * TARIFF.bt.e : TARIFF.mt.fixed + dmax * TARIFF.mt.dem + E * TARIFF.mt.e;
    let b0 = 0, b1 = 0, credit = 0;
    mon.forEach(x => { b0 += bill(x.load); b1 += bill(x.imp); credit += x.exp * exRate; });
    const save = b0 - b1 + credit;
    const costHNL = kWpF * 1000 * HOME.cost[HOME.kind] * HOME.fx;
    // área
    const area = n * m.A;
    calc = { m, inv, auto: HOME.invIdx === 'auto', n, kWp: kWpF, kWac, nInv, perInv, strings, strErr, opt, batt, dcac, Ykwp, mon, tot, b0, b1, credit, save, costHNL, payback: costHNL / Math.max(save, 1), area, capped, Eyear, dmax, peakExp, peakPV, exRate, level, Tmin };
    return calc;
  }
  function estDmax() {
    const prof = window.SYS.LOADPROF[HOME.kind === 'res' ? 'res' : 'com'], psum = prof.reduce((a, b) => a + b, 0);
    // factor de carga típico: residencial ≈ 0,18; comercial ≈ 0,35
    return HOME.kwh / 730 / (HOME.kind === 'res' ? 0.18 : 0.35);
  }

  /* ---------- Normativa ---------- */
  function lawChecks(c) {
    const out = [], res = HOME.kind === 'res';
    out.push({ ok: c.kWac <= c.dmax + 1e-9, t: L('Capacidad en CA no mayor que tu demanda máxima de 12 meses', 'AC capacity not above your 12-month maximum demand'), d: L(`${fx(c.kWac, 1)} kW de inversor frente a ${fx(c.dmax, 1)} kW de demanda máxima ${HOME.dmax > 0 ? '' : '(estimada)'}. RLGIE, Art. 47 A.i.`, `${fx(c.kWac, 1)} kW inverter vs ${fx(c.dmax, 1)} kW maximum demand ${HOME.dmax > 0 ? '' : '(estimated)'}. RLGIE, Art. 47 A.i.`) });
    out.push({ ok: c.tot.pv < c.Eyear, t: L('Producción anual menor que tu consumo anual', 'Annual production below your annual consumption'), d: L(`${fx(c.tot.pv, 0)} kWh/año frente a ${fx(c.Eyear, 0)} kWh/año. RLGIE, Art. 47 A.ii.`, `${fx(c.tot.pv, 0)} kWh/yr vs ${fx(c.Eyear, 0)} kWh/yr. RLGIE, Art. 47 A.ii.`) });
    if (res) out.push({ ok: c.kWac <= 15, warn: true, t: L('Tope de referencia de 15 kW para usuarios residenciales', '15 kW reference cap for residential users'), d: L('Mencionado por la CREE en el informe de la Norma Técnica de Autoproductores (2022). Confírmalo con la distribuidora: el Art. 47 vigente fija el límite por demanda y consumo.', 'Cited by CREE in the Self-generation Technical Standard report (2022). Confirm with the utility: the current Art. 47 sets the limit by demand and consumption.') });
    else out.push({ ok: true, info: true, t: L(`Clasificación: ${HOME.volt === 'bt' ? 'tipo A (comercial en baja tensión)' : c.kWac <= 1000 ? 'tipo B (media tensión, hasta 1 MW)' : 'tipo C (media tensión, más de 1 MW)'}`, `Classification: ${HOME.volt === 'bt' ? 'type A (commercial, low voltage)' : c.kWac <= 1000 ? 'type B (medium voltage, up to 1 MW)' : 'type C (medium voltage, above 1 MW)'}`), d: L(HOME.volt === 'bt' ? 'Sin estudios eléctricos adicionales de la distribuidora.' : c.kWac <= 1000 ? 'La distribuidora hace un análisis de capacidad del circuito y cortocircuito; se piden certificados UL / IEC 61215 / IEC 61730.' : 'La distribuidora hace estudios de flujo de potencia, cortocircuito y coordinación de protecciones.', HOME.volt === 'bt' ? 'No additional utility studies.' : c.kWac <= 1000 ? 'The utility checks circuit capacity and short-circuit contribution; UL / IEC 61215 / IEC 61730 certificates are required.' : 'The utility runs power-flow, short-circuit and protection-coordination studies.') });
    out.push({ ok: true, info: true, t: L('Medidor bidireccional', 'Bidirectional meter'), d: res || HOME.volt === 'bt' ? L('Lo instala la distribuidora (RLGIE, Art. 50 A).', 'Installed by the utility (RLGIE, Art. 50 A).') : L('Para usuarios en media tensión lo instala el usuario a su costo (RLGIE, Art. 50 B).', 'For medium-voltage users it is installed by the user at their cost (RLGIE, Art. 50 B).') });
    out.push({ ok: true, info: true, t: L('Pago de excedentes', 'Payment for surplus'), d: L(`La distribuidora compra la energía renovable inyectada a una tarifa aprobada por la CREE basada en costos evitados (RLGIE, Art. 48–49). Referencia usada: ${fx(EXCESS_USD_MWH[c.level === 'mt' ? 'mt' : 'bt'], 2)} USD/MWh (${fx(c.exRate, 2)} L/kWh), Acuerdo CREE‑89‑2026.`, `The utility buys injected renewable energy at a CREE-approved tariff based on avoided costs (RLGIE, Art. 48–49). Reference used: ${fx(EXCESS_USD_MWH[c.level === 'mt' ? 'mt' : 'bt'], 2)} USD/MWh (${fx(c.exRate, 2)} L/kWh), Agreement CREE‑89‑2026.`) });
    out.push({ ok: true, info: true, t: L('Trámite ante la distribuidora', 'Application to the utility'), d: L('Solicitud con capacidad en kVA, producción estimada en kWh, estudio de demanda máxima de 6 meses y constancia de un ingeniero electricista colegiado (CIMEQH).', 'Application with capacity in kVA, estimated production in kWh, a 6-month maximum-demand study and a statement from a licensed electrical engineer (CIMEQH).') });
    out.push({ ok: true, info: true, t: L('Calidad de la energía', 'Power quality'), d: L('Los inversores y los motores que arrancan con frecuencia requieren autorización previa de la distribuidora para no exceder los límites de armónicos y flicker (NT de Calidad de Distribución, Art. 32). Revísalo en la pestaña Red eléctrica.', 'Inverters and frequently starting motors need prior utility authorization so they do not exceed harmonic and flicker limits (Distribution Quality Standard, Art. 32). Check it in the Power grid tab.') });
    out.push({ ok: true, info: true, t: L('Protección anti-isla', 'Anti-islanding protection'), d: L('El sistema no puede inyectar energía cuando la red de media tensión está fuera de servicio.', 'The system must not inject energy when the medium-voltage network is out of service.') });
    return out;
  }
  const fx = (x, d) => A().fx(x, d);

  /* ---------- Página ---------- */
  EXT.home = function () {
    const { kpi, esc } = A(), S = A().S;
    const cityOpts = Object.entries(A().CITIES).filter(([k]) => k !== 'custom');
    const ms = modsByCells(HOME.cells);
    if (!ms.some(x => x.i === HOME.modId)) HOME.modId = ms[0].i;
    const iv = invs(); if (HOME.invIdx !== 'auto' && !iv.some(x => x.i === HOME.invIdx)) HOME.invIdx = 'auto';
    const seg = (key, opts, val) => `<div class="seg wide">${opts.map(([v, t]) => `<button data-h="${key}" data-v="${v}" class="${String(val) === String(v) ? 'on' : ''}">${t}</button>`).join('')}</div>`;
    $('p-home').innerHTML = `
      <div class="hero">
        <div class="hero3d card" id="h3d"><div id="h3dc" class="c3d"></div>
          <div class="hud" id="hud"></div>
          <div class="hctl"><button class="btn pri sm" id="hPlay">▶</button><input type="range" id="hHour" min="5" max="19" step="0.05" value="${HOME.hour}" aria-label="${L('Hora del día', 'Time of day')}"><select class="inp" id="hMonth" style="width:120px;font-family:var(--sans)">${L('Enero Febrero Marzo Abril Mayo Junio Julio Agosto Septiembre Octubre Noviembre Diciembre', 'January February March April May June July August September October November December').split(' ').map((n, i) => `<option value="${i}" ${i === HOME.month ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
          <p class="hint">${L('Arrastra para girar · rueda o pellizco para acercar', 'Drag to rotate · scroll or pinch to zoom')}</p>
        </div>
        <div class="card wiz">
          <h3>${L('Diseña tu sistema solar', 'Design your solar system')}</h3>
          <p class="sub">${L('Responde cinco preguntas y te recomendamos cuántos paneles necesitas.', 'Answer five questions and we will recommend how many panels you need.')}</p>
          <div class="q"><span class="qn">1</span><div><b>${L('¿Dónde se instalará?', 'Where will it be installed?')}</b>${seg('kind', [['res', '🏠 ' + L('Vivienda', 'Home')], ['com', '🏭 ' + L('Comercio o industria', 'Business or industry')]], HOME.kind)}</div></div>
          <div class="q"><span class="qn">2</span><div><b>${L('¿Cuánta energía consumes al mes?', 'How much energy do you use per month?')}</b><small>${L('Aparece en tu recibo de la ENEE como «consumo kWh».', 'It appears on your ENEE bill as “kWh consumption”.')}</small>
            <div class="rowin"><input type="range" id="hKwh" min="${HOME.kind === 'res' ? 50 : 500}" max="${HOME.kind === 'res' ? 2500 : 200000}" step="${HOME.kind === 'res' ? 10 : 500}" value="${HOME.kwh}"><input class="inp" type="number" id="hKwhN" value="${HOME.kwh}" min="10" max="1000000"><span>kWh/${L('mes', 'mo')}</span></div>
            <div class="rowin"><label style="flex:1;font-size:14px">${L('Demanda máxima', 'Maximum demand')} <small style="display:inline">(${L('0 = estimar', '0 = estimate')})</small></label><input class="inp" type="number" id="hDmax" value="${HOME.dmax}" min="0" max="100000" step="0.5" style="width:110px"><span>kW</span></div>
            ${HOME.kind === 'com' ? `<div style="margin-top:8px">${seg('volt', [['bt', L('Baja tensión', 'Low voltage')], ['mt', L('Media tensión', 'Medium voltage')]], HOME.volt)}</div>` : ''}</div></div>
          <div class="q"><span class="qn">3</span><div><b>${L('¿En qué ciudad?', 'Which city?')}</b><select class="sel" id="hCity">${cityOpts.map(([k, v]) => `<option value="${k}" ${S.site.city === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select></div></div>
          <div class="q"><span class="qn">4</span><div><b>${L('¿Qué panel solar?', 'Which solar panel?')}</b><small>${L('Elige por número de celdas.', 'Choose by number of cells.')}</small>${seg('cells', [[36, '36 ' + L('celdas', 'cells')], [60, '60 ' + L('celdas', 'cells')], [72, '72 ' + L('celdas', 'cells')]], HOME.cells)}
            <select class="sel" id="hMod" style="margin-top:8px">${ms.map(x => `<option value="${x.i}" ${x.i === HOME.modId ? 'selected' : ''}>${esc(x.m.name.replace(/Co\., Ltd\.|Inc\.|Green Energy Technology/g, ''))} · ${x.m.Pstc.toFixed(0)} W</option>`).join('')}</select></div></div>
          <div class="q"><span class="qn">5</span><div><b>${L('¿Qué inversor?', 'Which inverter?')}</b><small>${L('Modelos del mercado (base de datos CEC).', 'Market models (CEC database).')}</small>
            <select class="sel" id="hInv"><option value="auto" ${HOME.invIdx === 'auto' ? 'selected' : ''}>${L('Automático (recomendado)', 'Automatic (recommended)')}</option>${iv.map(x => `<option value="${x.i}" ${x.i === HOME.invIdx ? 'selected' : ''}>${esc(x.v.name)} · ${fx(x.v.Paco / 1000, 1)} kW · ${x.v.Vac} V${x.v.ph === 3 ? ' 3φ' : ''}</option>`).join('')}</select></div></div>
          <div class="q"><span class="qn">%</span><div><b>${L('¿Qué parte de tu consumo quieres cubrir?', 'What share of your consumption do you want to cover?')}</b><div class="rowin"><input type="range" id="hCover" min="0.2" max="1" step="0.05" value="${HOME.cover}"><b id="hCoverV" style="min-width:52px;text-align:right">${Math.round(HOME.cover * 100)} %</b></div></div></div>
        </div>
      </div>
      <div class="kpis big" id="hK" style="margin-top:24px"></div>
      <div class="grid g-3" style="margin-top:24px">
        <div class="card"><h3>${L('Tu sistema', 'Your system')}</h3><div id="hSys"></div>
          <details style="margin-top:14px"><summary>${L('Ajustes de instalación y costos', 'Installation and cost settings')}</summary>
            <div class="field"><label>${L('Inclinación', 'Tilt')} (°)</label><input class="inp" type="number" id="hTilt" value="${HOME.tilt}" min="0" max="45"></div>
            <div class="field"><label>${L('Orientación (180 = sur)', 'Azimuth (180 = south)')} (°)</label><input class="inp" type="number" id="hAz" value="${HOME.az}" min="90" max="270"></div>
            <div class="field"><label>${L('Costo instalado', 'Installed cost')} (USD/Wp)<small>${L('Supuesto editable: pide cotizaciones.', 'Editable assumption: get quotes.')}</small></label><input class="inp" type="number" id="hCost" value="${HOME.cost[HOME.kind]}" min="0.3" max="5" step="0.05"></div>
            <div class="field"><label>${L('Tipo de cambio', 'Exchange rate')} (L/USD)<small>BCH, 12/11/2026</small></label><input class="inp" type="number" id="hFx" value="${HOME.fx}" min="10" max="60" step="0.01"></div>
          </details>
        </div>
        <div class="card"><h3>${L('Producción y consumo por mes', 'Monthly production and consumption')}</h3><div class="chart"><canvas id="hMonC" class="h300"></canvas></div></div>
        <div class="card"><h3>${L('Lo que dice la ley en Honduras', 'What Honduran law says')}</h3><p class="sub">${L('Usuarios autoproductores conectados a la red de distribución.', 'Self-generating users connected to the distribution network.')}</p><ul class="checks" id="hLaw"></ul></div>
      </div>
      <div class="card" style="margin-top:24px"><div class="chead"><div><h3>${L('¿Quieres ver el detalle técnico?', 'Want the technical detail?')}</h3><p class="sub">${L('Lleva este diseño al simulador completo: curvas, sombras, MPPT, baterías, red eléctrica y simulación anual.', 'Take this design to the full simulator: curves, shading, MPPT, batteries, power grid and annual simulation.')}</p></div><div class="btns"><button class="btn" id="hGrid">${L('Red, armónicos y motores →', 'Grid, harmonics and motors →')}</button><button class="btn pri" id="hGo">${L('Abrir simulación detallada →', 'Open detailed simulation →')}</button></div></div>
        <p class="note">${L(`Tarifas de la ENEE publicadas por la CREE (vigentes desde ${TARIFF.period.es}). Producción calculada hora por hora con datos PVGIS, pérdidas del 7 % en CC y la eficiencia del inversor elegido. Valores orientativos: un diseño definitivo requiere visita técnica.`, `ENEE tariffs published by CREE (in force since ${TARIFF.period.en}). Production computed hour by hour with PVGIS data, 7 % DC losses and the selected inverter efficiency. Indicative values: a final design requires a site visit.`)}</p></div>`;
    bind();
    A().loadTmy().then(() => { update(); init3d(); });
  };

  function bind() {
    const P = $('p-home');
    P.querySelectorAll('[data-h]').forEach(b => b.onclick = () => {
      const k = b.dataset.h, v = b.dataset.v;
      if (k === 'kind') { HOME.kind = v; HOME.kwh = v === 'res' ? 350 : 12000; HOME.dmax = 0; HOME.tilt = v === 'res' ? 20 : 10; HOME.invIdx = 'auto'; HOME.cells = v === 'com' ? 72 : 60; }
      if (k === 'volt') HOME.volt = v;
      if (k === 'cells') HOME.cells = +v;
      EXT.home();
    });
    const kw = $('hKwh'), kn = $('hKwhN');
    kw.oninput = () => { kn.value = kw.value; }; kw.onchange = () => { HOME.kwh = +kw.value; update(true); };
    kn.onchange = () => { HOME.kwh = Math.max(10, +kn.value || 10); kw.value = HOME.kwh; update(true); };
    if ($('hDmax')) $('hDmax').onchange = e => { HOME.dmax = Math.max(0, +e.target.value || 0); update(); };
    $('hCity').onchange = e => { const S = A().S, c = A().CITIES[e.target.value]; S.site.city = e.target.value; S.site.src = 'tmy'; Object.assign(S.site, { lat: c.lat, lon: c.lon, alt: c.alt, Tmin: c.Tmin, Tmax: c.Tmax, tz: -6 }); A().loadTmy().then(() => { update(true); A().renderSummary(); }); };
    $('hMod').onchange = e => { HOME.modId = +e.target.value; update(true); };
    $('hInv').onchange = e => { HOME.invIdx = e.target.value === 'auto' ? 'auto' : +e.target.value; update(true); };
    $('hCover').oninput = e => { $('hCoverV').textContent = Math.round(e.target.value * 100) + ' %'; };
    $('hCover').onchange = e => { HOME.cover = +e.target.value; update(true); };
    $('hTilt').onchange = e => { HOME.tilt = Math.max(0, Math.min(45, +e.target.value)); update(true); };
    $('hAz').onchange = e => { HOME.az = Math.max(90, Math.min(270, +e.target.value)); update(true); };
    $('hCost').onchange = e => { HOME.cost[HOME.kind] = +e.target.value; update(); };
    $('hFx').onchange = e => { HOME.fx = +e.target.value; update(); };
    $('hHour').oninput = e => { stop(); HOME.hour = +e.target.value; sunUpdate(); };
    $('hMonth').onchange = e => { HOME.month = +e.target.value; sunUpdate(); };
    $('hPlay').onclick = () => { if (anim) return stop(); if (HOME.hour >= 18.9) HOME.hour = 5.5; $('hPlay').textContent = '❚❚'; anim = requestAnimationFrame(play); };
    $('hGo').onclick = applyDetailed;
    $('hGrid').onclick = () => A().go('grid');
  }
  function play(ts) { if (!lastT) lastT = ts; HOME.hour += (ts - lastT) / 1000 * 1.2; lastT = ts; if (HOME.hour >= 19) { HOME.hour = 19; stop(); } const h = $('hHour'); if (h) h.value = HOME.hour; sunUpdate(); if (anim) anim = requestAnimationFrame(play); }
  function stop() { cancelAnimationFrame(anim); anim = 0; lastT = 0; const b = $('hPlay'); if (b) b.textContent = '▶'; }

  function update(rebuild) {
    if (!$('hK')) return;
    const c = compute(), kpi = A().kpi;
    const cover = c.tot.pv / c.Eyear;
    $('hK').innerHTML = kpi(L('Paneles recomendados', 'Recommended panels'), c.n, '', 'hl') + kpi(L('Potencia instalada', 'Installed power'), fx(c.kWp, 2), 'kWp') + kpi(L('Producción anual', 'Annual production'), fx(c.tot.pv, 0), 'kWh') + kpi(L('Cubre tu consumo', 'Covers your consumption'), fx(cover * 100, 0), '%') + kpi(L('Ahorro anual', 'Annual savings'), 'L ' + fx(c.save, 0), '', 'ok') + kpi(L('Inversión estimada', 'Estimated investment'), 'L ' + fx(c.costHNL, 0)) + kpi(L('Retorno', 'Payback'), fx(c.payback, 1), L('años', 'years')) + kpi(L('Área de paneles', 'Panel area'), fx(c.area, 0), 'm²');
    const inv = c.inv;
    $('hSys').innerHTML = `<div class="kv"><span>${L('Panel', 'Panel')}</span><span>${c.m.Pstc.toFixed(0)} W · ${c.m.Ns} ${L('celdas', 'cells')}</span><span>${L('Inversor', 'Inverter')}${c.auto ? ' <small style="color:var(--muted)">(' + L('automático', 'automatic') + ')</small>' : ''}</span><span>${c.nInv} × ${A().esc(inv.name.split(' (')[0])}</span><span>${L('Potencia CA', 'AC power')}</span><span>${fx(c.kWac, 2)} kW</span><span>${L('Relación CC/CA', 'DC/AC ratio')}</span><span>${fx(c.dcac, 2)}</span>
      ${c.strings ? `<span>${L('Configuración', 'Configuration')}</span><span>${c.strings.ns} string(s) × ${c.strings.s} ${L('paneles', 'panels')}${c.nInv > 1 ? ' ' + L('por inversor', 'per inverter') : ''}</span><span>V<sub>oc</sub> ${L('en frío', 'cold')} (${fx(c.Tmin - 2, 0)} °C)</span><span>${fx(c.strings.VocC, 0)} / ${fx(inv.Vdcmax, 0)} V</span>` : ''}
      <span>${L('Producción específica', 'Specific yield')}</span><span>${fx(c.tot.pv / c.kWp, 0)} kWh/kWp</span><span>${L('Factura actual', 'Current bill')}</span><span>L ${fx(c.b0 / 12, 0)}/${L('mes', 'mo')}</span><span>${L('Factura con paneles', 'Bill with panels')}</span><span>L ${fx(Math.max(0, c.b1 - c.credit) / 12, 0)}/${L('mes', 'mo')}</span><span>${L('Excedentes vendidos', 'Surplus sold')}</span><span>${fx(c.tot.exp, 0)} kWh/${L('año', 'yr')}</span></div>
      ${c.strErr ? `<div class="alert bad">${c.strErr}</div>` : ''}
      ${c.dcac > 1.35 ? `<div class="alert warn">${L('Relación CC/CA alta: el inversor recortará potencia en las horas de más sol.', 'High DC/AC ratio: the inverter will clip power at peak sun hours.')}</div>` : c.dcac < 0.8 ? `<div class="alert warn">${L('El inversor está sobredimensionado para este número de paneles.', 'The inverter is oversized for this number of panels.')}</div>` : ''}
      ${c.opt ? `<p class="note">${L('SolarEdge usa optimizadores por panel; la tensión del string la fija el inversor.', 'SolarEdge uses per-panel optimizers; the inverter sets the string voltage.')}</p>` : ''}
      ${c.batt ? `<div class="alert warn">${L('Este equipo es un inversor-cargador de baterías: necesita un controlador de carga MPPT aparte para los paneles.', 'This is a battery inverter-charger: it needs a separate MPPT charge controller for the panels.')}</div>` : ''}
      ${c.capped ? `<div class="alert warn">${L('Se limitó el número de paneles para que la producción anual sea menor que tu consumo, como exige el Art. 47 del reglamento.', 'The number of panels was limited so annual production stays below your consumption, as required by Art. 47 of the regulation.')}</div>` : ''}`;
    $('hLaw').innerHTML = lawChecks(c).map(x => `<li class="${x.info ? 'info' : x.ok ? 'ok' : x.warn ? 'warn' : 'bad'}"><i>${x.info ? 'i' : x.ok ? '✓' : '!'}</i><div><b>${x.t}</b><span>${x.d}</span></div></li>`).join('');
    const months = L('Ene Feb Mar Abr May Jun Jul Ago Sep Oct Nov Dic', 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec').split(' '), xs = months.map((_, i) => i + 1), css = A().css;
    window.CHART.draw($('hMonC'), { xs, xmin: 0.5, xmax: 12.5, xticks: xs.map((x, i) => ({ x, label: months[i] })), series: [{ type: 'bar', ys: c.mon.map(x => x.load), color: css('--s6'), bw: 0.36, off: -0.19, label: L('Consumo', 'Consumption') }, { type: 'bar', ys: c.mon.map(x => x.pv), color: css('--s4'), bw: 0.36, off: 0.19, label: L('Producción solar', 'Solar production') }], xl: '', yl: 'kWh', ymaxL: Math.max(...c.mon.map(x => Math.max(x.load, x.pv))) * 1.1 });
    if (rebuild && scene) build3d();
    sunUpdate();
  }

  /* ---------- 3D ---------- */
  function init3d() {
    const el = $('h3dc'); if (!el) return;
    if (!window.THREE || !window.THREE.OrbitControls) { el.innerHTML = `<p class="note" style="padding:20px">${L('No se pudo cargar la vista 3D.', 'The 3D view could not be loaded.')}</p>`; return; }
    try { if (scene) scene.dispose(); scene = window.SCENE3D.create(el); build3d(); sunUpdate(); scene.controls.autoRotate = false; }
    catch (e) { el.innerHTML = `<p class="note" style="padding:20px">${L('Tu navegador no admite WebGL para la vista 3D.', 'Your browser does not support WebGL for the 3D view.')}</p>`; scene = null; }
  }
  function build3d() {
    if (!scene || !calc) return;
    const m = calc.m, ratio = m.Ns === 36 ? 0.67 / 1.48 : m.Ns === 60 ? 0.99 / 1.65 : 0.99 / 1.96;
    const ph = Math.sqrt(m.A / ratio), pw = m.A / ph;
    scene.build({ kind: HOME.kind, n: Math.min(calc.n, 1500), mod: { pw, ph }, tilt: HOME.tilt, az: HOME.az });
  }
  function sunUpdate() {
    if (!calc) return;
    const S = A().S, doy = [15, 46, 74, 105, 135, 166, 196, 227, 258, 288, 319, 349][HOME.month];
    const site = { ...S.site, tilt: HOME.tilt, az: HOME.az };
    const sp = window.SOLAR.position(site, doy, HOME.hour);
    const path = []; for (let h = 4.5; h <= 19.5; h += 0.25) { const p = window.SOLAR.position(site, doy, h); path.push({ az: p.az, el: p.el }); }
    // potencia típica del mes a esa hora (promedio de los días del mes con PVGIS)
    const t = A().useTmy(), Sx = { ...S, site, loss: { soil: 0, mism: 0, iam: true, degr: 0, year: 1 }, modInfo: { noct: calc.m.noct } };
    const md = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31], d0 = md.slice(0, HOME.month).reduce((a, b) => a + b, 0) + 1;
    let pk = 0, G = 0; for (let d = d0; d < d0 + md[HOME.month]; d++) { const w = window.SIM.weatherAt(Sx, t, d, HOME.hour); G += w.Geff; pk += w.Geff / 1000 * (1 + calc.m.gP / 100 * (w.Tc - 25)) * 0.93; }
    pk /= md[HOME.month]; G /= md[HOME.month];
    const Pdc = pk * calc.kWp * 1000 / calc.nInv, Pac = sandia(calc.inv, Pdc) * calc.nInv / 1000;
    if (scene) scene.setSun(sp.az, sp.el, path, Pac / Math.max(calc.kWac, 0.001));
    const hh = h => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`;
    const city = A().CITIES[S.site.city] ? A().CITIES[S.site.city].name : '';
    const hud = $('hud'); if (hud) hud.innerHTML = `<b>${city}</b><span>${hh(HOME.hour)} · ${$('hMonth') ? $('hMonth').selectedOptions[0].text : ''}</span><span class="big">${fx(Pac, 2)} kW</span><span>${L('producción típica a esta hora', 'typical output at this hour')}</span><span>${sp.el > 0 ? L(`Sol a ${fx(sp.el, 0)}° de altura`, `Sun ${fx(sp.el, 0)}° high`) : L('Noche', 'Night')}</span>`;
  }

  /* ---------- Llevar el diseño al simulador detallado ---------- */
  function applyDetailed() {
    const S = A().S, c = calc; if (!c) return;
    S.modId = HOME.modId; S.G = []; S.T = []; S.bp = [];
    let Ns = c.strings ? c.strings.s : Math.min(8, Math.max(1, Math.round(c.n / Math.max(1, Math.round(Math.sqrt(c.n / 3))))));
    Ns = Math.min(8, Ns); let Np = Math.min(6, Math.max(1, Math.round(c.n / Ns)));
    S.arr.Ns = Ns; S.arr.Np = Np;
    S.site.tilt = HOME.tilt; S.site.az = HOME.az; S.site.src = 'tmy';
    const prof = window.SYS.LOADPROF[HOME.kind === 'res' ? 'res' : 'com'];
    S.load.prof = HOME.kind === 'res' ? 'res' : 'com'; S.load.P = Math.round(HOME.kwh / 30 / prof.reduce((a, b) => a + b, 0) * 1000 / 10) * 10;
    A().applyModule(); A().refresh(); A().go('gen');
  }

  EXT.homeState = () => ({ HOME, calc });
})();
