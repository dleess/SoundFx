// content.js — sound 콘텐츠 스크립트 (마일스톤 1: 스캐폴드 + 오디오 체인)
//
// 미디어 요소를 감지해 Web Audio 체인을 1회만 연결한다:
//   MediaElementSource → BiquadFilter EQ(3밴드) → DynamicsCompressor → Gain → destination
(() => {
  const chains = new WeakMap(); // HTMLMediaElement -> chain

  function buildChain(mediaEl) {
    if (chains.has(mediaEl)) return chains.get(mediaEl);

    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const source = ctx.createMediaElementSource(mediaEl);

    const lowShelf = ctx.createBiquadFilter();
    lowShelf.type = 'lowshelf';
    lowShelf.frequency.value = 200;
    lowShelf.gain.value = 0;

    const mid = ctx.createBiquadFilter();
    mid.type = 'peaking';
    mid.frequency.value = 1000;
    mid.Q.value = 1;
    mid.gain.value = 0;

    const highShelf = ctx.createBiquadFilter();
    highShelf.type = 'highshelf';
    highShelf.frequency.value = 4000;
    highShelf.gain.value = 0;

    const compressor = ctx.createDynamicsCompressor(); // 기본값

    const gainNode = ctx.createGain();
    gainNode.gain.value = 1.0;

    source.connect(lowShelf);
    lowShelf.connect(mid);
    mid.connect(highShelf);
    highShelf.connect(compressor);
    // M2: normalizer.worklet.js 연결 지점 — compressor와 gainNode 사이에
    // AudioWorkletNode(ctx, 'normalizer-processor')를 삽입한다.
    // (ctx.audioWorklet.addModule(chrome.runtime.getURL('normalizer.worklet.js')) 이후 연결)
    compressor.connect(gainNode);
    gainNode.connect(ctx.destination);

    const chain = { ctx, mediaEl, source, eq: { lowShelf, mid, highShelf }, compressor, gainNode };
    chains.set(mediaEl, chain);

    // M4: 무음 감지 바이패스 지점
    checkSilenceAndBypass(chain);

    return chain;
  }

  // M3: chrome.runtime.onMessage 설정 수신 지점 — 여기서 받은 settings를 각 체인에 적용한다.
  // chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  //   for (const chain of /* 관리 중인 체인 목록 */ []) applySettings(chain, msg.settings);
  // });
  function applySettings(chain, settings) {
    // M3가 채운다: on/off, EQ 게인, 컴프레서 threshold/ratio/attack/release 반영
  }

  // M4가 채운다: gainNode 출력이 지속적으로 무음이면(CORS taint 등) mediaEl을 체인에서
  // 우회시켜 원본 재생(destination 미경유)으로 되돌린다.
  function checkSilenceAndBypass(chain) {
  }

  function handlePlay(mediaEl) {
    if (!(mediaEl instanceof HTMLMediaElement)) return;
    try {
      buildChain(mediaEl);
    } catch (err) {
      console.warn('[sound] 오디오 체인 연결 실패', err);
    }
  }

  // (1) play 이벤트 캡처 단계 리스너 — 현재/미래의 모든 video·audio에서 발생하는
  // play 이벤트를 document 레벨에서 캡처한다 (play는 버블링하지 않으므로 capture:true 필수).
  document.addEventListener(
    'play',
    (e) => handlePlay(e.target),
    { capture: true }
  );

  // (2) MutationObserver — 이미 재생 중인 상태로 DOM에 삽입되는 media(예: SPA 라우팅,
  // autoplay)는 play 이벤트를 놓칠 수 있으므로 추가 스캔으로 보완한다.
  function scan(root) {
    if (!root.querySelectorAll) return;
    root.querySelectorAll('video, audio').forEach((el) => {
      if (!el.paused) handlePlay(el);
    });
  }

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches?.('video, audio')) {
          if (!node.paused) handlePlay(node);
        }
        scan(node);
      }
    }
  });

  function start() {
    scan(document.documentElement);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.documentElement) {
    start();
  } else {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  }
})();
