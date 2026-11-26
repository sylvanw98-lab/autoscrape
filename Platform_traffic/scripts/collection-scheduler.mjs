import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export class CollectionScheduler {
  constructor({ file, collect, now = Date.now }) {
    this.file = file;
    this.collect = collect;
    this.now = now;
    this.writes = Promise.resolve();
    this.state = { enabled: true, intervalMinutes: 60, nextRunAt: null, running: false, lastRunAt: null, lastSuccessAt: null, lastResult: null };
  }
  async init() {
    try { Object.assign(this.state, JSON.parse(await readFile(this.file, 'utf8'))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (this.state.running) this.state.lastResult = { ok: false, issues: ['上次采集被中断，等待下一轮或手动重试'], platforms: [] };
    this.state.running = false;
    if (!this.state.nextRunAt && this.state.enabled) this.state.nextRunAt = this.now() + this.state.intervalMinutes * 60000;
    await this.persist();
    return this;
  }
  persist() {
    const json = JSON.stringify(this.state, null, 2) + '\n';
    this.writes = this.writes.catch(() => {}).then(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      const temp = this.file + '.' + randomUUID() + '.tmp';
      await writeFile(temp, json, { mode: 0o600 });
      await rename(temp, this.file);
    });
    return this.writes;
  }
  async configure({ enabled, intervalMinutes }) {
    if (typeof enabled !== 'boolean' || !Number.isInteger(intervalMinutes) || intervalMinutes < 15 || intervalMinutes > 10080) {
      throw new Error('采集间隔须为 15 至 10080 的整数分钟');
    }
    Object.assign(this.state, { enabled, intervalMinutes, nextRunAt: enabled ? this.now() + intervalMinutes * 60000 : null });
    await this.persist();
  }
  async tick() {
    if (this.state.enabled && !this.state.running && this.state.nextRunAt <= this.now()) await this.run();
  }
  async run() {
    if (this.state.running) return false;
    this.state.running = true;
    this.state.lastRunAt = this.now();
    this.state.nextRunAt = this.state.enabled ? this.now() + this.state.intervalMinutes * 60000 : null;
    await this.persist();
    try {
      const result = await this.collect();
      this.state.lastResult = result;
      if (result.ok) this.state.lastSuccessAt = this.now();
    } catch (error) {
      this.state.lastResult = { ok: false, issues: [error.message], platforms: [] };
    } finally {
      this.state.running = false;
      await this.persist();
    }
    return true;
  }
}
