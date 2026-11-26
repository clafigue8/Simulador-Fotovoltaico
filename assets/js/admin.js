/* =====================================================================
   Panel de autores: inicio de sesión con Google (solo los 3 correos de
   SITE_CONFIG.admins) y gestión de las opiniones guardadas en Firestore.
   La protección real está en firestore.rules: aunque alguien abra esta
   página, sin ser autor no puede leer ni modificar ningún dato.
   ===================================================================== */
(function () {
  'use strict';
  const CFG = window.SITE_CONFIG || {}, PREVIEW = !CFG.firebase || /PEGAR_AQUI/.test(CFG.firebase.apiKey);
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  const $ = id => document.getElementById(id), esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const TIPO = { opinion: '💬 Opinión', sugerencia: '💡 Sugerencia', error: '🐞 Error', pregunta: '❓ Pregunta' };
  const ESTADO = { nuevo: ['Nuevo', 'warn'], revision: ['En revisión', ''], hecho: ['Hecho', 'ok'], descartado: ['Descartado', 'bad'] };
  const SEC = { general: 'General', home: 'Inicio', mount: 'Montaje', gen: 'Generador FV', iv: 'Curvas y MPPT', site: 'Sitio y clima', bat: 'Baterías', conv: 'Conversión', grid: 'Red eléctrica', sim: 'Simulación', install: 'Normativa' };
  let FB = null, ROWS = [], FIL = { tipo: 'todos', estado: 'todos', q: '' };

  const SAMPLE = [
    { id: 'a1', tipo: 'sugerencia', seccion: 'home', estrellas: 0, mensaje: 'Sería útil poder poner el consumo de los 12 meses y no solo de 3 recibos.', nombre: 'Ana', correo: 'ana@ejemplo.com', estado: 'nuevo', fecha: '2026-11-25T15:02:00' },
    { id: 'a2', tipo: 'opinion', seccion: 'general', estrellas: 5, mensaje: 'Muy buena herramienta, la usamos en clase de energías renovables.', nombre: '', correo: '', estado: 'revision', fecha: '2026-11-24T10:41:00' },
    { id: 'a3', tipo: 'error', seccion: 'iv', estrellas: 0, mensaje: 'En el celular la gráfica de curvas se corta a la derecha.', nombre: 'Luis', correo: '', estado: 'hecho', fecha: '2026-11-23T19:15:00', nota: 'Corregido en la versión del 24/11.' },
    { id: 'a4', tipo: 'pregunta', seccion: 'install', estrellas: 0, mensaje: '¿El límite de la ley es anual o mensual?', nombre: 'María', correo: 'maria@ejemplo.com', estado: 'nuevo', fecha: '2026-11-23T08:30:00' },
    { id: 'a5', tipo: 'opinion', seccion: 'home', estrellas: 4, mensaje: 'Me gustó la vista 3D, pero me costó encontrar el clima real.', nombre: '', correo: '', estado: 'nuevo', fecha: '2026-11-22T21:05:00' }
  ];

  async function sdk() {
    if (FB) return FB;
    const app = await import(SDK + 'firebase-app.js'), auth = await import(SDK + 'firebase-auth.js'), fs = await import(SDK + 'firebase-firestore.js');
    const inst = app.initializeApp(CFG.firebase);
    FB = { auth, fs, a: auth.getAuth(inst), db: fs.getFirestore(inst) };
    return FB;
  }
  const isAdmin = u => u && u.emailVerified !== false && (CFG.admins || []).map(x => x.toLowerCase()).includes((u.email || '').toLowerCase());

  function loginView(msg = '') {
    $('who').innerHTML = '';
    $('adm').innerHTML = `<div class="card admlogin"><h3>Acceso solo para los autores</h3><p>Inicia sesión con la cuenta de Google registrada como autor del proyecto.</p><button class="btn pri" id="gIn">Entrar con Google</button>${PREVIEW ? '<p class="note2">Vista previa: Firebase aún no está configurado; se muestran datos de ejemplo.</p>' : ''}${msg ? `<p class="admerr">${esc(msg)}</p>` : ''}</div>`;
    $('gIn').onclick = async () => {
      if (PREVIEW) return panel({ email: 'autor1@gmail.com', displayName: 'Autor 1 (vista previa)' });
      const { auth, a } = await sdk();
      try { await auth.signInWithPopup(a, new auth.GoogleAuthProvider()); } catch (e) { loginView('No se pudo iniciar sesión.'); }
    };
  }

  async function load() {
    if (PREVIEW) { ROWS = SAMPLE.map(x => ({ ...x })); return; }
    const { fs, db } = await sdk();
    const snap = await fs.getDocs(fs.query(fs.collection(db, 'opiniones'), fs.orderBy('fecha', 'desc')));
    ROWS = snap.docs.map(d => { const x = d.data(); return { id: d.id, ...x, fecha: x.fecha && x.fecha.toDate ? x.fecha.toDate().toISOString() : x.fecha }; });
  }
  async function save(id, patch) {
    const r = ROWS.find(x => x.id === id); Object.assign(r, patch);
    if (!PREVIEW) { const { fs, db } = await sdk(); await fs.updateDoc(fs.doc(db, 'opiniones', id), patch); }
  }
  async function del(id) {
    ROWS = ROWS.filter(x => x.id !== id);
    if (!PREVIEW) { const { fs, db } = await sdk(); await fs.deleteDoc(fs.doc(db, 'opiniones', id)); }
  }

  async function panel(user) {
    $('who').innerHTML = `<span class="admwho">${esc(user.displayName || user.email)}</span> <button class="btn sm" id="gOut">Salir</button>`;
    $('gOut').onclick = async () => { if (!PREVIEW) { const { auth, a } = await sdk(); await auth.signOut(a); } loginView(); };
    $('adm').innerHTML = '<p>Cargando…</p>';
    try { await load(); } catch (e) { $('adm').innerHTML = '<div class="card"><p class="admerr">No se pudieron leer las opiniones. Revisa que tu correo esté en las reglas de Firestore.</p></div>'; return; }
    render();
  }

  function render() {
    const n = ROWS.length, nuevos = ROWS.filter(x => x.estado === 'nuevo').length, st = ROWS.filter(x => x.estrellas > 0);
    const prom = st.length ? st.reduce((a, x) => a + x.estrellas, 0) / st.length : 0;
    const list = ROWS.filter(x => (FIL.tipo === 'todos' || x.tipo === FIL.tipo) && (FIL.estado === 'todos' || x.estado === FIL.estado) && (!FIL.q || (x.mensaje + ' ' + x.nombre).toLowerCase().includes(FIL.q.toLowerCase())));
    const by = t => ROWS.filter(x => x.tipo === t).length;
    $('adm').innerHTML = `
      <div class="kpis" style="margin:24px 0">
        <div class="kpi"><small>Mensajes</small><b>${n}</b></div>
        <div class="kpi"><small>Sin revisar</small><b>${nuevos}</b></div>
        <div class="kpi"><small>Valoración promedio</small><b>${st.length ? prom.toFixed(1) + ' ★' : '—'}<span>${st.length} votos</span></b></div>
        <div class="kpi"><small>Por tipo</small><b style="font-size:14px;font-weight:500">💬 ${by('opinion')} · 💡 ${by('sugerencia')} · 🐞 ${by('error')} · ❓ ${by('pregunta')}</b></div>
      </div>
      <div class="card">
        <div class="admbar">
          <select class="sel" id="fT"><option value="todos">Todos los tipos</option>${Object.entries(TIPO).map(([k, t]) => `<option value="${k}" ${FIL.tipo === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <select class="sel" id="fE"><option value="todos">Todos los estados</option>${Object.entries(ESTADO).map(([k, [t]]) => `<option value="${k}" ${FIL.estado === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
          <input class="inp" id="fQ" placeholder="Buscar…" value="${esc(FIL.q)}">
          <button class="btn sm" id="csv">Exportar CSV</button>
        </div>
        ${list.length ? list.map(x => `
          <div class="admrow">
            <div class="admhead"><b>${TIPO[x.tipo] || x.tipo}</b>${x.estrellas ? `<span class="admstars">${'★'.repeat(x.estrellas)}${'☆'.repeat(5 - x.estrellas)}</span>` : ''}<span class="admsec">${esc(SEC[x.seccion] || x.seccion)}</span><span class="admdate">${x.fecha ? new Date(x.fecha).toLocaleString('es-HN', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</span></div>
            <p class="admmsg">${esc(x.mensaje)}</p>
            <div class="admmeta">${x.nombre ? esc(x.nombre) : 'Anónimo'}${x.correo ? ` · <a href="mailto:${esc(x.correo)}">${esc(x.correo)}</a>` : ''}</div>
            <div class="admact">
              <select class="sel" data-st="${x.id}">${Object.entries(ESTADO).map(([k, [t]]) => `<option value="${k}" ${x.estado === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
              <input class="inp" data-nt="${x.id}" placeholder="Nota interna (solo autores)" value="${esc(x.nota || '')}">
              <button class="btn sm" data-del="${x.id}">Eliminar</button>
            </div>
          </div>`).join('') : '<p style="color:var(--muted)">No hay mensajes con esos filtros.</p>'}
      </div>`;
    $('fT').onchange = e => { FIL.tipo = e.target.value; render(); };
    $('fE').onchange = e => { FIL.estado = e.target.value; render(); };
    $('fQ').oninput = e => { FIL.q = e.target.value; clearTimeout(render.t); render.t = setTimeout(() => { render(); const q = $('fQ'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 300); };
    $('csv').onclick = csv;
    document.querySelectorAll('[data-st]').forEach(s => s.onchange = async () => { await save(s.dataset.st, { estado: s.value }); render(); });
    document.querySelectorAll('[data-nt]').forEach(s => s.onchange = () => save(s.dataset.nt, { nota: s.value.slice(0, 500) }));
    document.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => { if (confirm('¿Eliminar este mensaje? No se puede deshacer.')) { await del(b.dataset.del); render(); } });
  }

  function csv() {
    const cols = ['fecha', 'tipo', 'seccion', 'estrellas', 'mensaje', 'nombre', 'correo', 'estado', 'nota'];
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const blob = new Blob(['﻿' + [cols.join(','), ...ROWS.map(r => cols.map(c => q(r[c])).join(','))].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'opiniones-simulador.csv'; a.click();
  }

  (async () => {
    if (PREVIEW) return loginView();
    const { auth, a } = await sdk();
    auth.onAuthStateChanged(a, u => { if (!u) return loginView(); if (!isAdmin(u)) { auth.signOut(a); return loginView('Esta cuenta no está registrada como autor.'); } panel(u); });
  })();
})();
