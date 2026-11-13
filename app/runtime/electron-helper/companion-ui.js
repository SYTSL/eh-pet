const $ = (id) => document.getElementById(id);
const notice = (text) => {
  $('notice').textContent = text;
};
function page(name) {
  if (!['music', 'fortune', 'settings'].includes(name)) return;
  for (const section of document.querySelectorAll('section')) section.hidden = section.id !== name;
  for (const button of document.querySelectorAll('[data-page]'))
    button.classList.toggle('active', button.dataset.page === name);
  notice('');
}
document.querySelectorAll('[data-page]').forEach((button) => (button.onclick = () => page(button.dataset.page)));
window.companion.onPage(page);
page(new URLSearchParams(location.search).get('page') || 'music');
async function call(action, input) {
  try {
    const result = await window.companion.request(action, input);
    if (!result.ok) throw new Error(result.message);
    return result;
  } catch (error) {
    notice(error.message);
    return null;
  }
}
let tracks = [],
  index = 0;
function list(items) {
  tracks = items;
  index = 0;
  $('tracks').replaceChildren();
  tracks.forEach((track, i) => {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = track.name;
    $('tracks').append(option);
  });
  $('player').pause();
  $('player').removeAttribute('src');
  if (tracks.length) $('player').src = tracks[0].url;
  else notice('还没有音乐，请点击「选择音乐」。');
}
async function play(i) {
  if (!tracks.length) return notice('请先选择音乐');
  index = (i + tracks.length) % tracks.length;
  $('tracks').value = index;
  $('player').src = tracks[index].url;
  try {
    await $('player').play();
  } catch {
    notice('无法播放这首音乐，请确认文件可读或选择 MP3/WAV。');
  }
}
$('choose').onclick = async () => {
  const result = await call('music');
  if (result && !result.canceled) {
    list(result.tracks);
    await play(0);
  }
};
$('tracks').onchange = () => play(Number($('tracks').value));
$('previous').onclick = () => play(index - 1);
$('next').onclick = () => play(index + 1);
$('player').onended = () => play(index + 1);
$('player').onerror = () => notice('音乐文件无法播放，可重新选择文件。');
function keyStatus(hasKey) {
  $('key-status').textContent = hasKey ? '✓ 已保存 Token，可直接抽签' : '尚未填写 Token，请在下方粘贴并保存。';
}
async function save(clearKey = false) {
  const result = await call('save', { key: $('key').value.trim(), model: $('model').value.trim(), clearKey });
  if (result) {
    $('key').value = '';
    keyStatus(result.hasKey);
    notice(clearKey ? 'Token 已清除' : '已保存，可以去抽签了');
  }
}
$('save').onclick = () => save();
$('clear').onclick = () => save(true);
$('save-prompt').onclick = async () => {
  if (await call('prompt', $('prompt').value)) notice('提示词已保存，下次抽签生效');
};
$('draw').onclick = async () => {
  $('draw').disabled = true;
  $('draw').textContent = '正在摇签、解签…';
  notice('');
  try {
    const result = await call('fortune', $('question').value);
    if (result) $('result').textContent = result.text;
  } finally {
    $('draw').disabled = false;
    $('draw').textContent = '再抽一签';
  }
};
(async () => {
  const result = await call('status');
  if (result) {
    list(result.tracks);
    keyStatus(result.hasKey);
    $('model').value = result.model;
    $('prompt').value = result.prompt;
  }
})();
