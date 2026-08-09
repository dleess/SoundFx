# PLAN — sound 3단계 (Android 앱)

## 목표

다른 앱(YouTube 등)의 오디오 세션에 `DynamicsProcessing` 이펙트를 붙여 볼륨을 정규화하는 Android 앱(Kotlin)을 만들고 에뮬레이터에서 검증한다. Wavelet과 같은 방식. Play 스토어 배포와 실기기 YouTube 검증은 이 골에 포함하지 않는다.

## 참조 문서

- PRD: /Users/donghanlee/work/projects/sound/plan.md (3단계 섹션)
- VALIDATION.md
- RECOVERY.md
- 참고 기준선: extension/ (설정 개념 패리티 — enabled/target/comp/eq)

## 마일스톤 1: 프로젝트 스캐폴드 + 빌드

- 범위(Scope): `android/` 폴더에 Kotlin 앱 프로젝트(단일 모듈, minSdk 29/Android 10+, Gradle wrapper 포함). 빈 MainActivity + 기본 매니페스트.
- 완료 조건: `./gradlew assembleDebug` 통과.
- 검증: assembleDebug.

## 마일스톤 2: 오디오 이펙트 코어

- 범위(Scope): (1) `ACTION_OPEN/CLOSE_AUDIO_EFFECT_CONTROL_SESSION` 브로드캐스트 리시버로 세션 ID 수집, (2) 세션별 `DynamicsProcessing`(멀티밴드 컴프레서+리미터, EQ) attach/detach 관리, (3) 세션이 없을 때 글로벌 믹스(session 0) 폴백, (4) 포그라운드 서비스 상주, (5) 설정→DynamicsProcessing 파라미터 매핑을 순수 Kotlin 로직으로 분리 + JVM 단위 테스트, (6) 자체 검증용 내장 톤 플레이어(조용한/시끄러운 톤 2종, MediaPlayer + 자기 세션 브로드캐스트) — 에뮬레이터 E2E의 근거.
- 완료 조건: 단위 테스트 통과 + 서비스가 세션에 이펙트를 attach하는 로그 확인.
- 검증: `./gradlew test` + logcat.

## 마일스톤 3: UI + 설정 영속화

- 범위(Scope): 단일 화면 — 온/오프, 정규화 강도(타깃), 컴프레서 threshold/ratio/attack/release, EQ 3밴드 슬라이더, 활성 세션 목록 표시. DataStore로 영속화. 확장 팝업과 설정 개념 패리티 유지.
- 완료 조건: UI 조작이 이펙트 파라미터에 즉시 반영되고 재시작 후 유지.
- 검증: `./gradlew test` + 수동 확인 절차 3~4.

## 마일스톤 4: 에뮬레이터 E2E 검증

- 범위(Scope): AVD(test36) 부팅 → 설치 → 내장 톤 플레이어로 이펙트 on/off 차이를 자동 측정(앱 내 Visualizer 또는 재생 경로 measurement로 수치 출력) + UI 조작 + 스크린샷. 실기기 YouTube 앱 세션 브로드캐스트 검증은 차기 항목으로 문서화만.
- 완료 조건: on/off 간 측정 가능한 출력 차이 + 스크린샷 확보.
- 검증: 수동 확인 절차 1~5 + 측정 로그.

## 최종 완료 기준

- [ ] 모든 마일스톤 완료
- [ ] VALIDATION.md의 모든 검증 통과
- [ ] scope 위반 없음 (배포·실기기 필수화 없음)
- [ ] PROGRESS.md 업데이트
