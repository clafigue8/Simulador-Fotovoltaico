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

    function resize() {
      const w = container.clientWidth, h = container.clientHeight;
      renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
      camera.aspect = w / Math.max(h, 1); camera.updateProjectionMatrix(); need = true;
    }
    const ro = new ResizeObserver(resize); ro.observe(container);
    controls.addEventListener('change', () => need = true);
    function loop() { if (!alive) return; requestAnimationFrame(loop); controls.update(); if (need || controls.autoRotate) { renderer.render(scene, camera); need = false; } }
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
      im.castShadow = true; im.receiveShadow = true; fm.castShadow = true;
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
      const dims = o.kind === 'com' ? buildPlant(o.n, o.mod, o.tilt, o.az) : buildHouse(o.n, o.mod, o.tilt, o.az);
      const d = span * 1.15; camera.position.set(d * 0.5, d * 0.42, d * 0.82); controls.target.set(0, dims.H * 0.45, 0); controls.update();
      const sc = sun.shadow.camera, e = span * 0.75; sc.left = -e; sc.right = e; sc.top = e; sc.bottom = -e; sc.near = 1; sc.far = span * 4; sc.updateProjectionMatrix();
      need = true; return dims;
    }

    // dirección del sol: x este, y arriba, z sur (az desde el norte, horario)
    const sunVec = (az, el) => new THREE.Vector3(Math.sin(az * rad) * Math.cos(el * rad), Math.sin(el * rad), -Math.cos(az * rad) * Math.cos(el * rad));
    function setSun(az, el, path, frac) {
      const v = sunVec(az, el), R = span * 1.6;
      sun.position.copy(v.clone().multiplyScalar(R)); sun.target.position.set(0, 0, 0);
      sunDisc.position.copy(v.clone().multiplyScalar(R * 1.1)); glow.position.copy(sunDisc.position);
      const day = Math.max(0, Math.min(1, (el + 4) / 14));
      sunDisc.visible = glow.visible = el > -3;
      sun.intensity = el > 0 ? 0.35 + 1.45 * Math.min(1, el / 35) : 0;
      sun.color.setHSL(0.1, 0.9, 0.5 + 0.38 * Math.min(1, el / 30));
      hemi.intensity = 0.12 + 0.5 * day;
      const top = new THREE.Color().lerpColors(new THREE.Color(0x0b1326), new THREE.Color(0x8fb7e3), day);
      const hor = new THREE.Color().lerpColors(new THREE.Color(0x1c2440), el < 8 && el > -4 ? new THREE.Color(0xf2b27a) : new THREE.Color(0xdde8f2), day);
      scene.background = skyTex(THREE, top, hor); scene.fog = new THREE.Fog(hor, span * 2.5, span * 9);
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

  window.SCENE3D = { create };
})();
