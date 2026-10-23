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

  /* ---------- 공기 흐름 (F4): 흡입 쪽은 더운 공기(주황 연무 + 아지랑이), 배출 쪽은 식은 공기(하늘색 안개)
     연무 조각은 프랙탈 노이즈로 만든 불규칙한 모양. 흐름 속도·보이는 양·아지랑이 세기 모두 회전 속도에 비례 ---------- */
  const atlas = document.createElement('canvas'); atlas.width = atlas.height = 256; const ax = atlas.getContext('2d');
  [7, 14, 21, 28].forEach((sd, ti) => {
    const N = 128, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'), im = x.createImageData(N, N);
    let s0 = sd; const r = () => (s0 = (s0 * 16807) % 2147483647) / 2147483647;
    const G = 16, grid = []; for (let i = 0; i < (G + 1) * (G + 1); i++) grid.push(r());
    const sm = (t) => t * t * (3 - 2 * t);
    const vn = (u, v) => { u = ((u % G) + G) % G; v = ((v % G) + G) % G; const i = Math.floor(u), j = Math.floor(v), fu = sm(u - i), fv = sm(v - j);
      const q = (ii, jj) => grid[jj * (G + 1) + ii], top = q(i, j) + (q(i + 1, j) - q(i, j)) * fu, bot = q(i, j + 1) + (q(i + 1, j + 1) - q(i, j + 1)) * fu; return top + (bot - top) * fv; };
    const fbm = (u, v) => { let s = 0, a2 = 0.5, f = 1; for (let o = 0; o < 5; o++) { s += a2 * vn(u * f, v * f); a2 *= 0.5; f *= 2; } return s; };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const n = fbm(i / N * 4, j / N * 4), rr = Math.hypot(i / N - 0.5, j / N - 0.5) * 2;
      const edge = 1 - Math.min(1, Math.max(0, (rr - 0.35 - 0.35 * n) / 0.35)), al = Math.max(0, n - 0.32) * 1.9 * edge, k = (j * N + i) * 4;
      im.data[k] = im.data[k + 1] = im.data[k + 2] = 255; im.data[k + 3] = Math.min(255, al * 255);
    }
    x.putImageData(im, 0, 0); ax.drawImage(c, (ti % 2) * 128, Math.floor(ti / 2) * 128);
  });
  const mistTex = new THREE.CanvasTexture(atlas);
  // 색만 더하고 알파는 건드리지 않음 → 투명 캔버스(3d.html)에서도 검게 비지 않음
  const MIST_BLEND = { blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, transparent: true, depthWrite: false };
  const WARM = [new THREE.Color(1.0, 0.25, 0.03), new THREE.Color(1.0, 0.52, 0.1)], COOL = [new THREE.Color(0.5, 0.82, 1.0), new THREE.Color(0.2, 0.5, 0.95)];
  const mistCol = (p, out) => p < 0.34 ? out.copy(WARM[0]).lerp(WARM[1], p / 0.34)
    : p < 0.56 ? out.copy(WARM[1]).lerp(COOL[0], (p - 0.34) / 0.22) : out.copy(COOL[0]).lerp(COOL[1], (p - 0.56) / 0.44);
  const NM = 300, mist = [];
  const mPos = new Float32Array(NM * 3), mCol = new Float32Array(NM * 4), mSize = new Float32Array(NM), mRot = new Float32Array(NM), mCell = new Float32Array(NM);
  const mGeo = new THREE.BufferGeometry();
  mGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3)); mGeo.setAttribute('aCol', new THREE.BufferAttribute(mCol, 4));
  mGeo.setAttribute('aSize', new THREE.BufferAttribute(mSize, 1)); mGeo.setAttribute('aRot', new THREE.BufferAttribute(mRot, 1)); mGeo.setAttribute('aCell', new THREE.BufferAttribute(mCell, 1));
  const mMat = new THREE.ShaderMaterial({
    uniforms: { tMap: { value: mistTex }, uScale: { value: 1 } },
    vertexShader: `attribute vec4 aCol; attribute float aSize, aRot, aCell; uniform float uScale; varying vec4 vCol; varying float vRot, vCell;
      void main(){ vCol = aCol; vRot = aRot; vCell = aCell; vec4 mv = modelViewMatrix * vec4(position, 1.); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D tMap; varying vec4 vCol; varying float vRot, vCell;
      void main(){ vec2 p = gl_PointCoord - 0.5; float c = cos(vRot), s = sin(vRot); p = mat2(c, -s, s, c) * p;
        if (abs(p.x) > 0.5 || abs(p.y) > 0.5) discard;
        vec2 uv = (p + 0.5) * 0.5 + vec2(mod(vCell, 2.), floor(vCell / 2.)) * 0.5; uv.y = 1. - uv.y;
        float a = texture2D(tMap, uv).a * vCol.a; gl_FragColor = vec4(vCol.rgb, a); }`,
    ...MIST_BLEND,
  });
  const mistPts = new THREE.Points(mGeo, mMat); mistPts.frustumCulled = false; group.add(mistPts);
  // 점 크기를 화면 높이에 맞춤 (세계 단위 크기 → 픽셀)
  mistPts.onBeforeRender = (r, sc, cam) => { const h = r.getDrawingBufferSize(new THREE.Vector2()).y; mMat.uniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov || 32) / 2)); };
  for (let i = 0; i < NM; i++) {
    const warmSide = i < 90; // 흡입 쪽 90개(옅게), 배출 쪽 210개
    mCell[i] = i % 4; mRot[i] = Math.random() * 6.28;
    mist.push({ i, warmSide, p: warmSide ? Math.random() * 0.45 : 0.5 + Math.random() * 0.5, a: Math.random() * Math.PI * 2, r: Math.sqrt(Math.random()) * 0.2, o: Math.random(), rank: Math.random(),
      size: warmSide ? 0.22 + 0.2 * Math.random() : 0.2 + 0.25 * Math.random(), spin: (Math.random() - 0.5) * 0.6 });
  }
  const tmpV = new THREE.Vector3();
  const tmpC = new THREE.Color();
  function flowAt(s, p, v) {
    if (p < 0.42) { // 정면에서 축 방향으로 빨려 들어옴
      const f = p / 0.42, rr = s.r * (1 - 0.25 * f * f);
      v.set(Math.cos(s.a) * rr, Math.sin(s.a) * rr, 0.95 - 1.12 * f);
    } else {        // 임펠러에서 회전 방향으로 휘며 바깥으로 퍼져 나감
      const f = (p - 0.42) / 0.58, rr = 0.2 + f * 0.85, a = s.a - f * swirl;
      v.set(Math.cos(a) * rr, Math.sin(a) * rr, -0.17 - Math.min(1, f * 2.5) * (0.06 + 0.2 * s.o));
    }
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
    const vel = 0.32 * s;
    for (const m of mist) {
      // 흡입 쪽 조각은 0~0.45 구간, 배출 쪽 조각은 0.5~1 구간을 돈다
      const lo = m.warmSide ? 0 : 0.5, span = m.warmSide ? 0.45 : 0.5;
      m.p = lo + (((m.p - lo + dt * vel) % span) + span) % span;
      const f = (m.p - lo) / span, env = Math.min(1, f / 0.15, (1 - f) / 0.3);
      const vis = Math.min(1, Math.max(0, (s - m.rank) / 0.08)); // 보이는 양 ∝ 속도, 경계는 부드럽게
      flowAt(m, m.p, tmpV); mPos.set([tmpV.x, tmpV.y, tmpV.z], m.i * 3);
      mistCol(m.p, tmpC); mCol.set([tmpC.r, tmpC.g, tmpC.b, (m.warmSide ? 0.11 : 0.1) * env * vis * (0.35 + 0.65 * s)], m.i * 4);
      mRot[m.i] += m.spin * dt * (0.3 + s);
      mSize[m.i] = m.size * (0.8 + 0.5 * (m.warmSide ? 0 : f));
    }
    for (const k of ['position', 'aCol', 'aSize', 'aRot']) mGeo.attributes[k].needsUpdate = true;
  }

  return { group, rotor, solids, hotspots: HOTSPOTS, setSpeed, update, get speed() { return cur; } };
}

