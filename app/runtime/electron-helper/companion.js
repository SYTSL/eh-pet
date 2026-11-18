// Local music and fortune window. Keys stay in the main process, encrypted by the OS.
const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell, net } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { pathToFileURL } = require('node:url');
const { randomInt, randomUUID } = require('node:crypto');
const { rewardEmeralds, claimMiningBoost, restoreMiningBoost, shopRequest, stockRequest } = require('./economy.js');

function installBundledMedia(data) {
  const directory = path.join(data, 'pet', 'eh-animation');
  try {
    const videos = require('./eh-action-videos.js');
    fs.mkdirSync(directory, { recursive: true });
    for (const [name, base64] of Object.entries(videos)) {
      const file = path.join(directory, name + '.webm');
      if (fs.existsSync(file)) continue;
      const temporary = file + '.' + randomUUID() + '.tmp';
      try {
        fs.writeFileSync(temporary, Buffer.from(base64, 'base64'), { flag: 'wx' });
        if (!fs.existsSync(file)) fs.renameSync(temporary, file);
      } catch (error) {
        console.warn('[eh] 动作素材安装失败：' + name, error.message);
      } finally {
        fs.rmSync(temporary, { force: true });
      }
    }
  } catch (error) {
    console.warn('[eh] 附带动作素材不可用', error.message);
  }
}

