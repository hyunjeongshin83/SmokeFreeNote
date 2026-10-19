# 건강검진 QR 가져오기 시안 (HQ1)

**앱에 넣지 않은 시안**입니다. 설명과 확인 결과는 [`docs/HEALTH-IMPORT.md`](../../docs/HEALTH-IMPORT.md).

- `hq.mjs` — 인코딩 · 해석 · 검증 · 기록 변환 (브라우저·Node 22 공통, 의존 없음)
- `run.mjs` — 크기 · 되읽기 · 악의적 입력 · SHC 시험 (38개)

```
mkdir /tmp/hq && cd /tmp/hq && cp <저장소>/labs/health-qr/*.mjs . && npm init -y && npm i qrcode@1.5.4 jsqr@1.4.0 pngjs@7.0.0
node run.mjs      # 통과 38 · 실패 0
```

시험에 쓴 값은 모두 가상입니다 (실제 환자 자료 아님). 시험용 코드값(`loinc.org` 아래 숫자)은 크기를 재려는 자리 표시이며 실제 LOINC 코드가 아닙니다.
