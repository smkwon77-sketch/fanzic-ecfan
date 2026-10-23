/* 홍보영상 48초 타임라인 (1920×1080, 30fps). 기존 영상(fanzic-ec-fan.mp4 초판)의 장면 순서·문구·배치를 그대로 따르고
   제품만 fe-model.js 실물형 모델로 그림.
   drawFrame(t): 3D + 문구를 out 캔버스에 합성 / renderVideo(): WebCodecs H.264 → mp4-muxer → /save */
import { Muxer, ArrayBufferTarget } from 'https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.3/build/mp4-muxer.mjs';

const W = 1920, H = 1080, FPS = 30, DUR = 48;
const C = { bg: '#03152e', fg: '#e8ecf2', soft: '#c9d4e4', muted: '#9fb0c8', air: '#48A9E6', red: '#ED1C24', panel: 'rgba(10,37,72,0.86)', line: '#1b3a66' };
const F = {
  disp: (s, w = 800) => `${w} ${s}px Archivo, "IBM Plex Sans KR", sans-serif`,
  kr: (s, w = 400) => `${w} ${s}px "IBM Plex Sans KR", "Malgun Gothic", sans-serif`,
  mono: (s, w = 500) => `${w} ${s}px "IBM Plex Mono", monospace`,
};

/* ---------- 장면: 시작·끝(초), 카메라(각도 a: 0=정면, -π/2=왼쪽, π=뒤 / 거리 r / 높이 y), 화면 이동, 어둡게 ---------- */
const PI = Math.PI;
const SCENES = [
  { id: 'intro', t0: 0,    t1: 7.6,  a: [-0.62, -0.44], r: [3.05, 2.85], y: 0.38, tgt: [0, 0, -0.26], shift: 0.24, text: true },
  { id: 'motor', t0: 7.6,  t1: 15.6, a: [PI + 0.6, PI + 0.42], r: [2.75, 2.55], y: 0.36, tgt: [0, 0, -0.38], shift: 0.24, text: true },
  { id: 'speed', t0: 15.6, t1: 23.6, a: [-PI / 2 - 0.32, -PI / 2 - 0.18], r: [2.85, 2.75], y: 0.26, tgt: [0, 0, -0.3], shift: 0.24, text: true },
  { id: 'imp',   t0: 23.6, t1: 31.6, a: [-0.34, -0.22], r: [2.3, 2.1], y: 0.14, tgt: [0, 0, -0.16], shift: 0.24, text: true },
  { id: 'iot',   t0: 31.6, t1: 38.6, a: [PI - 0.38, PI - 0.22], r: [2.75, 2.6], y: 0.4, tgt: [0, 0, -0.38], shift: 0.24, text: true },
  { id: 'apps',  t0: 38.6, t1: 43.6, a: [-1.05, -0.85], r: [2.4, 2.3], y: 0.3, tgt: [0, 0, -0.26], shift: 0, dim: 0.82 },
  { id: 'outro', t0: 43.6, t1: 48,   a: [-0.55, -0.45], r: [2.25, 2.2], y: 0.3, tgt: [0, 0, -0.26], shift: -0.02, dim: 0.78 },
];
const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const lerp = (a, b, f) => a + (b - a) * f;

/* 02 장면 속도: 100% → 50%로 내려가 머문 뒤 다시 올라감 */
function speedAt(t) {
  if (t < 0) return 0;
  if (t < 15.6 || t >= 23.6) return 1;
  if (t < 16.4) return 1;
  if (t < 20.0) return lerp(1, 0.5, smooth((t - 16.4) / 3.6));
  if (t < 22.3) return 0.5;
  return lerp(0.5, 0.8, smooth((t - 22.3) / 1.3));
}

