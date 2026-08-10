// content.js — sound 콘텐츠 스크립트
//
// 미디어 요소를 감지해 Web Audio 체인을 1회만 연결한다:
//   MediaElementSource → BiquadFilter EQ(3밴드) → DynamicsCompressor → Normalizer Worklet → Gain → destination
// AudioContext는 문서당 1개를 공유하고, 워클릿 모듈도 1회만 로드한다.
(() => {
  const chains = new WeakMap(); // HTMLMediaElement -> chain — chain 수명은 mediaEl 생존에 종속
  // 순회용 레지스트리. WeakRef라 chain을 강참조하지 않는다 — mediaEl이 GC되면 함께 회수되고,
  // 죽은 ref는 forEachChain 순회 중에 청소한다.
  const chainRefs = new Set();
  window.__soundChains = chainRefs; // 진단용 — isolated world에만 노출됨 (WeakRef Set)
  let currentSettings = null;

  function forEachChain(fn) {
    for (const ref of chainRefs) {
      const chain = ref.deref();
      if (chain) fn(chain);
      else chainRefs.delete(ref);
    }
  }

  // 문서당 AudioContext 1개 공유 (컨텍스트는 렌더 스레드·하드웨어 출력을 잡는 무거운 객체다).
  let sharedCtx = null;
  let workletReady = null; // Promise<boolean> — 모듈 로드 성공 여부
  function getCtx() {
    if (!sharedCtx) {
      sharedCtx = new (window.AudioContext || window.webkitAudioContext)();
      workletReady = sharedCtx.audioWorklet
        .addModule(chrome.runtime.getURL('normalizer.worklet.js'))
        .then(() => true)
        .catch((err) => {
          console.warn('[SoundFx] normalizer worklet failed to load — playing without normalization', err);
          return false;
        });
    }
    return sharedCtx;
  }

  // 자동재생 정책으로 suspended 상태로 생성된 컨텍스트는 소리가 전혀 안 난다.
  // 사용자 제스처마다 resume을 시도한다 (running이면 no-op 수준으로 싸다).
  function resumeCtx() {
    if (sharedCtx && sharedCtx.state === 'suspended') sharedCtx.resume().catch(() => {});
  }
  for (const type of ['pointerdown', 'keydown']) {
    document.addEventListener(type, resumeCtx, { capture: true, passive: true });
  }

  function updateWorklet(chain) {
    if (!chain.workletNode || !chain.settings) return;
    const { targetLufs, enabled } = chain.settings;
    chain.workletNode.port.postMessage({ targetLufs, enabled });
  }

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
    updateWorklet(chain);
  }

  function buildChain(mediaEl) {
    if (chains.has(mediaEl)) return chains.get(mediaEl);

    const ctx = getCtx();
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
    // 워클릿 모듈 로드는 비동기라 우선 compressor→gainNode로 이어 두고, 로드되면
    // 그 사이에 워클릿을 끼워 넣는다. 실패하면 체인은 그대로라 소리는 계속 난다.
    compressor.connect(gainNode);
    gainNode.connect(ctx.destination);

    const chain = { ctx, mediaEl, source, eq: { lowShelf, mid, highShelf }, compressor, gainNode };
    chains.set(mediaEl, chain);
    chainRefs.add(new WeakRef(chain));
    if (currentSettings) applySettings(chain, currentSettings);
    console.log('[SoundFx] audio chain connected:', mediaEl.tagName.toLowerCase(), mediaEl.currentSrc || '(no src)');

    workletReady.then((ok) => {
      if (!ok || chain.bypassed) return;
      const workletNode = new AudioWorkletNode(ctx, 'normalizer-processor');
      compressor.disconnect(gainNode);
      compressor.connect(workletNode);
      workletNode.connect(gainNode);
      chain.workletNode = workletNode;
      updateWorklet(chain);
    });

    // 무음 감지 바이패스 — 비동기 감시이므로 await하지 않는다(재생을 막지 않음).
    // 판정 결과는 chain.bypassed에 기록된다.
    checkSilenceAndBypass(chain);

    return chain;
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'get-hostname') {
      let bypassed = false;
      forEachChain((c) => {
        if (c.bypassed) bypassed = true;
      });
      sendResponse({ hostname: location.hostname, bypassed });
      return;
    }
    if (!msg || !msg.settings) return;
    currentSettings = msg.settings;
    forEachChain((c) => applySettings(c, currentSettings));
  });

  // 초기 로드: storage.sync에서 현재 hostname 설정을 읽어 이후 생성되는 chain에 적용한다.
  import(chrome.runtime.getURL('settings-logic.js'))
    .then(({ resolveSettings, siteKey }) => {
      const key = siteKey(location.hostname);
      chrome.storage.sync.get(['defaults', key], (data) => {
        currentSettings = resolveSettings(data.defaults, data[key]);
        forEachChain((c) => applySettings(c, currentSettings));
      });
    })
    .catch((err) => console.warn('[SoundFx] settings-logic failed to load', err));

  // gainNode 출력이 지속적으로 무음이면(CORS taint 등) mediaEl을 체인에서
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
      console.warn('[SoundFx] silence detector module failed to load — skipping bypass monitoring', err);
      return;
    }

    // gainNode 뒤에 분석용 AnalyserNode를 병렬로 탭 연결한다(destination 경로는 그대로 유지).
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    gainNode.connect(analyser);
    const buffer = new Float32Array(analyser.fftSize);

    // +1: detector의 첫 sample()은 currentTime 기준선 워밍업이라 무음 카운트에 포함되지
    // 않는다 — 정확히 requiredConsecutive회만 돌면 최대 19연속에서 감시가 끝나 판정 불가.
    let checksLeft = detector.requiredConsecutive + 1;

    const timer = setInterval(() => {
      if (chain.bypassed) {
        clearInterval(timer);
        analyser.disconnect();
        return;
      }

      // suspended 컨텍스트의 무음은 CORS taint가 아니다 — 판정 보류(카운트도 소모하지 않음).
      // 여기서 우회를 걸어도 같은 정지된 컨텍스트 안이라 여전히 무음이므로 의미도 없다.
      if (ctx.state !== 'running') return;

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
          '[SoundFx] Detected silence likely caused by CORS taint — bypassed the audio chain ' +
            '(connected source directly to output). Limitation: if the source media itself is ' +
            'tainted, the destination output may remain silent even after bypass (a CORS ' +
            'constraint Web Audio cannot resolve on its own).'
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
      // 사용자 클릭으로 시작된 재생이면 이 시점에 제스처가 살아 있어 resume이 먹힌다.
      resumeCtx();
    } catch (err) {
      console.warn('[SoundFx] audio chain connection failed', err);
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
