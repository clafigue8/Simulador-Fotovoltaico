/* © 2026 Claudia Figueroa, Dennis Johan López y M.Sc. Daniel Flores · Simulador de Sistemas Fotovoltaicos. Todos los derechos reservados. Prohibida su copia, modificación o redistribución sin autorización escrita. */
/* =====================================================================
   Balance del sistema (BOS)
   - Batería: modelo de Shepherd modificado [Tremblay et al. 2007],
     ley de Peukert, eficiencia coulómbica y vida en ciclos.
   - Controlador de carga: MPPT (ideal o P&O) o acople directo (PWM),
     corte por batería llena y desconexión por bajo voltaje (LVD).
   - Inversor: pérdidas en vacío + pérdidas resistivas (curva de eficiencia).
   - Conductores: resistencia con temperatura, caída de tensión, pérdidas y ampacidad.
   ===================================================================== */
(function (G) {
  'use strict';

  /* ---------- Catálogo de baterías (valores típicos por tecnología) ---------- */
  // Vfull/Vexp/Vnom/Vcut por bloque; S: pendiente lineal del OCV con la descarga [V por bloque]; Qexp y Qnom como fracción de C; Rint por bloque [Ω]
  const BATTERIES = [
    { id: 'fla6', tech: 'FLA', name: { es: 'Plomo-ácido inundada (ciclo profundo) 6 V · 225 Ah', en: 'Flooded lead-acid (deep cycle) 6 V · 225 Ah' }, V: 6, C: 225, Rint: 0.003, Vfull: 6.40, Vexp: 6.37, Qexp: 0.05, S: 0.40, Vnom: 5.95, Qnom: 0.85, Vcut: 5.25, k: 1.25, eta: 0.85, dod: 0.5, cyc: 1200, cycDod: 0.5, life: 7, mass: 28, maint: true },
    { id: 'agm12', tech: 'AGM', name: { es: 'AGM (VRLA) 12 V · 100 Ah', en: 'AGM (VRLA) 12 V · 100 Ah' }, V: 12, C: 100, Rint: 0.006, Vfull: 12.8, Vexp: 12.75, Qexp: 0.05, S: 0.80, Vnom: 11.9, Qnom: 0.85, Vcut: 10.5, k: 1.15, eta: 0.90, dod: 0.5, cyc: 600, cycDod: 0.5, life: 5, mass: 30 },
    { id: 'gel12', tech: 'GEL', name: { es: 'Gel (VRLA) 12 V · 200 Ah', en: 'Gel (VRLA) 12 V · 200 Ah' }, V: 12, C: 200, Rint: 0.005, Vfull: 12.8, Vexp: 12.75, Qexp: 0.05, S: 0.80, Vnom: 11.9, Qnom: 0.85, Vcut: 10.5, k: 1.12, eta: 0.88, dod: 0.5, cyc: 1000, cycDod: 0.5, life: 8, mass: 62 },
    // Batería del banco de trabajo de la UNAH (ficha Victron GEL 12 V 165 Ah, BAT412151104): 750 ciclos al 50 % de descarga.
    { id: 'vgel165', tech: 'GEL', name: { es: 'Victron GEL 12 V · 165 Ah (banco UNAH)', en: 'Victron GEL 12 V · 165 Ah (UNAH bench)' }, V: 12, C: 165, Rint: 0.0055, Vfull: 12.8, Vexp: 12.75, Qexp: 0.05, S: 0.80, Vnom: 11.9, Qnom: 0.85, Vcut: 10.5, k: 1.12, eta: 0.88, dod: 0.5, cyc: 750, cycDod: 0.5, life: 7, mass: 55 },
    { id: 'lfp12', tech: 'LFP', name: { es: 'Litio LiFePO₄ 12,8 V · 100 Ah', en: 'Lithium LiFePO₄ 12.8 V · 100 Ah' }, V: 12.8, C: 100, Rint: 0.015, Vfull: 13.6, Vexp: 13.35, Qexp: 0.05, S: 0.30, Vnom: 12.8, Qnom: 0.9, Vcut: 10.0, k: 1.03, eta: 0.98, dod: 0.9, cyc: 4000, cycDod: 0.8, life: 12, mass: 11 },
    { id: 'lfp24', tech: 'LFP', name: { es: 'Litio LiFePO₄ 25,6 V · 100 Ah', en: 'Lithium LiFePO₄ 25.6 V · 100 Ah' }, V: 25.6, C: 100, Rint: 0.03, Vfull: 27.2, Vexp: 26.7, Qexp: 0.05, S: 0.60, Vnom: 25.6, Qnom: 0.9, Vcut: 20.0, k: 1.03, eta: 0.98, dod: 0.9, cyc: 4000, cycDod: 0.8, life: 12, mass: 22 },
    { id: 'lfp48', tech: 'LFP', name: { es: 'Litio LiFePO₄ 51,2 V · 100 Ah (rack)', en: 'Lithium LiFePO₄ 51.2 V · 100 Ah (rack)' }, V: 51.2, C: 100, Rint: 0.05, Vfull: 54.4, Vexp: 53.4, Qexp: 0.05, S: 1.20, Vnom: 51.2, Qnom: 0.9, Vcut: 44.0, k: 1.03, eta: 0.98, dod: 0.9, cyc: 6000, cycDod: 0.8, life: 15, mass: 45 }
  ];

  /* ---------- Catálogo de inversores (aislados, onda senoidal pura) ---------- */
  const INVERTERS = [
    // Inversor del banco de trabajo de la UNAH: Ampeak 750 W (IVUFB0750), onda senoidal modificada, η ≈ 88 %.
    { id: 'amp750', name: { es: 'Ampeak 750 W · 12 V CC · 110 V CA (banco UNAH)', en: 'Ampeak 750 W · 12 V DC · 110 V AC (UNAH bench)' }, P: 750, Vdc: 12, Vac: 110, eta: 0.88 },
    { id: 'inv1k12', name: { es: '1 000 W · 12 V CC · 120 V CA', en: '1,000 W · 12 V DC · 120 V AC' }, P: 1000, Vdc: 12, Vac: 120, eta: 0.90 },
    { id: 'inv2k24', name: { es: '2 000 W · 24 V CC · 120 V CA', en: '2,000 W · 24 V DC · 120 V AC' }, P: 2000, Vdc: 24, Vac: 120, eta: 0.92 },
    { id: 'inv3k24', name: { es: '3 000 W · 24 V CC · 120/240 V CA', en: '3,000 W · 24 V DC · 120/240 V AC' }, P: 3000, Vdc: 24, Vac: 240, eta: 0.93 },
    { id: 'inv5k48', name: { es: '5 000 W · 48 V CC · 120/240 V CA (inversor-cargador)', en: '5,000 W · 48 V DC · 120/240 V AC (inverter-charger)' }, P: 5000, Vdc: 48, Vac: 240, eta: 0.94 },
    { id: 'none', name: { es: 'Sin inversor (carga en CC)', en: 'No inverter (DC load)' }, P: 1e9, Vdc: 0, Vac: 0, eta: 1 }
  ];
  // Pérdidas: P_in = P_out + P0 + k·P_out²/Pn, con eficiencia máxima a 25 % de carga
  function invParams(inv) {
    if (inv.id === 'none') return { P0: 0, k: 0 };
    const Ps = 0.25 * inv.P, P0 = Ps * (1 / inv.eta - 1) / 2;
    return { P0, k: P0 * inv.P / (Ps * Ps) };
  }
  function invInput(inv, Pout) {
    if (inv.id === 'none' || Pout <= 0) return inv.id === 'none' ? Pout : invParams(inv).P0;
    const { P0, k } = invParams(inv);
    return Pout + P0 + k * Pout * Pout / inv.P;
  }

  /* ---------- Conductores (cobre/aluminio) ---------- */
  // AWG: sección [mm²] y ampacidad [A] (NEC 310.16, columna 75 °C, cobre)
  const AWG = [
    { g: '14', A: 2.08, amp: 20 }, { g: '12', A: 3.31, amp: 25 }, { g: '10', A: 5.26, amp: 35 },
    { g: '8', A: 8.37, amp: 50 }, { g: '6', A: 13.3, amp: 65 }, { g: '4', A: 21.2, amp: 85 },
    { g: '2', A: 33.6, amp: 115 }, { g: '1/0', A: 53.5, amp: 150 }, { g: '2/0', A: 67.4, amp: 175 },
    { g: '4/0', A: 107, amp: 230 }
  ];
  const RHO = { cu: 0.017241, al: 0.028264 }, ALPHA = { cu: 0.00393, al: 0.00403 };
  // Resistencia de ida y vuelta [Ω]
  function wireR(w, Tc = 50) {
    const a = AWG.find(x => x.g === w.awg) || AWG[0], mat = w.mat || 'cu';
    return 2 * RHO[mat] * (1 + ALPHA[mat] * (Tc - 20)) * w.len / a.A;
  }
  function wireAmp(w) { const a = AWG.find(x => x.g === w.awg) || AWG[0]; return a.amp * (w.mat === 'al' ? 0.78 : 1); }
  function wireCheck(w, I, V, Tc) {
    const R = wireR(w, Tc), dv = I * R;
    return { R, dV: dv, dVpct: V > 0 ? dv / V * 100 : 0, Ploss: I * I * R, amp: wireAmp(w), over: I > wireAmp(w) };
  }
  // Calibre mínimo para una caída ≤ maxPct y ampacidad ≥ 1.25·I
  function wireSuggest(w, I, V, maxPct, Tc) {
    for (const a of AWG) { const t = { ...w, awg: a.g }, c = wireCheck(t, I, V, Tc); if (c.dVpct <= maxPct && c.amp >= 1.25 * I) return a.g; }
    return AWG[AWG.length - 1].g;
  }

  /* ---------- Batería: Shepherd modificado (Tremblay 2007) ---------- */
  function batModel(b, ns, np) {
    const Q = b.C * np, scale = ns;
    const Vfull = b.Vfull * scale, Vexp = b.Vexp * scale, Vnom = b.Vnom * scale, Qexp = b.Qexp * Q, Qnom = b.Qnom * Q;
    const S = (b.S || 0) * scale, qn = Qnom / Q;
    const A = Vfull - Vexp, B = 3 / Qexp, E0 = Vfull - A;
    const K = Math.max(1e-6, (E0 - S * qn + A * Math.exp(-B * Qnom) - Vnom) * (Q - Qnom) / (Q * Qnom));
    const R = b.Rint * ns / np;
    return {
      Q, R, E0, K, A, B, ns, np, b,
      Vn: b.V * ns, Ecap: b.V * ns * Q / 1000, Ecap_use: b.V * ns * Q * b.dod / 1000,
      Vcut: b.Vcut * ns,
      // OCV en función del SOC
      ocv(soc) { const it = Math.min(0.999, Math.max(0, 1 - soc)) * Q; return E0 - S * it / Q - K * Q / (Q - it) * it + A * Math.exp(-B * it); },
      // Tensión en bornes; I > 0 descarga, I < 0 carga
      vt(soc, I) { return this.ocv(soc) - R * I; },
      // Corriente para una potencia en bornes P (>0 descarga)
      iFromP(soc, P) { const E = this.ocv(soc), d = E * E - 4 * R * P; return d <= 0 ? E / (2 * R) : (E - Math.sqrt(d)) / (2 * R); },
      // Evolución del SOC en dt [h]
      step(soc, I, dt) {
        const Irated = b.C * np / 20;
        let dQ;
        if (I > 0) dQ = -I * dt * Math.pow(Math.max(I / Irated, 1), b.k - 1);     // Peukert
        else dQ = -I * dt * b.eta;                                                // eficiencia coulómbica
        return Math.min(1, Math.max(0, soc + dQ / Q));
      }
    };
  }
  // Vida estimada: ciclos a la DoD media (ley de potencia, exponente 1.3) y vida calendario
  function batLife(b, cyclesYear, dodAvg) {
    if (cyclesYear <= 0) return b.life;
    const Ncyc = b.cyc * Math.pow(b.cycDod / Math.max(dodAvg, 0.05), 1.3);
    return Math.min(b.life, Ncyc / cyclesYear);
  }

  const LOADPROF = {
    res: [.3, .25, .25, .25, .3, .5, .8, .7, .5, .4, .4, .5, .6, .5, .4, .4, .5, .8, 1, 1, .9, .7, .5, .4],
    com: [.15, .15, .15, .15, .15, .2, .4, .8, 1, 1, 1, .9, .8, 1, 1, 1, .9, .6, .3, .2, .15, .15, .15, .15],
    flat: Array(24).fill(1)
  };

  G.SYS = { BATTERIES, INVERTERS, invParams, invInput, AWG, wireR, wireAmp, wireCheck, wireSuggest, batModel, batLife, LOADPROF };
})(typeof window !== 'undefined' ? window : globalThis);
