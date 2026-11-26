import http from 'node:http';
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { CollectionScheduler } from './collection-scheduler.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const local = resolve(root, 'outputs/local');
const config = JSON.parse(await readFile(resolve(local, 'wrangler.json'), 'utf8'));
const token = config.vars?.COLLECT_TOKEN;
if (!token) throw new Error('本地配置缺少 COLLECT_TOKEN');
await mkdir(local, { recursive: true });

function execute(command, args, input) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
    let tail = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); }, 12 * 60000);
    const output = chunk => { tail = (tail + chunk).slice(-3000); };
    child.stdout.on('data', output);
    child.stderr.on('data', output);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => { clearTimeout(timer); resolvePromise({ code, output: tail }); });
    child.stdin.on('error', () => {});
    child.stdin.end(input);
  });
}

async function collect() {
  const guide = await execute('ego-browser', ['skill']);
  if (guide.code !== 0 || !guide.output.includes('[ego-browser:skill] end of guide')) throw new Error('Ego 浏览器运行环境未就绪');
  const filename = resolve(local, 'collection-' + Date.now() + '.json');
  const source = (await readFile(resolve(root, 'scripts/browser-collector.js'), 'utf8'))
    .replaceAll('__COLLECTOR_ROOT__', JSON.stringify(root))
    .replaceAll('__COLLECTOR_OUTPUT__', JSON.stringify(filename));
  const browser = await execute('ego-browser', ['nodejs'], source);
  await appendFile(resolve(local, 'browser-collector.log'), '\n' + new Date().toISOString() + '\n' + browser.output + '\n');
  try { await readFile(filename, 'utf8'); }
  catch { throw new Error('浏览器采集未完成，请检查浏览器连接、登录状态或 browser-collector.log'); }
  if (browser.code !== 0) {
    const data = JSON.parse(await readFile(filename, 'utf8'));
    data.issues.push('浏览器采集脚本异常退出或超时，请查看采集日志');
    await writeFile(filename, JSON.stringify(data, null, 2));
  }
  await execute(process.execPath, ['scripts/save-collection.mjs', filename]);
  const result = JSON.parse(await readFile(resolve(local, 'collection-status.json'), 'utf8'));
  if (result.attemptedAt < Number(filename.match(/collection-(\d+)\.json$/)[1])) throw new Error('本轮结果未写入，请查看采集日志');
  return result;
}

const scheduler = await new CollectionScheduler({ file: resolve(local, 'scheduler.json'), collect }).init();
function reply(res, value, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
http.createServer(async (req, res) => {
  if (req.headers.authorization !== 'Bearer ' + token) return reply(res, { error: '未授权' }, 403);
  try {
    if (req.method === 'GET' && req.url === '/settings') return reply(res, scheduler.state);
    if (req.method === 'POST' && req.url === '/run') {
      if (scheduler.state.running) return reply(res, { error: '已有采集正在运行' }, 409);
      scheduler.run().catch(() => {});
      return reply(res, scheduler.state, 202);
    }
    if (req.method === 'POST' && req.url === '/settings') {
      let body = '';
      for await (const chunk of req) { body += chunk; if (body.length > 8192) return reply(res, { error: '请求过大' }, 413); }
      await scheduler.configure(JSON.parse(body));
      return reply(res, scheduler.state);
    }
    reply(res, { error: '页面不存在' }, 404);
  } catch (error) { reply(res, { error: error.message }, 400); }
}).listen(8790, '127.0.0.1', () => console.log('本机自动采集服务已启动：8790'));
setInterval(() => scheduler.tick().catch(() => {}), 1000);
