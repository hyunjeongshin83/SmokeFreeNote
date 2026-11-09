#!/usr/bin/env python3
"""안드로이드 앱에 넣을 화면을 웹앱 원본에서 복사합니다.

앱 안의 assets/index.html 은 저장소 맨 위의 **SmokeFree_app.html**(웹앱 본체) 과 **같아야** 합니다.
저장소의 index.html 은 웹 · 앱 두 화면을 나란히 보여 주는 안내 화면이라 앱에는 넣지 않습니다 (MediNote 와 같은 구조).
손으로 옮기면 갈라집니다 — MediNote 가 두 달 넘게 그랬습니다 (MediNote #12).
그래서 assets/ 는 git 에 넣지 않고(android/.gitignore), 빌드 직전에 이 스크립트가 만듭니다.

    python3 tools/build-packaged-app.py          만들기
    python3 tools/build-packaged-app.py --check  갈라졌는지만 보기 (다르면 1)
"""
import filecmp
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
# (원본, 앱 안 이름) — 앱 본체는 index.html 이름으로도 넣는다 (MainActivity 가 assets/index.html 을 띄우고, sw.js 의 목록은 SmokeFree_app.html 도 찾는다)
FILES = [("SmokeFree_app.html", "index.html"), ("SmokeFree_app.html", "SmokeFree_app.html"),
         ("manifest.webmanifest", "manifest.webmanifest"), ("sw.js", "sw.js"),
         ("icon-192.png", "icon-192.png"), ("icon-512.png", "icon-512.png"), ("icon-512-maskable.png", "icon-512-maskable.png"),
         ("apple-touch-icon.png", "apple-touch-icon.png"), ("favicon-32.png", "favicon-32.png"),
         ("vendor/qrcodejs-1.0.0.min.js", "vendor/qrcodejs-1.0.0.min.js")]
DEST = ROOT / "android" / "app" / "src" / "main" / "assets"


def main() -> int:
    check = "--check" in sys.argv
    DEST.mkdir(parents=True, exist_ok=True)
    diff = []
    for sname, name in FILES:
        src, dst = ROOT / sname, DEST / name
        dst.parent.mkdir(parents=True, exist_ok=True)
        if not src.exists():
            print(f"원본이 없습니다: {sname}")
            return 2
        if check:
            if not dst.exists() or not filecmp.cmp(src, dst, shallow=False):
                diff.append(name)
        else:
            shutil.copy2(src, dst)
    if check:
        if diff:
            print("앱 화면이 웹앱과 다릅니다: " + ", ".join(diff))
            return 1
        print("앱 화면이 웹앱과 같습니다.")
        return 0
    print(f"{len(FILES)}개 파일을 {DEST.relative_to(ROOT)} 에 복사했습니다.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
