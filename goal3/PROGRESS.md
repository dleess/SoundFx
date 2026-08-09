## 골 검토 요약 (Step 8 자동 생성)

- 목표: DynamicsProcessing 기반 Android 볼륨 정규화 앱(Kotlin), 에뮬레이터 검증까지 (배포·실기기 제외)
- 마일스톤: 스캐폴드+빌드 / 이펙트 코어 / UI+영속화 / 에뮬레이터 E2E
- 필수 검증: ./gradlew test + assembleDebug + 에뮬레이터 수동
- scope 잠금: Play 배포·실기기 필수화·extension//safari/ 수정 금지

---


## 골 시작 기록
- 시작 시각: 2026-08-09T04:14:36Z
- 사용 CLI: claude_code
- 컴팩트 후 본문 길이: 518자

---

## 마일스톤 1 완료 — 프로젝트 스캐폴드 + 빌드 (2026-08-09)

- `android/` Kotlin 단일 모듈 앱 생성. applicationId `com.donghan.sound`, minSdk 29, compileSdk/targetSdk 36(로컬 SDK에 설치된 최신 플랫폼).
- 버전 조합: Gradle 9.6.1 (`/opt/homebrew/bin/gradle`로 wrapper 생성 후 `./gradlew`로 통일) / AGP 9.3.1 / Kotlin 2.3.21.
  - AGP 9.0부터 Kotlin이 내장(built-in)되어 `org.jetbrains.kotlin.android` 플러그인은 적용하지 않음(적용 시 에러). `kotlinOptions{}` DSL도 제거, `compileOptions`(Java 17)만 사용.
  - androidx.core/core-ktx는 1.19.0이 compileSdk 37을 요구(로컬 SDK엔 34/35/36만 설치)해 1.17.0으로 고정. appcompat 1.7.1, material 1.14.0.
- 파일 경계(M2/M3용):
  - `app/src/main/java/com/donghan/sound/MainActivity.kt` — 빈 화면(FrameLayout+TextView placeholder), "M3: UI" 주석.
  - `app/src/main/java/com/donghan/sound/audio/AudioEffectCore.kt` — 패키지만 존재, "M2: 이펙트 코어" 주석.
  - `app/src/main/java/com/donghan/sound/settings/SoundSettings.kt` — 데이터 클래스(enabled/targetDb/comp{threshold,ratio,attack,release}/eq{low,mid,high}), extension/settings-logic.js의 DEFAULT_SETTINGS와 개념적 패리티.
  - `app/src/test/java/com/donghan/sound/settings/SoundSettingsTest.kt` — 기본값 스모크 테스트 1개.
  - 매니페스트에 권한 없음(M2에서 최소 권한 추가 예정).
- 검증: `./gradlew clean test assembleDebug` 통과 (41 tasks, BUILD SUCCESSFUL). 테스트 1건 통과, `app/build/outputs/apk/debug/app-debug.apk` 생성 확인.
- **환경 노트(다음 마일스톤 필독)**: 이 macOS 환경엔 PATH상의 기본 `java`가 없어(스텁만 존재) `./gradlew` 실행 전 반드시 `export JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home` 필요. `android/gradle.properties`에 `org.gradle.java.home`도 같은 경로로 고정해둠(데몬용 안전장치, 부트스트랩 자체는 env var 필요).
- scope: Play 배포·서명, extension/·safari/ 수정 없음. RECORD_AUDIO 등 과잉 권한 없음(권한 자체를 아직 추가 안 함).

## 마일스톤 2 완료 — 오디오 이펙트 코어 (2026-08-09)

