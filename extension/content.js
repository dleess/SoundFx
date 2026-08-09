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
    // === M2: 자동 라우드니스 정규화 ===
    // addModule은 비동기라 우선 compressor→gainNode로 이어 두고, 모듈이 로드되면
    // 그 사이에 워클릿을 끼워 넣는다. 실패하면 체인은 그대로라 소리는 계속 난다.
    compressor.connect(gainNode);

    // M3의 applySettings가 호출할 수 있도록 전역 노출한다.
    // ponytail: buildChain마다 재정의(동일 함수). 신경 쓰이면 IIFE 스코프로 올릴 것.
    function updateWorklet(chain) {
      if (!chain || !chain.workletNode || !chain.settings) return;
      const { targetLufs, enabled } = chain.settings;
      chain.workletNode.port.postMessage({ targetLufs, enabled });
    }
    window.__soundUpdateWorklet = updateWorklet;

    ctx.audioWorklet
      .addModule(chrome.runtime.getURL('normalizer.worklet.js'))
      .then(() => {
        const chain = chains.get(mediaEl);
        if (!chain) return;
        const workletNode = new AudioWorkletNode(ctx, 'normalizer-processor');
        compressor.disconnect(gainNode);
        compressor.connect(workletNode);
        workletNode.connect(gainNode);
        chain.workletNode = workletNode;
        updateWorklet(chain);
      })
      .catch((err) => {
        console.warn('[sound] normalizer 워클릿 로드 실패 — 정규화 없이 재생', err);
      });
    gainNode.connect(ctx.destination);

    const chain = { ctx, mediaEl, source, eq: { lowShelf, mid, highShelf }, compressor, gainNode };
    chains.set(mediaEl, chain);

    // M4: 무음 감지 바이패스 지점 — 비동기 감시이므로 await하지 않는다(재생을 막지 않음).
    // 판정 결과는 chain.bypassed에 기록된다.
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
  async function checkSilenceAndBypass(chain) {
    const WINDOW_MS = 2000; // 재생 시작 후 감시할 총 시간
    const CHECK_INTERVAL_MS = 100; // 분석 주기 — WINDOW_MS/CHECK_INTERVAL_MS = 20회 검사
    const THRESHOLD = 1e-6; // 무음 판정 진폭 임계값(부동소수 잡음 여유)

    const { ctx, mediaEl, source, gainNode } = chain;

    let detector;
    try {
      const mod = await import(chrome.runtime.getURL('silence-detector.js'));
      detector = mod.createSilenceDetector({
        windowMs: WINDOW_MS,
        threshold: THRESHOLD,
        checkIntervalMs: CHECK_INTERVAL_MS,
      });
    } catch (err) {
      console.warn('[sound] 무음 감지 모듈 로드 실패 — 바이패스 감시를 건너뜁니다', err);
      return;
    }

    // gainNode 뒤에 분석용 AnalyserNode를 병렬로 탭 연결한다(destination 경로는 그대로 유지).
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    gainNode.connect(analyser);
    const buffer = new Float32Array(analyser.fftSize);

    let checksLeft = detector.requiredConsecutive; // WINDOW_MS 동안의 최대 검사 횟수

    const timer = setInterval(() => {
      if (chain.bypassed) {
        clearInterval(timer);
        analyser.disconnect();
        return;
      }

      analyser.getFloatTimeDomainData(buffer);
      const { bypass } = detector.sample({
        buffer,
        paused: mediaEl.paused,
        muted: mediaEl.muted,
        currentTime: mediaEl.currentTime,
      });

      if (bypass) {
        clearInterval(timer);
        analyser.disconnect();
        // MediaElementSource는 한 번 만들면 해제 불가 — "체인 우회 직결"만 가능하다.
        // (원래 필터/컴프레서 체인으로의 복귀가 아니라 source→destination 우회 연결이다.)
        try {
          source.disconnect();
        } catch (err) {
          // 이미 끊겼거나 연결된 적 없음 — 무시
        }
        source.connect(ctx.destination);
        chain.bypassed = true;
        console.warn(
          '[sound] CORS taint로 추정되는 무음이 감지되어 오디오 체인을 우회(원본 직결)했습니다. ' +
            '한계: 원본 미디어 자체가 taint된 상태라면 스펙상 직결해도 destination 출력이 ' +
            '계속 무음일 수 있습니다(Web Audio가 원천적으로 해결할 수 없는 CORS 제약).'
        );
        return;
      }

      if (--checksLeft <= 0) {
        // 판정 없이 감시 기간 종료 — 정상 재생으로 간주하고 타이머 정리
        clearInterval(timer);
        analyser.disconnect();
      }
    }, CHECK_INTERVAL_MS);
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
