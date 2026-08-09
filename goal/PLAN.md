# PLAN — sound (볼륨 정규화 브라우저 확장, 1단계)

## 목표

모든 사이트의 `<video>`/`<audio>` 라우드니스를 자동 정규화하고 이퀄라이저급 세밀 조절이 가능한 MV3 브라우저 확장(1단계 MVP)을 완성한다.

## 참조 문서

- PRD: /Users/donghanlee/work/projects/sound/plan.md
- VALIDATION.md
- RECOVERY.md

## 마일스톤 1: 확장 스캐폴드 + 오디오 체인

- 범위(Scope): MV3 manifest, 콘텐츠 스크립트(`play` 이벤트 캡처 + MutationObserver로 미디어 감지), `MediaElementSource → BiquadFilter(EQ) → DynamicsCompressor → Gain → destination` 체인 연결. 코드는 `extension/` 폴더, vanilla JS.
- 완료 조건: Chrome에 로드 후 YouTube에서 소리가 체인을 통과해 정상 재생됨.
- 검증: 수동 확인 절차 1~2.

## 마일스톤 2: 자동 라우드니스 정규화

- 범위(Scope): AudioWorklet에서 RMS 기반 간이 LUFS 측정, 타깃 라우드니스 추종 자동 게인(AGC). 게인 스무딩 로직 단위 테스트.
- 완료 조건: 조용한 곡/시끄러운 곡의 체감 볼륨이 비슷해짐.
- 검증: `node --test extension/tests/` + 수동 확인 절차 2.

## 마일스톤 3: 팝업 UI + 사이트별 프리셋

- 범위(Scope): 팝업(온/오프, 타깃 라우드니스, 컴프레서 threshold/ratio/attack/release, EQ 슬라이더), `storage.sync` 사이트별 프리셋 저장·복원, 콘텐츠 스크립트와 메시징.
- 완료 조건: 팝업 조작이 청감상 즉시 반영되고 새로고침 후에도 프리셋 유지.
- 검증: 수동 확인 절차 3~5 + 팝업 스크린샷.

## 마일스톤 4: CORS 바이패스 + 다사이트 검증

- 범위(Scope): 체인 연결 후 출력 무음 감지 시 원본 재생으로 자동 복귀(바이패스), 무음 감지 로직 단위 테스트. YouTube 외 2개 사이트 실측.
- 완료 조건: 바이패스 동작 확인 + 3개 사이트에서 전체 수동 절차 통과.
- 검증: `node --test extension/tests/` + 수동 확인 절차 6~7.

## 최종 완료 기준

- [ ] 모든 마일스톤 완료
- [ ] VALIDATION.md의 모든 검증 통과
- [ ] scope 위반 없음
- [ ] PROGRESS.md 업데이트
