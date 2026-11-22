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

  // Costo instalado de referencia (USD/Wp, editable). Parque solar: IRENA 2024, promedio mundial 691 USD/kW.
  const COST = { res: 1.10, apt: 1.00, com: 0.85, gas: 0.90, farm: 0.69 };
  const KIND = {
    res: { kwh: 350, tilt: 20, fmt: 'res' }, apt: { kwh: 4000, tilt: 10, fmt: 'res' }, com: { kwh: 12000, tilt: 10, fmt: 'com' },
    gas: { kwh: 6000, tilt: 8, fmt: 'com' }, farm: { kwh: 0, tilt: 15, fmt: 'util' }
  };
  const GASPROF = [.4, .35, .35, .35, .4, .6, .85, .95, 1, 1, 1, 1, 1, 1, 1, 1, 1, .95, .9, .85, .75, .6, .5, .45];
  const HOME = {
    kind: 'res', kwh: 350, bills: [350, 350, 350], dmax: 0, cover: 0.9, fmt: 'res', modId: null, invIdx: 'auto', tilt: 20, az: 180,
    volt: 'bt', cost: { ...COST }, fx: FX_DEFAULT, lossDC: 7, mount: 'free', lawPct: 100, tar: { ...TARIFF.res }, wx: 'tmy', date: null, hour: 10.5, month: 3, day: 15, farmMW: 5, price: 111.27
  };
  let scene = null, calc = null, anim = 0, lastT = 0;

  const A = () => window.APP;
  const isRes = () => HOME.kind === 'res' || HOME.kind === 'apt';
  const isFarm = () => HOME.kind === 'farm';
  const typIdx = f => window.MODULES_TYPICAL_START + { res: 0, com: 1, util: 2 }[f];
  const profOf = () => isRes() ? window.SYS.LOADPROF.res : HOME.kind === 'gas' ? GASPROF : window.SYS.LOADPROF.com;
  const curMod = () => window.MODULES[HOME.modId ?? typIdx(HOME.fmt)];
  const L = (es, en) => A().L(es, en);
  const $ = id => document.getElementById(id);

  function invs() { return window.INVERTERS_GRID.map((v, i) => ({ v, i })).filter(x => isRes() ? x.v.seg === 'res' : isFarm() ? x.v.type === 'string3' : true); }

  /* ---------- Modelo de inversor de Sandia ---------- */
  function sandia(v, Pdc, Vdc) {
    if (Pdc <= 0) return 0;
    const dv = (Vdc || v.Vdco) - v.Vdco, Ap = v.Pdco * (1 + v.C1 * dv), Bp = v.Pso * (1 + v.C2 * dv), Cp = v.C0 * (1 + v.C3 * dv);
    const p = (v.Paco / (Ap - Bp) - Cp * (Ap - Bp)) * (Pdc - Bp) + Cp * (Pdc - Bp) * (Pdc - Bp);
    return Math.max(0, Math.min(v.Paco, p));
  }

  /* ---------- Temperatura de celda según el montaje (modelo de Faiman, coeficientes de PVGIS) ---------- */
  // Estructura libre: el modelo del sitio (Faiman, U0 = 25, U1 = 6.84). Sobre el techo con poca ventilación
  // ("building integrated" en PVGIS): U0 = 20.0 W/(m²·K), U1 = 0.
  function cellTc(w) { return HOME.mount === 'roof' ? w.Ta + w.poa.poa / 20.0 : w.Tc; }

  /* ---------- Cálculo principal ---------- */
  function compute() {
    if (isFarm()) return computeFarm();
    const S = A().S, t = A().useTmy(), m = curMod();
    const dmax = HOME.dmax > 0 ? HOME.dmax : estDmax();
    const site = { ...S.site, tilt: HOME.tilt, az: HOME.az };
    const prof = profOf(), psum = prof.reduce((a, b) => a + b, 0);
    const md = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const lossDC = 1 - HOME.lossDC / 100;   // por defecto 7 %: suciedad 2 %, mismatch 2 %, cableado 2 %, LID 1 %
    // 1) producción específica (kWh/kWp) con datos horarios
    const Sx = { ...S, site, loss: { soil: 0, mism: 0, iam: true, degr: 0, year: 1 }, modInfo: { noct: m.noct } };
    const hourly = new Float32Array(8760), tamb = new Float32Array(8760); let Ykwp = 0, Tmin = 99;
    for (let d = 1, k = 0; d <= 365; d++) for (let h = 0; h < 24; h++, k++) {
      const w = window.SIM.weatherAt(Sx, t, d, h + 0.5);
      const Tc = cellTc(w);
      const p = w.Geff / 1000 * (1 + m.gP / 100 * (Tc - 25)) * lossDC;  // kW por kWp
      hourly[k] = Math.max(0, p); tamb[k] = w.Ta; Ykwp += hourly[k]; if (w.Ta < Tmin) Tmin = w.Ta;
    }
    const Eyear = HOME.kwh * 12;
    // 2) número de paneles
    const Pmod = m.Pstc / 1000;
    let n = Math.max(1, Math.ceil(Eyear * HOME.cover / (Ykwp * Pmod * 0.965)));
    const nLawE = Math.floor(Eyear * HOME.lawPct / 100 / (Ykwp * Pmod * 0.965) * 0.999);  // producción < límite (Art. 47 A.ii: 100 % del consumo anual)
    let capped = false; if (n > nLawE && nLawE >= 1) { n = nLawE; capped = true; }
    // la potencia instalada no puede superar la demanda máxima (Art. 47 A.i): CC hasta 1,25 × demanda
    const nDem = Math.max(1, Math.floor(dmax * 1.25 / Pmod)); let cappedDem = false;
    if (n > nDem) { n = nDem; cappedDem = true; }
    let kWp = n * Pmod;
    // 3) inversores (automático: relación CC/CA cercana a 1,15 respetando la demanda máxima, Art. 47 A.i)
    const sizeFor = v => {
      let ni = v.type === 'micro' ? Math.min(n, Math.max(1, Math.floor(dmax * 1000 / v.Paco))) : Math.max(1, Math.round(kWp * 1000 / (v.Paco * 1.15)));
      if (v.type !== 'micro' && ni > 1 && ni * v.Paco / 1000 > dmax) ni = Math.max(1, Math.floor(dmax * 1000 / v.Paco));
      return { ni, kWac: ni * v.Paco / 1000, dcac: kWp * 1000 / (ni * v.Paco) };
    };
    const cap = nLawE >= 1 ? nLawE : 1e9;
    // Plan de strings: cuántos paneles en serie (s) y cuántas series (ns) por inversor
    const plan = (v, ni) => {
      if (v.type === 'micro' || /SolarEdge|OutBack/.test(v.name)) return { ok: true, none: true };
      const VocC = m.Voc + m.bV * (Tmin - 2 - 25), VmpH = m.Vmp + m.bV * (70 - 25);
      const sMax = Math.floor(v.Vdcmax / VocC), sMin = Math.ceil(v.Vmin / VmpH), hi = Math.min(sMax, Math.max(Math.floor(v.Vmax / m.Vmp), sMin));
      if (sMin > hi) return { ok: false, why: 'range', sMin, sMax };
      const per = n / ni; let best = null;
      for (let st = sMin; st <= hi; st++) for (let ns = 1; ns <= Math.max(1, Math.ceil(per / st) + 1); ns++) {
        const tot = st * ns * ni, sc = Math.abs(tot - n) + (tot > cap ? 1000 : 0) + ns * 0.01;
        if (!best || sc < best.sc) best = { s: st, ns, sc, tot };
      }
      if (best.tot > cap || Math.abs(best.tot - n) > Math.max(2, 0.25 * n)) return { ok: false, why: n / ni < sMin ? 'few' : 'many', sMin, sMax };
      return { ok: true, s: best.s, ns: best.ns, tot: best.tot, VocC: VocC * best.s, VmpH: VmpH * best.s, sMin, sMax };
    };
    let autoInv = null;
    if (HOME.invIdx === 'auto') {
      let best = null;
      invs().filter(x => x.v.type !== 'hybrid' && !x.v.noAuto).forEach(x => { const z = sizeFor(x.v), pl = plan(x.v, z.ni), sc = (pl.ok ? 0 : 100) + Math.abs(z.dcac - 1.15) + (z.kWac > dmax ? 10 + z.kWac - dmax : 0) + (z.ni > 1 && x.v.type !== 'micro' ? (z.ni - 1) * 0.08 : 0) + (x.v.type === 'micro' ? 0.12 + (n - z.ni) / n * 3 : 0); if (!best || sc < best.sc) best = { sc, i: x.i }; });
      autoInv = best.i;
    }
    const inv = window.INVERTERS_GRID[HOME.invIdx === 'auto' ? autoInv : HOME.invIdx];
    let nInv, perInv, strings = null, strErr = '';
    if (inv.type === 'micro') { nInv = sizeFor(inv).ni; if (nInv < n) { n = nInv; kWp = n * Pmod; cappedDem = true; } perInv = 1; }
    else { nInv = sizeFor(inv).ni; perInv = Math.ceil(n / nInv); }
    const dcac = kWp * 1000 / (nInv * inv.Paco);
    // diseño de strings (inversores de string sin optimizadores)
    const opt = /SolarEdge/.test(inv.name), batt = /OutBack/.test(inv.name);
    const pl = plan(inv, nInv);
    if (!pl.ok) strErr = pl;
    else if (!pl.none) { strings = { s: pl.s, ns: pl.ns, VocC: pl.VocC, VmpH: pl.VmpH, sMin: pl.sMin, sMax: pl.sMax }; perInv = pl.s * pl.ns; n = perInv * nInv; kWp = n * Pmod; }
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
    const level = isRes() ? 'res' : HOME.volt;
    const exRate = EXCESS_USD_MWH[level === 'mt' ? 'mt' : 'bt'] / 1000 * HOME.fx;  // HNL/kWh
    const TR = HOME.tar;
    const bill = E => level === 'res' ? TR.fixed + Math.min(E, TR.block) * TR.e1 + Math.max(0, E - TR.block) * TR.e2
      : level === 'bt' ? TARIFF.bt.fixed + E * TARIFF.bt.e : TARIFF.mt.fixed + dmax * TARIFF.mt.dem + E * TARIFF.mt.e;
    let b0 = 0, b1 = 0, credit = 0;
    mon.forEach(x => { b0 += bill(x.load); b1 += bill(x.imp); credit += x.exp * exRate; });
    const save = b0 - b1 + credit;
    const costHNL = kWpF * 1000 * HOME.cost[HOME.kind] * HOME.fx;
    // área
    const area = n * m.A;
    calc = { m, inv, cappedDem, autoIdx: autoInv, auto: HOME.invIdx === 'auto', n, kWp: kWpF, kWac, nInv, perInv, strings, strErr, opt, batt, dcac, Ykwp, mon, tot, b0, b1, credit, save, costHNL, payback: costHNL / Math.max(save, 1), area, capped, Eyear, dmax, peakExp, peakPV, exRate, level, Tmin };
    return calc;
  }
  function estDmax() {
    // factor de carga típico: residencial ≈ 0,18; comercial ≈ 0,35; gasolinera ≈ 0,45; con un mínimo realista por picos de aparatos
    return isRes() ? Math.max(HOME.kind === 'apt' ? 10 : 2.5, HOME.kwh / 730 / 0.18) : Math.max(5, HOME.kwh / 730 / (HOME.kind === 'gas' ? 0.45 : 0.35));
  }

  /* ---------- Parque solar (generación para la venta) ---------- */
  function computeFarm() {
    const S = A().S, t = A().useTmy(), m = curMod(), Pmod = m.Pstc / 1000, site = { ...S.site, tilt: HOME.tilt, az: HOME.az };
    const bif = m.bifacial ? 1.05 : 1;   // ganancia bifacial típica sobre suelo con vegetación (≈ 5 %)
    const Sx = { ...S, site, loss: { soil: 0, mism: 0, iam: true, degr: 0, year: 1 }, modInfo: { noct: m.noct } };
    const hourly = new Float32Array(8760); let Ykwp = 0, Tmin = 99;
    for (let d = 1, k = 0; d <= 365; d++) for (let h = 0; h < 24; h++, k++) {
      const w = window.SIM.weatherAt(Sx, t, d, h + 0.5); hourly[k] = Math.max(0, w.Geff / 1000 * (1 + m.gP / 100 * (w.Tc - 25)) * 0.93 * bif); Ykwp += hourly[k]; if (w.Ta < Tmin) Tmin = w.Ta;
    }
    let n = Math.max(1, Math.round(HOME.farmMW * 1000 / Pmod)), kWp = n * Pmod;
    let inv = window.INVERTERS_GRID[HOME.invIdx === 'auto' ? -1 : HOME.invIdx], autoIdx = null;
    const cands = invs();
    if (!inv) { let best = null; cands.forEach(x => { const ni = Math.max(1, Math.round(kWp / (x.v.Paco / 1000 * 1.25))); const sc = Math.abs(kWp / (ni * x.v.Paco / 1000) - 1.25) + ni * 0.0005; if (!best || sc < best.sc) best = { sc, i: x.i }; }); autoIdx = best.i; inv = window.INVERTERS_GRID[autoIdx]; }
    let nInv = Math.max(1, Math.round(kWp / (inv.Paco / 1000 * 1.25)));
    // strings
    const VocC = m.Voc + m.bV * (Tmin - 2 - 25), VmpH = m.Vmp + m.bV * 45;
    const sMax = Math.floor(inv.Vdcmax / VocC), sMin = Math.ceil(inv.Vmin / VmpH), sOk = Math.max(sMin, Math.min(sMax, Math.floor(inv.Vmax / m.Vmp)));
    let strings = null, strErr = '';
    if (sMin > sMax) strErr = { why: 'range', sMin, sMax };
    else { const ns = Math.max(1, Math.round(inv.Paco * 1.25 / (sOk * m.Pstc))); nInv = Math.max(1, Math.round(n / (sOk * ns))); strings = { s: sOk, ns, VocC: VocC * sOk, VmpH: VmpH * sOk, sMin, sMax }; n = sOk * ns * nInv; kWp = n * Pmod; }
    const kWac = nInv * inv.Paco / 1000, md = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const mon = Array.from({ length: 12 }, () => ({ pv: 0, load: 0, self: 0, exp: 0, imp: 0 })); let mo = 0, acc = 0, peak = 0;
    for (let k = 0; k < 8760; k++) { const d = Math.floor(k / 24) + 1; while (d > acc + md[mo]) { acc += md[mo]; mo++; } const Pac = sandia(inv, hourly[k] * kWp * 1000 / nInv) * nInv / 1000; mon[mo].pv += Pac; mon[mo].exp += Pac; if (Pac > peak) peak = Pac; }
    const E = mon.reduce((a, x) => a + x.pv, 0);   // kWh
    const revUSD = E / 1000 * HOME.price, invUSD = kWp * 1000 * HOME.cost.farm;
    const landHa = n * m.A / 0.42 * 1.2 / 10000;
    calc = { farm: true, m, inv, autoIdx, auto: HOME.invIdx === 'auto', n, kWp, kWac, nInv, perInv: n / nInv, strings, strErr, opt: false, batt: false, dcac: kWp / kWac, Ykwp, mon, tot: { pv: E, exp: E, self: 0, imp: 0, load: 0 }, E, CF: E / (kWac * 8760), revUSD, invUSD, costHNL: invUSD * HOME.fx, save: revUSD * HOME.fx, payback: invUSD / Math.max(revUSD, 1), area: n * m.A, landHa, bif, Eyear: Infinity, dmax: Infinity, peakExp: peak, peakPV: peak, exRate: HOME.price / 1000 * HOME.fx, level: 'mt', Tmin, capped: false, cappedDem: false };
    return calc;
  }

  /* ---------- Normativa ---------- */
  function lawChecks(c) {
    if (c.farm) return [
      { ok: true, info: true, t: L('Un parque solar es una empresa generadora, no un autoproductor', 'A solar park is a generating company, not a self-generator'), d: L('Vende su energía en el mercado eléctrico; los límites del Art. 47 (demanda y consumo propio) no aplican.', 'It sells its energy in the electricity market; the Art. 47 limits (own demand and consumption) do not apply.') },
      { ok: true, info: true, t: L('Inscripción en el Registro Público de Empresas del Sector Eléctrico', 'Registration in the Public Registry of Electricity Sector Companies'), d: L('Obligatoria antes de operar, ante la CREE (RLGIE, Art. 10).', 'Required before operating, with CREE (RLGIE, Art. 10).') },
      { ok: true, info: true, t: L('Venta mediante contratos o mercado de oportunidad', 'Sales through contracts or the spot market'), d: L('Los contratos deben registrarse ante el Operador del Sistema (ODS) y la CREE; las distribuidoras solo contratan mediante licitaciones públicas internacionales (RLGIE, Art. 11).', 'Contracts must be registered with the System Operator (ODS) and CREE; distribution companies only contract through international public tenders (RLGIE, Art. 11).') },
      { ok: true, info: true, t: L('Conexión a la red', 'Grid connection'), d: L('Requiere estudios de flujo de potencia, cortocircuito y protecciones, y cumplir la Norma Técnica de Calidad de Transmisión o de Distribución según el punto de conexión.', 'Requires power-flow, short-circuit and protection studies, and compliance with the Transmission or Distribution Quality Technical Standard depending on the connection point.') },
      { ok: true, info: true, t: L('Permisos del proyecto', 'Project permits'), d: L('Además del registro eléctrico, un parque necesita licencia ambiental y permisos municipales; consulta a la Secretaría de Recursos Naturales y Ambiente.', 'Besides the electricity registration, a park needs an environmental license and municipal permits; check with the Secretariat of Natural Resources and Environment.') }
    ];
    const out = [], res = isRes();
    out.push({ ok: c.kWac <= c.dmax + 1e-9, t: L('Capacidad en CA no mayor que tu demanda máxima de 12 meses', 'AC capacity not above your 12-month maximum demand'), d: L(`${fx(c.kWac, 1)} kW de inversor frente a ${fx(c.dmax, 1)} kW de demanda máxima ${HOME.dmax > 0 ? '' : '(estimada)'}. RLGIE, Art. 47 A.i.`, `${fx(c.kWac, 1)} kW inverter vs ${fx(c.dmax, 1)} kW maximum demand ${HOME.dmax > 0 ? '' : '(estimated)'}. RLGIE, Art. 47 A.i.`) });
    const lim = c.Eyear * HOME.lawPct / 100, pctTxt = HOME.lawPct < 100 ? ` (${L('límite elegido', 'chosen limit')}: ${fx(HOME.lawPct, 1)} %)` : '';
    out.push({ ok: c.tot.pv < lim, t: L('Producción anual menor que tu consumo anual', 'Annual production below your annual consumption') + pctTxt, d: L(`${fx(c.tot.pv, 0)} kWh/año frente a ${fx(lim, 0)} kWh/año (${fx(c.tot.pv / c.Eyear * 100, 1)} % del consumo). RLGIE, Art. 47 A.ii, reformado por el Acuerdo CREE-07-2025.`, `${fx(c.tot.pv, 0)} kWh/yr vs ${fx(lim, 0)} kWh/yr (${fx(c.tot.pv / c.Eyear * 100, 1)} % of consumption). RLGIE, Art. 47 A.ii, amended by Agreement CREE-07-2025.`) });
    if (res && HOME.kind === 'res') out.push({ ok: c.kWac <= 15, warn: true, t: L('Tope de referencia de 15 kW para usuarios residenciales', '15 kW reference cap for residential users'), d: L('Mencionado por la CREE en el informe de la Norma Técnica de Autoproductores (2022). Confírmalo con la distribuidora: el Art. 47 vigente fija el límite por demanda y consumo.', 'Cited by CREE in the Self-generation Technical Standard report (2022). Confirm with the utility: the current Art. 47 sets the limit by demand and consumption.') });
    else if (!res) out.push({ ok: true, info: true, t: L(`Clasificación: ${HOME.volt === 'bt' ? 'tipo A (comercial en baja tensión)' : c.kWac <= 1000 ? 'tipo B (media tensión, hasta 1 MW)' : 'tipo C (media tensión, más de 1 MW)'}`, `Classification: ${HOME.volt === 'bt' ? 'type A (commercial, low voltage)' : c.kWac <= 1000 ? 'type B (medium voltage, up to 1 MW)' : 'type C (medium voltage, above 1 MW)'}`), d: L(HOME.volt === 'bt' ? 'Sin estudios eléctricos adicionales de la distribuidora.' : c.kWac <= 1000 ? 'La distribuidora hace un análisis de capacidad del circuito y cortocircuito; se piden certificados UL / IEC 61215 / IEC 61730.' : 'La distribuidora hace estudios de flujo de potencia, cortocircuito y coordinación de protecciones.', HOME.volt === 'bt' ? 'No additional utility studies.' : c.kWac <= 1000 ? 'The utility checks circuit capacity and short-circuit contribution; UL / IEC 61215 / IEC 61730 certificates are required.' : 'The utility runs power-flow, short-circuit and protection-coordination studies.') });
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
    const iv = invs(); if (HOME.invIdx !== 'auto' && !iv.some(x => x.i === HOME.invIdx)) HOME.invIdx = 'auto';
    const seg = (key, opts, val) => `<div class="seg wide">${opts.map(([v, t]) => `<button data-h="${key}" data-v="${v}" class="${String(val) === String(v) ? 'on' : ''}">${t}</button>`).join('')}</div>`;
    $('p-home').innerHTML = `
      <div class="hero">
        <div class="hero3d card" id="h3d"><div id="h3dc" class="c3d"></div>
          <div class="hud" id="hud"></div>
          <div class="hctl"><button class="btn pri sm" id="hPlay">▶</button><input type="range" id="hHour" min="0" max="24" step="0.05" value="${HOME.hour}" aria-label="${L('Hora del día', 'Time of day')}">${HOME.wx === 'real' ? `<input class="inp" type="date" id="hDate" value="${HOME.date}" min="1940-01-01" max="${addDays(todayHN(), 15)}" style="width:150px;font-family:var(--sans)" aria-label="${L('Fecha', 'Date')}">` : `<select class="inp" id="hMonth" style="width:120px;font-family:var(--sans)">${L('Enero Febrero Marzo Abril Mayo Junio Julio Agosto Septiembre Octubre Noviembre Diciembre', 'January February March April May June July August September October November December').split(' ').map((n, i) => `<option value="${i}" ${i === HOME.month ? 'selected' : ''}>${n}</option>`).join('')}</select><select class="inp" id="hDay" style="width:${'72px'};font-family:var(--sans)" aria-label="${L('Día del mes', 'Day of month')}">${Array.from({ length: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][HOME.month] }, (_, k) => `<option value="${k + 1}" ${k + 1 === HOME.day ? 'selected' : ''}>${k + 1}</option>`).join('')}</select>`}</div>
          <div class="hwx"><div class="seg"><button data-wx="tmy" class="${HOME.wx === 'tmy' ? 'on' : ''}">${L('Año típico', 'Typical year')}</button><button data-wx="real" class="${HOME.wx === 'real' ? 'on' : ''}">${L('Clima real', 'Real weather')}</button></div>${HOME.wx === 'real' ? `<button class="btn sm" id="hNow">${L('Ahora', 'Now')}</button>` : ''}<span id="hWxNote">${HOME.wx === 'real' ? '' : L('Clima de un año meteorológico típico (PVGIS), no el de una fecha concreta.', 'Weather of a typical meteorological year (PVGIS), not of a specific date.')}</span></div>
          <p class="hint">${L('Arrastra para girar · rueda o pellizco para acercar', 'Drag to rotate · scroll or pinch to zoom')}</p>
        </div>
        <div class="card wiz">
          <h3>${L('Diseña tu sistema solar', 'Design your solar system')}</h3>
          <p class="sub">${L('Responde cinco preguntas y te recomendamos cuántos paneles necesitas.', 'Answer five questions and we will recommend how many panels you need.')}</p>
          <div class="q"><span class="qn">1</span><div><b>${L('¿Qué tipo de proyecto es?', 'What type of project is it?')}</b><div class="kinds">${[['res', '🏠', L('Casa', 'House')], ['apt', '🏢', L('Edificio', 'Building')], ['com', '🏭', L('Industria', 'Industry')], ['gas', '⛽', L('Gasolinera', 'Gas station')], ['farm', '🌞', L('Parque solar', 'Solar park')]].map(([v, ic, t]) => `<button data-h="kind" data-v="${v}" class="${HOME.kind === v ? 'on' : ''}"><span>${ic}</span>${t}</button>`).join('')}</div></div></div>
          ${isFarm() ? `<div class="q"><span class="qn">2</span><div><b>${L('¿Qué tamaño tendrá el parque?', 'How big will the park be?')}</b><small>${L('Potencia de los paneles en megavatios pico (MWp).', 'Panel power in megawatts peak (MWp).')}</small>
            <div class="rowin"><input type="range" id="hMW" min="0.5" max="50" step="0.5" value="${HOME.farmMW}"><input class="inp" type="number" id="hMWn" value="${HOME.farmMW}" min="0.1" max="500" step="0.1"><span>MWp</span></div>
            <div class="rowin"><label style="flex:1;font-size:14px">${L('Precio de venta de la energía', 'Energy sale price')}<small style="display:block">${L('Referencia: excedentes en media tensión, Acuerdo CREE‑89‑2026. En un parque se pacta por contrato.', 'Reference: medium-voltage surplus, Agreement CREE‑89‑2026. A park agrees it by contract.')}</small></label><input class="inp" type="number" id="hPrice" value="${HOME.price}" min="10" max="400" step="0.5" style="width:110px"><span>USD/MWh</span></div></div></div>` : `<div class="q"><span class="qn">2</span><div><b>${L('¿Cuánta energía consumes al mes?', 'How much energy do you use per month?')}</b><small>${L('Escribe el consumo en kWh de tus últimos 3 recibos de la ENEE.', 'Enter the kWh consumption from your last 3 ENEE bills.')}</small><p class="note" style="margin:0">${L('Usar varios meses da un resultado más confiable, porque el consumo cambia según la época del año.', 'Using several months gives a more reliable result, because consumption changes with the season.')}</p>
            <div class="bills">${[0, 1, 2].map(i => `<label><span>${L(['Último recibo', 'Penúltimo', 'Antepenúltimo'][i], ['Latest bill', 'Previous', 'Two bills ago'][i])}</span><input class="inp" type="number" data-bill="${i}" value="${HOME.bills[i] || ''}" min="0" max="1000000" step="1" placeholder="kWh"></label>`).join('')}</div>
            <div class="rowin" style="justify-content:space-between"><span style="font-size:14px">${L('Promedio mensual', 'Monthly average')}</span><b id="hAvg" style="font-size:16px">${fx(HOME.kwh, 0)} kWh/${L('mes', 'mo')}</b></div>
            <p class="note" id="hBillNote" style="margin:4px 0 0"></p>
            <div class="rowin"><label style="flex:1;font-size:14px">${L('Demanda máxima', 'Maximum demand')} <small style="display:inline">(${L('0 = estimar', '0 = estimate')})</small></label><input class="inp" type="number" id="hDmax" value="${HOME.dmax}" min="0" max="100000" step="0.5" style="width:110px"><span>kW</span></div>
            ${!isRes() ? `<div style="margin-top:8px">${seg('volt', [['bt', L('Baja tensión', 'Low voltage')], ['mt', L('Media tensión', 'Medium voltage')]], HOME.volt)}</div>` : ''}</div></div>`}
          <div class="q"><span class="qn">3</span><div><b>${L('¿Dónde está?', 'Where is it?')}</b>${HOME.loc ? '' : `<select class="sel" id="hCity">${cityOpts.map(([k, v]) => `<option value="${k}" ${S.site.city === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select>`}
            <div class="btns" style="margin-top:8px">${HOME.loc ? `<span class="badge ok">📍 ${L('Usando tu ubicación', 'Using your location')}</span><button class="btn sm" id="hLocOff">${L('Volver a elegir ciudad', 'Choose a city instead')}</button>` : `<button class="btn sm" id="hLocOn">📍 ${L('Usar mi ubicación (opcional)', 'Use my location (optional)')}</button>`}</div>
            ${HOME.loc ? `<small style="margin-top:6px">${L(`Coordenadas ${HOME.loc.lat.toFixed(4)}, ${HOME.loc.lon.toFixed(4)} · clima de ${A().CITIES[S.site.city].name} (la ciudad con datos más cercana). Solo se usan en tu navegador.`, `Coordinates ${HOME.loc.lat.toFixed(4)}, ${HOME.loc.lon.toFixed(4)} · weather from ${A().CITIES[S.site.city].name} (nearest city with data). Used only in your browser.`)}</small>` : ''}</div></div>
          <div class="q"><span class="qn">4</span><div><b>${L('¿Qué panel solar?', 'Which solar panel?')}</b><small>${L('Elige el formato; así se venden hoy.', 'Choose the format; this is how they are sold today.')}</small>${seg('fmt', [['res', L('Residencial', 'Residential')], ['com', L('Comercial', 'Commercial')], ['util', L('Gran escala', 'Utility')]], HOME.fmt)}
            <select class="sel" id="hMod" style="margin-top:8px">${(() => { const t = window.MODULES[typIdx(HOME.fmt)], ns = { res: [36, 60], com: [72], util: [72] }[HOME.fmt]; return `<option value="typ" ${HOME.modId == null ? 'selected' : ''}>${L('Típico 2026', 'Typical 2026')} · ${t.Pstc} W${KIND[HOME.kind].fmt === HOME.fmt ? ' · ' + L('recomendado', 'recommended') : ''}</option>` + window.MODULES.slice(0, window.MODULES_TYPICAL_START).map((m, i) => ({ m, i })).filter(x => x.m.fmts ? x.m.fmts.includes(HOME.fmt) : ns.includes(x.m.Ns)).sort((a, b) => b.m.Pstc - a.m.Pstc).map(x => `<option value="${x.i}" ${x.i === HOME.modId ? 'selected' : ''}>${esc(x.m.name.replace(/Co\., Ltd\.|Inc\.|Green Energy Technology/g, ''))} · ${x.m.Pstc.toFixed(0)} W</option>`).join(''); })()}</select>
            ${(() => { const mm = curMod(), pr = window.PRICE.localUSDW; return `<p class="note" style="margin:0">${mm.Pstc.toFixed(0)} W · ${fx(mm.A, 2)} m² · ${fx(mm.Pstc / mm.A / 10, 1)} %${mm.typical ? ` · ≈ USD ${Math.round(mm.Pstc * pr[0])}–${Math.round(mm.Pstc * pr[1])} ${L('por panel', 'per panel')} · ${mm.brands}` : ''}</p>`; })()}</div></div>
          <div class="q"><span class="qn">5</span><div><b>${L('¿Qué inversor?', 'Which inverter?')}</b><small>${L('Modelos del mercado (base de datos CEC).', 'Market models (CEC database).')}</small>
            <select class="sel" id="hInv"><option value="auto" ${HOME.invIdx === 'auto' ? 'selected' : ''}>${L('Automático (recomendado)', 'Automatic (recommended)')}</option>${iv.map(x => `<option value="${x.i}" ${x.i === HOME.invIdx ? 'selected' : ''}>${esc(x.v.name)} · ${fx(x.v.Paco / 1000, 1)} kW · ${x.v.Vac} V${x.v.ph === 3 ? ' 3φ' : ''}</option>`).join('')}</select></div></div>
          ${isFarm() ? '' : `<div class="q"><span class="qn">%</span><div><b>${L('¿Qué parte de tu consumo quieres cubrir?', 'What share of your consumption do you want to cover?')}</b><div class="rowin"><input type="range" id="hCover" min="0.2" max="1" step="0.05" value="${HOME.cover}"><b id="hCoverV" style="min-width:52px;text-align:right">${Math.round(HOME.cover * 100)} %</b></div></div></div>`}
        </div>
      </div>
      <div class="kpis big" id="hK" style="margin-top:24px"></div>
      <div class="card" style="margin-top:24px"><h3 style="margin-bottom:16px">${L('Flujo de energía en un año', 'Energy flow over a year')}</h3><div class="flowicons" id="hFlow"></div></div>
      <div class="grid g-2" style="margin-top:24px">
        <div class="card monthcard"><h3>${L('Producción y consumo por mes', 'Monthly production and consumption')}</h3><div class="chart"><canvas id="hMonC" class="h300"></canvas></div></div>
        <div class="card"><h3>${L('Tu sistema', 'Your system')}</h3><div id="hSys"></div>
          <details style="margin-top:14px"><summary>${L('Ajustes de instalación y costos', 'Installation and cost settings')}</summary>
            <div class="field"><label>${L('Inclinación', 'Tilt')} (°)</label><input class="inp" type="number" id="hTilt" value="${HOME.tilt}" min="0" max="45"></div>
            <div class="field"><label>${L('Orientación (azimut de brújula)', 'Azimuth (compass)')} (°)<small>${L('0 = norte, 90 = este, 180 = sur, 270 = oeste. En PVGIS se mide desde el sur: PVGIS = este valor − 180.', '0 = north, 90 = east, 180 = south, 270 = west. PVGIS measures from south: PVGIS = this value − 180.')}</small></label><input class="inp" type="number" id="hAz" value="${HOME.az}" min="0" max="359"></div>
            <div class="field"><label>${L('Montaje', 'Mounting')}<small>${L('Sobre el techo el panel se ventila menos y se calienta más (como "building integrated" en PVGIS).', 'On the roof the panel is less ventilated and runs hotter (like "building integrated" in PVGIS).')}</small></label><select class="sel" id="hMount"><option value="free" ${HOME.mount === 'free' ? 'selected' : ''}>${L('Estructura libre', 'Free-standing')}</option><option value="roof" ${HOME.mount === 'roof' ? 'selected' : ''}>${L('Sobre el techo', 'On the roof')}</option></select></div>
            <div class="field"><label>${L('Pérdidas en CC', 'DC losses')} (%)<small>${L('Suciedad, mismatch, cables y LID; el inversor se calcula aparte. PVGIS usa 14 % incluyendo el inversor: para comparar, usa ≈ 10–11 %.', 'Soiling, mismatch, cables and LID; the inverter is computed separately. PVGIS uses 14 % including the inverter: to compare, use ≈ 10–11 %.')}</small></label><input class="inp" type="number" id="hLoss" value="${HOME.lossDC}" min="0" max="40" step="0.5"></div>
            <div class="field"><label>${L('Límite de producción', 'Production limit')} (% ${L('del consumo anual', 'of annual consumption')})<small>${L('Ley vigente (Art. 47 A.ii, CREE-07-2025): menos del 100 %. La versión anterior pedía ≤ 90 % del consumo mensual con baterías.', 'Current law (Art. 47 A.ii, CREE-07-2025): below 100 %. The previous version required ≤ 90 % of monthly consumption with batteries.')}</small></label><input class="inp" type="number" id="hLaw%" value="${HOME.lawPct}" min="10" max="100" step="0.1"></div>
            ${isRes() ? `<div class="field"><label>${L('Tarifa: primeros', 'Tariff: first')} ${HOME.tar.block} kWh (L/kWh)<small>${L(`ENEE, ${TARIFF.period.es}: L ${TARIFF.res.e1}. Escribe la de tu recibo si es otra.`, `ENEE, ${TARIFF.period.en}: L ${TARIFF.res.e1}. Enter the one on your bill if different.`)}</small></label><input class="inp" type="number" id="hTe1" value="${HOME.tar.e1}" min="0" step="0.01"></div>
            <div class="field"><label>${L('Tarifa: resto', 'Tariff: rest')} (L/kWh)</label><input class="inp" type="number" id="hTe2" value="${HOME.tar.e2}" min="0" step="0.01"></div>
            <div class="field"><label>${L('Cargo fijo', 'Fixed charge')} (L/${L('mes', 'month')})</label><input class="inp" type="number" id="hTf" value="${HOME.tar.fixed}" min="0" step="0.01"></div>` : ''}
            <div class="field"><label>${L('Costo instalado', 'Installed cost')} (USD/Wp)<small>${L('Supuesto editable: pide cotizaciones.', 'Editable assumption: get quotes.')}</small></label><input class="inp" type="number" id="hCost" value="${HOME.cost[HOME.kind]}" min="0.3" max="5" step="0.05"></div>
            <div class="field"><label>${L('Tipo de cambio', 'Exchange rate')} (L/USD)<small>BCH, 12/11/2026</small></label><input class="inp" type="number" id="hFx" value="${HOME.fx}" min="10" max="60" step="0.01"></div>
          </details>
        </div>

        <div class="card"><h3>${L('Instalación y normativa', 'Installation and regulations')}</h3><div id="hLaw"></div><div class="btns" style="margin-top:14px"><button class="btn pri" id="hMountGo">${L('Ver montaje 3D y diagrama unifilar →', 'See 3D installation and single-line diagram →')}</button><button class="btn" id="hLawGo">${L('Normativa y equipos →', 'Regulations and equipment →')}</button></div></div>
      </div>
      <div class="card" style="margin-top:24px"><div class="chead"><div><h3>${L('¿Quieres ver el detalle técnico?', 'Want the technical detail?')}</h3><p class="sub">${L('Lleva este diseño al simulador completo: curvas, sombras, MPPT, baterías, red eléctrica y simulación anual.', 'Take this design to the full simulator: curves, shading, MPPT, batteries, power grid and annual simulation.')}</p></div><div class="btns"><button class="btn" id="hGrid">${L('Red, armónicos y motores →', 'Grid, harmonics and motors →')}</button><button class="btn pri" id="hGo">${L('Abrir simulación detallada →', 'Open detailed simulation →')}</button></div></div>
        <p class="note">${L(`Tarifas de la ENEE publicadas por la CREE (vigentes desde ${TARIFF.period.es}). Producción calculada hora por hora con datos PVGIS, pérdidas del ${fx(HOME.lossDC, 1)} % en CC y la eficiencia del inversor elegido. Valores orientativos: un diseño definitivo requiere visita técnica.`, `ENEE tariffs published by CREE (in force since ${TARIFF.period.en}). Production computed hour by hour with PVGIS data, ${fx(HOME.lossDC, 1)} % DC losses and the selected inverter efficiency. Indicative values: a final design requires a site visit.`)}</p></div>`;
    bind();
    A().loadTmy().then(() => { update(); init3d(); });
  };

  function bind() {
    const P = $('p-home');
    P.querySelectorAll('[data-h]').forEach(b => b.onclick = () => {
      const k = b.dataset.h, v = b.dataset.v;
      if (k === 'kind') { HOME.kind = v; const K = KIND[v]; HOME.kwh = K.kwh; HOME.bills = [K.kwh, K.kwh, K.kwh]; HOME.dmax = 0; HOME.tilt = K.tilt; HOME.invIdx = 'auto'; HOME.fmt = K.fmt; HOME.modId = null; }
      if (k === 'volt') HOME.volt = v;
      if (k === 'fmt') { HOME.fmt = v; HOME.modId = null; HOME.invIdx = 'auto'; }
      EXT.home();
    });
    const billNote = () => {
      const v = HOME.bills.filter(x => x > 0), el = $('hBillNote'); if (!el) return;
      if (v.length < 3) { el.textContent = L(`Con ${v.length} recibo(s) el cálculo es menos preciso; si puedes, completa los tres.`, `With ${v.length} bill(s) the estimate is less accurate; if you can, fill in all three.`); return; }
      const mx = Math.max(...v), mn = Math.min(...v);
      el.textContent = mx > 1.4 * mn ? L(`Tu consumo varía bastante (de ${fx(mn, 0)} a ${fx(mx, 0)} kWh). Usamos el promedio; los meses de más consumo pagarán algo de energía a la ENEE.`, `Your consumption varies quite a lot (${fx(mn, 0)} to ${fx(mx, 0)} kWh). We use the average; higher-consumption months will buy some energy from ENEE.`) : '';
    };

    if ($('hMW')) { const a = $('hMW'), bn = $('hMWn'); a.oninput = () => bn.value = a.value; a.onchange = () => { HOME.farmMW = +a.value; update(true); }; bn.onchange = () => { HOME.farmMW = Math.max(0.1, +bn.value || 1); a.value = HOME.farmMW; update(true); }; $('hPrice').onchange = e => { HOME.price = Math.max(1, +e.target.value || 100); update(); }; }
    $('p-home').querySelectorAll('[data-bill]').forEach(inp => inp.onchange = () => {
      HOME.bills[+inp.dataset.bill] = Math.max(0, +inp.value || 0);
      const v = HOME.bills.filter(x => x > 0); HOME.kwh = v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 10;
      $('hAvg').textContent = `${fx(HOME.kwh, 0)} kWh/${L('mes', 'mo')}`; billNote(); update(true);
    });
    billNote();
    if ($('hDmax')) $('hDmax').onchange = e => { HOME.dmax = Math.max(0, +e.target.value || 0); update(); };
    const pickCity = v => { const S = A().S; HOME.loc = null; const c = A().CITIES[v]; S.site.city = v; S.site.src = 'tmy'; Object.assign(S.site, { lat: c.lat, lon: c.lon, alt: c.alt, Tmin: c.Tmin, Tmax: c.Tmax, tz: -6 }); A().loadTmy().then(() => { EXT.home(); A().renderSummary(); }); };
    if ($('hCity')) $('hCity').onchange = e => pickCity(e.target.value);
    if ($('hLocOff')) $('hLocOff').onclick = () => pickCity(A().S.site.city);
    if ($('hLocOn')) $('hLocOn').onclick = () => {
      if (!navigator.geolocation) { alert(L('Tu navegador no permite obtener la ubicación.', 'Your browser cannot get the location.')); return; }
      $('hLocOn').textContent = L('Buscando ubicación…', 'Finding location…');
      navigator.geolocation.getCurrentPosition(p => setLoc(p.coords.latitude, p.coords.longitude), () => { alert(L('No se pudo obtener la ubicación. Revisa que el navegador tenga permiso de ubicación.', 'Could not get the location. Check that the browser has location permission.')); EXT.home(); }, { enableHighAccuracy: true, timeout: 15000 });
    };
    $('hMod').onchange = e => { HOME.modId = e.target.value === 'typ' ? null : +e.target.value; HOME.invIdx = 'auto'; EXT.home(); };
    $('hInv').onchange = e => { HOME.invIdx = e.target.value === 'auto' ? 'auto' : +e.target.value; update(true); };
    if ($('hCover')) $('hCover').oninput = e => { $('hCoverV').textContent = Math.round(e.target.value * 100) + ' %'; };
    if ($('hCover')) $('hCover').onchange = e => { HOME.cover = +e.target.value; update(true); };
    $('hTilt').onchange = e => { HOME.tilt = Math.max(0, Math.min(45, +e.target.value)); update(true); };
    $('hAz').onchange = e => { HOME.az = ((Math.round(+e.target.value) % 360) + 360) % 360; update(true); };
    $('hMount').onchange = e => { HOME.mount = e.target.value; update(true); };
    $('hLoss').onchange = e => { HOME.lossDC = Math.max(0, Math.min(40, +e.target.value || 0)); update(true); };
    $('hLaw%').onchange = e => { HOME.lawPct = Math.max(10, Math.min(100, +e.target.value || 100)); update(true); };
    [['hTe1', 'e1'], ['hTe2', 'e2'], ['hTf', 'fixed']].forEach(([id, k]) => { if ($(id)) $(id).onchange = e => { HOME.tar[k] = Math.max(0, +e.target.value || 0); update(); }; });
    $('hCost').onchange = e => { HOME.cost[HOME.kind] = +e.target.value; update(); };
    $('hFx').onchange = e => { HOME.fx = +e.target.value; update(); };
    $('hHour').oninput = e => { stop(); HOME.hour = +e.target.value; sunUpdate(); };
    const fillDays = () => { const n = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][HOME.month]; HOME.day = Math.min(HOME.day, n); $('hDay').innerHTML = Array.from({ length: n }, (_, k) => `<option value="${k + 1}" ${k + 1 === HOME.day ? 'selected' : ''}>${k + 1}</option>`).join(''); };
    if ($('hMonth')) { $('hMonth').onchange = e => { HOME.month = +e.target.value; fillDays(); sunUpdate(); }; $('hDay').onchange = e => { HOME.day = +e.target.value; sunUpdate(); }; }
    $('p-home').querySelectorAll('[data-wx]').forEach(b => b.onclick = () => {
      if (HOME.wx === b.dataset.wx) return; HOME.wx = b.dataset.wx;
      if (HOME.wx === 'real') { HOME.date = HOME.date || todayHN(); HOME.hour = nowHourHN(); }
      EXT.home();
    });
    if ($('hDate')) $('hDate').onchange = e => { if (e.target.value) { HOME.date = e.target.value; loadReal(); } };
    if ($('hNow')) $('hNow').onclick = () => { HOME.date = todayHN(); HOME.hour = nowHourHN(); $('hDate').value = HOME.date; $('hHour').value = HOME.hour; loadReal(); };
    $('hPlay').onclick = () => { if (anim) return stop(); if (HOME.hour >= 23.9) HOME.hour = 0; $('hPlay').textContent = '❚❚'; anim = requestAnimationFrame(play); };
    $('hGo').onclick = applyDetailed;
    $('hGrid').onclick = () => A().go('grid');
    $('hLawGo').onclick = () => A().go('install');
    $('hMountGo').onclick = () => A().go('mount');
  }
  // Ubicación propia: se usa solo en el navegador; el clima viene de la ciudad con datos más cercana
  function setLoc(lat, lon) {
    const S = A().S, C = A().CITIES; let best = 'tgu', bd = 1e9;
    for (const [k, c] of Object.entries(C)) { if (k === 'custom') continue; const dd = Math.hypot(c.lat - lat, (c.lon - lon) * Math.cos(lat * Math.PI / 180)); if (dd < bd) { bd = dd; best = k; } }
    HOME.loc = { lat, lon }; S.site.city = best; S.site.src = 'tmy'; Object.assign(S.site, { lat, lon, alt: C[best].alt, Tmin: C[best].Tmin, Tmax: C[best].Tmax, tz: -6 });
    A().loadTmy().then(() => { EXT.home(); A().renderSummary(); });
  }
  EXT.setLoc = setLoc;
  function play(ts) { if (!lastT) lastT = ts; HOME.hour += (ts - lastT) / 1000 * 1.6; lastT = ts; if (HOME.hour >= 24) { HOME.hour = 24; stop(); } const h = $('hHour'); if (h) h.value = HOME.hour; sunUpdate(); if (anim) anim = requestAnimationFrame(play); }
  function stop() { cancelAnimationFrame(anim); anim = 0; lastT = 0; const b = $('hPlay'); if (b) b.textContent = '▶'; }

  function update(rebuild) {
    if (!$('hK')) return;
    const c = compute(), kpi = A().kpi;
    const cover = c.tot.pv / c.Eyear;
    drawFlow(c);
    if (c.farm) { updateFarm(c, rebuild); return; }
    $('hK').innerHTML = kpi(L('Paneles recomendados', 'Recommended panels'), c.n, '', 'hl') + kpi(L('Potencia instalada', 'Installed power'), fx(c.kWp, 2), 'kWp') + kpi(L('Producción anual', 'Annual production'), fx(c.tot.pv, 0), 'kWh') + kpi(L('Cubre tu consumo', 'Covers your consumption'), fx(cover * 100, 0), '%') + kpi(L('Ahorro anual', 'Annual savings'), 'L ' + fx(c.save, 0), '', 'ok') + kpi(L('Inversión estimada', 'Estimated investment'), 'L ' + fx(c.costHNL, 0)) + kpi(L('Retorno', 'Payback'), fx(c.payback, 1), L('años', 'years')) + kpi(L('Área de paneles', 'Panel area'), fx(c.area, 0), 'm²');
    const inv = c.inv;
    $('hSys').innerHTML = `<div class="kv"><span>${L('Panel', 'Panel')}</span><span>${c.m.Pstc.toFixed(0)} W · ${c.m.Ns} ${L('celdas', 'cells')}</span><span>${L('Inversor', 'Inverter')}${c.auto ? ' <small style="color:var(--muted)">(' + L('automático', 'automatic') + ')</small>' : ''}</span><span>${c.nInv} × ${A().esc(inv.name.split(' (')[0])}</span><span>${L('Potencia CA', 'AC power')}</span><span>${fx(c.kWac, 2)} kW</span><span>${L('Relación CC/CA', 'DC/AC ratio')}</span><span>${fx(c.dcac, 2)}</span>
      ${c.strings ? `<span>${L('Configuración', 'Configuration')}</span><span>${c.strings.ns} string(s) × ${c.strings.s} ${L('paneles', 'panels')}${c.nInv > 1 ? ' ' + L('por inversor', 'per inverter') : ''}</span><span>V<sub>oc</sub> ${L('en frío', 'cold')} (${fx(c.Tmin - 2, 0)} °C)</span><span>${fx(c.strings.VocC, 0)} / ${fx(inv.Vdcmax, 0)} V</span>` : ''}
      <span>${L('Producción específica', 'Specific yield')}</span><span>${fx(c.tot.pv / c.kWp, 0)} kWh/kWp</span><span>${L('Factura actual', 'Current bill')}</span><span>L ${fx(c.b0 / 12, 0)}/${L('mes', 'mo')}</span><span>${L('Factura con paneles', 'Bill with panels')}</span><span>L ${fx(Math.max(0, c.b1 - c.credit) / 12, 0)}/${L('mes', 'mo')}</span><span>${L('Excedentes vendidos', 'Surplus sold')}</span><span>${fx(c.tot.exp, 0)} kWh/${L('año', 'yr')}</span></div>
      ${advice(c)}
      ${c.opt ? `<p class="note">${L('SolarEdge usa optimizadores por panel; la tensión del string la fija el inversor.', 'SolarEdge uses per-panel optimizers; the inverter sets the string voltage.')}</p>` : ''}`;
    const lw = lawChecks(c).filter(x => !x.info), okN = lw.filter(x => x.ok).length;
    $('hSys').querySelectorAll('[data-fix]').forEach(b => b.onclick = () => fix(b.dataset.fix));
    $('hLaw').innerHTML = `<div class="kpis">${kpi(L('Requisitos legales', 'Legal requirements'), okN + ' / ' + lw.length, L('cumplidos', 'met'), okN === lw.length ? 'ok' : 'bad')}</div><p class="note">${L('Revisión del Reglamento de la Ley General de la Industria Eléctrica (Art. 47–50), protecciones, conductores, montaje en 3D y diagrama unifilar con las marcas sugeridas.', 'Review of the General Electricity Industry Law Regulation (Art. 47–50), protections, conductors, 3D installation and single-line diagram with suggested brands.')}</p>`;
    const months = L('Ene Feb Mar Abr May Jun Jul Ago Sep Oct Nov Dic', 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec').split(' '), xs = months.map((_, i) => i + 1), css = A().css;
    window.CHART.draw($('hMonC'), { xs, xmin: 0.5, xmax: 12.5, xticks: xs.map((x, i) => ({ x, label: months[i] })), series: [{ type: 'bar', ys: c.mon.map(x => x.load), color: css('--s6'), bw: 0.27, off: -0.15, label: L('Consumo', 'Consumption') }, { type: 'bar', ys: c.mon.map(x => x.pv), color: css('--s4'), bw: 0.27, off: 0.15, label: L('Producción solar', 'Solar production') }], xl: '', yl: 'kWh', compact: true, ymaxL: Math.max(...c.mon.map(x => Math.max(x.load, x.pv))) * 1.1 });
    if (rebuild && scene) build3d();
    sunUpdate();
  }

  /* ---------- Recomendaciones en lenguaje sencillo ---------- */
  function advice(c) {
    const items = [], recName = c.autoIdx != null ? window.INVERTERS_GRID[c.autoIdx].name.split(' (')[0] : null;
    const btnAuto = !c.auto ? `<button class="btn sm pri" data-fix="auto">${L('Usar el inversor recomendado', 'Use the recommended inverter')}</button>` : '';
    const btnMicro = c.inv.type !== 'micro' ? `<button class="btn sm" data-fix="micro">${L('Probar con microinversores', 'Try microinverters')}</button>` : '';
    const e = c.strErr;
    if (e && e.why === 'few') items.push(['bad', L('Este inversor es demasiado grande para tu sistema', 'This inverter is too large for your system'), L(`Necesita al menos ${e.sMin} paneles conectados en fila (en serie) para poder encender, y tu diseño tiene ${c.n}. Elige un inversor más pequeño o microinversores, que funcionan con cualquier número de paneles.`, `It needs at least ${e.sMin} panels connected in a row (in series) to switch on, and your design has ${c.n}. Choose a smaller inverter or microinverters, which work with any number of panels.`), btnAuto + btnMicro]);
    else if (e && e.why === 'range') items.push(['bad', L('El panel y el inversor no son compatibles', 'The panel and the inverter are not compatible'), L(`Con este panel, el voltaje de los paneles en fila queda fuera del rango en que trabaja el inversor (de ${fx(c.inv.Vmin, 0)} a ${fx(c.inv.Vdcmax, 0)} V). Cambia de inversor o prueba otro tipo de panel.`, `With this panel, the voltage of the panels in a row falls outside the inverter operating range (${fx(c.inv.Vmin, 0)} to ${fx(c.inv.Vdcmax, 0)} V). Change the inverter or try another panel type.`), btnAuto + `<button class="btn sm" data-fix="cells">${L('Probar otro formato de panel', 'Try another panel format')}</button>`]);
    else if (e && e.why === 'many') items.push(['bad', L('No se logra una conexión equilibrada de los paneles', 'The panels cannot be connected evenly'), L('Con este inversor no se pueden repartir los paneles en filas iguales sin pasarte del límite legal de producción. El inversor recomendado lo resuelve.', 'With this inverter the panels cannot be split into equal rows without exceeding the legal production limit. The recommended inverter solves it.'), btnAuto + btnMicro]);
    if (c.batt) items.push(['warn', L('Este equipo es para sistemas con baterías', 'This device is for battery systems'), L('Es un inversor-cargador: no se conecta directamente a los paneles, necesita además un controlador de carga solar. Para un sistema conectado a la red, usa un inversor de red.', 'It is an inverter-charger: it does not connect directly to the panels and also needs a solar charge controller. For a grid-tied system, use a grid inverter.'), btnAuto]);
    if (!e && c.dcac > (c.inv.type === 'micro' ? 1.6 : 1.35)) items.push(['warn', L('Tienes más paneles de los que el inversor puede aprovechar', 'You have more panels than the inverter can use'), L('En las horas de más sol el inversor limitará la potencia y se perderá algo de energía. Un inversor un poco más grande lo evita.', 'At peak sun hours the inverter will limit power and some energy will be lost. A slightly larger inverter avoids it.'), btnAuto]);
    if (!e && c.dcac < 0.8 && c.inv.type === 'micro' && c.m.Pstc < 250) items.push(['warn', L('Tus paneles son pequeños para un microinversor', 'Your panels are small for a microinverter'), L(`Cada microinversor puede manejar unos ${fx(c.inv.Paco, 0)} W, pero cada panel solo da ${fx(c.m.Pstc, 0)} W. Con un panel residencial actual (≈ 440 W) aprovecharás mejor cada equipo y cubrirás más consumo.`, `Each microinverter can handle about ${fx(c.inv.Paco, 0)} W, but each panel only gives ${fx(c.m.Pstc, 0)} W. With a current residential panel (≈ 440 W) you will make better use of each device and cover more consumption.`), `<button class="btn sm pri" data-fix="cells60">${L('Usar el panel residencial recomendado', 'Use the recommended residential panel')}</button>`]);
    else if (!e && c.dcac < 0.8) items.push(['warn', L('El inversor es más grande de lo necesario', 'The inverter is larger than needed'), L('Funcionará, pero pagarás de más y trabajará con menor eficiencia. Te conviene uno más pequeño.', 'It will work, but you will overpay and it will run at lower efficiency. A smaller one suits you better.'), btnAuto]);
    if (c.kWac > c.dmax + 1e-9) items.push(['bad', L('El inversor supera tu demanda máxima', 'The inverter exceeds your maximum demand'), L(`La ley (Art. 47) no permite instalar más potencia que tu demanda máxima (${fx(c.dmax, 1)} kW). Si conoces tu demanda real (aparece en recibos comerciales), escríbela en la pregunta 2; si no, usa el inversor recomendado.`, `The law (Art. 47) does not allow installing more power than your maximum demand (${fx(c.dmax, 1)} kW). If you know your real demand (shown on commercial bills), enter it in question 2; otherwise use the recommended inverter.`), btnAuto + btnMicro]);
    if (c.cappedDem) items.push(['info', L('Ajustamos el sistema a tu demanda máxima', 'We sized the system to your maximum demand'), L(`La ley no permite instalar más potencia que tu demanda máxima (${fx(c.dmax, 1)} kW${HOME.dmax > 0 ? '' : ', estimada'}). Por eso el sistema cubre ${fx(c.tot.pv / c.Eyear * 100, 0)} % de tu consumo. Si tu demanda real es mayor, escríbela en la pregunta 2.`, `The law does not allow installing more power than your maximum demand (${fx(c.dmax, 1)} kW${HOME.dmax > 0 ? '' : ', estimated'}). That is why the system covers ${fx(c.tot.pv / c.Eyear * 100, 0)} % of your consumption. If your real demand is higher, enter it in question 2.`), '']);
    if (c.capped) items.push(['info', L('Ajustamos el número de paneles', 'We adjusted the number of panels'), L('La ley pide que el sistema produzca menos energía al año de la que consumes, así que limitamos la cantidad de paneles.', 'The law requires the system to produce less energy per year than you consume, so we limited the number of panels.'), '']);
    if (!items.length) return `<div class="alert ok" style="margin-top:14px"><b>${L('Todo en orden.', 'All good.')}</b> ${L(`El panel y el inversor${recName && c.auto ? '' : ''} son compatibles y el sistema cumple la normativa.`, 'The panel and inverter are compatible and the system meets the regulations.')}</div>`;
    return items.map(([cls, t, d, b]) => `<div class="alert ${cls === 'info' ? 'ok' : cls}" style="margin-top:14px"><b style="display:block;margin-bottom:4px">${t}</b>${d}${b ? `<div class="btns" style="margin-top:10px">${b}</div>` : ''}</div>`).join('');
  }
  function fix(k) {
    if (k === 'auto') HOME.invIdx = 'auto';
    if (k === 'micro') HOME.invIdx = window.INVERTERS_GRID.findIndex(v => v.type === 'micro');
    if (k === 'cells') { HOME.fmt = HOME.fmt === 'res' ? 'com' : 'res'; HOME.modId = null; }
    if (k === 'cells60') { HOME.fmt = 'res'; HOME.modId = null; HOME.invIdx = 'auto'; }
    EXT.home();
  }

  function drawFlow(c) {
    const el = $('hFlow'); if (!el) return;
    const k = v => v >= 1e6 ? fx(v / 1e6, 2) + ' GWh' : v >= 1e4 ? fx(v / 1000, 1) + ' MWh' : fx(v, 0) + ' kWh';
    const node = (ic, t, v, sub, hot) => `<div class="fnode ${hot ? 'hot' : ''}"><div class="ic">${ic}</div><b>${t}</b><span>${v}</span><small>${sub}</small></div>`;
    const ar = s => `<div class="farrow">${s || '→'}</div>`;
    const eta = c.tot.pv / Math.max(1, c.Ykwp * c.kWp) * 100;
    if (c.farm) el.innerHTML = node('☀️', L('Paneles', 'Panels'), fx(c.kWp / 1000, 2) + ' MWp', `${fx(c.n, 0)} ${L('paneles', 'panels')}`, true) + ar() + node('🔌', L('Inversores', 'Inverters'), `${c.nInv} × ${fx(c.inv.Paco / 1000, 0)} kW`, `η ${fx(eta, 1)} %`) + ar() + node('🏗️', L('Subestación', 'Substation'), fx(c.kWac / 1000, 2) + ' MWac', L('elevación a media tensión', 'step-up to medium voltage')) + ar() + node('⚡', L('Red', 'Grid'), k(c.E), L('energía vendida al año', 'energy sold per year'), true);
    else el.innerHTML = node('☀️', L('Paneles', 'Panels'), k(c.Ykwp * c.kWp), `${c.n} × ${c.m.Pstc.toFixed(0)} W`, true) + ar() + node('🔌', L('Inversor', 'Inverter'), k(c.tot.pv), `η ${fx(eta, 1)} %`) + ar() + node(HOME.kind === 'gas' ? '⛽' : HOME.kind === 'com' ? '🏭' : HOME.kind === 'apt' ? '🏢' : '🏠', L('Consumo', 'Consumption'), k(c.tot.self), L(`autoconsumo · ${fx(c.tot.self / Math.max(1, c.tot.load) * 100, 0)} % de tu demanda`, `self-consumed · ${fx(c.tot.self / Math.max(1, c.tot.load) * 100, 0)} % of demand`)) + ar('⇄') + node('⚡', L('Red ENEE', 'ENEE grid'), `↑ ${k(c.tot.exp)}`, `↓ ${k(c.tot.imp)} ${L('comprados', 'bought')}`, true);
  }
  EXT.homeRedraw = () => { if (calc) update(false); };
  function updateFarm(c, rebuild) {
    const kpi = A().kpi, css = A().css;
    $('hK').innerHTML = kpi(L('Paneles', 'Panels'), fx(c.n, 0), '', 'hl') + kpi(L('Potencia', 'Power'), fx(c.kWp / 1000, 2), 'MWp') + kpi(L('Potencia CA', 'AC power'), fx(c.kWac / 1000, 2), 'MWac') + kpi(L('Energía anual', 'Annual energy'), fx(c.E / 1000, 0), 'MWh') + kpi(L('Factor de planta', 'Capacity factor'), fx(c.CF * 100, 1), '%') + kpi(L('Ingresos anuales', 'Annual revenue'), 'USD ' + fx(c.revUSD / 1e6, 2) + ' M', '', 'ok') + kpi(L('Inversión estimada', 'Estimated investment'), 'USD ' + fx(c.invUSD / 1e6, 2) + ' M') + kpi(L('Retorno simple', 'Simple payback'), fx(c.payback, 1), L('años', 'years')) + kpi(L('Terreno', 'Land'), fx(c.landHa, 1), 'ha');
    $('hSys').innerHTML = `<div class="kv"><span>${L('Panel', 'Panel')}</span><span>${c.m.Pstc} W${c.m.bifacial ? ' ' + L('bifacial', 'bifacial') : ''}</span><span>${L('Inversores', 'Inverters')}${c.auto ? ' <small style="color:var(--muted)">(' + L('automático', 'automatic') + ')</small>' : ''}</span><span>${c.nInv} × ${A().esc(c.inv.name.split(' (')[0])}</span><span>${L('Relación CC/CA', 'DC/AC ratio')}</span><span>${fx(c.dcac, 2)}</span>${c.strings ? `<span>${L('Configuración', 'Configuration')}</span><span>${c.strings.ns} × ${c.strings.s} ${L('paneles por inversor', 'panels per inverter')}</span>` : ''}<span>${L('Producción específica', 'Specific yield')}</span><span>${fx(c.E / c.kWp, 0)} kWh/kWp</span><span>${L('Ganancia bifacial supuesta', 'Assumed bifacial gain')}</span><span>${fx((c.bif - 1) * 100, 0)} %</span><span>${L('Ingresos', 'Revenue')}</span><span>L ${fx(c.revUSD * HOME.fx / 1e6, 1)} M/${L('año', 'yr')}</span></div>
      <p class="note">${L('Mesas fijas de 2 paneles en vertical, separación para un 42 % de ocupación del suelo, conexión a media tensión con subestación elevadora. Ingresos sin costos de operación, impuestos ni financiamiento.', 'Fixed 2-in-portrait tables, spacing for 42 % ground coverage, medium-voltage connection with step-up substation. Revenue excludes operating costs, taxes and financing.')}</p>${advice(c)}`;
    $('hSys').querySelectorAll('[data-fix]').forEach(b => b.onclick = () => fix(b.dataset.fix));
    $('hLaw').innerHTML = `<p class="note" style="margin-top:0">${L('Un parque solar es una empresa generadora: se registra ante la CREE y vende su energía por contratos o en el mercado eléctrico.', 'A solar park is a generating company: it registers with CREE and sells its energy through contracts or the electricity market.')}</p>`;
    const months = L('Ene Feb Mar Abr May Jun Jul Ago Sep Oct Nov Dic', 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec').split(' '), xs = months.map((_, i) => i + 1);
    window.CHART.draw($('hMonC'), { xs, xmin: 0.5, xmax: 12.5, xticks: xs.map((x, i) => ({ x, label: months[i] })), series: [{ type: 'bar', ys: c.mon.map(x => x.pv / 1000), color: css('--s4'), bw: 0.5, label: L('Energía generada (MWh)', 'Energy generated (MWh)') }], xl: '', yl: 'MWh', compact: true, ymaxL: Math.max(...c.mon.map(x => x.pv / 1000)) * 1.1 });
    if (rebuild && scene) build3d();
    sunUpdate();
  }

  /* ---------- 3D ---------- */
  function init3d() {
    const el = $('h3dc'); if (!el) return;
    if (!window.THREE || !window.THREE.OrbitControls) { el.innerHTML = `<p class="note" style="padding:20px">${L('No se pudo cargar la vista 3D.', 'The 3D view could not be loaded.')}</p>`; return; }
    try { if (scene) scene.dispose(); scene = window.SCENE3D.create(el); build3d(); sunUpdate(); scene.controls.autoRotate = false; if (HOME.wx === 'real') loadReal(); }
    catch (e) { el.innerHTML = `<p class="note" style="padding:20px">${L('Tu navegador no admite WebGL para la vista 3D.', 'Your browser does not support WebGL for the 3D view.')}</p>`; scene = null; }
  }
  function build3d() {
    if (!scene || !calc) return;
    const m = calc.m; let pw, ph;
    if (m.W && m.H) { pw = m.W; ph = m.H; } else { const ratio = m.Ns === 36 ? 0.67 / 1.48 : m.Ns === 60 ? 0.99 / 1.65 : 0.99 / 1.96; ph = Math.sqrt(m.A / ratio); pw = m.A / ph; }
    scene.build({ kind: HOME.kind, n: Math.min(calc.n, HOME.kind === 'farm' ? 5000 : 1500), mod: { pw, ph }, tilt: HOME.tilt, az: HOME.az });
  }
  /* ---------- Clima real de una fecha (Open-Meteo; respaldo NASA POWER) ---------- */
  // Open-Meteo: pronóstico y días recientes (modelos meteorológicos) e histórico (reanálisis ERA5, desde 1940).
  // NASA POWER: histórico satelital/reanálisis, con meses de retraso en la radiación. Ningún valor se inventa:
  // si ninguna fuente responde, se avisa y se vuelve al año típico.
  const todayHN = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Tegucigalpa' });
  const nowHourHN = () => { const p = new Date().toLocaleTimeString('en-GB', { timeZone: 'America/Tegucigalpa', hour12: false }).split(':'); return Math.min(23.95, +p[0] + p[1] / 60); };
  const addDays = (ds, n) => { const d = new Date(ds + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const dayDiff = ds => Math.round((Date.parse(ds + 'T12:00:00Z') - Date.parse(todayHN() + 'T12:00:00Z')) / 864e5);
  const doyOfDate = ds => { const d = new Date(ds + 'T12:00:00Z'); return Math.floor((d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5); };
  const WX = new Map(); let REAL = { key: null, day: null, state: 'idle' };
  const locKey = () => { const S = A().S; return `${(+S.site.lat).toFixed(3)},${(+S.site.lon).toFixed(3)}`; };
  // Valores horarios por intervalo [h, h+1): los de Open-Meteo son promedios de la hora anterior a la marca.
  function fromOM(j, src) {
    const H = j.hourly, n = H.time.length, at = (a, k) => (k < n && a[k] != null ? a[k] : NaN);
    const iv = (a, h) => at(a, h + 1), mid = (a, h) => { const x = at(a, h), y = at(a, h + 1); return isNaN(y) ? x : isNaN(x) ? y : (x + y) / 2; };
    const d = { src, ghi: [], dhi: [], ta: [], ws: [], pr: [], cc: [], code: [] };
    for (let h = 0; h < 24; h++) { d.ghi.push(iv(H.shortwave_radiation, h)); d.dhi.push(iv(H.diffuse_radiation, h)); d.ta.push(mid(H.temperature_2m, h)); d.ws.push(mid(H.wind_speed_10m, h)); d.pr.push(iv(H.precipitation, h)); d.cc.push(mid(H.cloud_cover, h)); d.code.push(H.weather_code ? at(H.weather_code, h + 1) : NaN); }
    // la última hora no tiene valor siguiente: se usa la radiación nula de la noche
    d.ghi[23] = isNaN(d.ghi[23]) ? 0 : d.ghi[23]; d.dhi[23] = isNaN(d.dhi[23]) ? 0 : d.dhi[23]; d.pr[23] = isNaN(d.pr[23]) ? 0 : d.pr[23];
    return d;
  }
  function fromPOWER(j) {
    const P = j.properties.parameter, ks = Object.keys(P.ALLSKY_SFC_SW_DWN).sort(), f = v => (v == null || v <= -998 ? NaN : v);
    const d = { src: 'NASA POWER', ghi: [], dhi: [], ta: [], ws: [], pr: [], cc: [], code: [] };
    ks.slice(0, 24).forEach(k => { d.ghi.push(f(P.ALLSKY_SFC_SW_DWN[k])); d.dhi.push(f(P.ALLSKY_SFC_SW_DIFF[k])); d.ta.push(f(P.T2M[k])); d.ws.push(f(P.WS10M[k])); d.pr.push(f(P.PRECTOTCORR[k])); d.cc.push(f(P.CLOUD_AMT[k])); d.code.push(NaN); });
    return d;
  }
  const valid = d => d && d.ghi.length === 24 && d.ghi.filter(v => !isNaN(v)).length >= 20 && d.ta.filter(v => !isNaN(v)).length >= 20;
  async function getJSON(u) { const r = await fetch(u); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
  function fetchDay(lat, lon, ds) {
    const key = `${lat.toFixed(3)},${lon.toFixed(3)},${ds}`; if (WX.has(key)) return WX.get(key);
    const pr = (async () => {
      const diff = dayDiff(ds), H = 'temperature_2m,shortwave_radiation,diffuse_radiation,cloud_cover,precipitation,wind_speed_10m,weather_code';
      const q = `latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&hourly=${H}&wind_speed_unit=ms&timezone=America%2FTegucigalpa&start_date=${ds}&end_date=${addDays(ds, 1)}`;
      const tries = [];
      if (diff >= -80) tries.push(['https://api.open-meteo.com/v1/forecast?' + q, j => fromOM(j, diff > 0 ? 'Open-Meteo · ' + L('pronóstico', 'forecast') : diff === 0 ? 'Open-Meteo · ' + L('hoy (observado y pronóstico)', 'today (observed and forecast)') : 'Open-Meteo · ' + L('días recientes', 'recent days'))]);
      if (diff <= -3) tries.push(['https://archive-api.open-meteo.com/v1/archive?' + q, j => fromOM(j, 'Open-Meteo · ' + L('histórico ERA5', 'ERA5 history'))]);
      if (diff < 0) { const c = ds.replace(/-/g, ''); tries.push([`https://power.larc.nasa.gov/api/temporal/hourly/point?parameters=ALLSKY_SFC_SW_DWN,ALLSKY_SFC_SW_DIFF,T2M,WS10M,PRECTOTCORR,CLOUD_AMT&community=RE&longitude=${lon.toFixed(4)}&latitude=${lat.toFixed(4)}&start=${c}&end=${c}&format=JSON&time-standard=LST`, fromPOWER]); }
      let last = null;
      for (const [u, parse] of tries) { try { const d = parse(await getJSON(u)); if (valid(d)) return d; last = 'incomplete'; } catch (e) { last = e.message; } }
      throw new Error(last || 'no source');
    })();
    WX.set(key, pr); pr.catch(() => WX.delete(key)); return pr;
  }
  // arreglo tipo TMY con solo las 24 horas del día (para reutilizar el modelo de transposición y temperatura)
  function dayTmy(d, doy) {
    const n = 8784, o = { n, ghi: new Float32Array(n), dhi: new Float32Array(n), ta: new Float32Array(n), ws: new Float32Array(n) }, b = (doy - 1) * 24;
    const fill = (a, k) => { const v = a[k]; return isNaN(v) ? (k > 0 ? fill(a, k - 1) : 0) : v; };
    for (let h = 0; h < 24; h++) {
      // centro de la hora h: promedio de los intervalos vecinos
      const g0 = fill(d.ghi, Math.max(0, h - 1)), g1 = fill(d.ghi, h), f0 = fill(d.dhi, Math.max(0, h - 1)), f1 = fill(d.dhi, h);
      o.ghi[b + h] = (g0 + g1) / 2; o.dhi[b + h] = isNaN(d.dhi[h]) ? (g0 + g1) / 2 : (f0 + f1) / 2; o.ta[b + h] = fill(d.ta, h); o.ws[b + h] = fill(d.ws, h);
    }
    for (let h = 0; h < 24; h++) if (o.dhi[b + h] > o.ghi[b + h]) o.dhi[b + h] = o.ghi[b + h];
    o.ghi[b + 24] = o.ghi[b + 23]; o.dhi[b + 24] = o.dhi[b + 23]; o.ta[b + 24] = o.ta[b + 23]; o.ws[b + 24] = o.ws[b + 23];
    return o;
  }
  function loadReal() {
    const S = A().S, ds = HOME.date, key = locKey() + ',' + ds;
    REAL = { key, day: null, state: 'loading' }; wxNote();
    fetchDay(+S.site.lat, +S.site.lon, ds).then(d => {
      if (REAL.key !== key) return;
      const doy = doyOfDate(ds); REAL = { key, state: 'ok', day: { ...d, ds, doy, tmy: dayTmy(d, doy) } }; sunUpdate(); wxNote();
    }).catch(err => { if (REAL.key !== key) return; REAL = { key, state: 'error', day: null, err: String(err.message || err) }; sunUpdate(); wxNote(); });
  }
  const WCODE = c => c == null || isNaN(c) ? '' : c === 0 ? L('despejado', 'clear') : c <= 2 ? L('parcialmente nublado', 'partly cloudy') : c === 3 ? L('nublado', 'overcast') : c <= 48 ? L('niebla', 'fog') : c <= 57 ? L('llovizna', 'drizzle') : c <= 67 ? L('lluvia', 'rain') : c <= 77 ? L('nieve', 'snow') : c <= 82 ? L('chubascos', 'showers') : L('tormenta', 'thunderstorm');
  function wxNote() {
    const el = $('hWxNote'); if (!el || HOME.wx !== 'real') return;
    if (REAL.state === 'loading') { el.textContent = L('Consultando el clima real…', 'Fetching real weather…'); return; }
    if (REAL.state === 'error') { el.textContent = L('No hay datos de clima para esa fecha y lugar (o el servicio no respondió). Se muestra el año típico.', 'No weather data for that date and place (or the service did not respond). Showing the typical year.'); return; }
    if (REAL.state === 'ok') { const d = REAL.day; el.innerHTML = `${A().esc(d.src)} · ${L('producción del día', 'day production')} <b>${fx(d.Eday ?? 0, d.Eday >= 100 ? 0 : 1)} kWh</b>${d.Etyp != null ? ` (${L('año típico', 'typical year')}: ${fx(d.Etyp, d.Etyp >= 100 ? 0 : 1)} kWh)` : ''} · ${L('lluvia', 'rain')} ${fx(d.pr.reduce((a, b) => a + (isNaN(b) ? 0 : b), 0), 1)} mm`; }
  }

  function sunUpdate() {
    if (!calc) return;
    const S = A().S, md = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const real = HOME.wx === 'real' && REAL.state === 'ok' && REAL.day && REAL.key === locKey() + ',' + HOME.date ? REAL.day : null;
    const doyT = md.slice(0, HOME.month).reduce((a, b) => a + b, 0) + Math.min(HOME.day, md[HOME.month]);
    const doy = HOME.wx === 'real' && HOME.date ? doyOfDate(HOME.date) : doyT;
    const site = { ...S.site, tilt: HOME.tilt, az: HOME.az };
    const sp = window.SOLAR.position(site, doy, HOME.hour);
    const path = []; for (let h = 4.5; h <= 19.5; h += 0.25) { const p = window.SOLAR.position(site, doy, h); path.push({ az: p.az, el: p.el }); }
    // producción a esa hora del día elegido (año meteorológico típico de PVGIS)
    const t = real ? real.tmy : A().useTmy(), Sx = { ...S, site: { ...site, src: 'tmy' }, loss: { soil: 0, mism: 0, iam: true, degr: 0, year: 1 }, modInfo: { noct: calc.m.noct } };
    const PacAt = (tt, dd, h) => { const w = window.SIM.weatherAt(Sx, tt, dd, h); const p = Math.max(0, w.Geff / 1000 * (1 + calc.m.gP / 100 * (cellTc(w) - 25)) * (1 - HOME.lossDC / 100)); return sandia(calc.inv, p * calc.kWp * 1000 / calc.nInv) * calc.nInv / 1000; };
    if (real && real.Eday == null) { let e = 0, e2 = 0; const tt = A().useTmy(), dT = Math.min(365, doy); for (let h = 0.5; h < 24; h++) { e += PacAt(real.tmy, doy, h); e2 += PacAt(tt, dT, h); } real.Eday = e; real.Etyp = e2; setTimeout(wxNote, 0); }
    const w = window.SIM.weatherAt(Sx, t, doy, HOME.hour), G = w.Geff, pk = w.Geff / 1000 * (1 + calc.m.gP / 100 * (cellTc(w) - 25)) * (1 - HOME.lossDC / 100);
    let gh = 0, cs = 0; for (let hh2 = 8.5; hh2 <= 15.5; hh2 += 1) { const w2 = window.SIM.weatherAt(Sx, t, doy, hh2); gh += w2.irr.ghi; cs += window.SOLAR.clearSky(site, w2.sp).ghi; }
    const hi = Math.min(23, Math.max(0, Math.floor(HOME.hour)));
    const cloud = real && !isNaN(real.cc[hi]) ? real.cc[hi] / 100 : t ? Math.max(0, Math.min(1, (1 - gh / Math.max(cs, 1)) * 1.6)) : 0.25;
    const rainNow = real && !isNaN(real.pr[hi]) ? real.pr[hi] : 0;
    const Pdc = pk * calc.kWp * 1000 / calc.nInv, Pac = sandia(calc.inv, Pdc) * calc.nInv / 1000;
    if (scene) { scene.setSun(sp.az, sp.el, path, Pac / Math.max(calc.kWac, 0.001), cloud); if (scene.setRain) scene.setRain(rainNow); }
    const hh = h => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60) % 60).padStart(2, '0')}`;
    const city = HOME.loc ? L('Mi ubicación', 'My location') : A().CITIES[S.site.city] ? A().CITIES[S.site.city].name : '';
    const hud = $('hud'); if (hud) hud.innerHTML = `<b>${city}</b><span>${hh(HOME.hour)} · ${HOME.wx === 'real' && HOME.date ? new Date(HOME.date + 'T12:00:00Z').toLocaleDateString(A().LANG === 'en' ? 'en-US' : 'es-HN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : `${HOME.day} ${$('hMonth') ? $('hMonth').selectedOptions[0].text.toLowerCase() : ''}`}</span><span class="big">${Pac >= 1000 ? fx(Pac / 1000, 2) + ' MW' : fx(Pac, 2) + ' kW'}</span><span>${L('producción a esta hora', 'output at this hour')}</span><span>${sp.el > 0 ? L(`Sol a ${fx(sp.el, 0)}° de altura`, `Sun ${fx(sp.el, 0)}° high`) : L('Noche', 'Night')} · ${L('nubosidad', 'cloudiness')} ${fx(cloud * 100, 0)} %${real && WCODE(real.code[hi]) ? ' · ' + WCODE(real.code[hi]) : ''}${rainNow >= 0.1 ? ` · ${L('lluvia', 'rain')} ${fx(rainNow, 1)} mm/h` : ''}</span>`;
  }

  /* ---------- Llevar el diseño al simulador detallado ---------- */
  function applyDetailed() {
    const S = A().S, c = calc; if (!c) return;
    S.modId = HOME.modId; S.G = []; S.T = []; S.bp = [];
    let Ns = c.strings ? c.strings.s : Math.min(8, Math.max(1, Math.round(c.n / Math.max(1, Math.round(Math.sqrt(c.n / 3))))));
    Ns = Math.min(8, Ns); let Np = Math.min(6, Math.max(1, Math.round(c.n / Ns)));
    S.arr.Ns = Ns; S.arr.Np = Np;
    S.site.tilt = HOME.tilt; S.site.az = HOME.az; S.site.src = 'tmy';
    const prof = window.SYS.LOADPROF[isRes() ? 'res' : 'com'];
    S.load.prof = isRes() ? 'res' : 'com'; S.load.P = Math.round(HOME.kwh / 30 / prof.reduce((a, b) => a + b, 0) * 1000 / 10) * 10;
    A().applyModule(); A().refresh(); A().go('gen');
  }

  EXT.homeState = () => ({ HOME, calc });
  EXT.homeCompute = () => compute();
  EXT.lawChecks = c => lawChecks(c);
})();
