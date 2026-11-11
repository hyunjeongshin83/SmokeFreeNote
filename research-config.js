/* 연구용 Drive 저장 — 설정 (기본값: 꺼짐)
 *
 * 이 파일의 값이 바뀌기 전에는 이 앱에서 기록이 기기 밖으로 나가지 않습니다.
 * 켜려면 아래 네 가지가 모두 채워져야 합니다. 하나라도 비어 있으면 화면에 「연구 참여」 칸이 아예 보이지 않습니다.
 *
 *   enabled         true 로 바꿉니다 (IRB 승인 뒤에, 교수님 확인 후)
 *   clientId        Google Cloud 콘솔의 OAuth 클라이언트 ID (웹 애플리케이션). 비밀값이 아닙니다.
 *                   권한은 drive.file 하나 — 이 앱이 만든 파일만 읽고 씁니다. docs/RESEARCH-EXPORT.md 에 만드는 순서가 있습니다.
 *   labUrl          (선택) 연구실 자료 표로 보내는 Google Apps Script 웹앱 주소 (https://script.google.com/macros/s/…/exec). 있으면 참여자 Google 로그인 없이
 *                   연구실로 보내므로 clientId 는 필요 없습니다. 만드는 법: docs/RESEARCH-LAB.md. 이 주소는 공개되는 값입니다(열쇠 아님).
 *   consentVersion  동의 문구의 버전 이름 (예: "2026-11-ver1") — 참여자가 동의한 문구를 나중에 가려내는 데 씁니다
 *   consentText     IRB 가 승인한 동의 문구 전문. 이 저장소에는 아직 없습니다 — 지어내지 마세요.
 *
 * 열쇠·비밀번호는 여기에 넣지 않습니다 (clientId 는 공개되는 값이라 넣어도 됩니다).
 */
window.SF_RESEARCH_CONFIG = {
  enabled: false,
  clientId: "",
  labUrl: "",
  consentVersion: "",
  consentText: "",
  irb: ""
};
