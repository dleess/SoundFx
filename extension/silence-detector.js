// silence-detector.js — 순수 로직 모듈 (ESM).
// content.js에서는 chrome.runtime.getURL()로 동적 import(), 테스트에서는 정적 import로 로드된다.
//
// 배경: cross-origin 미디어를 MediaElementSource에 연결하면 CORS taint 규칙에 따라
// 출력이 스펙상 항상 정확히 0이 된다(AnalyserNode로 읽어도 완전한 무음). 이를 감지해
// content.js가 체인을 우회(source→destination 직결)하도록 판정만 내리는 게 이 모듈의 역할.
// 실제 오디오 연결/해제는 여기서 하지 않는다(순수 함수 + 상태 머신만).

// buffer의 모든 샘플이 threshold 이하(절댓값)면 무음으로 판단한다.
// threshold는 부동소수 잡음을 흡수하기 위한 여유값 — CORS taint는 정확히 0.0이지만
// 실측 환경 오차를 감안해 기본값을 아주 작은 값으로 둔다.
export function isAllZero(buffer, threshold = 1e-6) {
  for (let i = 0; i < buffer.length; i++) {
    if (Math.abs(buffer[i]) > threshold) return false;
  }
  return true;
}

// 상태 머신: "재생 중(paused 아님, muted 아님, currentTime 증가)인데 분석 버퍼가
// windowMs 동안 연속으로 전부 무음"일 때만 bypass 판정을 내린다.
// - 곡 시작 정적처럼 일시적인 무음은 windowMs 전체를 채우지 못하고 소리 있는 샘플이
//   한 번이라도 섞이면 연속 카운트가 리셋되므로 오탐하지 않는다.
// - 재생 전/일시정지/음소거 중에는 카운트를 쌓지 않는다(판정 보류, 리셋).
export function createSilenceDetector({ windowMs = 2000, threshold = 1e-6, checkIntervalMs = 100 } = {}) {
  const requiredConsecutive = Math.max(1, Math.round(windowMs / checkIntervalMs));
  let consecutiveSilent = 0;
  let lastCurrentTime = null;

  return {
    requiredConsecutive,

    // 한 번의 분석 주기 결과를 투입한다.
    // sample({ buffer, paused, muted, currentTime }) -> { bypass, consecutiveSilent }
    sample({ buffer, paused, muted, currentTime }) {
      // ponytail: loop로 currentTime이 되감기면 카운트가 리셋된다 — windowMs(2s)보다 짧은
      // 루프 미디어는 taint여도 bypass가 영원히 안 걸리는 알려진 한계. 문제되면 루프 wrap
      // (급감 후 계속 증가)을 advancing으로 인정하도록 확장할 것.
      const advancing = lastCurrentTime !== null && currentTime > lastCurrentTime;
      const isPlaying = !paused && !muted && advancing;
      lastCurrentTime = currentTime;

      if (!isPlaying) {
        consecutiveSilent = 0;
        return { bypass: false, consecutiveSilent };
      }

      consecutiveSilent = isAllZero(buffer, threshold) ? consecutiveSilent + 1 : 0;

      return { bypass: consecutiveSilent >= requiredConsecutive, consecutiveSilent };
    },

    reset() {
      consecutiveSilent = 0;
      lastCurrentTime = null;
    },
  };
}
