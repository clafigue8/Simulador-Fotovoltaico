/* Escena 3D (three.js): vivienda o nave industrial con paneles, sol con trayectoria real y sombras */
(function () {
  'use strict';
  const T = () => window.THREE;
  const rad = Math.PI / 180;

  function create(container) {
    const THREE = T();
    if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 2000);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = 85 * rad; controls.minDistance = 8; controls.maxDistance = 400;
    controls.enablePan = false;

    const hemi = new THREE.HemisphereLight(0xdfeeff, 0x6b7a4a, 0.55); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d9, 1.6); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
    scene.add(sun); scene.add(sun.target);
    const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(3.2, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffd76a }));
    scene.add(sunDisc);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(THREE), color: 0xffe3a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(26, 26, 1); scene.add(glow);
    let world = new THREE.Group(); scene.add(world);
    let pathLine = null, panelMat = null, span = 30, need = true, alive = true;
    /* ---------- cielo: estrellas, luna y nubes ---------- */
    const starGeo = new THREE.BufferGeometry(), sp = [];
    for (let i = 0; i < 1400; i++) { const u = Math.random(), v = Math.random() * 0.95 + 0.05, th = 2 * Math.PI * u, ph = Math.acos(v); sp.push(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)); }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
    const stars = new THREE.Points(starGeo, starMat); scene.add(stars);
    const moon = new THREE.Mesh(new THREE.SphereGeometry(2.6, 24, 16), new THREE.MeshBasicMaterial({ map: moonTex(THREE), fog: false })); scene.add(moon);
    const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(THREE), color: 0xbfd0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55, fog: false })); moonGlow.scale.set(18, 18, 1); scene.add(moonGlow);
    const puff = puffTex(THREE), clouds = new THREE.Group(); scene.add(clouds);
    const cloudMat = new THREE.SpriteMaterial({ map: puff, color: 0xffffff, transparent: true, depthWrite: false, opacity: 0.9, fog: false });
    for (let i = 0; i < 14; i++) {
      const c = new THREE.Group(), k = 4 + Math.floor(Math.random() * 4);
      for (let j = 0; j < k; j++) { const s2 = new THREE.Sprite(cloudMat); const r = 5 + Math.random() * 6; s2.scale.set(r * 1.6, r, 1); s2.position.set((j - k / 2) * 3.6 + Math.random() * 2.5, Math.random() * 2.5, Math.random() * 4); c.add(s2); }
      c.userData = { a: Math.PI * (1.05 + Math.random() * 0.9), r: 0.7 + Math.random() * 0.5, h: 0.22 + Math.random() * 0.22, v: 0.00012 + Math.random() * 0.00018 };
      clouds.add(c);
    }
    let cloudiness = 0.3;
    function placeClouds() {
      clouds.children.forEach((c, i) => { const u = c.userData, R2 = span * 1.6 * u.r; c.position.set(Math.cos(u.a) * R2, span * u.h + 10, Math.sin(u.a) * R2); c.visible = i < Math.round(cloudiness * 14); });
    }

    function resize() {
      const w = container.clientWidth, h = container.clientHeight;
      renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
      camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix(); need = true;
    }
    const ro = new ResizeObserver(resize); ro.observe(container);
    controls.addEventListener('change', () => need = true);
    function loop() {
      if (!alive) return; requestAnimationFrame(loop); controls.update();
      const nowT = performance.now();
      if (cloudiness > 0.02 && document.visibilityState === 'visible' && nowT - (loop.t || 0) > (span > 120 ? 120 : 45)) { loop.t = nowT; clouds.children.forEach(c => { c.userData.a += c.userData.v; if (c.userData.a > Math.PI * 2.05) c.userData.a = Math.PI * 0.95; }); placeClouds(); need = true; }
      if (need || controls.autoRotate) { renderer.render(scene, camera); need = false; }
    }
    loop();

    /* ---------- materiales ---------- */
    const M = {
      grass: new THREE.MeshStandardMaterial({ color: 0x7fa05a, roughness: 1 }),
      wall: new THREE.MeshStandardMaterial({ color: 0xf1e9db, roughness: 0.9 }),
      wall2: new THREE.MeshStandardMaterial({ color: 0xd9dde3, roughness: 0.85, metalness: 0.1 }),
      roof: new THREE.MeshStandardMaterial({ color: 0xa4553b, roughness: 0.8 }),
      roof2: new THREE.MeshStandardMaterial({ color: 0xb9bec6, roughness: 0.7, metalness: 0.2 }),
      trim: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }),
      glass: new THREE.MeshStandardMaterial({ color: 0x6f8aa6, roughness: 0.15, metalness: 0.6 }),
      door: new THREE.MeshStandardMaterial({ color: 0x6b4a33, roughness: 0.7 }),
      frame: new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.35, metalness: 0.8 }),
      rack: new THREE.MeshStandardMaterial({ color: 0x9aa2ad, roughness: 0.5, metalness: 0.7 }),
      trunk: new THREE.MeshStandardMaterial({ color: 0x6d4c33, roughness: 1 }),
      leaf: new THREE.MeshStandardMaterial({ color: 0x4c7a3d, roughness: 1 }),
      road: new THREE.MeshStandardMaterial({ color: 0x55595f, roughness: 1 }),
      pole: new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.8 }),
      xfmr: new THREE.MeshStandardMaterial({ color: 0x7c8590, roughness: 0.5, metalness: 0.5 }),
      wire: new THREE.LineBasicMaterial({ color: 0x222222 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.6 })
    };
    panelMat = new THREE.MeshStandardMaterial({ map: cellTex(THREE), color: 0xffffff, roughness: 0.28, metalness: 0.35, emissive: 0x0b1a3a, emissiveIntensity: 0.15 });

    function box(w, h, d, mat, x, y, z, cast = true, recv = true) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = recv; world.add(m); return m;
    }
    function tree(x, z, s = 1) {
      const g = new THREE.Group();
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.18 * s, 0.25 * s, 2.2 * s, 8), M.trunk); t.position.y = 1.1 * s; t.castShadow = true; g.add(t);
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5 * s, 1), M.leaf); c.position.y = 3 * s; c.castShadow = true; g.add(c);
      const c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1 * s, 1), M.leaf); c2.position.set(0.6 * s, 3.9 * s, 0.2 * s); c2.castShadow = true; g.add(c2);
      g.position.set(x, 0, z); world.add(g);
    }
    // paneles con InstancedMesh; cada panel: placa + marco
    function panels(list, pw, ph) {
      const geo = new THREE.BoxGeometry(pw, 0.04, ph), fgeo = new THREE.BoxGeometry(pw + 0.04, 0.035, ph + 0.04);
      const im = new THREE.InstancedMesh(geo, panelMat, list.length), fm = new THREE.InstancedMesh(fgeo, M.frame, list.length);
      const big = list.length > 1500; im.castShadow = !big; im.receiveShadow = !big; fm.castShadow = !big;
      const o = new THREE.Object3D();
      list.forEach((p, i) => {
        o.position.set(p.x, p.y + 0.02, p.z); o.rotation.set(p.rx, p.ry || 0, 0, 'YXZ'); o.updateMatrix(); im.setMatrixAt(i, o.matrix);
        o.position.y = p.y; o.updateMatrix(); fm.setMatrixAt(i, o.matrix);
      });
      world.add(fm); world.add(im);
    }

    /* ---------- vivienda ---------- */
    function buildHouse(n, mod, pitch, azim) {
      const pw = mod.pw, ph = mod.ph, gap = 0.03;
      let rows = Math.max(1, Math.min(4, Math.round(Math.sqrt(n / 3)))), cols = Math.ceil(n / rows);
      while (cols > 14 && rows < 4) { rows++; cols = Math.ceil(n / rows); }
      const W = Math.max(9, cols * (pw + gap) + 1.2), slopeLen = Math.max(4.4, rows * (ph + gap) + 0.9);
      const halfD = slopeLen * Math.cos(pitch * rad), D = 2 * halfD, H = 3, rise = slopeLen * Math.sin(pitch * rad);
      span = Math.max(W, D) * 1.6 + 14;
      const g = new THREE.Group(); world.add(g); const old = world; world = g;
      box(W, H, D, M.wall, 0, H / 2, 0);
      box(W + 0.3, 0.25, D + 0.3, M.trim, 0, 0.12, 0, false);
      // puerta y ventanas (cara sur, +z)
      box(1.0, 2.1, 0.08, M.door, -W * 0.18, 1.05, D / 2 + 0.03, false);
      for (const fx of [-0.38, 0.12, 0.34]) box(1.4, 1.1, 0.08, M.glass, W * fx, 1.7, D / 2 + 0.03, false);
      for (const fx of [-0.3, 0.3]) box(1.2, 1.0, 0.08, M.glass, W * fx, 1.7, -D / 2 - 0.03, false);
      // techo a dos aguas: losas inclinadas
      for (const s of [1, -1]) {
        const r = box(W + 0.6, 0.16, slopeLen + 0.25, M.roof, 0, H + rise / 2 + 0.05, s * halfD / 2);
        r.rotation.x = s * pitch * rad;
      }
      // hastiales
      const sh = new THREE.Shape(); sh.moveTo(-halfD, 0); sh.lineTo(halfD, 0); sh.lineTo(0, rise); sh.lineTo(-halfD, 0);
      for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), M.wall); m.rotation.y = Math.PI / 2; m.position.set(sx * W / 2 * 0.999, H, 0); m.castShadow = true; m.receiveShadow = true; m.material.side = THREE.DoubleSide; world.add(m); }
      // paneles en la cara sur
      const list = [], nx = Math.cos(pitch * rad), ny = Math.sin(pitch * rad);
      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / cols), c = i % cols, rowCount = r === rows - 1 ? n - cols * (rows - 1) : cols;
        const x = (c - (rowCount - 1) / 2) * (pw + gap);
        const s = 0.45 + (r + 0.5) * (ph + gap);       // distancia desde el alero, a lo largo de la pendiente
        const z = halfD - s * nx, y = H + s * ny + 0.16;
        list.push({ x, y, z, rx: pitch * rad });
      }
      panels(list, pw, ph);
      // chimenea, árboles, cerca
      box(0.7, 1.4, 0.7, M.wall, W * 0.32, H + rise * 0.7 + 0.5, -halfD * 0.35);
      tree(-W / 2 - 4, D / 2 + 3, 1.1); tree(W / 2 + 5, -D / 2 - 2, 1.3); tree(-W / 2 - 6, -D / 2 - 4, 0.9); tree(W / 2 + 3, D / 2 + 6, 0.8);
      // poste de la ENEE con transformador
      gridPole(-W / 2 - 6, D / 2 + 3, H + rise * 0.3, -W / 2, 0);
      world = old;
      g.rotation.y = -(azim - 180) * rad;
      return { W, D, H: H + rise };
    }

    /* ---------- nave industrial ---------- */
    function buildPlant(n, mod, tilt, azim) {
      const pw = mod.pw, ph = mod.ph, gap = 0.02;
      const L = ph * Math.cos(tilt * rad), pitch = Math.max(L + 1.2, L * 2.2);
      let cols = Math.max(6, Math.round(Math.sqrt(n * pitch / (pw + gap)) * 1.15)), rows = Math.ceil(n / cols);
      const W = cols * (pw + gap) + 4, D = rows * pitch + 4, H = 7;
      span = Math.max(W, D) * 1.4 + 20;
      const g = new THREE.Group(); world.add(g); const old = world; world = g;
      box(W, H, D, M.wall2, 0, H / 2, 0);
      box(W + 0.2, 0.6, D + 0.2, M.roof2, 0, H + 0.3, 0);
      // franjas, portones, ventanas
      for (let x = -W / 2 + 4; x < W / 2 - 2; x += 8) box(3.5, 4.2, 0.1, M.dark, x, 2.1, D / 2 + 0.06, false);
      box(W * 0.98, 0.9, 0.08, M.glass, 0, H - 1.4, D / 2 + 0.05, false);
      // filas de paneles inclinados
      const list = [], z0 = D / 2 - 2 - L / 2, y0 = H + 0.6 + 0.35 + Math.sin(tilt * rad) * ph / 2;
      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / cols), c = i % cols, rowCount = r === rows - 1 ? n - cols * (rows - 1) : cols;
        list.push({ x: (c - (rowCount - 1) / 2) * (pw + gap), y: y0, z: z0 - r * pitch, rx: tilt * rad });
      }
      panels(list, pw, ph);
      for (let r = 0; r < rows; r++) box(cols * (pw + gap), 0.08, 0.08, M.rack, 0, H + 0.7, z0 - r * pitch + L / 2 - 0.1, true, false);
      // estacionamiento y carretera
      box(W + 30, 0.02, 9, M.road, 0, 0.01, D / 2 + 9, false, true);
      tree(-W / 2 - 6, D / 2 + 2, 1.4); tree(W / 2 + 6, -D / 2, 1.5); tree(-W / 2 - 8, -D / 2 - 5, 1.2);
      // subestación / transformador de la ENEE
      box(3, 2.2, 2.2, M.xfmr, W / 2 + 6, 1.1, D / 2 - 3);
      gridPole(W / 2 + 10, D / 2 + 5, H * 0.8, W / 2 + 6, D / 2 - 3, 11);
      world = old;
      g.rotation.y = -(azim - 180) * rad;
      return { W, D, H };
    }
    /* ---------- edificio de apartamentos ---------- */
    function buildApartments(n, mod, tilt, azim) {
      const pw = mod.pw, ph = mod.ph, gap = 0.02, floors = 7, fh = 3.1;
      const L = ph * Math.cos(tilt * rad), pitch = Math.max(L + 0.9, L * 2.0);
      let cols = Math.max(5, Math.round(Math.sqrt(n * pitch / (pw + gap)) * 1.25)), rows = Math.ceil(n / cols);
      const W = Math.max(16, cols * (pw + gap) + 3), D = Math.max(12, rows * pitch + 3.5), H = floors * fh;
      span = Math.max(W, D, H) * 1.5 + 18;
      const g = new THREE.Group(); world.add(g); const old = world; world = g;
      const facade = new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.85 });
      const accent = new THREE.MeshStandardMaterial({ color: 0x8c5a43, roughness: 0.8 });
      box(W, H, D, facade, 0, H / 2, 0);
      box(W + 0.4, 0.5, D + 0.4, M.wall2, 0, 0.25, 0);
      // ventanas y balcones (cara sur y este)
      const winGeo = new THREE.BoxGeometry(1.5, 1.5, 0.12), wins = [];
      for (let f = 0; f < floors; f++) for (let x = -W / 2 + 2; x <= W / 2 - 1.9; x += 2.6) { wins.push([x, f * fh + 1.7, D / 2 + 0.03, 0]); wins.push([x, f * fh + 1.7, -D / 2 - 0.03, 0]); }
      for (let f = 0; f < floors; f++) for (let z = -D / 2 + 2; z <= D / 2 - 1.9; z += 2.6) { wins.push([W / 2 + 0.03, f * fh + 1.7, z, Math.PI / 2]); wins.push([-W / 2 - 0.03, f * fh + 1.7, z, Math.PI / 2]); }
      const wi = new THREE.InstancedMesh(winGeo, M.glass, wins.length), o = new THREE.Object3D();
      wins.forEach((w, i) => { o.position.set(w[0], w[1], w[2]); o.rotation.set(0, w[3], 0); o.updateMatrix(); wi.setMatrixAt(i, o.matrix); }); world.add(wi);
      for (let f = 1; f < floors; f++) { box(W * 0.42, 0.18, 1.2, M.trim, -W * 0.22, f * fh + 0.05, D / 2 + 0.6); box(W * 0.42, 0.9, 0.06, M.glass, -W * 0.22, f * fh + 0.55, D / 2 + 1.18, false); }
      box(1.2, H, 0.3, accent, W * 0.12, H / 2, D / 2 + 0.15); box(1.2, H, 0.3, accent, -W / 2 + 0.6, H / 2, D / 2 + 0.15);
      box(3.2, 2.6, 0.2, M.glass, W * 0.3, 1.3, D / 2 + 0.1, false);
      // azotea: pretil, cuarto de máquinas y tanque
      box(W, 1.0, 0.25, facade, 0, H + 0.5, D / 2 - 0.12); box(W, 1.0, 0.25, facade, 0, H + 0.5, -D / 2 + 0.12);
      box(0.25, 1.0, D, facade, W / 2 - 0.12, H + 0.5, 0); box(0.25, 1.0, D, facade, -W / 2 + 0.12, H + 0.5, 0);
      box(3, 2.6, 3, facade, -W / 2 + 2, H + 1.3, -D / 2 + 2);
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 20), M.dark); tank.position.set(-W / 2 + 2, H + 3.4, -D / 2 + 2); tank.castShadow = true; world.add(tank);
      // filas de paneles
      const list = [], z0 = D / 2 - 1.6 - L / 2, y0 = H + 0.45 + Math.sin(tilt * rad) * ph / 2;
      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / cols), c = i % cols, rowCount = r === rows - 1 ? n - cols * (rows - 1) : cols;
        list.push({ x: (c - (rowCount - 1) / 2) * (pw + gap) + 1.2, y: y0, z: z0 - r * pitch, rx: tilt * rad });
      }
      panels(list, pw, ph);
      tree(-W / 2 - 4, D / 2 + 4, 1.4); tree(W / 2 + 5, D / 2 + 2, 1.2); tree(W / 2 + 4, -D / 2 - 3, 1.5);
      box(W + 30, 0.02, 8, M.road, 0, 0.01, D / 2 + 8, false, true);
      gridPole(-W / 2 - 7, D / 2 + 5, 3.5, -W / 2, D / 2 - 2, 10);
      world = old;
      g.rotation.y = -(azim - 180) * rad;
      return { W, D, H };
    }
    /* ---------- gasolinera: paneles sobre la marquesina y la tienda ---------- */
    function buildGas(n, mod, tilt, azim) {
      const pw = mod.pw, ph = mod.ph, gap = 0.02;
      const rowsC = 3, colsC = Math.max(7, Math.ceil(Math.min(n, 120) / rowsC));
      const CW = Math.max(16, colsC * (pw + gap) + 1.2), CD = Math.max(9, rowsC * (ph * Math.cos(5 * rad) + 0.25) + 1.2), CH = 5.6;
      span = Math.max(CW, 30) * 1.25 + 18;
      const g = new THREE.Group(); world.add(g); const old = world; world = g;
      const red = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.5 }), white = M.trim;
      // marquesina
      box(CW, 0.7, CD, white, 0, CH, 0); box(CW + 0.05, 0.35, CD + 0.05, red, 0, CH - 0.2, 0, false);
      for (const x of [-CW / 3, CW / 3]) for (const z of [-CD / 4, CD / 4]) box(0.45, CH, 0.45, M.wall2, x, CH / 2, z);
      // islas de bombas
      for (const x of [-CW / 3, 0, CW / 3]) { box(1.2, 0.25, 4.2, M.wall2, x, 0.12, 0); for (const z of [-1, 1]) { box(0.8, 1.8, 0.5, white, x, 1.15, z * 0.9); box(0.82, 0.35, 0.52, red, x, 1.95, z * 0.9, false); } }
      // paneles sobre la marquesina (inclinación baja)
      const list = []; let k = 0;
      for (let r = 0; r < rowsC && k < n; r++) for (let c = 0; c < colsC && k < n; c++, k++) list.push({ x: (c - (colsC - 1) / 2) * (pw + gap), y: CH + 0.55, z: CD / 2 - 0.6 - (r + 0.5) * (ph * Math.cos(5 * rad) + 0.25), rx: 5 * rad });
      // tienda con techo plano y paneles restantes
      const SW = Math.max(12, CW * 0.7), SD = 9, SH = 4.2, sz = -CD / 2 - SD / 2 - 6;
      box(SW, SH, SD, M.wall, 0, SH / 2, sz); box(SW + 0.3, 0.5, SD + 0.3, white, 0, SH + 0.25, sz);
      box(SW * 0.6, 2.3, 0.1, M.glass, -SW * 0.1, 1.3, sz + SD / 2 + 0.05, false); box(SW, 0.7, 0.12, red, 0, SH - 0.5, sz + SD / 2 + 0.07, false);
      const rest = n - k, cS = Math.max(1, Math.floor((SW - 1) / (pw + gap))), L2 = ph * Math.cos(tilt * rad), pitch = L2 * 1.9;
      for (let i = 0; i < rest && i < 200; i++) { const r = Math.floor(i / cS), c = i % cS; list.push({ x: (c - (cS - 1) / 2) * (pw + gap), y: SH + 0.85, z: sz + SD / 2 - 1 - L2 / 2 - r * pitch, rx: tilt * rad }); }
      panels(list, pw, ph);
      // poste de precios
      const px = CW / 2 + 6; box(0.5, 9, 0.5, M.pole, px, 4.5, CD / 2 + 2); box(3.2, 3.6, 0.5, red, px, 8, CD / 2 + 2); box(2.8, 2.2, 0.55, white, px, 7.6, CD / 2 + 2, false);
      // carretera y autos
      box(CW + 60, 0.03, 12, M.road, 0, 0.02, CD / 2 + 9, false, true);
      box(CW + 8, 0.02, CD + 8, M.wall2, 0, 0.01, 0, false, true);
      const carCols = [0x2b5aa6, 0xe3a63c, 0xf4f5f7];
      [[-CW / 3 + 1.6, 0.6], [CW / 3 - 1.6, -0.5], [CW / 2 + 12, CD / 2 + 8]].forEach(([x, z], i) => { const cm = new THREE.MeshStandardMaterial({ color: carCols[i], roughness: 0.35, metalness: 0.4 }); box(1.8, 0.8, 4.2, cm, x, 0.65, z); box(1.6, 0.65, 2.2, M.glass, x, 1.35, z - 0.2); });
      tree(-CW / 2 - 6, CD / 2 + 2, 1.3); tree(CW / 2 + 3, sz - 3, 1.2); tree(-CW / 2 - 4, sz, 1.1);
      gridPole(-CW / 2 - 8, CD / 2 + 4, SH * 0.8, -SW / 2, sz + SD / 2, 10);
      world = old; g.rotation.y = -(azim - 180) * rad;
      return { W: CW, D: CD + SD + 6, H: CH };
    }
    /* ---------- parque solar en suelo ---------- */
    function buildFarm(n, mod, tilt, azim) {
      const pw = mod.pw, ph = mod.ph, gap = 0.02, shown = Math.min(n, 5000);
      const tableD = 2 * ph * Math.cos(tilt * rad), pitch = tableD / 0.42;          // mesas 2P en vertical, GCR ≈ 0,42
      const perTable = 2, colsPerRow = Math.max(20, Math.round(Math.sqrt(shown / perTable * pitch / (pw + gap)))), rows = Math.ceil(shown / perTable / colsPerRow);
      const blockW = colsPerRow * (pw + gap), FW = blockW + 30, FD = rows * pitch + 30;
      span = Math.max(FW, FD) * 0.75 + 30;
      const g = new THREE.Group(); world.add(g); const old = world; world = g;
      const gravel = new THREE.MeshStandardMaterial({ color: 0xb8ae96, roughness: 1 });
      box(FW, 0.03, FD, new THREE.MeshStandardMaterial({ color: 0x9db070, roughness: 1 }), 0, 0.01, 0, false, true);
      box(6, 0.04, FD, gravel, -blockW / 2 - 8, 0.02, 0, false, true); box(FW, 0.04, 5, gravel, 0, 0.02, FD / 2 - 6, false, true);
      const list = []; let k = 0; const z0 = FD / 2 - 14;
      for (let r = 0; r < rows && k < shown; r++) {
        for (let c = 0; c < colsPerRow && k < shown; c++) for (let j = 0; j < perTable && k < shown; j++, k++) {
          list.push({ x: (c - (colsPerRow - 1) / 2) * (pw + gap), y: 1.0 + (j + 0.5) * ph * Math.sin(tilt * rad), z: z0 - r * pitch - (j + 0.5) * ph * Math.cos(tilt * rad), rx: tilt * rad });
        }
      }
      panels(list, pw, ph);
      // estructura (vigas) y estaciones de inversores/transformadores
      for (let r = 0; r < rows; r++) box(blockW, 0.08, 0.08, M.rack, 0, 0.9, z0 - r * pitch - tableD / 2, true, false);
      const st = Math.max(1, Math.round(rows / 6));
      for (let r = 0; r < rows; r += st) box(2.4, 2.4, 6, M.wall2, -blockW / 2 - 8, 1.2, z0 - r * pitch - tableD / 2);
      // cerca perimetral
      const fence = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.6, metalness: 0.4, transparent: true, opacity: 0.7 });
      box(FW, 2, 0.05, fence, 0, 1, FD / 2, false); box(FW, 2, 0.05, fence, 0, 1, -FD / 2, false); box(0.05, 2, FD, fence, FW / 2, 1, 0, false); box(0.05, 2, FD, fence, -FW / 2, 1, 0, false);
      // subestación elevadora
      const sx = FW / 2 - 12, sz2 = FD / 2 - 12;
      box(16, 0.1, 14, gravel, sx, 0.05, sz2, false, true);
      box(4, 3.5, 3, M.xfmr, sx, 1.75, sz2); for (const dx of [-5, 5]) { box(0.4, 10, 0.4, M.pole, sx + dx, 5, sz2 - 4); } box(10.4, 0.4, 0.4, M.pole, sx, 9.8, sz2 - 4);
      gridPole(sx + 30, sz2 - 4, 9.5, sx + 5, sz2 - 4, 14);
      tree(-FW / 2 - 8, FD / 2 + 6, 1.6); tree(FW / 2 + 8, -FD / 2, 1.8); tree(-FW / 2 - 10, -FD / 2 - 8, 1.4);
      world = old; g.rotation.y = -(azim - 180) * rad;
      return { W: FW, D: FD, H: 3 };
    }
    function gridPole(x, z, hy, tx, tz, h = 9) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, h, 10), M.pole); p.position.set(x, h / 2, z); p.castShadow = true; world.add(p);
      box(2.4, 0.12, 0.12, M.pole, x, h - 0.6, z);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 14), M.xfmr); t.position.set(x + 0.45, h - 1.8, z); t.castShadow = true; world.add(t);
      const pts = []; for (let k = 0; k <= 16; k++) { const f = k / 16; pts.push(new THREE.Vector3(x + (tx - x) * f, (h - 0.8) + (hy - (h - 0.8)) * f - Math.sin(Math.PI * f) * 0.7, z + (tz - z) * f)); }
      world.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), M.wire));
    }

    function build(o) {
      scene.remove(world); world.traverse(x => { if (x.geometry) x.geometry.dispose(); }); world = new THREE.Group(); scene.add(world);
      const ground = new THREE.Mesh(new THREE.CircleGeometry(600, 64), M.grass); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; world.add(ground);
      const dims = o.kind === 'com' ? buildPlant(o.n, o.mod, o.tilt, o.az) : o.kind === 'apt' ? buildApartments(o.n, o.mod, o.tilt, o.az) : o.kind === 'gas' ? buildGas(o.n, o.mod, o.tilt, o.az) : o.kind === 'farm' ? buildFarm(o.n, o.mod, o.tilt, o.az) : buildHouse(o.n, o.mod, o.tilt, o.az);
      const d = span * (o.kind === 'farm' ? 1.45 : 1.2); camera.position.set(d * 0.48, dims.H * 0.55 + d * (o.kind === 'farm' ? 0.55 : 0.2), d * 0.86); controls.target.set(0, dims.H * (o.kind === 'apt' ? 0.75 : 0.7) + span * 0.06, 0); controls.update();
      const sc = sun.shadow.camera, e = span * 0.75; sc.left = -e; sc.right = e; sc.top = e; sc.bottom = -e; sc.near = 1; sc.far = span * 4; sc.updateProjectionMatrix();
      need = true; return dims;
    }

    // dirección del sol: x este, y arriba, z sur (az desde el norte, horario)
    const sunVec = (az, el) => new THREE.Vector3(Math.sin(az * rad) * Math.cos(el * rad), Math.sin(el * rad), -Math.cos(az * rad) * Math.cos(el * rad));
    function setSun(az, el, path, frac, cloud) {
      const v = sunVec(az, el), R = span * 1.6;
      sun.position.copy(v.clone().multiplyScalar(R)); sun.target.position.set(0, 0, 0);
      sunDisc.position.copy(v.clone().multiplyScalar(R * 1.1)); glow.position.copy(sunDisc.position);
      const day = Math.max(0, Math.min(1, (el + 4) / 14));
      sunDisc.visible = glow.visible = el > -3;
      sun.intensity = el > 0 ? 0.35 + 1.45 * Math.min(1, el / 35) : 0;
      sun.color.setHSL(0.1, 0.9, 0.5 + 0.38 * Math.min(1, el / 30));
      hemi.intensity = 0.12 + 0.5 * day;
      const top = new THREE.Color().lerpColors(new THREE.Color(0x0b1326), new THREE.Color(0x4f8fd8), day);
      const hor = new THREE.Color().lerpColors(new THREE.Color(0x1c2440), el < 8 && el > -4 ? new THREE.Color(0xf2b27a) : new THREE.Color(0xdde8f2), day);
      const cl = Math.max(0, Math.min(1, cloud ?? 0.3));
      if (cl > 0.55 && el > 0) { top.lerp(new THREE.Color(0x9aa6b4), (cl - 0.55) * 1.2); hor.lerp(new THREE.Color(0xc4ccd5), (cl - 0.55)); }
      scene.background = skyTex(THREE, top, hor); scene.fog = new THREE.Fog(hor, span * 1.6, span * 4.2);
      // estrellas y luna de noche (la luna se dibuja en el lado opuesto al sol, como referencia visual)
      const night = Math.max(0, Math.min(1, (-el + 2) / 10));
      starMat.opacity = night * (1 - cl * 0.7); stars.scale.setScalar(span * 3.2); stars.visible = night > 0.01;
      const mv = sunVec(330, Math.max(14, Math.min(24, -el * 0.25 + 12)));   // luna hacia el norte, en el campo de visión
      moon.position.copy(mv.clone().multiplyScalar(span * 1.75)); moonGlow.position.copy(moon.position);
      moon.visible = moonGlow.visible = night > 0.05; moonGlow.material.opacity = 0.55 * night;
      // nubes: cantidad según la nubosidad típica; más grises con cielo cubierto y oscuras de noche
      cloudiness = cl; const day2 = Math.max(0, Math.min(1, (el + 4) / 14));
      cloudMat.color.setRGB(0.25 + 0.75 * day2 * (1 - cl * 0.35), 0.27 + 0.73 * day2 * (1 - cl * 0.33), 0.32 + 0.68 * day2 * (1 - cl * 0.3));
      cloudMat.opacity = 0.55 + 0.4 * cl; placeClouds();
      if (night > 0.5) hemi.color.setHex(0x8fa4d8); else hemi.color.setHex(0xdfeeff);
      if (el <= 0) { sun.position.copy(mv.clone().multiplyScalar(span * 1.6)); sun.color.setHex(0xaabfff); sun.intensity = 0.35 * night; hemi.intensity = Math.max(hemi.intensity, 0.28); }
      panelMat.emissiveIntensity = 0.1 + 0.5 * (frac || 0);
      if (pathLine) { scene.remove(pathLine); pathLine.geometry.dispose(); }
      if (path && path.length) {
        const pts = path.filter(p => p.el > -2).map(p => sunVec(p.az, p.el).multiplyScalar(R * 1.1));
        pathLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0xffd27a, dashSize: 3, gapSize: 3, transparent: true, opacity: 0.8 }));
        pathLine.computeLineDistances(); scene.add(pathLine);
      }
      need = true;
    }
    return { build, setSun, resize, renderer, controls, dispose() { alive = false; ro.disconnect(); renderer.dispose(); container.innerHTML = ''; } };
  }

  /* ---------- texturas generadas ---------- */
  function cellTex(THREE) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 416; const g = c.getContext('2d');
    g.fillStyle = '#0d1c3d'; g.fillRect(0, 0, 256, 416);
    const cw = 256 / 6, ch = 416 / 10;
    for (let i = 0; i < 6; i++) for (let j = 0; j < 10; j++) {
      const x = i * cw + 2, y = j * ch + 2, w = cw - 4, h = ch - 4;
      const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#1b3570'); gr.addColorStop(1, '#14285a');
      g.fillStyle = gr; g.fillRect(x, y, w, h);
      g.strokeStyle = 'rgba(200,210,230,.35)'; g.lineWidth = 1; for (let k = 1; k < 3; k++) { g.beginPath(); g.moveTo(x + w * k / 3, y); g.lineTo(x + w * k / 3, y + h); g.stroke(); }
    }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
  }
  function puffTex(THREE) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    for (let i = 0; i < 6; i++) { const x = 30 + Math.random() * 68, y = 40 + Math.random() * 48, r = 26 + Math.random() * 18; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  function moonTex(THREE) {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d');
    g.fillStyle = '#e9edf3'; g.fillRect(0, 0, 128, 64);
    for (let i = 0; i < 22; i++) { g.fillStyle = `rgba(150,160,175,${0.25 + Math.random() * 0.3})`; g.beginPath(); g.arc(Math.random() * 128, Math.random() * 64, 2 + Math.random() * 7, 0, 7); g.fill(); }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
  }
  function glowTex(THREE) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,240,200,1)'); r.addColorStop(0.3, 'rgba(255,220,150,.45)'); r.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128); return new THREE.CanvasTexture(c);
  }
  let skyCanvas = null, skyT = null;
  function skyTex(THREE, top, hor) {
    if (!skyCanvas) { skyCanvas = document.createElement('canvas'); skyCanvas.width = 2; skyCanvas.height = 256; skyT = new THREE.CanvasTexture(skyCanvas); skyT.encoding = THREE.sRGBEncoding; }
    const g = skyCanvas.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#' + top.getHexString()); gr.addColorStop(0.75, '#' + hor.getHexString()); gr.addColorStop(1, '#' + hor.getHexString());
    g.fillStyle = gr; g.fillRect(0, 0, 2, 256); skyT.needsUpdate = true; return skyT;
  }

  /* ---------- Vista de montaje: equipos etiquetados ---------- */
  function label(THREE, text, color = '#1d3b6e') {
    const c = document.createElement('canvas'), g = c.getContext('2d'), f = 34;
    g.font = `600 ${f}px Inter, system-ui, sans-serif`; const w = Math.ceil(g.measureText(text).width) + 40, h = f + 26;
    c.width = w; c.height = h; g.font = `600 ${f}px Inter, system-ui, sans-serif`;
    g.fillStyle = 'rgba(255,255,255,.96)'; const r = 14; g.beginPath(); g.moveTo(r, 0); g.arcTo(w, 0, w, h, r); g.arcTo(w, h, 0, h, r); g.arcTo(0, h, 0, 0, r); g.arcTo(0, 0, w, 0, r); g.fill();
    g.fillStyle = color; g.fillRect(0, 0, 8, h); g.fillStyle = '#0f1b2d'; g.textBaseline = 'middle'; g.fillText(text, 22, h / 2 + 1);
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); sp.scale.set(w / 118, h / 118, 1); sp.renderOrder = 10; return sp;
  }
  function createInstall(container) {
    const THREE = T(); if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0xcfe0f2);
    const sd = new THREE.Mesh(new THREE.SphereGeometry(1.6, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffd76a })); sd.position.set(-26, 30, -40); scene.add(sd);
    const sg = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(THREE), color: 0xffe3a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); sg.scale.set(16, 16, 1); sg.position.copy(sd.position); scene.add(sg);
    const cm = new THREE.SpriteMaterial({ map: puffTex(THREE), transparent: true, depthWrite: false, opacity: 0.95 });
    for (let i = 0; i < 7; i++) { const g0 = new THREE.Group(); for (let j = 0; j < 5; j++) { const s3 = new THREE.Sprite(cm); const r = 3 + Math.random() * 3; s3.scale.set(r * 1.7, r, 1); s3.position.set((j - 2.5) * 2.2, Math.random() * 1.2, 0); g0.add(s3); } g0.position.set(-40 + i * 13 + Math.random() * 4, 16 + Math.random() * 10, -45 - Math.random() * 10); scene.add(g0); }
    const camera = new THREE.PerspectiveCamera(36, 1, 0.3, 500);
    const controls = new THREE.OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.maxPolarAngle = 88 * rad; controls.minDistance = 6; controls.maxDistance = 80;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9a70, 0.75));
    const sun = new THREE.DirectionalLight(0xfff1dc, 1.4); sun.position.set(14, 26, 18); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 90 }); scene.add(sun);
    let need = true, alive = true, root = new THREE.Group(); scene.add(root);
    const ro = new ResizeObserver(() => { const w = container.clientWidth, h = container.clientHeight; renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'; camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix(); need = true; }); ro.observe(container);
    controls.addEventListener('change', () => need = true);
    (function loop() { if (!alive) return; requestAnimationFrame(loop); controls.update(); if (need) { renderer.render(scene, camera); need = false; } })();
    const mat = (c, r = 0.7, m = 0.1) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
    const PM = new THREE.MeshStandardMaterial({ map: cellTex(THREE), roughness: 0.3, metalness: 0.35 });
    function b(w, h, d, m, x, y, z, parent = root) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; }
    function tube(pts, r, m) { const cv = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), false, 'catmullrom', 0.05); const o = new THREE.Mesh(new THREE.TubeGeometry(cv, 64, r, 8, false), m); o.castShadow = true; root.add(o); return o; }
    function tag(text, x, y, z, ax, ay, az, color) {
      const s = label(THREE, text, color); s.position.set(x, y, z); root.add(s);
      const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, y - 0.35, z), new THREE.Vector3(ax, ay, az)]);
      root.add(new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x5d6b80 })));
    }
    function build(c, d, tx) {
      scene.remove(root); root = new THREE.Group(); scene.add(root);
      const W = 14, D = 8, H = 4.2;
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), mat(0x8fb069, 1)); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; root.add(ground);
      b(W, H, D, mat(0xf1ece2, 0.9), 0, H / 2, 0);
      b(W + 0.3, 0.35, D + 0.3, mat(0xc9ced6, 0.8), 0, H + 0.17, 0);
      // paneles en la azotea (representativos)
      const pw = 1.0, ph = 1.7, tilt = 15 * rad, cols = 8, rows = 2, shown = Math.min(c.n, cols * rows);
      for (let i = 0; i < shown; i++) {
        const r = Math.floor(i / cols), k = i % cols, g = new THREE.Group();
        g.position.set(-W / 2 + 1.4 + k * (pw + 0.05) + pw / 2, H + 0.75, D / 2 - 1.6 - r * 2.6); g.rotation.x = tilt;
        b(pw, 0.04, ph, PM, 0, 0, 0, g); b(pw + 0.04, 0.03, ph + 0.04, mat(0xc9ced6, 0.35, 0.8), 0, -0.02, 0, g); root.add(g);
        b(0.05, 0.5, 0.05, mat(0x9aa2ad, 0.5, 0.7), g.position.x, H + 0.5, g.position.z - 0.6);
      }
      tag(tx.panels, -W / 2 + 4.6, H + 2.4, D / 2 - 1.6, -W / 2 + 4.6, H + 1.0, D / 2 - 1.6, '#c98a1b');
      // equipos en la fachada (z = D/2)
      const zf = D / 2 + 0.12, y0 = 1.6, red = mat(0xc0392b, 0.6), blk = mat(0x222831, 0.6), cond = mat(0x9aa2ad, 0.5, 0.6), grn = mat(0x2e7d55, 0.6);
      let x = -4.8;
      if (!tx.micro) { b(0.55, 0.7, 0.2, mat(0xd9dde3, 0.5, 0.3), x, y0 + 0.2, zf); b(0.12, 0.12, 0.05, red, x + 0.12, y0 + 0.25, zf + 0.12); tag(tx.dc, x - 1.2, y0 - 0.9, zf + 1.6, x, y0 - 0.1, zf, '#c0392b'); }
      // tubería desde la azotea
      tube([[-W / 2 + 1.2, H + 0.4, D / 2 - 1.2], [-W / 2 + 1.2, H + 0.4, zf], [-4.8 - (tx.micro ? 0 : 0), H + 0.1, zf], [-4.8, y0 + 0.6, zf]], 0.045, tx.micro ? cond : red);
      const xi = -2.6;
      b(0.75, 0.95, 0.24, mat(0xf4f5f7, 0.45, 0.2), xi, y0 + 0.25, zf); b(0.32, 0.12, 0.03, mat(0x1d3b6e, 0.3, 0.3), xi, y0 + 0.5, zf + 0.13);
      tag(tx.inv, xi - 0.6, y0 + 1.75, zf + 1.6, xi, y0 + 0.75, zf, '#7b5ea7');
      tube([[-4.8, y0 - 0.15, zf], [-4.8, y0 - 0.45, zf], [xi, y0 - 0.45, zf], [xi, y0 - 0.23, zf]], 0.04, cond);
      const xa = -0.8; b(0.42, 0.55, 0.18, mat(0xd9dde3, 0.5, 0.3), xa, y0 + 0.2, zf); b(0.08, 0.2, 0.05, blk, xa, y0 + 0.2, zf + 0.1);
      tag(tx.ac, xa + 0.3, y0 - 1.0, zf + 1.8, xa, y0 - 0.05, zf, '#1d3b6e');
      tube([[xi, y0 - 0.23, zf], [xi, y0 - 0.6, zf], [xa, y0 - 0.6, zf], [xa, y0 - 0.08, zf]], 0.04, cond);
      const xp = 1.0; b(0.7, 1.1, 0.16, mat(0xa7afba, 0.5, 0.4), xp, y0 + 0.1, zf);
      tag(tx.panel, xp + 0.8, y0 + 2.3, zf + 1.4, xp, y0 + 0.65, zf, '#2e7d55');
      tube([[xa, y0 - 0.08, zf], [xa, y0 - 0.75, zf], [xp, y0 - 0.75, zf], [xp, y0 - 0.45, zf]], 0.04, cond);
      const xm = 3.0; b(0.36, 0.5, 0.16, mat(0xd9dde3, 0.5, 0.3), xm, y0 + 0.4, zf); const gl = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 24), mat(0xbfd3e6, 0.1, 0.2)); gl.rotation.x = Math.PI / 2; gl.position.set(xm, y0 + 0.45, zf + 0.12); root.add(gl);
      tag(tx.meter, xm + 1.3, y0 + 1.25, zf + 1.6, xm, y0 + 0.7, zf, '#2b5aa6');
      tube([[xp, y0 + 0.65, zf], [xp, y0 + 0.95, zf], [xm, y0 + 0.95, zf], [xm, y0 + 0.65, zf]], 0.04, cond);
      // poste y transformador
      const px = 9.5, pz = D / 2 + 1.2; const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 9, 12), mat(0x8a8f96)); pole.position.set(px, 4.5, pz); pole.castShadow = true; root.add(pole);
      b(2.2, 0.1, 0.1, mat(0x8a8f96), px, 8.4, pz); const xf = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.85, 16), mat(0x7c8590, 0.5, 0.5)); xf.position.set(px + 0.42, 7.3, pz); xf.castShadow = true; root.add(xf);
      tag(tx.grid, px + 1.8, 9.6, pz, px + 0.4, 7.6, pz, '#334155');
      tube([[px + 0.3, 7.6, pz], [(px + xm) / 2, 4.2, (pz + zf) / 2], [xm, y0 + 1.25, zf + 0.05]], 0.02, blk);
      // tierra
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8), mat(0xb87333, 0.3, 0.8)); rod.position.set(xp + 0.6, 0.15, zf + 0.6); root.add(rod);
      tube([[xp, y0 - 0.45, zf], [xp, 0.05, zf], [xp + 0.6, 0.05, zf + 0.6]], 0.02, grn);
      tag(tx.ground, xp + 2.4, 0.5, zf + 2.2, xp + 0.6, 0.3, zf + 0.6, '#2e7d55');
      camera.position.set(2.5, 6.8, 21); controls.target.set(0.8, 2.6, 0); controls.update(); need = true;
    }
    return { build, dispose() { alive = false; ro.disconnect(); renderer.dispose(); container.innerHTML = ''; } };
  }

  window.SCENE3D = { create, createInstall };
})();
