/* =====================================================================
   Opiniones y sugerencias: formulario, valoraciones y comentarios publicados.
   - La pestaña "Opiniones y sugerencias" tiene el formulario y los comentarios.
   - En Inicio, un recuadro desplegable muestra la valoración y los comentarios
     (solo los que la administradora publica desde admin.html; nunca correos).
   ===================================================================== */
(function () {
  'use strict';
  const EXT = window.PAGES_EXT = window.PAGES_EXT || {};
  const A = () => window.APP, L = (es, en) => A().L(es, en), $ = id => document.getElementById(id);
  const esc = s => A().esc(s ?? '');
  const ST = window.STORE;

  const TIPOS = () => [['opinion', '💬 ' + L('Opinión', 'Opinion')], ['sugerencia', '💡 ' + L('Sugerencia de cambio', 'Change suggestion')], ['error', '🐞 ' + L('Reportar un error', 'Report a bug')], ['pregunta', '❓ ' + L('Pregunta', 'Question')]];
  const SECCIONES = () => [['general', L('El simulador en general', 'The simulator in general')], ['home', L('Inicio (vista 3D y asistente)', 'Home (3D view and wizard)')], ['mount', L('Montaje y diagrama', 'Installation & diagram')], ['gen', L('Generador FV', 'PV generator')], ['iv', L('Curvas y MPPT', 'Curves & MPPT')], ['site', L('Sitio y clima', 'Site & weather')], ['bat', L('Baterías', 'Batteries')], ['conv', L('Conversión y distribución', 'Conversion & distribution')], ['grid', L('Red eléctrica', 'Power grid')], ['sim', L('Simulación', 'Simulation')], ['install', L('Normativa y equipos', 'Regulations & equipment')]];
  const F = { tipo: 'opinion', estrellas: 0 };
  let PUB = null;   // caché de comentarios publicados

  const starsTxt = n => '★'.repeat(n) + '☆'.repeat(5 - n);
  const fdate = s => { try { return new Date(s).toLocaleDateString(A().LANG === 'en' ? 'en-US' : 'es-HN', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return ''; } };
  async function publicList(force) { if (!PUB || force) { try { PUB = await ST.listPublic(30); } catch (e) { PUB = []; } } return PUB; }
  function summary(list) {
    const r = list.filter(x => x.estrellas > 0), avg = r.length ? r.reduce((a, x) => a + x.estrellas, 0) / r.length : 0;
    return { n: list.length, nr: r.length, avg };
  }
  const reviewHTML = list => list.length ? list.map(x => `<div class="rev"><div class="revh"><b>${esc(x.nombre || L('Anónimo', 'Anonymous'))}</b>${x.estrellas ? `<span class="revs" aria-label="${x.estrellas} / 5">${starsTxt(x.estrellas)}</span>` : ''}<span class="revd">${fdate(x.fecha)}</span></div><p>${esc(x.mensaje)}</p></div>`).join('')
    : `<p class="revnone">${L('Todavía no hay comentarios publicados. ¡Sé la primera persona en opinar!', 'No published comments yet. Be the first to share your opinion!')}</p>`;

  /* ---------- Recuadro desplegable en Inicio ---------- */
  EXT.reviewsBox = async function (el) {
    if (!el) return;
    const list = await publicList(), s = summary(list);
    if (!el.isConnected) return;   // Inicio se redibujó mientras se leían los comentarios
    const head = s.nr ? `<span class="revavg">★ ${s.avg.toFixed(1)}</span><span>${L(`de 5 · ${s.nr} valoraciones`, `of 5 · ${s.nr} ratings`)}</span>` : `<span>${L('Opiniones de usuarios', 'User reviews')}</span>`;
    el.innerHTML = `<details class="card revbox"><summary>${head}<span class="revmore">${L(`Ver comentarios (${s.n})`, `See comments (${s.n})`)}</span></summary>
      <div class="revlist">${reviewHTML(list.slice(0, 8))}</div>
      <div class="btns" style="margin-top:12px"><button class="btn pri sm" id="revGo">${L('Dejar mi opinión', 'Leave my opinion')}</button>${list.length > 8 ? `<button class="btn sm" id="revAll">${L('Ver todas', 'See all')}</button>` : ''}</div></details>`;
    const go = () => A().go('opinion');
    el.querySelector('#revGo').onclick = go; const all = el.querySelector('#revAll'); if (all) all.onclick = go;
  };

  /* ---------- Pestaña de opiniones ---------- */
  EXT.opinion = function () {
    $('p-opinion').innerHTML = `
      <div class="intro"><h2>${L('Opiniones y sugerencias', 'Feedback and suggestions')}</h2><p>${L('¿Qué te pareció el simulador? Cuéntanos qué mejorarías, qué no funciona o qué te gustaría que hiciera. Lo leen directamente los autores.', 'What did you think of the simulator? Tell us what you would improve, what does not work or what you would like it to do. The authors read it directly.')}</p></div>
      <div class="grid g-main">
        <div class="card">
          <h3>${L('Escríbenos', 'Write to us')}</h3>
          <div class="fbtypes">${TIPOS().map(([k, t]) => `<button type="button" data-fbt="${k}" class="${F.tipo === k ? 'on' : ''}">${t}</button>`).join('')}</div>
          <div class="field"><label>${L('¿Sobre qué parte?', 'About which part?')}</label><select class="sel" id="fbSec">${SECCIONES().map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select></div>
          ${F.tipo === 'opinion' ? `<div class="field wide"><label>${L('Tu valoración', 'Your rating')}</label><div class="stars">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-star="${n}" class="${n <= F.estrellas ? 'on' : ''}" aria-label="${n}">★</button>`).join('')}</div></div>` : ''}
          <div class="field wide"><label>${{ opinion: L('Tu opinión', 'Your opinion'), sugerencia: L('¿Qué cambiarías o agregarías?', 'What would you change or add?'), error: L('¿Qué pasó y qué esperabas que pasara?', 'What happened and what did you expect?'), pregunta: L('Tu pregunta', 'Your question') }[F.tipo]}</label><textarea id="fbMsg" rows="5" maxlength="2000" placeholder="${L('Escribe aquí…', 'Write here…')}"></textarea></div>
          <div class="grid g-2" style="gap:0 16px">
            <div class="field wide"><label>${L('Nombre (opcional)', 'Name (optional)')}</label><input id="fbName" maxlength="80"></div>
            <div class="field wide"><label>${L('Correo (opcional, solo si quieres respuesta)', 'Email (optional, only if you want a reply)')}</label><input id="fbMail" type="email" maxlength="120"></div>
          </div>
          <input id="fbHp" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
          <p class="fbpriv">${L('Tu correo nunca se publica. Algunos comentarios, con tu nombre si lo escribiste, pueden mostrarse en el sitio después de revisarlos.', 'Your email is never published. Some comments, with your name if you wrote it, may be shown on the site after review.')}</p>
          <div class="btns"><button class="btn pri" id="fbSend">${L('Enviar', 'Send')}</button><span id="fbOk" class="fbmsg"></span></div>
        </div>
        <div class="card"><h3>${L('Lo que dicen los usuarios', 'What users say')}</h3><div id="fbPub"><p class="revnone">${L('Cargando…', 'Loading…')}</p></div></div>
      </div>`;
    bind();
    publicList().then(list => {
      const el = $('fbPub'); if (!el) return; const s = summary(list);
      el.innerHTML = (s.nr ? `<div class="revtop"><span class="revavg big">★ ${s.avg.toFixed(1)}</span><span>${L(`de 5 · ${s.nr} valoraciones`, `of 5 · ${s.nr} ratings`)}</span></div>` : '') + `<div class="revlist">${reviewHTML(list)}</div>`;
    });
  };

  function bind() {
    document.querySelectorAll('[data-fbt]').forEach(b => b.onclick = () => { const keep = $('fbMsg').value; F.tipo = b.dataset.fbt; EXT.opinion(); $('fbMsg').value = keep; });
    document.querySelectorAll('[data-star]').forEach(b => b.onclick = () => { F.estrellas = +b.dataset.star; document.querySelectorAll('[data-star]').forEach(x => x.classList.toggle('on', +x.dataset.star <= F.estrellas)); });
    $('fbSend').onclick = send;
  }
  async function send() {
    const msg = $('fbMsg').value.trim(), ok = $('fbOk'), btn = $('fbSend');
    if ($('fbHp').value) return;                              // trampa para robots de spam
    if (msg.length < 4) { ok.textContent = L('Escribe un poco más, por favor.', 'Please write a bit more.'); ok.className = 'fbmsg bad'; return; }
    const doc = { tipo: F.tipo, seccion: $('fbSec').value, estrellas: F.tipo === 'opinion' ? F.estrellas : 0, mensaje: msg.slice(0, 2000), nombre: $('fbName').value.trim().slice(0, 80), correo: $('fbMail').value.trim().slice(0, 120), idioma: A().LANG };
    btn.disabled = true; ok.textContent = L('Enviando…', 'Sending…'); ok.className = 'fbmsg';
    try {
      await ST.add(doc);
      ok.textContent = L('¡Gracias! Recibimos tu mensaje.', 'Thank you! We received your message.') + (ST.PREVIEW ? ' (' + L('vista previa: no se envió a internet', 'preview: not sent online') + ')' : ''); ok.className = 'fbmsg ok';
      $('fbMsg').value = ''; F.estrellas = 0; document.querySelectorAll('[data-star]').forEach(x => x.classList.remove('on'));
    } catch (e) { ok.textContent = L('No se pudo enviar. Intenta de nuevo más tarde.', 'Could not send. Please try again later.'); ok.className = 'fbmsg bad'; }
    btn.disabled = false;
  }
})();
