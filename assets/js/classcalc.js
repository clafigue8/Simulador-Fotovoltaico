/* =====================================================================
   Métodos de clase: dimensionamiento por sustitución (conectado a red),
   verificación con la ley y la simulación, y sistema aislado (banco de trabajo).
   Reproduce paso a paso los cálculos a mano de los cursos de la UNAH.
   ===================================================================== */
(function () {
  'use strict';
  const EXT = window.PAGES_EXT = window.PAGES_EXT || {};
  const A = () => window.APP, L = (es, en) => A().L(es, en), fx = (x, d) => A().fx(x, d), esc = s => A().esc(s);
  const $ = id => document.getElementById(id);
  const STD = [2, 6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400];   // calibres comerciales de interruptores y fusibles (A)
  const stdUp = I => STD.find(x => x >= I - 1e-9) || Math.ceil(I);
  // Capacidad de corriente aproximada de conductores de cobre (A) por sección (mm²), 75 °C
  const CABLES = [[2.5, 20, '14 AWG'], [4, 30, '12 AWG'], [6, 40, '10 AWG'], [10, 55, '8 AWG'], [16, 70, '6 AWG'], [25, 95, '4 AWG'], [35, 120, '2 AWG'], [50, 150, '1/0 AWG'], [70, 190, '2/0 AWG']];
  const cableFor = (I, min = 2.5) => CABLES.find(c => c[0] >= min && c[1] >= I) || CABLES[CABLES.length - 1];
  const modIdx = start => window.MODULES.findIndex(m => m.name.startsWith(start));
  const invIdx = start => window.INVERTERS_GRID.findIndex(v => v.name.startsWith(start));

  /* ---------- Estado ---------- */
  const PRESETS = {
    examA: {
      es: 'Examen IE932 · Escenario A (sustitución)', en: 'Exam IE932 · Scenario A (substitution)',
      g: { kwh: 442, days: 30, sub: 85, Hm: 102.1, dm: 31, PR: 0.85, mod: 'JA Solar JAM72S30-550', Pman: 550, invF: 0.8, inv: 'Livoltek HP1-5KS2', bVoc: 0.25, gVmp: 0.35, Tmin: 8, Tmax: 70, Hy: 1791, Ey: 5304 }
    },
    examB: {
      es: 'Examen IE932 · Escenario B (ley y simulación)', en: 'Exam IE932 · Scenario B (law and simulation)',
      g: { kwh: 442, days: 30, sub: 85, Hm: 102.1, dm: 31, PR: 0.85, mod: 'JA Solar JAM72S30-550', Pman: 550, invF: 0.8, inv: 'Livoltek HP1-3KS2', bVoc: 0.275, gVmp: 0.35, Tmin: 8, Tmax: 70, Hy: 1791, Ey: 5304 },
      b: { Y: 1320, Ey: 5304, lim: 100, degr: 0.55, goal: 85, e1: 4.40, e2: 5.73, block: 50, fixed: 0, self: 40, exc: 2.5005 }
    },
    ex720: {
      es: 'Ejercicio · panel de 720 W', en: 'Exercise · 720 W panel',
      g: { kwh: 442, days: 30, sub: 85, Hm: 155, dm: 30, PR: 0.85, mod: 'PolyCrown NS-720MH-132', Pman: 720, invF: 1.0, inv: 'Growatt MIN 3000TL-X', Pinv: 3000, bVoc: 0.25, gVmp: 0.35, Tmin: 8, Tmax: 70, Hy: 1791, Ey: 5304 }
    }
  };
  const CL = {
    tab: 'grid',
    g: { ...PRESETS.examA.g, Pinv: 3000 },
    b: { Y: 1320, Ey: 5304, lim: 100, degr: 0.55, goal: 85, e1: 4.40, e2: 5.73, block: 50, fixed: 0, self: 40, exc: 2.5005 },
    o: { mod: 'Mundo Solar 350', Pman: 350, Vmp: 39.6, Imp: 8.84, Voc: 47.52, Isc: 9.55, bVoc: 0.30, ns: 1, np: 1, Tmin: 10,
      cVoc: 100, cI: 50, cP: 700, cIsc: 60, cEta: 0.97, Vch: 13.8,
      Vb: 12, Ah: 165, dod: 50, cmax: 0.2, iP: 750, iVdc: 12, iEta: 0.88, iVac: 110, iPk: 1500, HSP: 5, f: 0.8, fDC: 10, mon: 2.8, Pload: 100 }
  };

  /* ---------- Panel e inversor elegidos ---------- */
  function panelG() {
    const g = CL.g, i = g.mod === 'manual' ? -1 : modIdx(g.mod), m = i >= 0 ? window.MODULES[i] : null;
    return m ? { name: m.name, P: m.Pstc, Vmp: m.Vmp, Imp: m.Imp, Voc: m.Voc, Isc: m.Isc } : { name: L('Panel manual', 'Manual panel'), P: g.Pman, Vmp: null, Imp: null, Voc: null, Isc: null };
  }
  function invG() {
    const g = CL.g, i = g.inv === 'manual' ? -1 : invIdx(g.inv), v = i >= 0 ? window.INVERTERS_GRID[i] : null;
    return v ? { name: v.name, P: v.Paco, Vstart: v.Vstart ?? v.Vmin, Vmin: v.Vmin, Vmax: v.Vmax, Vdcmax: v.Vdcmax, Imp: v.Idcmax, Isc: v.Iscmax ?? null, Vac: v.Vac }
      : { name: L('Inversor manual', 'Manual inverter'), P: g.Pinv, Vstart: null, Vmin: null, Vmax: null, Vdcmax: null, Imp: null, Isc: null, Vac: 240 };
  }

  // verificaciones del string (todos los paneles en serie en un MPPT)
  function chkString(N, pm, iv) {
    const g = CL.g;
    const chk = [];
    if (pm.Vmp && iv.Vdcmax) {
      const Vmp = N * pm.Vmp, VocC = pm.Voc * (1 + g.bVoc / 100 * (25 - g.Tmin)) * N;
      const VmpH = pm.Vmp * (1 - g.gVmp / 100 * (g.Tmax - 25)) * N, VmpC = pm.Vmp * (1 + g.gVmp / 100 * (25 - g.Tmin)) * N;
      chk.push([L('Tensión de arranque', 'Start-up voltage'), `${N} × ${fx(pm.Vmp, 2)} V = ${fx(Vmp, 1)} V`, `> ${fx(iv.Vstart, 0)} V`, Vmp > iv.Vstart]);
      chk.push([L('Rango de MPPT', 'MPPT range'), `${fx(Vmp, 1)} V`, `${fx(iv.Vmin, 0)}–${fx(iv.Vmax, 0)} V`, Vmp >= iv.Vmin && Vmp <= iv.Vmax]);
      chk.push([L(`Vmp con celda a ${g.Tmax} °C`, `Vmp with cell at ${g.Tmax} °C`), `${fx(pm.Vmp, 2)} × [1 − ${fx(g.gVmp / 100, 4)} × ${g.Tmax - 25}] × ${N} = ${fx(VmpH, 1)} V`, `≥ ${fx(iv.Vstart, 0)} V`, VmpH >= iv.Vstart]);
      chk.push([L(`Vmp con celda a ${g.Tmin} °C`, `Vmp with cell at ${g.Tmin} °C`), `${fx(pm.Vmp, 2)} × [1 + ${fx(g.gVmp / 100, 4)} × ${25 - g.Tmin}] × ${N} = ${fx(VmpC, 1)} V`, `≤ ${fx(iv.Vmax, 0)} V`, VmpC <= iv.Vmax]);
      chk.push([L(`Voc a ${g.Tmin} °C`, `Voc at ${g.Tmin} °C`), `${fx(pm.Voc, 2)} × [1 + ${fx(g.bVoc / 100, 5)} × ${25 - g.Tmin}] × ${N} = ${fx(VocC, 1)} V`, `< ${fx(iv.Vdcmax, 0)} V`, VocC < iv.Vdcmax]);
      if (iv.Imp) chk.push([L('Corrientes', 'Currents'), `Imp ${fx(pm.Imp, 2)} A · Isc × 1.25 = ${fx(pm.Isc * 1.25, 1)} A`, `${fx(iv.Imp, iv.Imp % 1 ? 1 : 0)} A · ${iv.Isc ? fx(iv.Isc, iv.Isc % 1 ? 1 : 0) + ' A' : '—'}`, pm.Imp <= iv.Imp && (!iv.Isc || pm.Isc * 1.25 <= iv.Isc)]);
      if (iv.Isc) chk.push([L('¿Dos strings en paralelo en un MPPT?', 'Two strings in parallel on one MPPT?'), `2 × ${fx(pm.Isc, 2)} A = ${fx(2 * pm.Isc, 1)} A`, `${fx(iv.Isc, iv.Isc % 1 ? 1 : 0)} A`, 2 * pm.Isc <= iv.Isc ? true : 'one']);
    }
    return chk;
  }

  /* ---------- Cálculos: método por sustitución ---------- */
  function calcSub() {
    const g = CL.g, pm = panelG(), iv = invG();
    const Ed = g.kwh / g.days, Eobj = Ed * g.sub / 100, HSP = g.Hm / g.dm;
    const Pp = Eobj / (HSP * g.PR), N = Math.ceil(Pp * 1000 / pm.P - 1e-9), kWp = N * pm.P / 1000;
    const Echk = kWp * HSP * g.PR, subReal = Echk / Ed * 100;
    const Pinv = g.invF * kWp;
    // inversores de la lista con potencia suficiente, el más pequeño primero
    const sugg = window.INVERTERS_GRID.filter(v => v.seg === 'res' && v.type !== 'micro' && v.Paco / 1000 >= Pinv - 1e-9).sort((a, b) => a.Paco - b.Paco)[0];
    const dcac = kWp / (iv.P / 1000);
    const chk = chkString(N, pm, iv);
    // estimación anual con el mismo PR fijo
    const EyPR = kWp * g.Hy * g.PR, pctY = EyPR / g.Ey * 100;
    return { pm, iv, Ed, Eobj, HSP, Pp, N, kWp, Echk, subReal, Pinv, sugg, dcac, chk, EyPR, pctY };
  }

  /* ---------- Cálculos: ley, simulación y vida útil ---------- */
  function calcLaw(Nsub) {
    const b = CL.b, g = CL.g, pm = panelG(), Pm = pm.P / 1000;
    const lim = b.Ey * b.lim / 100, kWpMax = lim / b.Y, Nmax = kWpMax / Pm;
    const nlaw = (Nmax % 1 === 0) ? Nmax - 1 : Math.floor(Nmax);   // estrictamente menor que el límite
    const rows = [nlaw - 1, nlaw, nlaw + 1].filter(n => n >= 1).map(n => {
      const E = n * Pm * b.Y, pct = E / b.Ey * 100;
      return { n, kWp: n * Pm, E, pct, law: E < lim, goal: pct >= b.goal };
    });
    const ch = rows.find(r => r.n === nlaw) || rows[0];
    const d = b.degr / 100, f = y => ch.pct * Math.pow(1 - d, y);
    const yearsGoal = d > 0 && ch.pct > b.goal ? Math.floor(Math.log(b.goal / ch.pct) / Math.log(1 - d)) : (ch.pct >= b.goal ? Infinity : 0);
    const life = [[1, ch.pct], [10, f(10)], [20, f(20)], [25, f(25)]];
    // factura: autoconsumo directo supuesto y excedentes a la tarifa de compra
    const mo = g.kwh, bill = E => b.fixed + Math.min(E, b.block) * b.e1 + Math.max(0, E - b.block) * b.e2;
    const selfY = ch.E * b.self / 100, expY = ch.E - selfY;
    const b0 = bill(mo), b1 = bill(Math.max(0, mo - selfY / 12));
    const saveSelf = (b0 - b1) * 12, credit = expY * b.exc, save = saveSelf + credit;
    const subWorst = NsubMonth(ch.kWp);
    const chkB = chkString(ch.n, pm, invG());
    return { chkB, dcacB: ch.kWp / (invG().P / 1000), lim, kWpMax, Nmax, nlaw, rows, ch, yearsGoal, life, selfY, expY, b0, saveSelf, credit, save, after: b0 - save / 12, margin: lim - ch.E, subWorst, PRreal: b.Y / g.Hy };
  }
  // sustitución en el mes de diseño con la producción simulada (PR real = Y / H anual)
  function NsubMonth(kWp) { const g = CL.g, b = CL.b, PRr = b.Y / g.Hy; return kWp * g.Hm * PRr / g.kwh * 100; }

  /* ---------- Cálculos: sistema aislado ---------- */
  function calcOff() {
    const o = CL.o, i = o.mod === 'manual' ? -1 : modIdx(o.mod), m = i >= 0 ? window.MODULES[i] : null;
    const pv = m ? { name: m.name, P: m.Pstc, Vmp: m.Vmp, Imp: m.Imp, Voc: m.Voc, Isc: m.Isc } : { name: L('Panel manual', 'Manual panel'), P: o.Pman, Vmp: o.Vmp, Imp: o.Imp, Voc: o.Voc, Isc: o.Isc };
    const Pfv = pv.P * o.ns * o.np, Isc = pv.Isc * o.np, Voc = pv.Voc * o.ns;
    const Ich = Pfv * o.cEta / o.Vch, Crate = Ich / o.Ah;
    const VocC = Voc * (1 + o.bVoc / 100 * (25 - o.Tmin));
    const Efv = Pfv * o.HSP * o.f, Ebat = o.Vb * o.Ah, Eu = Ebat * o.dod / 100;
    const IinvDC = o.iP / (o.iVdc * o.iEta), Iac = o.iP / o.iVac;
    const prot = [
      ['Q1', L('Entrada FV', 'PV input'), '1.25 × Isc', `1.25 × ${fx(Isc, 2)} = ${fx(1.25 * Isc, 1)} A`, `${stdUp(1.25 * Isc)} A · 2P · ≥ ${Math.ceil(VocC / 50) * 50 >= 100 ? Math.ceil(VocC / 50) * 50 : 100} V`],
      ['SPD1', L('Entrada FV', 'PV input'), 'Ucpv ≥ 1.2 × Voc', `1.2 × ${fx(Voc, 2)} = ${fx(1.2 * Voc, 0)} V`, L('Tipo 2 CD', 'Type 2 DC')],
      ['Q2', L('Salida MPPT', 'MPPT output'), L('1.25 × I máx MPPT', '1.25 × max MPPT current'), `1.25 × ${fx(o.cI, 0)} = ${fx(1.25 * o.cI, 1)} A`, `${stdUp(1.25 * o.cI)} A · 2P`],
      ['F1', L('Línea inversor', 'Inverter line'), L('1.25 × I CD inversor', '1.25 × inverter DC current'), `1.25 × ${fx(IinvDC, 1)} = ${fx(1.25 * IinvDC, 1)} A`, `${stdUp(1.25 * IinvDC)} A`],
      ['Q3', L('Batería', 'Battery'), L('1.25 × (inversor + cargas CD)', '1.25 × (inverter + DC loads)'), `1.25 × (${fx(IinvDC, 0)} + ${fx(o.fDC, 0)}) = ${fx(1.25 * (IinvDC + o.fDC), 0)} A`, `${stdUp(1.25 * (IinvDC + o.fDC))} A`],
      ['F2', L('Cargas CD', 'DC loads'), L('Carga 12 V del banco', 'Bench 12 V load'), '—', `${fx(o.fDC, 0)} A`],
      ['F4', L('Monitoreo', 'Monitoring'), `${fx(o.mon, 1)} W`, `≈ ${fx(o.mon / o.Vb, 2)} A`, `${stdUp(Math.max(1.5, o.mon / o.Vb * 4))} A`],
      ['Q4', L('Salida CA', 'AC output'), '1.25 × I CA', `1.25 × ${fx(Iac, 1)} = ${fx(1.25 * Iac, 1)} A`, `${stdUp(1.25 * Iac)} A`]
    ];
    const cab = [
      [L('Módulo → caja → MPPT', 'Module → box → MPPT'), Isc, cableFor(Isc * 1.56, 4), L('Cable solar MC4; mínimo 4 mm² por caída de tensión', 'MC4 solar cable; 4 mm² minimum for voltage drop')],
      [L('MPPT → barras CD', 'MPPT → DC busbars'), o.cI, cableFor(o.cI * 1.0), L('Capacidad máxima de salida del MPPT', 'Maximum MPPT output')],
      [L('Batería ↔ barras ↔ inversor', 'Battery ↔ busbars ↔ inverter'), IinvDC + o.fDC, cableFor(IinvDC + o.fDC), L('Tramo crítico: corriente del inversor', 'Critical run: inverter current')],
      [L('Panel CA → cargas', 'AC panel → loads'), Iac, cableFor(Iac), L(`Protegido por Q4 de ${stdUp(1.25 * Iac)} A`, `Protected by ${stdUp(1.25 * Iac)} A Q4`)]
    ];
    const chk = [
      [L('Corriente de carga', 'Charge current'), `${fx(Pfv, 0)} W × ${fx(o.cEta, 2)} ÷ ${fx(o.Vch, 1)} V = ${fx(Ich, 1)} A`, `≤ ${fx(o.cI, 0)} A`, Ich <= o.cI],
      [L('Tasa de carga', 'Charge rate'), `${fx(Ich, 1)} A ÷ ${fx(o.Ah, 0)} Ah = ${fx(Crate, 2)} C`, `≤ ${fx(o.cmax, 2)} C`, Crate <= o.cmax],
      [L(`Voc a ${o.Tmin} °C`, `Voc at ${o.Tmin} °C`), `${fx(Voc, 2)} × [1 + ${fx(o.bVoc / 100, 4)} × ${25 - o.Tmin}] = ${fx(VocC, 1)} V`, `< ${fx(o.cVoc, 0)} V`, VocC < o.cVoc],
      [L('Corriente de cortocircuito FV', 'PV short-circuit current'), `${fx(Isc, 2)} A`, `≤ ${fx(o.cIsc, 0)} A`, Isc <= o.cIsc],
      [L('Potencia FV', 'PV power'), `${fx(Pfv, 0)} W`, `≤ ${fx(o.cP, 0)} W @ ${fx(o.Vb, 0)} V`, Pfv <= o.cP],
      [L('Energía diaria frente a la útil de la batería', 'Daily energy vs usable battery energy'), `${fx(Pfv, 0)} × ${fx(o.HSP, 1)} × ${fx(o.f, 2)} = ${fx(Efv, 0)} Wh`, `≥ ${fx(Eu, 0)} Wh`, Efv >= Eu]
    ];
    // comparación de opciones de panel
    const opts = [];
    const add = (lab, P, Iscx, Vocx) => { const I = P * o.cEta / o.Vch, c = I / o.Ah, vc = Vocx * (1 + o.bVoc / 100 * (25 - o.Tmin)); opts.push([lab, P, Iscx, I, c, P * o.HSP * o.f / 1000, I <= o.cI && c <= o.cmax && vc < o.cVoc * 0.95 && Iscx <= o.cIsc, c > o.cmax ? L(`Supera ${o.cmax} C`, `Exceeds ${o.cmax} C`) : vc >= o.cVoc * 0.95 ? L(`Voc ≈ ${fx(vc, 0)} V, sin margen`, `Voc ≈ ${fx(vc, 0)} V, no margin`) : I > o.cI ? L('Supera el MPPT', 'Exceeds the MPPT') : '']); };
    add(`1 × ${pv.name.split(' (')[0]}`, pv.P, pv.Isc, pv.Voc);
    add(`2 × ${pv.name.split(' (')[0]} (${L('paralelo', 'parallel')})`, 2 * pv.P, 2 * pv.Isc, pv.Voc);
    add(`2 × ${pv.name.split(' (')[0]} (${L('serie', 'series')})`, 2 * pv.P, pv.Isc, 2 * pv.Voc);
    window.MODULES.filter(x => x.placa && x.name !== pv.name).forEach(x => add(`1 × ${x.name.split(' (')[0]}`, x.Pstc, x.Isc, x.Voc));
    return { pv, Pfv, Isc, Voc, Ich, Crate, VocC, Efv, Ebat, Eu, IinvDC, Iac, prot, cab, chk, opts, auto: Eu / Math.max(1, o.Pload) };
  }

  /* ---------- Interfaz ---------- */
  const fld = (sec, k, label, step = 'any', help = '') => `<div class="field"><label>${label}${help ? `<small>${help}</small>` : ''}</label><input type="number" step="${step}" data-c="${sec}.${k}" value="${CL[sec][k]}"></div>`;
  const ok = b => b === 'one' ? `<span class="badge warn">${L('Un solo string por MPPT', 'One string per MPPT')}</span>` : b ? `<span class="badge ok">${L('Cumple', 'OK')}</span>` : `<span class="badge bad">${L('No cumple', 'Fails')}</span>`;
  const table = (head, rows) => `<div class="tscroll"><table class="t"><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map((c, i) => `<td${i === 0 ? ' style="text-align:left"' : ''}>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  const modOpts = (cur, withManual = true) => (withManual ? `<option value="manual" ${cur === 'manual' ? 'selected' : ''}>${L('Escribir los datos a mano', 'Enter data manually')}</option>` : '') +
    window.MODULES.filter(m => !m.typical || true).map(m => { const k = m.name.split(' (')[0]; return `<option value="${esc(k)}" ${m.name.startsWith(cur) && cur !== 'manual' ? 'selected' : ''}>${esc(m.name.replace(/Co\., Ltd\.|Inc\.|Green Energy Technology/g, ''))} · ${m.Pstc.toFixed(0)} W</option>`; }).join('');
  const invOpts = cur => `<option value="manual" ${cur === 'manual' ? 'selected' : ''}>${L('Escribir la potencia a mano', 'Enter power manually')}</option>` +
    window.INVERTERS_GRID.filter(v => v.seg === 'res').map(v => `<option value="${esc(v.name)}" ${v.name.startsWith(cur) && cur !== 'manual' ? 'selected' : ''}>${esc(v.name)} · ${fx(v.Paco / 1000, 2)} kW</option>`).join('');

  EXT.classcalc = function () {
    const P = $('p-class');
    P.innerHTML = `<div class="intro"><h2>${L('Métodos de clase', 'Classroom methods')}</h2><p>${L('Los cálculos a mano de los cursos, paso a paso, con sus verificaciones. Elige un ejemplo o escribe tus datos: los resultados se comparan con la ley vigente y con la simulación.', 'The hand calculations from the courses, step by step, with their checks. Pick an example or enter your data: results are compared with current law and with the simulation.')}</p></div>
      <div class="seg wide" style="max-width:640px;margin-bottom:16px"><button data-ct="grid" class="${CL.tab === 'grid' ? 'on' : ''}">${L('Conectado a red · sustitución', 'Grid-tied · substitution')}</button><button data-ct="off" class="${CL.tab === 'off' ? 'on' : ''}">${L('Sistema aislado · banco', 'Off-grid · bench')}</button></div>
      <div id="clBody"></div>`;
    P.querySelectorAll('[data-ct]').forEach(b => b.onclick = () => { CL.tab = b.dataset.ct; EXT.classcalc(); });
    CL.tab === 'grid' ? renderGrid() : renderOff();
  };

  function renderGrid() {
    const g = CL.g, b = CL.b, r = calcSub(), w = calcLaw(r.N);
    $('clBody').innerHTML = `
      <div class="btns" style="margin-bottom:16px">${Object.entries(PRESETS).map(([k, p]) => `<button class="btn sm" data-pre="${k}">${L(p.es, p.en)}</button>`).join('')}</div>
      <div class="grid g-2">
        <div class="card"><h3>${L('Datos del caso', 'Case data')}</h3>
          ${fld('g', 'kwh', L('Consumo del mes de diseño (kWh)', 'Design-month consumption (kWh)'), 1, L('Criterio conservador: el mes de mayor consumo.', 'Conservative criterion: the highest-consumption month.'))}
          ${fld('g', 'days', L('Días facturados', 'Billed days'), 1)}
          ${fld('g', 'sub', L('Sustitución (%)', 'Substitution (%)'), 1)}
          ${fld('g', 'Hm', L('Irradiación del mes de menor recurso (kWh/m²)', 'Irradiation of the weakest month (kWh/m²)'), 0.1, L('En el plano del panel (PVGIS: H(i)_m).', 'On the panel plane (PVGIS: H(i)_m).'))}
          ${fld('g', 'dm', L('Días de ese mes', 'Days in that month'), 1, L('El ejemplo de clase divide entre 30.', 'The class example divides by 30.'))}
          ${fld('g', 'PR', 'PR', 0.01, L('Índice de rendimiento fijo del método.', 'Fixed performance ratio of the method.'))}
          <div class="field"><label>${L('Panel', 'Panel')}</label><select class="sel" data-cs="g.mod">${modOpts(g.mod)}</select></div>
          ${g.mod === 'manual' ? fld('g', 'Pman', L('Potencia del panel (W)', 'Panel power (W)'), 1) : ''}
          ${fld('g', 'invF', L('Factor del inversor (× kWp)', 'Inverter factor (× kWp)'), 0.05)}
          <div class="field"><label>${L('Inversor', 'Inverter')}</label><select class="sel" data-cs="g.inv">${invOpts(g.inv)}</select></div>
          ${g.inv === 'manual' ? fld('g', 'Pinv', L('Potencia del inversor (W)', 'Inverter power (W)'), 100) : ''}
          <details><summary>${L('Temperaturas y coeficientes', 'Temperatures and coefficients')}</summary>
            ${fld('g', 'Tmin', L('Celda más fría (°C)', 'Coldest cell (°C)'), 1)}${fld('g', 'Tmax', L('Celda más caliente (°C)', 'Hottest cell (°C)'), 1)}
            ${fld('g', 'bVoc', L('Coeficiente de Voc (%/°C, valor absoluto)', 'Voc coefficient (%/°C, absolute value)'), 0.005)}
            ${fld('g', 'gVmp', L('Coeficiente de Vmp (%/°C, valor absoluto)', 'Vmp coefficient (%/°C, absolute value)'), 0.005, L('Se usa el de potencia, como en clase.', 'The power coefficient is used, as in class.'))}
          </details>
        </div>
        <div class="card"><h3>${L('Método por sustitución, paso a paso', 'Substitution method, step by step')}</h3>
          ${table([L('Paso', 'Step'), L('Cálculo', 'Calculation'), L('Resultado', 'Result')], [
            [L('1. Consumo diario', '1. Daily consumption'), `${fx(g.kwh, 0)} kWh ÷ ${g.days} ${L('días', 'days')}`, `${fx(r.Ed, 2)} kWh/${L('día', 'day')}`],
            [L('2. Sustitución', '2. Substitution'), L('Dato', 'Given'), `${fx(g.sub, 0)} %`],
            [L('3. Energía esperada', '3. Expected energy'), `${fx(r.Ed, 2)} × ${fx(g.sub / 100, 2)}`, `${fx(r.Eobj, 2)} kWh/${L('día', 'day')}`],
            [L('4. Horas solares pico', '4. Peak sun hours'), `${fx(g.Hm, 1)} kWh/m² ÷ ${g.dm} ${L('días', 'days')} ÷ 1 kW/m²`, `${fx(r.HSP, 2)} h`],
            [L('5. Potencia pico', '5. Peak power'), `${fx(r.Eobj, 2)} ÷ (${fx(r.HSP, 2)} × ${fx(g.PR, 2)})`, `${fx(r.Pp, 3)} kWp`],
            [L('6. Número de paneles', '6. Number of panels'), `${fx(r.Pp * 1000, 0)} W ÷ ${fx(r.pm.P, 0)} W = ${fx(r.Pp * 1000 / r.pm.P, 2)} → ${L('hacia arriba', 'round up')}`, `<b>${r.N} ${L('paneles', 'panels')} = ${fx(r.kWp, 2)} kWp</b>`],
            [L('Comprobación', 'Check'), `${fx(r.kWp, 2)} × ${fx(r.HSP, 2)} × ${fx(g.PR, 2)} = ${fx(r.Echk, 2)} kWh/${L('día', 'day')}`, `${fx(r.subReal, 1)} %`],
            [L('7. Inversor', '7. Inverter'), `${fx(g.invF, 2)} × ${fx(r.kWp, 2)} = ${fx(r.Pinv, 2)} kW${r.sugg ? ` · ${L('sugerido', 'suggested')}: ${esc(r.sugg.name)}` : ''}`, `${esc(r.iv.name.split(' (')[0])} · CC/CA ${fx(r.dcac, 2)}`]
          ])}
          ${r.chk.length ? `<h4 style="margin-top:16px">${L('8. Verificación de compatibilidad', '8. Compatibility check')}</h4>${table([L('Verificación', 'Check'), L('Cálculo', 'Calculation'), L('Límite', 'Limit'), ''], r.chk.map(c => [c[0], c[1], c[2], ok(c[3])]))}` : `<p class="note">${L('Elige un panel y un inversor de la lista para verificar tensiones y corrientes.', 'Choose a panel and an inverter from the list to check voltages and currents.')}</p>`}
          <div class="field" style="margin-top:12px"><label>${L('Irradiación anual en el plano (kWh/m²)', 'Annual plane-of-array irradiation (kWh/m²)')}</label><input type="number" step="1" data-c="g.Hy" value="${g.Hy}"></div>
          <div class="field"><label>${L('Consumo anual (kWh)', 'Annual consumption (kWh)')}</label><input type="number" step="1" data-c="g.Ey" value="${g.Ey}"></div>
          <p style="font-size:14px;color:var(--ink2);margin:10px 0 0">${L(`Con el mismo PR fijo, el método estima ${fx(r.kWp, 2)} × ${fx(g.Hy, 0)} × ${fx(g.PR, 2)} = ${fx(r.EyPR, 0)} kWh al año: el ${fx(r.pctY, 0)} % del consumo anual.`, `With the same fixed PR, the method estimates ${fx(r.kWp, 2)} × ${fx(g.Hy, 0)} × ${fx(g.PR, 2)} = ${fx(r.EyPR, 0)} kWh per year: ${fx(r.pctY, 0)} % of annual consumption.`)} ${r.EyPR >= g.Ey * b.lim / 100 ? `<span class="badge bad">${L('Pasa el límite legal', 'Exceeds the legal limit')}</span>` : `<span class="badge ok">${L('Dentro del límite legal', 'Within the legal limit')}</span>`}</p>
        </div>
      </div>
      <div class="grid g-2" style="margin-top:24px">
        <div class="card"><h3>${L('Ley y producción simulada', 'Law and simulated production')}</h3>
          ${fld('b', 'Y', L('Producción específica (kWh/kWp·año)', 'Specific yield (kWh/kWp·yr)'), 1, L('De PVGIS o de la pestaña Inicio.', 'From PVGIS or the Home tab.'))}
          <div class="btns" style="margin:4px 0 8px"><button class="btn sm" id="clFromSim">${L('Usar la del simulador (Inicio)', 'Use the simulator value (Home)')}</button><button class="btn sm" id="clExamRoof">${L('Simular el techo del examen', 'Simulate the exam roof')}</button></div>
          ${CL.simNote ? `<p style="font-size:13.5px;color:var(--ink2);margin:0 0 8px">${CL.simNote}</p>` : ''}
          ${fld('b', 'Ey', L('Consumo anual (kWh)', 'Annual consumption (kWh)'), 1)}
          ${fld('b', 'lim', L('Límite de producción (% del consumo anual)', 'Production limit (% of annual consumption)'), 0.1, L('Art. 47 A.ii (CREE-07-2025): menor que el 100 %. Antes: ≤ 90 % mensual con baterías.', 'Art. 47 A.ii (CREE-07-2025): below 100 %. Before: ≤ 90 % monthly with batteries.'))}
          ${fld('b', 'goal', L('Meta de sustitución anual (%)', 'Annual substitution target (%)'), 1)}
          ${fld('b', 'degr', L('Degradación (%/año)', 'Degradation (%/yr)'), 0.01)}
          <details><summary>${L('Tarifa y excedentes', 'Tariff and surplus')}</summary>
            ${fld('b', 'e1', L('Tarifa primeros kWh (L/kWh)', 'Tariff first kWh (L/kWh)'), 0.01)}${fld('b', 'block', L('Bloque (kWh)', 'Block (kWh)'), 1)}${fld('b', 'e2', L('Tarifa resto (L/kWh)', 'Tariff rest (L/kWh)'), 0.01)}${fld('b', 'fixed', L('Cargo fijo (L/mes)', 'Fixed charge (L/month)'), 0.01)}
            ${fld('b', 'self', L('Autoconsumo directo (%)', 'Direct self-consumption (%)'), 1)}${fld('b', 'exc', L('Precio de excedentes (L/kWh)', 'Surplus price (L/kWh)'), 0.0001, L('Baja tensión, Acuerdo CREE-89-2026.', 'Low voltage, Agreement CREE-89-2026.'))}
          </details>
        </div>
        <div class="card"><h3>${L('Dimensionamiento con el tope legal', 'Sizing with the legal cap')}</h3>
          <p style="font-size:14px;color:var(--ink2);margin:0 0 10px">${L(`PR real del sitio: ${fx(b.Y, 0)} ÷ ${fx(g.Hy, 0)} = ${fx(w.PRreal, 2)}. Potencia máxima: ${fx(w.lim, 0)} kWh ÷ ${fx(b.Y, 0)} kWh/kWp = ${fx(w.kWpMax, 2)} kWp, es decir ${fx(w.Nmax, 2)} paneles de ${fx(panelG().P, 0)} W.`, `Real site PR: ${fx(b.Y, 0)} ÷ ${fx(g.Hy, 0)} = ${fx(w.PRreal, 2)}. Maximum power: ${fx(w.lim, 0)} kWh ÷ ${fx(b.Y, 0)} kWh/kWp = ${fx(w.kWpMax, 2)} kWp, i.e. ${fx(w.Nmax, 2)} panels of ${fx(panelG().P, 0)} W.`)}</p>
          ${table([L('Paneles', 'Panels'), L('Potencia', 'Power'), L('Producción año 1', 'Year-1 production'), L('% del consumo', '% of consumption'), 'Art. 47 A.ii', `${fx(b.goal, 0)} %`], w.rows.map(x => [`${x.n}${x.n === w.nlaw ? ' ★' : ''}`, `${fx(x.kWp, 2)} kWp`, `${fx(x.E, 0)} kWh`, `${fx(x.pct, 1)} %`, ok(x.law), ok(x.goal)]))}
          <div class="kpis" style="margin-top:14px">
            <div class="kpi"><small>${L('Margen legal', 'Legal margin')}</small><b>${fx(w.margin, 0)}<span>kWh</span></b></div>
            <div class="kpi"><small>${L(`Años con ≥ ${b.goal} %`, `Years with ≥ ${b.goal} %`)}</small><b>${isFinite(w.yearsGoal) ? '≈ ' + w.yearsGoal : '—'}<span>${L('años', 'years')}</span></b></div>
            <div class="kpi"><small>${L('Mes de diseño (producción simulada)', 'Design month (simulated)')}</small><b>${fx(w.subWorst, 0)}<span>%</span></b></div>
          </div>
          <p style="font-size:14px;color:var(--ink2);margin:10px 0 0">${L('Sustitución anual con degradación', 'Annual substitution with degradation')}: ${w.life.map(([y, v]) => `${L('año', 'year')} ${y}: <b>${fx(v, 1)} %</b>`).join(' · ')}</p>
          ${w.chkB.length ? `<h4 style="margin-top:12px">${L(`Verificación del string de ${w.ch.n} con ${esc(invG().name.split(' (')[0])} (CC/CA ${fx(w.dcacB, 2)})`, `String of ${w.ch.n} check with ${esc(invG().name.split(' (')[0])} (DC/AC ${fx(w.dcacB, 2)})`)}</h4>${table([L('Condición', 'Condition'), L('Cálculo', 'Calculation'), L('Límite', 'Limit'), ''], w.chkB.map(c => [c[0], c[1], c[2], ok(c[3])]))}` : ''}
          <h4 style="margin-top:12px">${L('Efecto en la factura', 'Effect on the bill')}</h4>
          <p style="font-size:14px;color:var(--ink2);margin:10px 0 0">${L(`Autoconsumo de ${fx(b.self, 0)} %: ${fx(w.selfY, 0)} kWh usados en casa ahorran L ${fx(w.saveSelf, 0)} al año, y ${fx(w.expY, 0)} kWh inyectados a L ${fx(b.exc, 4)}/kWh dan un crédito de L ${fx(w.credit, 0)}. La energía pasa de L ${fx(w.b0, 0)} a unos L ${fx(w.after, 0)} al mes: <b>L ${fx(w.save, 0)}</b> de ahorro el primer año.`, `Self-consumption of ${fx(b.self, 0)} %: ${fx(w.selfY, 0)} kWh used at home save L ${fx(w.saveSelf, 0)} per year, and ${fx(w.expY, 0)} kWh injected at L ${fx(b.exc, 4)}/kWh give a credit of L ${fx(w.credit, 0)}. Energy goes from L ${fx(w.b0, 0)} to about L ${fx(w.after, 0)} per month: <b>L ${fx(w.save, 0)}</b> saved in the first year.`)}</p>
        </div>
      </div>
      <div class="card" style="margin-top:24px"><h3>${L('Comparación', 'Comparison')}</h3>
        ${table(['', L('Sustitución (clase)', 'Substitution (class)'), L('Ley y simulación', 'Law and simulation')], [
          [L('Criterio', 'Criterion'), L(`${fx(g.sub, 0)} % en el peor mes`, `${fx(g.sub, 0)} % in the worst month`), L(`Consumo anual con tope del ${fx(b.lim, 1)} %`, `Annual consumption capped at ${fx(b.lim, 1)} %`)],
          ['PR', `${fx(g.PR, 2)} ${L('fijo', 'fixed')}`, `${fx(w.PRreal, 2)} ${L('simulado', 'simulated')}`],
          [L('Paneles / potencia', 'Panels / power'), `${r.N} × ${fx(r.pm.P, 0)} Wp = ${fx(r.kWp, 2)} kWp`, `${w.ch.n} × ${fx(r.pm.P, 0)} Wp = ${fx(w.ch.kWp, 2)} kWp`],
          [L('Producción anual', 'Annual production'), `${fx(r.EyPR, 0)} kWh (PR ${L('fijo', 'fixed')})`, `${fx(w.ch.E, 0)} kWh`],
          [L('Sustitución anual', 'Annual substitution'), `${fx(r.pctY, 0)} %`, `${fx(w.ch.pct, 1)} %`],
          [L('Sustitución en el mes de diseño', 'Design-month substitution'), `${fx(r.subReal, 1)} %`, `${fx(w.subWorst, 0)} %`],
          ['Art. 47 A.ii', ok(r.EyPR < CL.g.Ey * b.lim / 100), ok(w.ch.law)]
        ])}
        <p class="note">${L('El método de clase da el primer tamaño; la simulación y la ley lo validan. Para obtener la producción específica con el simulador, ajusta en Inicio la ciudad, la inclinación, la orientación (azimut de brújula), el montaje y las pérdidas.', 'The class method gives the first size; simulation and law validate it. To get the specific yield from the simulator, set the city, tilt, azimuth (compass), mounting and losses on Home.')}</p>
      </div>`;
    bindCommon();
    P_presets();
    const fromSim = () => {
      const H = EXT.homeState().HOME, c = EXT.homeCompute(); if (!c || !c.Ykwp) return;
      CL.b.Y = Math.round(c.Ykwp * 0.965);
      const city = A().CITIES[A().S.site.city];
      CL.simNote = L(`Simulador: ${city ? city.name : ''}, ${H.tilt}°, azimut ${H.az}° (brújula), ${H.mount === 'roof' ? 'sobre el techo' : 'estructura libre'}, ${fx(H.lossDC, 1)} % de pérdidas en CC y ≈ 96.5 % de eficiencia del inversor: ${fx(CL.b.Y, 0)} kWh/kWp.`, `Simulator: ${city ? city.name : ''}, ${H.tilt}°, azimuth ${H.az}° (compass), ${H.mount === 'roof' ? 'on the roof' : 'free-standing'}, ${fx(H.lossDC, 1)} % DC losses and ≈ 96.5 % inverter efficiency: ${fx(CL.b.Y, 0)} kWh/kWp.`);
      EXT.classcalc();
    };
    const bs = $('clFromSim'); if (bs) bs.onclick = fromSim;
    const be = $('clExamRoof'); if (be) be.onclick = () => {
      // Techo del examen: Residencial Arboleda, Tegucigalpa · 17° · azimut 20° (brújula, hacia el norte-noreste) · sobre el techo.
      // Pérdidas: 14 % del sistema en PVGIS ≈ 10.5 % en CC + inversor.
      const S = A().S, cty = A().CITIES.tgu, H = EXT.homeState().HOME;
      S.site.city = 'tgu'; S.site.src = 'tmy'; Object.assign(S.site, { lat: cty.lat, lon: cty.lon, alt: cty.alt, Tmin: cty.Tmin, Tmax: cty.Tmax, tz: -6 }); H.loc = null;
      Object.assign(H, { kind: 'res', fmt: 'res', kwh: CL.g.kwh, bills: [CL.g.kwh, CL.g.kwh, CL.g.kwh], tilt: 17, az: 20, mount: 'roof', lossDC: 10.5, invIdx: 'auto' });
      H.modId = window.MODULES.findIndex(m => m.name.startsWith(CL.g.mod === 'manual' ? 'JA Solar JAM72S30' : CL.g.mod));
      A().loadTmy().then(fromSim);
    };
  }
  function P_presets() {
    document.querySelectorAll('[data-pre]').forEach(bt => bt.onclick = () => {
      const p = PRESETS[bt.dataset.pre]; Object.assign(CL.g, p.g); if (p.b) Object.assign(CL.b, p.b); EXT.classcalc();
    });
  }
  function bindCommon() {
    document.querySelectorAll('#clBody [data-c]').forEach(inp => inp.onchange = () => { const [s, k] = inp.dataset.c.split('.'); const v = +inp.value; if (isFinite(v)) CL[s][k] = v; EXT.classcalc(); });
    document.querySelectorAll('#clBody [data-cs]').forEach(sel => sel.onchange = () => { const [s, k] = sel.dataset.cs.split('.'); CL[s][k] = sel.value; EXT.classcalc(); });
  }

  function renderOff() {
    const o = CL.o, r = calcOff();
    $('clBody').innerHTML = `
      <div class="btns" style="margin-bottom:16px"><button class="btn sm" id="clBench">${L('Banco de trabajo UNAH (Victron + Ampeak)', 'UNAH workbench (Victron + Ampeak)')}</button></div>
      <div class="grid g-2">
        <div class="card"><h3>${L('Equipos', 'Equipment')}</h3>
          <div class="field"><label>${L('Módulo FV', 'PV module')}</label><select class="sel" data-cs="o.mod">${modOpts(o.mod)}</select></div>
          ${o.mod === 'manual' ? ['Pman', 'Vmp', 'Imp', 'Voc', 'Isc'].map(k => fld('o', k, { Pman: 'Pmax (W)', Vmp: 'Vmp (V)', Imp: 'Imp (A)', Voc: 'Voc (V)', Isc: 'Isc (A)' }[k])).join('') : ''}
          ${fld('o', 'ns', L('Módulos en serie', 'Modules in series'), 1)}${fld('o', 'np', L('Módulos en paralelo', 'Modules in parallel'), 1)}
          ${fld('o', 'bVoc', L('Coeficiente de Voc (%/°C, valor absoluto)', 'Voc coefficient (%/°C, absolute value)'), 0.01)}${fld('o', 'Tmin', L('Temperatura mínima (°C)', 'Minimum temperature (°C)'), 1)}
          <details><summary>${L('Controlador de carga MPPT', 'MPPT charge controller')}</summary>
            ${fld('o', 'cVoc', L('Voc máxima (V)', 'Maximum Voc (V)'), 1)}${fld('o', 'cI', L('Corriente máxima de carga (A)', 'Maximum charge current (A)'), 1)}${fld('o', 'cP', L('Potencia FV nominal a la tensión de batería (W)', 'Nominal PV power at battery voltage (W)'), 1)}${fld('o', 'cIsc', L('Isc FV máxima (A)', 'Maximum PV Isc (A)'), 1)}${fld('o', 'cEta', L('Eficiencia', 'Efficiency'), 0.01)}${fld('o', 'Vch', L('Tensión de carga (V)', 'Charging voltage (V)'), 0.1)}
          </details>
          <details><summary>${L('Batería', 'Battery')}</summary>
            ${fld('o', 'Vb', L('Tensión (V)', 'Voltage (V)'), 1)}${fld('o', 'Ah', L('Capacidad (Ah)', 'Capacity (Ah)'), 1)}${fld('o', 'dod', L('Profundidad de descarga (%)', 'Depth of discharge (%)'), 1)}${fld('o', 'cmax', L('Tasa de carga máxima (C)', 'Maximum charge rate (C)'), 0.01)}
          </details>
          <details><summary>${L('Inversor y cargas', 'Inverter and loads')}</summary>
            ${fld('o', 'iP', L('Potencia continua (W)', 'Continuous power (W)'), 1)}${fld('o', 'iPk', L('Potencia pico (W)', 'Peak power (W)'), 1)}${fld('o', 'iVdc', L('Tensión CD (V)', 'DC voltage (V)'), 1)}${fld('o', 'iEta', L('Eficiencia', 'Efficiency'), 0.01)}${fld('o', 'iVac', L('Tensión CA (V)', 'AC voltage (V)'), 1)}
            ${fld('o', 'fDC', L('Fusible de cargas CD (A)', 'DC load fuse (A)'), 1)}${fld('o', 'mon', L('Consumo del monitoreo (W)', 'Monitoring consumption (W)'), 0.1)}${fld('o', 'Pload', L('Carga para calcular autonomía (W)', 'Load for autonomy (W)'), 1)}
          </details>
          ${fld('o', 'HSP', L('Horas solares pico', 'Peak sun hours'), 0.1)}${fld('o', 'f', L('Factor de pérdidas', 'Loss factor'), 0.01)}
        </div>
        <div class="card"><h3>${L('Resultados', 'Results')}</h3>
          <div class="kpis">
            <div class="kpi"><small>${L('Corriente de carga', 'Charge current')}</small><b>${fx(r.Ich, 1)}<span>A · ${fx(r.Crate, 2)} C</span></b></div>
            <div class="kpi"><small>${L(`Voc a ${o.Tmin} °C`, `Voc at ${o.Tmin} °C`)}</small><b>${fx(r.VocC, 1)}<span>V</span></b></div>
            <div class="kpi"><small>${L('Energía FV diaria', 'Daily PV energy')}</small><b>${fx(r.Efv / 1000, 2)}<span>kWh</span></b></div>
            <div class="kpi"><small>${L('Batería: nominal · útil', 'Battery: nominal · usable')}</small><b>${fx(r.Ebat, 0)} · ${fx(r.Eu, 0)}<span>Wh</span></b></div>
            <div class="kpi"><small>${L('I CD del inversor', 'Inverter DC current')}</small><b>${fx(r.IinvDC, 1)}<span>A</span></b></div>
            <div class="kpi"><small>${L('I CA', 'AC current')}</small><b>${fx(r.Iac, 1)}<span>A</span></b></div>
            <div class="kpi"><small>${L(`Autonomía con ${fx(o.Pload, 0)} W`, `Autonomy at ${fx(o.Pload, 0)} W`)}</small><b>${fx(r.auto, 1)}<span>h</span></b></div>
          </div>
          <h4 style="margin-top:16px">${L('Compatibilidad', 'Compatibility')}</h4>
          ${table([L('Verificación', 'Check'), L('Cálculo', 'Calculation'), L('Límite', 'Limit'), ''], r.chk.map(c => [c[0], c[1], c[2], ok(c[3])]))}
        </div>
      </div>
      <div class="grid g-2" style="margin-top:24px">
        <div class="card"><h3>${L('Protecciones (1.25 × corriente máxima)', 'Protections (1.25 × maximum current)')}</h3>${table(['Ref.', L('Ubicación', 'Location'), L('Criterio', 'Criterion'), L('Cálculo', 'Calculation'), L('Valor', 'Value')], r.prot)}</div>
        <div class="card"><h3>${L('Conductores', 'Conductors')}</h3>${table([L('Tramo', 'Run'), L('Corriente', 'Current'), L('Sección', 'Size'), L('Motivo', 'Reason')], r.cab.map(c => [c[0], `${fx(c[1], 1)} A`, `${c[2][0]} mm² (${c[2][2]})`, c[3]]))}
          <p class="note">${L('Capacidades aproximadas de cobre a 75 °C; verifica con la tabla de la norma y la caída de tensión del tramo.', 'Approximate copper ampacities at 75 °C; check against the code table and the run voltage drop.')}</p></div>
      </div>
      <div class="card" style="margin-top:24px"><h3>${L('Selección del módulo: opciones comparadas', 'Module selection: compared options')}</h3>
        ${table([L('Opción', 'Option'), 'Pmax', 'Isc', L('I de carga', 'Charge I'), L('Tasa', 'Rate'), L('Energía/día', 'Energy/day'), L('Resultado', 'Result')], r.opts.map(x => [esc(x[0]), `${fx(x[1], 0)} W`, `${fx(x[2], 2)} A`, `≈ ${fx(x[3], 0)} A`, `${fx(x[4], 2)} C`, `${fx(x[5], 1)} kWh`, x[6] ? `<span class="badge ok">${L('Adecuado', 'Suitable')}</span>` : `<span class="badge warn">${x[7]}</span>`]))}
        <p class="note">${L(`I de carga = Pmax × ${fx(o.cEta, 2)} ÷ ${fx(o.Vch, 1)} V · Tasa = I ÷ ${fx(o.Ah, 0)} Ah (máximo recomendado ${fx(o.cmax, 2)} C) · Energía = Pmax × ${fx(o.HSP, 1)} HSP × ${fx(o.f, 2)}.`, `Charge I = Pmax × ${fx(o.cEta, 2)} ÷ ${fx(o.Vch, 1)} V · Rate = I ÷ ${fx(o.Ah, 0)} Ah (recommended maximum ${fx(o.cmax, 2)} C) · Energy = Pmax × ${fx(o.HSP, 1)} PSH × ${fx(o.f, 2)}.`)}</p>
      </div>`;
    bindCommon();
    $('clBench').onclick = () => {
      Object.assign(CL.o, { mod: 'Mundo Solar 350', ns: 1, np: 1, bVoc: 0.30, Tmin: 10, cVoc: 100, cI: 50, cP: 700, cIsc: 60, cEta: 0.97, Vch: 13.8, Vb: 12, Ah: 165, dod: 50, cmax: 0.2, iP: 750, iPk: 1500, iVdc: 12, iEta: 0.88, iVac: 110, HSP: 5, f: 0.8, fDC: 10, mon: 2.8, Pload: 100 });
      EXT.classcalc();
    };
  }
})();
