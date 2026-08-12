import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, siteKey, resolveSettings, clampSettings } from '../settings-logic.js';

test('siteKey는 sites.<hostname> 형태의 저장 키를 만든다', () => {
  assert.equal(siteKey('youtube.com'), 'sites.youtube.com');
});

test('resolveSettings는 아무 값도 없으면 하드코딩 기본값을 반환한다', () => {
  assert.deepEqual(resolveSettings(undefined, undefined), DEFAULT_SETTINGS);
});

test('resolveSettings는 site 설정이 defaults보다 우선한다', () => {
  const defaults = { targetLufs: -20 };
  const site = { targetLufs: -30 };
  assert.equal(resolveSettings(defaults, site).targetLufs, -30);
});

test('resolveSettings는 site 설정이 없으면 defaults로 폴백한다', () => {
  const defaults = { comp: { ratio: 8 } };
  const result = resolveSettings(defaults, undefined);
  assert.equal(result.comp.ratio, 8);
  assert.equal(result.comp.threshold, DEFAULT_SETTINGS.comp.threshold); // 지정 안 한 필드는 하드 기본값 유지
});

test('resolveSettings는 부분 site patch만 있어도 나머지 필드는 유지한다', () => {
  const result = resolveSettings(undefined, { eq: { mid: 5 } });
  assert.equal(result.eq.mid, 5);
  assert.equal(result.eq.low, 0);
  assert.equal(result.targetLufs, DEFAULT_SETTINGS.targetLufs);
});

test('clampSettings는 범위를 벗어난 값을 클램프한다', () => {
  const result = clampSettings({
    enabled: 1,
    targetLufs: 100,
    comp: { threshold: -999, ratio: 999, attack: -1, release: 999 },
    eq: { low: 999, mid: -999, high: 0 },
  });
  assert.equal(result.enabled, true);
  assert.equal(result.targetLufs, 0);
  assert.equal(result.comp.threshold, -100);
  assert.equal(result.comp.ratio, 20);
  assert.equal(result.comp.attack, 0);
  assert.equal(result.comp.release, 1);
  assert.equal(result.eq.low, 24);
  assert.equal(result.eq.mid, -24);
});

test('pan/mono: 기본값은 center·stereo이고 site patch가 우선한다', () => {
  const base = resolveSettings(undefined, undefined);
  assert.equal(base.pan, 0);
  assert.equal(base.mono, false);
  const result = resolveSettings({ pan: 0.5 }, { pan: -0.3, mono: true });
  assert.equal(result.pan, -0.3);
  assert.equal(result.mono, true);
});

test('pan은 -1~1로 클램프되고 mono는 boolean으로 강제된다', () => {
  const result = clampSettings({ ...DEFAULT_SETTINGS, pan: 5, mono: 1 });
  assert.equal(result.pan, 1);
  assert.equal(result.mono, true);
  // pan/mono가 없는 구버전 저장값은 resolveSettings가 기본값으로 채운다
  const legacy = resolveSettings(undefined, { targetLufs: -30 });
  assert.equal(legacy.pan, 0);
  assert.equal(legacy.mono, false);
});

test('숫자가 아닌 값(NaN/null/문자열)은 기본값으로 대체된다 — storage 손상 방어', () => {
  // storage.sync는 JSON 직렬화라 과거에 쓰인 NaN이 null로 돌아온다. Math.max(min, null)=0
  // 오염이나 NaN 통과(→ 워클릿 게인 영구 NaN = 무음)가 없어야 한다.
  const result = resolveSettings(undefined, {
    targetLufs: null,
    comp: { ratio: 'x', threshold: NaN },
    eq: { low: {} },
    pan: null,
  });
  assert.equal(result.targetLufs, DEFAULT_SETTINGS.targetLufs);
  assert.equal(result.comp.ratio, DEFAULT_SETTINGS.comp.ratio);
  assert.equal(result.comp.threshold, DEFAULT_SETTINGS.comp.threshold);
  assert.equal(result.eq.low, DEFAULT_SETTINGS.eq.low);
  assert.equal(result.pan, DEFAULT_SETTINGS.pan);
  for (const v of [result.targetLufs, result.comp.ratio, result.pan]) {
    assert.ok(Number.isFinite(v));
  }
});

test('debounce: 연속 호출은 마지막 인자로 1회만 실행된다', async () => {
  const { debounce } = await import('../settings-logic.js');
  const calls = [];
  const fn = debounce((v) => calls.push(v), 20);
  fn(1);
  fn(2);
  fn(3);
  assert.equal(calls.length, 0, '대기 시간 전에는 실행되면 안 된다');
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(calls, [3]);
});

test('debounce: cancel()은 대기 중인 호출을 버린다 — reset이 이전 값으로 되살아나지 않게', async () => {
  const { debounce } = await import('../settings-logic.js');
  const calls = [];
  const fn = debounce((v) => calls.push(v), 20);
  fn('stale');
  fn.cancel();
  fn.flush(); // cancel 후 flush도 아무것도 실행하면 안 된다
  await new Promise((r) => setTimeout(r, 60));
  assert.deepEqual(calls, []);
});

test('debounce: flush()는 대기 중인 호출을 즉시 실행하고, 없으면 아무것도 안 한다', async () => {
  const { debounce } = await import('../settings-logic.js');
  const calls = [];
  const fn = debounce((v) => calls.push(v), 1000);
  fn('pending');
  fn.flush();
  assert.deepEqual(calls, ['pending'], 'flush 즉시 실행');
  fn.flush(); // 대기 없음 — 중복 실행 금지
  await new Promise((r) => setTimeout(r, 30));
  assert.deepEqual(calls, ['pending']);
});
