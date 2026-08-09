// popup.js — 온/오프, 타깃 라우드니스, 컴프레서, EQ 슬라이더 + 사이트별 프리셋(storage.sync).
//
// 저장: chrome.storage.sync에 'sites.<hostname>' 키로 사이트별 설정, 'defaults' 키로 전역 기본값.
// 전달: 값이 바뀔 때마다 chrome.tabs.sendMessage로 현재 탭의 content.js에 settings를 보낸다.
// hostname은 chrome.tabs API의 tab.url(별도 권한 필요)이 아니라, content.js에 'get-hostname'
// 메시지를 보내 응답으로 받는다 — manifest에 tabs/activeTab 권한을 추가하지 않기 위함.
import { DEFAULT_SETTINGS, siteKey, resolveSettings, clampSettings } from './settings-logic.js';

let hostname = '';
let activeTabId = null;
let settings = DEFAULT_SETTINGS;

const $ = (id) => document.getElementById(id);
const enabledToggle = $('enabled-toggle');
const hostLabel = $('host-label');
const panel = $('panel');
const saveBtn = $('save-btn');
const resetBtn = $('reset-btn');

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
};

function get(obj, path) {
  return path.split('.').reduce((o, k) => o[k], obj);
}

function render() {
  enabledToggle.checked = settings.enabled;
  for (const [path, f] of Object.entries(fields)) {
    const v = get(settings, path);
    f.input.value = v;
    f.out.textContent = f.fmt(v);
  }
}

function readInputs() {
  const raw = { enabled: enabledToggle.checked, comp: {}, eq: {} };
  for (const [path, f] of Object.entries(fields)) {
    const v = Number(f.input.value);
    const [group, key] = path.split('.');
    if (key) raw[group][key] = v;
    else raw[group] = v;
  }
  return clampSettings(raw);
}

function sendToTab(s) {
  if (activeTabId == null) return;
  chrome.tabs.sendMessage(activeTabId, { settings: s }, () => void chrome.runtime.lastError);
}

function persist() {
  settings = readInputs();
  render();
  if (!hostname) return; // 지원 안 되는 탭(예: chrome://)에서는 저장/전송하지 않는다.
  chrome.storage.sync.set({ [siteKey(hostname)]: settings });
  sendToTab(settings);
}

function loadAndRender() {
  const key = hostname ? siteKey(hostname) : null;
  const keys = key ? ['defaults', key] : ['defaults'];
  chrome.storage.sync.get(keys, (data) => {
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
    chrome.tabs.sendMessage(tab.id, { type: 'get-hostname' }, (resp) => {
      hostname = (!chrome.runtime.lastError && resp?.hostname) || '';
      hostLabel.textContent = hostname || '(unsupported page)';
      loadAndRender();
    });
  });
}

panel.addEventListener('input', persist);
panel.addEventListener('change', persist);
saveBtn.addEventListener('click', persist);

resetBtn.addEventListener('click', () => {
  if (!hostname) return;
  chrome.storage.sync.remove(siteKey(hostname), () => {
    chrome.storage.sync.get(['defaults'], (data) => {
      settings = resolveSettings(data.defaults, undefined);
      render();
      sendToTab(settings);
    });
  });
});

init();
