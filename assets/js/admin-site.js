/* =====================================================================
   Panel de administración: secciones del sitio
   📊 Visitas · ⚙️ Datos técnicos · 🔌 Equipos · 📝 Textos y avisos · 🎨 Colores
   Todo se guarda en Firestore (sitio/config) y el sitio lo aplica al abrirse.
   ===================================================================== */
(function () {
  'use strict';
  const ST = window.STORE, SC = window.SITECFG, $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fx = (x, d = 0) => isFinite(x) ? (+x).toLocaleString('es-HN', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
  let CFG = null, W = null, TOAST = () => { };
  const get = (o, p) => p.split('.').reduce((a, k) => a == null ? a : a[k], o);
  const set = (o, p, v) => { const k = p.split('.'), l = k.pop(); k.reduce((a, x) => (a[x] = a[x] || {}), o)[l] = v; };

  // W = copia de trabajo; se rehace solo al entrar a una sección (los cambios sin guardar se mantienen al redibujar)
  async function load() { if (!CFG) { CFG = await ST.getSite(); } if (W) return; W = SC.merge(SC.clone(SC.DEFAULTS), CFG); W.ocultas = CFG.ocultas || []; W.colores = CFG.colores || null; W.equipos = SC.merge(SC.clone(SC.DEFAULTS.equipos), CFG.equipos || {}); }
  async function save(msg = 'Guardado. Los visitantes lo verán al abrir o recargar el sitio.') {
    const out = SC.clone(W);
    await ST.setSite(out); CFG = out; TOAST('✓ ' + msg);
  }
  const card = (title, body, sub = '') => `<div class="card acard"><h3>${title}</h3>${sub ? `<p class="asub">${sub}</p>` : ''}${body}</div>`;
  const num = (label, path, step = 'any', unit = '', hint = '') => `<label class="af"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><span class="ain"><input type="number" step="${step}" data-p="${path}" value="${esc(get(W, path))}">${unit ? `<em>${unit}</em>` : ''}</span></label>`;
  const txt = (label, path, ph = '') => `<label class="af wide"><span>${label}</span><input type="text" data-p="${path}" value="${esc(get(W, path))}" placeholder="${esc(ph)}"></label>`;
  const area = (label, path, ph = '') => `<label class="af wide"><span>${label}</span><textarea rows="2" data-p="${path}" placeholder="${esc(ph)}">${esc(get(W, path))}</textarea></label>`;
  const saveBar = (id, resetId) => `<div class="asave"><button class="btn pri" id="${id}">Guardar cambios</button>${resetId ? `<button class="btn" id="${resetId}">Restaurar valores originales</button>` : ''}<span class="adirty" id="${id}-d"></span></div>`;
  function bindInputs(root, saveId) {
    root.querySelectorAll('[data-p]').forEach(el => el.addEventListener('input', () => {
      const v = el.type === 'number' ? (el.value === '' ? '' : +el.value) : el.type === 'checkbox' ? el.checked : el.value;
      set(W, el.dataset.p, v); const d = $(saveId + '-d'); if (d) d.textContent = '● Cambios sin guardar';
    }));
  }

  /* =================== 📊 Visitas =================== */
  let DAYS = 30;
  async function visitas(el) {
    el.innerHTML = '<p class="aload">Cargando visitas…</p>';
    let V;
    try { V = await ST.listVisits(DAYS); } catch (e) { el.innerHTML = card('📊 Visitas', '<p class="admerr">No se pudieron leer las visitas. Revisa que las reglas de Firestore estén actualizadas (incluyen la colección "visitas").</p>'); return; }
    const ses = new Map(); V.forEach(v => { if (!ses.has(v.ses)) ses.set(v.ses, v); });
    const S = [...ses.values()], today = new Date().toISOString().slice(0, 10);
    const day = d => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Tegucigalpa' });
    const byDay = new Map(); for (let i = DAYS - 1; i >= 0; i--) byDay.set(day(Date.now() - i * 864e5), 0);
    S.forEach(s => { const k = day(s.fecha); if (byDay.has(k)) byDay.set(k, byDay.get(k) + 1); });
    const todayN = byDay.get(day(Date.now())) || 0, movil = S.filter(s => s.disp === 'movil').length;
    const secN = {}; V.forEach(v => { secN[v.seccion] = (secN[v.seccion] || 0) + 1; });
    const NAMES = { home: 'Inicio', mount: 'Montaje y diagrama', gen: 'Generador FV', iv: 'Curvas y MPPT', site: 'Sitio y clima', bat: 'Baterías', conv: 'Conversión', grid: 'Red eléctrica', sim: 'Simulación', about: 'Metodología', install: 'Normativa y equipos', opinion: 'Opiniones' };
    const secs = Object.entries(secN).sort((a, b) => b[1] - a[1]), smax = secs.length ? secs[0][1] : 1;
    const vals = [...byDay.values()], vmax = Math.max(1, ...vals), bw = 100 / vals.length;
    const bars = vals.map((v, i) => `<rect x="${i * bw + bw * 0.15}" y="${100 - v / vmax * 92}" width="${bw * 0.7}" height="${v / vmax * 92}" rx="0.6"><title>${[...byDay.keys()][i]}: ${v} visitantes</title></rect>`).join('');
    const es = S.filter(s => s.lang !== 'en').length;
    el.innerHTML = `
      <div class="arange">${[7, 30, 90].map(d => `<button class="btn sm ${DAYS === d ? 'pri' : ''}" data-days="${d}">Últimos ${d} días</button>`).join('')}</div>
      <div class="kpis admk">
        <div class="kpi"><small>Visitantes</small><b>${fx(S.length)}</b></div>
        <div class="kpi"><small>Hoy</small><b>${fx(todayN)}</b></div>
        <div class="kpi"><small>Secciones vistas</small><b>${fx(V.length)}<span>${S.length ? fx(V.length / S.length, 1) + ' por visitante' : ''}</span></b></div>
        <div class="kpi"><small>Desde celular</small><b>${S.length ? fx(movil / S.length * 100) : 0}<span>%</span></b></div>
      </div>
      ${card('Visitantes por día', `<svg class="vbars" viewBox="0 0 100 100" preserveAspectRatio="none">${bars}</svg><div class="vaxis"><span>${[...byDay.keys()][0]}</span><span>${[...byDay.keys()].pop()}</span></div>`)}
      <div class="agrid2">
        ${card('Secciones más vistas', secs.length ? secs.map(([k, n]) => `<div class="hrow"><span>${esc(NAMES[k] || k)}</span><span class="hbar"><i style="width:${n / smax * 100}%"></i></span><b>${n}</b></div>`).join('') : '<p class="asub">Todavía no hay visitas registradas.</p>')}
        ${card('Dispositivo e idioma', `<div class="hrow"><span>📱 Celular</span><span class="hbar"><i style="width:${S.length ? movil / S.length * 100 : 0}%"></i></span><b>${movil}</b></div><div class="hrow"><span>💻 Computadora</span><span class="hbar"><i style="width:${S.length ? (S.length - movil) / S.length * 100 : 0}%"></i></span><b>${S.length - movil}</b></div><div class="hrow"><span>🇭🇳 Español</span><span class="hbar"><i style="width:${S.length ? es / S.length * 100 : 0}%"></i></span><b>${es}</b></div><div class="hrow"><span>🇺🇸 Inglés</span><span class="hbar"><i style="width:${S.length ? (S.length - es) / S.length * 100 : 0}%"></i></span><b>${S.length - es}</b></div>`, 'Las visitas son anónimas: no se guarda la IP ni datos personales. Se cuentan solo en simuladorfotovoltaico.online.')}
      </div>`;
    el.querySelectorAll('[data-days]').forEach(b => b.onclick = () => { DAYS = +b.dataset.days; visitas(el); });
  }

  /* =================== ⚙️ Datos técnicos =================== */
  async function datos(el) {
    await load();
    const exL = k => fx(get(W, 'excedentes.' + k) / 1000 * W.fx, 4);
    el.innerHTML = `
      <div class="agrid2">
        ${card('💡 Tarifa residencial (ENEE)', num('Cargo fijo', 'tarifas.res.fixed', 0.01, 'L/mes') + num('Primer bloque', 'tarifas.res.block', 1, 'kWh') + num('Precio del primer bloque', 'tarifas.res.e1', 0.0001, 'L/kWh') + num('Precio del resto', 'tarifas.res.e2', 0.0001, 'L/kWh') + txt('Vigente desde (texto)', 'tarifas.period.es', 'octubre de 2026') + txt('Vigente desde (inglés)', 'tarifas.period.en', 'October 2026'), 'Se usa para calcular la factura y el ahorro de las casas y apartamentos.')}
        ${card('🏢 Tarifas comerciales e industriales', num('Baja tensión: cargo fijo', 'tarifas.bt.fixed', 0.01, 'L/mes') + num('Baja tensión: energía', 'tarifas.bt.e', 0.0001, 'L/kWh') + num('Media tensión: cargo fijo', 'tarifas.mt.fixed', 0.01, 'L/mes') + num('Media tensión: demanda', 'tarifas.mt.dem', 0.001, 'L/kW') + num('Media tensión: energía', 'tarifas.mt.e', 0.0001, 'L/kWh'))}
        ${card('🔁 Excedentes y cambio', num('Excedentes en baja tensión', 'excedentes.bt', 0.01, 'USD/MWh', `≈ L ${exL('bt')}/kWh`) + num('Excedentes en media tensión', 'excedentes.mt', 0.01, 'USD/MWh', `≈ L ${exL('mt')}/kWh`) + num('Tipo de cambio', 'fx', 0.01, 'L/USD', 'Banco Central de Honduras'))}
        ${card('💲 Costo instalado de referencia', num('Casa', 'costos.res', 0.01, 'USD/Wp') + num('Edificio de apartamentos', 'costos.apt', 0.01, 'USD/Wp') + num('Comercio o industria', 'costos.com', 0.01, 'USD/Wp') + num('Gasolinera', 'costos.gas', 0.01, 'USD/Wp') + num('Parque solar', 'costos.farm', 0.01, 'USD/Wp'), 'Precio llave en mano por vatio instalado; se usa para la inversión y el retorno.')}
        ${card('⚖️ Ley y supuestos', num('Límite de producción', 'ley.limite', 0.1, '% del consumo', 'Art. 47 A.ii (CREE-07-2025): menos del 100 %.') + num('Pérdidas en CC por defecto', 'ley.perdidas', 0.5, '%', 'Suciedad, mismatch, cables y LID.'))}
        ${card('💰 Análisis financiero (caso base)', num('Horizonte del análisis', 'finanzas.horizonte', 1, 'años') + num('Pérdida de producción de los paneles', 'finanzas.degr', 0.1, '%/año') + num('Costo anual de O&M', 'finanzas.om', 0.25, '% de la inversión') + num('Aumento anual de las tarifas', 'finanzas.aumTarifa', 0.5, '%/año') + num('Aumento anual del O&M', 'finanzas.aumOM', 0.5, '%/año') + `<label class="af"><span>Financiamiento</span><span class="ain"><select data-p="finanzas.financ"><option value="prestamo" ${get(W, 'finanzas.financ') === 'prestamo' ? 'selected' : ''}>Con préstamo</option><option value="propia" ${get(W, 'finanzas.financ') === 'propia' ? 'selected' : ''}>Fondos propios</option></select></span></label>` + num('Parte financiada con préstamo', 'finanzas.pctFin', 5, '%') + num('Plazo del préstamo', 'finanzas.plazo', 1, 'años') + num('Tasa de interés del préstamo', 'finanzas.tasa', 0.25, '%') + num('Tasa de descuento (VAN)', 'finanzas.descuento', 0.5, '%') + num('Reemplazo de inversores en el año', 'finanzas.reemplazoAnio', 1, '') + num('Costo del reemplazo', 'finanzas.reemplazoPct', 1, '% de la inversión'), 'Valores con los que arranca el análisis financiero de Inicio. Cada visitante puede cambiarlos y crear escenarios.')}
      </div>
      ${saveBar('svD', 'rsD')}`;
    bindInputs(el, 'svD');
    $('svD').onclick = async () => { try { await save(); datos(el); } catch (e) { TOAST('No se pudo guardar.'); } };
    $('rsD').onclick = async () => { if (!confirm('¿Volver a los valores originales de tarifas, costos y supuestos?')) return; for (const k of ['tarifas', 'excedentes', 'fx', 'costos', 'ley', 'finanzas']) W[k] = SC.clone(SC.DEFAULTS[k]); await save('Valores originales restaurados.'); datos(el); };
  }

  /* =================== 🔌 Equipos =================== */
  let ETAB = 'paneles', EDIT = null;
  const KINDS = {
    paneles: { t: 'Paneles solares', base: () => window.MODULES.filter(m => !m.custom).map(m => ({ key: m.name, name: m.name, info: `${fx(m.Pstc)} W · ${esc(m.tech || '')}` })), info: p => `${fx(p.Pstc)} W · Vmp ${p.Vmp} V · Imp ${p.Imp} A` },
    inversores: { t: 'Inversores de red', base: () => window.INVERTERS_GRID.filter(v => !v.custom).map(v => ({ key: v.name, name: v.name, info: `${fx(v.Paco / 1000, 2)} kW · ${v.Vac} V${v.ph === 3 ? ' trifásico' : ''}` })), info: v => `${fx(v.Paco / 1000, 2)} kW · ${v.Vac} V · MPPT ${v.Vmin}–${v.Vmax} V` },
    baterias: { t: 'Baterías', base: () => window.SYS.BATTERIES.filter(b => !b.custom).map(b => ({ key: b.id, name: b.name.es, info: `${b.tech} · ${fx(b.V * b.C / 1000, 2)} kWh` })), info: b => `${b.tech} · ${b.V} V · ${b.C} Ah` },
    aislados: { t: 'Inversores aislados', base: () => window.SYS.INVERTERS.filter(v => !v.custom && v.id !== 'none').map(v => ({ key: v.id, name: v.name.es, info: `${fx(v.P)} W` })), info: v => `${fx(v.P)} W · ${v.Vdc} V CC · ${v.Vac} V CA` }
  };
  const FORMS = {
    paneles: [['name', 'Marca y modelo', 'text', 'Ej. LONGi Hi-MO 6 LR5-54HTH-440M'], ['tech', 'Tecnología', 'text', 'Ej. Mono-c-Si TOPCon'], ['Ns', 'Celdas en serie', 'select', [36, 54, 60, 66, 72, 78]], ['Pstc', 'Potencia máxima', 'number', 'W'], ['Vmp', 'Voltaje en máxima potencia (Vmp)', 'number', 'V'], ['Imp', 'Corriente en máxima potencia (Imp)', 'number', 'A'], ['Voc', 'Voltaje de circuito abierto (Voc)', 'number', 'V'], ['Isc', 'Corriente de cortocircuito (Isc)', 'number', 'A'], ['gP', 'Coeficiente de temperatura de Pmax', 'number', '%/°C', -0.35], ['pV', 'Coeficiente de temperatura de Voc', 'number', '%/°C', -0.27], ['pI', 'Coeficiente de temperatura de Isc', 'number', '%/°C', 0.045], ['noct', 'NOCT', 'number', '°C', 45], ['W', 'Ancho', 'number', 'm', 1.134], ['H', 'Alto', 'number', 'm', 2.278], ['bifacial', 'Es bifacial', 'check'], ['fmts', 'Aparece en', 'fmts']],
    inversores: [['name', 'Marca y modelo', 'text', 'Ej. Growatt MIN 5000TL-X'], ['type', 'Tipo', 'select', [['string', 'De string (cadena)'], ['micro', 'Microinversor'], ['hybrid', 'Híbrido (con baterías)'], ['string3', 'Trifásico de string']]], ['seg', 'Para', 'select', [['res', 'Casas y edificios'], ['com', 'Comercio e industria']]], ['Paco', 'Potencia de salida CA', 'number', 'W'], ['eff', 'Eficiencia europea', 'number', '%', 97], ['Vac', 'Tensión de salida', 'number', 'V', 240], ['ph', 'Fases', 'select', [[1, 'Monofásico'], [3, 'Trifásico']]], ['Vdcmax', 'Voltaje CC máximo', 'number', 'V'], ['Vmin', 'MPPT mínimo', 'number', 'V'], ['Vmax', 'MPPT máximo', 'number', 'V'], ['Vstart', 'Voltaje de arranque', 'number', 'V'], ['Idcmax', 'Corriente máxima por MPPT', 'number', 'A'], ['Iscmax', 'Corriente de cortocircuito máxima por MPPT', 'number', 'A'], ['auto', 'Puede elegirse en la recomendación automática', 'check']],
    baterias: [['name', 'Marca y modelo', 'text', 'Ej. Pylontech US5000'], ['tech', 'Tecnología', 'select', [['LFP', 'Litio LiFePO₄'], ['GEL', 'Gel'], ['AGM', 'AGM'], ['FLA', 'Plomo-ácido inundada']]], ['V', 'Voltaje nominal', 'number', 'V'], ['C', 'Capacidad', 'number', 'Ah'], ['dod', 'Profundidad de descarga recomendada', 'number', '%'], ['cyc', 'Ciclos de vida', 'number', 'ciclos'], ['eta', 'Eficiencia', 'number', '%'], ['life', 'Vida útil', 'number', 'años'], ['mass', 'Peso', 'number', 'kg']],
    aislados: [['name', 'Marca y modelo', 'text', 'Ej. Victron Phoenix 12/800'], ['P', 'Potencia continua', 'number', 'W'], ['Vdc', 'Voltaje de batería', 'number', 'V'], ['Vac', 'Voltaje de salida', 'number', 'V', 120], ['eta', 'Eficiencia', 'number', '%', 90]]
  };
  async function equipos(el) {
    await load();
    const K = KINDS[ETAB], E = W.equipos, list = E[ETAB] || [], hid = E.ocultos[ETAB] || [];
    const form = () => {
      const it = EDIT === 'new' ? {} : list.find(x => x.uid === EDIT) || {};
      const f = FORMS[ETAB].map(([k, label, type, a, def]) => {
        const v = it[k] ?? (type === 'number' && def != null && EDIT === 'new' ? def : '');
        if (type === 'text') return `<label class="af wide"><span>${label}</span><input type="text" data-e="${k}" value="${esc(v)}" placeholder="${esc(a)}"></label>`;
        if (type === 'number') return `<label class="af"><span>${label}</span><span class="ain"><input type="number" step="any" data-e="${k}" value="${esc(v)}"><em>${a}</em></span></label>`;
        if (type === 'select') return `<label class="af"><span>${label}</span><select class="sel" data-e="${k}">${a.map(o => Array.isArray(o) ? o : [o, o + ' celdas']).map(([ov, ot]) => `<option value="${ov}" ${String(v || (EDIT === 'new' && ov == 72 ? 72 : '')) === String(ov) ? 'selected' : ''}>${ot}</option>`).join('')}</select></label>`;
        if (type === 'check') return `<label class="af acheck"><input type="checkbox" data-e="${k}" ${v ? 'checked' : ''}><span>${label}</span></label>`;
        if (type === 'fmts') { const fm = it.fmts || ['res', 'com']; return `<div class="af wide"><span>${label}</span><span class="afm">${[['res', 'Residencial'], ['com', 'Comercial'], ['util', 'Gran escala']].map(([k2, t]) => `<label><input type="checkbox" data-fm="${k2}" ${fm.includes(k2) ? 'checked' : ''}> ${t}</label>`).join('')}</span></div>`; }
        return '';
      }).join('');
      return card(EDIT === 'new' ? '＋ Agregar a ' + K.t.toLowerCase() : '✏️ Editar ' + esc(it.name), `<div class="aform">${f}</div><p class="asub" id="eWarn"></p><div class="asave"><button class="btn pri" id="eOk">${EDIT === 'new' ? 'Agregar' : 'Guardar cambios'}</button><button class="btn" id="eNo">Cancelar</button></div>`, 'Copia los datos de la ficha técnica del fabricante (condiciones STC).');
    };
    el.innerHTML = `
      <div class="etabs">${Object.entries(KINDS).map(([k, v]) => `<button class="${ETAB === k ? 'on' : ''}" data-et="${k}">${v.t}</button>`).join('')}</div>
      ${EDIT ? form() : ''}
      ${card(K.t, `
        <div class="asave" style="margin:0 0 12px"><button class="btn pri" id="eAdd">＋ Agregar</button></div>
        ${list.length ? `<h4 class="eh">Agregados por ti</h4>${list.map(x => `<div class="erow"><div><b>${esc(x.name)}</b><small>${K.info(x)}</small></div><span class="eact"><button class="btn sm" data-ed="${x.uid}">✏️ Editar</button><button class="btn sm danger" data-rm="${x.uid}">Eliminar</button></span></div>`).join('')}` : ''}
        <h4 class="eh">Incluidos en el simulador <small>(desmarca para ocultarlos del sitio)</small></h4>
        ${K.base().map(b => `<label class="erow"><div><b>${esc(b.name)}</b><small>${b.info}</small></div><span class="eact"><input type="checkbox" data-vis="${esc(b.key)}" ${hid.includes(b.key) ? '' : 'checked'}> Visible</span></label>`).join('')}`)}`;
    el.querySelectorAll('[data-et]').forEach(b => b.onclick = () => { ETAB = b.dataset.et; EDIT = null; equipos(el); });
    $('eAdd').onclick = () => { EDIT = 'new'; equipos(el); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    el.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => { EDIT = b.dataset.ed; equipos(el); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    el.querySelectorAll('[data-rm]').forEach(b => b.onclick = async () => { if (!confirm('¿Eliminar este equipo del simulador?')) return; E[ETAB] = list.filter(x => x.uid !== b.dataset.rm); await save('Equipo eliminado.'); equipos(el); });
    el.querySelectorAll('[data-vis]').forEach(c => c.onchange = async () => { const k = c.dataset.vis, h = new Set(E.ocultos[ETAB] || []); c.checked ? h.delete(k) : h.add(k); E.ocultos[ETAB] = [...h]; await save(c.checked ? 'Ahora se muestra en el sitio.' : 'Oculto en el sitio.'); });
    if (EDIT) {
      $('eNo').onclick = () => { EDIT = null; equipos(el); };
      $('eOk').onclick = async () => {
        const it = {}; el.querySelectorAll('[data-e]').forEach(i => { it[i.dataset.e] = i.type === 'checkbox' ? i.checked : i.type === 'number' ? (i.value === '' ? '' : +i.value) : i.value.trim(); });
        if (ETAB === 'paneles') it.fmts = [...el.querySelectorAll('[data-fm]')].filter(c => c.checked).map(c => c.dataset.fm);
        if (ETAB === 'paneles' || ETAB === 'inversores') ['Ns', 'ph'].forEach(k => { if (k in it) it[k] = +it[k]; });
        const need = FORMS[ETAB].filter(f => f[2] === 'number' && f[4] == null && !['Vstart', 'Iscmax'].includes(f[0])).map(f => f[0]);
        const miss = [!it.name ? 'nombre' : null, ...need.filter(k => it[k] === '' || it[k] == null)].filter(Boolean);
        if (miss.length) { $('eWarn').innerHTML = '<span class="admerr">Faltan datos: ' + miss.join(', ') + '.</span>'; return; }
        if (ETAB === 'paneles') { const e = Math.abs(it.Vmp * it.Imp / it.Pstc - 1); if (e > 0.03 || it.Voc <= it.Vmp || it.Isc <= it.Imp) { if (!confirm(`Revisa los datos: Vmp × Imp = ${fx(it.Vmp * it.Imp, 1)} W frente a ${it.Pstc} W${it.Voc <= it.Vmp ? ', y Voc debe ser mayor que Vmp' : ''}${it.Isc <= it.Imp ? ', e Isc mayor que Imp' : ''}. ¿Guardar de todos modos?`)) return; } }
        if (ETAB === 'inversores' && it.Vmin >= it.Vmax) { $('eWarn').innerHTML = '<span class="admerr">El MPPT mínimo debe ser menor que el máximo.</span>'; return; }
        if (EDIT === 'new') { it.uid = Date.now().toString(36); E[ETAB] = [...list, it]; } else E[ETAB] = list.map(x => x.uid === EDIT ? { ...x, ...it } : x);
        await save(EDIT === 'new' ? 'Equipo agregado. Ya aparece en el simulador.' : 'Cambios guardados.'); EDIT = null; equipos(el);
      };
    }
  }

  /* =================== 📝 Textos y avisos =================== */
  const TABS = [['mount', 'Montaje y diagrama'], ['gen', 'Generador FV'], ['iv', 'Curvas y MPPT'], ['site', 'Sitio y clima'], ['bat', 'Baterías'], ['conv', 'Conversión y distribución'], ['grid', 'Red eléctrica'], ['sim', 'Simulación'], ['about', 'Metodología'], ['install', 'Normativa y equipos'], ['opinion', 'Opiniones y sugerencias']];
  async function textos(el) {
    await load();
    el.innerHTML = `
      <div class="agrid2">
        ${card('🏷️ Encabezado del sitio', txt('Título (español)', 'textos.titulo.es') + txt('Título (inglés)', 'textos.titulo.en') + area('Subtítulo (español)', 'textos.subtitulo.es') + area('Subtítulo (inglés)', 'textos.subtitulo.en'))}
        ${card('👥 Pie de página', txt('Autores', 'textos.autores', 'Nombre · Nombre · Nombre'), 'Aparece al final de todas las páginas.')}
        ${card('📢 Aviso en la parte superior', `<label class="af acheck"><input type="checkbox" data-p="aviso.on" ${W.aviso.on ? 'checked' : ''}><span>Mostrar el aviso en el sitio</span></label><label class="af"><span>Tipo</span><select class="sel" data-p="aviso.tipo"><option value="info" ${W.aviso.tipo !== 'importante' ? 'selected' : ''}>📢 Informativo</option><option value="importante" ${W.aviso.tipo === 'importante' ? 'selected' : ''}>⚠️ Importante</option></select></label>` + area('Texto (español)', 'aviso.es', 'Ej. Nueva versión: ahora puedes ver el clima real del día.') + area('Texto (inglés)', 'aviso.en', 'Optional English version'), 'Ideal para anunciar novedades, mantenimiento o la presentación del seminario.')}
        ${card('🚧 Mensaje «en construcción»', `<label class="af acheck"><input type="checkbox" data-p="construccion.on" ${W.construccion && W.construccion.on ? 'checked' : ''}><span>Mostrar el mensaje al abrir el sitio</span></label>` + area('Texto (español)', 'construccion.es') + area('Texto (inglés)', 'construccion.en'), 'Aparece como ventana emergente una vez por visita. Desmárcalo cuando el simulador esté terminado.')}
        ${card('🗂️ Pestañas del menú', `<p class="asub">Desmarca las que no quieras mostrar. Inicio siempre se muestra.</p>${TABS.map(([k, t]) => `<label class="af acheck"><input type="checkbox" data-tab="${k}" ${W.ocultas.includes(k) ? '' : 'checked'}><span>${t}</span></label>`).join('')}`)}
      </div>
      ${saveBar('svT', 'rsT')}`;
    bindInputs(el, 'svT');
    el.querySelectorAll('[data-p="aviso.tipo"]').forEach(s => s.onchange = () => { W.aviso.tipo = s.value; $('svT-d').textContent = '● Cambios sin guardar'; });
    el.querySelectorAll('[data-tab]').forEach(c => c.onchange = () => { const h = new Set(W.ocultas); c.checked ? h.delete(c.dataset.tab) : h.add(c.dataset.tab); W.ocultas = [...h]; $('svT-d').textContent = '● Cambios sin guardar'; });
    $('svT').onclick = async () => { try { await save(); textos(el); } catch (e) { TOAST('No se pudo guardar.'); } };
    $('rsT').onclick = async () => { if (!confirm('¿Volver a los textos originales, quitar el aviso y mostrar todas las pestañas?')) return; W.textos = SC.clone(SC.DEFAULTS.textos); W.aviso = SC.clone(SC.DEFAULTS.aviso); W.construccion = SC.clone(SC.DEFAULTS.construccion); W.ocultas = []; await save('Textos originales restaurados.'); textos(el); };
  }

  /* =================== 🎨 Colores =================== */
  const ORIG = { primary: '#1d3b6e', primary2: '#2b5aa6', accent: '#c98a1b', header1: '#14284a', header2: '#1d3b6e' };
  const PRESETS = [['Original (azul marino y dorado)', ORIG], ['Verde energía', { primary: '#166534', primary2: '#15803d', accent: '#ca8a04', header1: '#052e16', header2: '#166534' }], ['Azul eléctrico', { primary: '#1d4ed8', primary2: '#2563eb', accent: '#f59e0b', header1: '#0b2a6b', header2: '#1d4ed8' }], ['Turquesa', { primary: '#0f766e', primary2: '#0d9488', accent: '#e5953a', header1: '#063e3a', header2: '#0f766e' }], ['Grafito', { primary: '#334155', primary2: '#475569', accent: '#d97706', header1: '#0f172a', header2: '#334155' }], ['Vino', { primary: '#7f1d1d', primary2: '#991b1b', accent: '#d4a017', header1: '#450a0a', header2: '#7f1d1d' }]];
  async function colores(el) {
    await load();
    const c = W.colores || { ...ORIG };
    const prev = `<div class="cprev" style="--cp:${c.primary};--cp2:${c.primary2};--ca:${c.accent}"><div class="cph" style="background:linear-gradient(180deg,${c.header1},${c.header2})"><i style="background:linear-gradient(135deg,${c.primary2},${c.primary})"></i><span>${esc(W.textos.titulo.es)}</span></div><div class="cpb"><span class="cpt">Inicio</span><span class="cbtn">Botón principal</span><span class="cst">★★★★☆</span><span class="cbar"><i></i></span></div></div>`;
    const pick = (k, t) => `<label class="af"><span>${t}</span><span class="ain"><input type="color" data-c="${k}" value="${c[k]}"><code>${c[k]}</code></span></label>`;
    el.innerHTML = `
      <div class="agrid2">
        ${card('Paletas listas', `<div class="cpres">${PRESETS.map(([n, p], i) => `<button data-pr="${i}"><span style="background:linear-gradient(135deg,${p.header1} 0 40%,${p.primary} 40% 70%,${p.accent} 70%)"></span>${n}</button>`).join('')}</div>`, 'Toca una para probarla; se guarda al presionar "Guardar cambios".')}
        ${card('Vista previa', prev)}
        ${card('Personalizar', pick('primary', 'Color principal (botones, menú)') + pick('primary2', 'Color secundario (enlaces)') + pick('accent', 'Color de acento (estrellas, detalles)') + pick('header1', 'Cabecera: arriba') + pick('header2', 'Cabecera: abajo'))}
      </div>
      ${saveBar('svC', 'rsC')}`;
    el.querySelectorAll('[data-pr]').forEach(b => b.onclick = () => { W.colores = { ...PRESETS[+b.dataset.pr][1] }; colores(el); $('svC-d').textContent = '● Cambios sin guardar'; });
    el.querySelectorAll('[data-c]').forEach(i => i.onchange = () => { W.colores = { ...(W.colores || ORIG), [i.dataset.c]: i.value }; colores(el); $('svC-d').textContent = '● Cambios sin guardar'; });
    $('svC').onclick = async () => { try { if (W.colores && JSON.stringify(W.colores) === JSON.stringify(ORIG)) W.colores = null; await save('Colores guardados.'); colores(el); } catch (e) { TOAST('No se pudo guardar.'); } };
    $('rsC').onclick = async () => { W.colores = null; await save('Paleta original restaurada.'); colores(el); };
  }

  window.ADMIN_SITE = {
    async render(sec, el, toast) {
      TOAST = toast; W = null; EDIT = null;
      try { await ({ visitas, datos, equipos, textos, colores })[sec](el); }
      catch (e) { el.innerHTML = card('No se pudo cargar', '<p class="admerr">Revisa tu conexión o que las reglas de Firestore estén actualizadas.</p>'); }
    }
  };
})();