export function createVideo({ THREE, renderer, scene, camera, fan, assets }) {
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const ctx = out.getContext('2d');

  /* ---------- 그리기 도우미 ---------- */
  let A = 1; // 현재 블록 투명도
  function text(s, x, y, font, color = C.fg, { align = 'left', ls = 0, alpha = 1 } = {}) {
    ctx.save(); ctx.globalAlpha = A * alpha; ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    ctx.letterSpacing = ls + 'px'; ctx.fillText(s, x, y); const w = ctx.measureText(s).width; ctx.restore(); return w;
  }
  function runs(parts, x, y) { // [[문자열, 글꼴, 색], ...] 이어 쓰기
    for (const [s, font, color] of parts) x += text(s, x, y, font, color);
    return x;
  }
  function rrect(x, y, w, h, r, fill, stroke) {
    ctx.save(); ctx.globalAlpha = A; ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); } ctx.restore();
  }
  function img(im, x, y, w, h = w * im.height / im.width, alpha = 1) { ctx.save(); ctx.globalAlpha = A * alpha; ctx.drawImage(im, x, y, w, h); ctx.restore(); }
  function badge(x, y) { rrect(x, y, 102, 40, 5, C.red); text('NEW', x + 51, y + 29, F.disp(25), '#fff', { align: 'center', ls: 3 }); }
  // 블록 등장: 시각 at에 0.5초 동안 아래에서 18px 올라오며 나타나고, 장면 끝 0.45초 전부터 사라짐
  function block(t, at, end, fn) {
    const f = ease((t - at) / 0.5), g = 1 - smooth((t - (end - 0.45)) / 0.4);
    const a = Math.min(f, g); if (a <= 0.001) return;
    ctx.save(); ctx.translate(0, (1 - f) * 18); A = a; fn(); A = 1; ctx.restore();
  }
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const pct = (v) => (v < 20 ? v.toFixed(1) : Math.round(v).toString()) + '%';

  /* ---------- 장면별 문구 ---------- */
  const TX = 1100;
  const DRAW = {
    intro(t, e) {
      block(t, 0.7, e, () => img(assets.logo, TX, 188, 258));
      block(t, 1.0, e, () => badge(TX, 278));
      block(t, 1.15, e, () => text('FE SERIES · EC PLUG FANS', TX, 370, F.mono(24), C.air, { ls: 4 }));
      block(t, 1.3, e, () => text('EC FAN', TX - 6, 537, F.disp(150), C.fg));
      block(t, 1.7, e, () => { text('차세대 고효율 EC 플러그팬', TX, 622, F.kr(42), C.soft); text('Next-generation high-efficiency EC plug fan', TX, 690, F.kr(27), C.muted); });
      block(t, 2.8, e, () => { text('필요한 만큼만 돌리고,', TX, 795, F.kr(42, 700)); text('더 조용하고 강하게.', TX, 847, F.kr(42, 700)); text('Run only as much as you need.', TX, 892, F.kr(27), C.muted); });
    },
    motor(t, e) {
      const s0 = 7.6;
      block(t, s0 + 0.6, e, () => { text('01', TX - 4, 360, F.disp(105), C.air); text('고효율 EC 모터', TX, 453, F.kr(60, 700)); text('High-efficiency EC motor', TX, 515, F.kr(27), C.muted); });
      const rows = [['기술 TECH', '브러시리스 외륜 구동', 'Brushless external-rotor motor', C.fg], ['성능 PERF', '고효율 운전', 'High-efficiency operation', C.fg], ['효과 GAIN', '기존 AC팬 대비 전력비 절감', 'Lower energy cost than AC fans', C.air]];
      rows.forEach(([k, v, en, col], i) => block(t, s0 + 1.6 + i * 1.2, e, () => {
        const y = 590 + i * 93;
        const [ko, en2] = k.split(' '); const w = text(ko, TX, y - 4, F.kr(19, 500), C.air); text(en2, TX + w + 10, y - 4, F.mono(19), C.air, { ls: 3 }); // 한글은 KR 글꼴, 영문만 모노
        text(v, 1268, y, F.kr(33, 500), col); text(en, 1268, y + 28, F.kr(21), C.muted);
      }));
    },
    speed(t, e) {
      const s0 = 15.6, s = speedAt(t) * 100;
      block(t, s0 + 0.4, e, () => { text('02', TX - 4, 207, F.disp(105), C.air); text('무단 속도 제어', TX, 300, F.kr(60, 700)); text('Stepless speed control · built-in controller, no inverter', TX, 360, F.kr(27), C.muted); });
      block(t, s0 + 0.8, e, () => {
        [['회전 속도 Speed', pct(s), C.fg], ['풍량 Airflow', pct(s), C.fg], ['소비전력 Power', pct(Math.pow(s / 100, 3) * 100), C.air]].forEach(([k, v, col], i) => {
          const x = TX + i * 259; rrect(x, 395, 242, 130, 9, C.panel, C.line);
          text(k, x + 22, 435, F.kr(20), C.muted); text(v, x + 20, 500, F.disp(57, 700), col);
        });
      });
      block(t, s0 + 1.2, e, () => {
        const L = 1140, R = 1800, T = 580, B = 820;
        ctx.save(); ctx.globalAlpha = A; ctx.strokeStyle = C.line; ctx.lineWidth = 1.5;
        [T, (T + B) / 2, B].forEach((y) => { ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(R, y); ctx.stroke(); });
        ctx.strokeStyle = C.air; ctx.lineWidth = 3.5; ctx.beginPath();
        for (let v = 20; v <= 100; v++) { const x = L + (v - 20) / 80 * (R - L), y = B - Math.pow(v / 100, 3) * (B - T); v === 20 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        ctx.stroke();
        const dx = L + (s - 20) / 80 * (R - L), dy = B - Math.pow(s / 100, 3) * (B - T);
        ctx.fillStyle = C.air; ctx.beginPath(); ctx.arc(dx, dy, 10, 0, PI * 2); ctx.fill(); ctx.restore();
        text('power', L + 8, T + 22, F.kr(18), C.muted); text('20%', L, B + 26, F.kr(18), C.muted); text('100% speed', R, B + 26, F.kr(18), C.muted, { align: 'right' });
      });
      block(t, 20.0, e, () => {
        runs([['풍량 50% → 전력 약 ', F.kr(42, 700), C.fg], ['1/8', F.kr(42, 700), C.air]], TX, 918);
        text('~1/8 power at 50% airflow · 팬 상사법칙 이론값 (theoretical)', TX, 960, F.kr(27), C.muted);
      });
      block(t, s0 + 0.4, e, () => text('※ 전력 수치는 팬 상사법칙에 따른 이론값 · Power figures are theoretical · Fanzic Co., Ltd.', 60, 1040, F.kr(19), C.muted, { alpha: 0.8 }));
    },
    imp(t, e) {
      const s0 = 23.6, f = ease((t - (s0 + 1.3)) / 3.0);
      block(t, s0 + 0.4, e, () => { text('03', TX - 4, 266, F.disp(105), C.air); text('후향익 임펠러 + 인렛 링', TX, 360, F.kr(60, 700)); text('Backward-curved impeller with bell-mouth inlet', TX, 420, F.kr(25), C.muted); });
      block(t, s0 + 1.1, e, () => { text(fmt(20200 * f), TX - 4, 558, F.disp(105), C.air); runs([['최대 풍량 m³/h', F.kr(25, 500), C.fg], [' · Max airflow', F.kr(25), C.muted]], TX, 603); });
      block(t, s0 + 1.4, e, () => { text(fmt(184 * f), TX - 4, 746, F.disp(105), C.air); runs([['최대 정압 mmAq', F.kr(25, 500), C.fg], [' · Max static pressure', F.kr(25), C.muted]], TX, 790); });
      block(t, s0 + 4.9, e, () => { text('고풍량·고정압, 저소음 송풍', TX, 867, F.kr(42, 700)); text('High airflow and pressure with a low-noise design', TX, 903, F.kr(25), C.muted); });
    },
    iot(t, e) {
      const s0 = 31.6;
      block(t, s0 + 0.5, e, () => { text('04', TX - 4, 310, F.disp(105), C.air); text('실시간 모니터링', TX, 402, F.kr(60, 700)); text('Real-time monitoring · IoT integration', TX, 463, F.kr(25), C.muted); });
      [['운전 상태', 'STATUS'], ['회전 속도', 'SPEED'], ['이상 알림', 'ALERT']].forEach(([k, tag], i) => block(t, s0 + 1.7 + i * 0.8, e, () => {
        const y = 498 + i * 93; rrect(TX, y, 760, 77, 9, C.panel, C.line);
        ctx.save(); ctx.globalAlpha = A; ctx.fillStyle = C.air; ctx.beginPath(); ctx.arc(TX + 36, y + 38.5, 9, 0, PI * 2); ctx.fill(); ctx.restore();
        text(k, TX + 63, y + 48, F.kr(27, 500)); text(tag, TX + 733, y + 46, F.mono(18), C.muted, { align: 'right', ls: 3 });
      }));
      block(t, s0 + 4.4, e, () => { text('IoT 설비 연동 → 원격 관리·예방 정비', TX, 825, F.kr(39, 700)); text('Remote and predictive maintenance', TX, 860, F.kr(25), C.muted); });
    },
    apps(t, e) {
      const s0 = 38.6;
      block(t, s0 + 0.4, e, () => { text('APPLICATIONS', 120, 300, F.mono(24), C.air, { ls: 5 }); const w = text('어디에 쓰나', 120, 430, F.kr(90, 700)); text('Where it works', 120 + w + 26, 422, F.kr(39, 700), C.muted); });
      [['데이터센터·클린룸', '냉각 및 공기 순환', 'Data center & clean room cooling'], ['공조기·항온항습기', '송풍용 플러그팬', 'Supply fans for AHUs & precision A/C'], ['건물·공장 환기', '급·배기 환기', 'Building & factory ventilation']]
        .forEach(([h, ko, en], i) => block(t, s0 + 1.1 + i * 0.7, e, () => {
          const x = 120 + i * 570, y = 485; rrect(x, y, 540, 315, 14, C.panel, C.line);
          img(assets.apps[i], x + 34, y + 40, 76, 76);
          text(h, x + 40, y + 175, F.kr(39, 700)); text(ko, x + 40, y + 235, F.kr(22), C.muted); text(en, x + 40, y + 265, F.kr(23), C.muted);
        }));
    },
    outro(t, e) {
      const s0 = 43.6;
      block(t, s0 + 0.3, e + 9, () => { img(assets.logo, 120, 225, 360); text('Good Air, Better Life!', 120, 357, F.kr(28, 700), C.soft); });
      block(t, s0 + 0.5, e + 9, () => { badge(120, 387); text('EC FAN', 114, 562, F.disp(128), C.fg); });
      block(t, s0 + 0.8, e + 9, () => {
        text('FE SERIES · 9 models · Φ250~Φ560', 120, 637, F.kr(40), C.soft);
        text('최대 풍량 20,200 m³/h · 최대 정압 184 mmAq', 120, 702, F.kr(28, 500));
        text('Up to 20,200 m³/h and 184 mmAq · 3Φ 380V 50/60Hz', 120, 760, F.kr(27), C.muted);
        text('필요한 만큼만, 더 조용하고 강하게.', 120, 845, F.kr(40, 700), C.air);
      });
      [assets.p1, assets.p2].forEach((p, i) => block(t, s0 + 0.9 + i * 0.25, e + 9, () => {
        const x = 976 + i * 424, y = 350; rrect(x, y, 400, 380, 14, '#f4f5f7');
        const k = Math.min(352 / p.width, 332 / p.height), w = p.width * k, h = p.height * k; img(p, x + (400 - w) / 2, y + (380 - h) / 2, w, h);
      }));
      block(t, s0 + 0.3, e + 9, () => text('※ 전력 수치는 팬 상사법칙에 따른 이론값 · Power figures are theoretical · Fanzic Co., Ltd.', 60, 1040, F.kr(19), C.muted, { alpha: 0.8 }));
    },
  };

  /* ---------- 한 프레임 ---------- */
  const tgt = new THREE.Vector3();
  function drawFrame(t, dt = 1 / FPS) {
    const sc = SCENES.find((s) => t >= s.t0 && t < s.t1) || SCENES[SCENES.length - 1];
    const f = smooth((t - sc.t0) / (sc.t1 - sc.t0));
    const a = lerp(sc.a[0], sc.a[1], f), r = lerp(sc.r[0], sc.r[1], f);
    tgt.set(...sc.tgt);
    camera.position.set(tgt.x + Math.sin(a) * r, sc.y, tgt.z + Math.cos(a) * r);
    camera.up.set(0, 1, 0); camera.lookAt(tgt);
    camera.setViewOffset(W, H, sc.shift * W, 0, W, H);
    fan.setSpeed(speedAt(t)); fan.update(dt);
    renderer.render(scene, camera);

    // 배경 + 제품 뒤 은은한 빛
    ctx.globalAlpha = 1; ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    const gx = W * (0.5 - sc.shift), g = ctx.createRadialGradient(gx, H * 0.5, 40, gx, H * 0.5, 760);
    g.addColorStop(0, 'rgba(22,66,124,0.85)'); g.addColorStop(1, 'rgba(3,21,46,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(renderer.domElement, 0, 0, W, H);
    if (sc.dim) { ctx.fillStyle = `rgba(3,21,46,${sc.dim})`; ctx.fillRect(0, 0, W, H); }
    if (sc.text) { // 문구 쪽은 은은하게 어둡게 해서 기류 선이 글자를 가리지 않게
      const tg = ctx.createLinearGradient(920, 0, 1180, 0); tg.addColorStop(0, 'rgba(3,21,46,0)'); tg.addColorStop(1, 'rgba(3,21,46,0.78)');
      ctx.fillStyle = tg; ctx.fillRect(920, 0, W - 920, H);
    }
    // 화면 왼쪽 위 작은 로고(인트로·마무리 제외)
    if (t >= 7.6 && t < 43.6) { A = Math.min(smooth((t - 7.6) / 0.6), 1 - smooth((t - 43.2) / 0.4)); img(assets.logo, 60, 50, 188); A = 1; }
    DRAW[sc.id](t, sc.t1);
    // 장면 전환: 경계 앞뒤로 잠깐 어둡게, 시작·끝은 배경색에서 열고 닫음
    let dark = 0;
    for (const s of SCENES.slice(1)) dark = Math.max(dark, 1 - Math.abs(t - s.t0) / 0.32);
    dark = Math.max(dark, 1 - t / 0.8, 1 - (DUR - t) / 0.5);
    if (dark > 0) { ctx.fillStyle = `rgba(3,21,46,${Math.min(1, dark) * 0.92})`; ctx.fillRect(0, 0, W, H); }
    return out;
  }

  /* ---------- 인코딩: 프레임 단위로 렌더 → H.264 → mp4 ---------- */
  async function renderVideo({ bitrate = 3_200_000, name = 'fanzic-ec-fan.mp4', posterAt = 5.2, onProgress = () => {} } = {}) {
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({ target, video: { codec: 'avc', width: W, height: H, frameRate: FPS }, fastStart: 'in-memory' });
    const enc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { throw e; } });
    enc.configure({ codec: 'avc1.640028', width: W, height: H, bitrate, bitrateMode: 'variable', framerate: FPS, latencyMode: 'quality', avc: { format: 'avc' } });
    let poster = null;
    const N = DUR * FPS;
    for (let i = 0; i < N; i++) {
      const t = i / FPS;
      drawFrame(t);
      if (!poster && t >= posterAt) {
        const pc = document.createElement('canvas'); pc.width = 1280; pc.height = 720; pc.getContext('2d').drawImage(out, 0, 0, 1280, 720);
        poster = await new Promise((r) => pc.toBlob(r, 'image/jpeg', 0.86));
      }
      const vf = new VideoFrame(out, { timestamp: Math.round(i * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
      enc.encode(vf, { keyFrame: i % (FPS * 2) === 0 }); vf.close();
      while (enc.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 2));
      if (i % 15 === 0) { onProgress(i / N); await new Promise((r) => setTimeout(r, 0)); }
    }
    await enc.flush(); muxer.finalize();
    const mp4 = new Blob([target.buffer], { type: 'video/mp4' });
    const save = async (n, b) => (await fetch('/save?name=' + encodeURIComponent(n), { method: 'POST', body: b })).text();
    const r1 = await save(name, mp4), r2 = poster ? await save('poster.jpg', poster) : 'no poster';
    onProgress(1);
    return { mp4: mp4.size, r1, r2 };
  }

  return { out, drawFrame, renderVideo, SCENES, W, H, FPS, DUR };
}
