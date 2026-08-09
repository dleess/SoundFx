# HANDOFF: SoundFx — 3-스토어 배포 진행: Chrome/iOS 심사 중, Play 내부 테스트 게시. 남은 것: 심사 대응 + Play 프로덕션 경로 + 실기기 검증

**Written:** 2026-08-09 · **Working dir:** `/Users/donghanlee/work/projects/SoundFx` · **Branch:** `main` (origin: github.com/dleess/SoundFx)

## Goal
YouTube 등에서 곡마다 다른 라우드니스를 자동 정규화하는 앱. 코드/검증은 이전 세션에서 완료. 이번 세션의 목표였던 스토어 배포는 제출 가능한 데까지 완료. 후속 done = (1) 3개 스토어 심사 통과·공개, (2) 실기기 YouTube 세션 브로드캐스트 검증.

## Status
- **Chrome 웹스토어**: 심사 제출됨. 계정 lee.donghan. zip은 `extension/`에서 manifest+JS+popup+icons만 패키징 (tests/package.json 제외).
- **App Store (iOS)**: v1.0 (build 1) `WAITING_FOR_REVIEW`. 앱 ID **6799607827**, bundle id `com.donghan.soundfx`(+`.Extension`), 스토어명 "SoundFx: Volume Normalizer" ("SoundFx" 단독은 선점됨). 통지: kbsi.bionmr@gmail.com.
- **Play 스토어**: 내부 테스트 트랙 Active, v0.1.0 (versionCode 1). 앱명 "SoundFx: Volume Normalizer", applicationId `com.donghan.soundfx`. 테스터: lee.donghan, kbsi.bionmr. **프로덕션 불가: 개인 계정 정책상 비공개 테스트(12+명, 14일) 후 프로덕션 액세스 신청 필요.**
- **Play 스토어 등록정보: 입력 완료·저장됨** (short/full description, 아이콘 512px, feature graphic 1024×500, 폰 스크린샷 4장 + 7"/10" 태블릿 각 2장).
- **Play 앱 설정 설문 11/11 전부 완료**: Privacy policy URL, Ads(없음), Sign in details(없음), 콘텐츠 등급(IARC 전연령), Target audience(18+), Data safety(수집 없음), Advertising ID(없음), Government/Financial/Health(전부 없음), Foreground service(SPECIAL_USE — 데모 영상 https://youtube.com/shorts/nvh1fQeZXvE + 사유 저장), 카테고리(Music & Audio), 연락처(lee.donghan@gmail.com).
- **심사 전송만 남음**: Publishing overview의 "Send app for review"가 설정 완료 직후에도 잠겨 있음 ("complete required steps in the app dashboard" — 대시보드엔 남은 작업 없음). Google 서버 상태 반영 지연으로 추정, 수 시간 뒤 버튼 활성화되면 클릭 1회로 끝. 그때도 잠겨 있으면 계정 수준 개발자 본인확인(Android developer verification) 요건 의심할 것.
- **macOS Safari 확장**: 미배포 (iOS만 제출됨).
- 커밋 메시지 전체 영어화(히스토리 재작성), README/PRIVACY.md 추가됨.

## What worked
- **App Store Connect API로 거의 전부 자동화 가능**: bundle id 등록, 프로파일 생성, 버전 메타데이터, 스크린샷 업로드(reserve→PUT→commit MD5), 연령등급, 가격(free는 local id `${price1}` 필요), 심사 제출(reviewSubmissions 플로우). 키: `~/.appstoreconnect/private_keys/AuthKey_CGV9U72GU7.p8`, Issuer `9c0e6248-43c6-405d-8c0b-943a8e02ec61`, 팀 `6536ULS8SC`. PyJWT venv 만들어 사용. **[still applied]**
- 서명: Xcode cloud signing 권한 없어도 API로 IOS_APP_STORE 프로파일 2개 만들어 수동 서명 export 가능 (ExportOptions.plist에 provisioningProfiles 명시). 배포 인증서는 키체인에 있음 (팀 6536ULS8SC). **[still applied]**
- 심사 연락처는 기존 앱 MolViewApp 것 재사용 (+82 10-58739884, kbsi.bionmr). **[still applied]**
- Play Console·App Store Connect 웹은 Claude in Chrome 자동화 가능. AAB 업로드는 숨은 file input에 file_upload로 직접 주입. **[still applied]**
- **Play Console 그래픽 자산 업로드의 정석 플로우**: (1) 대상 슬롯의 "Add assets" 클릭 → 슬롯이 파랗게 활성화되고 우측 자산 패널이 그 슬롯에 바인딩됨. (2) 신규 파일은 패널의 숨은 `input[type=file]`에 file_upload — 업로드 직후엔 자동 선택돼 있어 바로 "Add" 버튼(패널 우하단)으로 슬롯에 들어감. (3) **기존 자산 재사용은 체크박스가 아니라**: 썸네일 hover → 우측에 나타나는 → 아이콘 클릭 → 상세 보기의 "Add" 버튼. 슬롯당 자산 1개씩 back(<)으로 돌아가며 반복. **[still applied]**
- 스토어 자산 규격 변환은 전부 sips로 해결: 아이콘 512², feature graphic은 아이콘 400²를 1024×500 흰 배경 패딩, 폰/태블릿 스크린샷은 1080×2400을 1350×2400(9:16) 흰 패딩. **[still applied]**
- Play 설문의 material-radio는 JS `r.click()`이 정상 동작 — 단 **검증은 wrapper class가 아니라 내부 `input`의 `aria-checked`로** 할 것 (wrapper엔 checked class가 안 붙어 성공을 실패로 오판하기 쉬움). Yes/No 일괄 선택: `document.querySelectorAll('material-radio')` 필터 후 click. **[still applied]**
- 설문 지름길: Target audience에서 18+만 선택하면 App details/Ads/Store presence 단계가 통째로 스킵되고, Data safety 첫 질문 "수집하나?"에 No면 나머지 단계 전부 스킵됨.
- FGS 데모 영상 제작 파이프라인: 에뮬레이터 `adb shell screenrecord --time-limit 55` 백그라운드 + 토글(TAB→DPAD_CENTER)·알림(`cmd statusbar expand-notifications`)·버튼 tap 시나리오 → pull → 사용자가 YouTube unlisted 업로드. 원본 `~/Desktop/soundfx-fgs-demo.mp4`. **[still applied]**

## What didn't work
- **Chrome 웹스토어 대시보드는 확장 자동화 원천 차단** ("The extensions gallery cannot be scripted") — 파일을 Desktop에 준비해 주고 사용자가 직접 업로드해야 함. 재시도 금지.
- ASC `appDataUsages` API 폐지됨 — 개인정보 신고("Data Not Collected")는 웹 UI로만. 이미 게시 완료라 재작업 불필요.
- Safari 확장 manifest description 112자 제한 (altool 90849) — 현재 110자로 맞춰져 있음. 늘리지 말 것.
- `ageRatingDeclarations`는 appStoreVersions가 아닌 **appInfos** 경유, enum 13개+boolean 10개(ageAssurance 포함) 혼재 — 전 필드 한 번에 PATCH해야 함.
- keytool 등 JDK 도구는 JAVA_HOME 없이 침묵 실패 — `export JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home ANDROID_HOME=$HOME/Library/Android/sdk` 필수 (기존 함정 재확인).
- **Play Console 자산 패널에서 좌표 클릭으로 체크박스 선택 시도 — 전부 무효** (4회 반복 실패). find가 "checkbox"라고 보고해도 클릭이 선택으로 등록되지 않음. 위의 hover→→→Add 플로우만 신뢰할 것. 재시도 금지.
- 자산 패널이 열린 상태에서 stale ref 클릭 → 엉뚱한 "Manage translations" 드롭다운이 열림. 패널 열림/닫힘 후에는 ref가 무효화되므로 **매 단계 find로 ref를 다시 얻거나 스크린샷으로 좌표 확인 후 클릭**할 것.
- `build.gradle.kts`의 `android{}` 블록 안에서 `java.util.Properties` 직접 참조 — Kotlin DSL이 `java`를 다른 심볼로 해석해 컴파일 실패. 파일 최상단 `import java.util.Properties` + 톱레벨 val로 해결(현재 코드가 그 형태).
- Play Console 다이얼로그에서 form_input으로 값만 넣고 저장 버튼을 좌표로 잘못 클릭 → "Discard changes?" 유발, 입력 소실 (연락처 이메일 재작업). 다이얼로그의 저장 버튼은 **find로 ref를 얻어 클릭**하고, 저장 확인 토스트/재로드 검증까지 할 것.
- 설문 페이지의 form_input 값은 저장 전 페이지 이동 시 소실됨 — FGS 설명 텍스트도 한 번 재입력했음. 입력→즉시 저장 순서 엄수.

## Key files & commands
- **`~/keystores/soundfx-upload.jks`** — Play 업로드 키 (repo 밖!). 비밀번호는 같은 폴더 `soundfx-upload-credentials.txt` + `android/local.properties`의 `RELEASE_*` 3개 (gitignore라 새 클론엔 없음 — credentials.txt에서 복원). **분실 시 Play 업데이트 불가.**
- Play 빌드: `cd android && ./gradlew test bundleRelease` → `app/build/outputs/bundle/release/app-release.aab`.
- iOS 빌드: `xcodebuild archive -project safari/SoundFx/SoundFx.xcodeproj -scheme "SoundFx (iOS)" ...` + `build/ExportOptions.plist`(수동 서명, 프로파일명 "SoundFx App Store"/"SoundFx Extension App Store"). 다음 릴리스는 ship 스킬 절차로 버전 bump.
- Chrome zip 재생성: `cd extension && zip -r SoundFx-<ver>.zip manifest.json *.js popup.html icons` (tests 제외).
- 스토어 자산: 아이콘 `extension/icons/icon128.png`, iPhone 6.7" 스크린샷은 `goal2/screenshots/` 1206×2622를 1290×2796로 리사이즈해 사용했음. iPad는 레터박스 버전 (심사 지적 시 실캡처 필요).
- PRIVACY.md — 스토어 공용 개인정보 정책 URL: `https://github.com/dleess/SoundFx/blob/main/PRIVACY.md`.

## Next steps
1. **Chrome/iOS 심사 결과 대응** (각 며칠). 리젝 시 이 문서의 제출 파이프라인 재사용.
2. **Play 심사 전송**: Publishing overview에서 "Send app for review" 활성화 확인 후 클릭 (설문·등록정보는 전부 큐에 있음). 전송해야 임시 앱명("com.donghan.soundfx (unreviewed)")이 정식 명칭으로 바뀜.
3. **Play 프로덕션 경로**: 테스터 12명 모아 비공개 테스트 14일 → 대시보드에서 프로덕션 액세스 신청.
4. **실기기 검증**: 폰에서 Play Console → Internal testing → Testers 탭 opt-in 링크로 설치 → YouTube 재생 → `adb logcat -s SoundFx`에서 `broadcast session=` 확인. session 0 폴백 동작 여부가 핵심 리스크.
5. (선택) macOS Safari 확장 App Store 제출, Firefox AMO 제출.

## Open questions / risks
- YouTube 앱 세션 브로드캐스트 실기기 미확인 (이전 세션부터 이어지는 최대 리스크).
- iPad 스크린샷이 레터박스라 App Store 심사에서 지적 가능 — 그 경우 iPad 시뮬레이터 실캡처로 교체.
- Play 앱명이 설문 미완으로 임시 표시 중 ("com.donghan.soundfx (unreviewed)").
- Chrome 확장은 `<all_urls>`라 심사 장기화 가능성 고지받음 — 정상.
