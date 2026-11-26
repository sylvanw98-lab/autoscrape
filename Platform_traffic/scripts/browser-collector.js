// Executed by `ego-browser nodejs`, not by the model or a webpage.
const fs = await import('node:fs/promises');
const root = __COLLECTOR_ROOT__;
const outputFile = __COLLECTOR_OUTPUT__;
const spaceFile = root + '/outputs/local/collector-browser-space.json';
const result = { profiles: [], posts: [], issues: [] };
let spaceId = null;
try { spaceId = JSON.parse(await fs.readFile(spaceFile, 'utf8')).spaceId; } catch {}
const entry = (await listTaskSpaces()).find(s => s.id === spaceId);
if (entry?.ownership === 'agentDelegatedToUser') throw new Error('浏览器正在等待用户处理，请完成登录后再运行采集');
const task = !entry ? await taskSpace('Platform traffic 本地前端') : entry.ownership === 'user' ? await claimTaskSpace(spaceId) : await taskSpace(spaceId);
await fs.writeFile(spaceFile, JSON.stringify({ spaceId: task.spaceId }));
const existing = await task.pages();
const tabs = await task.tabs();
const dashboardTab = tabs.find(t => /^http:\/\/(127\.0\.0\.1|localhost):878[78]/.test(t.url));
const dashboard = dashboardTab ? dashboardTab.label ? task.page(dashboardTab.label) : await task.adopt(dashboardTab.page) : null;
const page = existing.length || tabs.length ? await task.newPage() : task.page('p1');
let needsUser = false, browserStopped = false;
const persist = () => fs.writeFile(outputFile, JSON.stringify(result, null, 2));
const observe = async () => console.log((await page.snapshot()).slice(0, 12000));

async function scrollItems(extract) {
  const items = new Map();
  let stable = 0;
  for (let round = 0; round < 100; round++) {
    const before = items.size;
    for (const item of await extract()) items.set(item.id, item);
    const position = await page.evaluate(() => ({ y: scrollY, height: document.documentElement.scrollHeight }));
    await page.mouse.move(650, 620, { label: '定位账号帖子列表' });
    await page.mouse.wheel(0, 1500, { label: '读取下一段账号帖子' });
    try { await page.waitForFunction(({ y, height }) => scrollY !== y || document.documentElement.scrollHeight !== height, position, { timeout: 3000 }); } catch {}
    const after = await page.evaluate(() => ({ y: scrollY, height: document.documentElement.scrollHeight }));
    if (items.size === before && after.y === position.y && after.height === position.height) stable++; else stable = 0;
    if (stable >= 2) return [...items.values()];
  }
  throw new Error('帖子数量超过单轮读取上限，未宣称完整采集');
}

