# HANDOFF: Chrome 공개·Play closed 테스트 라이브·iOS 심사 대기 — 남은 것: 테스터 12명×14일, 심사 대응, 다음 배포 사이클(팬/모노+버그픽스), 실기기 검증

**Written:** 2026-08-12 · **Working dir:** `/Users/donghanlee/work/projects/SoundFx` · **Branch:** `main` (origin: github.com/dleess/SoundFx, 로컬이 origin보다 1커밋 앞섬 — push 안 됨)

## Goal
3개 스토어(Chrome/iOS/Play) 정식 공개 + 실기기 YouTube 세션 브로드캐스트 검증. Play는 테스터 12명이 14일 유지되어야 프로덕션 신청 가능.

## Status
- **Chrome 웹스토어: 심사 통과, 공개됨** (2026-08-12 확인) — https://chromewebstore.google.com/detail/soundfx/fmfengepahkecmalcolbkkjmdganegfb. 단 공개된 빌드는 구버전 코드(아래 커밋 2개 미포함).
- **Play: 심사 통과 (2026-08-10), closed 테스트(Alpha) 라이브.** v0.1.0, 테스터 opt-in **1/12명** (2026-08-12 기준). opt-in 링크: https://play.google.com/apps/testing/com.donghan.soundfx (테스터 명단 등록 계정만 가능 — 명단: "SoundFx testers" 2명 + 내부 테스터 25명). **12명 모인 시점부터 14일 타이머 시작.** Play Console 앱 ID 4973170189162578710, 개발자 계정 ID 5578432782521884610.
- **App Store (iOS): v1.0 (build 1) WAITING_FOR_REVIEW** (2026-08-08 제출, 2026-08-12 ASC API로 확인 — 4일째 대기, 정상 범위). 새 빌드 제출 시 심사 줄 리셋되므로 통과 전까지 재제출 금지.
- **테스터 모집 메일 발송됨 (2026-08-11)**: lee.donghan@gmail.com으로 Gmail 웹(Chrome 자동화, 발신 계정 lee.donghan)에서 발송. 앱 소개+참여 방법+opt-in 링크 포함.
- **커밋 `4781f8f` (2026-08-12): 팬/모노 기능 + 버그 14건 수정 + 리팩토링 — 어느 스토어에도 미배포.** 이전 수정 `4acb387`(리뷰 결함 8건)도 미배포. 3개 스토어 모두 이 두 커밋 이전 코드로 돌고 있음. 의도적 보류: iOS 심사 줄 유지 + Play 14일 테스트 안정성. 다음 사이클(v1.1/v0.2)에 일괄 배포하기로 결정됨.
- 테스트: extension `node --test tests/*.test.js` 36/36, Android `./gradlew test` 25/25 (2026-08-12 통과 확인). 워킹 트리 클린(추적 외: .DS_Store, .omo/만).

## What worked
- **iOS 상태 실시간 확인**: PyJWT venv에서 ASC API 호출. 키 `~/.appstoreconnect/private_keys/AuthKey_CGV9U72GU7.p8`, Issuer `9c0e6248-43c6-405d-8c0b-943a8e02ec61`, kid `CGV9U72GU7`, 앱 ID 6799607827. `GET /v1/apps/6799607827/appStoreVersions?limit=5` → appStoreState 확인. (이 세션의 스크립트는 세션 스크래치패드라 소멸 — 위 정보로 재작성, ES256 JWT 20분 만료.) **[재사용 가능]**
- **Chrome 공개 여부는 대시보드 없이 확인 가능**: `curl -s "https://chromewebstore.google.com/search/SoundFx" | grep -oE '/detail/[a-z-]+/[a-p]{32}'` → detail 경로가 나오면 공개된 것. **[재사용 가능]**
- **Play Console 웹은 Claude in Chrome 자동화 가능** (계정 lee.donghan, 개발자 "treasurehunter"). closed 트랙 opt-in 링크는 Closed testing→Manage track→Testers 탭 하단 "Copy link" 클릭 후 **`pbpaste`로 OS 클립보드에서 읽기** (페이지 내 JS clipboard.readText는 CDP 타임아웃). **[재사용 가능]**
- Xcode 프로젝트가 `extension/` 파일을 상대경로로 직접 참조 (`safari/SoundFx/SoundFx.xcodeproj/project.pbxproj`의 `path = ../../../extension/*.js`) — **extension 수정 = Chrome+iOS Safari 동시 적용, 파일 복사 불필요**. **[구조 확인됨]**
- 다관점 병렬 서브에이전트 리뷰(재사용/단순화/효율/깊이 + 영역별 버그 헌팅)로 실버그 14건 발견·수정 — 전부 `4781f8f`에 포함. **[still applied]**

