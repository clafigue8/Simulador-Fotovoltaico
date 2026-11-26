/* =====================================================================
   Configuración de servicios externos (opiniones, panel de autores y donaciones)
   Rellenar con los datos reales antes de publicar. Mientras diga PEGAR_AQUI,
   el sitio funciona en "modo de vista previa" y no envía nada a internet.
   ===================================================================== */
window.SITE_CONFIG = {
  // 1) Firebase: consola.firebase.google.com → Configuración del proyecto → Tus apps → Web
  firebase: {
    apiKey: 'PEGAR_AQUI',
    authDomain: 'PEGAR_AQUI.firebaseapp.com',
    projectId: 'PEGAR_AQUI',
    appId: 'PEGAR_AQUI'
  },
  // 2) Correos de Google de los 3 autores (los mismos que van en las reglas de Firestore)
  admins: ['autor1@gmail.com', 'autor2@gmail.com', 'autor3@gmail.com'],
  // 3) PayPal: enlace del botón de donación (paypal.com/donate/?hosted_button_id=...) o paypal.me/usuario
  paypal: 'https://www.paypal.com/donate/?hosted_button_id=PEGAR_AQUI'
};
