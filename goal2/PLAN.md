# PLAN — sound 2단계 (Safari 포팅: macOS + iOS)

## 목표

1단계에서 완성한 MV3 확장을 `safari-web-extension-converter`로 Safari 앱 확장으로 포팅하고, macOS Safari와 iOS 시뮬레이터에서 동작을 검증한다. App Store 배포는 이 골에 포함하지 않는다(이후 `ship` 절차로 별도 진행).

## 참조 문서

- PRD: /Users/donghanlee/work/projects/sound/plan.md (2단계 섹션)
- VALIDATION.md
- RECOVERY.md
- 1단계 산출물: extension/ (Chrome 검증 완료 상태 — 패리티 기준선)

## 마일스톤 1: Xcode 프로젝트 생성 + macOS 빌드

- 범위(Scope): `xcrun safari-web-extension-converter extension/ --project-location safari/ --app-name sound --macos-only 없이 양 플랫폼` 실행, 생성물 커밋, macOS 타깃 `xcodebuild` 통과. 서명은 로컬 개발 서명(자동)만.
- 완료 조건: safari/ 프로젝트가 커밋되고 macOS 앱+확장 타깃 빌드 성공.
- 검증: `xcodebuild build` (macOS scheme).

## 마일스톤 2: macOS Safari 실기 검증

- 범위(Scope): 빌드된 앱 실행 → Safari 설정에서 확장 허용(미서명 확장 허용 필요 시 개발 메뉴) → YouTube 재생 시 `[sound]` 체인·워클릿 로그 확인, 팝업 동작 확인. Safari 비호환 발견 시 최소 수정(RECOVERY의 패리티 규칙 준수).
- 완료 조건: macOS Safari에서 체인 연결 + 워클릿 삽입 + 팝업 설정 반영.
- 검증: 수동 확인 절차 1~3 + `node --test` 패리티.

## 마일스톤 3: iOS 시뮬레이터 검증

- 범위(Scope): iOS 타깃 시뮬레이터 빌드·설치 → 설정 앱에서 Safari 확장 활성화 → Safari로 youtube.com 재생 검증. iOS Safari 한계(AudioWorklet/자동재생 정책 등) 발견 시 기록하고 가능한 범위에서 대응.
- 완료 조건: iOS 시뮬레이터 Safari에서 체인 연결 동작(워클릿은 가능 범위 확인·기록).
- 검증: `xcodebuild build` (iOS Simulator destination) + 수동 확인 절차 4~5.

## 마일스톤 4: 패리티 확정 + 호환성 정리

- 범위(Scope): 포팅 중 extension/ 원본을 수정했다면 Chrome 경로 패리티 재확인(`node --test` + Chrome for Testing CDP 스모크), Safari 한계 사항을 PROGRESS.md에 정리.
- 완료 조건: Chrome/Safari 양쪽 동작 + 한계 문서화.
- 검증: `node --test` + 수동 확인 절차 6.

## 최종 완료 기준

- [ ] 모든 마일스톤 완료
- [ ] VALIDATION.md의 모든 검증 통과
- [ ] scope 위반 없음 (배포·스토어 제출 없음)
- [ ] PROGRESS.md 업데이트