async function collectX() {
  await page.goto('https://x.com/shotpoet', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('article', { state: 'visible', timeout: 20000 });
  await observe();
  const profile = await page.evaluate(() => {
    const number = selector => {
      const text = document.querySelector(selector)?.textContent.trim();
      const match = text?.match(/^([\d,]+)/);
      return match ? Number(match[1].replaceAll(',', '')) : null;
    };
    return { platform: 'X', handle: 'shotpoet', followers: number('a[href="/shotpoet/verified_followers"]'), following: number('a[href="/shotpoet/following"]') };
  });
  if (profile.followers != null || profile.following != null) result.profiles.push(profile);
  const posts = await scrollItems(() => page.evaluate(() => [...document.querySelectorAll('article')].map(article => {
    const time = article.querySelector('time');
    const url = time?.closest('a')?.href;
    if (!url || !/^https:\/\/x\.com\/shotpoet\/status\/\d+$/.test(url)) return null;
    const labels = [...article.querySelectorAll('[aria-label]')].map(n => ({ tag: n.tagName, label: n.getAttribute('aria-label') }));
    const number = (tag, expression) => {
      const text = labels.find(n => n.tag === tag && expression.test(n.label))?.label;
      const match = text?.match(/^([\d,.]+)([KMB])?/i);
      return match ? Math.round(Number(match[1].replaceAll(',', '')) * ({ K: 1e3, M: 1e6, B: 1e9 }[match[2]?.toUpperCase()] || 1)) : null;
    };
    const imageUrls = [...new Set([...article.querySelectorAll('img')].map(n => n.currentSrc || n.src)
      .filter(url => url.startsWith('https://pbs.twimg.com/media/')))];
    const image = imageUrls[0];
    return { id: 'x:' + url.split('/').pop(), platform: 'X', url, title: article.querySelector('[data-testid="tweetText"]')?.innerText || '',
      mediaType: article.querySelector('video,[data-testid="videoPlayer"]') ? 'video' : image ? 'image' : 'unknown',
      publishedAt: Date.parse(time.dateTime), thumbnailUrl: image, imageUrls,
      impressions: number('A', /^[\d,.]+[KMB]? views?\. View post analytics$/i),
      likes: number('BUTTON', /^[\d,.]+[KMB]? Likes?\. Like(?:d)?$/i), comments: number('BUTTON', /^[\d,.]+[KMB]? Repl(?:y|ies)\. Reply$/i) };
  }).filter(Boolean)));
  if (!posts.length) throw new Error('未读到 X 目标账号帖子');
  result.posts.push(...posts);
}

async function collectInstagram() {
  await page.goto('https://www.instagram.com/shotpoet_ai/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => [...document.querySelectorAll('main a[href]')].some(n => /\/shotpoet_ai\/(p|reel|reels)\//.test(n.getAttribute('href'))), undefined, { timeout: 20000 });
  await observe();
  const profile = await page.evaluate(() => {
    const find = expression => {
      const anchor = [...document.querySelectorAll('main a')].find(n => expression.test(n.textContent));
      const match = anchor?.textContent.trim().match(/^([\d,]+)/);
      return match ? Number(match[1].replaceAll(',', '')) : null;
    };
    return { platform: 'Instagram', handle: 'shotpoet_ai', followers: find(/粉丝|followers/i), following: find(/关注|following/i) };
  });
  if (profile.followers != null || profile.following != null) result.profiles.push(profile);
  const posts = await scrollItems(() => page.evaluate(() => [...document.querySelectorAll('main a[href]')].filter(n => /^\/shotpoet_ai\/(p|reel|reels)\/[^/]+\/$/.test(n.getAttribute('href'))).map(n => ({
    id: 'instagram:' + n.getAttribute('href').split('/')[3], platform: 'Instagram', url: n.href, thumbnailUrl: n.querySelector('img')?.src,
    carousel: Boolean(n.querySelector('[aria-label="轮播"],[aria-label="Carousel"]')),
  }))));
  if (!posts.length) throw new Error('未读到 Instagram 目标账号帖子');
  for (const { carousel, ...post } of posts) {
    try {
      await page.goto(post.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForFunction(() => document.querySelector('main time') && document.querySelector('main textarea'), undefined, { timeout: 20000 });
      if (!carousel) try { await page.waitForFunction(() => document.querySelector('main video') || [...document.querySelectorAll('main img')].some(n => /-15\/|\/t39\.30808-6\//.test(n.src)), undefined, { timeout: 15000 }); } catch {}
      await observe();
      const detail = await page.evaluate(() => {
        const main = document.querySelector('main');
        const number = text => /^[\d,]+$/.test(text?.trim() || '') ? Number(text.trim().replaceAll(',', '')) : null;
        const controls = [...main.querySelectorAll('button,[role="button"]')];
        const count = expression => {
          const control = controls.find(n => expression.test(n.querySelector('svg')?.getAttribute('aria-label') || ''));
          return number(control?.nextElementSibling?.textContent);
        };
        const meta = document.querySelector('meta[property="og:description"]')?.content || '';
        const metaLikes = meta.match(/^([\d,]+) likes?/i);
        const metaComments = meta.match(/([\d,]+) comments?/i);
        const caption = meta.match(/:\s*["“]([\s\S]*)["”]\s*$/)?.[1];
        const text = main.innerText;
        const times = [...main.querySelectorAll('time')];
        const images = [...main.querySelectorAll('img')].filter(n => /-15\/|\/t39\.30808-6\//.test(n.src));
        const code = location.pathname.split('/').filter(Boolean).at(-1);
        const published = times.find(n => n.closest('a')?.pathname.split('/').filter(Boolean).at(-1) === code);
        const captionText = main.querySelector('h1')?.innerText.trim();
        return { title: caption || captionText || '', publishedAt: published ? Date.parse(published.dateTime) : null,
          mediaType: main.querySelector('video') ? 'video' : images.length ? 'image' : 'unknown',
          impressions: null, likes: metaLikes ? number(metaLikes[1]) : count(/^(赞|取消赞|Like|Unlike)$/i),
          comments: metaComments ? number(metaComments[1]) : /还没有评论|No comments yet/i.test(text) ? 0 : count(/^(评论|Comment)$/i) };
      });
      if (carousel) {
        const next = 'main button[aria-label="下一步"],main button[aria-label="Next"]';
        const carouselControls = next + ',main button[aria-label="返回"],main button[aria-label="Previous"],main button[aria-label="Go back"]';
        const media = ({ selector, previous }) => {
          const container = document.querySelector(selector)?.parentElement;
          const box = container?.getBoundingClientRect();
          if (!box) return null;
          const mid = box.x + box.width / 2;
          const items = [...container.querySelectorAll('li img,li video')];
          const item = items.find(node => {
            const rect = node.getBoundingClientRect();
            return rect.width > 0 && Math.abs(rect.x + rect.width / 2 - mid) < 8;
          });
          if (!item) return null;
          const url = item.currentSrc || item.src || item.poster;
          return url && url !== previous ? { url, video: item.tagName === 'VIDEO' } : null;
        };
        const images = new Set();
        let hasVideo = false;
        let previous = null;
        for (let slide = 0; slide < 20; slide++) {
          const args = { selector: carouselControls, previous };
          await page.waitForFunction(media, args, { timeout: 8000 });
          const item = await page.evaluate(media, args);
          previous = item.url;
          if (item.video) hasVideo = true;
          else images.add(item.url);
          if (!await page.evaluate(selector => Boolean(document.querySelector(selector)), next)) break;
          if (slide === 19) throw new Error('轮播未遍历到末尾');
          await page.click('css:' + next);
        }
        detail.imageUrls = [...images];
        detail.mediaType = hasVideo ? 'video' : images.size ? 'image' : detail.mediaType;
      } else if (detail.mediaType === 'image' && post.thumbnailUrl) {
        detail.imageUrls = [post.thumbnailUrl];
      }
      if (/\/reels?\//.test(post.url)) detail.mediaType = 'video';
      result.posts.push({ ...post, ...detail });
      await persist();
    } catch (error) {
      if (/control|inactive|unassigned|delegated|EGO_SPACE/i.test(error.message)) throw error;
      result.issues.push('Instagram：' + post.id + ' ' + error.message.slice(0, 150));
      const text = await page.evaluate(() => document.body.innerText);
      if (/验证码|验证你是人类|captcha|Log in to|登录以|登录 Instagram|Sign in to/i.test(text)) throw error;
    }
  }
}

async function collectTikTok() {
  await page.goto('https://www.tiktok.com/@shotpoet_ai', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => [...document.querySelectorAll('a[href]')].some(n => /\/@shotpoet_ai\/(photo|video)\/\d+/.test(n.href)), undefined, { timeout: 20000 });
  await observe();
  const profile = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('h2,h3')].find(n => /粉丝|Followers/i.test(n.innerText) && /已关注|Following/i.test(n.innerText));
    const text = heading?.innerText || '';
    const read = label => { const match = text.match(new RegExp('([\\d,]+)\\s*' + label, 'i')); return match ? Number(match[1].replaceAll(',', '')) : null; };
    return { platform: 'TikTok', handle: 'shotpoet_ai', followers: read('(?:粉丝|Followers)'), following: read('(?:已关注|Following)') };
  });
  if (profile.followers != null || profile.following != null) result.profiles.push(profile);
  const posts = await scrollItems(() => page.evaluate(() => [...document.querySelectorAll('a[href]')].filter(n => /^https:\/\/www\.tiktok\.com\/@shotpoet_ai\/(photo|video)\/\d+$/.test(n.href)).map(n => {
    const match = n.innerText.match(/([\d,.]+)([KMB])?/i);
    return { id: 'tiktok:' + n.href.split('/').pop(), platform: 'TikTok', url: n.href, thumbnailUrl: n.querySelector('img')?.src,
      mediaType: n.href.includes('/photo/') ? 'image' : 'video',
      impressions: match ? Math.round(Number(match[1].replaceAll(',', '')) * ({ K: 1e3, M: 1e6, B: 1e9 }[match[2]?.toUpperCase()] || 1)) : null };
  })));
  for (const post of posts) {
    await page.goto('https://www.tiktok.com/@shotpoet_ai', { waitUntil: 'domcontentloaded', timeout: 30000 });
    const path = new URL(post.url).pathname;
    await page.waitForSelector('a[href$=' + JSON.stringify(path) + ']', { state: 'visible', timeout: 20000 });
    await observe();
    await page.click('a[href$=' + JSON.stringify(path) + ']', { label: '读取 TikTok 帖子互动指标' });
    await page.waitForFunction(() => {
      const count = document.querySelector('[data-e2e="browse-like-count"]')?.textContent.trim();
      return /^[\d,]+(?:\.\d+)?[KMB]?$/i.test(count || '');
    }, undefined, { timeout: 20000 });
    await observe();
    const detail = await page.evaluate(() => {
      const like = document.querySelector('[data-e2e="browse-like-count"]');
      const dialog = like?.closest('[role="dialog"]');
      const read = selector => {
        const text = document.querySelector(selector)?.textContent.trim().replaceAll(',', '');
        const match = text?.match(/^(\d+(?:\.\d+)?)([KMB])?$/i);
        return match ? Math.round(Number(match[1]) * ({ K: 1e3, M: 1e6, B: 1e9 }[match[2]?.toUpperCase()] || 1)) : null;
      };
      const slides = new Map();
      for (const image of dialog?.querySelectorAll('.swiper-slide img') || []) {
        const url = image.currentSrc || image.src;
        const index = image.parentElement.getAttribute('data-swiper-slide-index');
        if (url.startsWith('https://')) slides.set(index === null ? url : Number(index), url);
      }
      const imageUrls = [...new Set([...slides].sort(([a], [b]) =>
        typeof a === 'number' && typeof b === 'number' ? a - b : 0).map(([, url]) => url))];
      return { title: dialog?.querySelector('h1,h2')?.innerText.trim() || '', imageUrls,
        subtitle: dialog?.querySelector('[data-e2e="browse-video-desc"]')?.innerText.trim() || '',
        likes: read('[data-e2e="browse-like-count"]'), comments: read('[data-e2e="browse-comment-count"]'), saves: read('[data-e2e="browse-favorite-count"]') };
    });
    // 作品 ID 的高 32 位是创建时间，详情页只显示相对日期
    const timestamp = Number(BigInt(post.id.slice('tiktok:'.length)) >> 32n) * 1000;
    const publishedAt = timestamp >= 1500000000000 && timestamp <= Date.now() ? timestamp : null;
    result.posts.push({ ...post, ...detail, publishedAt });
    await persist();
  }
}

for (const [platform, collect] of [['X', collectX], ['Instagram', collectInstagram], ['TikTok', collectTikTok]]) {
  try { await collect(); }
  catch (error) {
    result.issues.push(platform + '：' + error.message.slice(0, 300));
    if (/control|inactive|unassigned|delegated|EGO_SPACE/i.test(error.message)) { browserStopped = true; break; }
    try {
      const text = await page.evaluate(() => document.body.innerText);
      if (/验证码|验证你是人类|captcha|Log in to|登录以|登录 Instagram|Sign in to/i.test(text)) { needsUser = true; break; }
    } catch { browserStopped = true; break; }
  }
  await persist();
}
await persist();
if (!browserStopped) {
  if (needsUser) await task.handOff();
  else if (!result.issues.length) await task.finish({ keep: dashboard ? [dashboard.label] : [] });
}
console.log(JSON.stringify({ profiles: result.profiles.length, posts: result.posts.length, issues: result.issues }));
