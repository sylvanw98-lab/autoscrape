import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CollectionScheduler } from './collection-scheduler.mjs';

test('settings survive restart; pause prevents timed collection, manual run still works', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'collection-schedule-'));
  let now = 10000000, runs = 0;
  const options = { file: join(dir, 'state.json'), now: () => now, collect: async () => { runs++; return { ok: true, platforms: [], issues: [] }; } };
  try {
    const s = await new CollectionScheduler(options).init();
    await s.configure({ enabled: true, intervalMinutes: 180 });
    assert.equal(s.state.nextRunAt, now + 180 * 60000);
    await assert.rejects(s.configure({ enabled: true, intervalMinutes: 0 }));
    await s.configure({ enabled: false, intervalMinutes: 30 });
    now += 86400000;
    await s.tick(); assert.equal(runs, 0);
    await s.run(); assert.equal(runs, 1); assert.equal(s.state.nextRunAt, null);
    const restored = await new CollectionScheduler(options).init();
    assert.equal(restored.state.enabled, false); assert.equal(restored.state.intervalMinutes, 30);
    assert.equal(restored.state.lastSuccessAt, now);
    await restored.configure({ enabled: true, intervalMinutes: 15 });
    now += 15 * 60000; await restored.tick(); assert.equal(runs, 2);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('overdue schedules coalesce and concurrent triggers do not start another browser', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'collection-lock-'));
  let now = 10000000, runs = 0, finish;
  try {
    const s = await new CollectionScheduler({ file: join(dir, 'state.json'), now: () => now, collect: () => { runs++; return new Promise(resolve => { finish = resolve; }); } }).init();
    now += 86400000;
    const first = s.tick();
    while (!finish) await new Promise(resolve => setImmediate(resolve));
    assert.equal(await s.run(), false);
    await s.tick(); assert.equal(runs, 1);
    await s.configure({ enabled: false, intervalMinutes: 60 });
    finish({ ok: false, issues: ['Instagram 登录失效'], platforms: [{ platform: 'X', ok: true }] });
    await first;
    assert.equal(s.state.running, false); assert.equal(s.state.nextRunAt, null);
    assert.equal(s.state.lastSuccessAt, null); assert.equal(s.state.lastResult.platforms[0].ok, true);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
