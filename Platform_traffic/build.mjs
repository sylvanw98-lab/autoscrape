import { mkdirSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
mkdirSync('dist/server', { recursive: true });
mkdirSync('dist/.openai', { recursive: true });
copyFileSync('.openai/hosting.json', 'dist/.openai/hosting.json');
const dashboardHtml = readFileSync('worker/dashboard.html', 'utf8');
const platformHtml = readFileSync('worker/platform-dashboard.html', 'utf8');
const navigation = readFileSync('worker/navigation.js', 'utf8');
const collectionSettings = readFileSync('worker/collection-settings.html', 'utf8');
const collectionScript = readFileSync('worker/collection-settings.js', 'utf8');
function section(html, tag) {
  const match = html.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!match) throw new Error(`Missing dashboard <${tag}>`);
  return match[1];
}
const html = dashboardHtml
  .replace('<script>', () => collectionSettings + '<script>')
  .replace('<style>', '<style id="overview-style">')
  .replace('</head>', () => `<style id="platform-style" media="not all">${section(platformHtml, 'style')}</style>
<style>.intro-actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}</style></head>`)
  .replace(/<main>[\s\S]*?<\/main>/, () => `<main id="dashboard-view"></main>
<template id="overview-template">${section(dashboardHtml, 'main')}</template>
<template id="platform-template">${section(platformHtml, 'main')}</template>`)
  .replace(/<script>[\s\S]*?<\/script>/, () => `<script>
function initOverview(view, choosePlatform) {${section(dashboardHtml, 'script')}}
function initPlatform(view, choosePlatform, platform) {${section(platformHtml, 'script')}}
${navigation}
${collectionScript}
</script>`);
const source = readFileSync('worker/index.js', 'utf8');
writeFileSync('dist/server/index.js', source.replace("'__DASHBOARD__'", () => JSON.stringify(html)));
