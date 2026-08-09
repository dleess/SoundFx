## 골 검토 요약 (Step 8 자동 생성)

- 목표: 1단계 확장을 Safari(macOS+iOS) 앱 확장으로 포팅, 로컬 검증까지 (배포 제외)
- 마일스톤: converter+macOS 빌드 / macOS Safari 실기 / iOS 시뮬레이터 / 패리티 확정
- 필수 검증: node --test + xcodebuild(macOS/iOS Simulator) + Safari 실기 수동
- scope 잠금: App Store 제출 금지, Chrome 패리티 유지 필수

---

# PROGRESS

## 현재 골

1단계 MV3 확장을 Safari(macOS+iOS) 앱 확장으로 포팅하고 로컬에서 동작을 검증한다. 배포 제외.

## 현재 마일스톤

마일스톤 1 완료

## 완료

- 마일스톤 1: `xcrun safari-web-extension-converter`로 `safari/sound/sound.xcodeproj` 생성 (양 플랫폼, Swift). scheme: `sound (macOS)`, `sound (iOS)`. macOS 타깃 `xcodebuild build` 서명 없이(CODE_SIGN_IDENTITY=-, CODE_SIGNING_ALLOWED=NO) 1회차 시도에 `BUILD SUCCEEDED`. iOS 타깃(App+Extension)도 프로젝트에 존재 확인(빌드는 마일스톤 3 범위).

## 마지막 검증 결과

```text
xcodebuild -project safari/sound/sound.xcodeproj -scheme "sound (macOS)" build CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=NO
→ ** BUILD SUCCEEDED ** (경고: hardened runtime disabled for ad-hoc codesigning — 예상된 동작, 서명 없이 빌드했으므로)

xcrun safari-web-extension-converter 경고 2건 (비차단):
- manifest.json is missing icons
- manifest.json is missing a large icon size
(extension/manifest.json에 icons 필드 없음 — 1단계 산출물 원본, 이번 마일스톤에서 extension/ 미수정 원칙 준수)
```

## 실패 시도

| 시도 | 변경 | 결과 | 배운 점 |
| --- | --- | --- | --- |

## 현재 가장 안정적인 상태

1단계 완료 상태 (main db8fde5 이후) — Chrome 확장 전체 동작.

## 다음 단계

PLAN.md의 마일스톤 2 (macOS Safari 실기 검증: 확장 활성화, 체인/워클릿 로그, 팝업 동작)

## 리스크 / 블로커

- Safari의 AudioWorklet·동적 import·web_accessible_resources 동작 차이 가능성 (특히 iOS)
- iOS Safari 자동재생 정책으로 시뮬레이터 검증 시 수동 탭 필요할 수 있음
- 미서명 확장은 Safari 개발 메뉴 허용 필요 — 사용자 머신 설정 개입 가능성
- iOS 시뮬레이터 탭 좌표는 포인트 단위 (CLAUDE.md gotcha)
- extension/manifest.json에 icons 미정의 → converter가 앱 아이콘 자동 생성 실패(경고, 빌드는 통과). App Store 단계(이 골 범위 밖)에서 아이콘 리소스 추가 필요할 수 있음.

## 인수인계 메모

이 PROGRESS.md는 골잡이가 생성했다. 골 실행 중 매 체크포인트마다 갱신된다.

## 골 시작 기록
- 시작 시각: 2026-08-09T03:13:22Z
- 사용 CLI: claude_code
- 컴팩트 후 본문 길이: 519자
