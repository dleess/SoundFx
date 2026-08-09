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

  // M3: 설정 메시징 — popup.js가 chrome.tabs.sendMessage로 보낸 settings를 연결된 모든
  // chain에 적용한다. chains(WeakMap)는 순회 불가하므로 set()을 감싸 순회 가능한
  // activeChains에도 추가하고, 이미 알려진 설정을 새로 생성되는 chain에도 즉시 적용한다.
  // ponytail: chains.set을 선언부(위 6줄)가 아니라 여기서 패치한다 — 이 수정은 M3 스텁
  // 구역으로 한정되어 있어서다. 구역 제약이 풀리면 chains 선언 옆에 순회 가능한
  // 레지스트리를 직접 두는 편이 더 단순하다.
  const activeChains = new Set();
  let currentSettings = null;
  const origChainsSet = chains.set.bind(chains);
  chains.set = (key, value) => {
    origChainsSet(key, value);
    activeChains.add(value);
    if (currentSettings) applySettings(value, currentSettings);
    return chains;
  };

  function applySettings(chain, settings) {
    chain.settings = settings;
    const enabled = settings.enabled !== false;
    const eq = enabled ? settings.eq : { low: 0, mid: 0, high: 0 };
    const comp = enabled ? settings.comp : { threshold: 0, ratio: 1, attack: 0.003, release: 0.25 };
    chain.eq.lowShelf.gain.value = eq.low;
    chain.eq.mid.gain.value = eq.mid;
    chain.eq.highShelf.gain.value = eq.high;
    chain.compressor.threshold.value = comp.threshold;
    chain.compressor.ratio.value = comp.ratio;
    chain.compressor.attack.value = comp.attack;
    chain.compressor.release.value = comp.release;
    // M2가 정의 중인 워클릿 게인 갱신 훅. 없으면 무시한다.
    if (typeof updateWorklet === 'function') updateWorklet(chain);
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'get-hostname') {
      sendResponse({ hostname: location.hostname });
      return;
    }
    if (!msg || !msg.settings) return;
    currentSettings = msg.settings;
    for (const chain of activeChains) applySettings(chain, currentSettings);
  });

  // 초기 로드: storage.sync에서 현재 hostname 설정을 읽어 이후 생성되는 chain에 적용한다.
  import(chrome.runtime.getURL('settings-logic.js'))
    .then(({ resolveSettings, siteKey }) => {
      const key = siteKey(location.hostname);
      chrome.storage.sync.get(['defaults', key], (data) => {
        currentSettings = resolveSettings(data.defaults, data[key]);
        for (const chain of activeChains) applySettings(chain, currentSettings);
      });
    })
    .catch((err) => console.warn('[sound] settings-logic 로드 실패', err));

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
