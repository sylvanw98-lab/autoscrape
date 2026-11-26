import { readFile, mkdir, appendFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const supported = new Set(['X', 'Instagram', 'TikTok']);
const filename = process.argv[2];
if (!filename) throw new Error('请提供本轮采集结果 JSON 文件路径');
const input = JSON.parse(await readFile(resolve(filename), 'utf8'));
if (!Array.isArray(input.profiles) || !Array.isArray(input.posts) ||
    input.issues != null && !Array.isArray(input.issues)) throw new Error('采集结果须包含 profiles、posts 和可选 issues 数组');
for (const record of [...input.profiles, ...input.posts]) {
  if (!supported.has(record?.platform)) throw new Error('采集结果包含无效平台');
}
const config = JSON.parse(await readFile(resolve(root, 'outputs/local/wrangler.json'), 'utf8'));
const token = config.vars?.COLLECT_TOKEN;
if (!token) throw new Error('本地运行配置缺少 COLLECT_TOKEN');
const run = { attemptedAt: Date.now(), finishedAt: null, platforms: [], issues: [...input.issues || []] };
async function save(path, records) {
  const response = await fetch('http://127.0.0.1:8787' + path, {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(records), signal: AbortSignal.timeout(15000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error('写入失败（HTTP ' + response.status + '）：' + (result.error || '接口错误'));
  return result;
}
for (const platform of supported) {
  const profiles = input.profiles.filter(record => record.platform === platform);
  const posts = input.posts.filter(record => record.platform === platform);
  if (!profiles.length && !posts.length) {
    run.issues.push(platform + '：本轮没有采集结果');
    continue;
  }
  const result = { platform, profiles: 0, posts: 0, metadata: 0, ok: !run.issues.some(issue => String(issue).startsWith(platform + '：')) };
  try {
    for (let index = 0; index < profiles.length; index += 25) {
      result.profiles += (await save('/api/web-profiles', profiles.slice(index, index + 25))).saved;
    }
  } catch (error) {
    result.ok = false;
    run.issues.push(platform + ' 账号：' + error.message);
  }
  try {
    for (let index = 0; index < posts.length; index += 50) {
      const batch = await save('/api/web-snapshots', posts.slice(index, index + 50));
      result.posts += batch.saved;
      result.metadata += batch.named;
    }
  } catch (error) {
    result.ok = false;
    run.issues.push(platform + ' 帖子：' + error.message);
  }
  run.platforms.push(result);
}
run.finishedAt = Date.now();
run.ok = run.issues.length === 0;
const output = resolve(root, 'outputs/local');
await mkdir(output, { recursive: true });
await appendFile(resolve(output, 'collection-runs.jsonl'), JSON.stringify(run) + '\n');
await writeFile(resolve(output, 'collection-status.json'), JSON.stringify(run, null, 2) + '\n');
console.log(JSON.stringify(run, null, 2));
if (!run.ok) process.exitCode = 1;
