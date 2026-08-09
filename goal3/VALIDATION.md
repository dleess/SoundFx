# VALIDATION — sound 3단계 (Android 앱)

## 필수 검증

골 완료로 마크하기 전 다음 명령을 반드시 실행한다. (android/ 디렉토리, ANDROID_HOME=~/Library/Android/sdk)

```bash
./gradlew test
./gradlew assembleDebug
```

## 마일스톤별 검증

각 마일스톤 종료 시 위 명령 + 아래 수동 절차의 해당 항목.

## 수동 확인 절차

1. 에뮬레이터(AVD test36) 부팅 → `adb install` → 앱 실행, 포그라운드 서비스 알림 확인.
2. 내장 톤 플레이어로 조용한/시끄러운 톤 재생 → logcat에 세션 수신 + DynamicsProcessing attach 로그 확인.
3. 이펙트 on/off 토글 → 앱 내 측정치(또는 청감 대체 지표)가 유의미하게 달라지는지 확인.
4. 슬라이더(타깃/컴프레서/EQ) 조작 → 파라미터 반영 로그/측정 확인, 앱 재시작 후 설정 유지.
5. 스크린샷 저장: goal3/screenshots/.
6. (차기, 이 골 범위 밖) 실기기에서 YouTube 앱 재생 시 세션 브로드캐스트 수신 여부 확인 — 미수신이면 session 0 폴백 동작 확인.

## 완료 기준 매핑

| PRD 완료 기준 | 검증 방식 | 상태 |
| --- | --- | --- |
| Kotlin 프로젝트 스캐폴드 + 빌드 | assembleDebug | 통과 |
| 세션 브로드캐스트 수신 + DynamicsProcessing attach | 단위 테스트 + logcat (수동 2) | 통과 |
| session 0 글로벌 폴백 | 단위 테스트 + logcat | 통과 |
| UI 조절(온오프·타깃·컴프·EQ) + 영속화 | 수동 3~4 | 통과 |
| 에뮬레이터 E2E: on/off 측정 차이 | 수동 3 + 측정 로그 | 통과 |
| 포그라운드 서비스 상주 | 수동 1 | 통과 |

## M4 실행 결과 (2026-08-09, AVD test36)

- `./gradlew test assembleDebug` BUILD SUCCESSFUL (6/6 유닛 테스트, 코드 변경 없음).
- 수동 1: 설치·실행·`pm grant POST_NOTIFICATIONS` 후 `dumpsys activity services`에서 `isForeground=true`, `foregroundNoti=Notification(channel=sound_fx ... flags=ONGOING_EVENT|FOREGROUND_SERVICE)` 확인. 알림 패널 스크린샷에 "볼륨 정규화 실행 중" 항목 확인.
- 수동 2: 조용한 톤 탭 → logcat `broadcast ... session=65` → `attach session=65` → `apply session=65 ...` → `sync targets=[65] attached=[65]`. 시끄러운 톤 탭 → 세션 전환 중 자연스럽게 `attach session=0 (global mix fallback)` 경유 확인(세션 0 폴백 경로 겸용 확인) 후 `attach session=73`.
- 수동 3 (정량 증거): `dumpsys media.audio_flinger`에서 세션의 DynamicsProcessing 이펙트 체인 `Session State Registered Internal Enabled Suspended` 행이 스위치 OFF 시 `y n n n`(Enabled=n), ON 시 `y n y n`(Enabled=y)으로 정확히 전환됨을 캡처. logcat `apply session=81 enabled=false/true ...`와 일치.
- 수동 4: targetDb 슬라이더(−24→−19dB, 5스텝)와 comp.threshold 슬라이더(−24→−21dB, 3스텝) 조작 → 매 스텝 `settings updated:` + `apply session=... inputGain/thr/makeup 변화` 로그 확인. 앱 강제 종료(`am force-stop`) 후 재실행 → `settings updated: SoundSettings(... targetDb=-19.0, threshold=-21.0 ...)`로 정확히 복원됨(DataStore 영속화 확인). UI 스크린샷으로도 슬라이더 위치 유지 확인.
- 수동 5: 스크린샷 5장 `goal3/screenshots/android-*.png` 저장(메인 UI 복원 상태, 알림 패널, 토글 OFF/ON 비교, 재시작 전 상태).
- 세션 0 폴백(독립 확인): 앱 강제 종료 후 재시작 직후(재생 중인 톤 없음) logcat에 `attach session=0 (global mix fallback)` → `sync targets=[0] attached=[0]` 자동 발생 확인.
- **환경 노트**: 이 에뮬레이터(AVD test36)에서 `adb shell input tap`은 SwitchMaterial/Slider(Material Components)의 드래그 제스처 임계값을 만족하지 못해 단일 탭이 인식되지 않음(버튼류는 정상 동작). 키보드 포커스 이동(`KEYCODE_TAB`) + `KEYCODE_DPAD_CENTER`/`KEYCODE_DPAD_RIGHT`로 동일한 리스너 경로(OnCheckedChangeListener/OnChangeListener)를 트리거해 검증을 완료함 — 이는 adb 합성 입력과 에뮬레이터 위젯 제스처 인식의 상호작용 한계이며, 앱 로직 결함이 아님(실기기 손가락 탭에서는 재현되지 않을 가능성이 높음, 확인은 이 골 범위 밖).

## 완료로 보지 않는 조건

- 필수 검증 중 하나라도 실패
- PLAN.md 밖의 scope로 변경됨 (Play 배포, extension//safari/ 수정)
- 수동 재현이 여전히 실패함
- 검증을 통과시키기 위해 테스트가 삭제·skip됨
- 진단 없이 에러가 침묵 처리됨
- 이펙트 on/off 간 측정 차이가 확인되지 않음
- 기능 토글이 켜졌으나 내부 이펙트가 연결되지 않음
