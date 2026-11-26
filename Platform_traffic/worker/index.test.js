import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import worker from './index.js';

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(name => name.endsWith('.sql')).sort()) {
    sqlite.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
  }
  const DB = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async all() { return { results: statement.all(...args) }; },
        async first(column) { const row = statement.get(...args); return column ? row?.[column] ?? null : row ?? null; },
        async run() { const result = statement.run(...args); return { meta: { changes: result.changes } }; },
      };
    },
    async batch(statements) { return Promise.all(statements.map(statement => statement.run())); },
  };
  const env = { DB, COLLECT_TOKEN: 'local-test-token' };
  return {
    sqlite,
    async get(query) { return worker.fetch(new Request('http://localhost/api/dashboard?' + query), env); },
    async save(entries) {
      return worker.fetch(new Request('http://localhost/api/web-snapshots', {
        method: 'POST', headers: { Authorization: 'Bearer local-test-token', 'Content-Type': 'application/json' },
        body: JSON.stringify(entries),
      }), env);
    },
  };
}

const entry = (id, mediaType, impressions) => ({
  id: 'x:' + id, platform: 'X', url: 'https://x.com/shotpoet/status/' + id,
  title: 'Post ' + id, mediaType, impressions, likes: 1, comments: 0, publishedAt: Date.now() - 60000 * Number(id),
});

test('content filters keep cards, recent selection and trend readings in the same category', async () => {
  const f = fixture();
  try {
    assert.equal((await f.save([entry('1', 'image', 10), entry('2', 'video', 80), entry('3', undefined, 20)])).status, 200);
    const images = await (await f.get('platform=X&mediaType=image&postSelection=recent')).json();
    assert.deepEqual(images.posts.map(post => post.id), ['x:1']);
    assert.deepEqual(images.trendPostIds, ['x:1']);
    assert.deepEqual(images.trend.flatMap(period => period.readings).map(reading => reading.impressions), [10]);
    const videos = await (await f.get('platform=X&mediaType=video&post=x:1&post=x:2')).json();
    assert.deepEqual(videos.posts.map(post => post.id), ['x:2']);
    assert.deepEqual(videos.trendPostIds, ['x:2']);
    const all = await (await f.get('platform=X')).json();
    assert.equal(all.posts.length, 3);
    assert.equal(all.posts.find(post => post.id === 'x:3').media_type, 'unknown');
    assert.equal((await f.get('mediaType=invalid')).status, 400);
  } finally { f.sqlite.close(); }
});

test('classifying previously collected posts preserves snapshot values and sample time', async () => {
  const f = fixture();
  try {
    await f.save([entry('1', undefined, 34)]);
    const before = f.sqlite.prepare('SELECT * FROM snapshots').get();
    const response = await f.save([{ id: 'x:1', mediaType: 'image' }]);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).saved, 0);
    assert.deepEqual(f.sqlite.prepare('SELECT * FROM snapshots').get(), before);
    assert.equal(f.sqlite.prepare('SELECT media_type FROM posts').get().media_type, 'image');
    await f.save([{ id: 'x:1', likes: 3 }]);
    assert.equal(f.sqlite.prepare('SELECT media_type FROM posts').get().media_type, 'image');
    await f.save([{ id: 'x:1', mediaType: 'unknown', likes: 3 }]);
    assert.equal(f.sqlite.prepare('SELECT media_type FROM posts').get().media_type, 'image');
    assert.equal((await f.save([{ id: 'x:1', mediaType: 'audio' }])).status, 400);
  } finally { f.sqlite.close(); }
});

test('TikTok photos and videos are inferred by URL without inventing Instagram post types', async () => {
  const f = fixture();
  try {
    const entries = [
      { id: 'tiktok:1', platform: 'TikTok', url: 'https://www.tiktok.com/@shotpoet_ai/photo/1', impressions: 20 },
      { id: 'tiktok:2', platform: 'TikTok', url: 'https://www.tiktok.com/@shotpoet_ai/video/2', impressions: 50 },
      { id: 'instagram:abc', platform: 'Instagram', url: 'https://www.instagram.com/shotpoet_ai/p/abc/', likes: 2 },
      { id: 'instagram:def', platform: 'Instagram', url: 'https://www.instagram.com/shotpoet_ai/reel/def/', likes: 4 },
    ];
    assert.equal((await f.save(entries)).status, 200);
    const types = Object.fromEntries(f.sqlite.prepare('SELECT id,media_type FROM posts').all().map(p => [p.id, p.media_type]));
    assert.deepEqual(types, { 'tiktok:1': 'image', 'tiktok:2': 'video', 'instagram:abc': 'unknown', 'instagram:def': 'video' });
    const empty = await (await f.get('platform=X&mediaType=video')).json();
    assert.equal(empty.posts.length, 0);
    assert.equal(empty.trendPostCount, 0);
  } finally { f.sqlite.close(); }
});

test('scheduler settings require local same-origin writes and keep internal credentials off the page', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.equal(options.headers.Authorization, 'Bearer internal-test-secret');
    assert.equal(url, 'http://127.0.0.1:8790/settings');
    return Response.json({ enabled: true, intervalMinutes: 60 });
  };
  try {
    const env = { COLLECT_TOKEN: 'internal-test-secret' };
    for (const request of [
      new Request('http://localhost/api/auto-collection', { method: 'POST', headers: { Origin: 'http://other.example' } }),
      new Request('http://10.0.0.1/api/auto-collection', { method: 'POST', headers: { Origin: 'http://10.0.0.1' } }),
      new Request('http://localhost/api/auto-collection', { method: 'POST', headers: { Origin: 'http://localhost', 'x-dashboard-readonly': '1' } }),
    ]) assert.equal((await worker.fetch(request, env)).status, 403);
    assert.equal(calls, 0);
    const local = await worker.fetch(new Request('http://localhost/api/auto-collection', {
      method: 'POST', headers: { Origin: 'http://localhost', 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true, intervalMinutes: 60 }),
    }), env);
    const body = await local.text(); assert.equal(local.status, 200); assert.ok(!body.includes('internal-test-secret'));
    assert.equal(JSON.parse(body).canManage, true);
    const readonly = await worker.fetch(new Request('http://localhost/api/auto-collection', { headers: { 'x-dashboard-readonly': '1' } }), env);
    assert.equal((await readonly.json()).canManage, false);
  } finally { globalThis.fetch = originalFetch; }
});
