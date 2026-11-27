"""本地看看板（Mac / Windows 通用）：Mac `python3 preview.py`，Windows `py preview.py`，然后打开 http://localhost:8765

默认只监听 127.0.0.1（自己看）。要让同一局域网的同事也能访问，加 --lan 参数监听 0.0.0.0，
地址形如 http://<本机IP>:8765/index.html

关掉缓存：看板经常在改，不加这行浏览器会一直用旧副本，看起来"改了没生效"。
"""
import argparse
import functools
import http.server
import shutil
import socket
from pathlib import Path

DASH = Path(__file__).resolve().parent / "dashboard"


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    """所有响应都带上禁用缓存的头，避免浏览器拿旧页面。"""

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):  # 只记错误，访问日志太吵
        if not str(args[1] if len(args) > 1 else "").startswith("2"):
            super().log_message(fmt, *args)


def local_ip() -> str:
    """取本机在局域网里的地址，用于提示同事怎么访问。"""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))  # 不真的发包，只是让系统选默认出口网卡
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def main():
    parser = argparse.ArgumentParser(description="预览看板")
    parser.add_argument("--port", type=int, default=8765, help="端口，默认 8765")
    parser.add_argument("--lan", action="store_true", help="允许同一局域网的同事访问")
    args = parser.parse_args()

    if not (DASH / "data.js").exists():  # 还没抓过真实数据时先用示例数据
        shutil.copyfile(DASH / "data.example.js", DASH / "data.js")

    host = "0.0.0.0" if args.lan else "127.0.0.1"
    print("打开 http://localhost:%d/index.html （Ctrl+C 停止）" % args.port)
    if args.lan:
        print("同事可用 http://%s:%d/index.html" % (local_ip(), args.port))
    handler = functools.partial(NoCacheHandler, directory=DASH)
    http.server.ThreadingHTTPServer((host, args.port), handler).serve_forever()


if __name__ == "__main__":
    main()
