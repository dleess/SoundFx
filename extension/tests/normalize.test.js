import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  kWeightingCoeffs,
  createLoudnessMeter,
  computeTargetGainFromLufs,
  smoothGain,
  nextGain,
  softClip,
  dbToGain,
  GAIN_MIN_DB,
  GAIN_MAX_DB,
  TARGET_LUFS_DEFAULT,
  ATTACK_S,
  RELEASE_S,
  ABS_GATE_LUFS,
  MOMENTARY_S,
  CLIP_THRESHOLD,
  SHELF_F0,
  SHELF_GAIN_DB,
  SHELF_Q,
  HIGHPASS_F0,
  HIGHPASS_Q,
} from '../gain-logic.js';

const FS = 48000;
const DT = 128 / FS;

/** freq Hz, 진폭 amp의 사인파 n프레임 (RMS = amp/√2). */
function sine(amp, freq, n, fs = FS) {
  return Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * freq * i) / fs));
}

/** meter에 mono 신호를 128프레임 블록으로 나눠 넣고 마지막 측정값을 반환. */
function measureMono(meter, signal) {
  let lufs = null;
  for (let i = 0; i + 128 <= signal.length; i += 128) {
    lufs = meter.process([signal.subarray(i, i + 128)]);
  }
  return lufs;
}

test('K-가중 계수: 48kHz에서 BS.1770-4 스펙 표와 일치한다', () => {
  const [shelf, hp] = kWeightingCoeffs(48000);
  // ITU-R BS.1770-4 Table 1 (1단 셸프)
  assert.ok(Math.abs(shelf.b0 - 1.53512485958697) < 1e-6, `b0=${shelf.b0}`);
  assert.ok(Math.abs(shelf.b1 - -2.69169618940638) < 1e-6, `b1=${shelf.b1}`);
  assert.ok(Math.abs(shelf.b2 - 1.19839281085285) < 1e-6, `b2=${shelf.b2}`);
  assert.ok(Math.abs(shelf.a1 - -1.69065929318241) < 1e-6, `a1=${shelf.a1}`);
  assert.ok(Math.abs(shelf.a2 - 0.73248077421585) < 1e-6, `a2=${shelf.a2}`);
  // Table 2 (2단 RLB 하이패스)
  assert.equal(hp.b0, 1);
  assert.equal(hp.b1, -2);
  assert.equal(hp.b2, 1);
  assert.ok(Math.abs(hp.a1 - -1.99004745483398) < 1e-6, `a1=${hp.a1}`);
  assert.ok(Math.abs(hp.a2 - 0.99007225036621) < 1e-6, `a2=${hp.a2}`);
});

test('미터: 997Hz 사인파의 LUFS는 RMS dBFS와 일치한다 (스펙의 -0.691 오프셋 취지)', () => {
  // 997Hz에서 K-필터 이득 ≈ +0.691dB라 상쇄된다. -20dBFS 사인 → 약 -20 LUFS.
  const amp = 0.1 * Math.SQRT2; // RMS 0.1 = -20 dBFS
  const lufs = measureMono(createLoudnessMeter(FS), sine(amp, 997, FS)); // 1초
  assert.ok(Math.abs(lufs - -20) < 0.15, `기대 ≈ -20, 실제 ${lufs}`);
});

test('미터: 400ms 창이 차기 전에는 null (워밍업)', () => {
  const meter = createLoudnessMeter(FS);
  const warmupBlocks = Math.floor((MOMENTARY_S * FS) / 128);
  const block = sine(0.5, 997, 128);
  for (let i = 0; i < warmupBlocks - 1; i++) {
    assert.equal(meter.process([block]), null, `${i}번째 블록에서 이미 측정값이 나왔다`);
  }
});

