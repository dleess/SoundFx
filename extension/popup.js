// popup.js — 최소 placeholder. M3가 타깃 라우드니스/컴프레서/EQ UI와 메시징을 채운다.

const toggle = document.getElementById('enabled-toggle');

chrome.storage.sync.get({ enabled: true }, ({ enabled }) => {
  toggle.checked = enabled;
});

toggle.addEventListener('change', () => {
  chrome.storage.sync.set({ enabled: toggle.checked });
  // M3: chrome.tabs.sendMessage로 활성 탭 콘텐츠 스크립트에 설정 변경을 전달한다.
});