- `app/src/main/java/com/donghan/sound/audio/` 5개 파일 (M1의 빈 `AudioEffectCore.kt` 플레이스홀더는 대체·삭제):
  - `EffectParams.kt` — SoundSettings → DynamicsProcessing 파라미터 매핑(순수 Kotlin, Android API 의존 없음). 밴드 컷오프 300/3000/20000Hz 3밴드, preEq(사용자 EQ) → MBC(3밴드 컴프+밴드별 메이크업 postGain) → 리미터. postEq는 inUse=false(확장 체인에 대응물 없음). 입력 게인 = clamp(targetDb − (−20), ±12dB), 메이크업 = clamp((targetDb − threshold)×(1 − 1/ratio), 0..12dB). attack/release는 초→ms. 클램프 범위는 extension/settings-logic.js RANGES와 동일(설정이 인텐트 extra로 들어오는 신뢰 경계).
  - `SessionRegistry.kt` — 세션 ID 상태 머신(순수 Kotlin). `open/close/active/targets/clear`. sessionId ≤ 0은 무효로 무시(0은 글로벌 믹스 예약, 음수는 AudioEffect 에러 코드). `targets()`가 비면 `[0]`을 돌려주는 것이 session 0 폴백 지점 — 폴백 정책이 한 곳에만 있다.
  - `EffectEngine.kt` — 세션별 `DynamicsProcessing` attach/detach/파라미터 적용. attach·detach·apply 실패는 전부 catch 후 로그만(글로벌 믹스 attach를 거부하는 기기에서도 크래시 없음). 모든 경로에 `SoundFx` 태그 로그 — M4 E2E의 검증 근거.
  - `SoundService.kt` — 포그라운드 서비스. `ACTION_OPEN/CLOSE_AUDIO_EFFECT_CONTROL_SESSION` 리시버 동적 등록(RECEIVER_EXPORTED), 변경 시 이펙트 재동기화. M3용 공개 API: `start(context)`, `stop(context)`, `updateSettings(context, SoundSettings)`, `ACTION_UPDATE_SETTINGS`, `ACTION_SESSIONS_CHANGED` + `EXTRA_SESSIONS`/`EXTRA_ATTACHED`. SoundSettings는 읽기 전용 계약이라 Serializable을 붙이지 않고 필드를 개별 extra로 전달.
  - `TestTonePlayer.kt` — 검증용 톤 플레이어. `playQuiet()`(−30dBFS) / `playLoud()`(−6dBFS) / `stop()` / `sessionId()`. 441Hz(44100의 약수 → 루프 이음매 무클릭) 1초 사인파를 AudioTrack MODE_STATIC 무한 루프로 재생하고 자기 세션에 표준 이펙트 브로드캐스트 송신.
- 서비스 타입은 **specialUse** — 이 앱은 재생하지 않고 남의 세션에 이펙트만 붙이므로 mediaPlayback이 아니다. 매니페스트 권한은 MODIFY_AUDIO_SETTINGS / FOREGROUND_SERVICE / FOREGROUND_SERVICE_SPECIAL_USE / POST_NOTIFICATIONS 4개뿐(RECORD_AUDIO 없음).
- 테스트: `app/src/test/java/com/donghan/sound/audio/` 16건(EffectParams 8 + SessionRegistry 8) — 밴드 구성, 초→ms 변환, EQ 순서 매핑, 클램프, 입력 게인/메이크업 경계, 폴백·중복·순서 상태 머신.
- 검증: `./gradlew test assembleDebug` BUILD SUCCESSFUL, 단위 테스트 17건 전부 통과(M1 1건 포함).
- **환경 노트**: `JAVA_HOME` 외에 `export ANDROID_HOME=$HOME/Library/Android/sdk`도 필요하다. `android/local.properties`가 gitignore라 새 워크트리·클론에는 SDK 경로가 없다.
- scope: settings/·MainActivity·extension/·safari/ 미수정, Play 배포 없음.

---

## 마일스톤 3 완료 — UI + 설정 영속화 (2026-08-09, worktree 병렬 작업)

