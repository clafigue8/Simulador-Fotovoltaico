/* =====================================================================
   Motor de simulación: punto de operación, día (15 min) y año (8 760 h)
   ===================================================================== */
(function (G) {
  'use strict';
  const { PV, SOLAR, SYS } = G;

  // Construye la configuración eléctrica del arreglo para unas condiciones dadas
  function arrayCfg(S, Gmap, Tmap) {
    const b = S.model.bishop;
    return {
      cell: { ...S.cell, bishop: { on: b.on, a: b.a, m: b.m, Vbr: b.Vbr } },
      mod: S.mod, Ns: S.arr.Ns, Np: S.arr.Np, Gc: Gmap, Tc: Tmap, bp: S.bp,
      bypass: S.model.schottky ? { n: 1.1, Is: 2e-6 } : { n: 1.6, Is: 1e-8 },
      block: { on: S.arr.block, n: 1.1, Is: 2e-6 }
    };
  }
  const mapCells = (S, f) => S.G.map((str, s) => str.map((mod, m) => mod.map((g, c) => f(g, s, m, c))));

  function components(S) {
    const bat = SYS.BATTERIES.find(b => b.id === S.bat.id) || SYS.BATTERIES[0];
    const inv = SYS.INVERTERS.find(i => i.id === S.inv.id) || SYS.INVERTERS[0];
    const bm = SYS.batModel(bat, S.bat.ns, S.bat.np);
    const socMax = S.ctl.socMax, lvd = S.ctl.lvdAuto ? 1 - bat.dod : S.ctl.lvd;
    return { bat, inv, bm, socMax, lvd };
  }

  /* ---------- Un paso de operación del sistema ---------- */
  // cv: curva del arreglo; st: estado {soc, Vprev}; Pload: demanda CA [W]; dt [h]; Tamb [°C]
  function step(S, C, cv, mt, st, Pload, dt, Tamb = 30) {
    const { bm, inv, socMax, lvd } = C, mm = 1 - S.loss.mism / 100;
    const Rpv = SYS.wireR(S.wires.pv, Tamb + 15), Rbat = SYS.wireR(S.wires.bat, Tamb + 5);
    const Rac = SYS.wireR(S.wires.ac, Tamb + 5);
    const soc = st.soc, E = bm.ocv(soc);
    let Ptrk = 0, Vop = 0, Ipv = 0;
    if (cv && mt.Pmp > 0) {
      if (S.ctl.mode === 'mppt') { Ptrk = mt.Pmp; Vop = mt.Vmp; Ipv = mt.Imp; }
      else if (S.ctl.mode === 'po') { const r = PV.localMax(cv, st.Vprev || 0.8 * mt.Voc); Ptrk = r.P; Vop = r.V; Ipv = r.I; }
      else { // acople directo: tensión del arreglo = tensión de batería + caída en el cable
        let v = E; for (let k = 0; k < 6; k++) { const i = PV.iAt(cv, v); v = E + 0.02 * E + i * Rpv; }
        Vop = v; Ipv = PV.iAt(cv, v); Ptrk = Vop * Ipv;
      }
    }
    const Pmpp = mt ? mt.Pmp : 0;
    const Pmm = Ptrk * mm, PlossPV = Ipv * Ipv * Rpv * mm;
    const Pdc = Math.max(0, Pmm - PlossPV);
    const etaC = S.ctl.mode === 'pwm' ? 0.98 : S.ctl.eta;
    let Pctl = Pdc * etaC;
    // Carga: línea de distribución CA → inversor → cable de batería
    const hasInv = inv.id !== 'none', Vline = hasInv ? inv.Vac : bm.Vn;
    const Iac = Pload > 0 ? Pload / (Vline * S.load.pf) : 0;
    const PlossAC = Iac * Iac * Rac;
    const PinvOut = Pload + PlossAC;
    let PinvIn = Pload > 0 ? SYS.invInput(inv, PinvOut) : (hasInv && S.inv.alwaysOn ? SYS.invParams(inv).P0 : 0);
    const Vbn = Math.max(bm.Vn * 0.8, E), Idc = PinvIn / Vbn, PlossBat = Idc * Idc * Rbat;
    let Pdemand = PinvIn + PlossBat;
    let served = Pload, curtail = 0, note = '';
    let Pb = Pctl - Pdemand;                       // > 0 carga la batería
    if (soc >= socMax && Pb > 0) { curtail = Pb / etaC; Pctl -= Pb; Pb = 0; note = 'full'; }
    if (soc <= lvd && Pb < 0) { served = 0; Pdemand = 0; Pb = Pctl; note = 'lvd'; }
    const Ib = bm.iFromP(soc, -Pb);                // > 0 descarga
    const Vb = bm.vt(soc, Ib), PlossBatInt = Ib * Ib * bm.R;
    const socN = bm.step(soc, Ib, dt);
    return {
      soc: socN, Vprev: Vop || st.Vprev, Vop, Ipv, Pmpp, Ptrk, Pdc, Pctl, Pb, Ib, Vb, E,
      served, demand: Pload, curtail,
      loss: { track: Pmpp - Ptrk, mism: Ptrk - Pmm, pvwire: PlossPV, ctl: Pdc * (1 - etaC), inv: hasInv && Pdemand > 0 ? PinvIn - (served > 0 ? PinvOut : 0) : 0, batwire: Pdemand > 0 ? PlossBat : 0, ac: served > 0 ? PlossAC : 0, batint: PlossBatInt },
      note, Iac, Idc, Rpv, Rbat, Rac
    };
  }

  /* ---------- Condiciones meteorológicas en una hora ---------- */
  function weatherAt(S, tmy, doy, hLocal) {
    const loc = S.site, sp = SOLAR.position(loc, doy, hLocal);
    let irr, Ta, ws;
    if (S.site.src === 'tmy' && tmy) {
      const hr = (doy - 1) * 24 + hLocal;
      const w = SOLAR.tmyAt(tmy, hr);
      Ta = w.ta; ws = w.ws;
      const dni = sp.cz > 0.05 ? Math.max(0, (w.ghi - w.dhi) / sp.cz) : 0;
      irr = { ghi: w.ghi, dhi: Math.min(w.dhi, w.ghi), dni: Math.min(dni, 1200) };
    } else {
      const cs = SOLAR.clearSky(loc, sp), ghi = cs.ghi * S.site.kt;   // kt: índice de cielo claro (GHI/GHI despejado)
      irr = { ghi, ...SOLAR.erbs(ghi, sp.cz, doy) };
      Ta = (S.site.Tmin + S.site.Tmax) / 2 + (S.site.Tmax - S.site.Tmin) / 2 * Math.cos(2 * Math.PI * (hLocal - 15) / 24);
      ws = S.site.ws;
    }
    const p = SOLAR.poa(irr, sp, doy, S.site.tilt, S.site.az, S.site.albedo, S.loss.iam ? 0.05 : 0);
    const Geff = (p.eff ?? p.poa) * (1 - S.loss.soil / 100) * (1 - S.loss.degr / 100 * Math.max(0, S.loss.year - 1));
    const Tc = SOLAR.cellTemp(S.site.tmodel, Ta, p.poa, ws, S.modInfo.noct);
    return { sp, irr, poa: p, Geff, Ta, ws, Tc };
  }

  function curveFor(S, Geff, Tc, opt) {
    if (Geff < 2) return { cv: null, mt: PV.metrics(null) };
    const Gm = mapCells(S, g => Geff * g / 1000), Tm = mapCells(S, () => Tc);
    const cv = PV.arrayCurve(arrayCfg(S, Gm, Tm), opt);
    return { cv, mt: PV.metrics(cv) };
  }

  /* ---------- Simulación de un día ---------- */
  function simDay(S, tmy, doy, dtMin = 15) {
    const C = components(S), dt = dtMin / 60, steps = Math.round(24 / dt);
    const prof = SYS.LOADPROF[S.load.prof];
    let st = { soc: S.bat.soc0, Vprev: 0 };
    const out = { t: [], ppv: [], pmpp: [], load: [], dem: [], soc: [], vb: [], poa: [], tc: [], ta: [], ghi: [] };
    const E = newEnergy();
    for (let k = 0; k <= steps; k++) {
      const h = k * dt, w = weatherAt(S, tmy, doy, h);
      const { cv, mt } = curveFor(S, w.Geff, w.Tc, { NI: 110, NV: 200 });
      const dem = S.load.P * prof[Math.min(23, Math.floor(h))];
      const r = step(S, C, cv, mt, st, dem, dt, w.Ta);
      if (k < steps) { accum(E, r, w, dt); st = { soc: r.soc, Vprev: r.Vprev }; }
      out.t.push(h); out.ppv.push(r.Pctl); out.pmpp.push(r.Pmpp); out.load.push(r.served); out.dem.push(dem);
      out.soc.push(st.soc * 100); out.vb.push(r.Vb); out.poa.push(w.poa.poa); out.tc.push(w.Tc); out.ta.push(w.Ta); out.ghi.push(w.irr.ghi);
    }
    E.socEnd = st.soc; E.socMin = Math.min(...out.soc) / 100;
    return { series: out, E, C };
  }

  /* ---------- Simulación anual (horaria, asíncrona) ---------- */
  function simYear(S, tmy, onProgress) {
    return new Promise(resolve => {
      const C = components(S), prof = SYS.LOADPROF[S.load.prof];
      let st = { soc: S.bat.soc0, Vprev: 0 }, d = 1;
      const E = newEnergy(), monthly = Array.from({ length: 12 }, () => newEnergy());
      const mdays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
      let socMin = 1, dodAcc = 0, socDayMax = st.soc, socDayMin = st.soc, hoursLost = 0;
      const daily = { soc: [], epv: [] };
      const run = () => {
        const t0 = performance.now();
        while (d <= 365 && performance.now() - t0 < 40) {
          let mon = 0, acc = 0; while (d > acc + mdays[mon]) { acc += mdays[mon]; mon++; }
          let epvDay = 0;
          for (let h = 0; h < 24; h++) {
            const w = weatherAt(S, tmy, d, h + 0.5);
            const { cv, mt } = curveFor(S, w.Geff, w.Tc, { NI: 90, NV: 160 });
            const dem = S.load.P * prof[h];
            const r = step(S, C, cv, mt, st, dem, 1, w.Ta);
            accum(E, r, w, 1); accum(monthly[mon], r, w, 1);
            if (r.served < r.demand - 1e-6) hoursLost++;
            st = { soc: r.soc, Vprev: r.Vprev };
            socMin = Math.min(socMin, st.soc); socDayMax = Math.max(socDayMax, st.soc); socDayMin = Math.min(socDayMin, st.soc);
            epvDay += r.Pctl;
          }
          dodAcc += socDayMax - socDayMin; daily.soc.push(st.soc); daily.epv.push(epvDay / 1000);
          socDayMax = socDayMin = st.soc; d++;
        }
        onProgress && onProgress(Math.min(1, (d - 1) / 365));
        if (d <= 365) setTimeout(run, 0);
        else {
          E.socMin = socMin; E.socEnd = st.soc; E.hoursLost = hoursLost;
          const cyc = E.batOut / 1000 / Math.max(C.bm.Ecap, 1e-6);
          E.cycles = cyc; E.dodAvg = dodAcc / 365;
          E.batLife = SYS.batLife(C.bat, cyc, Math.max(E.dodAvg, 0.05));
          resolve({ E, monthly, daily, C });
        }
      };
      run();
    });
  }

  function newEnergy() {
    return { Hpoa: 0, Hghi: 0, Empp: 0, Etrk: 0, Edc: 0, Ectl: 0, Ecurt: 0, Edem: 0, Eserved: 0, batIn: 0, batOut: 0,
      L: { track: 0, mism: 0, pvwire: 0, ctl: 0, inv: 0, batwire: 0, ac: 0, batint: 0 } };
  }
  function accum(E, r, w, dt) {
    E.Hpoa += w.poa.poa * dt; E.Hghi += w.irr.ghi * dt;
    E.Empp += r.Pmpp * dt; E.Etrk += r.Ptrk * dt; E.Edc += r.Pdc * dt; E.Ectl += r.Pctl * dt; E.Ecurt += r.curtail * dt;
    E.Edem += r.demand * dt; E.Eserved += r.served * dt;
    if (r.Pb > 0) E.batIn += r.Pb * dt; else E.batOut += -r.Pb * dt;
    for (const k in E.L) E.L[k] += (r.loss[k] || 0) * dt;
  }

  G.SIM = { arrayCfg, mapCells, components, step, weatherAt, curveFor, simDay, simYear };
})(typeof window !== 'undefined' ? window : globalThis);
