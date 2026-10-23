/* FE 시리즈 EC 플러그팬 3D 모델 (3d.html · tools/video/render.html 공용)
   기준: 쇼룸 전시품 FE-B400FT 실물 사진. 장착판 폭 W = 1, 정면이 +z, 공기는 -z로 빨려 들어감.
   로고·인쇄 문구는 넣지 않음. 전시용 바닥 받침(평철)은 제품이 아니라서 뺌.
   buildFan(THREE) → { group, rotor, solids, hotspots, setSpeed(s), update(dt) } */

export const HOTSPOTS = {
  motor: [0, -0.02, -0.565],
  ctrl:  [0, 0.115, -0.6],
  imp:   [0.31, 0.17, -0.34],
  iot:   [0.0, -0.15, -0.57],
  inlet: [-0.33, 0.0, 0.03],
};

/* 조명: 정면·옆·뒤에서 고르게 비춰 어느 각도에서도 금속이 자연스럽게 보이게 (3d.html · 영상 공통) */
export function addStage(THREE, scene, { small = false } = {}) { // small: 휴대폰 등 작은 화면은 그림자 해상도를 낮춤
  const SH = small ? 1024 : 2048;
  const L = (c, i, x, y, z) => { const l = new THREE.DirectionalLight(c, i); l.position.set(x, y, z); scene.add(l); return l; };
  const key = L(0xffffff, 1.6, 1.2, 4, 1.4); // 키: 쇼룸처럼 위쪽에서 (판이 뒤쪽을 가리지 않게) — 날개 사이 그늘을 만드는 부드러운 그림자
  key.castShadow = true; key.shadow.mapSize.set(SH, SH); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.01; key.shadow.radius = 3;
  Object.assign(key.shadow.camera, { left: -0.9, right: 0.9, top: 0.9, bottom: -0.9, near: 0.5, far: 8 });
  L(0xf2f4ff, 0.8, -2.5, 1.2, 1.8); // 보조 (앞 왼쪽)
  L(0xffffff, 0.55, 2.8, 0.6, 0.2);  // 옆 (임펠러 띠)
  const back = L(0xffffff, 1.3, 1.5, 2.5, -3); // 뒤쪽 (모터·뒷판)
  back.castShadow = true; back.shadow.mapSize.set(SH / 2, SH / 2); back.shadow.bias = -0.0004; back.shadow.normalBias = 0.01; back.shadow.radius = 3;
  Object.assign(back.shadow.camera, { left: -0.9, right: 0.9, top: 0.9, bottom: -0.9, near: 0.5, far: 8 });
  L(0xa9dcff, 0.45, -3, 0.8, -2.5); // 은은한 파란 테두리 (CI 느낌)
  scene.add(new THREE.AmbientLight(0x5a6378, 0.45));
}

const NB = 7;                         // 날개 수
const R_OD = 0.355, R_IN = 0.1;       // 임펠러 외경·날개 안쪽 끝(허브 콘)
const Z_BACK = -0.457;                // 뒷판 앞면
const SHROUD = [[0.236, -0.112], [0.25, -0.128], [0.275, -0.152], [0.305, -0.18], [0.333, -0.206], [0.355, -0.228]];
const SPIN = 24;                      // 100%일 때 화면상 회전 속도 rad/s (속도에 비례)
const SHUTTER = 1 / 30;               // 회전 잔상 = 회전속도 × 셔터 (페이지·영상 공통)

function shroudZ(r) {
  for (let i = 1; i < SHROUD.length; i++) {
    const [r0, z0] = SHROUD[i - 1], [r1, z1] = SHROUD[i];
    if (r <= r1) return z0 + (z1 - z0) * Math.max(0, (r - r0) / (r1 - r0));
  }
  return SHROUD[SHROUD.length - 1][1];
}