## What didn't work
- **gws CLI 미인증** (`gws auth status` → auth_method none, `~/.config/gws/client_secret.json` 없음) — Gmail API 발송 불가, OAuth 셋업은 사용자 개입 필요. Gmail 웹 자동화로 우회했음. 재시도하려면 nopal-setup 스킬 참조.
- Play Console "Copy link" 후 페이지 컨텍스트에서 `navigator.clipboard.readText()` → CDP 45초 타임아웃 (렌더러 블록). `pbpaste`를 쓸 것. 재시도 금지.
- Chrome 웹스토어 대시보드 확장 자동화 원천 차단 (기존 확인) — 업데이트 zip 업로드는 사용자가 직접. 재시도 금지.
- **Android 모노 다운믹스는 구현 불가로 결정**: DynamicsProcessing은 채널별 독립 처리만, 타 앱 오디오 L+R 합산 API 없음, 시스템 "모노 오디오"는 WRITE_SECURE_SETTINGS 필요. 밸런스(채널별 입력 게인, 최대 24dB 감쇠)만 구현됨. 재조사 불필요.

## Key files & commands
- `extension/` — Chrome+iOS 공용 소스. 설정 계약: `{enabled, targetLufs, comp{...}, eq{...}, pan(-1..1), mono(bool)}` (`settings-logic.js`). 체인: EQ→Comp→Worklet→Gain(모노 다운믹스 겸용)→StereoPanner(explicit/2ch)→dest (`content.js`). 우회 배선은 `setBypassed()`, 감시 상태는 `chain.monitor`(null/'running'/'done') 단일 필드.
- `android/app/src/main/java/com/donghan/sound/` — `EffectParams.channelGainDb()`가 밸런스 매핑, `EffectEngine.apply()`는 채널별 runCatching. `SoundService.onCreate`가 DataStore에서 설정 복원(restoreJob, 인텐트 도착 시 cancel).
- extension 테스트: `cd extension && node --test tests/*.test.js` → 36 pass.
- Android 테스트/빌드: `export JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=$HOME/Library/Android/sdk && cd android && ./gradlew test bundleRelease`. 릴리스 서명: `~/keystores/soundfx-upload.jks` + `android/local.properties`의 RELEASE_* 3개 (비밀번호는 `~/keystores/soundfx-upload-credentials.txt`).
- Chrome 업데이트 zip: `cd extension && zip -r SoundFx-<ver>.zip manifest.json *.js popup.html icons` (tests/package.json 제외). manifest version bump 필수 (현재 0.1.0).
- iOS 릴리스: ship 스킬 절차 (버전 bump→archive→ASC 업로드). Safari manifest description 112자 제한 유지.

## Next steps
1. **`git push`** (로컬 `4781f8f`가 origin에 없음 — 사용자 확인 후).
2. **Play 테스터 모집이 병목**: 11명 더 필요. 지인 Gmail 주소를 받아 Play Console→Closed testing Alpha→Testers 탭의 이메일 리스트에 추가 후 opt-in 링크 공유. 12명 모이면 14일 카운트다운 시작 — 그 후 "Apply for production".
3. iOS 심사 결과 대기 (통지: kbsi.bionmr@gmail.com). 리젝 시 기존 제출 파이프라인 재사용.
4. **다음 배포 사이클** (iOS 심사 통과 + Play 14일 완료 후): `4acb387`+`4781f8f`를 묶어 Chrome 0.2.0 zip(사용자 업로드), iOS v1.1(ship 스킬), Play v0.2.0(versionCode 2, bundleRelease→Console 업로드).
5. 실기기 검증: 폰에서 opt-in 링크로 설치→YouTube 재생→`adb logcat -s SoundFx`에서 `broadcast session=` 확인. session 0 폴백 동작이 최대 리스크 (이전 세션부터 미확인).

## Open questions / risks
- YouTube 앱 세션 브로드캐스트 실기기 미검증 (최대 리스크, 이전 세션부터 이어짐).
- `POST_NOTIFICATIONS` 런타임 요청 없음 — Android 13+에서 권한 거부 시 FGS 알림이 안 보이고 앱 내 서비스 중지 수단도 없음 (버그 헌팅에서 발견, Play 정책 리스크로 기록만 하고 수정 보류 — 설문 재작업 회피).
- 공개된 Chrome 빌드는 수정 전 코드 — 사용자 리뷰에 구버전 버그가 보고될 수 있음. 다음 사이클까지 감수하기로 함.
- iPad 스크린샷 레터박스 — iOS 심사 지적 가능성 (기존 리스크 유지).
- Play "1 tester opted-in"이 누구인지 미확인 (lee.donghan 본인일 가능성).
