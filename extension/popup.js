// popup.js — 온/오프, 타깃 라우드니스, 컴프레서, EQ 슬라이더 + 사이트별 프리셋(storage.sync).
//
// 저장: chrome.storage.sync에 'sites.<hostname>' 키로 사이트별 설정, 'defaults' 키로 전역 기본값.
//   storage.sync는 분당 쓰기 한도(120회)가 있어 슬라이더 입력은 300ms 디바운스로 모아 쓴다.
//   탭 전송(sendMessage)은 한도가 없으므로 즉시 보낸다 — 소리는 실시간으로 따라온다.
// hostname은 chrome.tabs API의 tab.url(별도 권한 필요)이 아니라, content.js에 'get-hostname'
// 메시지를 보내 응답으로 받는다 — manifest에 tabs/activeTab 권한을 추가하지 않기 위함.
import { DEFAULT_SETTINGS, siteKey, resolveSettings, clampSettings, debounce } from './settings-logic.js';

let hostname = '';
let activeTabId = null;
let settings = DEFAULT_SETTINGS;
let dirty = false; // 로드 완료 전 사용자가 이미 편집함 — 늦게 도착한 저장값으로 덮어쓰지 않기 위한 플래그

const $ = (id) => document.getElementById(id);
const enabledToggle = $('enabled-toggle');
const hostLabel = $('host-label');
const panel = $('panel');
const saveBtn = $('save-btn');
const defaultsBtn = $('defaults-btn');
const resetBtn = $('reset-btn');
const statusEl = $('status');
const bypassBadge = $('bypass-badge');

// 설정 경로(dot path) <-> 슬라이더 엘리먼트 매핑, 표시 포맷 포함.
const fields = {
  targetLufs: { input: $('target-lufs'), out: $('target-lufs-val'), fmt: (v) => `${v} LUFS` },
  'comp.threshold': { input: $('comp-threshold'), out: $('comp-threshold-val'), fmt: (v) => `${v} dB` },
  'comp.ratio': { input: $('comp-ratio'), out: $('comp-ratio-val'), fmt: (v) => `${v}:1` },
  'comp.attack': { input: $('comp-attack'), out: $('comp-attack-val'), fmt: (v) => `${v}s` },
  'comp.release': { input: $('comp-release'), out: $('comp-release-val'), fmt: (v) => `${v}s` },
  'eq.low': { input: $('eq-low'), out: $('eq-low-val'), fmt: (v) => `${v} dB` },
  'eq.mid': { input: $('eq-mid'), out: $('eq-mid-val'), fmt: (v) => `${v} dB` },
  'eq.high': { input: $('eq-high'), out: $('eq-high-val'), fmt: (v) => `${v} dB` },
  pan: {
    input: $('pan'),
    out: $('pan-val'),
    fmt: (v) => (v === 0 ? 'center' : v < 0 ? `L ${Math.round(-v * 100)}%` : `R ${Math.round(v * 100)}%`),
  },
};
const monoToggle = $('mono-toggle');

function get(obj, path) {
  return path.split('.').reduce((o, k) => o[k], obj);
}

function render() {
  enabledToggle.checked = settings.enabled;
  monoToggle.checked = settings.mono;
  for (const [path, f] of Object.entries(fields)) {
    const v = get(settings, path);
    f.input.value = v;
    f.out.textContent = f.fmt(v);
  }
}

function readInputs() {
  const raw = { enabled: enabledToggle.checked, mono: monoToggle.checked, comp: {}, eq: {} };
  for (const [path, f] of Object.entries(fields)) {
    const v = Number(f.input.value);
    const [group, key] = path.split('.');
    if (key) raw[group][key] = v;
    else raw[group] = v;
  }
  return clampSettings(raw);
}

function showStatus(text, isError) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', !!isError);
}

// 저장 실패는 조용히 삼키지 않는다 — lastError를 확인해 사용자에게 보여준다.
function storageSet(items, okText) {
  chrome.storage.sync.set(items, () => {
    if (chrome.runtime.lastError) showStatus(`Save failed: ${chrome.runtime.lastError.message}`, true);
    else if (okText) showStatus(okText);
  });
}

function sendToTab(s) {
  if (activeTabId == null) return;
  chrome.tabs.sendMessage(activeTabId, { settings: s }, () => void chrome.runtime.lastError);
}

const writeSite = debounce((s) => storageSet({ [siteKey(hostname)]: s }), 300);

function persist() {
  dirty = true;
  settings = readInputs();
  render();
  if (!hostname) return; // 지원 안 되는 탭(예: chrome://)에서는 저장/전송하지 않는다.
  sendToTab(settings); // 즉시 — 소리가 실시간으로 따라오게
  writeSite(settings); // 디바운스 — sync 쓰기 한도 보호
}

function loadAndRender() {
  const key = hostname ? siteKey(hostname) : null;
  const keys = key ? ['defaults', key] : ['defaults'];
  chrome.storage.sync.get(keys, (data) => {
    if (dirty) return; // 로드보다 먼저 사용자가 조작함 — 그 입력이 진실이다
    settings = resolveSettings(data.defaults, key ? data[key] : undefined);
    render();
  });
}

function init() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab?.id == null) {
      loadAndRender();
      return;
    }
    activeTabId = tab.id;
    // frameId 0 고정 — all_frames 주입이라 아무 프레임이나 먼저 답하면 hostname이 비결정적이 된다.
    chrome.tabs.sendMessage(tab.id, { type: 'get-hostname' }, { frameId: 0 }, (resp) => {
      hostname = (!chrome.runtime.lastError && resp?.hostname) || '';
      hostLabel.textContent = hostname || '(unsupported page)';
      bypassBadge.hidden = !resp?.bypassed;
      loadAndRender();
    });
  });
}

panel.addEventListener('input', persist);
panel.addEventListener('change', persist);
saveBtn.addEventListener('click', () => {
  persist();
  writeSite.flush();
});

defaultsBtn.addEventListener('click', () => {
  storageSet({ defaults: readInputs() }, 'Saved as default for all sites');
});

resetBtn.addEventListener('click', () => {
  if (!hostname) return;
  writeSite.cancel(); // 대기 중인 디바운스 쓰기가 reset 직후 사이트 키를 되살리는 것을 방지
  chrome.storage.sync.remove(siteKey(hostname), () => {
    chrome.storage.sync.get(['defaults'], (data) => {
      settings = resolveSettings(data.defaults, undefined);
      render();
      sendToTab(settings);
    });
  });
});

// 팝업이 디바운스 타이머(300ms)보다 먼저 닫히면 쓰기가 유실된다 — 닫힐 때 즉시 flush.
window.addEventListener('pagehide', () => writeSite.flush());

init();
