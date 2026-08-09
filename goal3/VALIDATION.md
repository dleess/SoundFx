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
| Kotlin 프로젝트 스캐폴드 + 빌드 | assembleDebug | 대기 |
| 세션 브로드캐스트 수신 + DynamicsProcessing attach | 단위 테스트 + logcat (수동 2) | 대기 |
| session 0 글로벌 폴백 | 단위 테스트 + logcat | 대기 |
| UI 조절(온오프·타깃·컴프·EQ) + 영속화 | 수동 3~4 | 대기 |
| 에뮬레이터 E2E: on/off 측정 차이 | 수동 3 + 측정 로그 | 대기 |
| 포그라운드 서비스 상주 | 수동 1 | 대기 |

## 완료로 보지 않는 조건

- 필수 검증 중 하나라도 실패
- PLAN.md 밖의 scope로 변경됨 (Play 배포, extension//safari/ 수정)
- 수동 재현이 여전히 실패함
- 검증을 통과시키기 위해 테스트가 삭제·skip됨
- 진단 없이 에러가 침묵 처리됨
- 이펙트 on/off 간 측정 차이가 확인되지 않음
- 기능 토글이 켜졌으나 내부 이펙트가 연결되지 않음
