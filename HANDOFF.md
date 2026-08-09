# HANDOFF: SoundFx — 볼륨 정규화 앱, 전 플랫폼 구현·검증 완료. 남은 것: 스토어 배포 + 실기기 검증

**Written:** 2026-08-09 · **Working dir:** `/Users/donghanlee/work/projects/SoundFx` · **Branch:** `main` (원격 없음 — 이번 세션에서 GitHub 생성 예정)

## Goal
YouTube 등에서 곡마다 다른 라우드니스를 자동 정규화하는 앱. "done" = plan.md의 3단계 전부 + 리브랜딩 완료 상태 — **이미 도달함**. 후속 작업의 done = (1) 원하는 스토어에 배포, (2) 실기기에서 YouTube 앱 세션 브로드캐스트 검증.

## Status
코드 100% 완료·검증됨. 배포 0%. 실기기 검증 0% (에뮬레이터 검증은 완료).

- 1단계 Chrome/Firefox 확장 (`extension/`): 완료. 실곡 측정 원본 15.4dB 차이 → 출력 0.2dB. 사용자 청감 확인됨.
- 2단계 Safari (`safari/SoundFx/`): 완료. macOS 청감 확인, iOS 시뮬레이터 Web Inspector 로그 확인.
- 3단계 Android (`android/`): 완료. 에뮬레이터 E2E — `dumpsys media.audio_flinger`에서 이펙트 Enabled y/n이 토글과 1:1 일치.
- 리브랜딩(SoundFx, 영어 UI, Okabe-Ito 색, 아이콘): 완료, 전 플랫폼 스모크 재검증됨.

## What worked
- 확장 검증: Chrome for Testing(브랜드 Chrome 151은 `--load-extension` 미지원!) + CDP. 상세는 메모리 `chrome-extension-testing.md`와 `goal/PROGRESS.md`. **[still applied]**
- macOS Safari 확장 등록: DerivedData 경로 앱은 pluginkit 등록이 안 됨 → `~/Applications/SoundFx.app`으로 복사 후 실행하면 등록됨. 현재 설치·등록돼 있음. **[still applied]**
- Android 이펙트: `DynamicsProcessing`을 세션 브로드캐스트(`ACTION_OPEN_AUDIO_EFFECT_CONTROL_SESSION`) 수신으로 attach, 세션 없으면 session 0 폴백 (`android/.../audio/SessionRegistry.kt`의 `targets()`가 유일한 폴백 지점). **[still applied]**
- 빌드 환경: `export JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=$HOME/Library/Android/sdk` 필수. `android/local.properties`는 gitignore라 새 클론엔 없음. **[still applied]**

## What didn't work
- `node --test <디렉터리>` 위치 인자 — 이 머신 Node v24.14.1 자체 버그로 실패. 루트에서 인자 없이 `node --test` 또는 파일 글롭 사용. 재시도 금지.
- 브랜드 Chrome에 `--load-extension` + `--disable-features=DisableLoadExtensionCommandLineSwitch` — Chrome 151에서 완전 제거됨. 확장은 로드 안 되는데 `chrome-extension://<id>/` URL이 에러 페이지로 열려 로드된 것처럼 보이는 함정 있음(`chrome.runtime` undefined로 구분).
- 에뮬레이터에서 `adb shell input tap`으로 Material Switch/Slider 조작 — 제스처 임계값 문제로 무시됨. `KEYCODE_TAB` 포커스 + `DPAD_CENTER/RIGHT`로 우회 (버튼류는 tap 정상).
- 2초짜리 루프 오디오로 CORS 바이패스 테스트 — `currentTime` 되감김이 감지 카운터를 리셋해 절대 발동 안 함. 테스트 톤은 6초 이상으로.

## Key files & commands
- `plan.md` — PRD. 플랫폼 제약과 로드맵의 단일 진실 원천.
- `extension/` — MV3 확장 (vanilla JS). 테스트: 루트에서 `node --test` (26개). 설정 계약 `{enabled, targetLufs, comp{...}, eq{...}}`은 `settings-logic.js`가 원본.
- `safari/SoundFx/SoundFx.xcodeproj` — converter 산출물, 리소스는 `extension/`을 참조(복제 없음). 빌드: `xcodebuild -project safari/SoundFx/SoundFx.xcodeproj -scheme "SoundFx (macOS)" build CODE_SIGN_IDENTITY=-`. iOS scheme "SoundFx (iOS)". bundle id `com.donghan.sound.dev` (배포 시 정식 id로 바꿀 것).
- `android/` — Kotlin. `cd android && ./gradlew test assembleDebug` (JAVA_HOME/ANDROID_HOME 필요). applicationId `com.donghan.sound`.
- `goal/`, `goal2/`, `goal3/` — 각 단계 골 기록(VALIDATION/PROGRESS에 검증 증거·환경 함정 상세).
- `assets/icon-1024.png` — 확정 아이콘 원본 (파형/흰배경, Okabe-Ito). 파생: `extension/icons/`, `android/.../mipmap-*/`.
- AVD: `test36` (`~/Library/Android/sdk/emulator/emulator -avd test36`).

## Next steps
1. (선택한 것부터) Chrome 웹스토어: `extension/`을 zip으로 패키징(`icons/` 포함, tests 제외 가능), 스토어 설명은 manifest description 재활용. 계정 로그인은 사용자.
2. App Store(Safari): 아이콘은 이미 반영됨. bundle id 정식 확정 + `ship` 스킬 절차 (CLAUDE.md: iOS 릴리스는 ship 스킬, Google Play는 lee.donghan@gmail.com).
3. Play 스토어: 서명 설정 + `./gradlew bundleRelease` → AAB 업로드.
4. 실기기 검증: 폰 USB 연결 → `adb install` → YouTube 앱 재생 → `adb logcat -s SoundFx`에서 `broadcast session=` 수신 여부 확인. 미수신이면 session 0 폴백이 실기기에서 동작하는지 확인 (기기별 편차 가능 — plan.md 리스크 참조).

## Open questions / risks
- **YouTube 앱이 세션을 브로드캐스트하는지 실기기 미확인** — 3단계의 마지막 리스크. 미브로드캐스트 + session 0 attach 거부 기기면 Android 앱의 핵심 가치가 제한됨.
- iOS Safari 확장의 실기기(시뮬레이터 아닌) 동작 unverified — 시뮬레이터에서는 워클릿까지 정상.
- Safari 배포용 서명/팀 설정은 손대지 않음 (현재 ad-hoc `CODE_SIGN_IDENTITY=-`).
- `window.__soundUpdateWorklet`/`__soundChains` 등 내부 식별자는 리브랜딩에서 의도적으로 유지 (호환성). 코드 내 한국어 주석도 의도적 유지 (사용자 대상 아님).
- ponytail 정리 항목 2건 (content.js): `updateWorklet`을 buildChain 밖으로 호이스팅, `chains.set` 몽키패치를 선언부 레지스트리로 단순화 — 동작엔 문제 없음.