- `MainActivity.kt`를 Views 기반(Compose 미사용) 단일 화면으로 구현: SwitchMaterial(온/오프) + targetDb Slider + 컴프레서 4슬라이더(threshold/ratio/attack/release) + EQ 3슬라이더(low/mid/high) + 테스트 톤 버튼 2개(조용한/시끄러운) + 서비스 상태 TextView. `activity_main.xml`을 ScrollView+LinearLayout으로 전면 교체, 라벨/문자열은 `strings.xml`에 추가(Korean, popup.html과 패리티). `themes.xml`은 `Theme.MaterialComponents.DayNight.NoActionBar`로 변경(Material Slider/Switch가 AppCompat 테마에서 런타임 예외를 던지므로 필수).
- 수동 저장 버튼 없음 — 슬라이더/스위치 값 변경 시(`fromUser`) 즉시 `SettingsRepository.save()` + `SoundService.updateSettings()` 호출. 앱 시작 시 `settingsFlow.first()`로 1회 로드해 UI에 반영하고 `SoundService.start()` + `updateSettings()` 호출.
- `settings/SettingsRepository.kt` 신설: `androidx.datastore:datastore-preferences:1.1.1` 사용. 직렬화/기본값/클램프 로직을 `SettingsCodec`(object, DataStore/Context 비의존 순수 함수)으로 분리 — `clamp()`가 슬라이더 range(targetDb -60..0, comp.threshold -100..0, ratio 1..20, attack/release 0..1, eq -24..24, popup.html min/max와 동일)로 값을 강제하고 `write()`/`read()`가 이를 사용. `SoundSettings.kt`는 수정하지 않음.
  - **API 함정 기록**: `androidx.datastore.preferences.core.PreferencesKeys`(object)와 `PreferencesFactory`는 Kotlin에서 `internal`이라 외부 모듈에서 unresolved reference 남(javap 상 public bytecode라도 Kotlin 컴파일러가 kotlin_module 메타데이터로 모듈 경계를 강제). 실제 공개 API는 최상위 함수 `booleanPreferencesKey()`/`floatPreferencesKey()`/`mutablePreferencesOf()` — 문서 기억과 일치. 다음에 DataStore 쓸 때 바로 이 이름 사용할 것.
- 이펙트 코어 공개 계약(M2가 병렬 작업 중)에 대한 임시 스텁 `audio/ServiceStub.kt` 추가 — `SoundService.start/stop/updateSettings(context, settings)`, `TestTonePlayer.playQuiet/playLoud(context)`. 파일 상단에 "MERGE: M2의 실제 SoundService/TestTonePlayer로 교체" 주석. **머지 시 이 파일을 삭제**하고 M2가 만든 실제 구현으로 교체할 것. `audio/AudioEffectCore.kt`(M2 소유)는 건드리지 않음.
- `app/build.gradle.kts`에 `androidx.datastore:datastore-preferences:1.1.1`, `androidx.lifecycle:lifecycle-runtime-ktx:2.8.7` 추가(lifecycleScope용). 그 외 dependency 변경 없음.
- 단위 테스트: `settings/SettingsCodecTest.kt` 5케이스(클램프 통과값 무변경/타깃·컴프레서 clamp/EQ clamp/write-read round-trip/빈 preferences 기본값) — DataStore 자체가 아니라 `SettingsCodec` 순수 매핑 로직만 검증. `datastore-preferences-core`가 순수 JVM 아티팩트라 Robolectric 없이 plain JUnit으로 동작. 기존 `SoundSettingsTest`(1건)와 합쳐 총 6건 전부 통과.
- 로컬 SDK 경로가 잡혀 있지 않아 `android/local.properties`(`sdk.dir=...`, gitignore 대상, 커밋 안 됨) 생성 후 검증 진행.
- 검증: `./gradlew test assembleDebug` BUILD SUCCESSFUL, 42 tasks. 테스트 6/6 통과(`app/build/test-results/testDebugUnitTest/TEST-*.xml`).
- scope: `AndroidManifest.xml`, `SoundSettings.kt`, `audio/` 내 다른 파일, `extension/`·`safari/`·`goal*/` 미수정. 과잉 권한 요구 없음.
