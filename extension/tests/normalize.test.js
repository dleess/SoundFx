import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  blockRms,
  rmsToDb,
  computeTargetGain,
  smoothGain,
  nextGain,
  dbToGain,
  GAIN_MIN_DB,
  GAIN_MAX_DB,
  SILENCE_RMS,
  TARGET_LUFS_DEFAULT,
  ATTACK_S,
  RELEASE_S,
} from '../gain-logic.js';

const DT = 128 / 48000;

/** 진폭 amp의 사인파 한 블록 (RMS = amp/√2). */
function sine(amp, n = 128) {
  return Float32Array.from({ length: n }, (_, i) => amp * Math.sin((2 * Math.PI * i) / n));
}

test('blockRms: 사인파 RMS는 진폭/√2', () => {
  assert.ok(Math.abs(blockRms(sine(0.5)) - 0.5 / Math.SQRT2) < 1e-3);
  assert.equal(blockRms(new Float32Array(128)), 0);
});

test('rmsToDb: 1.0은 0dBFS, 0.1은 -20dBFS', () => {
  assert.ok(Math.abs(rmsToDb(1) - 0) < 1e-9);
  assert.ok(Math.abs(rmsToDb(0.1) - -20) < 1e-9);
  assert.ok(Number.isFinite(rmsToDb(0)), '무음에서도 -Infinity가 새어 나오면 안 된다');
});

test('조용한 입력이면 게인이 1보다 크다 (부스트)', () => {
  const quiet = blockRms(sine(0.01)); // ≈ -43 dBFS
  const g = computeTargetGain(quiet, -20);
  assert.ok(g > 1, `기대: >1, 실제: ${g}`);
});

test('시끄러운 입력이면 게인이 1보다 작다 (감쇠)', () => {
  const loud = blockRms(sine(0.9)); // ≈ -4 dBFS
  const g = computeTargetGain(loud, -20);
  assert.ok(g < 1, `기대: <1, 실제: ${g}`);
});

test('게인은 -12dB ~ +12dB로 클램프된다', () => {
  const min = dbToGain(GAIN_MIN_DB);
  const max = dbToGain(GAIN_MAX_DB);
  assert.ok(Math.abs(computeTargetGain(1e-6, -20) - max) < 1e-9, '극도로 조용해도 +12dB 상한');
  assert.ok(Math.abs(computeTargetGain(1.0, -20) - min) < 1e-9, '풀스케일이어도 -12dB 하한');
  for (const rms of [1e-6, 1e-3, 0.05, 0.3, 1.0]) {
    const g = computeTargetGain(rms, -20);
    assert.ok(g >= min - 1e-12 && g <= max + 1e-12, `클램프 밖: ${g}`);
  }
});

test('스무딩은 한 블록에 점프하지 않고 타깃으로 수렴한다', () => {
  const target = computeTargetGain(blockRms(sine(0.01)), -20); // 상한 근처
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

test('무음 구간에서는 게인이 동결된다 (폭주 방지)', () => {
  let g = 2.0;
  const silence = blockRms(new Float32Array(128));
  assert.ok(silence < SILENCE_RMS);
  for (let i = 0; i < 5000; i++) g = nextGain(g, silence, -20, DT);
  assert.equal(g, 2.0, '무음이 길어도 게인은 그대로여야 한다');

  // 임계 바로 아래의 아주 작은 노이즈도 동결 대상
  let h = 1.0;
  for (let i = 0; i < 1000; i++) h = nextGain(h, SILENCE_RMS / 2, -20, DT);
  assert.equal(h, 1.0);
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
  assert.equal(literal('SILENCE_RMS'), SILENCE_RMS);
  assert.equal(literal('ATTACK_S'), ATTACK_S);
  assert.equal(literal('RELEASE_S'), RELEASE_S);
});

test('nextGain: 무음 후 신호가 들어오면 다시 추종을 시작한다', () => {
  let g = 1.0;
  for (let i = 0; i < 100; i++) g = nextGain(g, 0, -20, DT);
  assert.equal(g, 1.0);
  const loud = blockRms(sine(0.9));
  for (let i = 0; i < 2000; i++) g = nextGain(g, loud, -20, DT);
  assert.ok(g < 1, `시끄러운 입력에 감쇠해야 한다: ${g}`);
});
