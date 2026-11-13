// tools/qa-check.cjs 의 정적 서버 — 상대 경로 · 폴더 밖 · 이웃 폴더 · symlink · 잘못된 % 요청.  실행: node --test tests/qa-check-serve.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url);
const { serve, inside } = require("../tools/qa-check.cjs");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qacheck-"));
const app = path.join(tmp, "app"), sib = path.join(tmp, "app-secret");          // 이름이 앞부분만 같은 이웃 폴더
fs.mkdirSync(app); fs.mkdirSync(sib);
fs.writeFileSync(path.join(app, "a.html"), "APP");
fs.writeFileSync(path.join(sib, "s.html"), "SECRET");
fs.writeFileSync(path.join(tmp, "outside.txt"), "OUT");
fs.symlinkSync(path.join(tmp, "outside.txt"), path.join(app, "link.txt"));
const get = async (url, p) => { const r = await fetch(url + p); return [r.status, await r.text()]; };

test("폴더 경계: 앞부분만 같은 이웃은 밖이다", () => {
  assert.equal(inside(app, path.join(app, "a.html")), true);
  assert.equal(inside(app, path.join(sib, "s.html")), false);
  assert.equal(inside(app, path.join(app, "..", "outside.txt")), false);
});
test("상대 경로 폴더(./ 같은)도 파일을 준다", async () => {
  const cwd = process.cwd(); process.chdir(app);
  try { const s = await serve("./"); try { assert.deepEqual(await get(s.url, "/a.html"), [200, "APP"]); } finally { s.srv.close(); } } finally { process.chdir(cwd); }
});
test("폴더 밖 · 이웃 폴더 · symlink · 잘못된 % 는 파일을 주지 않고 서버가 죽지 않는다", async () => {
  const s = await serve(app);
  try {
    assert.equal((await get(s.url, "/..%2Fapp-secret%2Fs.html"))[0], 404);
    assert.equal((await get(s.url, "/link.txt"))[0], 404);          // 폴더 밖을 가리키는 symlink
    assert.equal((await get(s.url, "/%"))[0], 400);                // 잘못된 퍼센트 인코딩
    assert.deepEqual(await get(s.url, "/a.html"), [200, "APP"]);   // 그 뒤에도 서버가 산다
  } finally { s.srv.close(); }
});
