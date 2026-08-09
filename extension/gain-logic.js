// gain-logic.js — 순수 함수 모듈 (ESM).
// content.js에서는 chrome.runtime.getURL()로 동적 import(), 테스트에서는 정적 import로 로드된다.

export function clampGain(gain, min = 0, max = 4) {
  return Math.min(max, Math.max(min, gain));
}

// M2: RMS/LUFS 기반 타깃 라우드니스 추종 게인 계산 함수(예: computeTargetGain(rms, targetLufs))가 여기 추가된다.
