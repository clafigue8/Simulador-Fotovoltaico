/* © 2026 Claudia Figueroa, Dennis Johan López y M.Sc. Daniel Flores · Simulador de Sistemas Fotovoltaicos. Todos los derechos reservados. Prohibida su copia, modificación o redistribución sin autorización escrita. */
/* =====================================================================
   Red eléctrica nacional: punto de conexión, elevación de tensión,
   armónicos (NT de Calidad de Distribución, CREE 2017) y arranque de motores
   ===================================================================== */
(function () {
  'use strict';
  const EXT = window.PAGES_EXT = window.PAGES_EXT || {};
  const A = () => window.APP, L = (es, en) => A().L(es, en), $ = id => document.getElementById(id), fx = (x, d) => A().fx(x, d);

  // Límites de distorsión armónica individual de tensión (%) — NT‑CD, Art. 15, servicio en BT y MT (Vk < 60 kV)
  const NT_LIM = { 2: 2, 3: 5, 4: 1, 5: 6, 6: 0.5, 7: 5, 8: 0.5, 9: 1.5, 10: 0.5, 11: 3.5, 12: 0.2, 13: 3, 15: 0.3, 17: 2, 19: 1.5, 21: 0.2, 23: 1.5, 25: 1.5 };
  const NT_THD = 8;
  const ORDERS = [3, 5, 7, 9, 11, 13, 15, 17, 19, 23, 25];
  // Espectros típicos de corriente (fracción de la fundamental de cada carga)
  const SPEC = {
    smps: { 3: 0.70, 5: 0.45, 7: 0.25, 9: 0.12, 11: 0.08, 13: 0.06, 15: 0.04, 17: 0.03, 19: 0.02, 23: 0.015, 25: 0.01 },   // electrónica monofásica
    vfd: { 5: 0.30, 7: 0.12, 11: 0.07, 13: 0.05, 17: 0.04, 19: 0.03, 23: 0.02, 25: 0.02 },                               // variador 6 pulsos con reactor
    inv: { 3: 0.45, 5: 0.55, 7: 0.40, 9: 0.15, 11: 0.30, 13: 0.25, 15: 0.05, 17: 0.12, 19: 0.10, 23: 0.06, 25: 0.05 }       // forma típica del inversor FV (se escala a su THDi)
  };
  // reparto típico de la distorsión de fondo de la red (predominan la 5.ª y la 7.ª); suma cuadrática = 1
  const BG = (() => { const w = { 3: 0.35, 5: 0.8, 7: 0.45, 11: 0.15, 13: 0.1 }, n = Math.sqrt(Object.values(w).reduce((a, x) => a + x * x, 0)); for (const k in w) w[k] /= n; return w; })();
  const alpha = h => h < 5 ? 1 : h <= 10 ? 1.4 : 2;     // exponentes de suma, IEC 61000-3-6
  const METHODS = {
    dol: { k: 6.5, pf: 0.35, es: 'Directo (DOL)', en: 'Direct on line (DOL)' },
    yd: { k: 2.2, pf: 0.40, es: 'Estrella‑triángulo', en: 'Star‑delta' },
    soft: { k: 3.5, pf: 0.45, es: 'Arrancador suave', en: 'Soft starter' },
    vfd: { k: 1.2, pf: 0.85, es: 'Variador de frecuencia', en: 'Variable frequency drive' }
  };
  const GS = { svc: 'res', kva: 50, z: 2.5, xr: 2.5, len: 25, awg: '4', load: 5, smps: 30, vfd: 0, thdi: 3, bg: 1.5, mhp: 3, method: 'dol', starts: 4, pvkw: 0 };

  function sys() {
    const svc = GS.svc, ph3 = svc === 'bt480', V = svc === 'bt480' ? 480 : 240, Vph = ph3 ? V / Math.sqrt(3) : V;
    const Zb = V * V / (GS.kva * 1000), Zt = GS.z / 100 * Zb, Rt = Zt / Math.sqrt(1 + GS.xr * GS.xr), Xt = Rt * GS.xr;
    const a = window.SYS.AWG.find(x => x.g === GS.awg) || window.SYS.AWG[4];
    const Rl = (ph3 ? 1 : 2) * 0.017241 * 1.12 * GS.len / a.A, Xl = (ph3 ? 1 : 2) * 0.08e-3 * GS.len;
    const R = Rt + Rl, X = Xt + Xl, Z = Math.hypot(R, X);
    const Isc = Vph / Z, Ssc = (ph3 ? 3 : 1) * Vph * Isc;   // VA
    const k = ph3 ? Math.sqrt(3) : 1;
    return { ph3, V, Vph, R, X, Z, Isc, Ssc, k };
  }
  function pvKW() { const h = EXT.homeState && EXT.homeState().calc; return GS.pvkw > 0 ? GS.pvkw : h ? h.kWac : 5; }
  function pvExport() { const h = EXT.homeState && EXT.homeState().calc; return h ? Math.min(h.peakExp, h.kWac) : pvKW() * 0.8; }

  function harmonics(s) {
    const Iload = GS.load * 1000 / (s.k * s.V * 0.95), Ipv = pvKW() * 1000 / (s.k * s.V);
    const sumInv = Object.values(SPEC.inv).reduce((a, x) => a + x * x, 0), scale = GS.thdi / 100 / Math.sqrt(sumInv);
    const rows = ORDERS.map(h => {
      const parts = [Iload * GS.smps / 100 * (SPEC.smps[h] || 0), Iload * GS.vfd / 100 * (SPEC.vfd[h] || 0), Ipv * (SPEC.inv[h] || 0) * scale];
      const a = alpha(h), Ih = Math.pow(parts.reduce((t, x) => t + Math.pow(x, a), 0), 1 / a);
      const Zh = Math.hypot(s.R, h * s.X), Dh_own = Ih * Zh / s.Vph * 100;
      const Dh = Math.sqrt(Dh_own * Dh_own + Math.pow(GS.bg * (BG[h] || 0), 2));
      return { h, Ih, Dh, lim: NT_LIM[h] ?? 0.2 };
    });
    const THD = Math.sqrt(rows.reduce((t, r) => t + r.Dh * r.Dh, 0));
    const X4 = Math.max(0, (THD - NT_THD) / NT_THD) + rows.reduce((t, r) => t + Math.max(0, (r.Dh - r.lim) / r.lim), 0) / 3;
    return { rows, THD, X4, Iload, Ipv };
  }
  function motor(s, key) {
    const m = METHODS[key || GS.method], P = GS.mhp * 746, eff = 0.88, pf = 0.85;
    const In = P / (s.k * s.V * eff * pf), Ist = m.k * In, sin = Math.sqrt(1 - m.pf * m.pf);
    const dV = Ist * (s.R * m.pf + s.X * sin) / s.Vph * 100;
    return { In, Ist, dV, Sst: s.k * s.V * Ist, m };
  }

  let lastKind = null;
  EXT.grid = function () {
    const hs = EXT.homeState && EXT.homeState();
    if (hs && hs.HOME.kind !== lastKind) { lastKind = hs.HOME.kind; if (['com', 'gas', 'farm'].includes(lastKind)) Object.assign(GS, { svc: 'bt480', kva: 300, z: 5.75, xr: 6, load: Math.round(hs.HOME.kwh / 730 * 2 * 10) / 10, vfd: 20, mhp: 25 }); else Object.assign(GS, { svc: 'res', kva: 50, z: 2.5, xr: 2.5, load: 5, vfd: 0, mhp: 1 }); }
    const { kpi, chartBox } = A(), s = sys();
    const opt = (k, v, t) => `<option value="${v}" ${String(GS[k]) === String(v) ? 'selected' : ''}>${t}</option>`;
    $('p-grid').innerHTML = `
      <div class="intro"><h2>${L('Conexión con la red eléctrica nacional', 'Connection to the national power grid')}</h2><p>${L('Revisa cómo tu sistema solar y tus cargas afectan la red de la ENEE: elevación de tensión, armónicos y arranque de motores, comparados con los límites de la Norma Técnica de Calidad de Distribución de la CREE.', 'Check how your solar system and loads affect the ENEE grid: voltage rise, harmonics and motor starting, compared with the limits of the CREE Distribution Quality Technical Standard.')}</p></div>
      <div class="grid g-side">
        <div class="card"><h3>${L('Punto de conexión', 'Point of connection')}</h3><p class="sub">${L('Transformador de la distribuidora y acometida.', 'Utility transformer and service drop.')}</p>
          <div class="field"><label>${L('Servicio', 'Service')}</label><select data-g="svc">${opt('svc', 'res', L('Residencial 120/240 V', 'Residential 120/240 V'))}${opt('svc', 'bt240', L('Comercial 240 V (1φ)', 'Commercial 240 V (1φ)'))}${opt('svc', 'bt480', L('Industrial 480 V (3φ)', 'Industrial 480 V (3φ)'))}</select></div>
          <div class="field"><label>${L('Transformador', 'Transformer')} (kVA)</label><input type="number" data-g="kva" value="${GS.kva}" min="10" max="5000" step="5"></div>
          <div class="field"><label>${L('Impedancia', 'Impedance')} Z (%)</label><input type="number" data-g="z" value="${GS.z}" min="1" max="10" step="0.1"></div>
          <div class="field"><label>X/R</label><input type="number" data-g="xr" value="${GS.xr}" min="0.5" max="15" step="0.1"></div>
          <div class="field"><label>${L('Acometida', 'Service drop')} (m)</label><input type="number" data-g="len" value="${GS.len}" min="1" max="500" step="1"></div>
          <div class="field"><label>${L('Calibre de acometida', 'Service-drop gauge')}</label><select data-g="awg">${window.SYS.AWG.map(a => opt('awg', a.g, a.g + ' AWG')).join('')}</select></div>
          <div class="field"><label>${L('Potencia del sistema FV', 'PV system power')} (kW CA)<small>${L('0 = usar el diseño de Inicio', '0 = use the Home design')}</small></label><input type="number" data-g="pvkw" value="${GS.pvkw}" min="0" max="5000" step="0.5"></div>
          <div class="kpis" style="margin-top:14px">${kpi(L('Corriente de cortocircuito', 'Short-circuit current'), fx(s.Isc / 1000, 2), 'kA')}${kpi(L('Potencia de cortocircuito', 'Short-circuit power'), fx(s.Ssc / 1e6, 2), 'MVA')}${kpi(L('Relación de cortocircuito', 'Short-circuit ratio'), fx(s.Ssc / 1000 / Math.max(pvKW(), 0.1), 0), '', s.Ssc / 1000 / pvKW() < 20 ? 'bad' : '')}</div>
          <div id="gVolt"></div>
          <h4>${L('Tensiones permitidas (NT‑CD, Art. 15)', 'Allowed voltages (NT‑CD, Art. 15)')}</h4>
          <div class="tscroll"><table class="t"><thead><tr><th>${L('Servicio', 'Service')}</th><th>${L('Rango normal', 'Normal range')}</th><th>${L('Extremos', 'Extremes')}</th></tr></thead><tbody>
            <tr><td>120 V</td><td class="num">114 – 126 V</td><td class="num">90 – 150 V</td></tr><tr><td>240 V</td><td class="num">228 – 252 V</td><td class="num">180 – 300 V</td></tr><tr><td>480 V</td><td class="num">456 – 504 V</td><td class="num">360 – 600 V</td></tr><tr><td>13,8 kV</td><td class="num">13,46 – 14,49 kV</td><td class="num">11,22 – 16,8 kV</td></tr><tr><td>34,5 kV</td><td class="num">33,64 – 36,23 kV</td><td class="num">27 – 42 kV</td></tr></tbody></table></div>
          <p class="note">${L('Desbalance de tensión permitido en BT y MT: hasta 3 %. Flicker (Pst, IEC 61000‑3‑7): rango normal de 0 a 1.', 'Allowed voltage unbalance in LV and MV: up to 3 %. Flicker (Pst, IEC 61000‑3‑7): normal range 0 to 1.')}</p>
        </div>
        <div class="stack">
          <div class="card"><h3>${L('Armónicos de tensión en el punto de conexión', 'Voltage harmonics at the point of connection')}</h3><p class="sub">${L('Cargas electrónicas, variadores y el inversor solar inyectan corrientes armónicas que distorsionan la tensión.', 'Electronic loads, drives and the solar inverter inject harmonic currents that distort the voltage.')}</p>
            <div class="grid g-2" style="gap:12px 24px">
              <div><div class="field"><label>${L('Carga total', 'Total load')} (kW)</label><input type="number" data-g="load" value="${GS.load}" min="0.1" max="10000" step="0.5"></div>
              <div class="field"><label>${L('Electrónica (computadoras, LED, TV)', 'Electronics (computers, LED, TV)')} (%)</label><input type="number" data-g="smps" value="${GS.smps}" min="0" max="100" step="5"></div></div>
              <div><div class="field"><label>${L('Variadores de frecuencia', 'Variable frequency drives')} (%)</label><input type="number" data-g="vfd" value="${GS.vfd}" min="0" max="100" step="5"></div>
              <div class="field"><label>${L('THD de corriente del inversor', 'Inverter current THD')} (%)<small>${L('Hoja técnica; típico < 3 %', 'Datasheet; typically < 3 %')}</small></label><input type="number" data-g="thdi" value="${GS.thdi}" min="0" max="20" step="0.5"></div>
              <div class="field"><label>${L('Distorsión previa de la red', 'Background grid distortion')} (%)</label><input type="number" data-g="bg" value="${GS.bg}" min="0" max="8" step="0.1"></div></div>
            </div>
            ${chartBox('gHar', 'h300', 'armonicos-tension')}<div class="kpis" id="gHarK" style="margin-top:12px"></div><div id="gHarA"></div>
          </div>
          <div class="card"><h3>${L('Arranque de motores', 'Motor starting')}</h3><p class="sub">${L('Al arrancar, un motor pide varias veces su corriente nominal y la tensión cae por un instante: las luces parpadean y otros equipos pueden fallar.', 'When starting, a motor draws several times its rated current and the voltage dips for a moment: lights flicker and other equipment may fail.')}</p>
            <div class="grid g-2" style="gap:12px 24px">
              <div><div class="field"><label>${L('Potencia del motor', 'Motor power')} (HP)</label><input type="number" data-g="mhp" value="${GS.mhp}" min="0.25" max="1000" step="0.25"></div>
              <div class="field"><label>${L('Método de arranque', 'Starting method')}</label><select data-g="method">${Object.entries(METHODS).map(([k, m]) => opt('method', k, L(m.es, m.en))).join('')}</select></div></div>
              <div><div class="field"><label>${L('Arranques por hora', 'Starts per hour')}</label><input type="number" data-g="starts" value="${GS.starts}" min="0" max="120" step="1"></div></div>
            </div>
            <div class="kpis" id="gMotK" style="margin-top:12px"></div><div id="gMotA"></div>
            <div style="margin-top:14px">${chartBox('gMot', 'h260', 'arranque-motores')}</div>
          </div>
        </div>
      </div>
      <p class="note">${L('Supuestos: red aguas arriba del transformador como barra infinita; espectros armónicos típicos de cada tipo de carga; suma de armónicos con los exponentes de IEC 61000‑3‑6. Los límites son los de la Norma Técnica de Calidad de Distribución (CREE, La Gaceta No. 34,491, 2017).', 'Assumptions: grid upstream of the transformer as an infinite bus; typical harmonic spectra for each load type; harmonic summation with IEC 61000‑3‑6 exponents. Limits are those of the Distribution Quality Technical Standard (CREE, La Gaceta No. 34,491, 2017).')}</p>`;
    $('p-grid').querySelectorAll('[data-g]').forEach(el => el.onchange = () => { const k = el.dataset.g; GS[k] = el.tagName === 'SELECT' ? el.value : +el.value; if (k === 'svc') { if (GS.svc === 'bt480') { GS.kva = Math.max(GS.kva, 300); GS.z = 5.75; GS.xr = 6; } else { GS.kva = Math.min(GS.kva, 100); GS.z = 2.5; GS.xr = 2.5; } } EXT.grid(); });
    A().bindExports($('p-grid'));
    draw(s);
  };
  function draw(s) {
    const { kpi, css } = A();
    // elevación de tensión por exportación
    const Pex = pvExport() * 1000, dV = Pex * s.R / (s.k * s.k * s.Vph * s.Vph) * 100 * (s.ph3 ? 3 : 1) / (s.ph3 ? 3 : 1);
    const dVp = Pex / (s.ph3 ? 3 : 1) * s.R / (s.Vph * s.Vph) * 100;
    const Vnom = s.ph3 ? 480 : 240, worst = 1.03 * (1 + dVp / 100);
    $('gVolt').innerHTML = `<div class="kpis" style="margin-top:12px">${kpi(L('Exportación máxima', 'Maximum export'), fx(Pex / 1000, 2), 'kW')}${kpi(L('Elevación de tensión', 'Voltage rise'), fx(dVp, 2), '%', dVp > 2 ? 'bad' : 'ok')}${kpi(L('Tensión con red al 103 %', 'Voltage with grid at 103 %'), fx(Vnom * worst, 1), 'V', worst > 1.05 ? 'bad' : 'ok')}</div>
      ${worst > 1.05 ? `<div class="alert bad">${L('Con la red alta al mediodía, la exportación solar puede sacar la tensión del rango normal (+5 %). Usa un conductor más grueso, un transformador mayor o la función volt‑watt del inversor.', 'With a high grid at noon, solar export can push the voltage out of the normal range (+5 %). Use a thicker conductor, a larger transformer or the inverter volt‑watt function.')}</div>` : ''}`;
    // armónicos
    const H = harmonics(s);
    const xs = H.rows.map((_, i) => i + 1);
    window.CHART.draw($('gHar'), { xs, xmin: 0.5, xmax: H.rows.length + 0.5, xticks: H.rows.map((r, i) => ({ x: i + 1, label: 'h' + r.h })), series: [{ type: 'bar', ys: H.rows.map(r => r.Dh), color: css('--s1'), bw: 0.36, off: -0.19, label: L('Distorsión estimada', 'Estimated distortion') }, { type: 'bar', ys: H.rows.map(r => r.lim), color: css('--s6'), bw: 0.36, off: 0.19, label: L('Límite NT‑CD', 'NT‑CD limit') }], xl: L('Orden armónico', 'Harmonic order'), yl: '% V₁', ymaxL: Math.max(6.5, ...H.rows.map(r => r.Dh)) * 1.08 });
    const over = H.rows.filter(r => r.Dh > r.lim);
    $('gHarK').innerHTML = kpi(L('THD de tensión', 'Voltage THD'), fx(H.THD, 2), '%', H.THD > NT_THD ? 'bad' : 'ok') + kpi(L('Límite THD (BT/MT)', 'THD limit (LV/MV)'), NT_THD, '%') + kpi(L('Indicador X₄ (Art. 13)', 'Indicator X₄ (Art. 13)'), fx(H.X4, 2), '', H.X4 > 0 ? 'bad' : 'ok') + kpi(L('Corriente del inversor', 'Inverter current'), fx(H.Ipv, 1), 'A');
    $('gHarA').innerHTML = over.length || H.THD > NT_THD ? `<div class="alert bad">${L(`Se exceden los límites en ${over.map(r => 'h' + r.h).join(', ') || 'THD'}. Opciones: filtros pasivos o activos, reactores de línea en los variadores o un transformador con menor impedancia.`, `Limits are exceeded at ${over.map(r => 'h' + r.h).join(', ') || 'THD'}. Options: passive or active filters, line reactors on the drives or a lower-impedance transformer.`)}</div>` : `<div class="alert ok">${L('Las armónicas estimadas están dentro de los límites de la norma (indicador X₄ = 0).', 'Estimated harmonics are within the standard limits (indicator X₄ = 0).')}</div>`;
    // motores
    const mo = motor(s), inv = EXT.homeState && EXT.homeState().calc ? EXT.homeState().calc.inv : null;
    $('gMotK').innerHTML = kpi(L('Corriente nominal', 'Rated current'), fx(mo.In, 1), 'A') + kpi(L('Corriente de arranque', 'Starting current'), fx(mo.Ist, 0), 'A') + kpi(L('Potencia de arranque', 'Starting power'), fx(mo.Sst / 1000, 1), 'kVA') + kpi(L('Caída de tensión', 'Voltage dip'), fx(mo.dV, 1), '%', mo.dV > 10 ? 'bad' : mo.dV > 5 ? 'warn' : 'ok');
    const msgs = [];
    if (mo.dV > 10) msgs.push(['bad', L('Caída mayor al 10 %: puede apagar contactores y equipos electrónicos. Usa un arrancador suave o un variador.', 'Dip above 10 %: it may drop out contactors and electronics. Use a soft starter or a drive.')]);
    else if (mo.dV > 5) msgs.push(['warn', L('Caída entre 5 % y 10 %: la tensión sale momentáneamente del rango normal y las luces parpadean.', 'Dip between 5 % and 10 %: voltage briefly leaves the normal range and lights flicker.')]);
    else msgs.push(['ok', L('La caída de tensión queda dentro del rango normal (±5 %).', 'The voltage dip stays within the normal range (±5 %).')]);
    if (mo.dV > 3 && GS.starts >= 10) msgs.push(['warn', L('Arranques frecuentes con caídas mayores al 3 % pueden producir flicker molesto (Pst > 1). La NT‑CD (Art. 32) exige autorización previa de la distribuidora para motores que arrancan y paran continuamente.', 'Frequent starts with dips above 3 % can cause annoying flicker (Pst > 1). NT‑CD (Art. 32) requires prior utility authorization for motors that start and stop continuously.')]);
    if (inv && inv.type === 'hybrid') msgs.push([mo.Sst / 1000 > 2 * inv.Paco / 1000 ? 'bad' : 'ok', L(`En modo respaldo (sin red), el inversor ${inv.name.split(' (')[0]} debe entregar ${fx(mo.Sst / 1000, 1)} kVA de arranque; capacidad de sobrecarga típica ≈ 2 × ${fx(inv.Paco / 1000, 1)} kW (verifica la hoja técnica).`, `In backup mode (no grid), the ${inv.name.split(' (')[0]} inverter must deliver ${fx(mo.Sst / 1000, 1)} kVA at start; typical surge capacity ≈ 2 × ${fx(inv.Paco / 1000, 1)} kW (check the datasheet).`)]);
    $('gMotA').innerHTML = msgs.map(([c, t]) => `<div class="alert ${c}">${t}</div>`).join('');
    const ks = Object.keys(METHODS), dv = ks.map(k => motor(s, k).dV), xs2 = ks.map((_, i) => i + 1);
    window.CHART.draw($('gMot'), { xs: xs2, xmin: 0.5, xmax: ks.length + 0.5, xticks: ks.map((k, i) => ({ x: i + 1, label: L(METHODS[k].es, METHODS[k].en).replace(' de frecuencia', '').replace(' (DOL)', '') })), series: [{ type: 'bar', ys: dv, color: css('--s2'), bw: 0.5, label: L('Caída de tensión al arrancar', 'Voltage dip at start') }, { ys: xs2.map(() => 5), color: css('--s6'), dash: [5, 5], w: 1.3, label: L('Límite del rango normal (5 %)', 'Normal range limit (5 %)') }], xl: '', yl: '%', ymaxL: Math.max(6, ...dv) * 1.1 });
  }
})();
