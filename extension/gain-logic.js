// gain-logic.js — 순수 함수 모듈 (ESM).
// content.js에서는 chrome.runtime.getURL()로 동적 import(), 테스트에서는 정적 import로 로드된다.
//
// 주의: normalizer.worklet.js는 AudioWorklet 스코프라 chrome-extension URL import가 불안정하므로
// 아래 상수·수식을 그대로 복제해 두었다. 여기를 고치면 워클릿도 같이 고쳐야 한다.
// (드리프트는 normalize.test.js의 상수 일치 테스트가 잡는다.)

export function clampGain(gain, min = 0, max = 4) {
  return Math.min(max, Math.max(min, gain));
}

// --- 상수 (worklet과 반드시 일치) ---
export const TARGET_LUFS_DEFAULT = -20;
export const GAIN_MIN_DB = -12;
export const GAIN_MAX_DB = 12;
export const ATTACK_S = 0.05; // 게인을 내릴 때(갑자기 시끄러워질 때) — 빠르게
export const RELEASE_S = 0.4; // 게인을 올릴 때(조용해질 때) — 느리게, 펌핑 방지
export const ABS_GATE_LUFS = -70; // BS.1770 절대 게이트 — 이하면 무음으로 보고 게인 동결
export const MOMENTARY_S = 0.4; // momentary loudness 측정 창 (400ms)
export const CLIP_THRESHOLD = 0.89; // ≈ -1 dBFS — 소프트 클립 시작점 (부스트 후 클리핑 방지)

// --- BS.1770-4 K-가중 필터 파라미터 (De Man 파라미터화, 임의 샘플레이트 지원) ---
// 48kHz에서 스펙 표의 계수를 재현한다 (normalize.test.js에서 수치로 고정).
export const SHELF_F0 = 1681.9744509555319;
export const SHELF_GAIN_DB = 3.99984385397;
export const SHELF_Q = 0.7071752369554193;
export const SHELF_VB_EXP = 0.4996667741545416; // 밴드 게인 Vb = Vh^EXP (De Man/libebur128)
export const HIGHPASS_F0 = 38.13547087613982;
export const HIGHPASS_Q = 0.5003270373253953;

export function dbToGain(db) {
  return 10 ** (db / 20);
}

/**
 * K-가중 2단 biquad 계수: [고역 셸프(+4dB), RLB 하이패스(38Hz)]. y = b0x+b1x1+b2x2-a1y1-a2y2
 * De Man/libebur128의 K-tan 빌리니어 파라미터화 — 48kHz에서 스펙 표 계수를 재현한다.
 */
export function kWeightingCoeffs(sampleRate) {
  const K = Math.tan((Math.PI * SHELF_F0) / sampleRate);
  const Vh = 10 ** (SHELF_GAIN_DB / 20);
  const Vb = Vh ** SHELF_VB_EXP;
  const a0 = 1 + K / SHELF_Q + K * K;
  const shelf = {
    b0: (Vh + (Vb * K) / SHELF_Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / SHELF_Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / SHELF_Q + K * K) / a0,
  };
  const K1 = Math.tan((Math.PI * HIGHPASS_F0) / sampleRate);
  const d0 = 1 + K1 / HIGHPASS_Q + K1 * K1;
  const hp = {
    b0: 1, // 스펙과 동일하게 b는 [1,-2,1] 그대로, a만 정규화
    b1: -2,
    b2: 1,
    a1: (2 * (K1 * K1 - 1)) / d0,
    a2: (1 - K1 / HIGHPASS_Q + K1 * K1) / d0,
  };
  return [shelf, hp];
}

/**
 * BS.1770 momentary loudness 미터. process(channels)에 블록(Float32Array[])을 넣으면
 * 최근 windowS(기본 400ms) 창의 K-가중 라우드니스(LUFS)를 반환한다. 창이 차기 전엔 null.
 * 채널 가중치는 전부 1 (웹 오디오는 사실상 모노/스테레오).
 */
export function createLoudnessMeter(sampleRate, windowS = MOMENTARY_S) {
  const coeffs = kWeightingCoeffs(sampleRate);
  const windowFrames = Math.round(windowS * sampleRate);
  const states = []; // 채널별 biquad 상태 [stage][{x1,x2,y1,y2}]
  const blocks = []; // {sumSq, frames} — 링 윈도우
  let totalSumSq = 0;
  let totalFrames = 0;

  return {
    process(channels) {
      const frames = channels[0].length;
      let sumSq = 0;
      for (let c = 0; c < channels.length; c++) {
        if (!states[c]) states[c] = [{ x1: 0, x2: 0, y1: 0, y2: 0 }, { x1: 0, x2: 0, y1: 0, y2: 0 }];
        const st = states[c];
        const ch = channels[c];
        for (let i = 0; i < frames; i++) {
          let x = ch[i];
          for (let s = 0; s < 2; s++) {
            const k = coeffs[s];
            const z = st[s];
            const y = k.b0 * x + k.b1 * z.x1 + k.b2 * z.x2 - k.a1 * z.y1 - k.a2 * z.y2;
            z.x2 = z.x1;
            z.x1 = x;
            z.y2 = z.y1;
            z.y1 = y;
            x = y;
          }
          sumSq += x * x;
        }
      }
      blocks.push({ sumSq, frames });
      totalSumSq += sumSq;
      totalFrames += frames;
      while (totalFrames - blocks[0].frames >= windowFrames) {
        const old = blocks.shift();
        totalSumSq -= old.sumSq;
        totalFrames -= old.frames;
      }
      // ponytail: totalSumSq 증분 갱신이라 수 시간 재생 시 부동소수 드리프트 가능 — 들리는
      // 수준으로 문제되면 N블록마다 blocks 재합산으로 리셋할 것.
      if (totalFrames < windowFrames) return null; // 워밍업 — 아직 판정 불가
      return -0.691 + 10 * Math.log10(Math.max(totalSumSq / totalFrames, 1e-12));
    },
  };
}

/** 타깃 라우드니스까지 필요한 게인(선형), -12dB~+12dB로 클램프. */
export function computeTargetGainFromLufs(lufs, targetLufs = TARGET_LUFS_DEFAULT) {
  return clampGain(
    dbToGain(targetLufs - lufs),
    dbToGain(GAIN_MIN_DB),
    dbToGain(GAIN_MAX_DB)
  );
}

/** 1차 지수 스무딩. dt는 블록 길이(초). 내릴 때 attack, 올릴 때 release 시정수. */
export function smoothGain(current, target, dt, attack = ATTACK_S, release = RELEASE_S) {
  const tau = target < current ? attack : release;
  return current + (target - current) * (1 - Math.exp(-dt / tau));
}

/**
 * 한 블록 처리 후의 게인. 워클릿 process()와 동일한 수식.
 * 측정 전(lufs=null)이거나 절대 게이트 이하 무음이면 게인을 동결해 폭주를 막는다.
 */
export function nextGain(current, lufs, targetLufs = TARGET_LUFS_DEFAULT, dt = 128 / 48000) {
  if (lufs === null || lufs < ABS_GATE_LUFS) return current;
  return smoothGain(current, computeTargetGainFromLufs(lufs, targetLufs), dt);
}

/** 출력단 소프트 클립: |x|≤t 구간은 항등, 초과분은 tanh로 눌러 |y|<1 보장. */
export function softClip(x, t = CLIP_THRESHOLD) {
  const ax = Math.abs(x);
  if (ax <= t) return x;
  return Math.sign(x) * (t + (1 - t) * Math.tanh((ax - t) / (1 - t)));
}
