import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = resolve(root, 'outputs/local');
await mkdir(directory, { recursive: true });
const config = {
  name: 'platform-traffic-local', main: '../../dist/server/index.js', compatibility_date: '2026-01-01',
  d1_databases: [{ binding: 'DB', database_name: 'platform-traffic-local', database_id: '00000000-0000-0000-0000-000000000001', migrations_dir: '../../drizzle' }],
  vars: { COLLECT_TOKEN: randomBytes(32).toString('hex') },
};
try {
  await writeFile(resolve(directory, 'wrangler.json'), JSON.stringify(config, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  console.log('本地配置已生成，采集令牌已保存在忽略提交的 outputs/local/wrangler.json。');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('本地配置已存在，保留原配置及密钥。');
}
