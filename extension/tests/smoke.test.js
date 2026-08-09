import test from 'node:test';
import assert from 'node:assert/strict';
import { clampGain } from '../gain-logic.js';

test('clampGain은 범위 안 값을 그대로 반환한다', () => {
  assert.equal(clampGain(1.5, 0, 4), 1.5);
});

test('clampGain은 최댓값을 넘지 않는다', () => {
  assert.equal(clampGain(10, 0, 4), 4);
});

test('clampGain은 최솟값 아래로 내려가지 않는다', () => {
  assert.equal(clampGain(-5, 0, 4), 0);
});
