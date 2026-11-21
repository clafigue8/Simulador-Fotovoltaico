/* =====================================================================
   Normativa e instalación: ley de Honduras, montaje 3D, diagrama unifilar,
   dimensionamiento de protecciones y conductores, y equipos sugeridos
   ===================================================================== */
(function () {
  'use strict';
  const EXT = window.PAGES_EXT = window.PAGES_EXT || {};
  const A = () => window.APP, L = (es, en) => A().L(es, en), $ = id => document.getElementById(id), fx = (x, d) => A().fx(x, d);
  const BRK = [15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 110, 125, 150, 175, 200, 225, 250, 300, 350, 400, 450, 500, 600, 800, 1000, 1200];
  const EGC = [[15, '14'], [20, '12'], [60, '10'], [100, '8'], [200, '6'], [300, '4'], [400, '3'], [500, '2'], [600, '1'], [800, '1/0'], [1000, '2/0'], [1200, '3/0']];   // NEC 250.122
  const AWG = [['14', 15], ['12', 20], ['10', 30], ['8', 50], ['6', 65], ['4', 85], ['3', 100], ['2', 115], ['1', 130], ['1/0', 150], ['2/0', 175], ['3/0', 200], ['4/0', 230], ['250 kcmil', 255], ['350 kcmil', 310], ['500 kcmil', 380]];  // NEC 310.16, Cu 75 °C (14–10 AWG limitados por NEC 240.4(D))
  const MM2 = { '14': 2.08, '12': 3.31, '10': 5.26, '8': 8.37, '6': 13.3, '4': 21.2, '3': 26.7, '2': 33.6, '1': 42.4, '1/0': 53.5, '2/0': 67.4, '3/0': 85, '4/0': 107, '250 kcmil': 127, '350 kcmil': 177, '500 kcmil': 253 };
  const brk = I => BRK.find(b => b >= I) || BRK[BRK.length - 1];
  const awgFor = I => { for (const [g, a] of AWG) if (a >= I) return g; return '500 kcmil'; };
  const egc = I => (EGC.find(([a]) => I <= a) || EGC[EGC.length - 1])[1];

  /* ---------- Dimensionamiento eléctrico (criterios NEC 690 / 705 / 250) ---------- */
  function design(c) {
    const m = c.m, inv = c.inv, micro = inv.type === 'micro', ph3 = inv.ph === 3;
    const Isc = m.Isc, I156 = 1.56 * Isc;                                // NEC 690.8: 1,25 × 1,25 × Isc
    const s = c.strings || { s: c.perInv, ns: 1, VocC: (m.Voc + m.bV * (c.Tmin - 27)) * c.perInv };
    const VocMax = micro ? m.Voc + m.bV * (c.Tmin - 27) : s.VocC;
    const strPar = micro ? 0 : s.ns;
    const fuse = strPar >= 3 ? Math.max(15, Math.ceil(I156 / 5) * 5) : 0;    // NEC 690.9: fusibles con 3 o más strings en paralelo
    const dcAwg = awgFor(I156 * (strPar >= 3 ? 1 : 1));
    const Iac = ph3 ? inv.Paco / (Math.sqrt(3) * inv.Vac) : inv.Paco / inv.Vac;
    const IacTot = Iac * c.nInv;
    let branch = null;
    if (micro) { const per = Math.floor(16 / Iac); branch = { per, n: Math.ceil(c.n / per) }; }
    const ocpd = micro ? 20 : brk(1.25 * Iac);                            // NEC 690.9 / 705.12
    const acAwg = awgFor(ocpd), mainOcpd = brk(1.25 * IacTot), mainAwg = awgFor(mainOcpd);
    const SPDdc = Math.ceil(VocMax * 1.2 / 50) * 50, SPDac = (ph3 ? 320 : 275);
    return { micro, ph3, Isc, I156, VocMax, strPar, s, fuse, dcAwg, Iac, IacTot, ocpd, acAwg, mainOcpd, mainAwg, branch, SPDdc, SPDac, egcAc: egc(ocpd), egcMain: egc(mainOcpd), dcIso: { V: Math.ceil(VocMax / 100) * 100 + (VocMax > 600 ? 0 : 0), I: Math.ceil(I156 * Math.max(1, strPar) / 5) * 5 } };
  }

  /* ---------- Equipos sugeridos ---------- */
  function brands() {
    return {
      panels: [
        ['AIKO', L('Neostar / Z Series (ABC, 54 celdas)', 'Neostar / Z Series (ABC, 54 cells)'), L('hasta ≈ 500 W · 25,0 %', 'up to ≈ 500 W · 25.0 %')],
        ['Trina Solar', 'Vertex S+ G3', L('hasta ≈ 515 W · 24,7 %', 'up to ≈ 515 W · 24.7 %')],
        ['LONGi', 'Hi‑MO X10 (HPBC 2.0)', L('≈ 495–500 W · 24,3–24,5 %', '≈ 495–500 W · 24.3–24.5 %')],
        ['JinkoSolar', 'Tiger Neo 3.0 (N‑type TOPCon)', L('≈ 490–520 W · 24,0–24,5 %', '≈ 490–520 W · 24.0–24.5 %')],
        ['JA Solar · Canadian Solar', 'DeepBlue · TOPBiHiKu', L('también son fabricantes de primer nivel; consulta la ficha vigente', 'also tier‑1 manufacturers; check the current datasheet')]
      ],
      bos: [
        [L('Cable solar CC', 'DC solar cable'), L('Cobre estañado con doble aislamiento: H1Z2Z2‑K (EN 50618) o PV Wire (UL 4703), 1 500 V CC, resistente a UV', 'Tinned copper, double insulated: H1Z2Z2‑K (EN 50618) or PV Wire (UL 4703), 1,500 V DC, UV resistant'), 'Prysmian, Nexans, Lapp, Helukabel'],
        [L('Conectores', 'Connectors'), L('MC4 originales de la misma marca en ambos lados (no mezclar marcas)', 'Genuine MC4 of the same brand on both sides (do not mix brands)'), 'Stäubli (MC4), Amphenol'],
        [L('Fusibles CC', 'DC fuses'), L('Tipo gPV (IEC 60269‑6), 1 000–1 500 V CC, en portafusibles seccionables', 'gPV type (IEC 60269‑6), 1,000–1,500 V DC, in disconnectable holders'), 'Mersen, Littelfuse, Eaton Bussmann'],
        [L('Seccionador CC', 'DC isolator'), L('Interruptor‑seccionador CC bajo carga (IEC 60947‑3, DC‑PV2)', 'DC load-break switch-disconnector (IEC 60947‑3, DC‑PV2)'), 'ABB, Schneider Electric, Santon'],
        [L('Protección contra sobretensiones', 'Surge protection'), L('DPS tipo 2 en CC (IEC 61643‑31) y en CA (IEC 61643‑11)', 'Type 2 SPD on DC (IEC 61643‑31) and AC (IEC 61643‑11)'), 'DEHN, Phoenix Contact, Citel, OBO'],
        [L('Interruptor CA y diferencial', 'AC breaker and RCD'), L('Termomagnético para la salida del inversor; diferencial tipo A o B según el inversor', 'Thermal-magnetic breaker for the inverter output; type A or B RCD per inverter'), 'Schneider Electric, ABB, Siemens, Eaton'],
        [L('Cable CA', 'AC cable'), L('THHN/THWN‑2 en tubería (conduit) EMT o PVC', 'THHN/THWN‑2 in EMT or PVC conduit'), 'Phelps Dodge, Viakon, Southwire'],
        [L('Puesta a tierra', 'Grounding'), L('Varilla copperweld de 5/8" × 8 pies, conductor de cobre desnudo y unión equipotencial de marcos y estructura', '5/8" × 8 ft copper-clad rod, bare copper conductor and bonding of frames and racking'), 'Erico (nVent), Galvan'],
        [L('Estructura', 'Racking'), L('Aluminio anodizado y tornillería de acero inoxidable', 'Anodized aluminum and stainless-steel hardware'), 'K2 Systems, IronRidge, Unirac, Schletter'],
        [L('Monitoreo y medición', 'Monitoring and metering'), L('Monitoreo del inversor por Wi‑Fi; medidor bidireccional instalado según el RLGIE, Art. 50', 'Inverter Wi‑Fi monitoring; bidirectional meter installed per RLGIE, Art. 50'), L('del fabricante del inversor; medidor: la distribuidora', 'inverter manufacturer; meter: the utility')]
      ]
    };
  }

  /* ---------- Página ---------- */
  /* ---------- Páginas ---------- */
  function page(id, title, sub, kind) {
    const st = EXT.homeState && EXT.homeState();
    $(id).innerHTML = `<div class="intro"><h2>${title}</h2><p>${sub}</p></div><div id="${id}-b"><p class="note">${L('Calculando…', 'Computing…')}</p></div>`;
    const go = () => { const c = EXT.homeState().calc || EXT.homeCompute(); render(c, kind, id + '-b'); };
    if (st && st.calc) go(); else A().loadTmy().then(go);
  }
  EXT.mount = () => page('p-mount', L('Montaje e instalación', 'Mounting and installation'), L('Cómo quedaría montado el sistema que diseñaste en Inicio: equipos, recorrido de la energía, protecciones y conductores.', 'How the system you designed on Home would be installed: equipment, energy path, protections and conductors.'), 'mount');
  EXT.install = () => page('p-install', L('Normativa y equipos', 'Regulations and equipment'), L('Lo que exige la ley hondureña para tu sistema y los equipos sugeridos para instalarlo.', 'What Honduran law requires for your system and suggested equipment to install it.'), 'law');
  let sc3 = null;
  function render(c, kind, target) {
    const d = design(c), b = brands(), esc = A().esc, kpi = A().kpi, inv = c.inv;
    if (kind === 'mount') {
      $(target).innerHTML = `
      <div class="card"><div class="chead"><div><h3>${L('Montaje del sistema en 3D', 'System installation in 3D')}</h3><p class="sub">${L('Recorrido de la energía: paneles → caja de protecciones CC → inversor → protecciones CA → tablero → medidor bidireccional → red de la ENEE.', 'Energy path: panels → DC protection box → inverter → AC protections → panelboard → bidirectional meter → ENEE grid.')}</p></div></div>
        <div class="inst3d"><div id="inst3d" class="c3d"></div><p class="hint">${L('Arrastra para girar · rueda o pellizco para acercar', 'Drag to rotate · scroll or pinch to zoom')}</p></div></div>
      <div class="card" style="margin-top:24px"><h3>${L('Diagrama unifilar', 'Single-line diagram')}</h3><p class="sub">${L('Protecciones y conductores calculados con los criterios del NEC (NFPA 70), artículos 690, 705 y 250.', 'Protections and conductors sized with NEC (NFPA 70) criteria, articles 690, 705 and 250.')}</p><div style="overflow-x:auto" id="sld2"></div></div>
      <div class="grid g-2" style="margin-top:24px">
        <div class="card"><h3>${L('Protecciones y conductores', 'Protections and conductors')}</h3><div class="tscroll"><table class="t"><thead><tr><th>${L('Elemento', 'Element')}</th><th>${L('Especificación', 'Specification')}</th></tr></thead><tbody>
          ${d.micro ? `<tr><td>${L('Circuitos de microinversores', 'Microinverter branch circuits')}</td><td>${d.branch.n} × ${L('hasta', 'up to')} ${d.branch.per} ${L('micros por circuito de 20 A', 'micros per 20 A circuit')}</td></tr>` : `<tr><td>${L('Strings', 'Strings')}</td><td>${c.nInv} ${L('inversor(es)', 'inverter(s)')} × ${d.s.ns} × ${d.s.s} ${L('paneles', 'panels')}</td></tr>
          <tr><td>${L('Voltaje máximo del string (frío)', 'Maximum string voltage (cold)')}</td><td>${fx(d.VocMax, 0)} V ${L('≤', '≤')} ${fx(inv.Vdcmax, 0)} V</td></tr>
          <tr><td>${L('Corriente de diseño CC (1,56 × I<sub>sc</sub>)', 'DC design current (1.56 × I<sub>sc</sub>)')}</td><td>${fx(d.I156, 1)} A</td></tr>
          <tr><td>${L('Cable solar CC', 'DC solar cable')}</td><td>${d.dcAwg} AWG (${MM2[d.dcAwg]} mm²) PV Wire / H1Z2Z2‑K</td></tr>
          <tr><td>${L('Fusibles de string', 'String fuses')}</td><td>${d.fuse ? `gPV ${d.fuse} A, 1000 V` : L('No requeridos (menos de 3 strings en paralelo)', 'Not required (fewer than 3 parallel strings)')}</td></tr>
          <tr><td>${L('Seccionador CC', 'DC isolator')}</td><td>≥ ${fx(d.dcIso.V, 0)} V · ≥ ${d.dcIso.I} A</td></tr>
          <tr><td>${L('DPS CC', 'DC SPD')}</td><td>${L('Tipo 2', 'Type 2')}, U<sub>cpv</sub> ≥ ${d.SPDdc} V</td></tr>`}
          <tr><td>${L('Corriente máxima CA por inversor', 'Maximum AC current per inverter')}</td><td>${fx(d.Iac, 1)} A ${d.ph3 ? '(3φ)' : ''}</td></tr>
          <tr><td>${L('Interruptor CA del inversor', 'Inverter AC breaker')}</td><td>${d.ocpd} A ${d.ph3 ? '3P' : '2P'}</td></tr>
          <tr><td>${L('Cable CA', 'AC cable')}</td><td>${d.acAwg} AWG THHN/THWN‑2 · ${L('tierra', 'ground')} ${d.egcAc} AWG</td></tr>
          <tr><td>${L('Corriente CA total del sistema', 'Total system AC current')}</td><td>${fx(d.IacTot, 1)} A</td></tr>
          <tr><td>${L('Interruptor de conexión en el tablero', 'Interconnection breaker at panelboard')}</td><td>${d.mainOcpd} A · ${L('cable', 'cable')} ${d.mainAwg} AWG · ${L('regla del 120 % de la barra (NEC 705.12)', '120 % busbar rule (NEC 705.12)')}</td></tr>
          <tr><td>${L('DPS CA', 'AC SPD')}</td><td>${L('Tipo 2', 'Type 2')}, U<sub>c</sub> ≥ ${d.SPDac} V</td></tr>
          <tr><td>${L('Puesta a tierra', 'Grounding')}</td><td>${L('Varilla 5/8" × 8 pies, conductor', '5/8" × 8 ft rod, conductor')} ${d.egcMain} AWG</td></tr>
        </tbody></table></div><p class="note">${L('Valores orientativos para un anteproyecto. El diseño final debe verificar las fichas técnicas (fusible máximo en serie del módulo, corrientes del inversor) y lo firma un ingeniero electricista colegiado.', 'Indicative values for a preliminary design. The final design must check the datasheets (module maximum series fuse, inverter currents) and be signed by a licensed electrical engineer.')}</p></div>
        <div class="card"><h3>${L('Resumen del sistema', 'System summary')}</h3><div class="kpis">${kpi(L('Paneles', 'Panels'), c.n)}${kpi(L('Potencia', 'Power'), fx(c.kWp, 2), 'kWp')}${kpi(L('Inversor', 'Inverter'), c.nInv + ' ×', esc(inv.name.split(' (')[0]))}${kpi(L('Potencia CA', 'AC power'), fx(c.kWac, 2), 'kW')}</div>
          <p class="note">${L('Para cambiar el diseño, vuelve a Inicio. Las marcas sugeridas y la revisión legal están en la última pestaña.', 'To change the design, go back to Home. Suggested brands and the legal review are in the last tab.')}</p><div class="btns" style="margin-top:12px"><button class="btn" data-go3="home">${L('← Cambiar el diseño', '← Change the design')}</button><button class="btn pri" data-go3="install">${L('Normativa y equipos →', 'Regulations and equipment →')}</button></div></div>
      </div>`;
      $(target).querySelectorAll('[data-go3]').forEach(x => x.onclick = () => A().go(x.dataset.go3));
      drawSLD(c, d); init3d(c, d); return;
    }
    const law = EXT.lawChecks(c);
    const okN = law.filter(x => !x.info && x.ok).length, totN = law.filter(x => !x.info).length;
    $(target).innerHTML = `
      <div class="card"><div class="chead"><div><h3>${L('Lo que dice la ley en Honduras', 'What Honduran law says')}</h3><p class="sub">${L('Usuarios autoproductores conectados a la red de distribución.', 'Self-generating users connected to the distribution network.')}</p></div>${totN ? `<span class="badge ${okN === totN ? 'ok' : 'bad'}">${okN}/${totN} ${L('requisitos cumplidos', 'requirements met')}</span>` : ''}</div>
        <ul class="checks cols2">${law.map(x => `<li class="${x.info ? 'info' : x.ok ? 'ok' : x.warn ? 'warn' : 'bad'}"><i>${x.info ? 'i' : x.ok ? '✓' : '!'}</i><div><b>${x.t}</b><span>${x.d}</span></div></li>`).join('')}</ul></div>
      <div class="grid g-2" style="margin-top:24px">
        <div class="card" style="grid-column:1/-1"><h3>${L('Paneles de última generación (2026)', 'Latest-generation panels (2026)')}</h3><p class="sub">${L('Modelos de fabricantes de primer nivel según publicaciones de 2026; las cifras varían entre fuentes, verifica la ficha técnica.', 'Tier‑1 manufacturer models according to 2026 publications; figures vary between sources, check the datasheet.')}</p>
          <table class="t"><thead><tr><th>${L('Marca', 'Brand')}</th><th>${L('Modelo', 'Model')}</th><th>${L('Potencia · eficiencia', 'Power · efficiency')}</th></tr></thead><tbody>${b.panels.map(r => `<tr><td><b>${r[0]}</b></td><td style="text-align:left;white-space:normal">${r[1]}</td><td style="white-space:normal">${r[2]}</td></tr>`).join('')}</tbody></table>
          <p class="note">${L('Los módulos de la simulación detallada vienen de la base de datos CEC (2019) porque incluyen los parámetros verificados de hoja técnica; los de esta tabla son las versiones actuales del mercado.', 'Modules in the detailed simulation come from the CEC database (2019) because it includes verified datasheet parameters; the ones in this table are current market versions.')}</p></div>
      </div>
      <div class="card" style="margin-top:24px"><h3>${L('Cableado, protecciones y demás dispositivos', 'Wiring, protections and other devices')}</h3><div class="tscroll"><table class="t"><thead><tr><th>${L('Dispositivo', 'Device')}</th><th style="text-align:left">${L('Qué pedir', 'What to ask for')}</th><th style="text-align:left">${L('Marcas de referencia', 'Reference brands')}</th></tr></thead><tbody>${b.bos.map(r => `<tr><td><b>${r[0]}</b></td><td style="text-align:left;white-space:normal">${r[1]}</td><td style="text-align:left;white-space:normal">${r[2]}</td></tr>`).join('')}</tbody></table></div></div>`;
  }

  /* ---------- Diagrama unifilar (SVG) ---------- */
  function drawSLD(c, d) {
    const esc = A().esc, m = c.m, inv = c.inv, short = s => s.replace(/Co\., Ltd\.|Inc\.|Green Energy Technology|Solar /g, '').trim();
    const W = 1320, H = 330, y = 150;
    let h = `<svg viewBox="-60 0 ${W + 60} ${H}" width="${W + 60}" style="min-width:1140px;width:100%;height:auto;font-family:var(--sans)" role="img" aria-label="${L('Diagrama unifilar', 'Single-line diagram')}">`;
    const T = (x, yy, t, o = {}) => `<text x="${x}" y="${yy}" text-anchor="${o.a || 'middle'}" font-size="${o.s || 12.5}" font-weight="${o.w || 500}" fill="${o.c || 'var(--ink)'}">${t}</text>`;
    const line = (x1, x2, col = 'var(--ink2)', dash = '') => `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${col}" stroke-width="2.2" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
    // arreglo FV
    h += `<g>${[0, 1, 2].map(i => `<rect x="${20 + i * 10}" y="${y - 40 + i * 10}" width="70" height="50" rx="3" fill="var(--surface)" stroke="var(--s4)" stroke-width="2"/><line x1="${20 + i * 10}" y1="${y - 40 + i * 10}" x2="${90 + i * 10}" y2="${y + 10 + i * 10}" stroke="var(--s4)"/>`).join('')}</g>`;
    h += T(65, y - 62, L('Arreglo FV', 'PV array'), { w: 700, s: 14 }) + T(65, y + 82, `${c.n} × ${esc(short(m.name))}`, { s: 11, w: 600 }) + T(65, y + 98, `${fx(c.kWp, 2)} kWp`, { s: 11.5, c: 'var(--muted)' });
    h += T(65, y + 114, d.micro ? L('1 microinversor por panel', '1 microinverter per panel') : `${c.nInv > 1 ? c.nInv + ' × ' : ''}${d.s.ns} × ${d.s.s} ${L('en serie', 'in series')}`, { s: 11.5, c: 'var(--muted)' });
    let x = 125;
    const cab = (x1, x2, t1, t2, col) => line(x1, x2, col) + T((x1 + x2) / 2, y - 10, t1, { s: 11, c: 'var(--muted)' }) + (t2 ? T((x1 + x2) / 2, y + 22, t2, { s: 11, c: 'var(--muted)' }) : '');
    const boxEl = (x0, w, title, lines, col) => `<rect x="${x0}" y="${y - 45}" width="${w}" height="90" rx="8" fill="var(--surface2)" stroke="${col}" stroke-width="2"/>` + T(x0 + w / 2, y - 22, title, { w: 700, s: 13 }) + lines.map((t, i) => T(x0 + w / 2, y + i * 16, t, { s: 11.5, c: 'var(--muted)' })).join('');
    if (!d.micro) {
      h += cab(x, 200, L('CC +/−', 'DC +/−'), `${d.dcAwg} AWG PV`, 'var(--s2)');
      h += boxEl(200, 150, L('Caja de CC', 'DC box'), [d.fuse ? `gPV ${d.fuse} A` : L('sin fusibles', 'no fuses'), `DPS CC ${d.SPDdc} V`, `${L('Seccionador', 'Isolator')} ${d.dcIso.I} A`], 'var(--s2)');
      h += cab(350, 420, L('CC', 'DC'), `${fx(d.VocMax, 0)} V máx.`, 'var(--s2)');
    } else h += cab(x, 420, L('CA (cable troncal)', 'AC (trunk cable)'), `${d.branch.n} × 20 A`, 'var(--s1)');
    h += boxEl(420, 180, L('Inversor', 'Inverter'), [`${c.nInv} × ${esc(inv.name.split(' (')[0])}`, `${fx(c.kWac, 2)} kW · ${inv.Vac} V${d.ph3 ? ' 3φ' : ''}`, L('anti‑isla · MPPT', 'anti‑islanding · MPPT')], 'var(--s5)');
    // símbolo de inversor
    h += `<g transform="translate(588,${y - 40})"><rect width="0" height="0"/></g>`;
    h += cab(600, 680, L('CA', 'AC'), `${d.acAwg} AWG`, 'var(--s1)');
    h += boxEl(680, 150, L('Protección CA', 'AC protection'), [`${L('Interruptor', 'Breaker')} ${d.ocpd} A ${d.ph3 ? '3P' : '2P'}`, `DPS CA ${d.SPDac} V`, L('Seccionador visible', 'Visible disconnect')], 'var(--s1)');
    h += cab(830, 900, L('CA', 'AC'), `${d.mainAwg} AWG`, 'var(--s1)');
    h += boxEl(900, 150, L('Tablero principal', 'Main panelboard'), [`${L('Interruptor FV', 'PV breaker')} ${d.mainOcpd} A`, L('Cargas de la casa', 'Building loads'), L('Barra de tierra', 'Ground bar')], 'var(--s3)');
    h += cab(1050, 1110, '', '', 'var(--s1)');
    // medidor
    h += `<circle cx="1135" cy="${y}" r="25" fill="var(--surface2)" stroke="var(--ink2)" stroke-width="2"/>` + T(1135, y + 5, 'kWh', { w: 700, s: 12 }) + T(1135, y - 36, L('Medidor', 'Meter'), { w: 700, s: 13 }) + T(1135, y + 44, L('bidireccional', 'bidirectional'), { s: 11.5, c: 'var(--muted)' }) + T(1135, y + 60, 'RLGIE Art. 50', { s: 11, c: 'var(--muted)' });
    h += line(1160, 1215, 'var(--s1)');
    // transformador
    h += `<circle cx="1235" cy="${y - 10}" r="18" fill="none" stroke="var(--ink2)" stroke-width="2"/><circle cx="1235" cy="${y + 12}" r="18" fill="none" stroke="var(--ink2)" stroke-width="2"/>` + T(1235, y - 42, L('Red ENEE', 'ENEE grid'), { w: 700, s: 13 }) + T(1235, y + 50, d.ph3 ? '480 V 3φ' : '120/240 V', { s: 11.5, c: 'var(--muted)' }) + T(1235, y + 66, '13,8 kV', { s: 11.5, c: 'var(--muted)' });
    h += `<line x1="1235" y1="${y - 28}" x2="1235" y2="${y - 34}" stroke="var(--ink2)" stroke-width="2"/>`;
    // tierra
    h += `<line x1="65" y1="${y + 125}" x2="975" y2="${y + 125}" stroke="var(--s3)" stroke-width="1.6" stroke-dasharray="6 4"/>` + [65, 275, 510, 755, 975].map(xx => `<line x1="${xx}" y1="${y + (xx === 65 ? 118 : 45)}" x2="${xx}" y2="${y + 125}" stroke="var(--s3)" stroke-width="1.4" stroke-dasharray="4 3"/>`).join('');
    h += `<g transform="translate(975,${y + 125})"><line x1="0" y1="0" x2="0" y2="22" stroke="var(--s3)" stroke-width="2"/><line x1="-14" y1="22" x2="14" y2="22" stroke="var(--s3)" stroke-width="2"/><line x1="-9" y1="28" x2="9" y2="28" stroke="var(--s3)" stroke-width="2"/><line x1="-4" y1="34" x2="4" y2="34" stroke="var(--s3)" stroke-width="2"/></g>`;
    h += T(520, y + 145, L(`Puesta a tierra y unión equipotencial · conductor ${d.egcMain} AWG · varilla 5/8" × 8 pies`, `Grounding and bonding · ${d.egcMain} AWG conductor · 5/8" × 8 ft rod`), { s: 11.5, c: 'var(--s3)' });
    h += '</svg>';
    $('sld2').innerHTML = h;
  }

  /* ---------- Montaje 3D ---------- */
  function init3d(c, d) {
    const el = $('inst3d'); if (!el) return;
    if (!window.THREE || !window.SCENE3D) return;
    try { if (sc3) sc3.dispose(); sc3 = window.SCENE3D.createInstall(el); sc3.build(c, d, labels(c, d)); }
    catch (e) { el.innerHTML = `<p class="note" style="padding:20px">${L('Tu navegador no admite WebGL para la vista 3D.', 'Your browser does not support WebGL for the 3D view.')}</p>`; }
  }
  function labels(c, d) {
    const short = s => s.replace(/Co\., Ltd\.|Inc\.|Green Energy Technology|Solar /g, '').trim();
    const H = EXT.homeState().HOME, m = c.m;
    let pw, ph; if (m.W && m.H) { pw = m.W; ph = m.H; } else { const r = m.Ns === 36 ? 0.67 / 1.48 : m.Ns === 60 ? 0.99 / 1.65 : 0.99 / 1.96; ph = Math.sqrt(m.A / r); pw = m.A / ph; }
    const geo = { kind: H.kind, pw, ph, tilt: H.tilt, n: c.n };
    if (c.farm) return { ...geo,
      panels: `${fx(c.n, 0)} × ${short(m.name)} · ${fx(c.kWp / 1000, 2)} MWp`,
      dc: `${L('Cajas de strings', 'String combiner boxes')}: ${d.fuse ? 'gPV ' + d.fuse + ' A · ' : ''}DPS`,
      inv: `${c.nInv} × ${c.inv.name.split(' (')[0]}`,
      ac: `${L('Protección CA de baja tensión', 'Low-voltage AC protection')}`,
      panel: L('Centro de transformación BT/MT', 'LV/MV transformer station'),
      meter: L('Medición en media tensión', 'Medium-voltage metering'),
      grid: L('Red ENEE (34,5 kV)', 'ENEE grid (34.5 kV)'),
      ground: L('Malla de tierra', 'Grounding grid'), micro: false };
    return { ...geo,
      panels: `${c.n} × ${short(c.m.name)} · ${fx(c.kWp, 1)} kWp`,
      dc: d.micro ? null : `${L('Caja CC', 'DC box')}: ${d.fuse ? 'gPV ' + d.fuse + ' A · ' : ''}DPS · ${L('seccionador', 'isolator')}`,
      inv: `${c.nInv} × ${c.inv.name.split(' (')[0]}`,
      ac: `${L('Protección CA', 'AC protection')}: ${d.ocpd} A · DPS`,
      panel: `${L('Tablero', 'Panelboard')}: ${L('interruptor FV', 'PV breaker')} ${d.mainOcpd} A`,
      meter: L('Medidor bidireccional', 'Bidirectional meter'),
      grid: L('Red ENEE', 'ENEE grid'),
      ground: L('Puesta a tierra', 'Grounding'),
      micro: d.micro
    };
  }
})();
