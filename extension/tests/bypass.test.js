import test from 'node:test';
import assert from 'node:assert/strict';
import { isAllZero, createSilenceDetector } from '../silence-detector.js';

const ZERO = new Float32Array(8); // 전부 0
function loud(v = 0.2) {
  const b = new Float32Array(8);
  b[3] = v;
  return b;
}

test('isAllZero는 전부 0인 버퍼에 true를 반환한다', () => {
  assert.equal(isAllZero(ZERO), true);
});

test('isAllZero는 0이 아닌 샘플이 하나라도 있으면 false를 반환한다', () => {
  assert.equal(isAllZero(loud()), false);
});

// 재생 중(paused/muted 아님, currentTime 계속 증가)인데 연속으로 전부 무음이면 bypass 판정
test('재생 중 연속 무음이 windowMs만큼 이어지면 bypass 판정을 내린다', () => {
  const detector = createSilenceDetector({ windowMs: 300, checkIntervalMs: 100 }); // 3회
  let t = 0;
  // 첫 sample()은 currentTime 기준선만 세우고(아직 "증가"를 판단 못 함) 카운트에 들어가지
  // 않으므로 워밍업 1회 + 실제 3회 = 4회 호출한다.
  let last = { bypass: false };
  for (let i = 0; i < 4; i++) {
    t += 0.1;
    last = detector.sample({ buffer: ZERO, paused: false, muted: false, currentTime: t });
  }
  assert.equal(last.bypass, true);
});

// 곡 시작 정적처럼 무음 중간에 소리 있는 샘플이 섞이면 연속 카운트가 리셋되어 오탐하지 않는다
test('연속 무음 중 소리 있는 버퍼가 한 번이라도 섞이면 카운트가 리셋된다', () => {
  const detector = createSilenceDetector({ windowMs: 300, checkIntervalMs: 100 }); // 3회
  let t = 0;

  t += 0.1;
  detector.sample({ buffer: ZERO, paused: false, muted: false, currentTime: t });
  t += 0.1;
  detector.sample({ buffer: ZERO, paused: false, muted: false, currentTime: t });
  t += 0.1;
  const midway = detector.sample({ buffer: loud(), paused: false, muted: false, currentTime: t });
  assert.equal(midway.bypass, false);
  assert.equal(midway.consecutiveSilent, 0);

  // 리셋 후 다시 2회만 무음이면(3회 필요) 아직 bypass 안 됨
  t += 0.1;
  detector.sample({ buffer: ZERO, paused: false, muted: false, currentTime: t });
  t += 0.1;
  const stillNotEnough = detector.sample({ buffer: ZERO, paused: false, muted: false, currentTime: t });
  assert.equal(stillNotEnough.bypass, false);
});

test('일시정지 중에는 무음이 이어져도 bypass 판정을 내리지 않는다', () => {
  const detector = createSilenceDetector({ windowMs: 300, checkIntervalMs: 100 });
  let t = 0;
  let last = { bypass: false };
  for (let i = 0; i < 5; i++) {
    t += 0.1;
    last = detector.sample({ buffer: ZERO, paused: true, muted: false, currentTime: t });
  }
  assert.equal(last.bypass, false);
  assert.equal(last.consecutiveSilent, 0);
});

test('음소거 중에는 무음이 이어져도 bypass 판정을 내리지 않는다', () => {
  const detector = createSilenceDetector({ windowMs: 300, checkIntervalMs: 100 });
  let t = 0;
  let last = { bypass: false };
  for (let i = 0; i < 5; i++) {
    t += 0.1;
    last = detector.sample({ buffer: ZERO, paused: false, muted: true, currentTime: t });
  }
  assert.equal(last.bypass, false);
});

test('volume 0은 muted와 동일 취급 — 사이트 볼륨 슬라이더 0에서 오탐 bypass 금지', () => {
  // 브라우저는 element volume을 소스단에서 스케일하므로 volume=0의 출력은 CORS taint와
  // 똑같은 전부-0 버퍼다. 정상 요소를 영구 우회시키면 안 된다.
  const detector = createSilenceDetector({ windowMs: 300, checkIntervalMs: 100 });
  let t = 0;
  let last = { bypass: false };
  for (let i = 0; i < 5; i++) {
    t += 0.1;
    last = detector.sample({ buffer: ZERO, paused: false, muted: false, volume: 0, currentTime: t });
  }
  assert.equal(last.bypass, false);
  assert.equal(last.consecutiveSilent, 0);
});

test('currentTime이 증가하지 않으면(재생 전/정지 상태) bypass 판정을 내리지 않는다', () => {
  const detector = createSilenceDetector({ windowMs: 300, checkIntervalMs: 100 });
  let last = { bypass: false };
  for (let i = 0; i < 5; i++) {
    // currentTime이 항상 0으로 고정 — 실제로 재생이 진행되지 않는 상태
    last = detector.sample({ buffer: ZERO, paused: false, muted: false, currentTime: 0 });
  }
  assert.equal(last.bypass, false);
});