/* 아지랑이(흡입 쪽 열기): 장면을 텍스처로 한 번 그린 뒤, 흡입구 앞 공기 기둥 부분만 노이즈로 일렁이게 해서 화면에 그림.
   세기는 회전 속도에 비례하고 투명 배경(알파)은 그대로 유지.
   const haze = createHaze(THREE, renderer); 매 프레임 haze.render(scene, camera, fan.speed, dt) */
export function createHaze(THREE, renderer) {
  const size = new THREE.Vector2();
  // 장면은 선형 HDR로 받아 두고, 화면에 그릴 때 톤매핑·sRGB 변환을 이 셰이더에서 적용
  const rt = new THREE.WebGLRenderTarget(2, 2, { samples: 4, type: THREE.HalfFloatType });
  const mat = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: rt.texture }, uA: { value: new THREE.Vector2() }, uB: { value: new THREE.Vector2() }, uR: { value: 0.1 },
      uAspect: { value: 1 }, uT: { value: 0 }, uK: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
    fragmentShader: `uniform sampler2D tScene; uniform vec2 uA, uB; uniform float uR, uAspect, uT, uK; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 p = vUv * vec2(uAspect, 1.), a = uA * vec2(uAspect, 1.), b = uB * vec2(uAspect, 1.);
        vec2 ab = b - a; float t = clamp(dot(p - a, ab) / dot(ab, ab), 0., 1.); float d = length(p - (a + ab * t));
        float w = smoothstep(uR, uR * 0.25, d) * (0.35 + 0.65 * t) * uK;
        vec2 q = p * 34. + vec2(0., -uT * 2.2);
        vec2 off = (vec2(n(q), n(q + 17.3)) - 0.5) * 0.014 * w;
        vec4 c = texture2D(tScene, vUv + off);
        c.rgb += vec3(0.05, 0.015, 0.) * w * c.a;
        gl_FragColor = c;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    depthTest: false, depthWrite: false, transparent: true, blending: THREE.NoBlending, toneMapped: true,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false;
  const qScene = new THREE.Scene(); qScene.add(quad); const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vr = new THREE.Vector3(), vc = new THREE.Vector3();
  let time = 0;
  return {
    render(scene, camera, speed = 1, dt = 1 / 60) {
      renderer.getDrawingBufferSize(size);
      if (rt.width !== size.x || rt.height !== size.y) rt.setSize(size.x, size.y);
      time += dt * (0.4 + speed);
      // 흡입구 앞 공기 기둥 (z 0.9 → 0.05) 을 화면 좌표로
      va.set(0, 0, 0.9).project(camera); vb.set(0, 0, 0.05).project(camera); vr.set(0.2, 0, 0.5).project(camera); vc.set(0, 0, 0.5).project(camera);
      const asp = size.x / size.y;
      mat.uniforms.uA.value.set((va.x + 1) / 2, (va.y + 1) / 2); mat.uniforms.uB.value.set((vb.x + 1) / 2, (vb.y + 1) / 2);
      mat.uniforms.uR.value = Math.max(0.04, Math.hypot((vr.x - vc.x) / 2 * asp, (vr.y - vc.y) / 2) * 1.6);
      mat.uniforms.uAspect.value = asp; mat.uniforms.uT.value = time; mat.uniforms.uK.value = speed;
      const prev = renderer.getRenderTarget(); renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, camera);
      renderer.setRenderTarget(prev); renderer.render(qScene, qCam);
    },
  };
}
