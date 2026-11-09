# 이 저장소에서 일할 때

금연노트 — 숙명여대 약학대학 방준석 교수님 연구실. 고령친화 금연 도우미 PWA (정적 파일 · 빌드 없음).
백신노트 · 메디노트와 한 팀이 만든 것처럼 보여야 합니다.

## 1. 문서

```
docs/DESIGN.md       정한 것 (기록 모델 · 알림 · 데이터). 여기 없는 것은 아직 안 정한 것
docs/DATA-MODEL.md   기록·알림의 근거 (사실·출처만)
docs/COMPETITORS.md  경쟁 앱과 무작위 시험 (사실·출처만)
docs/DEVICES.md      기기로 흡연을 잴 수 있나 (사실·출처만)
docs/NATIVE.md       네이티브 앱 4단계 계획 (1·2단계는 android/ 에 있음)
docs/experiments/ecig-sensing/  전자담배 센서 자동 수집 시뮬레이션 (제안 · 가정 포함 · 앱에 반영 안 됨)
docs/PUFF-LINK.md    퍼프 연동 뼈대 (labs/puff-link/ · 가짜 기기만 · 앱 본체에 연결 안 됨)
```

화면은 둘입니다 (MediNote 와 같은 구조): **`SmokeFree_app.html`** 이 앱 본체(웹앱 · 모바일 · 안드로이드 앱이 모두 이것)이고, `index.html` 은 휴대폰에서는 앱으로 바로 넘기고
컴퓨터에서는 「웹앱 | 모바일 앱」을 나란히 보여 주는 안내 화면입니다. 화면을 고칠 곳은 `SmokeFree_app.html` 한 곳입니다.
안드로이드 셸은 `android/` 입니다. 앱 화면은 `SmokeFree_app.html` 그대로이고 `assets/` 는 git 에 없습니다 —
빌드 직전에 `python3 tools/build-packaged-app.py` 가 복사합니다. APK 는 Actions → 「안드로이드 APK」 → Artifacts.
이 작업 환경에서는 Gradle 을 못 돌립니다. 코틀린을 고쳤으면 PR 의 Actions 결과를 보고 빨간 것을 고치세요.

리서치 이슈는 `hyunjeongshin83/VaccineNote-Park` 의 `[리서치][금연앱]` 에 쌓입니다 (2026-09-25 기준).
그 이슈의 `fix` 칸을 고치면 `상태:` 를 `반영됨 · <이 저장소 커밋>` 으로 바꿉니다.

## 2. 결정 규칙 (대표님 · 2026-09-25)

설계 항목은 **근거가 가리키는 안을 택해 바로 반영**합니다 (`docs/DESIGN.md` 0절).
확인 없이 바꾸지 않는 것은 셋뿐입니다.

```
· 손님이 보는 문구·디자인의 큰 변경
· 건강 데이터가 기기 밖으로 나가는 것 (지금은 localStorage 뿐)
· 돈이 드는 것 (푸시 서버 · 유료 서비스)
```

## 3. 데이터

모든 기록은 이 기기의 `localStorage` (`smokefree.v1`) 에만 있습니다. 위치를 수집하지 않습니다.

저장 키 이름을 바꾸거나 옛 기록이 못 읽히게 하지 마세요 — 형식은 `docs/DESIGN.md` 2절.

**예외 — 연구용 Drive 저장 (`research.js` · `research-config.js`).** 코드는 있지만 `enabled:false` 가 기본값이라 설정이 채워지기 전에는
기록이 기기 밖으로 나가지 않고 화면에도 보이지 않습니다. 켜려면 IRB 동의 문구 · OAuth 클라이언트 ID · 교수님 확인이 먼저입니다 — `docs/RESEARCH-EXPORT.md`.
켜져도 참여자가 동의 화면에서 직접 켜야 하고, 기록은 **참여자 본인의 Google Drive** 한 곳에만 올라갑니다 (연구실 서버로 가지 않음).


## 4. 확인

```
node -e "…"   <script> 안을 뽑아 node --check
python3 -m http.server + Playwright 로 390px 에서 기록 저장·다시 시작 흐름을 실제로 눌러 봄
```

색 대비를 바꿨으면 WCAG 상대휘도로 계산해 수치를 남기세요. 눈대중 금지.
재발(lapse)을 실패로 다루는 문구를 쓰지 마세요 — 대부분의 금연은 여러 번의 시도 끝에 성공합니다.
