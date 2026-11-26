"""一键更新（Mac / Windows 通用）：采集小红书、抖音、视频号并导入 TikTok、Instagram、YouTube 和 X → 写入 data/videos.db → 导出看板数据 →（可选）上传到你自己的网站。

运行：Mac `python3 update.py`，Windows `py update.py`。
个人设置写在 config.env（不进 Git，参考 config.example.env）；不配置就只在本地更新，用 preview 看。
默认采集官方号；采集马甲号时先在 ego lite 切换到马甲号登录，再在 config.env 设 ACCOUNT_TYPE="alt"。
某个平台抓失败（多半是登录过期）不影响其他平台，照样入库和上传，最后以退出码 2 结束，好让定时任务知道要提醒。
"""
import json
import os
import shutil
import subprocess
import sys
import urllib.request
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
FETCHERS = [("fetch.mjs", "小红书", "xhs"), ("fetch_douyin.mjs", "抖音", "douyin"),
            ("fetch_channels.mjs", "视频号", "channels")]
ACCOUNT_LABELS = {"official": "官方号", "alt": "马甲号"}


def load_config():
    """config.env 里每行 KEY="value"，# 开头是注释；值里可以用 $HOME、~。"""
    cfg = {}
    p = HERE / "config.env"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                cfg[k.strip()] = os.path.expanduser(os.path.expandvars(v.strip().strip('"')))
    return cfg


def fetch(script, platform, ego, account_type):
    # ego-browser nodejs 的工作目录不是项目目录，也读不到环境变量，所以把项目路径写在脚本最前面一起送进去
    code = (f"const ROOT = {json.dumps(HERE.as_posix() + '/')};\n"
            f"const PLATFORM = {json.dumps(platform)};\n"
            f"const ACCOUNT_TYPE = {json.dumps(account_type)};\n")
    code += (HERE / "fetch_followers.mjs").read_text(encoding="utf-8")
    code += (HERE / script).read_text(encoding="utf-8")
    return subprocess.run([ego, "nodejs"], input=code.encode("utf-8")).returncode == 0


def main():
    # 输出重定向到日志时也按行写出、统一 UTF-8（Windows 默认是 GBK），顺序才不会和子进程的输出错乱
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    os.chdir(HERE)
    cfg = load_config()
    ego = shutil.which("ego-browser")
    if not ego:
        print("找不到 ego-browser 命令：请先安装 ego lite 并完成首次引导")
        return 1

    account_type = (cfg.get("ACCOUNT_TYPE") or "official").strip().lower()
    if account_type not in ACCOUNT_LABELS:
        print(f"ACCOUNT_TYPE 只能是 official（官方号）或 alt（马甲号），当前是 {account_type}")
        return 1
    print(f"本次采集账号类型：{ACCOUNT_LABELS[account_type]}")

    failed = [name for script, name, platform in FETCHERS if not fetch(script, platform, ego, account_type)]
    if subprocess.run([sys.executable, "ingest.py"]).returncode != 0:
        return 1
    if len(failed) == len(FETCHERS):
        # 国内平台全部采集失败时跳过上传
        print("抓取失败：" + " ".join(failed))
        return 2

    if cfg.get("UPLOAD_URL"):
        key_file = HERE / ".upload_key"
        if not key_file.exists() or not key_file.read_text(encoding="utf-8").strip():
            print(f"缺少上传密钥 {key_file}")
            return 1
        # 密钥只从文件读，不打印
        req = urllib.request.Request(cfg["UPLOAD_URL"], data=(HERE / "data/video_data.json").read_bytes(), method="POST", headers={
            "Authorization": "Bearer " + key_file.read_text(encoding="utf-8").strip(), "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                print(r.read().decode())
        except Exception as e:
            print("上传失败：", e)
            return 1
        print("已上传" + (f"，{cfg['SITE_URL']} 已是最新数据" if cfg.get("SITE_URL") else ""))

    # 看板页面放在另一个网站仓库里时：页面改了才复制过去，只提交这一个文件
    if cfg.get("SITE_REPO") and cfg.get("SITE_PAGE"):
        repo, page = Path(cfg["SITE_REPO"]), cfg["SITE_PAGE"]
        shutil.copyfile(HERE / "dashboard/index.html", repo / page)
        git = lambda *a: subprocess.run(["git", *a], cwd=repo).returncode
        if git("diff", "--quiet", "--", page) != 0:
            if git("commit", "-m", f"video: 更新看板页面 {datetime.now():%Y-%m-%d %H:%M}", "--", page) or git("push", "origin", "main"):
                return 1
            print("看板页面已推送")

    if failed:
        print("抓取失败：" + " ".join(failed))
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