export function buildFan(THREE) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const lathe = (pts, seg = 128) => new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), seg).rotateX(Math.PI / 2);
  const disc = (r, h, seg = 96) => new THREE.CylinderGeometry(r, r, h, seg).rotateX(Math.PI / 2);

  /* ---------- 재질 ---------- */
  // 인렛 링: 용융아연도금 특유의 얼룩(스팽글) 무늬를 캔버스로 만들어 색·거칠기에 씀
  const gc = document.createElement('canvas'); gc.width = gc.height = 512;
  const gx = gc.getContext('2d'); gx.fillStyle = '#d8d8d8'; gx.fillRect(0, 0, 512, 512);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * 512, y = rnd() * 512, r = 3 + rnd() * 11, v = 212 + Math.floor(rnd() * 30);
    gx.fillStyle = `rgb(${v},${v},${v})`; gx.beginPath();
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + rnd(); gx.lineTo(x + Math.cos(a) * r * (0.6 + rnd() * 0.5), y + Math.sin(a) * r * (0.6 + rnd() * 0.5)); }
    gx.fill();
  }
  const galvTex = new THREE.CanvasTexture(gc); galvTex.wrapS = galvTex.wrapT = THREE.RepeatWrapping; galvTex.repeat.set(16, 2); galvTex.colorSpace = THREE.SRGBColorSpace;
  // 뒷판: 스피닝 가공한 알루미늄의 동심원 결
  const sc = document.createElement('canvas'); sc.width = sc.height = 1024;
  const sx = sc.getContext('2d'); sx.fillStyle = '#e0e0e0'; sx.fillRect(0, 0, 1024, 1024); sx.lineWidth = 1.5;
  for (let r = 2; r < 724; r += 1.5) { const v = 232 + Math.floor(rnd() * 23); sx.strokeStyle = `rgb(${v},${v},${v})`; sx.beginPath(); sx.arc(512, 512, r, 0, Math.PI * 2); sx.stroke(); }
  const spunTex = new THREE.CanvasTexture(sc); spunTex.colorSpace = THREE.SRGBColorSpace; spunTex.anisotropy = 8;
  const M = {
    plate: new THREE.MeshPhysicalMaterial({ color: 0x24225f, metalness: 0.2, roughness: 0.45, clearcoat: 0.55, clearcoatRoughness: 0.3 }),
    galv:  new THREE.MeshStandardMaterial({ color: 0xa9aeb1, map: galvTex, metalness: 0.55, roughness: 0.58, roughnessMap: galvTex, side: THREE.DoubleSide }),
    alu:   new THREE.MeshStandardMaterial({ color: 0xe6e9ed, metalness: 0.78, roughness: 0.3, side: THREE.DoubleSide }),
    spun:  new THREE.MeshStandardMaterial({ color: 0xe9ecef, map: spunTex, roughnessMap: spunTex, metalness: 0.55, roughness: 0.4 }),
    weld:  new THREE.MeshStandardMaterial({ color: 0xe8ebee, metalness: 0.8, roughness: 0.55 }),
    hub:   new THREE.MeshStandardMaterial({ color: 0x3341d6, metalness: 0.55, roughness: 0.32 }),
    hole:  new THREE.MeshStandardMaterial({ color: 0x0b0d1a, metalness: 0.2, roughness: 0.8 }),
    cast:  new THREE.MeshStandardMaterial({ color: 0xd2d5d9, metalness: 0.8, roughness: 0.38 }),
    black: new THREE.MeshStandardMaterial({ color: 0x141518, metalness: 0.35, roughness: 0.5 }),
    tube:  new THREE.MeshPhysicalMaterial({ color: 0x0e0f12, metalness: 0.3, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xc9cdd2, metalness: 0.95, roughness: 0.22 }),
    cable: new THREE.MeshStandardMaterial({ color: 0x101113, metalness: 0.1, roughness: 0.65 }),
  };

  const group = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = group) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  /* ---------- 장착판: 남보라 판금, 네 변이 뒤로 꺾임 ---------- */
  const H = 0.5, T = 0.006, LIP = 0.05;
  const ps = new THREE.Shape(); ps.moveTo(-H, -H); ps.lineTo(H, -H); ps.lineTo(H, H); ps.lineTo(-H, H); ps.closePath();
  const hole = (x, y, r) => { const p = new THREE.Path(); p.absarc(x, y, r, 0, Math.PI * 2, true); ps.holes.push(p); };
  hole(0, 0, 0.292);
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => hole(a * 0.446, b * 0.446, 0.011));
  add(new THREE.ExtrudeGeometry(ps, { depth: T, bevelEnabled: false, curveSegments: 96 }), M.plate, 0, 0, -T);
  add(new THREE.BoxGeometry(1, T, LIP), M.plate, 0, H - T / 2, -LIP / 2);
  add(new THREE.BoxGeometry(1, T, LIP), M.plate, 0, -H + T / 2, -LIP / 2);
  add(new THREE.BoxGeometry(T, 1, LIP), M.plate, H - T / 2, 0, -LIP / 2);
  add(new THREE.BoxGeometry(T, 1, LIP), M.plate, -H + T / 2, 0, -LIP / 2);
  // 지지 파이프를 잡는 육각너트 4개 (대각선 위치) + 와셔 + 볼트 끝
  const nut = new THREE.CylinderGeometry(0.018, 0.018, 0.013, 6).rotateX(Math.PI / 2);
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => {
    add(disc(0.024, 0.003, 32), M.steel, a * 0.365, b * 0.365, 0.0015);
    add(nut, M.steel, a * 0.365, b * 0.365, 0.0095).rotation.z = 0.3;
    add(disc(0.008, 0.012, 16), M.steel, a * 0.365, b * 0.365, 0.018);
  });

  /* ---------- 인렛 링: 무광 회색 금속, 넓은 테 + 판 뒤로 들어가는 깔때기 ---------- */
  add(lathe([[0.229, -0.135], [0.229, -0.075], [0.232, -0.045], [0.242, -0.018], [0.26, 0.002], [0.288, 0.015], [0.325, 0.021], [0.36, 0.018], [0.42, 0.013]]), M.galv);
  add(new THREE.TorusGeometry(0.42, 0.003, 8, 128), M.galv, 0, 0, 0.011);
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 2 + i * Math.PI / 4;
    add(new THREE.SphereGeometry(0.0085, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), M.steel, Math.cos(a) * 0.395, Math.sin(a) * 0.395, 0.015);
  }

  /* ---------- 로터: 앞 슈라우드 + 후향익 7장 + 뒷판 + 파란 허브 ---------- */
  const rotor = new THREE.Group(); group.add(rotor);
  add(lathe([[0.236, -0.098], ...SHROUD]), M.alu, 0, 0, 0, rotor);
  add(disc(R_OD, 0.006, 128), M.spun, 0, 0, Z_BACK - 0.003, rotor);
  add(lathe([[0.2, Z_BACK + 0.001], [0.16, Z_BACK + 0.022], [0.115, Z_BACK + 0.05], [0.09, Z_BACK + 0.068], [0.088, Z_BACK + 0.075]], 96), M.alu, 0, 0, 0, rotor); // 허브 콘

  // 날개: 평면도에서 거의 직선, 바깥 끝이 회전 반대쪽으로 누운 후향익. 앞쪽은 슈라우드, 뒤쪽은 뒷판에 붙음
  function bladeGeo(a0) {
    const NU = 18, pos = [], idx = [];
    const SW = 0.62; // 안쪽 끝 → 바깥 끝 각도 차
    for (let i = 0; i <= NU; i++) {
      const u = i / NU, r = R_IN + (R_OD - 0.002 - R_IN) * u;
      // 직선 날개: 안쪽점과 바깥점을 잇는 직선 위의 점
      const p0 = [R_IN * Math.cos(a0), R_IN * Math.sin(a0)], p1 = [R_OD * Math.cos(a0 + SW), R_OD * Math.sin(a0 + SW)];
      const x = p0[0] + (p1[0] - p0[0]) * u, y = p0[1] + (p1[1] - p0[1]) * u;
      const rr = Math.hypot(x, y);
      const tt = Math.max(0, (0.236 - rr) / (0.236 - R_IN));
      const zf = rr >= 0.236 ? shroudZ(rr) - 0.002 : -0.112 - 0.27 * Math.pow(tt, 1.7); // 안쪽 앞 모서리: 볼록한 꽃잎 곡선
      pos.push(x, y, zf, x, y, Z_BACK);
      if (i) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      void r;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return { g, tip: [R_OD * Math.cos(a0 + SW), R_OD * Math.sin(a0 + SW)], tipA: a0 + SW };
  }
  const blades = new THREE.Group(); rotor.add(blades);
  const weldGeo = new THREE.CapsuleGeometry(0.0045, 0.024, 4, 8);
  for (let i = 0; i < NB; i++) {
    const { g, tip, tipA } = bladeGeo(i / NB * Math.PI * 2);
    blades.add(new THREE.Mesh(g, M.alu));
    // 바깥 끝 용접 비드(앞·뒤)
    for (const z of [shroudZ(R_OD) - 0.02, Z_BACK + 0.018]) {
      const w = new THREE.Mesh(weldGeo, M.weld); w.position.set(tip[0] * 0.985, tip[1] * 0.985, z); w.rotation.x = Math.PI / 2; w.rotation.y = tipA; blades.add(w);
    }
    { // 슈라우드 입구(앞 모서리 시작점) 용접
      const a0 = i / NB * Math.PI * 2, f = (0.238 - R_IN) / (R_OD - R_IN);
      const x = R_IN * Math.cos(a0) + (tip[0] - R_IN * Math.cos(a0)) * f, y = R_IN * Math.sin(a0) + (tip[1] - R_IN * Math.sin(a0)) * f;
      const w = new THREE.Mesh(weldGeo, M.weld); w.position.set(x, y, -0.118); w.scale.set(1, 0.7, 1); blades.add(w);
    }
  }
  // 파란 허브 캡 + 구멍 10개
  const ZH = Z_BACK + 0.075; // 허브 콘 꼭대기
  add(disc(0.08, 0.06, 64), M.hub, 0, 0, ZH + 0.03, rotor);
  add(new THREE.TorusGeometry(0.077, 0.004, 8, 64), M.hub, 0, 0, ZH + 0.012, rotor);
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; add(disc(0.0075, 0.004, 20), M.hole, Math.cos(a) * 0.056, Math.sin(a) * 0.056, ZH + 0.0605, rotor); }
  for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.5; add(disc(0.004, 0.006, 12), M.steel, Math.cos(a) * 0.095, Math.sin(a) * 0.095, ZH + 0.004, rotor); }

  // 회전 잔상: 날개 사본을 회전 반대쪽으로 펼쳐 겹침. 속도에 비례해 넓어지고 진해짐
  const GHOSTS = 7, ghostMat = M.alu.clone(); ghostMat.transparent = true; ghostMat.depthWrite = false; ghostMat.opacity = 0;
  const ghosts = [];
  for (let k = 1; k <= GHOSTS; k++) {
    const gg = new THREE.Group();
    blades.children.forEach((b) => { if (b.geometry.type === 'BufferGeometry') gg.add(new THREE.Mesh(b.geometry, ghostMat)); });
    rotor.add(gg); ghosts.push(gg);
  }

  /* ---------- 모터 (고정부): 검은 마운트판 + 은색 다이캐스트 모터 ---------- */
  const ms = new THREE.Shape(), mw = 0.2, mh = 0.185, ch = 0.045;
  ms.moveTo(-mw + ch, -mh); ms.lineTo(mw - ch, -mh); ms.lineTo(mw, -mh + ch); ms.lineTo(mw, mh - ch); ms.lineTo(mw - ch, mh); ms.lineTo(-mw + ch, mh); ms.lineTo(-mw, mh - ch); ms.lineTo(-mw, -mh + ch); ms.closePath();
  const ZM = Z_BACK - 0.022;
  add(new THREE.ExtrudeGeometry(ms, { depth: 0.01, bevelEnabled: false }), M.black, 0, 0, ZM - 0.01);
  const ZC = ZM - 0.01; // 모터 앞면
  add(disc(0.148, 0.062, 96), M.cast, 0, 0, ZC - 0.031);
  // 테두리 방열 리브(사각 홈이 있는 테)
  for (let i = 0; i < 30; i++) {
    const a = i / 30 * Math.PI * 2; if (Math.sin(a) > 0.55) continue; // 위쪽은 핀 블록 자리
    const r = add(new THREE.BoxGeometry(0.02, 0.014, 0.05), M.cast, Math.cos(a) * 0.149, Math.sin(a) * 0.149, ZC - 0.04); r.rotation.z = a;
  }
  add(new THREE.TorusGeometry(0.118, 0.006, 8, 96), M.cast, 0, 0, ZC - 0.064);
  add(disc(0.112, 0.012, 96), M.cast, 0, 0, ZC - 0.068);
  // 위쪽 세로 방열 핀 6장
  for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(0.014, 0.1, 0.1), M.cast, -0.06 + i * 0.024, 0.088, ZC - 0.06);
  // 모터 고정 나사 4개
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([a, b]) => add(disc(0.008, 0.008, 16), M.steel, a * 0.072, b * 0.06 + 0.005, ZC - 0.076));
  [[-1, 1], [1, 1]].forEach(([a]) => add(disc(0.009, 0.006, 16), M.steel, a * 0.155, 0.125, ZM - 0.012));
  // 모델명 라벨판
  const lc = document.createElement('canvas'); lc.width = 256; lc.height = 64;
  const lx = lc.getContext('2d'); lx.fillStyle = '#101114'; lx.fillRect(0, 0, 256, 64); lx.fillStyle = '#f2f2f2';
  lx.beginPath(); lx.roundRect(48, 14, 160, 36, 8); lx.fill(); lx.fillStyle = '#111'; lx.font = 'bold 24px Arial, sans-serif'; lx.textAlign = 'center'; lx.textBaseline = 'middle'; lx.fillText('FE-B400FT', 128, 33);
  const lt = new THREE.CanvasTexture(lc); lt.colorSpace = THREE.SRGBColorSpace; lt.anisotropy = 4;
  // BoxGeometry 면 순서 +x,-x,+y,-y,+z,-z → 뒤(-z)를 보는 면에 라벨
  add(new THREE.BoxGeometry(0.13, 0.033, 0.012), [M.black, M.black, M.black, M.black, M.black, new THREE.MeshStandardMaterial({ map: lt, roughness: 0.6, metalness: 0.1 })], 0, -0.138, ZC - 0.05);
  // 케이블 2가닥 (아래로 나와 옆으로)
  [-0.016, 0.016].forEach((dx, i) => {
    const c = new THREE.CatmullRomCurve3([V(dx, -0.152, ZC - 0.045), V(dx, -0.2, ZC - 0.06), V(0.08 + i * 0.03, -0.3, ZC - 0.1), V(0.3 + i * 0.03, -0.36, ZC - 0.12), V(0.42 + i * 0.03, -0.37, -0.25)]);
    add(new THREE.TubeGeometry(c, 48, 0.007, 10, false), M.cable);
    add(disc(0.011, 0.02, 16), M.black, dx, -0.16, ZC - 0.045).rotation.x = Math.PI / 2; // 케이블 글랜드(아래 방향)
  });

  /* ---------- 지지 파이프: 좌우 각 1개, 판 위·아래 너트에서 뒤로 → 안쪽으로 꺾여 마운트판 옆 ---------- */
  const TR = 0.0125;
  [-1, 1].forEach((a) => {
    const zR = ZM - 0.03;
    const c = new THREE.CatmullRomCurve3([
      V(a * 0.365, 0.365, -0.006), V(a * 0.365, 0.365, -0.2), V(a * 0.36, 0.36, zR + 0.06), V(a * 0.33, 0.31, zR),
      V(a * 0.24, 0.17, zR), V(a * 0.226, 0.06, zR), V(a * 0.226, -0.06, zR), V(a * 0.24, -0.17, zR),
      V(a * 0.33, -0.31, zR), V(a * 0.36, -0.36, zR + 0.06), V(a * 0.365, -0.365, -0.2), V(a * 0.365, -0.365, -0.006),
    ], false, 'catmullrom', 0.2);
    add(new THREE.TubeGeometry(c, 160, TR, 14, false), M.tube);
    add(new THREE.BoxGeometry(0.03, 0.2, 0.014), M.black, a * 0.212, 0, zR + 0.004);   // 마운트판 연결 탭(파이프를 따라 용접)
    [0.365, -0.365].forEach((y) => add(disc(0.019, 0.022, 20), M.tube, a * 0.365, y, -0.017)); // 판 쪽 파이프 끝 슬리브
  });

  const solids = []; group.traverse((o) => { if (o.isMesh && !ghosts.some((g) => g === o.parent)) { solids.push(o); o.castShadow = o.receiveShadow = true; } });

  /* ---------- 공기 흐름: 꼬리 달린 선. 흐름 속도·꼬리 길이·입자 수가 모두 속도에 비례 ---------- */
  const NP = 1200, seeds = [];
  for (let i = 0; i < NP; i++) seeds.push({ p: Math.random(), a: Math.random() * Math.PI * 2, r: Math.sqrt(Math.random()) * 0.19 + 0.01, o: Math.random(), rank: Math.random() });
  const lpos = new Float32Array(NP * 6), lcol = new Float32Array(NP * 6);
  const lgeo = new THREE.BufferGeometry();
  lgeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3)); lgeo.setAttribute('color', new THREE.BufferAttribute(lcol, 3));
  // 색만 더하고 알파는 건드리지 않는 가산 합성 → 투명 캔버스(3d.html)에서도 검은 점이 생기지 않음
  const lmat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor });
  const lines = new THREE.LineSegments(lgeo, lmat); lines.frustumCulled = false; group.add(lines);
  const air = new THREE.Color(0x3aa2e6);
  function flowAt(s, p, out, k) {
    let x, y, z;
    if (p < 0.42) { // 정면에서 축 방향으로 빨려 들어옴
      const f = p / 0.42, rr = s.r * (1 - 0.25 * f * f);
      z = 0.95 - 1.12 * f; x = Math.cos(s.a) * rr; y = Math.sin(s.a) * rr;
    } else {        // 임펠러에서 회전 방향으로 휘며 바깥으로 퍼져 나감
      const f = (p - 0.42) / 0.58, rr = 0.2 + f * 0.85;
      const a = s.a - f * swirl;
      z = -0.17 - Math.min(1, f * 2.5) * (0.06 + 0.2 * s.o);
      x = Math.cos(a) * rr; y = Math.sin(a) * rr;
    }
    out[k] = x; out[k + 1] = y; out[k + 2] = z;
  }

  /* ---------- 속도 ---------- */
  let target = 1, cur = 1, swirl = 1.6, angle = 0;
  const spacing = Math.PI * 2 / NB;
  function setSpeed(s) { target = Math.max(0, Math.min(1, s)); }
  function update(dt) {
    cur += (target - cur) * (1 - Math.exp(-dt / 0.17)); // 약 0.5초에 목표 속도 도달
    const s = cur, w = SPIN * s;
    angle -= w * dt; rotor.rotation.z = angle;
    const smear = Math.min(spacing * 0.9, w * SHUTTER);
    ghosts.forEach((g, k) => { g.rotation.z = smear * (k + 1) / GHOSTS; });
    ghostMat.opacity = 0.32 * Math.min(1, smear / (spacing * 0.6));
    swirl = 1.3 + 0.6 * s;
    const vel = 0.5 * s, tail = 0.1 * s, bright = 0.32 + 0.5 * s;
    for (let i = 0; i < NP; i++) {
      const sd = seeds[i];
      sd.p = (sd.p + dt * vel) % 1;
      const vis = Math.min(1, Math.max(0, (s - sd.rank) / 0.06)) * bright; // 보이는 입자 수 ∝ 속도, 경계는 부드럽게
      flowAt(sd, sd.p, lpos, i * 6);
      flowAt(sd, Math.max(0, sd.p - tail - 0.004), lpos, i * 6 + 3);
      if (sd.p - tail - 0.004 < 0) { lpos[i * 6 + 3] = lpos[i * 6]; lpos[i * 6 + 4] = lpos[i * 6 + 1]; lpos[i * 6 + 5] = lpos[i * 6 + 2]; }
      const fadeIn = Math.min(1, sd.p / 0.06), fadeOut = Math.min(1, (1 - sd.p) / 0.12), v = vis * fadeIn * fadeOut;
      lcol[i * 6] = air.r * v; lcol[i * 6 + 1] = air.g * v; lcol[i * 6 + 2] = air.b * v;
      lcol[i * 6 + 3] = 0; lcol[i * 6 + 4] = 0; lcol[i * 6 + 5] = 0;
    }
    lgeo.attributes.position.needsUpdate = true; lgeo.attributes.color.needsUpdate = true;
  }

  return { group, rotor, solids, hotspots: HOTSPOTS, setSpeed, update, get speed() { return cur; } };
}
