const { app, dialog, net, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const repository = 'SYTSL/eh-pet';
const versionFile = path.join(__dirname, 'release-version.txt');
const limit = 16 * 1024 * 1024;
let updating = false;

function versionParts(tag) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag)) throw new Error('版本号无效');
  return tag.slice(1).split('.').map(Number);
}

function newer(candidate, installed) {
  const left = versionParts(candidate), right = versionParts(installed);
  const index = left.findIndex((part, i) => part !== right[i]);
  return index !== -1 && left[index] > right[index];
}

async function download(asset, tag) {
  const url = `https://github.com/${repository}/releases/download/${tag}/eh-pet-update.json`;
  if (asset.browser_download_url !== url || !/^sha256:[a-f0-9]{64}$/.test(asset.digest || '') ||
      !Number.isSafeInteger(asset.size) || asset.size <= 0 || asset.size > limit) throw new Error('更新包信息无效');
  const response = await net.fetch(url, {signal:AbortSignal.timeout(120000)});
  if (!response.ok || !response.body) throw new Error('下载更新失败');
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > asset.size) throw new Error('更新包大小不符');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (size !== asset.size || 'sha256:' + createHash('sha256').update(bytes).digest('hex') !== asset.digest) {
    throw new Error('更新包校验失败');
  }
  return JSON.parse(bytes.toString('utf8'));
}

function installPatch(directory, manifest, current, target) {
  if (manifest.version !== target || !Array.isArray(manifest.from) || !manifest.from.includes(current) ||
      !Array.isArray(manifest.files) || !manifest.files.length) throw new Error('该更新包不适用于当前版本');
  const root = fs.realpathSync(directory);
  const seen = new Set();
  const writes = manifest.files.map(({name, base64}) => {
    if (typeof name !== 'string' || !/^[a-z][a-z0-9-]*\.(?:js|mjs|html)$/.test(name) ||
        seen.has(name) || typeof base64 !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      throw new Error('更新文件清单无效');
    }
    seen.add(name);
    return {name, bytes:Buffer.from(base64,'base64')};
  });
  writes.push({name:'release-version.txt', bytes:Buffer.from(target + '\n')});
  const backup = fs.mkdtempSync(path.join(root, '.update-backup-'));
  const applied = [];
  try {
    for (const entry of writes) {
      const file = path.join(root, entry.name);
      const exists = fs.existsSync(file);
      if (exists && !fs.lstatSync(file).isFile()) throw new Error('更新目标不是普通文件');
      if (exists) fs.copyFileSync(file, path.join(backup, entry.name));
      const temp = path.join(backup, entry.name + '.new');
      fs.writeFileSync(temp, entry.bytes, {flag:'wx'});
      fs.renameSync(temp, file);
      applied.push({file, exists, name:entry.name});
    }
  } catch (error) {
    for (const entry of applied.reverse()) {
      if (entry.exists) fs.copyFileSync(path.join(backup, entry.name), entry.file);
      else fs.unlinkSync(entry.file);
    }
    throw error;
  }
}

async function checkUpdate() {
  if (updating) return {ok:true};
  updating = true;
  try {
    const current = fs.readFileSync(versionFile, 'utf8').trim();
    let release;
    try {
      const response = await net.fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
        headers: {Accept:'application/vnd.github+json', 'User-Agent':'eh-pet-updater'},
        signal:AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`GitHub API HTTP ${response.status}`);
      release = await response.json();
    } catch (error) {
      const answer = await dialog.showMessageBox({
        type:'warning', title:'检查更新', message:'桌宠未能连接 GitHub 更新接口',
        detail:`${error.message}\n可以用浏览器查看最新版。`,
        buttons:['打开发布页','关闭'], cancelId:1,
      });
      if (answer.response === 0) await shell.openExternal(`https://github.com/${repository}/releases/latest`);
      return {ok:true};
    }
    const tag = release.tag_name;
    if (!newer(tag, current)) {
      await dialog.showMessageBox({title:'检查更新',message:`当前已是最新版 ${current}`});
      return {ok:true};
    }
    const asset = release.assets?.find(item => item.name === 'eh-pet-update.json');
    if (!asset) throw new Error(`发现新版 ${tag}，请从 GitHub Releases 下载完整便携包`);
    const answer = await dialog.showMessageBox({
      title:'桌宠更新', message:`发现新版 ${tag}`,
      detail:'更新完成后桌宠会自动重启，存档和音乐会保留。',
      buttons:['更新并重启','稍后'], defaultId:0, cancelId:1,
    });
    if (answer.response === 0) {
      const manifest = await download(asset, tag);
      installPatch(__dirname, manifest, current, tag);
      app.relaunch();
      app.quit();
    }
    return {ok:true};
  } finally { updating = false; }
}

module.exports = { checkUpdate, installPatch, newer };
