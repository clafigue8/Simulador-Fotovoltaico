/* =====================================================================
   Panel de administración de opiniones (como un correo):
   carpetas a la izquierda, mensajes a la derecha.
   Quién puede entrar lo deciden las reglas de Firestore (en la consola de
   Firebase), no esta página: aquí no se guarda ningún correo.
   ===================================================================== */
(function () {
  'use strict';
  const ST = window.STORE, $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const TIPO = { opinion: '💬 Opinión', sugerencia: '💡 Sugerencia', error: '🐞 Error', pregunta: '❓ Pregunta' };
  const SEC = { general: 'General', home: 'Inicio', mount: 'Montaje', gen: 'Generador FV', iv: 'Curvas y MPPT', site: 'Sitio y clima', bat: 'Baterías', conv: 'Conversión', grid: 'Red eléctrica', sim: 'Simulación', install: 'Normativa' };
  const ESTADO = { nuevo: 'Nuevo', revision: 'En revisión', hecho: 'Resuelto' };
  const FIXED = [['entrada', '📥', 'Entrada'], ['publicados', '🌐', 'Publicados en el sitio'], ['archivo', '🗄️', 'Archivo'], ['papelera', '🗑️', 'Papelera']];
  let DENIED = false;
  let ROWS = [], FOLDERS = [], CUR = 'entrada', Q = '', TF = 'todos', EDIT = null, USER = null;

  const inFolder = (r, f) => f === 'publicados' ? r.publicado && r.carpeta !== 'papelera' : (r.carpeta || 'entrada') === f;
  const count = f => ROWS.filter(r => inFolder(r, f)).length;
  const unread = f => ROWS.filter(r => inFolder(r, f) && r.estado === 'nuevo').length;
  const fdate = s => s ? new Date(s).toLocaleString('es-HN', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  const toast = t => { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2200); };

  function loginView(msg = '') {
    $('who').innerHTML = '';
    $('adm').innerHTML = `<div class="card admlogin"><h3>Panel de administración</h3><p>Entra con tu cuenta de Google para administrar el simulador: opiniones, visitas, datos, equipos, textos y colores.</p><button class="btn pri" id="gIn">Entrar con Google</button>${ST.PREVIEW ? '<p class="note2">Vista previa: Firebase aún no está configurado; se usan datos de ejemplo guardados en este navegador.</p>' : ''}${msg ? `<p class="admerr">${esc(msg)}</p>` : ''}</div>`;
    $('gIn').onclick = async () => { try { await ST.signIn(); if (ST.PREVIEW) start({ displayName: 'Claudia (vista previa)' }); } catch (e) { loginView('No se pudo iniciar sesión.'); } };
  }

  async function start(user) {
    USER = user;
    $('who').innerHTML = `<span class="admwho">${esc(user.displayName || user.email)}</span> <button class="btn sm" id="gOut">Salir</button>`;
    $('gOut').onclick = async () => { await ST.signOut(); loginView(); };
    $('adm').innerHTML = '<p style="padding:24px">Cargando…</p>';
    try { [ROWS, FOLDERS] = await Promise.all([ST.listAll(), ST.getFolders()]); }
    catch (e) { DENIED = true; await ST.signOut(); return loginView('Esta cuenta no tiene permiso de administración.'); }
    shell();
  }

  /* ---------- Secciones del panel ---------- */
  const SECTIONS = [['opiniones', '💬', 'Opiniones'], ['visitas', '📊', 'Visitas'], ['datos', '⚙️', 'Datos técnicos'], ['equipos', '🔌', 'Equipos'], ['textos', '📝', 'Textos y avisos'], ['colores', '🎨', 'Colores']];
  let SECTION = (() => { try { return sessionStorage.getItem('adm-sec') || 'opiniones'; } catch (e) { return 'opiniones'; } })();
  function shell() {
    const nuevos = ROWS.filter(r => r.estado === 'nuevo' && r.carpeta !== 'papelera').length;
    $('adm').innerHTML = `<nav class="admnav">${SECTIONS.map(([k, ic, t]) => `<button data-sec="${k}" class="${SECTION === k ? 'on' : ''}"><span>${ic}</span>${t}${k === 'opiniones' && nuevos ? `<b>${nuevos}</b>` : ''}</button>`).join('')}<a class="admsite" href="./" target="_blank" rel="noopener">Ver el sitio ↗</a></nav><div id="admBody"></div><div class="toast" id="toast"></div>`;
    document.querySelectorAll('[data-sec]').forEach(b => b.onclick = () => { SECTION = b.dataset.sec; try { sessionStorage.setItem('adm-sec', SECTION); } catch (e) { } shell(); });
    if (SECTION === 'opiniones') render();
    else window.ADMIN_SITE.render(SECTION, $('admBody'), toast);
  }

  function render() {
    const st = ROWS.filter(r => r.estrellas > 0 && r.carpeta !== 'papelera'), avg = st.length ? st.reduce((a, r) => a + r.estrellas, 0) / st.length : 0;
    const list = ROWS.filter(r => inFolder(r, CUR) && (TF === 'todos' || r.tipo === TF) && (!Q || (r.mensaje + ' ' + r.nombre + ' ' + (r.nota || '')).toLowerCase().includes(Q.toLowerCase())));
    const fItem = (k, ic, name, custom) => `<button class="fold ${CUR === k ? 'on' : ''}" data-f="${esc(k)}"><span>${ic}</span><span class="fn">${esc(name)}</span>${unread(k) ? `<b class="fb">${unread(k)}</b>` : `<i>${count(k) || ''}</i>`}${custom ? `<span class="fx"><span data-ren="${esc(k)}" title="Cambiar nombre">✏️</span><span data-delf="${esc(k)}" title="Borrar carpeta">✕</span></span>` : ''}</button>`;
    const curName = (FIXED.find(f => f[0] === CUR) || [0, '📁', CUR])[2];
    $('admBody').innerHTML = `
      <div class="kpis admk">
        <div class="kpi"><small>Mensajes</small><b>${ROWS.filter(r => r.carpeta !== 'papelera').length}</b></div>
        <div class="kpi"><small>Sin leer</small><b>${ROWS.filter(r => r.estado === 'nuevo' && r.carpeta !== 'papelera').length}</b></div>
        <div class="kpi"><small>Valoración promedio</small><b>${st.length ? avg.toFixed(1) + ' ★' : '—'}<span>${st.length} votos</span></b></div>
        <div class="kpi"><small>Publicados en el sitio</small><b>${count('publicados')}</b></div>
      </div>
      <div class="admgrid">
        <aside class="card folders">
          ${FIXED.map(([k, ic, n]) => fItem(k, ic, n)).join('')}
          <div class="fsep">Mis carpetas</div>
          ${FOLDERS.map(f => fItem(f, '📁', f, true)).join('')}
          <button class="fold newf" id="newF"><span>＋</span><span class="fn">Nueva carpeta</span></button>
        </aside>
        <section class="card msgs">
          <div class="admbar"><h3>${esc(curName)}</h3><span class="sp"></span>
            <select class="sel" id="fT"><option value="todos">Todos los tipos</option>${Object.entries(TIPO).map(([k, t]) => `<option value="${k}" ${TF === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
            <input class="inp" id="fQ" placeholder="🔍 Buscar…" value="${esc(Q)}">
            <button class="btn sm" id="csv" title="Descargar todo en Excel">⬇️ Excel</button>
            ${CUR === 'papelera' && list.length ? '<button class="btn sm" id="empty">Vaciar papelera</button>' : ''}
          </div>
          ${list.length ? list.map(card).join('') : `<p class="empty">${CUR === 'papelera' ? 'La papelera está vacía.' : 'No hay mensajes aquí.'}</p>`}
        </section>
      </div>`;
    bind(list);
  }

  function card(r) {
    const ed = EDIT === r.id, moveOpts = [['entrada', '📥 Entrada'], ['archivo', '🗄️ Archivo'], ...FOLDERS.map(f => [f, '📁 ' + f])].filter(([k]) => k !== (r.carpeta || 'entrada'));
    return `<article class="msg ${r.estado === 'nuevo' ? 'unread' : ''}" data-id="${r.id}">
      <div class="mh"><b>${TIPO[r.tipo] || r.tipo}</b>${r.estrellas ? `<span class="admstars">${'★'.repeat(r.estrellas)}${'☆'.repeat(5 - r.estrellas)}</span>` : ''}<span class="tag">${esc(SEC[r.seccion] || r.seccion)}</span>${r.publicado ? '<span class="tag pub">🌐 Publicado</span>' : ''}<span class="md">${fdate(r.fecha)}</span></div>
      ${ed ? `<div class="edit">
          <label>Nombre<input class="inp" id="eN" value="${esc(r.nombre)}" maxlength="80"></label>
          ${r.tipo === 'opinion' ? `<label>Estrellas<select class="sel" id="eS">${[0, 1, 2, 3, 4, 5].map(n => `<option value="${n}" ${n === r.estrellas ? 'selected' : ''}>${n ? '★'.repeat(n) : 'Sin valoración'}</option>`).join('')}</select></label>` : ''}
          <label class="w">Mensaje<textarea class="inp" id="eM" rows="4" maxlength="2000">${esc(r.mensaje)}</textarea></label>
          <label class="w">Nota interna (solo tú la ves)<input class="inp" id="eT" value="${esc(r.nota || '')}" maxlength="500"></label>
          <div class="btns"><button class="btn pri sm" data-save="${r.id}">Guardar cambios</button><button class="btn sm" data-cancel="1">Cancelar</button></div></div>`
      : `<p class="mm">${esc(r.mensaje)}</p>
         <div class="mf">${r.nombre ? esc(r.nombre) : 'Anónimo'}${r.correo ? ` · <a href="mailto:${esc(r.correo)}">✉️ ${esc(r.correo)}</a>` : ''}${r.nota ? ` · <span class="nota">📝 ${esc(r.nota)}</span>` : ''}</div>`}
      ${ed ? '' : `<div class="ma">
        ${r.carpeta === 'papelera'
          ? `<button class="btn sm" data-restore="${r.id}">↩️ Restaurar</button><button class="btn sm danger" data-kill="${r.id}">Eliminar para siempre</button>`
          : `<button class="btn sm ${r.publicado ? '' : 'pri'}" data-pub="${r.id}">${r.publicado ? '🙈 Quitar del sitio' : '🌐 Publicar en el sitio'}</button>
             <select class="sel" data-st="${r.id}" title="Estado">${Object.entries(ESTADO).map(([k, t]) => `<option value="${k}" ${r.estado === k ? 'selected' : ''}>${t}</option>`).join('')}</select>
             <select class="sel" data-mv="${r.id}"><option value="">📁 Mover a…</option>${moveOpts.map(([k, t]) => `<option value="${esc(k)}">${esc(t)}</option>`).join('')}</select>
             <button class="btn sm" data-edit="${r.id}">✏️ Editar</button>
             <button class="btn sm" data-trash="${r.id}">🗑️</button>`}
      </div>`}
    </article>`;
  }

  function bind(list) {
    const row = id => ROWS.find(r => r.id === id);
    const act = (sel, fn) => document.querySelectorAll(sel).forEach(el => el.onclick = async e => { e.stopPropagation(); try { await fn(el); } catch (err) { toast('No se pudo guardar. Revisa tu conexión.'); } });
    document.querySelectorAll('[data-f]').forEach(b => b.onclick = e => { if (e.target.closest('[data-ren],[data-delf]')) return; CUR = b.dataset.f; EDIT = null; render(); });
    $('fT').onchange = e => { TF = e.target.value; render(); };
    $('fQ').oninput = e => { Q = e.target.value; clearTimeout(bind.t); bind.t = setTimeout(() => { render(); const q = $('fQ'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 300); };
    $('csv').onclick = csv;
    $('newF').onclick = async () => { const n = (prompt('Nombre de la nueva carpeta:') || '').trim(); if (!n) return; if (FOLDERS.includes(n) || FIXED.some(f => f[0] === n)) return toast('Ya existe una carpeta con ese nombre.'); FOLDERS.push(n); await ST.setFolders(FOLDERS); CUR = n; render(); toast('Carpeta creada.'); };
    act('[data-ren]', async el => { const old = el.dataset.ren, n = (prompt('Nuevo nombre de la carpeta:', old) || '').trim(); if (!n || n === old) return; FOLDERS = FOLDERS.map(f => f === old ? n : f); await ST.setFolders(FOLDERS); for (const r of ROWS.filter(r => r.carpeta === old)) await ST.update(r, { carpeta: n }); if (CUR === old) CUR = n; render(); toast('Carpeta renombrada.'); });
    act('[data-delf]', async el => { const f = el.dataset.delf; if (!confirm(`¿Borrar la carpeta "${f}"? Sus mensajes vuelven a Entrada.`)) return; for (const r of ROWS.filter(r => r.carpeta === f)) await ST.update(r, { carpeta: 'entrada' }); FOLDERS = FOLDERS.filter(x => x !== f); await ST.setFolders(FOLDERS); if (CUR === f) CUR = 'entrada'; render(); toast('Carpeta borrada.'); });
    act('[data-pub]', async el => { const r = row(el.dataset.pub); await ST.setPublished(r, !r.publicado); render(); toast(r.publicado ? 'Ahora se ve en el sitio.' : 'Ya no se ve en el sitio.'); });
    document.querySelectorAll('[data-st]').forEach(s => s.onchange = async () => { try { await ST.update(row(s.dataset.st), { estado: s.value }); render(); } catch (e) { toast('No se pudo guardar.'); } });
    document.querySelectorAll('[data-mv]').forEach(s => s.onchange = async () => { if (!s.value) return; try { await ST.update(row(s.dataset.mv), { carpeta: s.value }); render(); toast('Mensaje movido.'); } catch (e) { toast('No se pudo mover.'); } });
    act('[data-edit]', async el => { EDIT = el.dataset.edit; render(); });
    act('[data-cancel]', async () => { EDIT = null; render(); });
    act('[data-save]', async el => { const r = row(el.dataset.save), p = { nombre: $('eN').value.trim(), mensaje: $('eM').value.trim().slice(0, 2000), nota: $('eT').value.trim() }; if ($('eS')) p.estrellas = +$('eS').value; if (p.mensaje.length < 1) return toast('El mensaje no puede quedar vacío.'); await ST.update(r, p); EDIT = null; render(); toast('Cambios guardados.'); });
    act('[data-trash]', async el => { const r = row(el.dataset.trash); if (r.publicado) await ST.setPublished(r, false); await ST.update(r, { carpeta: 'papelera', carpetaPrev: r.carpeta || 'entrada' }); render(); toast('Movido a la papelera.'); });
    act('[data-restore]', async el => { const r = row(el.dataset.restore); await ST.update(r, { carpeta: r.carpetaPrev || 'entrada' }); render(); toast('Mensaje restaurado.'); });
    act('[data-kill]', async el => { if (!confirm('¿Eliminar este mensaje para siempre? No se puede deshacer.')) return; const r = row(el.dataset.kill); await ST.remove(r); ROWS = ROWS.filter(x => x !== r); render(); toast('Eliminado.'); });
    if ($('empty')) $('empty').onclick = async () => { const t = ROWS.filter(r => r.carpeta === 'papelera'); if (!confirm(`¿Eliminar para siempre ${t.length} mensaje(s)?`)) return; for (const r of t) await ST.remove(r); ROWS = ROWS.filter(r => r.carpeta !== 'papelera'); render(); toast('Papelera vaciada.'); };
    // al abrir un mensaje nuevo se marca como leído (pasa a "En revisión")
    document.querySelectorAll('.msg.unread').forEach(m => m.addEventListener('click', async e => { if (e.target.closest('button,select,input,textarea,a')) return; const r = row(m.dataset.id); if (r && r.estado === 'nuevo') { await ST.update(r, { estado: 'revision' }); render(); } }));
  }

  function csv() {
    const cols = ['fecha', 'tipo', 'seccion', 'estrellas', 'mensaje', 'nombre', 'correo', 'estado', 'carpeta', 'publicado', 'nota'];
    const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const blob = new Blob(['﻿' + [cols.join(','), ...ROWS.map(r => cols.map(c => q(r[c])).join(','))].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'opiniones-simulador.csv'; a.click();
  }

  ST.onAuth(u => { if (u) { DENIED = false; start(u); } else loginView(DENIED ? 'Esta cuenta no tiene permiso de administración.' : ''); });
})();
