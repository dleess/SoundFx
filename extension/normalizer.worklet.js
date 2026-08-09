// normalizer.worklet.js — RMS 기반 간이 LUFS 측정 + 타깃 라우드니스 추종 AGC.
//
// AudioWorklet 스코프에서는 chrome-extension:// URL의 import가 불안정하므로
// gain-logic.js의 상수·수식을 그대로 복제했다. 둘 중 하나를 고치면 나머지도 고쳐야 한다.

const TARGET_LUFS_DEFAULT = -20;
const GAIN_MIN_DB = -12;
const GAIN_MAX_DB = 12;
const SILENCE_RMS = 1e-4;
const ATTACK_S = 0.05;
const RELEASE_S = 0.4;

const dbToGain = (db) => 10 ** (db / 20);
const GAIN_MIN = dbToGain(GAIN_MIN_DB);
const GAIN_MAX = dbToGain(GAIN_MAX_DB);

class NormalizerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.gain = 1;
    this.enabled = true;
    this.targetLufs = TARGET_LUFS_DEFAULT;
    // content.js의 updateWorklet()이 {targetLufs, enabled}를 보낸다.
    this.port.onmessage = (e) => {
      const { targetLufs, enabled } = e.data || {};
      if (typeof targetLufs === 'number') this.targetLufs = targetLufs;
      if (typeof enabled === 'boolean') this.enabled = enabled;
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    const frames = input[0].length;
    const dt = frames / sampleRate;

    // 전 채널 합산 RMS (간이 LUFS)
    let sum = 0;
    let count = 0;
    for (let c = 0; c < input.length; c++) {
      const ch = input[c];
      for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i];
      count += ch.length;
    }
    const rms = count ? Math.sqrt(sum / count) : 0;

    // 무음 구간에서는 게인을 동결한다 (동결하지 않으면 +12dB로 폭주 후 곡 시작에서 터진다).
    if (!this.enabled) {
      const tau = 1 < this.gain ? ATTACK_S : RELEASE_S;
      this.gain += (1 - this.gain) * (1 - Math.exp(-dt / tau));
    } else if (rms >= SILENCE_RMS) {
      const rmsDb = 20 * Math.log10(Math.max(rms, 1e-12));
      const raw = dbToGain(this.targetLufs - rmsDb);
      const target = Math.min(GAIN_MAX, Math.max(GAIN_MIN, raw));
      const tau = target < this.gain ? ATTACK_S : RELEASE_S;
      this.gain += (target - this.gain) * (1 - Math.exp(-dt / tau));
    }

    // ponytail: 블록당 게인 1개(계단식). 클릭 들리면 샘플 단위 램프로 올릴 것.
    const g = this.gain;
    for (let c = 0; c < output.length; c++) {
      const src = input[c] || input[0];
      const dst = output[c];
      for (let i = 0; i < dst.length; i++) dst[i] = src[i] * g;
    }
    return true;
  }
}

registerProcessor('normalizer-processor', NormalizerProcessor);
