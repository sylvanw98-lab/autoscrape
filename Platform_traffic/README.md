# 社媒发布数据看板

按 X、Instagram、TikTok 查看账号和帖子指标。每个平台提供「全部 / 图片 / 视频」分类，统计卡片、互动趋势、帖子筛选和帖子明细使用同一内容类型。

## 本地运行

需要 Node.js 22.20 或更高版本、Wrangler，以及已安装并登录相关社媒账号的 Ego 浏览器（`ego-browser` 命令需可用）。本机运行配置位于忽略提交的 `outputs/local/wrangler.json`，数据库保存在 `outputs/local/state`。

```bash
npm run setup:local
npm run build
npx wrangler d1 migrations apply platform-traffic-local --local --config outputs/local/wrangler.json --persist-to outputs/local/state
npx wrangler dev --local --config outputs/local/wrangler.json --persist-to outputs/local/state --ip 127.0.0.1 --port 8787
```

访问 <http://127.0.0.1:8787/>。另开终端运行 `npm run collector` 启动本机自动采集服务，运行 `npm run lan` 启动局域网只读入口（8788）。

首次设置会生成随机本地采集令牌；已有配置不会覆盖。新克隆的仓库不包含本机数据库、密钥或采集日志，运行迁移后通过「立即采集一次」填入真实数据。仅查看页面可不安装 Ego 浏览器，网页采集则需要它和有效登录状态。

通用 Worker 配置需指定 `main: "dist/server/index.js"`、D1 绑定 `DB` 和 `migrations_dir: "drizzle"`（路径相对于配置文件）。构建不会创建云端资源，也不会下载线上数据库。

## 采集与刷新

本机调度服务使用固定浏览器脚本采集 X、Instagram、TikTok，不调用 AI 模型。页面右上角「自动采集设置」支持自定义分钟间隔、暂停／恢复、立即执行和查看上次／下次状态。默认每小时，支持 15 分钟至 7 天，设置重启保留。电脑、采集服务和 Ego 浏览器需保持运行与登录。旧 Codex 定时任务保持暂停。运行流程、输入格式和日志位置见 [自动采集](docs/auto-collection.md)。页面「刷新」只读取本地数据；网页采集由浏览器读取真实页面，再通过受 `COLLECT_TOKEN` 保护的 `/api/web-profiles` 和 `/api/web-snapshots` 写入。

Worker 的 `scheduled` 入口可用于部署后配置的定时任务，但仓库及本地配置没有设置 cron。该入口只采集显式启用 API 模式并配置授权的供应商，不会自行打开网页。网页模式不能靠启用这个入口自动采集。

`/api/web-snapshots` 每条记录可携带 `mediaType: "image" | "video" | "unknown"`。采集器应按实际媒体判断；混合图文与视频按视频归类。TikTok 的 `/photo/`、`/video/` 和 Instagram 的 Reel 链接可自动识别。普通 Instagram 帖子和 X 帖子不能仅凭 URL 判断类型，未提供类型时保留已有值，新记录标记为 `unknown`。

`GET /api/dashboard?platform=X&mediaType=image` 返回图片统计所需的帖子和趋势；`mediaType=video` 返回视频，省略则返回全部。未知类型仅计入全部，已有数据不会一律推定为图片。仅补充 `id` 和 `mediaType` 可更新分类，不会创建新的指标快照。

## 界面操作

- 在社媒平台下选择全部、图片或视频，指标和趋势同步切换。暂无视频时显示明确空状态，累计统计为 0；已有帖子未公开的指标保留「暂无数据」。
- 趋势图例、单帖图表和明细表显示可跳转的原帖 URL，链接在新标签页打开。
- 缩略图支持点击放大，预览可通过关闭按钮、Esc 或点击遮罩关闭；加载失败时可通过原帖链接查看。

## 检查

```bash
npm test
npm run build
```

产品规则见 [交互与产品决策](docs/demo-decisions.md)。
