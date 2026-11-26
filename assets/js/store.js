/* =====================================================================
   Almacén de opiniones: Firebase Firestore (o datos de ejemplo en vista previa).
   Colecciones:
     opiniones/{id}  mensajes completos (solo la administradora puede leerlos)
     publicas/{id}   copia sin correo de los comentarios publicados (lectura pública)
     config/carpetas lista de carpetas creadas en el panel
   ===================================================================== */
(function () {
  'use strict';
  const CFG = (window.SITE_CONFIG || {}).firebase || {};
  // vista previa: sin configurar, o al abrir el archivo local con ?demo (para pruebas)
  const PREVIEW = !CFG.apiKey || /PEGAR_AQUI/.test(CFG.apiKey) || (location.protocol === 'file:' && /demo/.test(location.search));
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  let fb = null;
  async function sdk() {
    if (fb) return fb;
    const app = await import(SDK + 'firebase-app.js'), fs = await import(SDK + 'firebase-firestore.js'), auth = await import(SDK + 'firebase-auth.js');
    const inst = app.getApps().length ? app.getApp() : app.initializeApp(CFG);
    fb = { fs, auth, db: fs.getFirestore(inst), a: auth.getAuth(inst) };
    return fb;
  }
  const iso = v => v && v.toDate ? v.toDate().toISOString() : v;

  /* ---------- vista previa: datos de ejemplo en el navegador ---------- */
  const K = 'opiniones-vista-previa';
  const SAMPLE = [
    { id: 'e1', tipo: 'opinion', seccion: 'general', estrellas: 5, mensaje: 'Muy buena herramienta, la usamos en la clase de energías renovables. La vista 3D ayuda mucho a entender.', nombre: 'Prof. Martínez', correo: 'ejemplo1@correo.com', estado: 'hecho', carpeta: 'entrada', publicado: true, fecha: '2026-11-25T15:02:00' },
    { id: 'e2', tipo: 'opinion', seccion: 'home', estrellas: 4, mensaje: 'Me gustó poder ver el clima real del día. Sería bueno agregar más ciudades.', nombre: 'Andrea', correo: '', estado: 'revision', carpeta: 'entrada', publicado: true, fecha: '2026-11-24T10:41:00' },
    { id: 'e3', tipo: 'sugerencia', seccion: 'home', estrellas: 0, mensaje: 'Sería útil poder poner el consumo de los 12 meses y no solo de 3 recibos.', nombre: 'Luis', correo: 'ejemplo2@correo.com', estado: 'nuevo', carpeta: 'entrada', publicado: false, fecha: '2026-11-24T08:15:00' },
    { id: 'e4', tipo: 'error', seccion: 'iv', estrellas: 0, mensaje: 'En el celular la gráfica de curvas se corta a la derecha.', nombre: '', correo: '', estado: 'hecho', carpeta: 'Errores corregidos', publicado: false, fecha: '2026-11-23T19:15:00', nota: 'Corregido el 24/11.' },
    { id: 'e5', tipo: 'pregunta', seccion: 'install', estrellas: 0, mensaje: '¿El límite de la ley es anual o mensual?', nombre: 'María', correo: 'ejemplo3@correo.com', estado: 'nuevo', carpeta: 'entrada', publicado: false, fecha: '2026-11-23T08:30:00' },
    { id: 'e6', tipo: 'opinion', seccion: 'general', estrellas: 5, mensaje: 'Excelente para el seminario, muy completo.', nombre: 'Carlos', correo: '', estado: 'hecho', carpeta: 'entrada', publicado: true, fecha: '2026-11-22T21:05:00' }
  ];
  const mock = {
    get() { try { const v = JSON.parse(localStorage.getItem(K)); if (v && v.rows) return v; } catch (e) { } return { rows: SAMPLE.map(x => ({ ...x })), folders: ['Errores corregidos', 'Ideas para la tesis'] }; },
    set(v) { try { localStorage.setItem(K, JSON.stringify(v)); } catch (e) { } }
  };
  const pub = r => ({ tipo: r.tipo, estrellas: r.estrellas || 0, mensaje: r.mensaje, nombre: r.nombre || '', fecha: r.fecha });

  window.STORE = {
    PREVIEW,
    // Público: enviar una opinión
    async add(doc) {
      const d = { ...doc, estado: 'nuevo' };
      if (PREVIEW) { const v = mock.get(); v.rows.unshift({ ...d, id: 'p' + Date.now(), carpeta: 'entrada', publicado: false, fecha: new Date().toISOString() }); mock.set(v); return; }
      const { fs, db } = await sdk();
      await fs.addDoc(fs.collection(db, 'opiniones'), { ...d, fecha: fs.serverTimestamp() });
    },
    // Público: comentarios publicados (sin correos)
    async listPublic(n = 30) {
      if (PREVIEW) return mock.get().rows.filter(r => r.publicado).map(r => ({ id: r.id, ...pub(r) })).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, n);
      // lectura pública por la API REST: no hace falta descargar la librería de Firebase en Inicio
      const url = `https://firestore.googleapis.com/v1/projects/${CFG.projectId}/databases/(default)/documents/publicas?pageSize=${n}&orderBy=fecha%20desc&key=${CFG.apiKey}`;
      const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json(), val = v => v == null ? '' : v.stringValue ?? (v.integerValue != null ? +v.integerValue : v.doubleValue ?? v.timestampValue ?? v.booleanValue ?? '');
      return (j.documents || []).map(d => { const f = d.fields || {}; return { id: d.name.split('/').pop(), tipo: val(f.tipo), estrellas: +val(f.estrellas) || 0, mensaje: val(f.mensaje), nombre: val(f.nombre), fecha: val(f.fecha) }; });
    },
    // Administración
    async onAuth(cb) {
      if (PREVIEW) { cb(sessionStorage.getItem('adm-prev') ? { email: 'vista previa', displayName: 'Claudia (vista previa)' } : null); return; }
      const { auth, a } = await sdk(); auth.onAuthStateChanged(a, cb);
    },
    async signIn() {
      if (PREVIEW) { sessionStorage.setItem('adm-prev', '1'); return; }
      const { auth, a } = await sdk(); await auth.signInWithPopup(a, new auth.GoogleAuthProvider());
    },
    async signOut() {
      if (PREVIEW) { sessionStorage.removeItem('adm-prev'); return; }
      const { auth, a } = await sdk(); await auth.signOut(a);
    },
    async listAll() {
      if (PREVIEW) return mock.get().rows;
      const { fs, db } = await sdk();
      const s = await fs.getDocs(fs.query(fs.collection(db, 'opiniones'), fs.orderBy('fecha', 'desc')));
      return s.docs.map(d => ({ id: d.id, carpeta: 'entrada', publicado: false, ...d.data(), fecha: iso(d.data().fecha) }));
    },
    async update(row, patch) {
      Object.assign(row, patch);
      if (PREVIEW) { const v = mock.get(); const r = v.rows.find(x => x.id === row.id); Object.assign(r, patch); mock.set(v); return; }
      const { fs, db } = await sdk();
      await fs.updateDoc(fs.doc(db, 'opiniones', row.id), patch);
      // si está publicado, la copia pública se mantiene al día
      if (row.publicado && ['mensaje', 'nombre', 'estrellas'].some(k => k in patch)) await fs.setDoc(fs.doc(db, 'publicas', row.id), { ...pub(row), fecha: fs.Timestamp.fromDate(new Date(row.fecha)) });
    },
    async setPublished(row, on) {
      row.publicado = on;
      if (PREVIEW) { const v = mock.get(); v.rows.find(x => x.id === row.id).publicado = on; mock.set(v); return; }
      const { fs, db } = await sdk();
      await fs.updateDoc(fs.doc(db, 'opiniones', row.id), { publicado: on });
      if (on) await fs.setDoc(fs.doc(db, 'publicas', row.id), { ...pub(row), fecha: fs.Timestamp.fromDate(new Date(row.fecha)) });
      else await fs.deleteDoc(fs.doc(db, 'publicas', row.id));
    },
    async remove(row) {
      if (PREVIEW) { const v = mock.get(); v.rows = v.rows.filter(x => x.id !== row.id); mock.set(v); return; }
      const { fs, db } = await sdk();
      if (row.publicado) await fs.deleteDoc(fs.doc(db, 'publicas', row.id));
      await fs.deleteDoc(fs.doc(db, 'opiniones', row.id));
    },
    // Configuración del sitio (documento sitio/config con el JSON completo)
    async getSite() {
      if (PREVIEW) { try { return JSON.parse(localStorage.getItem('sitio-demo') || '{}'); } catch (e) { return {}; } }
      const { fs, db } = await sdk(); const d = await fs.getDoc(fs.doc(db, 'sitio', 'config'));
      return d.exists() && d.data().json ? JSON.parse(d.data().json) : {};
    },
    async setSite(cfg) {
      if (PREVIEW) { localStorage.setItem('sitio-demo', JSON.stringify(cfg)); return; }
      const { fs, db } = await sdk(); await fs.setDoc(fs.doc(db, 'sitio', 'config'), { json: JSON.stringify(cfg), actualizado: fs.serverTimestamp() });
    },
    // Visitas de los últimos días
    async listVisits(days = 30) {
      if (PREVIEW) {
        const out = [], secs = ['home', 'home', 'home', 'mount', 'gen', 'iv', 'site', 'opinion', 'install', 'sim'];
        for (let d = days - 1; d >= 0; d--) { const n = 4 + Math.round(10 * Math.abs(Math.sin(d * 1.7)) + (d < 7 ? 6 : 0)); for (let k = 0; k < n; k++) { const t = new Date(Date.now() - d * 864e5 - k * 3.6e6); const ses = 's' + d + '-' + Math.floor(k / 2); out.push({ fecha: t.toISOString(), seccion: secs[(k * 7 + d) % secs.length], disp: (k + d) % 3 ? 'movil' : 'escritorio', ses, lang: k % 5 ? 'es' : 'en' }); } }
        return out;
      }
      const { fs, db } = await sdk();
      const since = fs.Timestamp.fromDate(new Date(Date.now() - days * 864e5));
      const s = await fs.getDocs(fs.query(fs.collection(db, 'visitas'), fs.where('fecha', '>=', since), fs.orderBy('fecha', 'desc')));
      return s.docs.map(d => ({ ...d.data(), fecha: iso(d.data().fecha) }));
    },
    async getFolders() {
      if (PREVIEW) return mock.get().folders;
      const { fs, db } = await sdk(); const d = await fs.getDoc(fs.doc(db, 'config', 'carpetas'));
      return d.exists() ? d.data().lista || [] : [];
    },
    async setFolders(list) {
      if (PREVIEW) { const v = mock.get(); v.folders = list; mock.set(v); return; }
      const { fs, db } = await sdk(); await fs.setDoc(fs.doc(db, 'config', 'carpetas'), { lista: list });
    }
  };
})();
