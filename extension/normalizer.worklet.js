// normalizer.worklet.js — AudioWorkletProcessor 뼈대 (M1: passthrough만).
// M2가 여기에 RMS 기반 간이 LUFS 측정 + 타깃 라우드니스 추종 게인 로직을 채운다.

class NormalizerProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    for (let channel = 0; channel < input.length; channel++) {
      output[channel].set(input[channel]); // M2: 여기서 측정된 게인을 곱해 출력
    }
    return true;
  }
}

registerProcessor('normalizer-processor', NormalizerProcessor);
