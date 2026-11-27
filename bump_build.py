"""改完 dashboard/index.html 后跑一下：自动更新页面里的版本号，让同事的浏览器能立刻看到新内容。

用法：python3 bump_build.py
"""
import hashlib
import re
from datetime import datetime
from pathlib import Path

PAGE = Path(__file__).resolve().parent / "dashboard" / "index.html"
# 只匹配赋值语句本身（行首缩进 + var LOCAL = "..."），别碰到正则字符串里同样的字样
PATTERN = re.compile(r'(?m)^(\s*var LOCAL = ")[^"]+(";)$')


def main() -> None:
    text = PAGE.read_text(encoding="utf-8")
    match = PATTERN.search(text)
    if not match:
        print("没找到 var LOCAL 赋值语句，请确认 index.html 里的版本自检脚本还在")
        return

    old = match.group(0)
    # 用文件内容哈希（去掉版本号本身）当版本标识：内容没变就不动版本号
    body = PATTERN.sub('\\g<1>@@BUILD@@\\g<2>', text)
    digest = hashlib.sha1(body.encode("utf-8")).hexdigest()[:8]
    stamp = datetime.now().strftime("%Y-%m-%dT%H:%M") + "-" + digest

    current = re.search(r'"([^"]+)"', old).group(1)
    if current == stamp:
        print(f"版本号没变，仍是 {stamp}")
        return

    # 用函数式替换，避免 \1 之类的转义被当成字面量
    new = old.replace(current, stamp)
    PAGE.write_text(text.replace(old, new, 1), encoding="utf-8")
    print(f"版本号已更新：{current} → {stamp}")


if __name__ == "__main__":
    main()