function installCompanion() {
  const data = path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'dsh-pet');
  fs.mkdirSync(data, { recursive: true });
  installBundledMedia(data);
  const settingsFile = path.join(data, 'companion-settings.json');
  const promptFile = path.join(data, '抽签提示词.txt');
  const musicDir = path.join(path.dirname(process.env.DSH_HOME || data), '音乐');
  fs.mkdirSync(musicDir, { recursive: true });
  if (!fs.existsSync(promptFile)) fs.copyFileSync(path.join(__dirname, 'fortune-prompt.txt'), promptFile);
  let win;
  let fortuneInFlight;
  const localDay = () => {
    const now = new Date();
    return [now.getFullYear(), now.getMonth() + 1, now.getDate()].join('-');
  };
  const optionalNames = ['蹲下', '打哈欠', '吃炸鸡腿', '吃蛋糕', '特殊喝水', '待机（桌面弹弓）'];
  const hasMedia = name => fs.existsSync(path.join(data, 'pet', 'eh-animation', name + '.webm'));
  const weatherFetch = (url, signal) => (net?.fetch ? net.fetch(url, {signal}) : fetch(url, {signal}));
  const mining = new WeakMap();
  let snack;
  const startupAvailable = process.platform === 'win32' && typeof app?.setLoginItemSettings === 'function';
  const startupName = 'eh桌宠';
  const startupOptions = { path: process.execPath, args: [] };
  const startupEntry = () => {
    if (!startupAvailable) return undefined;
    // Electron's legacy openAtLogin checks the app ID, not our custom Run entry name.
    // Its Windows launchItems lookup parses the path as a command line.
    const { launchItems } = app.getLoginItemSettings({ ...startupOptions, path: `"${startupOptions.path}"` });
    return launchItems.find((item) => item.name === startupName && item.scope === 'user');
  };
  const startupEnabled = () => startupEntry()?.enabled === true;
  const read = () => (fs.existsSync(settingsFile) ? JSON.parse(fs.readFileSync(settingsFile, 'utf8')) : {});
  const write = (value) => {
    fs.writeFileSync(settingsFile + '.tmp', JSON.stringify(value, null, 2), { mode: 0o600 });
    fs.renameSync(settingsFile + '.tmp', settingsFile);
  };
  const tracks = (files) =>
    files
      .filter((file) => /\.(mp3|wav|m4a|ogg|flac|aac)$/i.test(file) && fs.existsSync(file))
      .map((file) => ({ name: path.basename(file), url: pathToFileURL(file).href }));
  const musicFiles = (settings) => [...new Set([
    ...(Array.isArray(settings.music) ? settings.music : []),
    ...fs.readdirSync(musicDir).map((name) => path.join(musicDir, name)),
  ])].filter((file) => typeof file === 'string');
  ipcMain.on('pet:companion', (_event, page) => {
    if (win && !win.isDestroyed()) {
      win.show();
      win.focus();
      win.webContents.send('companion:page', page);
      return;
    }
    win = new BrowserWindow({
      width: 590,
      height: 700,
      title: '桌宠小屋',
      backgroundColor: '#f6f3ed',
      webPreferences: {
        preload: path.join(__dirname, 'companion-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    win.loadFile(path.join(__dirname, 'companion.html'), {
      query: { page: ['music', 'fortune', 'settings'].includes(page) ? page : 'music' },
    });
  });
  ipcMain.handle('companion:request', async (event, action, input) => {
    const senderFile = event.sender.getURL?.().split(/[?#]/)[0];
    const petPage = pathToFileURL(path.join(__dirname, 'index.html')).href;
    if ((!win || event.sender !== win.webContents) && senderFile !== petPage) throw new Error('Unauthorized window');
    try {
      if (action === 'stock-status' || action === 'stock-trade') return stockRequest(action, input);
      if (action === 'check-update') return await require('./updates.js').checkUpdate();
      if (action === 'optional-media') return { ok:true, available:optionalNames.filter(hasMedia) };
      if (action === 'shop-status' || action === 'shop-buy') {
        const result = shopRequest(action, input);
        return { ...result, products: result.products.map(product => ({
          ...product, usable: !product.animation || hasMedia(product.animation),
        })) };
      }
      if (action === 'snack-start') {
        if (snack) return { ok:true, played:false };
        const { wallet } = shopRequest('shop-status');
        const candidates = [
          { item:'cocoa', use:'feed', animation:'吃可可果', caught:'偷吃' },
          { item:'chicken', use:'chicken', animation:'吃炸鸡腿', caught:'打断鸡腿' },
          { item:'cake', use:'cake', animation:'吃蛋糕', caught:'打断蛋糕' },
        ].filter(food => wallet[food.item] > 0 && hasMedia(food.animation) && hasMedia(food.caught));
        if (!candidates.length) return { ok:true, played:false };
        const food = candidates[randomInt(candidates.length)];
        const id = randomUUID();
        const release = () => {
          if (snack?.id !== id) return;
          clearTimeout(snack.timeout);
          event.sender.removeListener?.('destroyed', release);
          snack = undefined;
        };
        snack = { id, food, sender:event.sender, release, timeout:setTimeout(release, 30000) };
        snack.timeout.unref?.();
        event.sender.once?.('destroyed', release);
        return { ok:true, played:true, id, animation:food.animation, caught:food.caught };
      }
      if (action === 'snack-cancel' || action === 'snack-eat') {
        if (!snack || snack.id !== input || snack.sender !== event.sender) return { ok:true };
        const { food, release } = snack;
        release();
        return action === 'snack-eat' ? shopRequest('pet-item-action', food.use) : { ok:true };
      }
      if (action === 'pet-item-action') {
        if (snack && snack.food.use === input && shopRequest('shop-status').wallet[snack.food.item] <= 1)
          throw new Error('这份食物正在被偷吃');
        const name = { chicken:'吃炸鸡腿', cake:'吃蛋糕' }[input];
        if (name && !hasMedia(name)) throw new Error('这个进食动作还没有素材，食物已保留');
        return shopRequest(action, input);
      }
      if (action === 'mining-start') {
        shopRequest('pet-item-action', 'mine');
        if (!mining.has(event.sender)) {
          const session = {started:performance.now(), base:0, total:0, boost:claimMiningBoost()};
          session.cleanup = () => {
            if (mining.get(event.sender) !== session) return;
            mining.delete(event.sender);
            if (!session.total) restoreMiningBoost(session.boost);
          };
          mining.set(event.sender, session);
          event.sender.once?.('destroyed', session.cleanup);
        }
        return { ok: true };
      }
      if (action === 'mining-tick' || action === 'mining-stop') {
        const session = mining.get(event.sender);
        let earned = 0;
        if (session) {
          const minutes = Math.floor((performance.now() - session.started) / 60000);
          try {
            let base = session.base;
            for (let minute = 0; minute < minutes; minute++) base += randomInt(15, 31);
            const total = Math.round(base * session.boost / 100);
            earned = total - session.total;
            if (earned) {
              rewardEmeralds(earned);
              session.started += minutes * 60000;
              session.base = base;
              session.total = total;
            }
          } finally {
            if (action === 'mining-stop') {
              event.sender.removeListener?.('destroyed', session.cleanup);
              session.cleanup();
            }
          }
        }
        return { ok: true, earned, total:session?.total ?? 0 };
      }
      const settings = read();
      if (action === 'startup') {
        if (!startupAvailable) throw new Error('请使用 Windows 桌宠 EXE 设置自启动');
        if (input !== undefined) {
          if (!input || typeof input.enabled !== 'boolean') throw new Error('自启动设置格式错误');
          app.setLoginItemSettings({ ...startupOptions, name: startupName, openAtLogin: input.enabled, enabled: input.enabled });
          const entry = startupEntry();
          if (input.enabled ? entry?.enabled !== true : entry !== undefined) {
            const message = 'Windows 未确认自启动设置已更新';
            const answer = await dialog.showMessageBox({
              type: 'warning',
              title: '开机自启动',
              message,
              detail: '可以在 Windows 的启动应用设置中检查 eh桌宠 的状态。',
              buttons: ['打开启动应用设置', '关闭'],
              cancelId: 1,
            });
            if (answer.response === 0) await shell.openExternal('ms-settings:startupapps');
            throw new Error(message);
          }
        }
        return { ok: true, autoStart: startupEnabled(), startupAvailable };
      }
      if (action === 'confirm-delete') {
        const owner = BrowserWindow.fromWebContents?.(event.sender) || win;
        const answer = await dialog.showMessageBox(owner, { type:'question',title:'删除桌宠',message:'删除当前这只桌宠？',detail:'其他桌宠、角色素材和设置会保留。',buttons:['取消','删除这只'],defaultId:0,cancelId:0 });
        return { ok:true,confirmed:answer.response===1 };
      }
      if (action === 'preferences') {
        if (!input || typeof input !== 'object') throw new Error('设置格式错误');
        const previous = settings.preferences || {};
        const next = { ...previous };
        if (input.size !== undefined) {
          if (!Number.isFinite(input.size) || input.size < 240 || input.size > 800)
            throw new Error('大小范围为 240–800');
          next.size = input.size;
        }
        for (const key of ['physics', 'chatter', 'water']) if (typeof input[key] === 'boolean') next[key] = input[key];
        if (typeof input.city === 'string') next.city = input.city.trim().slice(0, 80);
        if (input.ackWater) next.lastWaterAt = Date.now();
        if (!next.lastWaterAt) next.lastWaterAt = Date.now();
        write({ ...settings, preferences: next });
        return { ok: true, preferences: next };
      }
      if (action === 'weather') {
        const city = String(input || settings.preferences?.city || '')
          .trim()
          .slice(0, 80);
        if (!city) throw new Error('先在设置里填写天气城市吧');
        const signal = AbortSignal.timeout(18000);
        const normalized = city.replace(/，/g, ',');
        const names = [...new Set([normalized, normalized.replace(/市(?=,|$)/, ''), ...city.split(/\s*[／/]\s*/)].filter(Boolean))];
        let location;
        for (const name of names) {
          const geo = await weatherFetch('https://geocoding-api.open-meteo.com/v1/search?count=5&language=zh&name=' + encodeURIComponent(name), signal);
          if (!geo.ok) throw new Error('城市查询暂不可用（' + geo.status + '）');
          const results = (await geo.json()).results || [];
          location = results.find(place => place.name === name) || results[0];
          if (location) break;
        }
        if (!location) throw new Error('没找到这个城市，试试拼音或英文名');
        const response = await weatherFetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&current=temperature_2m,apparent_temperature,weather_code&timezone=auto`,
          signal,
        );
        if (!response.ok) throw new Error('天气服务暂不可用');
        const current = (await response.json()).current;
        if (!current || !Number.isFinite(current.temperature_2m)) throw new Error('没有收到有效天气数据');
        const code = current.weather_code;
        const sky =
          code === 0
            ? '晴天 ☀'
            : code == null ? '天气状况未知'
            : code <= 3
              ? '多云 ☁'
              : code <= 48
                ? '有雾'
                : code <= 67
                  ? '下雨啦 ☂'
                  : code <= 77
                    ? '下雪啦 ❄'
                    : code <= 82
                      ? '阵雨 ☂'
                      : code <= 86
                        ? '阵雪 ❄'
                        : '雷雨 ⛈';
        return {
          ok: true,
          text: `${location.name} · ${sky}\n气温 ${current.temperature_2m}°C，体感 ${current.apparent_temperature}°C\n更新 ${String(current.time || '').replace('T', ' ')}（当地时间）\n天气来源 Open-Meteo`,
        };
      }
      if (action === 'status')
        return {
          ok: true,
          preferences: { ...settings.preferences, autoStart: startupEnabled() },
          startupAvailable,
          optionalMedia: optionalNames.filter(hasMedia),
          hasKey: !!settings.encryptedKey,
          model: settings.model || 'deepseek-flash',
          prompt: fs.readFileSync(promptFile, 'utf8'),
          tracks: tracks(musicFiles(settings)),
        };
      if (action === 'music') {
        const owner = BrowserWindow.fromWebContents?.(event.sender) || win;
        const result = await dialog.showOpenDialog(owner, {
          title: '选择本地音乐（可多选）',
          defaultPath: musicDir,
          properties: ['openFile', 'multiSelections'],
          filters: [{ name: '音乐', extensions: ['mp3', 'wav', 'm4a', 'ogg', 'flac', 'aac'] }],
        });
        if (result.canceled) return { ok: true, canceled: true };
        const latest = read();
        const music = [...new Set([...musicFiles(latest), ...result.filePaths])];
        write({ ...latest, music });
        return { ok: true, tracks: tracks(music), added: pathToFileURL(result.filePaths[0]).href };
      }
      if (action === 'save') {
        if (typeof input?.model !== 'string' || !/^[\w.-]{1,100}$/.test(input.model))
          throw new Error('请填写有效的模型名称');
        if (input.key) {
          if (typeof input.key !== 'string' || /\s/.test(input.key) || input.key.length > 4096)
            throw new Error('Token 格式不正确');
          if (!safeStorage.isEncryptionAvailable()) throw new Error('系统加密不可用，未保存密钥');
          settings.encryptedKey = safeStorage.encryptString(input.key).toString('base64');
        }
        if (input.clearKey) delete settings.encryptedKey;
        settings.model = input.model;
        write(settings);
        return { ok: true, hasKey: !!settings.encryptedKey };
      }
      if (action === 'prompt') {
        if (typeof input !== 'string' || !input.trim() || input.length > 12000)
          throw new Error('提示词须为 1–12000 字');
        fs.writeFileSync(promptFile, input, 'utf8');
        return { ok: true };
      }
      if (action === 'fortune') {
        const day = localDay();
        if (settings.dailyFortune?.day === day && typeof settings.dailyFortune.text === 'string')
          return { ok:true, text:settings.dailyFortune.text };
        if (fortuneInFlight?.day === day) return await fortuneInFlight.promise;
        if (!settings.encryptedKey) throw new Error('请先到「Token 设置」填写 DeepSeek API Token');
        if (typeof input !== 'string' || input.length > 500) throw new Error('问题请控制在 500 字以内');
        const promise = (async () => {
          const number = randomInt(1, 101);
          const levels = ['上上签', '上签', '中上签', '中签', '小吉签'];
          const level = levels[randomInt(levels.length)];
          const response = await fetch('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            signal: AbortSignal.timeout(60000),
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + safeStorage.decryptString(Buffer.from(settings.encryptedKey, 'base64')),
            },
            body: JSON.stringify({
              model: settings.model || 'deepseek-flash',
              thinking: { type: 'disabled' },
              stream: false,
              max_tokens: 800,
              messages: [
                { role: 'system', content: fs.readFileSync(promptFile, 'utf8') },
                {
                  role: 'user',
                  content: `第${number}签，${level}。想问：${input.trim() || '今日小运势'}。请按给定签号和签级解签。`,
                },
              ],
            }),
          });
          if (!response.ok)
            throw new Error(
              response.status === 401
                ? 'Token 无效，请重新填写'
                : response.status === 402
                  ? 'API 余额不足'
                  : response.status === 429
                    ? '请求太频繁，请稍后再试'
                    : `DeepSeek 请求失败（${response.status}）`,
            );
          const body = await response.json();
          const text = body.choices?.[0]?.message?.content;
          if (!text) throw new Error('没有收到解签内容，请重试');
          const result = `第 ${number} 签 · ${level}\n\n${text}`;
          write({ ...read(), dailyFortune: {day, text:result} });
          return { ok: true, text:result };
        })();
        fortuneInFlight = {day, promise};
        try { return await promise; }
        finally { if (fortuneInFlight?.promise === promise) fortuneInFlight = undefined; }
      }
      throw new Error('未知操作');
    } catch (error) {
      return {
        ok: false,
        message:
          error.name === 'TimeoutError'
            ? '请求超时，请稍后重试'
            : error.message === 'fetch failed'
              ? '网络连接失败，请检查网络'
              : error.message,
      };
    }
  });
}
module.exports = { installCompanion };
