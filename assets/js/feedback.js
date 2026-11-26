/* =====================================================================
   Opiniones y sugerencias + donación con PayPal
   Las opiniones se guardan en Firebase Firestore (colección "opiniones").
   Solo los autores pueden leerlas (ver firestore.rules y admin.html).
   ===================================================================== */
(function () {
  'use strict';
  const EXT = window.PAGES_EXT = window.PAGES_EXT || {};
  const A = () => window.APP, L = (es, en) => A().L(es, en), $ = id => document.getElementById(id);
  const CFG = window.SITE_CONFIG || {};
  const PREVIEW = !CFG.firebase || /PEGAR_AQUI/.test(CFG.firebase.apiKey);
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  let db = null;

  async function firestore() {
    if (db) return db;
    const app = await import(SDK + 'firebase-app.js'), fs = await import(SDK + 'firebase-firestore.js');
    const inst = app.getApps().length ? app.getApp() : app.initializeApp(CFG.firebase);
    db = { fs, ref: fs.getFirestore(inst) };
    return db;
  }

  const TIPOS = () => [['opinion', '💬 ' + L('Opinión', 'Opinion')], ['sugerencia', '💡 ' + L('Sugerencia de cambio', 'Change suggestion')], ['error', '🐞 ' + L('Reportar un error', 'Report a bug')], ['pregunta', '❓ ' + L('Pregunta', 'Question')]];
  const SECCIONES = () => [['general', L('El simulador en general', 'The simulator in general')], ['home', L('Inicio (vista 3D y asistente)', 'Home (3D view and wizard)')], ['mount', L('Montaje y diagrama', 'Installation & diagram')], ['gen', L('Generador FV', 'PV generator')], ['iv', L('Curvas y MPPT', 'Curves & MPPT')], ['site', L('Sitio y clima', 'Site & weather')], ['bat', L('Baterías', 'Batteries')], ['conv', L('Conversión y distribución', 'Conversion & distribution')], ['grid', L('Red eléctrica', 'Power grid')], ['sim', L('Simulación', 'Simulation')], ['install', L('Normativa y equipos', 'Regulations & equipment')]];
  const F = { tipo: 'opinion', estrellas: 0 };

  EXT.opinion = function () {
    const esc = A().esc;
    $('p-opinion').innerHTML = `
      <div class="intro"><h2>${L('Opiniones y sugerencias', 'Feedback and suggestions')}</h2><p>${L('¿Qué te pareció el simulador? Cuéntanos qué mejorarías, qué no funciona o qué te gustaría que hiciera. Lo leen directamente los autores.', 'What did you think of the simulator? Tell us what you would improve, what does not work or what you would like it to do. The authors read it directly.')}</p></div>
      <div class="grid g-main">
        <div class="card">
          <h3>${L('Escríbenos', 'Write to us')}</h3>
          <div class="fbtypes">${TIPOS().map(([k, t]) => `<button type="button" data-fbt="${k}" class="${F.tipo === k ? 'on' : ''}">${t}</button>`).join('')}</div>
          <div class="field"><label>${L('¿Sobre qué parte?', 'About which part?')}</label><select class="sel" id="fbSec">${SECCIONES().map(([k, t]) => `<option value="${k}">${esc(t)}</option>`).join('')}</select></div>
          ${F.tipo === 'opinion' ? `<div class="field wide"><label>${L('Tu valoración', 'Your rating')}</label><div class="stars" id="fbStars">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-star="${n}" class="${n <= F.estrellas ? 'on' : ''}" aria-label="${n}">★</button>`).join('')}</div></div>` : ''}
          <div class="field wide"><label>${{ opinion: L('Tu opinión', 'Your opinion'), sugerencia: L('¿Qué cambiarías o agregarías?', 'What would you change or add?'), error: L('¿Qué pasó y qué esperabas que pasara?', 'What happened and what did you expect?'), pregunta: L('Tu pregunta', 'Your question') }[F.tipo]}</label><textarea id="fbMsg" rows="5" maxlength="2000" placeholder="${L('Escribe aquí…', 'Write here…')}"></textarea></div>
          <div class="grid g-2" style="gap:0 16px">
            <div class="field wide"><label>${L('Nombre (opcional)', 'Name (optional)')}</label><input id="fbName" maxlength="80"></div>
            <div class="field wide"><label>${L('Correo (opcional, solo si quieres respuesta)', 'Email (optional, only if you want a reply)')}</label><input id="fbMail" type="email" maxlength="120"></div>
          </div>
          <input id="fbHp" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
          <p class="fbpriv">${L('Tus datos solo los ven los tres autores y no se comparten con nadie.', 'Your data is seen only by the three authors and is not shared with anyone.')}</p>
          <div class="btns"><button class="btn pri" id="fbSend">${L('Enviar', 'Send')}</button><span id="fbOk" class="fbmsg"></span></div>
        </div>
        <div class="card donate">
          <div class="dicon">☕</div>
          <h3>${L('Apoya el proyecto', 'Support the project')}</h3>
          <p>${L('El simulador es gratuito y sin anuncios. Si te fue útil, puedes ayudarnos a mantener el dominio y seguir mejorándolo.', 'The simulator is free and ad-free. If it helped you, you can help us keep the domain and keep improving it.')}</p>
          <a class="btn paypal" href="${esc(CFG.paypal || '#')}" target="_blank" rel="noopener">${L('Donar con', 'Donate with')} <b>PayPal</b></a>
          <small>${L('Se abre la página segura de PayPal. No necesitas cuenta: puedes pagar con tarjeta.', 'PayPal’s secure page opens. No account needed: you can pay by card.')}</small>
        </div>
      </div>`;
    bind();
  };

  function bind() {
    document.querySelectorAll('[data-fbt]').forEach(b => b.onclick = () => { const keep = $('fbMsg').value; F.tipo = b.dataset.fbt; EXT.opinion(); $('fbMsg').value = keep; });
    document.querySelectorAll('[data-star]').forEach(b => b.onclick = () => { F.estrellas = +b.dataset.star; document.querySelectorAll('[data-star]').forEach(x => x.classList.toggle('on', +x.dataset.star <= F.estrellas)); });
    $('fbSend').onclick = send;
  }

  async function send() {
    const msg = $('fbMsg').value.trim(), ok = $('fbOk'), btn = $('fbSend');
    if ($('fbHp').value) return;                              // trampa para robots
    if (msg.length < 4) { ok.textContent = L('Escribe un poco más, por favor.', 'Please write a bit more.'); ok.className = 'fbmsg bad'; return; }
    const doc = { tipo: F.tipo, seccion: $('fbSec').value, estrellas: F.tipo === 'opinion' ? F.estrellas : 0, mensaje: msg.slice(0, 2000), nombre: $('fbName').value.trim().slice(0, 80), correo: $('fbMail').value.trim().slice(0, 120), idioma: A().LANG, estado: 'nuevo' };
    btn.disabled = true; ok.textContent = L('Enviando…', 'Sending…'); ok.className = 'fbmsg';
    try {
      if (PREVIEW) { const k = 'fb-preview'; const a = JSON.parse(localStorage.getItem(k) || '[]'); a.push({ ...doc, fecha: new Date().toISOString() }); localStorage.setItem(k, JSON.stringify(a)); }
      else { const { fs, ref } = await firestore(); await fs.addDoc(fs.collection(ref, 'opiniones'), { ...doc, fecha: fs.serverTimestamp() }); }
      ok.textContent = L('¡Gracias! Recibimos tu mensaje.', 'Thank you! We received your message.') + (PREVIEW ? ' (' + L('vista previa: no se envió', 'preview: not sent') + ')' : ''); ok.className = 'fbmsg ok';
      $('fbMsg').value = ''; F.estrellas = 0; document.querySelectorAll('[data-star]').forEach(x => x.classList.remove('on'));
    } catch (e) { ok.textContent = L('No se pudo enviar. Intenta de nuevo más tarde.', 'Could not send. Please try again later.'); ok.className = 'fbmsg bad'; }
    btn.disabled = false;
  }
})();
