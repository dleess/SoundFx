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

마일스톤 3 완료 (마일스톤 2는 별도 진행 중일 수 있음 — 이 항목은 마일스톤 3 담당 에이전트가 기록)

## 완료

- 마일스톤 1: `xcrun safari-web-extension-converter`로 `safari/sound/sound.xcodeproj` 생성 (양 플랫폼, Swift). scheme: `sound (macOS)`, `sound (iOS)`. macOS 타깃 `xcodebuild build` 서명 없이(CODE_SIGN_IDENTITY=-, CODE_SIGNING_ALLOWED=NO) 1회차 시도에 `BUILD SUCCEEDED`. iOS 타깃(App+Extension)도 프로젝트에 존재 확인(빌드는 마일스톤 3 범위).
- 마일스톤 3: iOS 시뮬레이터 검증 완료.
  - 빌드: `xcodebuild -scheme "sound (iOS)" -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.5'` → `BUILD SUCCEEDED` (1회차 시도). ("iPhone 16" 시뮬레이터가 없어 사용 가능한 iPhone 17로 대체.)
  - 시뮬레이터 부팅(iPhone 17, iOS 26.5) → 앱 설치(`com.donghan.sound.dev`) → 설정 > Apps > Safari > Extensions에서 sound 확장 "Allow Extension" 켬 + "All Websites" 권한 Allow로 설정.
  - Safari에서 `https://m.youtube.com/watch?v=dQw4w9WgXcQ` 재생: iOS 자동재생 정책상 음소거 시작 → "TAP TO UNMUTE" 탭으로 소리 재생 확인(스크린샷 `ios-02-youtube-playback.png`).
  - macOS Safari 개발자 메뉴(Develop > iPhone 17 (Simulator) > 탭)로 Web Inspector 연결 성공, 페이지 재로드 후 콘솔에서 `[sound] 오디오 체인 연결: "video" - "(src 없음)"` (content.js:73) 및 `[sound] normalizer 워클릿 삽입 완료` (content.js:64) 로그 확인(스크린샷 `ios-03-console-log.png`) — VALIDATION.md 수동 절차 4~5 통과.
  - 한계: 시뮬레이터 소프트웨어 키보드가 한국어(2벌식)로 기본 설정되어 있어 idb `ui_type`으로 주소창에 영문 URL을 직접 입력하면 한글 자모로 깨짐. `xcrun simctl openurl`로 URL을 직접 열어 우회함(검색창 텍스트 입력 대신 URL 직접 진입 — scope 내 우회, extension/ 미수정).

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

PLAN.md의 마일스톤 2 (macOS Safari 실기 검증: 확장 활성화, 체인/워클릿 로그, 팝업 동작) — 별도 진행 중이 아니라면 이어서 진행. 마일스톤 2 완료 후 마일스톤 4(패리티 확정 + 호환성 정리)로.

## 리스크 / 블로커

- Safari의 AudioWorklet·동적 import·web_accessible_resources 동작 차이 가능성 (특히 iOS) — 마일스톤 3에서 iOS는 문제 없음 확인(체인 연결 + 워클릿 삽입 로그 정상).
- iOS Safari 자동재생 정책으로 시뮬레이터 검증 시 수동 탭 필요 — 실제로 필요했음("TAP TO UNMUTE" 탭 후 재생), 예상대로 대응 완료.
- 미서명 확장은 Safari 개발 메뉴 허용 필요 — 사용자 머신 설정 개입 가능성 (iOS는 설정 앱에서 토글로 해결, 별도 개발 메뉴 불필요했음).
- iOS 시뮬레이터 탭 좌표는 포인트 단위 (CLAUDE.md gotcha) — 확인됨: 스크린샷 픽셀 좌표를 그대로 쓰면 어긋남, `ui_describe_all`의 AXFrame(포인트) 기준으로 탭해야 함. 시스템 토글(UISwitch)은 idb 단순 탭에 반응하지 않아 짧은 스와이프 제스처로 우회함.
- extension/manifest.json에 icons 미정의 → converter가 앱 아이콘 자동 생성 실패(경고, 빌드는 통과). App Store 단계(이 골 범위 밖)에서 아이콘 리소스 추가 필요할 수 있음.
- 시뮬레이터 소프트웨어 키보드 기본 언어가 한국어(2벌식) — idb `ui_type`으로 URL 등 영문 텍스트 입력 시 자모로 깨짐. `simctl openurl` 직접 호출로 우회했으나, 향후 시뮬레이터에서 텍스트 입력이 필요한 검증이 있다면 키보드 언어 전환이 필요할 수 있음.

## 인수인계 메모

이 PROGRESS.md는 골잡이가 생성했다. 골 실행 중 매 체크포인트마다 갱신된다.

## 골 시작 기록
- 시작 시각: 2026-08-09T03:13:22Z
- 사용 CLI: claude_code
- 컴팩트 후 본문 길이: 519자
