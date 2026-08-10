// normalizer.worklet.js — BS.1770 K-가중 momentary loudness 측정 + 타깃 라우드니스 추종 AGC
// + 출력단 소프트 클립.
//
// AudioWorklet 스코프에서는 chrome-extension:// URL의 import가 불안정하므로
// gain-logic.js의 상수·수식을 그대로 복제했다. 둘 중 하나를 고치면 나머지도 고쳐야 한다.
// (드리프트는 normalize.test.js의 상수 일치 테스트가 잡는다.)

const TARGET_LUFS_DEFAULT = -20;
const GAIN_MIN_DB = -12;
const GAIN_MAX_DB = 12;
const ATTACK_S = 0.05;
const RELEASE_S = 0.4;
const ABS_GATE_LUFS = -70;
const MOMENTARY_S = 0.4;
const CLIP_THRESHOLD = 0.89;
const SHELF_F0 = 1681.9744509555319;
const SHELF_GAIN_DB = 3.99984385397;
const SHELF_Q = 0.7071752369554193;
const SHELF_VB_EXP = 0.4996667741545416;
const HIGHPASS_F0 = 38.13547087613982;
const HIGHPASS_Q = 0.5003270373253953;

const dbToGain = (db) => 10 ** (db / 20);
const GAIN_MIN = dbToGain(GAIN_MIN_DB);
const GAIN_MAX = dbToGain(GAIN_MAX_DB);

function kWeightingCoeffs(fs) {
  const K = Math.tan((Math.PI * SHELF_F0) / fs);
  const Vh = 10 ** (SHELF_GAIN_DB / 20);
  const Vb = Vh ** SHELF_VB_EXP;
  const a0 = 1 + K / SHELF_Q + K * K;
  const shelf = {
    b0: (Vh + (Vb * K) / SHELF_Q + K * K) / a0,
    b1: (2 * (K * K - Vh)) / a0,
    b2: (Vh - (Vb * K) / SHELF_Q + K * K) / a0,
    a1: (2 * (K * K - 1)) / a0,
    a2: (1 - K / SHELF_Q + K * K) / a0,
  };
  const K1 = Math.tan((Math.PI * HIGHPASS_F0) / fs);
  const d0 = 1 + K1 / HIGHPASS_Q + K1 * K1;
  const hp = { b0: 1, b1: -2, b2: 1, a1: (2 * (K1 * K1 - 1)) / d0, a2: (1 - K1 / HIGHPASS_Q + K1 * K1) / d0 };
  return [shelf, hp];
}

function softClip(x) {
  const ax = Math.abs(x);
  if (ax <= CLIP_THRESHOLD) return x;
  return Math.sign(x) * (CLIP_THRESHOLD + (1 - CLIP_THRESHOLD) * Math.tanh((ax - CLIP_THRESHOLD) / (1 - CLIP_THRESHOLD)));
}

class NormalizerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.gain = 1;
    this.enabled = true;
    this.targetLufs = TARGET_LUFS_DEFAULT;
    // K-가중 미터 상태 (gain-logic.js createLoudnessMeter와 동일 로직)
    this.coeffs = kWeightingCoeffs(sampleRate);
    this.windowFrames = Math.round(MOMENTARY_S * sampleRate);
    this.states = [];
    this.blocks = [];
    this.totalSumSq = 0;
    this.totalFrames = 0;
    // content.js의 updateWorklet()이 {targetLufs, enabled}를 보낸다.
    this.port.onmessage = (e) => {
      const { targetLufs, enabled } = e.data || {};
      if (typeof targetLufs === 'number') this.targetLufs = targetLufs;
      if (typeof enabled === 'boolean') this.enabled = enabled;
    };
  }

  /** 블록의 K-가중 momentary loudness(LUFS). 400ms 창이 차기 전엔 null. */
  measure(input) {
    const frames = input[0].length;
    let sumSq = 0;
    for (let c = 0; c < input.length; c++) {
      if (!this.states[c]) this.states[c] = [{ x1: 0, x2: 0, y1: 0, y2: 0 }, { x1: 0, x2: 0, y1: 0, y2: 0 }];
      const st = this.states[c];
      const ch = input[c];
      for (let i = 0; i < frames; i++) {
        let x = ch[i];
        for (let s = 0; s < 2; s++) {
          const k = this.coeffs[s];
          const z = st[s];
          const y = k.b0 * x + k.b1 * z.x1 + k.b2 * z.x2 - k.a1 * z.y1 - k.a2 * z.y2;
          z.x2 = z.x1;
          z.x1 = x;
          z.y2 = z.y1;
          z.y1 = y;
          x = y;
        }
        sumSq += x * x;
      }
    }
    this.blocks.push({ sumSq, frames });
    this.totalSumSq += sumSq;
    this.totalFrames += frames;
    while (this.totalFrames - this.blocks[0].frames >= this.windowFrames) {
      const old = this.blocks.shift();
      this.totalSumSq -= old.sumSq;
      this.totalFrames -= old.frames;
    }
    if (this.totalFrames < this.windowFrames) return null;
    return -0.691 + 10 * Math.log10(Math.max(this.totalSumSq / this.totalFrames, 1e-12));
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    const frames = input[0].length;
    const dt = frames / sampleRate;
    const lufs = this.measure(input);

    if (!this.enabled) {
      // 꺼짐: 게인을 1로 완만히 복귀
      const tau = this.gain > 1 ? ATTACK_S : RELEASE_S;
      this.gain += (1 - this.gain) * (1 - Math.exp(-dt / tau));
    } else if (lufs !== null && lufs >= ABS_GATE_LUFS) {
      // 무음(절대 게이트 이하)·워밍업 중에는 동결 — 동결하지 않으면 +12dB로 폭주 후 곡 시작에서 터진다.
      const raw = dbToGain(this.targetLufs - lufs);
      const target = Math.min(GAIN_MAX, Math.max(GAIN_MIN, raw));
      const tau = target < this.gain ? ATTACK_S : RELEASE_S;
      this.gain += (target - this.gain) * (1 - Math.exp(-dt / tau));
    }

    // ponytail: 블록당 게인 1개(계단식). 클릭 들리면 샘플 단위 램프로 올릴 것.
    const g = this.gain;
    const clip = this.enabled; // 꺼짐이면 원음 그대로 (클립도 우회)
    for (let c = 0; c < output.length; c++) {
      const src = input[c] || input[0];
      const dst = output[c];
      for (let i = 0; i < dst.length; i++) {
        const v = src[i] * g;
        dst[i] = clip ? softClip(v) : v;
      }
    }
    return true;
  }
}

registerProcessor('normalizer-processor', NormalizerProcessor);