test('미터: 저역은 하이패스로 깎여 같은 진폭이라도 라우드니스가 낮다', () => {
  // RLB 하이패스는 38Hz 코너의 2차 필터 — 40Hz는 코너 부근이라 수 dB 감쇠에 그친다.
  const at997 = measureMono(createLoudnessMeter(FS), sine(0.1, 997, FS));
  const at40 = measureMono(createLoudnessMeter(FS), sine(0.1, 40, FS));
  assert.ok(at40 < at997 - 5, `40Hz(${at40})가 997Hz(${at997})보다 충분히 낮아야 한다`);
});

test('미터: 스테레오는 채널 mean square 합산 — 동일 신호 2채널이면 +3dB', () => {
  const mono = measureMono(createLoudnessMeter(FS), sine(0.1, 997, FS));
  const meter = createLoudnessMeter(FS);
  const sig = sine(0.1, 997, FS);
  let stereo = null;
  for (let i = 0; i + 128 <= sig.length; i += 128) {
    const b = sig.subarray(i, i + 128);
    stereo = meter.process([b, b]);
  }
  assert.ok(Math.abs(stereo - mono - 3.01) < 0.05, `mono ${mono}, stereo ${stereo}`);
});

test('게인은 -12dB ~ +12dB로 클램프된다', () => {
  const min = dbToGain(GAIN_MIN_DB);
  const max = dbToGain(GAIN_MAX_DB);
  assert.ok(Math.abs(computeTargetGainFromLufs(-60, -20) - max) < 1e-9, '극도로 조용해도 +12dB 상한');
  assert.ok(Math.abs(computeTargetGainFromLufs(0, -20) - min) < 1e-9, '풀스케일이어도 -12dB 하한');
  for (const lufs of [-60, -40, -25, -10, 0]) {
    const g = computeTargetGainFromLufs(lufs, -20);
    assert.ok(g >= min - 1e-12 && g <= max + 1e-12, `클램프 밖: ${g}`);
  }
});

test('스무딩은 한 블록에 점프하지 않고 타깃으로 수렴한다', () => {
  const target = computeTargetGainFromLufs(-40, -20); // 상한 근처
  let g = 1;
  const afterOneBlock = smoothGain(g, target, DT);
  assert.ok(afterOneBlock < 1 + (target - 1) * 0.1, '한 블록만에 타깃 근처로 튀면 안 된다');

  for (let i = 0; i < 2000; i++) g = smoothGain(g, target, DT); // ≈ 5.3초
  assert.ok(Math.abs(g - target) < 1e-3, `수렴 실패: ${g} vs ${target}`);
});

test('내릴 때(attack)가 올릴 때(release)보다 빠르다', () => {
  const down = 1 - smoothGain(1, 0.5, DT); // 1 → 0.5
  const up = smoothGain(1, 1.5, DT) - 1; // 1 → 1.5
  assert.ok(down / 0.5 > up / 0.5, 'attack 시정수가 release보다 짧아야 한다');
});

test('절대 게이트(-70 LUFS) 이하 무음·워밍업(null)에서는 게인이 동결된다 (폭주 방지)', () => {
  let g = 2.0;
  for (let i = 0; i < 5000; i++) g = nextGain(g, -80, -20, DT);
  assert.equal(g, 2.0, '게이트 이하가 길어도 게인은 그대로여야 한다');
  for (let i = 0; i < 1000; i++) g = nextGain(g, null, -20, DT);
  assert.equal(g, 2.0, '워밍업(null)에서도 동결');
  assert.equal(nextGain(1.5, ABS_GATE_LUFS - 0.001, -20, DT), 1.5, '게이트 경계 바로 아래도 동결');
});

