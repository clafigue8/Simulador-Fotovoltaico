/* Paneles comerciales con datos de placa (STC) fotografiados en campo.
   Coeficientes de temperatura y dimensiones: valores típicos de la ficha técnica de cada serie
   (no aparecen en la placa); verificar con la hoja del fabricante. */
(function () {
  const P = [
    { name: 'JA Solar JAM72D30-545/MB', tech: 'Mono-c-Si PERC bifacial', Ns: 72, rows: 12, cols: 6, groups: 3, Pstc: 545, W: 1.134, H: 2.278, bifacial: 0.7,
      Vmp: 41.80, Imp: 13.04, Voc: 49.75, Isc: 13.93, pI: 0.045, pV: -0.275, gP: -0.35, noct: 45, fmts: ['com', 'util'] },
    { name: 'JA Solar JAM66D45-615/LB', tech: 'Mono-c-Si TOPCon (N) bifacial', Ns: 66, rows: 11, cols: 6, groups: 3, Pstc: 615, W: 1.134, H: 2.382, bifacial: 0.8,
      Vmp: 39.96, Imp: 15.39, Voc: 48.30, Isc: 16.10, pI: 0.046, pV: -0.25, gP: -0.29, noct: 45, fmts: ['com', 'util'] },
    { name: 'Trina Solar TSM-575DE19R (Vertex)', tech: 'Mono-c-Si PERC 210R', Ns: 66, rows: 11, cols: 6, groups: 3, Pstc: 575, W: 1.134, H: 2.382,
      Vmp: 38.8, Imp: 14.83, Voc: 46.1, Isc: 15.90, pI: 0.04, pV: -0.25, gP: -0.34, noct: 43, fmts: ['com', 'util'] },
    // Ficha oficial JA Solar JAM72S30 525-550/MR (examen IE932): monofacial PERC, 2279 × 1134 mm, 28.6 kg, degradación 0.55 %/año.
    { name: 'JA Solar JAM72S30-550/MR', tech: 'Mono-c-Si PERC', Ns: 72, rows: 12, cols: 6, groups: 3, Pstc: 550, W: 1.134, H: 2.279, mass: 28.6, degr: 0.55,
      Vmp: 41.96, Imp: 13.11, Voc: 49.90, Isc: 14.00, pI: 0.045, pV: -0.275, gP: -0.35, noct: 45, fmts: ['res', 'com', 'util'] },
    // Placa del módulo del banco de trabajo de la UNAH (sin ficha publicada): 72 celdas. Coeficientes y dimensiones típicos de 72 celdas.
    { name: 'Mundo Solar 350 W (banco UNAH)', tech: 'Mono-c-Si', Ns: 72, rows: 12, cols: 6, groups: 3, Pstc: 350, W: 0.992, H: 1.956,
      Vmp: 39.6, Imp: 8.84, Voc: 47.52, Isc: 9.55, pI: 0.05, pV: -0.30, gP: -0.40, noct: 45, fmts: ['res', 'com'] },
    // PolyCrown Solar Tech NS-720MH-132 (ejercicio de 720 W): 132 medias celdas tipo N, 2384 × 1303 mm, 34 kg, 1500 V (PV Index, ficha del fabricante).
    { name: 'PolyCrown NS-720MH-132', tech: 'Mono-c-Si tipo N, 132 medias celdas', Ns: 66, rows: 11, cols: 6, groups: 3, Pstc: 720, W: 1.303, H: 2.384, mass: 34.0,
      Vmp: 41.89, Imp: 17.19, Voc: 50.00, Isc: 18.00, pI: 0.045, pV: -0.25, gP: -0.29, noct: 45, fmts: ['res', 'com', 'util'] }
  ];
  P.forEach(m => { m.A = +(m.W * m.H).toFixed(3); m.aI = m.Isc * m.pI / 100; m.bV = m.Voc * m.pV / 100; m.placa = true; m.cec = null; });
  window.MODULES.push(...P);
})();
