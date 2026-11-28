/* © 2026 Claudia Figueroa, Dennis Johan López y M.Sc. Daniel Flores · Simulador de Sistemas Fotovoltaicos. Todos los derechos reservados. Prohibida su copia, modificación o redistribución sin autorización escrita. */
/* =====================================================================
   Modelo fotovoltaico
   - Celda: modelo de un diodo con resistencias serie y paralelo [Villalva 2009]
     y término de ruptura en polarización inversa [Bishop 1988].
   - Dependencia con G y T: I_ph (α_Isc), I_0 con V_oc(T) [Villalva 2009],
     R_sh ∝ 1/G [De Soto 2006].
   - Ajuste de R_s y R_sh a partir de la hoja técnica [Villalva 2009].
   - Diodo bypass Schottky exponencial y diodo de bloqueo.
   - Seguimiento MPPT: ideal (global), Perturbar y Observar, acople directo.
   ===================================================================== */
(function (G) {
  'use strict';
  const q = 1.602176634e-19, kB = 1.380649e-23, TREF = 298.15;
  const Vt = T => kB * T / q;

  /* ---------- Parámetros de celda (por celda, STC) ---------- */
  // c: {Isc, Voc, n, Rs, Rsh, Ki [A/K], Kv [V/K], bishop:{on,a,m,Vbr}}
  function cellAt(c, Gc, Tc) {
    const T = Tc + 273.15, dT = T - TREF, a = c.n * Vt(T);
    const g = Math.max(Gc, 0) / 1000;
    const Rsh = c.Rsh / Math.max(g, 0.01);                 // De Soto: R_sh = R_sh,ref·G_ref/G
    const IphRef = c.Isc * (c.Rsh + c.Rs) / c.Rsh;
    const Iph = Math.max(0, (IphRef + c.Ki * dT) * g);
    const I0 = (c.Isc + c.Ki * dT) / (Math.exp((c.Voc + c.Kv * dT) / a) - 1); // Villalva ec. (7)
    const b = c.bishop || {};
    return { Iph, I0, a, Rs: c.Rs, Rsh, bon: !!b.on, ba: b.a ?? 2e-3, bm: b.m ?? 3, Vbr: b.Vbr ?? -15 };
  }

  // Corriente en función del voltaje de diodo Vd (Bishop 1988, forma explícita)
  function iOfVd(p, Vd) {
    let ish = Vd / p.Rsh;
    if (p.bon && Vd < 0) ish *= 1 + p.ba * Math.pow(1 - Vd / p.Vbr, -p.bm);
    return p.Iph - p.I0 * (Math.exp(Vd / p.a) - 1) - ish;
  }
  function diOfVd(p, Vd) {
    const e = p.I0 / p.a * Math.exp(Vd / p.a);
    let d = 1 / p.Rsh;
    if (p.bon && Vd < 0) {
      const u = 1 - Vd / p.Vbr;
      d = (1 + p.ba * Math.pow(u, -p.bm)) / p.Rsh + Vd / p.Rsh * p.ba * p.bm * Math.pow(u, -p.bm - 1) / p.Vbr;
    }
    return -e - d;
  }
  // Voltaje de celda para una corriente I (resuelve Vd con Newton protegido por bisección)
  function cellV(p, I) {
    let lo, hi;
    hi = p.a * Math.log(Math.max(p.Iph - I, 0) / p.I0 + 1) + 0.05;
    if (iOfVd(p, hi) > I) hi += 1;
    if (p.bon) lo = p.Vbr * (1 - 1e-9);
    else lo = Math.min(-1, (p.Iph - I) * p.Rsh * 1.2 - 1);
    let x = p.Iph - I > 0 ? Math.min(hi, p.a * Math.log((p.Iph - I) / p.I0 + 1)) : Math.max(lo + 1e-6, (p.Iph - I) * p.Rsh);
    for (let k = 0; k < 60; k++) {
      const f = iOfVd(p, x) - I;
      if (Math.abs(f) < 1e-9) break;
      if (f > 0) lo = x; else hi = x;
      let xn = x - f / diOfVd(p, x);
      if (!(xn > lo && xn < hi)) xn = (lo + hi) / 2;
      if (Math.abs(xn - x) < 1e-10) { x = xn; break; }
      x = xn;
    }
    return x - I * p.Rs;
  }

  /* ---------- Diodos ---------- */
  // Bypass Schottky: V = n·Vt·ln(I/Is + 1)  (n≈1.1, Is≈2e-6 A → ≈0.45 V a 10 A, 25 °C)
  function bypassV(d, I, Tc) { return I <= 0 ? 0 : d.n * Vt(Tc + 273.15) * Math.log(I / d.Is + 1); }

  /* ---------- Ajuste a hoja técnica [Villalva 2009] ---------- */
  // m: {Isc, Voc, Imp, Vmp, Ns, aI, bV}; n: factor de idealidad
  function fitModule(m, n = 1.3) {
    const Ns = m.Ns, a = n * Ns * Vt(TREF), Pmax = m.Vmp * m.Imp;
    const solve = Rs => {
      // R_sh tal que el modelo pase exactamente por (Vmp, Imp)
      let Rsh = 1e3, Iph = m.Isc, I0 = m.Isc / (Math.exp(m.Voc / a) - 1);
      for (let k = 0; k < 30; k++) {
        const e = Math.exp((m.Vmp + m.Imp * Rs) / a);
        const den = m.Vmp * Iph - m.Vmp * I0 * e + m.Vmp * I0 - Pmax;
        const R = m.Vmp * (m.Vmp + m.Imp * Rs) / den;
        if (!(R > 0)) return null;
        Rsh = R; Iph = (Rsh + Rs) / Rsh * m.Isc;
        I0 = (Iph - m.Voc / Rsh) / (Math.exp(m.Voc / a) - 1);
      }
      const e = Math.exp((m.Vmp + m.Imp * Rs) / a), gd = I0 / a * e + 1 / Rsh;
      const dIdV = -gd / (1 + Rs * gd);
      return { Rs, Rsh, Iph, I0, g: m.Imp + m.Vmp * dIdV };  // g = dP/dV en Vmp
    };
    let lo = 0, hi = 0.05 * m.Voc / m.Isc, slo = solve(lo), shi = solve(hi);
    while (shi && shi.g > 0 && hi < m.Voc / m.Isc) { lo = hi; slo = shi; hi *= 1.5; shi = solve(hi); }
    let best = slo;
    for (let k = 0; k < 80; k++) {
      const mid = (lo + hi) / 2, s = solve(mid);
      if (!s) { hi = mid; continue; }
      best = s;
      if (s.g > 0) lo = mid; else hi = mid;
    }
    if (!best || !(best.Rsh > 0) || Math.abs(best.g) > 1e-3 * m.Imp) return null;
    return {
      n, Rs: best.Rs, Rsh: best.Rsh, Iph: best.Iph, I0: best.I0,
      cell: { Isc: m.Isc, Voc: m.Voc / Ns, n, Rs: best.Rs / Ns, Rsh: best.Rsh / Ns, Ki: m.aI, Kv: m.bV / Ns }
    };
  }

  // Selección automática de n: el más cercano a 1.3 con R_sh finito (Villalva: 1 ≤ a ≤ 1.5)
  function fitModuleAuto(m) {
    const cands = [];
    for (let n = 0.9; n <= 1.6001; n += 0.01) cands.push(+n.toFixed(2));
    cands.sort((a, b) => Math.abs(a - 1.3) - Math.abs(b - 1.3));
    for (const n of cands) { const f = fitModule(m, n); if (f && f.Rsh < 5e4 && f.Rs > 0) return f; }
    return fitModule(m, 1.3);
  }

  /* ---------- Curva del arreglo ---------- */
  // cfg: {cell, mod:{rows,cols,groups}, Ns, Np, Gc[s][m][c], Tc[s][m][c], bp[s][m][g], bypass:{n,Is}, block:{on,Vf}}
  const groupOf = (c, N, ng) => Math.floor(c * ng / N);

  function arrayCurve(cfg, opt = {}) {
    const NI = opt.NI || 180, NV = opt.NV || 300;
    const { rows, cols, groups } = cfg.mod, N = rows * cols, ng = groups;
    // parámetros únicos (G,T) → caché
    const cache = new Map(); let ipm = 0;
    const key = (g, t) => Math.round(g * 2) + '|' + Math.round(t * 10);
    const P = [];
    for (let s = 0; s < cfg.Np; s++) {
      P[s] = [];
      for (let m = 0; m < cfg.Ns; m++) {
        P[s][m] = [];
        for (let c = 0; c < N; c++) {
          const g = cfg.Gc[s][m][c], t = cfg.Tc[s][m][c], k = key(g, t);
          if (!cache.has(k)) { const p = cellAt(cfg.cell, g, t); cache.set(k, { p, V: null }); ipm = Math.max(ipm, p.Iph); }
          P[s][m][c] = k;
        }
      }
    }
    if (ipm < 1e-3) return null;
    const Imax = ipm * 1.04, Is = [];
    for (let k = 0; k < NI; k++) Is.push(Imax * k / (NI - 1));
    for (const v of cache.values()) v.V = Is.map(I => cellV(v.p, I));
    const Tm = opt.Tbp ?? 25;
    const Vbp = Is.map(I => bypassV(cfg.bypass, I, Tm));
    const strV = [];
    for (let s = 0; s < cfg.Np; s++) {
      const V = new Float64Array(NI);
      for (let m = 0; m < cfg.Ns; m++) {
        const gv = Array.from({ length: ng }, () => new Float64Array(NI));
        for (let c = 0; c < N; c++) { const cv = cache.get(P[s][m][c]).V, gg = gv[groupOf(c, N, ng)]; for (let j = 0; j < NI; j++) gg[j] += cv[j]; }
        for (let g = 0; g < ng; g++) {
          const on = cfg.bp[s][m][g];
          for (let j = 0; j < NI; j++) V[j] += on ? Math.max(gv[g][j], -Vbp[j]) : gv[g][j];
        }
      }
      if (cfg.block.on) for (let j = 0; j < NI; j++) V[j] -= bypassV(cfg.block, Is[j], Tm);
      strV.push(V);
    }
    const Vmax = Math.max(...strV.map(v => v[0]));
    if (!(Vmax > 0)) return null;
    const V = [], I = [], Pw = [], Istr = strV.map(() => []);
    for (let j = 0; j < NV; j++) {
      const v = Vmax * j / (NV - 1); let it = 0;
      for (let s = 0; s < cfg.Np; s++) { const i = interpIV(Is, strV[s], v); Istr[s].push(i); it += i; }
      V.push(v); I.push(it); Pw.push(v * it);
    }
    return { V, I, P: Pw, Istr, Is, strV, cache, keys: P };
  }
  function interpIV(Is, Vs, v) { // Vs decrece con I
    const n = Vs.length;
    if (v >= Vs[0]) return 0;
    if (v <= Vs[n - 1]) return Is[n - 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (Vs[mid] >= v) lo = mid; else hi = mid; }
    const dv = Vs[lo] - Vs[hi];
    return dv < 1e-12 ? Is[lo] : Is[lo] + (Is[hi] - Is[lo]) * (Vs[lo] - v) / dv;
  }
  const iAt = (cv, v) => {
    if (!cv) return 0; const { V, I } = cv, n = V.length;
    if (v <= 0) return I[0]; if (v >= V[n - 1]) return 0;
    const x = v / V[n - 1] * (n - 1), j = Math.floor(x);
    return I[j] + (I[j + 1] - I[j]) * (x - j);
  };

  function metrics(cv) {
    if (!cv) return { Isc: 0, Voc: 0, Pmp: 0, Vmp: 0, Imp: 0, FF: 0, peaks: [], k: 0 };
    const { V, I, P } = cv; let k = 0;
    for (let j = 1; j < P.length; j++) if (P[j] > P[k]) k = j;
    let Voc = V[V.length - 1];
    for (let j = 0; j < I.length; j++) if (I[j] <= 1e-6) { Voc = V[j]; break; }
    const peaks = [], w = 3;
    for (let j = 1; j < P.length - 1; j++) {
      if (P[j] < 0.03 * P[k]) continue;
      let ok = true;
      for (let d = 1; d <= w && ok; d++) { if (j - d >= 0 && P[j] < P[j - d]) ok = false; if (j + d < P.length && P[j] < P[j + d]) ok = false; }
      if (ok && (!peaks.length || j - peaks[peaks.length - 1] > w)) peaks.push(j);
    }
    return { Isc: I[0], Voc, Pmp: P[k], Vmp: V[k], Imp: I[k], FF: P[k] / (I[0] * Voc || 1), peaks, k };
  }

  /* ---------- MPPT Perturbar y Observar [Femia 2005; Esram 2007] ---------- */
  function perturbObserve(cv, V0, dV, steps = 60) {
    const Pof = v => v * iAt(cv, v), traj = [];
    let v = Math.max(dV, Math.min(V0, cv.V[cv.V.length - 1])), p = Pof(v), dir = 1;
    traj.push({ v, p });
    for (let k = 0; k < steps; k++) {
      const vn = Math.max(0, v + dir * dV), pn = Pof(vn);
      if (pn < p) dir = -dir;
      v = vn; p = pn; traj.push({ v, p });
    }
    const tail = traj.slice(-8);
    const vf = tail.reduce((s, x) => s + x.v, 0) / tail.length, pf = tail.reduce((s, x) => s + x.p, 0) / tail.length;
    return { traj, V: vf, P: pf };
  }
  // Escalado de colina continuo desde V0 hasta el máximo local (usado en simulación horaria)
  function localMax(cv, V0) {
    const { V, P } = cv, n = V.length;
    let j = Math.max(0, Math.min(n - 1, Math.round(V0 / V[n - 1] * (n - 1))));
    for (;;) {
      if (j + 1 < n && P[j + 1] > P[j]) j++;
      else if (j > 0 && P[j - 1] > P[j]) j--;
      else break;
    }
    return { V: V[j], P: P[j], I: cv.I[j] };
  }

  /* ---------- Estado de cada celda en un punto de operación ---------- */
  function cellStates(cfg, cv, Vop, Tbp = 25) {
    if (!cv) return [];
    const out = [], N = cfg.mod.rows * cfg.mod.cols, ng = cfg.mod.groups;
    for (let s = 0; s < cfg.Np; s++) {
      const Istr = interpIV(cv.Is, cv.strV[s], Vop);
      for (let m = 0; m < cfg.Ns; m++) {
        for (let g = 0; g < ng; g++) {
          const cells = [];
          for (let c = 0; c < N; c++) if (groupOf(c, N, ng) === g) cells.push(c);
          const ps = cells.map(c => cv.cache.get(cv.keys[s][m][c]).p);
          const sumV = I => ps.reduce((t, p) => t + cellV(p, I), 0);
          let Ic = Istr, Ib = 0, Vb = 0;
          if (cfg.bp[s][m][g]) {
            const Vd = bypassV(cfg.bypass, Istr, Tbp);
            if (sumV(Istr) < -Vd) {           // el diodo bypass conduce: la corriente se reparte
              let lo = 0, hi = Istr;
              for (let k = 0; k < 50; k++) { const mid = (lo + hi) / 2; if (sumV(mid) < -bypassV(cfg.bypass, Istr - mid, Tbp)) hi = mid; else lo = mid; }
              Ic = (lo + hi) / 2; Ib = Istr - Ic; Vb = bypassV(cfg.bypass, Ib, Tbp);
            }
          }
          cells.forEach((c, i) => { const V = cellV(ps[i], Ic); out.push({ s, m, c, g, I: Ic, V, P: V * Ic, Ib, Pbp: Vb * Ib }); });
        }
      }
    }
    return out;
  }

  G.PV = { cellAt, cellV, iOfVd, fitModule, fitModuleAuto, arrayCurve, interpIV, iAt, metrics, perturbObserve, localMax, cellStates, bypassV, Vt, TREF, groupOf };
})(typeof window !== 'undefined' ? window : globalThis);
