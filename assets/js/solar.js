/* © 2026 Claudia Figueroa, Dennis Johan López y M.Sc. Daniel Flores · Simulador de Sistemas Fotovoltaicos. Todos los derechos reservados. Prohibida su copia, modificación o redistribución sin autorización escrita. */
/* =====================================================================
   Recurso solar y clima
   - Posición solar: declinación de Cooper, ecuación del tiempo (Spencer),
     ángulo horario [Duffie & Beckman].
   - Cielo despejado: Meinel con corrección por altitud [Meinel 1976].
   - Separación directa/difusa: correlación de Erbs (cuando solo hay GHI).
   - Transposición al plano inclinado: Hay–Davies.
   - Pérdidas por ángulo de incidencia: modelo ASHRAE (b0).
   - Temperatura de celda: NOCT o Faiman (U0 + U1·viento).
   - Datos reales: año meteorológico típico PVGIS (TMY) por ciudad.
   ===================================================================== */
(function (G) {
  'use strict';
  const rad = Math.PI / 180, GSC = 1367;

  function doyOf(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5) || 1;
  }
  const G0n = n => GSC * (1 + 0.033 * Math.cos(2 * Math.PI * n / 365));

  // h: hora local estándar (decimal)
  function position(loc, n, h) {
    const dec = 23.45 * Math.sin(rad * 360 / 365 * (284 + n));
    const B = 2 * Math.PI * (n - 1) / 365;
    const eot = 229.2 * (0.000075 + 0.001868 * Math.cos(B) - 0.032077 * Math.sin(B) - 0.014615 * Math.cos(2 * B) - 0.04089 * Math.sin(2 * B));
    const corr = (4 * (loc.lon - 15 * loc.tz) + eot) / 60, w = 15 * (h + corr - 12);
    const phi = loc.lat * rad, d = dec * rad;
    const cz = Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(w * rad);
    const el = Math.asin(Math.max(-1, Math.min(1, cz))) / rad;
    const az = Math.atan2(Math.sin(w * rad), Math.cos(w * rad) * Math.sin(phi) - Math.tan(d) * Math.cos(phi)) / rad + 180;
    const ws = Math.acos(Math.max(-1, Math.min(1, -Math.tan(phi) * Math.tan(d)))) / rad;
    return { el, az, cz: Math.max(0, cz), dec, eot, rise: 12 - ws / 15 - corr, set: 12 + ws / 15 - corr, noon: 12 - corr };
  }

  function cosInc(sp, tilt, azp) {
    const z = (90 - sp.el) * rad, b = tilt * rad;
    return Math.cos(z) * Math.cos(b) + Math.sin(z) * Math.sin(b) * Math.cos((sp.az - azp) * rad);
  }

  // Cielo despejado (Meinel con altitud): DNI y difusa ≈ 10 % (convención clásica)
  function clearSky(loc, sp) {
    if (sp.el <= 0.5) return { ghi: 0, dni: 0, dhi: 0 };
    const AM = 1 / (sp.cz + 0.50572 * Math.pow(sp.el + 6.07995, -1.6364));
    const ah = loc.alt / 1000;
    const dni = 1353 * ((1 - 0.14 * ah) * Math.pow(0.7, Math.pow(AM, 0.678)) + 0.14 * ah);
    const dhi = 0.1 * dni;
    return { ghi: dni * sp.cz + dhi, dni, dhi };
  }

  // Erbs et al. (1982): fracción difusa a partir del índice de claridad kt
  function erbs(ghi, cz, n) {
    if (ghi <= 0 || cz <= 0.02) return { dhi: Math.max(ghi, 0), dni: 0, kt: 0 };
    const kt = Math.min(1, ghi / (G0n(n) * cz));
    const kd = kt <= 0.22 ? 1 - 0.09 * kt : kt <= 0.8 ? 0.9511 - 0.1604 * kt + 4.388 * kt * kt - 16.638 * kt ** 3 + 12.336 * kt ** 4 : 0.165;
    const dhi = kd * ghi;
    return { dhi, dni: Math.max(0, (ghi - dhi) / cz), kt };
  }

  // Hay–Davies (1980): irradiancia en el plano del arreglo (POA)
  function poa(irr, sp, n, tilt, azp, albedo, iamB0) {
    if (sp.el <= 0 || irr.ghi <= 0) return { poa: 0, beam: 0, sky: 0, gnd: 0, ct: 0, iam: 1 };
    const b = tilt * rad, ct = cosInc(sp, tilt, azp);
    const dni = sp.el < 3 ? 0 : irr.dni;
    const Ai = Math.min(1, dni / G0n(n));
    const Rb = Math.max(0, ct) / Math.max(sp.cz, 0.087);
    const beam = dni * Math.max(0, ct);
    const sky = irr.dhi * ((1 - Ai) * (1 + Math.cos(b)) / 2 + Ai * Rb);
    const gnd = irr.ghi * albedo * (1 - Math.cos(b)) / 2;
    const iam = iamAshrae(ct, iamB0);
    return { poa: beam + sky + gnd, eff: beam * iam + (sky + gnd) * iamDiffuse(iamB0), beam, sky, gnd, ct, iam };
  }
  function iamAshrae(ct, b0) { if (!b0) return 1; if (ct <= 0.05) return 0; return Math.max(0, Math.min(1, 1 - b0 * (1 / ct - 1))); }
  // Difusa isótropa: IAM promedio ≈ 1 - 1.4·b0 (aprox. integral hemisférica para b0 pequeños)
  function iamDiffuse(b0) { return b0 ? Math.max(0, 1 - 1.4 * b0 * 0.5) : 1; }

  /* ---------- Temperatura de celda ---------- */
  function cellTemp(model, Ta, Gpoa, ws, noct) {
    if (model === 'faiman') return Ta + Gpoa / (25 + 6.84 * Math.max(ws, 0));
    return Ta + (noct - 20) / 800 * Gpoa;
  }

  /* ---------- Datos TMY (PVGIS) ---------- */
  const cache = {};
  function loadTMY(key, base = 'data/') {
    if (cache[key]) return cache[key];
    cache[key] = new Promise((res, rej) => {
      if (G.TMY && G.TMY[key]) return res(decode(G.TMY[key]));
      const s = document.createElement('script');
      s.src = base + 'tmy-' + key + '.js';
      s.onload = () => res(decode(G.TMY[key]));
      s.onerror = () => { delete cache[key]; rej(new Error('TMY')); };
      document.head.appendChild(s);
    });
    return cache[key];
  }
  function decode(o) {
    if (o._dec) return o._dec;
    const bin = atob(o.data), n = bin.length / 7;
    const ghi = new Float32Array(n), dhi = new Float32Array(n), ta = new Float32Array(n), ws = new Float32Array(n);
    const u8 = Uint8Array.from(bin, c => c.charCodeAt(0)), dv = new DataView(u8.buffer);
    for (let i = 0; i < n; i++) {
      const o7 = i * 7;
      ghi[i] = dv.getUint16(o7, true); dhi[i] = dv.getUint16(o7 + 2, true);
      ta[i] = dv.getInt16(o7 + 4, true) / 10; ws[i] = dv.getUint8(o7 + 6) / 10;
    }
    o._dec = { ...o, ghi, dhi, ta, ws, n };
    return o._dec;
  }
  // Valor del TMY interpolado a una hora fraccionaria del año (0..8760)
  function tmyAt(t, hr) {
    const n = t.n, i0 = Math.floor(hr) % n, i1 = (i0 + 1) % n, f = hr - Math.floor(hr);
    const L = a => a[i0] + (a[i1] - a[i0]) * f;
    return { ghi: L(t.ghi), dhi: L(t.dhi), ta: L(t.ta), ws: L(t.ws) };
  }

  G.SOLAR = { doyOf, position, cosInc, clearSky, erbs, poa, iamAshrae, cellTemp, loadTMY, tmyAt, G0n };
})(typeof window !== 'undefined' ? window : globalThis);
