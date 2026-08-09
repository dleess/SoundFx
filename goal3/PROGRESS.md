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
