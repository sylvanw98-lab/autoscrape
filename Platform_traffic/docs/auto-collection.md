# 工具内自动采集

本机调度服务运行固定 Ego 浏览器脚本，不调用 AI 模型。运行 `npm run collector` 后，在看板右上角「自动采集设置」中调整间隔、暂停／恢复或立即执行。默认 60 分钟，支持 15 至 10080 分钟。电脑、服务和 Ego 浏览器及登录状态需保持可用。关闭看板不影响运行，旧的 Codex 定时任务保持暂停。

设置和最近结果持久化在 `outputs/local/scheduler.json`，本机调度控制接口仅监听 127.0.0.1:8790，并由 Worker 注入内部令牌访问。前端不持有采集令牌；设置写入只允许本机同源请求，局域网入口只读。最多同时执行一轮；暂停不取消当前轮次；休眠后的过期计划只补采一轮。

浏览器采集程序为 `scripts/browser-collector.js`，调度器为 `scripts/collection-scheduler.mjs`，本机服务为 `scripts/collector-service.mjs`。脚本按页面结构读取实际数据；社媒页面结构变化时，失败会显示在设置面板，须修复脚本后重试。

## 执行目录与服务

仓库：`/Users/drovio.ai/Platform_traffic`。

1. 固定脚本使用 `ego-browser nodejs` 和已登录的 Ego 浏览器读取网页，不调用模型。
2. 请求 `http://127.0.0.1:8787/api/dashboard` 确认本地服务正常。如 Worker 停止，需要按 README 启动；脚本会记录失败，不创建或重置数据库，不更换密钥。
3. 局域网只读入口为端口 8788，使用 `npm run lan` 启动；采集写入使用本机 8787。

## 每轮范围

每轮都访问三个账号，不按看板当前选中的平台缩小范围：

- X：<https://x.com/shotpoet>
- Instagram：<https://www.instagram.com/shotpoet_ai/>
- TikTok：<https://www.tiktok.com/@shotpoet_ai>

采集账号粉丝数、关注数，以及账号已发布帖子的原帖链接、正文、可确认的发布时间、缩略图、媒体类型和可见互动指标。滚动到账号帖子列表末尾；仅采集目标账号，排除推荐内容、广告和他人帖子。按照每轮实际观察生成结果，不重放之前 `captured-*.json` 中的旧读数。

X 的帖子卡片可读到浏览量、点赞和回复；Instagram 从帖子详情的公开数字和元数据读取点赞、评论、发布时间和正文；TikTok 从账号网格读播放量，从帖子详情读点赞、评论、收藏。页面加载完毕后再读取，避免把占位内容当作真实数据。

未公开或无法确认的数值使用 `null`，只有页面明确显示零时才写入 `0`。无法确认的时间使用 `null`。不将当前时间或相对时间粗算成精确发布时间。

类型根据实际内容填写 `mediaType: "image" | "video" | "unknown"`：图片轮播为图片，含视频的帖子为视频；TikTok `/photo/` 为图片、`/video/` 为视频，Instagram Reel 为视频。普通 Instagram `/p/` 和 X URL 不能直接判断类型，需查看实际媒体。

## 保存

将本轮读取的结果保存为 `outputs/local/collection-<唯一时间戳>.json`，结构为：

```json
{
  "profiles": [],
  "posts": [],
  "issues": []
}
```

`profiles` 的每条记录包含 `platform`、`handle`、`followers`、`following`。`posts` 的每条记录包含 `id`、`platform`、`url`、`title`、`mediaType`、`publishedAt`、`thumbnailUrl`、`impressions`、`likes`、`comments`；TikTok 可另含 `saves`。`id` 使用 `x:<数字>`、`instagram:<短码>`、`tiktok:<数字>`，链接使用账号发布的原帖地址。`issues` 记录未完成的平台及原因。

用以下命令写入受保护的本地接口并记录结果：

```bash
node scripts/save-collection.mjs outputs/local/collection-<唯一时间戳>.json
```

脚本只在内存中读取本地采集令牌，不输出或复制密钥。历史运行记录追加到 `outputs/local/collection-runs.jsonl`，最近结果保存在 `outputs/local/collection-status.json`。现有 API 每个帖子每小时保留一份指标快照，同小时的新读数更新该小时快照。

单个平台失败不清空其他平台的数据，尽量先保存成功的平台。遇到登录、验证码或权限提示时交还浏览器给用户处理，不尝试绕过。记录失败原因并明确指出需要用户处理的平台。完成后验证看板接口中本轮成功平台的数据和采集时间，保留本地看板作为结果页面。
