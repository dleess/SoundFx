# 볼륨 정규화 앱 설계 (가칭 "sound")

날짜: 2026-08-09
상태: 1·2단계 완료 (Chrome/Firefox 확장 + Safari macOS/iOS 포팅) — 3단계 Android 대기

## 문제

YouTube 등에서 노래/영상마다 라우드니스가 달라 볼륨을 계속 손대야 한다. YouTube의 "stable volume"도 일부 콘텐츠에는 적용되지 않는다. 어디서 듣든 볼륨을 자동 정규화하고, 이퀄라이저급 세밀 조절도 가능한 앱을 만든다.

## 플랫폼 제약 (설계를 결정한 사실)

| 플랫폼 | 다른 앱/페이지 오디오 접근 | 접근 방법 |
|---|---|---|
| 데스크톱 브라우저 | 가능 | Web Audio API (콘텐츠 스크립트) |
| Android | 가능 | AudioEffect(DynamicsProcessing)를 오디오 세션에 attach |
| iOS | **불가** (샌드박스) | Safari 웹 확장으로 youtube.com 등 웹만 처리. YouTube 네이티브 앱은 어떤 방법으로도 불가 |

## 결정 사항

- 적용 범위: **모든 사이트**의 `<video>`/`<audio>` (YouTube 전용 아님)
- 동작 방식: 자동 라우드니스 정규화 + **이퀄라이저급 세밀 조절** (컴프레서 파라미터, EQ, 사이트별 프리셋)
- 진행 순서: **브라우저 확장 → Safari 포팅 → Android 앱**

## 1단계 — 브라우저 확장 (Chrome/Firefox/Edge, Manifest V3)

프레임워크 없이 vanilla JS, 파일 4~5개.

- **콘텐츠 스크립트**: `play` 이벤트 캡처 + MutationObserver로 페이지의 모든 `<video>`/`<audio>` 감지 → Web Audio 체인 연결
- **오디오 체인**: `MediaElementSource → EQ(BiquadFilter 밴드) → DynamicsCompressor → Gain(자동 메이크업) → destination`
- **자동 정규화**: AudioWorklet에서 실시간 라우드니스(RMS 기반 간이 LUFS) 측정 → 타깃 라우드니스로 게인 자동 추종
- **팝업 UI**: 온/오프, 타깃 라우드니스, 컴프레서 파라미터(threshold/ratio/attack/release), EQ 슬라이더, 사이트별 프리셋
- **저장**: `storage.sync` (사이트별 설정, 기기 간 동기화)
- **리스크 + 안전장치**: cross-origin 미디어는 Web Audio에 연결 시 무음이 됨(CORS taint). YouTube는 MSE 기반이라 안전. 무음 감지 시 자동으로 원본 재생으로 복귀하는 바이패스 필수.

## 2단계 — Safari 포팅 (macOS + iPhone)

- `safari-web-extension-converter`로 1단계 코드를 Xcode 프로젝트로 래핑 (코드 ~90% 공유)
- App Store 배포 — 기존 `ship` 스킬 절차 재활용
- iPhone에서는 Safari로 웹을 볼 때만 동작 (iOS 한계)

## 3단계 — Android 앱 (별도 코드베이스, Kotlin)

- 포그라운드 서비스 상주 → `ACTION_OPEN_AUDIO_EFFECT_CONTROL_SESSION` 브로드캐스트로 미디어 앱의 오디오 세션 ID 수신 → 해당 세션에 `DynamicsProcessing`(컴프레서+EQ+리미터 내장, Android 9+) attach. Wavelet과 동일 방식.
- **리스크**: YouTube 앱이 세션 ID를 브로드캐스트하지 않으면 글로벌 출력 믹스(session 0) attach가 차선책 — 기기별 편차 있음. 3단계 착수 시 본인 기기에서 먼저 검증.

## 만들지 않는 것 (YAGNI)

- 서버/계정/백엔드 — 로컬 + `storage.sync`로 충분
- iOS에서 YouTube 네이티브 앱 보정 — 기술적으로 불가
- 데스크톱 시스템 전역 오디오 앱 — 브라우저 확장이 실사용 커버
