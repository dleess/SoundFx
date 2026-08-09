# VALIDATION — sound 2단계 (Safari 포팅)

## 필수 검증

골 완료로 마크하기 전 다음 명령을 반드시 실행한다. (저장소 루트)

```bash
node --test
xcodebuild -project safari/sound/sound.xcodeproj -scheme "sound (macOS)" build
xcodebuild -project safari/sound/sound.xcodeproj -scheme "sound (iOS)" -destination 'platform=iOS Simulator,name=iPhone 16' build
```

(scheme/경로명은 converter 생성 결과에 맞춰 확정하고 이 파일을 갱신한다)

## 마일스톤별 검증

각 마일스톤 종료 시 해당 빌드 명령 + 아래 수동 절차의 해당 항목을 실행한다.

## 수동 확인 절차

1. macOS: 빌드된 sound.app 실행 → Safari 설정 > 확장 프로그램에서 sound 활성화 (미서명이면 개발 메뉴 > 미서명 확장 허용).
2. macOS Safari에서 YouTube 재생 → 웹 인스펙터 콘솔에 `[sound] 오디오 체인 연결` + `워클릿 삽입 완료` 로그 확인.
3. macOS Safari 팝업(툴바 아이콘)에서 온/오프·슬라이더 조작이 반영되는지 확인.
4. iOS 시뮬레이터: 앱 설치 → 설정 > Safari > 확장 프로그램에서 활성화 → Safari로 youtube.com 재생.
5. iOS Safari 웹 인스펙터(macOS Safari 개발 메뉴 경유)로 `[sound]` 로그 확인.
6. 패리티: extension/ 원본을 수정했다면 Chrome for Testing + CDP 스모크(체인·워클릿 로그)를 재실행.

## 완료 기준 매핑

| PRD 완료 기준 | 검증 방식 | 상태 |
| --- | --- | --- |
| converter로 Xcode 프로젝트 생성·커밋 | 빌드 명령 | 대기 |
| macOS 앱+확장 빌드 통과 | xcodebuild (macOS) | 대기 |
| macOS Safari 실기 동작 (체인·워클릿·팝업) | 수동 1~3 | 대기 |
| iOS 시뮬레이터 빌드·설치·활성화 | xcodebuild (iOS) + 수동 4 | 대기 |
| iOS Safari 동작 확인·한계 기록 | 수동 4~5 | 대기 |
| Chrome 패리티 유지 | node --test + 수동 6 | 대기 |

## 완료로 보지 않는 조건

- 필수 검증 중 하나라도 실패
- PLAN.md 밖의 scope로 변경됨 (App Store 제출, 아이콘/브랜딩 작업 등)
- extension/ 수정으로 Chrome 동작이 깨짐 (패리티 체크 실패)
- 수동 재현이 여전히 실패함
- 검증을 통과시키기 위해 테스트가 삭제·skip됨
- 진단 없이 에러가 침묵 처리됨
- 패리티 체크 실패
- 롤백 불가능한 프로젝트 구조 변경