test('AGC 통합: 조용한 신호는 부스트, 시끄러운 신호는 감쇠로 수렴한다', () => {
  // -30dBFS 997Hz → 타깃 -20 LUFS까지 약 +10dB 부스트 필요
  const quiet = sine(10 ** (-30 / 20) * Math.SQRT2, 997, FS * 3);
  const meter = createLoudnessMeter(FS);
  let g = 1;
  for (let i = 0; i + 128 <= quiet.length; i += 128) {
    g = nextGain(g, meter.process([quiet.subarray(i, i + 128)]), -20, DT);
  }
  assert.ok(Math.abs(20 * Math.log10(g) - 10) < 0.5, `기대 ≈ +10dB, 실제 ${20 * Math.log10(g)}dB`);

  // -10dBFS → 약 -10dB 감쇠 필요
  const loud = sine(10 ** (-10 / 20) * Math.SQRT2, 997, FS * 3);
  const meter2 = createLoudnessMeter(FS);
  let h = 1;
  for (let i = 0; i + 128 <= loud.length; i += 128) {
    h = nextGain(h, meter2.process([loud.subarray(i, i + 128)]), -20, DT);
  }
  assert.ok(Math.abs(20 * Math.log10(h) - -10) < 0.5, `기대 ≈ -10dB, 실제 ${20 * Math.log10(h)}dB`);
});

test('softClip: 임계 이하는 항등, 그 위는 단조 증가하며 |y|<1로 눌린다', () => {
  assert.equal(softClip(0.5), 0.5);
  assert.equal(softClip(-CLIP_THRESHOLD), -CLIP_THRESHOLD);
  assert.ok(softClip(1.5) < 1, `1.5 → ${softClip(1.5)}`);
  // tanh가 큰 입력에서 1.0으로 포화하는 건 정상 — 상한 초과만 금지
  assert.ok(softClip(4) <= 1 && softClip(4) >= softClip(1.5), '단조 비감소 + 상한 이하');
  assert.ok(softClip(1.2) > softClip(1.0), '니 구간에서 단조 증가');
  assert.ok(softClip(-4) >= -1, '음수 대칭');
  // 임계 직후 연속성 (급격한 킹크 없음)
  assert.ok(Math.abs(softClip(CLIP_THRESHOLD + 1e-6) - CLIP_THRESHOLD) < 1e-5);
});

// 워클릿은 chrome-extension URL import가 불안정해 상수를 복제했다.
// 실행은 못 시키니 소스에서 리터럴만 뽑아 드리프트를 막는다.
test('worklet 상수가 gain-logic과 일치한다', () => {
  const src = readFileSync(new URL('../normalizer.worklet.js', import.meta.url), 'utf8');
  const literal = (name) => {
    const m = src.match(new RegExp(`const ${name} = (-?[\\d.e-]+);`));
    assert.ok(m, `워클릿에 ${name} 상수가 없다`);
    return Number(m[1]);
  };
  assert.equal(literal('TARGET_LUFS_DEFAULT'), TARGET_LUFS_DEFAULT);
  assert.equal(literal('GAIN_MIN_DB'), GAIN_MIN_DB);
  assert.equal(literal('GAIN_MAX_DB'), GAIN_MAX_DB);
  assert.equal(literal('ATTACK_S'), ATTACK_S);
  assert.equal(literal('RELEASE_S'), RELEASE_S);
  assert.equal(literal('ABS_GATE_LUFS'), ABS_GATE_LUFS);
  assert.equal(literal('MOMENTARY_S'), MOMENTARY_S);
  assert.equal(literal('CLIP_THRESHOLD'), CLIP_THRESHOLD);
  assert.equal(literal('SHELF_F0'), SHELF_F0);
  assert.equal(literal('SHELF_GAIN_DB'), SHELF_GAIN_DB);
  assert.equal(literal('SHELF_Q'), SHELF_Q);
  assert.equal(literal('HIGHPASS_F0'), HIGHPASS_F0);
  assert.equal(literal('HIGHPASS_Q'), HIGHPASS_Q);
});

test('nextGain: 무음 후 신호가 들어오면 다시 추종을 시작한다', () => {
  let g = 1.0;
  for (let i = 0; i < 100; i++) g = nextGain(g, -90, -20, DT);
  assert.equal(g, 1.0);
  for (let i = 0; i < 2000; i++) g = nextGain(g, -5, -20, DT);
  assert.ok(g < 1, `시끄러운 입력에 감쇠해야 한다: ${g}`);
});
