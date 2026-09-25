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
```

안드로이드 셸은 `android/` 입니다. 앱 화면은 `index.html` 그대로이고 `assets/` 는 git 에 없습니다 —
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

## 4. 확인

```
node -e "…"   <script> 안을 뽑아 node --check
python3 -m http.server + Playwright 로 390px 에서 기록 저장·다시 시작 흐름을 실제로 눌러 봄
```

색 대비를 바꿨으면 WCAG 상대휘도로 계산해 수치를 남기세요. 눈대중 금지.
재발(lapse)을 실패로 다루는 문구를 쓰지 마세요 — 대부분의 금연은 여러 번의 시도 끝에 성공합니다.
