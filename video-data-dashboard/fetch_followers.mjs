// 从已登录的创作者后台读取明确标注的账号粉丝总数
async function captureFollowers(page, fs, root, platform) {
  try {
    const home = {
      xhs: "https://creator.xiaohongshu.com/",
      douyin: "https://creator.douyin.com/creator-micro/home",
      channels: "https://channels.weixin.qq.com/platform",
    };
    await page.goto(home[platform]);
    const countOnPage = () => {
      const pattern = /^(?:(?:粉丝总数|粉丝数|总粉丝数|粉丝量|粉丝累计数量|粉丝总量|粉丝)\s*[:：]?\s*([\d,]+)|([\d,]+)\s*(?:粉丝总数|粉丝数|总粉丝数|粉丝量|粉丝累计数量|粉丝总量|粉丝))$/;
      const values = new Set();
      for (const element of document.querySelectorAll("a, div, span, p, dt, dd, strong")) {
        if (!element.getClientRects().length) continue;
        const match = element.innerText?.trim().match(pattern);
        if (match) values.add(Number((match[1] || match[2]).replaceAll(",", "")));
      }
      if (values.size !== 1) return null;
      const [followers] = values;
      return Number.isSafeInteger(followers) ? followers : null;
    };
    await page.waitForFunction(() => document.body?.innerText.includes("粉丝"), undefined, { timeout: 5000 });
    const followers = await page.evaluate(countOnPage);
    if (followers !== null) {
      const fetchedAt = Date.now();
      const directory = root + "data/raw/" + ACCOUNT_TYPE + "/followers/" + platform;
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(directory + "/" + fetchedAt + ".json", JSON.stringify({ fetchedAt, followers }));
    } else {
      console.log(platform + "：页面没有可确认的粉丝总数");
    }
  } catch (error) {
    if (/control|inactive|unassigned|delegated|EGO_SPACE/i.test(error.message)) throw error;
    console.log(platform + "：未读取到账号粉丝总数");
  }
}
