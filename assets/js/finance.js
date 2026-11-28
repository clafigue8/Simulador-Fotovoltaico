/* =====================================================================
   Análisis financiero y escenarios ("¿qué pasa si…?") del diseño de Inicio.
   Flujo de caja anual del dueño del sistema:
     año 0: aporte propio (inversión − préstamo)
     años 1…N: ahorro en la factura + venta de excedentes − O&M − cuota del préstamo
               − reemplazo de inversores (una vez).
   El caso base usa los supuestos (editables y con valores por defecto del panel
   de administración); el escenario cambia parámetros con botones Bajar/Subir.
   ===================================================================== */
(function () {
  'use strict';
  const EXT = window.PAGES_EXT = window.PAGES_EXT || {};
  const A = () => window.APP, L = (es, en) => A().L(es, en), $ = id => document.getElementById(id);
  const SCF = () => window.SITECFG.data.finanzas;
  const nf = (v, d = 0) => (+v).toLocaleString(A().LANG === 'en' ? 'en-US' : 'es-HN', { minimumFractionDigits: d, maximumFractionDigits: d });
  const money = v => { const a = Math.abs(v); return (v < 0 ? '−' : '') + 'L ' + (a >= 1e7 ? nf(a / 1e6, 1) + ' M' : nf(a, 0)); };

  // Supuestos del caso base (se reinician si cambian los valores del panel)
  let BASE = null, BASE_SRC = '', SC = {}, OPEN = false, CALC = null;
  const clean = () => { const D = window.SITECFG.DEFAULTS.finanzas, o = { ...D }; for (const k in D) { const v = (SCF() || {})[k]; o[k] = k === 'financ' ? (v === 'propia' ? 'propia' : 'prestamo') : (v === '' || v == null || !isFinite(+v) ? D[k] : +v); } return o; };
  const baseNow = () => { const s = JSON.stringify(SCF()); if (s !== BASE_SRC) { BASE_SRC = s; BASE = clean(); } return BASE; };

  /* ---------- Modelo ---------- */
  // P: parámetros; c: resultado del dimensionamiento; B: parámetros base (para años anteriores a "desde")
  function run(P, c, B) {
    const N = Math.round(P.horizonte), inv = c.costHNL * P.capex / 100;
    const selfS = c.farm ? 0 : c.b0 - c.b1, sale = c.farm ? c.save : c.credit;
    const loan = P.financ === 'prestamo' ? inv * P.pctFin / 100 : 0;
    const r = P.tasa / 100, n = Math.max(1, Math.round(P.plazo));
    const cuota = loan ? (r ? loan * r / (1 - Math.pow(1 + r, -n)) : loan / n) : 0;
    const flows = [-(inv - loan)], rows = [];
    for (let y = 1; y <= N; y++) {
      const Q = y >= P.desde ? P : B;   // los cambios de operación se aplican desde el año elegido
      const prod = Q.prod / 100 * Math.pow(1 - Q.degr / 100, y - 1) * (1 - Math.min(Q.out, c.nInv) / Math.max(1, c.nInv));
      const gT = Math.pow(1 + Q.aumTarifa / 100, y - 1);
      const ahorro = selfS * prod * gT * Q.precio / 100;
      const venta = sale * prod * gT * (Q.iny / 100) * (c.farm ? Q.precio : Q.exc) / 100;
      const om = c.costHNL * Q.capex / 100 * Q.om / 100 * Math.pow(1 + Q.aumOM / 100, y - 1);
      const pago = y <= n ? cuota : 0;
      const repl = y === Math.round(P.reemplazoAnio) ? inv * P.reemplazoPct / 100 : 0;
      const f = ahorro + venta - om - pago - repl;
      flows.push(f); rows.push({ y, ahorro, venta, om, pago, repl, f });
    }
    const cum = []; flows.reduce((a, f, i) => (cum[i] = a + f), 0);
    const npv = rate => flows.reduce((a, f, i) => a + f / Math.pow(1 + rate, i), 0);
    let tir = null;
    if (flows[0] < 0 && cum[N] > 0) { let lo = -0.99, hi = 10; for (let k = 0; k < 200; k++) { const m = (lo + hi) / 2; npv(m) > 0 ? lo = m : hi = m; } tir = (lo + hi) / 2; }
    let pay = null; for (let i = 1; i <= N; i++) if (cum[i] >= 0 && cum[i - 1] < 0) { pay = i - 1 + (-cum[i - 1]) / (cum[i] - cum[i - 1]); break; }
    if (pay == null && cum[0] >= 0 && cum.every(v => v >= 0)) pay = 0;
    return {
      N, inv, loan, cuota, flows, cum, rows, tir, van: npv(P.descuento / 100), util: cum[N], neg: rows.filter(x => x.f < 0).length,
      aporte: Math.max(0, -Math.min(...cum)), pay, law: c.farm ? null : c.tot.pv * P.prod / 100 / c.Eyear * 100
    };
  }

  /* ---------- Parámetros del escenario ---------- */
  // [clave, etiqueta, paso, mín, máx, formato]
  const PCT = v => nf(v, v % 1 ? (Math.abs(v * 10 - Math.round(v * 10)) < 1e-6 ? 1 : 2) : 0) + ' %';
  const PARAMS = () => {
    const c = CALC, farm = c.farm;
    return [
      ['prod', L('Producción del sistema (% del diseño)', 'System production (% of design)'), 5, 30, 150, PCT],
      ...(c.nInv > 1 ? [['out', L(`Inversores fuera de servicio (de ${c.nInv})`, `Inverters out of service (of ${c.nInv})`), 1, 0, c.nInv, v => v ? nf(v) : L('Sin fallas', 'None')]] : []),
      ['iny', L('Energía vendida real (% de la estimada)', 'Actual energy sold (% of estimate)'), 5, 0, 150, PCT],
      ['precio', farm ? L('Precio de venta de la energía (% del actual)', 'Energy sale price (% of current)') : L('Precio de la energía de la ENEE (% del actual)', 'ENEE energy price (% of current)'), 5, 30, 200, PCT],
      ...(farm ? [] : [['exc', L('Tarifa de excedentes (% de la actual)', 'Surplus tariff (% of current)'), 5, 0, 200, PCT]]),
      ['capex', L('Costo de la inversión (% del estimado)', 'Investment cost (% of estimate)'), 5, 30, 200, PCT],
      ['om', L('Costo anual de O&M (% de la inversión)', 'Annual O&M cost (% of investment)'), 0.25, 0, 10, PCT],
      ['aumTarifa', L('Aumento anual de las tarifas', 'Annual tariff increase'), 0.5, -10, 20, v => v ? PCT(v) + L('/año', '/yr') : L('Sin aumento', 'None')],
      ['aumOM', L('Aumento anual del O&M', 'Annual O&M increase'), 0.5, -10, 20, v => v ? PCT(v) + L('/año', '/yr') : L('Sin aumento', 'None')],
      ['financ', L('Financiamiento', 'Financing'), 0, 0, 0, v => v === 'prestamo' ? L('Con préstamo', 'Loan') : L('Fondos propios', 'Own funds')],
      ['pctFin', L('Parte financiada con préstamo', 'Share financed by loan'), 10, 0, 100, PCT],
      ['plazo', L('Plazo del préstamo', 'Loan term'), 1, 1, 30, v => nf(v) + ' ' + L('años', 'years')],
      ['tasa', L('Tasa de interés del préstamo', 'Loan interest rate'), 0.5, 0, 40, PCT],
      ['desde', L('Aplicar los cambios de operación desde el año', 'Apply operating changes from year'), 1, 1, 40, v => nf(v)]
    ];
  };
  const OPER = { prod: 100, out: 0, iny: 100, precio: 100, exc: 100, capex: 100, desde: 1 };
  const baseP = () => ({ ...OPER, ...baseNow() });
  const scenP = () => ({ ...baseP(), ...SC });

  /* ---------- Interfaz ---------- */
  EXT.financeBox = function (el, c) {
    if (!el || !c) return;
    CALC = c;
    el.innerHTML = `<details class="card fin" ${OPEN ? 'open' : ''}><summary><span class="fint">💰 ${L('Análisis financiero y escenarios', 'Financial analysis and scenarios')}</span><span class="fins" id="fnSum"></span></summary><div id="fnBody"></div></details>`;
    const d = el.querySelector('details');
    d.ontoggle = () => { OPEN = d.open; if (OPEN) render(); };
    summary();
    if (OPEN) render();
  };

  function summary() {
    const R = run(baseP(), CALC, baseP());
    $('fnSum').textContent = (R.tir != null ? L('TIR ', 'IRR ') + nf(R.tir * 100, 1) + ' %' : L('Sin aporte inicial', 'No upfront payment')) + ' · ' + L('utilidad a ', 'profit at ') + R.N + L(' años: ', ' yrs: ') + money(R.util);
  }

  function render() {
    const c = CALC, B = baseP(), P = scenP(), RB = run(B, c, B), RS = run(P, c, B), ps = PARAMS();
    const changed = Object.keys(SC).length > 0;
    const diffTxt = (k, fmt) => {
      if (!(k in SC) || SC[k] === B[k]) return `<span class="fnsame">${L('Igual', 'Same')}</span>`;
      if (k === 'financ') return `<span class="fnchg">${fmt(P[k])}</span>`;
      const d = P[k] - B[k]; return `<span class="fnchg">${d > 0 ? '+' : '−'}${nf(Math.abs(d), Math.abs(d) % 1 ? 2 : 0)}${['plazo', 'desde', 'out'].includes(k) ? '' : ' pp'}</span>`;
    };
    const row = ([k, lab, st, , , fmt]) => {
      const dis = (k === 'pctFin' || k === 'plazo' || k === 'tasa') && P.financ !== 'prestamo';
      const btns = k === 'financ'
        ? `<button class="btn sm ${P.financ === 'prestamo' ? 'pri' : ''}" data-fset="prestamo">${L('Préstamo', 'Loan')}</button><button class="btn sm ${P.financ === 'propia' ? 'pri' : ''}" data-fset="propia">${L('Propios', 'Own')}</button>`
        : `<button class="btn sm fnm" data-fk="${k}" data-fd="-1" ${dis ? 'disabled' : ''} aria-label="${L('Bajar', 'Lower')}">−</button><button class="btn sm fnp" data-fk="${k}" data-fd="1" ${dis ? 'disabled' : ''} aria-label="${L('Subir', 'Raise')}">+</button>`;
      return `<div class="fnrow${k in SC && SC[k] !== B[k] ? ' on' : ''}${dis ? ' dis' : ''}"><span class="fnl">${lab}</span><span class="fnb">${fmt(B[k])}</span><b class="fne">${fmt(P[k])}</b><span class="fnd">${diffTxt(k, fmt)}</span><span class="fnbt">${btns}<button class="btn sm fnr" data-fr="${k}" title="${L('Volver al valor base', 'Back to base value')}" ${k in SC ? '' : 'disabled'}>↺</button></span></div>`;
    };
    const yrs = v => v == null ? L('No se recupera', 'Not recovered') : nf(v, 1) + ' ' + L('años', 'years');
    const tirT = v => v == null ? '—' : nf(v * 100, 1) + ' %';
    const res = [
      [L(`Utilidad acumulada a ${RB.N} años`, `Cumulative profit at ${RB.N} years`), money(RB.util), money(RS.util), RS.util - RB.util, money],
      [L('TIR (tasa interna de retorno)', 'IRR (internal rate of return)'), tirT(RB.tir), tirT(RS.tir), RB.tir != null && RS.tir != null ? (RS.tir - RB.tir) * 100 : null, v => nf(v, 1) + ' pp'],
      [L(`VAN al ${nf(B.descuento, 1)} % de descuento`, `NPV at ${nf(B.descuento, 1)} % discount`), money(RB.van), money(RS.van), RS.van - RB.van, money],
      [L('Aporte máximo del dueño', 'Maximum owner contribution'), money(RB.aporte), money(RS.aporte), RS.aporte - RB.aporte, money],
      [L('Recupera su aporte en', 'Recovers its contribution in'), yrs(RB.pay), yrs(RS.pay), RB.pay != null && RS.pay != null ? RS.pay - RB.pay : null, v => nf(v, 1) + ' ' + L('años', 'yrs')],
      [L('Años con flujo negativo', 'Years with negative cash flow'), nf(RB.neg), nf(RS.neg), RS.neg - RB.neg, v => nf(v)],
      ...(c.farm ? [] : [[L('Producción / consumo anual (la ley exige < 100 %)', 'Production / annual consumption (law requires < 100 %)'), nf(RB.law, 1) + ' %', nf(RS.law, 1) + ' %', null, null, RS.law < SCF_LAW() ? L('Cumple', 'Complies') : L('No cumple', 'Does not comply'), RS.law < SCF_LAW()]])
    ];
    const resRow = ([lab, b, s, d, fmt, txt, ok]) => `<div class="fnres"><span class="fnl">${lab}</span><span class="fnb">${b}</span><b class="fne">${s}</b><span class="fnd">${txt ? `<span class="${ok ? 'fnok' : 'fnbad'}">${txt}</span>` : d == null || Math.abs(d) < 1e-9 ? '<span class="fnsame">0</span>' : `<span class="${d > 0 ? 'fnup' : 'fndn'}">${d > 0 ? '+' : '−'}${fmt(Math.abs(d)).replace(/^−/, '')}</span>`}</span></div>`;
    $('fnBody').innerHTML = `
      <p class="note">${L(`<b>Cómo funciona.</b> El caso base usa la inversión, el ahorro y los excedentes del diseño de arriba, más los supuestos financieros. Con los botones − y + creas un escenario ("¿qué pasa si baja la producción, sube la tarifa o fallan inversores?") y se compara con el caso base. Flujo de caja anual del dueño: ahorro en la factura + venta de excedentes − operación y mantenimiento − cuota del préstamo − reemplazo de inversores en el año ${B.reemplazoAnio} (${nf(B.reemplazoPct, 0)} % de la inversión). Los paneles pierden ${nf(B.degr, 1)} % de producción por año. Con préstamo, la TIR mide la rentabilidad del dinero que pone el dueño; por eso puede salir muy alta cuando casi todo se financia. Valores orientativos, en lempiras corrientes, sin impuestos ni inflación: no son asesoría financiera.`, `<b>How it works.</b> The base case uses the investment, savings and surplus of the design above, plus the financial assumptions. With the − and + buttons you build a scenario ("what if production drops, tariffs rise or inverters fail?") and compare it with the base case. Owner's annual cash flow: bill savings + surplus sales − operation and maintenance − loan payment − inverter replacement in year ${B.reemplazoAnio} (${nf(B.reemplazoPct, 0)} % of the investment). Panels lose ${nf(B.degr, 1)} % of production per year. With a loan, the IRR measures the return on the money the owner puts in, so it can be very high when almost everything is financed. Indicative values, in current lempiras, before taxes and inflation: not financial advice.`)}</p>
      <div class="fnkpi">${A().kpi(L('Inversión', 'Investment'), money(RS.inv))}${A().kpi(L('Préstamo', 'Loan'), money(RS.loan))}${A().kpi(L('Cuota anual', 'Annual payment'), money(RS.cuota))}${A().kpi(L('Ahorro + ventas año 1', 'Savings + sales year 1'), money(RS.rows[0].ahorro + RS.rows[0].venta), '', 'ok')}</div>
      <h4 class="fnh">${L('Panel de escenarios', 'Scenario panel')}</h4>
      <div class="fntab"><div class="fnrow fnhead"><span class="fnl">${L('Parámetro', 'Parameter')}</span><span class="fnb">${L('Base', 'Base')}</span><b class="fne">${L('Escenario', 'Scenario')}</b><span class="fnd">${L('Cambio', 'Change')}</span><span class="fnbt">${L('Bajar / Subir', 'Lower / Raise')}</span></div>${ps.map(row).join('')}</div>
      <div class="btns" style="justify-content:flex-end;margin-top:10px"><button class="btn ${changed ? 'pri' : ''}" id="fnAll" ${changed ? '' : 'disabled'}>↺ ${L('Volver TODO al caso base', 'Reset ALL to base case')}</button></div>
      <h4 class="fnh">${L('Resultados del escenario', 'Scenario results')}</h4>
      <div class="fntab"><div class="fnres fnhead"><span class="fnl">${L('Resultado', 'Result')}</span><span class="fnb">${L('Base', 'Base')}</span><b class="fne">${L('Escenario', 'Scenario')}</b><span class="fnd">${L('Diferencia', 'Difference')}</span></div>${res.map(resRow).join('')}</div>
      <h4 class="fnh">${L('Flujo de caja acumulado', 'Cumulative cash flow')}</h4>
      <div class="chart"><canvas id="fnC" class="h300"></canvas></div>
      <details class="fnmore"><summary>${L('Supuestos del caso base', 'Base-case assumptions')}</summary>
        <div class="aform fnform">${[
        ['horizonte', L('Horizonte del análisis', 'Analysis horizon'), 1, L('años', 'years')],
        ['degr', L('Pérdida de producción de los paneles', 'Panel production loss'), 0.1, L('%/año', '%/yr')],
        ['om', L('Costo anual de O&M', 'Annual O&M cost'), 0.25, L('% de la inversión', '% of investment')],
        ['aumTarifa', L('Aumento anual de las tarifas', 'Annual tariff increase'), 0.5, '%'],
        ['aumOM', L('Aumento anual del O&M', 'Annual O&M increase'), 0.5, '%'],
        ['pctFin', L('Parte financiada con préstamo', 'Share financed by loan'), 5, '%'],
        ['plazo', L('Plazo del préstamo', 'Loan term'), 1, L('años', 'years')],
        ['tasa', L('Tasa de interés', 'Interest rate'), 0.25, '%'],
        ['descuento', L('Tasa de descuento (VAN)', 'Discount rate (NPV)'), 0.5, '%'],
        ['reemplazoAnio', L('Reemplazo de inversores en el año', 'Inverter replacement in year'), 1, ''],
        ['reemplazoPct', L('Costo del reemplazo', 'Replacement cost'), 1, L('% de la inversión', '% of investment')]
      ].map(([k, lab, st, u]) => `<label class="field"><span>${lab}${u ? ` <small>(${u})</small>` : ''}</span><input class="inp" type="number" step="${st}" data-fb="${k}" value="${B[k]}"></label>`).join('')}
        <label class="field"><span>${L('Financiamiento', 'Financing')}</span><select class="sel" data-fb="financ"><option value="prestamo" ${B.financ === 'prestamo' ? 'selected' : ''}>${L('Con préstamo', 'Loan')}</option><option value="propia" ${B.financ === 'propia' ? 'selected' : ''}>${L('Fondos propios', 'Own funds')}</option></select></label></div>
        <div class="btns"><button class="btn sm" id="fnBR">${L('Restaurar supuestos', 'Restore assumptions')}</button></div>
      </details>
      <details class="fnmore"><summary>${L('Tabla de flujos por año', 'Yearly cash-flow table')}</summary>
        <div class="tscroll"><table class="t fnyt"><thead><tr><th>${L('Año', 'Year')}</th><th>${c.farm ? L('Ventas', 'Sales') : L('Ahorro', 'Savings')}</th>${c.farm ? '' : `<th>${L('Excedentes', 'Surplus')}</th>`}<th>O&M</th><th>${L('Préstamo', 'Loan')}</th><th>${L('Reemplazo', 'Replacement')}</th><th>${L('Flujo', 'Flow')}</th><th>${L('Acumulado', 'Cumulative')}</th></tr></thead><tbody>
          <tr><td>0</td><td colspan="${c.farm ? 4 : 5}">${L('Aporte inicial', 'Upfront payment')}</td><td>${money(RS.flows[0])}</td><td>${money(RS.cum[0])}</td></tr>
          ${RS.rows.map(x => `<tr${x.f < 0 ? ' class="neg"' : ''}><td>${x.y}</td><td>${money(c.farm ? x.venta : x.ahorro)}</td>${c.farm ? '' : `<td>${money(x.venta)}</td>`}<td>${money(-x.om)}</td><td>${x.pago ? money(-x.pago) : '—'}</td><td>${x.repl ? money(-x.repl) : '—'}</td><td>${money(x.f)}</td><td>${money(RS.cum[x.y])}</td></tr>`).join('')}</tbody></table></div>
      </details>`;
    bind(ps);
    const css = A().css, all = [...RB.cum, ...RS.cum], k = Math.max(...all.map(Math.abs)) >= 1e7 ? 1e6 : 1e3, xs = RB.cum.map((_, i) => i);
    window.CHART.draw($('fnC'), {
      xs, xmin: 0, xmax: RB.N, xl: L('Año', 'Year'), yl: k === 1e6 ? L('Millones de lempiras', 'Million lempiras') : L('Miles de lempiras', 'Thousand lempiras'),
      yminL: Math.min(0, ...all) / k * 1.1, ymaxL: Math.max(1, ...all) / k * 1.1,
      series: [{ ys: xs.map(() => 0), color: css('--axis'), w: 1, clip: false }, { ys: RB.cum.map(v => v / k), color: css('--s6'), w: 2.2, dash: changed ? [6, 4] : [], clip: false, label: L('Caso base', 'Base case') }, ...(changed ? [{ ys: RS.cum.map(v => v / k), color: css('--s4'), w: 2.6, clip: false, label: L('Escenario', 'Scenario') }] : [])]
    });
    summary();
  }
  const SCF_LAW = () => window.SITECFG.data.ley.limite;

  function bind(ps) {
    const B = baseP(), body = $('fnBody');
    body.querySelectorAll('[data-fk]').forEach(b => b.onclick = () => {
      const k = b.dataset.fk, p = ps.find(x => x[0] === k), P = scenP();
      let v = +(P[k] + p[2] * +b.dataset.fd).toFixed(4); v = Math.min(p[4], Math.max(p[3], v));
      if (v === B[k]) delete SC[k]; else SC[k] = v; render();
    });
    body.querySelectorAll('[data-fset]').forEach(b => b.onclick = () => { const v = b.dataset.fset; if (v === B.financ) delete SC.financ; else SC.financ = v; render(); });
    body.querySelectorAll('[data-fr]').forEach(b => b.onclick = () => { delete SC[b.dataset.fr]; render(); });
    $('fnAll').onclick = () => { SC = {}; render(); };
    body.querySelectorAll('[data-fb]').forEach(i => i.onchange = () => {
      const k = i.dataset.fb; BASE[k] = k === 'financ' ? i.value : (isFinite(+i.value) && i.value !== '' ? +i.value : clean()[k]);
      if (k === 'horizonte') BASE[k] = Math.min(40, Math.max(5, Math.round(BASE[k])));
      render(); body.closest('details').querySelector('.fnmore').open = true;
    });
    $('fnBR').onclick = () => { BASE = clean(); render(); };
  }
})();
