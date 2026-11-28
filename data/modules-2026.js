/* © 2026 Claudia Figueroa, Dennis Johan López y M.Sc. Daniel Flores · Simulador de Sistemas Fotovoltaicos. Todos los derechos reservados. Prohibida su copia, modificación o redistribución sin autorización escrita. */
/* Paneles típicos del mercado 2025–2026 por formato (valores representativos de fichas técnicas TOPCon tipo N;
   no corresponden a una marca en particular). Dimensiones y potencias según guías de formatos de 2026;
   precios FOB de referencia: InfoLink (oct. 2026) y Anza (T1 2026). */
(function () {
  const T = [
    { fmt: 'res', name: 'Panel residencial típico 2026 · 108 medias celdas TOPCon · 440 W', short: { es: 'Residencial', en: 'Residential' },
      cellsLabel: { es: '108 medias celdas', en: '108 half-cells' }, tech: 'Mono-c-Si TOPCon (N)', Ns: 54, rows: 9, cols: 6, groups: 3, Pstc: 440, W: 1.134, H: 1.722,
      Vmp: 32.8, Imp: 13.42, Voc: 39.4, Isc: 14.05, aI: 0.0063, bV: -0.0985, gP: -0.29, noct: 45,
      brands: 'LONGi Hi‑MO X10 · Trina Vertex S+ · Jinko Tiger Neo · AIKO · JA Solar', use: { es: 'Techos de casas y edificios', en: 'House and building roofs' } },
    { fmt: 'com', name: 'Panel comercial típico 2026 · 144 medias celdas TOPCon · 580 W', short: { es: 'Comercial', en: 'Commercial' },
      cellsLabel: { es: '144 medias celdas', en: '144 half-cells' }, tech: 'Mono-c-Si TOPCon (N)', Ns: 72, rows: 12, cols: 6, groups: 3, Pstc: 580, W: 1.134, H: 2.278,
      Vmp: 43.0, Imp: 13.49, Voc: 51.6, Isc: 14.2, aI: 0.0064, bV: -0.129, gP: -0.29, noct: 45,
      brands: 'Jinko Tiger Neo · JA DeepBlue · Trina Vertex N · Canadian Solar TOPHiKu · LONGi', use: { es: 'Naves, comercios, gasolineras', en: 'Warehouses, businesses, gas stations' } },
    { fmt: 'util', name: 'Panel de gran escala típico 2026 · 132 medias celdas 210 mm bifacial · 700 W', short: { es: 'Gran escala', en: 'Utility scale' },
      cellsLabel: { es: '132 medias celdas de 210 mm', en: '132 half-cells, 210 mm' }, tech: 'Mono-c-Si TOPCon bifacial (N)', Ns: 66, rows: 11, cols: 6, groups: 3, Pstc: 700, W: 1.303, H: 2.384, bifacial: 0.8,
      Vmp: 40.3, Imp: 17.37, Voc: 48.3, Isc: 18.4, aI: 0.0083, bV: -0.121, gP: -0.29, noct: 45,
      brands: 'Trina Vertex N · Canadian Solar TOPBiHiKu · LONGi Hi‑MO 9 · Jinko Tiger Neo · JA DeepBlue', use: { es: 'Parques solares en suelo', en: 'Ground-mounted solar parks' } }
  ];
  T.forEach(m => { m.A = +(m.W * m.H).toFixed(3); m.typical = true; m.cec = null; });
  window.MODULES_TYPICAL_START = window.MODULES.length;
  window.MODULES.push(...T);
  window.PRICE = { fobUSDW: 0.115, usUSDW: 0.28, localUSDW: [0.20, 0.35] };
})();
