// gain-logic.js — 순수 함수 모듈 (ESM).
// content.js에서는 chrome.runtime.getURL()로 동적 import(), 테스트에서는 정적 import로 로드된다.
//
// 주의: normalizer.worklet.js는 AudioWorklet 스코프라 chrome-extension URL import가 불안정하므로
// 아래 상수·수식을 그대로 복제해 두었다. 여기를 고치면 워클릿도 같이 고쳐야 한다.

export function clampGain(gain, min = 0, max = 4) {
  return Math.min(max, Math.max(min, gain));
}

// --- M2 상수 (worklet과 반드시 일치) ---
export const TARGET_LUFS_DEFAULT = -20; // 간이 LUFS = 블록 RMS dBFS
export const GAIN_MIN_DB = -12;
export const GAIN_MAX_DB = 12;
export const SILENCE_RMS = 1e-4; // ≈ -80 dBFS 이하면 무음으로 보고 게인 동결
export const ATTACK_S = 0.05; // 게인을 내릴 때(갑자기 시끄러워질 때) — 빠르게
export const RELEASE_S = 0.4; // 게인을 올릴 때(조용해질 때) — 느리게, 펌핑 방지

export function dbToGain(db) {
  return 10 ** (db / 20);
}

export function rmsToDb(rms) {
  return 20 * Math.log10(Math.max(rms, 1e-12));
}

/** 샘플 블록(Float32Array 또는 배열)의 RMS. */
export function blockRms(samples) {
  if (!samples || samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/** 타깃 라우드니스까지 필요한 게인(선형), -12dB~+12dB로 클램프. */
export function computeTargetGain(rms, targetLufs = TARGET_LUFS_DEFAULT) {
  return clampGain(
    dbToGain(targetLufs - rmsToDb(rms)),
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
 * 무음(rms < SILENCE_RMS)이면 게인을 동결해 폭주를 막는다.
 */
export function nextGain(current, rms, targetLufs = TARGET_LUFS_DEFAULT, dt = 128 / 48000) {
  if (rms < SILENCE_RMS) return current;
  return smoothGain(current, computeTargetGain(rms, targetLufs), dt);
}
