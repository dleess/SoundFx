// settings-logic.js — 순수 함수 모듈 (ESM).
// content.js에서는 chrome.runtime.getURL()로 동적 import(), popup.js는 정적 import,
// 테스트에서는 정적 import로 로드된다.
//
// 설정 객체 계약(변경 금지): {enabled, targetLufs, comp:{threshold,ratio,attack,release}, eq:{low,mid,high}}

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  targetLufs: -24,
  comp: Object.freeze({ threshold: -24, ratio: 4, attack: 0.003, release: 0.25 }),
  eq: Object.freeze({ low: 0, mid: 0, high: 0 }),
});

const RANGES = {
  targetLufs: [-60, 0],
  comp: { threshold: [-100, 0], ratio: [1, 20], attack: [0, 1], release: [0, 1] },
  eq: { low: [-24, 24], mid: [-24, 24], high: [-24, 24] },
};

function clamp(value, [min, max]) {
  return Math.min(max, Math.max(min, value));
}

// chrome.storage.sync에 쓸 사이트별 설정 키. 전역 기본값은 별도 'defaults' 키에 저장한다.
export function siteKey(hostname) {
  return `sites.${hostname}`;
}

// patch의 필드가 있으면 base를 덮어쓴다. comp/eq는 필드 단위로 병합한다.
function mergeSettings(base, patch) {
  if (!patch) return base;
  return {
    enabled: patch.enabled !== undefined ? patch.enabled : base.enabled,
    targetLufs: patch.targetLufs !== undefined ? patch.targetLufs : base.targetLufs,
    comp: { ...base.comp, ...(patch.comp || {}) },
    eq: { ...base.eq, ...(patch.eq || {}) },
  };
}

export function clampSettings(settings) {
  return {
    enabled: !!settings.enabled,
    targetLufs: clamp(settings.targetLufs, RANGES.targetLufs),
    comp: {
      threshold: clamp(settings.comp.threshold, RANGES.comp.threshold),
      ratio: clamp(settings.comp.ratio, RANGES.comp.ratio),
      attack: clamp(settings.comp.attack, RANGES.comp.attack),
      release: clamp(settings.comp.release, RANGES.comp.release),
    },
    eq: {
      low: clamp(settings.eq.low, RANGES.eq.low),
      mid: clamp(settings.eq.mid, RANGES.eq.mid),
      high: clamp(settings.eq.high, RANGES.eq.high),
    },
  };
}

// 우선순위: sitePatch > defaultsPatch > DEFAULT_SETTINGS(하드코딩 기본값). 결과는 항상 clamp된다.
export function resolveSettings(defaultsPatch, sitePatch) {
  const withDefaults = mergeSettings(DEFAULT_SETTINGS, defaultsPatch);
  const withSite = mergeSettings(withDefaults, sitePatch);
  return clampSettings(withSite);
}

// 마지막 호출 후 waitMs가 지나야 fn을 1회 실행한다. flush()는 대기 중인 호출을 즉시 실행.
// (popup의 storage.sync 쓰기 보호용 — sync는 분당 쓰기 한도가 있어 슬라이더 드래그마다 쓰면 터진다.)
export function debounce(fn, waitMs) {
  let timer = null;
  let pendingArgs = null;
  const invoke = () => {
    timer = null;
    const args = pendingArgs;
    pendingArgs = null;
    fn(...args);
  };
  const debounced = (...args) => {
    pendingArgs = args;
    clearTimeout(timer);
    timer = setTimeout(invoke, waitMs);
  };
  debounced.flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      invoke();
    }
  };
  return debounced;
}
