const collectionDialog = document.getElementById('collection-settings');
const collectionElement = id => document.getElementById('collection-' + id);
let collectionDirty = false, collectionBusy = false, collectionStatus, collectionPoll;
const collectionTime = value => value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'short', timeStyle: 'medium' }).format(value) : '暂无记录';
function renderCollection(status) {
  collectionStatus = status;
  if (!collectionDirty) {
    collectionElement('enabled').checked = status.enabled;
    collectionElement('interval').value = status.intervalMinutes;
  }
  collectionElement('state').textContent = status.running ? '正在采集三个平台…' : status.enabled ? '自动采集已开启' : '已暂停自动采集';
  collectionElement('last').textContent = collectionTime(status.lastRunAt);
  collectionElement('success').textContent = collectionTime(status.lastSuccessAt);
  collectionElement('next').textContent = status.enabled ? collectionTime(status.nextRunAt) : '已暂停';
  collectionElement('readonly').hidden = status.canManage;
  for (const control of collectionElement('form').elements) control.disabled = !status.canManage || collectionBusy;
  collectionElement('run').disabled = !status.canManage || collectionBusy || status.running;
  collectionElement('results').replaceChildren();
  for (const platform of status.lastResult?.platforms || []) {
    const item = document.createElement('li');
    item.textContent = platform.platform + '：' + (platform.ok ? '成功，保存 ' + platform.posts + ' 条帖子' : '采集或保存失败');
    collectionElement('results').append(item);
  }
  if (!collectionDirty) collectionElement('message').textContent = status.lastResult?.issues?.join('\n') || (status.lastResult?.ok ? '最近一轮采集成功。' : '设置保存后按下次采集时间执行，也可立即采集一次。');
}
async function fetchCollection(path = '', options) {
  const response = await fetch('/api/auto-collection' + path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '自动采集服务暂不可用');
  return result;
}
async function loadCollection() {
  try {
    const previous = collectionStatus;
    const status = await fetchCollection();
    renderCollection(status);
    if (previous?.running && !status.running) dashboardView.querySelector('#refresh')?.click();
  } catch (error) {
    collectionElement('state').textContent = '采集服务不可用';
    collectionElement('message').textContent = error.message;
    for (const control of collectionElement('form').elements) control.disabled = true;
  }
}
document.addEventListener('click', async event => {
  if (!event.target.closest('[data-open-collection]')) return;
  collectionDirty = false;
  collectionDialog.showModal();
  await loadCollection();
  clearInterval(collectionPoll);
  collectionPoll = setInterval(loadCollection, 5000);
});
collectionElement('close').onclick = () => collectionDialog.close();
collectionDialog.addEventListener('close', () => clearInterval(collectionPoll));
collectionElement('form').addEventListener('input', () => { collectionDirty = true; });
for (const button of document.querySelectorAll('[data-interval]')) button.onclick = () => {
  collectionElement('interval').value = button.dataset.interval;
  collectionDirty = true;
};
collectionElement('form').onsubmit = async event => {
  event.preventDefault();
  if (!collectionElement('form').reportValidity()) return;
  collectionBusy = true;
  let message;
  collectionElement('save').disabled = true;
  try {
    const status = await fetchCollection('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: collectionElement('enabled').checked, intervalMinutes: Number(collectionElement('interval').value) }) });
    collectionDirty = false;
    collectionBusy = false;
    renderCollection(status);
    message = '设置已保存。';
  } catch (error) { message = error.message; }
  finally { collectionBusy = false; if (collectionStatus) renderCollection(collectionStatus); if (message) collectionElement('message').textContent = message; }
};
collectionElement('run').onclick = async () => {
  collectionBusy = true;
  let message;
  collectionElement('run').disabled = true;
  try { const status = await fetchCollection('/run', { method: 'POST' }); collectionBusy = false; renderCollection(status); }
  catch (error) { message = error.message; }
  finally { collectionBusy = false; if (collectionStatus) renderCollection(collectionStatus); if (message) collectionElement('message').textContent = message; }
};
