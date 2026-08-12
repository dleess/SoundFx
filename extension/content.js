// content.js — sound 콘텐츠 스크립트
//
// 미디어 요소를 감지해 Web Audio 체인을 1회만 연결한다:
//   MediaElementSource → BiquadFilter EQ(3밴드) → DynamicsCompressor → Normalizer Worklet
//     → Gain(mono 다운믹스 겸용) → StereoPanner → destination
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
  let resuming = false; // resume()은 활성화 부족 시 pending으로 남는다 — 제스처마다 중복 큐잉 방지
  function resumeCtx() {
    if (resuming || !sharedCtx || sharedCtx.state !== 'suspended') return;
    resuming = true;
    sharedCtx
      .resume()
      // suspended 동안 감시 예산이 소진돼 접힌 체인들을 다시 무장한다 (완료/우회된 체인은 내부 가드가 걸러냄)
      .then(() => forEachChain(checkSilenceAndBypass))
      .catch(() => {})
      .finally(() => {
        resuming = false;
      });
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
    chain.panner.pan.value = enabled ? settings.pan : 0;
    // 모노 다운믹스: gainNode의 channelCount=1 + explicit이면 Web Audio 믹싱 규칙이
    // 입력 L+R을 합쳐준다. 노드 교체 없이 속성만 바꾸므로 재생 중 토글해도 끊기지 않는다.
    // (속성 변경은 그래프 재구성이라 값이 같으면 건드리지 않는다 — 슬라이더 드래그마다 호출됨)
    const mode = enabled && settings.mono ? 'explicit' : 'max';
    if (chain.gainNode.channelCountMode !== mode) {
      chain.gainNode.channelCountMode = mode;
      chain.gainNode.channelCount = mode === 'explicit' ? 1 : 2;
    }
    updateWorklet(chain);
  }

  // 우회 배선의 단일 소유자 — MediaElementSource는 해제 불가라 destination 직결/체인 복귀만 가능하다.
  // (no-arg disconnect()는 스펙상 던지지 않는다)
  // ponytail: 워클릿 삽입 전에 우회됐다가 복귀하면 워클릿이 빠진 체인이 된다(정규화만 없음) —
  // 실측상 워클릿 로드(수십 ms)가 우회 판정(≥2.1s)보다 항상 빠르므로 재삽입 로직은 생략.
  function setBypassed(chain, on) {
    chain.source.disconnect();
    chain.source.connect(on ? chain.ctx.destination : chain.eq.lowShelf);
    chain.bypassed = on;
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

    const compressor = ctx.createDynamicsCompressor();

    const gainNode = ctx.createGain();
    gainNode.gain.value = 1.0;

    const panner = ctx.createStereoPanner();
    // 입력을 스테레오로 고정 — StereoPanner는 모노 입력에 equal-power(pan 0에서 -3dB)식을
    // 적용해 모노 소스·모노 다운믹스가 조용해진다. explicit/2면 업믹스(L=R, 게인 1) 후 유니티.
    panner.channelCountMode = 'explicit';
    panner.channelCount = 2;

    source.connect(lowShelf);
    lowShelf.connect(mid);
    mid.connect(highShelf);
    highShelf.connect(compressor);
    // 워클릿 모듈 로드는 비동기라 우선 compressor→gainNode로 이어 두고, 로드되면
    // 그 사이에 워클릿을 끼워 넣는다. 실패하면 체인은 그대로라 소리는 계속 난다.
    compressor.connect(gainNode);
    gainNode.connect(panner);
    panner.connect(ctx.destination);

    const chain = { ctx, mediaEl, source, eq: { lowShelf, mid, highShelf }, compressor, gainNode, panner };
    chains.set(mediaEl, chain);
    chainRefs.add(new WeakRef(chain));
    // 설정 도착 전에는 disabled 경로(중립 EQ/컴프/팬)로 — "꺼짐 = 이 값들"의 소유자는
    // applySettings 하나다. 공장 기본 컴프레서(ratio 12)가 첫 수백 ms를 누르는 것을 막는다.
    applySettings(chain, currentSettings || { enabled: false });
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

    // src 교체(SPA 내비게이션)마다 CORS taint 여부가 달라진다 — 우회를 풀고 감시를 재무장한다.
    // (같은 요소로 taint→정상, 정상→taint 어느 방향의 전환도 여기서만 복구된다)
    mediaEl.addEventListener('loadstart', () => {
      if (chain.bypassed) setBypassed(chain, false);
      chain.monitor = null;
      checkSilenceAndBypass(chain);
    });

    return chain;
  }

  // 최상위 페이지의 hostname (최상위 프레임에서는 자기 자신). 팝업이 저장하는 키는 항상
  // 최상위 hostname이므로, 서브프레임(임베드 플레이어)도 같은 키로 설정을 읽어야
  // "저장은 blog.com, 적용은 youtube.com" 식의 리로드 시 설정 증발이 없다.
  const topHostname = (() => {
    const ancestors = location.ancestorOrigins;
    try {
      return ancestors?.length ? new URL(ancestors[ancestors.length - 1]).hostname : location.hostname;
    } catch (err) {
      return location.hostname;
    }
  })();

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'get-hostname') {
      let bypassed = false;
      forEachChain((c) => {
        if (c.bypassed) bypassed = true;
      });
      sendResponse({ hostname: topHostname, bypassed });
      return;
    }
    if (!msg || !msg.settings) return;
    currentSettings = msg.settings;
    forEachChain((c) => applySettings(c, currentSettings));
  });

  // 초기 로드: storage.sync에서 현재 hostname 설정을 읽어 이후 생성되는 chain에 적용한다.
  import(chrome.runtime.getURL('settings-logic.js'))
    .then(({ resolveSettings, siteKey }) => {
      const key = siteKey(topHostname);
      chrome.storage.sync.get(['defaults', key], (data) => {
        currentSettings = resolveSettings(data.defaults, data[key]);
        forEachChain((c) => applySettings(c, currentSettings));
      });
    })
    .catch((err) => console.warn('[SoundFx] settings-logic failed to load', err));

  // gainNode 출력이 지속적으로 무음이면(CORS taint 등) mediaEl을 체인에서
  // 우회시켜 원본 재생(destination 미경유)으로 되돌린다.
  let detectorReady = null; // 미디어가 있는 페이지에서만, 1회만 로드

  async function checkSilenceAndBypass(chain) {
    const WINDOW_MS = 2000; // 재생 시작 후 감시할 총 시간
    const CHECK_INTERVAL_MS = 100; // 분석 주기 — WINDOW_MS/CHECK_INTERVAL_MS = 20회 검사
    const THRESHOLD = 1e-6; // 무음 판정 진폭 임계값(부동소수 잡음 여유)
    const SUSPENDED_BUDGET = 100; // suspended 상태로 최대 10초까지만 대기 — 초과 시 접고 resume 때 재무장

    // 감시 상태: null=재무장 가능, 'running'=감시 중, 'done'=이 소스는 판정 끝(loadstart가 리셋).
    // 우회된 체인은 stop(true)를 거쳐 항상 'done'이므로 별도 bypassed 검사가 필요 없다.
    if (chain.monitor) return;
    chain.monitor = 'running';

    const { ctx, mediaEl, gainNode } = chain;

    detectorReady ||= import(chrome.runtime.getURL('silence-detector.js')).catch(() => null);
    const mod = await detectorReady;
    if (!mod) {
      console.warn('[SoundFx] silence detector module failed to load — skipping bypass monitoring');
      chain.monitor = 'done'; // 모듈이 없으면 재시도해도 똑같다
      return;
    }
    const detector = mod.createSilenceDetector({
      windowMs: WINDOW_MS,
      threshold: THRESHOLD,
      checkIntervalMs: CHECK_INTERVAL_MS,
    });

    // gainNode 뒤에 분석용 AnalyserNode를 병렬로 탭 연결한다(destination 경로는 그대로 유지).
    // 노드·버퍼는 체인당 1회만 만들어 재무장 때 재사용한다 (같은 간선 중복 connect는 스펙상 무시됨).
    if (!chain.analyser) {
      chain.analyser = ctx.createAnalyser();
      chain.analyser.fftSize = 2048;
      chain.analyserBuffer = new Float32Array(chain.analyser.fftSize);
    }
    const analyser = chain.analyser;
    const buffer = chain.analyserBuffer;
    gainNode.connect(analyser);

    // +1: detector의 첫 sample()은 currentTime 기준선 워밍업이라 무음 카운트에 포함되지
    // 않는다 — 정확히 requiredConsecutive회만 돌면 최대 19연속에서 감시가 끝나 판정 불가.
    let checksLeft = detector.requiredConsecutive + 1;
    let suspendedLeft = SUSPENDED_BUDGET;

    // done=true면 이 소스에 대한 판정이 끝난 것(정상 확인 또는 우회) — loadstart 전까지 재무장 안 함.
    const stop = (done) => {
      clearInterval(timer);
      gainNode.disconnect(analyser);
      chain.monitor = done ? 'done' : null;
    };

    const timer = setInterval(() => {
      if (chain.bypassed) {
        stop(true);
        return;
      }

      // suspended 컨텍스트의 무음은 CORS taint가 아니다 — 판정 보류(카운트도 소모하지 않음).
      // 단, 무한 대기하면 자동재생 피드 페이지에서 타이머+chain이 요소 수만큼 영구 누수되므로
      // 예산 소진 시 감시를 접는다. resumeCtx()가 컨텍스트 재개 시 다시 무장한다.
      if (ctx.state !== 'running') {
        if (--suspendedLeft <= 0) stop(false);
        return;
      }

      analyser.getFloatTimeDomainData(buffer);
      const { bypass } = detector.sample({
        buffer,
        paused: mediaEl.paused,
        muted: mediaEl.muted,
        volume: mediaEl.volume,
        currentTime: mediaEl.currentTime,
      });

      if (bypass) {
        stop(true);
        setBypassed(chain, true);
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
        stop(true);
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
