# 금연노트 — 네이티브 앱 계획 (대표님 2026-09-25 결정 · VaccineNote-Park#58 VN-58-3)

`DEVICES.md` 가 보여 준 대로 시계 동작 감지 · Health Connect · CO 측정기 연동은 웹앱으로는 안 됩니다.
그래서 **네이티브로 갑니다.** 단계는 넷이고, 1단계와 2단계는 이 저장소에 이미 들어 있습니다.

## 1단계 — 안드로이드 셸 (들어 있음)

```
android/                       Gradle 프로젝트 · MediNote_apps_0706/android 와 같은 판본
  app/src/main/java/kr/medit/smokefreenote/
    MainActivity.kt            WebView 셸. window.Native 다리
    HealthConnectManager.kt    걸음 · 심박 · 수면 읽기
tools/build-packaged-app.py    index.html 등을 assets/ 로 복사 (git 에는 안 넣음)
.github/workflows/android-build.yml   push · PR 마다 APK (Actions → Artifacts)
```

- 화면은 웹앱 그대로입니다. `file://` 이 아니라 `WebViewAssetLoader` 로 띄워 서비스워커·알림이 웹과 같게 돕니다.
- 빌드는 Actions 에서만 확인됩니다 (이 작업 환경에는 Android SDK 가 없습니다). 첫 실행이 빨갛게 뜨면 로그에서 무엇이 안 받아졌는지 봅니다.

## 2단계 — Health Connect 읽기 (들어 있음 · 화면에 연결됨)

- 읽는 것: 지난 24시간 걸음 · 지난 6시간 심박 · 지난 24시간 수면(분). **흡연 항목은 Health Connect 에 없습니다.**
- 쓰임: 도움 탭 「기기 연결」에 「건강 데이터 읽기」 단추. 값은 기록 탭 측정값(`measures[]`, kind `health`)으로 남고 통계에 보입니다.
- 동의: OS 권한 화면 + 「왜 읽는지」 화면(`ACTION_SHOW_PERMISSIONS_RATIONALE` · `VIEW_PERMISSION_USAGE`). 서버로 보내지 않습니다.
- 확인 못 한 것: 실기기. 권한 화면과 `connect-client 1.1.0-alpha07` 의 API 는 MediNote 와 같은 골격이라 Actions 빌드로 먼저 봅니다.

## 3단계 — Wear OS 시계 앱 (다음)

근거: StopWatch(https://doi.org/10.2196/56999) · Sense2Quit(https://doi.org/10.1007/s10461-025-04659-1). 둘 다 시계의 가속도·자이로로 「손을 입으로 가져가는 동작」을 잡습니다.

```
wear/  (새 Gradle 모듈)
  - 손목 IMU 50Hz 창(6초) → 간단한 규칙(손 올림 → 정지 2~4초 → 내림, 분당 2~6회 반복) 으로 후보
  - 후보가 나오면 시계에서 「지금 피우고 계신가요?」 한 번 묻고, 예/아니오만 폰으로 보냄 (Data Layer API)
  - 폰 앱은 그것을 episode 로 저장 — 사람이 확인한 것만 남깁니다 (오탐 대비)
  - 배터리: 감지는 기상 시간대만(조용한 시간엔 끔). StopWatch 가 배터리로 이탈이 났습니다
```

기계학습 모델은 2차. 1차는 규칙 + 사람 확인이면 충분하고, 이 데이터가 나중 모델의 학습 자료가 됩니다.

## 4단계 — iOS

Mac + Xcode 가 필요합니다. WKWebView 셸 + HealthKit(걸음 · 심박 · 수면) 은 MediNote 의 `ios/` 골격을 그대로 씁니다. 애플 워치 동작 감지는 watchOS 앱이 별도입니다.

## 정해야 할 것

- 3단계 착수 시점 — 안드로이드 APK 가 실기기에서 돌아간 뒤.
- 스토어 등록 여부 — 서명 키 · 개발자 계정(돈). 등록하면 「의료기기 해당여부」 문구 검토가 MediNote #15 와 같이 걸립니다.
