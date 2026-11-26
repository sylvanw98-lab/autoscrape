const dashboardView = document.getElementById('dashboard-view');
const overviewStyle = document.getElementById('overview-style');
const platformStyle = document.getElementById('platform-style');
const platformNames = new Set(['X', 'Instagram', 'TikTok']);
const views = new Map();
let activePlatform;

function showPlatform(platform) {
  if (platform === activePlatform) return;
  activePlatform = platform;
  overviewStyle.media = platform ? 'not all' : 'all';
  platformStyle.media = platform ? 'all' : 'not all';
  const saved = views.get(platform);
  if (saved) {
    dashboardView.replaceChildren(saved.view);
    saved.draw?.();
    return;
  }
  const template = document.getElementById(platform ? 'platform-template' : 'overview-template');
  const view = document.createElement('div');
  view.append(template.content.cloneNode(true));
  dashboardView.replaceChildren(view);
  const draw = platform ? initPlatform(view, choosePlatform, platform) : initOverview(view, choosePlatform);
  views.set(platform, { view, draw });
}

function choosePlatform(platform) {
  if (platform === activePlatform) return;
  const url = new URL(location.href);
  if (platform) url.searchParams.set('platform', platform);
  else url.searchParams.delete('platform');
  history.pushState(null, '', url);
  showPlatform(platform);
  dashboardView.querySelector('#platform-tabs [aria-pressed="true"]')?.focus({ preventScroll: true });
}

function showLocation() {
  const platform = new URLSearchParams(location.search).get('platform');
  showPlatform(platformNames.has(platform) ? platform : '');
}

window.addEventListener('popstate', showLocation);
showLocation();
