// Head-mounted controls share the pet's existing transparent window and input regions.
(() => {
  const words = [
    "忙活半天啦，出去溜达溜达吗",
    "该睡觉了……吧……zZZ",
    "困了，发一会儿呆……",
    "呼呼，冰激凌~",
    "蛋糕，嗯……好吃",
    "哇，吓我一跳！",
    "走走",
    "听歌吗🎶🎶？",
    "慢慢来~",
    "别皱眉啦，揉揉~🤲",
    "发呆也挺好玩的（）",
    "陪我玩……",
    "困了就眯一会儿。",
    "今天吃点好的，饼干、巧克力、炸鸡……",
    "我收集了一点点阳光，分你一半",
    "醒了，伸个懒腰（）",
    "要不要做眼保健操（）",
    "今天不必事事满分。",
    "你慢慢忙，我眯一会儿。",
    "陪伴模式：挂机中。🤖",
    "深呼吸一下？",
    "我把小星星藏进你的口袋啦。",
    "想不出办法的时候，休息也算办法。",
    "今天有什么让你笑了一下？",
    "我已经准备好接收摸摸了。",
    "看看窗外的云☁",
    "🪨\n🔥",
    "养猪🐖",
    "☁",
    "睡大觉（）🛏",
    "哪怕只做了一点点，也该夸夸。",
    "你忙你的，我在这趴会儿。",
    "什么开心的事？",
    "呜哇~ 今天的可爱份额留好了⭐",
    "来一起听喜欢的歌，有空吗🔈",
    "不催你，在这陪着你。",
    "零食可以分我一点点想象中的。",
    "事情一件一件做，饭一口口吃。",
    "申请五分钟的陪玩时间。",
    "慢慢走，也是在往前走。",
    "休息一会儿，发会呆……",
    "在干嘛",
    "上个厕所（）",
    "欧耶欧耶",
    "欧漏",
    ":00",
    "🦐🦐",
    "棒棒糖🍭",
    "玩手机玩的（）",
    "（）",
    "到哪了（指进度）",
    "刚醒",
    "安安安zZz…",
    "在干嘛呀？",
    "刚才在看戴佳伟直播（）",
    "刷小视频👀",
    "刷贴吧👣",
    "刷小红书📕",
    "刷抖音🎶"
];
  const css = document.createElement('style');
  let phraseBag = [], lastPhrase;
  const nextPhrase = () => {
    if (!phraseBag.length) {
      phraseBag = words.slice();
      for (let i = phraseBag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [phraseBag[i], phraseBag[j]] = [phraseBag[j], phraseBag[i]];
      }
      if (phraseBag[phraseBag.length - 1] === lastPhrase) [phraseBag[0], phraseBag[phraseBag.length - 1]] = [phraseBag[phraseBag.length - 1], phraseBag[0]];
    }
    return lastPhrase = phraseBag.pop();
  };
  css.textContent = `.eh-head{position:absolute;left:50%;transform:translateX(-50%);z-index:500;background:#fffaf3;color:#385447;border:1px solid #d5e4ce;border-radius:22px;padding:14px 16px;box-shadow:0 5px 20px #263a2826;font:14px/1.55 'Microsoft YaHei',sans-serif;pointer-events:auto;box-sizing:border-box;max-height:330px;overflow:auto;white-space:normal}.eh-head[hidden]{display:none}.eh-head button{background:#e8f0df;border:0;border-radius:12px;padding:7px 11px;margin:3px;color:#37513f;cursor:pointer;font:inherit}.eh-head input,.eh-head select{box-sizing:border-box;width:100%;padding:7px;border:1px solid #d7e2d0;border-radius:9px;margin:4px 0 8px;font:inherit}.eh-head input[type=checkbox]{width:auto}.eh-head audio{width:100%;height:34px}.eh-head h4{margin:0 0 8px}.eh-head p{margin:8px 0;white-space:pre-wrap}.eh-head .close{float:right;padding:1px 7px}.eh-head small{color:#7b8776}.eh-head input[type=range]{padding:0}`;
  document.head.appendChild(css);
  const settingsStyle = document.createElement('style');
  settingsStyle.textContent = `
    .eh-head:is([data-mode="message"],[data-mode="mining-emoji"]){max-height:none;overflow:visible;cursor:pointer}
    .eh-head:is([data-mode="message"],[data-mode="mining-emoji"])::after{content:'';position:absolute;left:var(--eh-tail-x,50%);bottom:-8px;width:14px;height:14px;background:#fffaf3;border-right:1px solid #d5e4ce;border-bottom:1px solid #d5e4ce;transform:translateX(-50%) rotate(45deg);pointer-events:none}
    .eh-head:is([data-mode="message"],[data-mode="mining-emoji"]) p{font-size:30px;line-height:1.45;overflow-wrap:anywhere;margin:4px 0}
    .eh-head[data-mode="mining-emoji"]{padding:7px 13px;border-radius:14px}
    .eh-head[data-mode="mining-emoji"] p{font-size:27px;line-height:1.25;margin:0}
    .eh-head{font-family:'Microsoft YaHei UI','Segoe UI',sans-serif;padding:16px 18px;scrollbar-width:thin;scrollbar-color:#c6d5c0 transparent}
    .eh-head h4{font-size:16px;line-height:28px;margin-bottom:14px}
    .eh-head label.eh-field{display:block;clear:both;margin:0 0 14px;font-size:13px;font-weight:600;line-height:1.5}
    .eh-head .eh-field>span{display:block;margin-bottom:6px}
    .eh-head .eh-field input{display:block;margin:0;height:36px;font-size:13px;font-weight:400;background:#fff;border-color:#d9e3d4}
    .eh-head .eh-field input[type=range]{height:22px;accent-color:#5b8265;background:transparent}
    .eh-head label.eh-toggle{display:grid;grid-template-columns:minmax(0,1fr) 36px;gap:12px;align-items:center;min-height:48px;margin:0;padding:10px 0;border-top:1px solid #e6ecdf;font-weight:500}
    .eh-head .eh-toggle>span{margin:0;line-height:1.45}
    .eh-head .eh-toggle small{display:block;font-size:11px;font-weight:400;margin-top:3px;color:#7b8879}
    .eh-head .eh-toggle input[type=checkbox]{appearance:none;-webkit-appearance:none;display:block;position:relative;width:36px;height:21px;min-width:36px;margin:0;padding:0;border:0;border-radius:20px;background:#c6cfc2;cursor:pointer;transition:background .15s}
    .eh-head .eh-toggle input[type=checkbox]::after{content:'';position:absolute;width:15px;height:15px;top:3px;left:3px;border-radius:50%;background:white;box-shadow:0 1px 3px #0002;transition:transform .15s}
    .eh-head .eh-toggle input[type=checkbox]:checked{background:#5b8265}
    .eh-head .eh-toggle input[type=checkbox]:checked::after{transform:translateX(15px)}
    .eh-head input:focus-visible,.eh-head button:focus-visible{outline:2px solid #5b8265;outline-offset:2px}
    .eh-head .eh-toggle+.eh-field:not(.eh-toggle){margin-top:16px}
    .eh-head .eh-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}
    .eh-head .eh-actions button{margin:0;font-size:12px;padding:8px 12px}
    .eh-head .eh-actions button:first-child{background:#52765a;color:#fff}
    .eh-head .eh-feedback{font-size:12px;color:#71816b;margin:10px 0 0}
    .eh-head .eh-size-value{float:right;font-size:12px;font-weight:400;color:#7b8879}
    .eh-shop-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
    .eh-wallet-balance{display:inline-flex;align-items:center;gap:4px;margin-left:10px;color:#4e7056;font-size:12px;font-weight:500;line-height:1;vertical-align:middle;font-variant-numeric:tabular-nums}
    .eh-shop-slot{position:relative;min-width:0;padding:5px;border:1px solid #d9e4d2;border-radius:10px;background:#f3f6eb;text-align:center}
    .eh-shop-art{position:relative;display:grid;place-items:center;height:55px;border-radius:7px;background:#eaf0e2;outline-offset:-2px}
    .eh-shop-icon{display:block;width:36px;height:36px;object-fit:contain;mix-blend-mode:multiply}
    .eh-shop-pickaxe{background:url('./shop-assets/pickaxes.png') left center/600% 100% no-repeat;image-rendering:pixelated}
    .eh-shop-name{position:absolute;inset:auto 2px 3px;padding:2px;background:#355441;color:#fff;border-radius:4px;font-size:11px;opacity:0;pointer-events:none}
    .eh-shop-slot:hover .eh-shop-name,.eh-shop-slot:focus-within .eh-shop-name{opacity:1}
    .eh-shop-count,.eh-head .eh-shop-slot button{box-sizing:border-box;display:flex;justify-content:center;align-items:center;gap:3px;width:100%;min-height:24px;margin:4px 0 0;padding:2px;font-size:12px;font-variant-numeric:tabular-nums}
    .eh-shop-cost{width:13px;height:13px;object-fit:contain;mix-blend-mode:multiply}
    .eh-head .eh-shop-slot input[type=number]{padding:2px 3px;margin:4px 0 0;text-align:center;font-size:12px}
    .eh-shop-slot button:disabled{opacity:.62;cursor:default}
  `;
  document.head.appendChild(settingsStyle);
  const P = PetSprite.prototype;
  const messageScale = 0.4;
  const isSpeech = mode => mode === 'message' || mode === 'mining-emoji';
  P.headRequest = async function (action, input) {
    const result = await window.petBridge.companionRequest(action, input);
    if (!result.ok) throw new Error(result.message || '操作失败');
    return result;
  };
  P.resizeHeadPet = function (width) {
    width = Math.max(240, Math.min(1200, width));
    const ratio = width / this.size;
    for (const key of ['size', 'height', 'halfW', 'halfH', 'bottomPad', 'winH', 'sideAllow']) this[key] *= ratio;
    this.size = width;
    for (const key of Object.keys(this.hitRect)) this.hitRect[key] *= ratio;
    const m = width * WINDOW_MARGIN_RATIO;
    this.margin = { l: m, r: m, b: m, t: Math.max(m, 360) };
    this.el.style.left = m + 'px';
    this.el.style.top = this.margin.t + 'px';
    this.el.style.setProperty('--pet-size', width + 'px');
    this.stage.style.transform = `translateY(${this.bottomPad}px)`;
    this.space = null;
    this.position();
    this.layoutHead();
  };
  P.layoutHead = function () {
    if (!this.headPanel) return;
    this.headPanel.style.bottom = this.height * 0.9 + 'px';
    const width = Math.min(350, Math.max(230, this.size * 0.68)) + 'px';
    this.headPanel.style.width = isSpeech(this.headMode) ? 'max-content' : width;
    this.headPanel.style.maxWidth = isSpeech(this.headMode) ? width : '';
    this.headPanel.style.marginLeft = '0px';
    this.headPanel.style.marginBottom = '0px';
    this.headPanel.style.removeProperty('--eh-tail-x');
    const bounds = this.visibleClampRect();
    const rect = this.headPanel.getBoundingClientRect();
    if (bounds && rect.width && !this.headPanel.hidden) {
      const dx = Math.max(bounds.x - rect.left, Math.min(0, bounds.x + bounds.w - rect.right));
      const dy = Math.max(bounds.y - rect.top, Math.min(0, bounds.y + bounds.h - rect.bottom));
      this.headPanel.style.marginLeft = dx + 'px';
      this.headPanel.style.marginBottom = -dy + 'px';
      if (isSpeech(this.headMode)) {
        const offset = -dx / (this.headMode === 'message' ? messageScale : 1);
        this.headPanel.style.setProperty('--eh-tail-x', `clamp(14px, calc(50% + ${offset}px), calc(100% - 14px))`);
      }
    }
    this.syncInputBusy();
  };
  P.closeHead = function () {
    clearTimeout(this.headHide);
    if (this.headPanel) this.headPanel.hidden = true;
    this.headMode = null;
    this.syncInputBusy();
  };
  P.makeHead = function (title, mode) {
    this.stopMove();
    this.stopThrow();
    clearTimeout(this.headHide);
    this.headMode = mode;
    this.headPanel.dataset.mode = mode;
    this.headPanel.style.transform = mode === 'message' ? `translateX(-50%) scale(${messageScale})` : 'translateX(-50%)';
    this.headPanel.style.transformOrigin = 'bottom center';
    this.headPanel.hidden = false;
    this.headPanel.replaceChildren();
    const close = document.createElement('button');
    close.className = 'close';
    close.textContent = '×';
    close.setAttribute('aria-label', '关闭气泡');
    close.onclick = () => (this.waterPending ? this.ackWater() : this.closeHead());
    const heading = document.createElement('h4');
    heading.textContent = title;
    if (!isSpeech(mode)) this.headPanel.append(close);
    if (title) this.headPanel.append(heading);
    this.layoutHead();
    this.setInteractive(true);
    return this.headPanel;
  };
  P.headText = function (text, mode = 'message', timeout = 10000) {
    if (this.waterPending && mode !== 'water') return;
    const box = this.makeHead(mode === 'water' ? '💧 喝水时间到啦' : '', mode);
    const p = document.createElement('p');
    p.textContent = text;
    if (isSpeech(mode)) {
      p.tabIndex = 0;
      p.setAttribute('role', 'button');
      p.onkeydown = (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          box.click();
        }
      };
    }
    box.append(p);
    this.layoutHead();
    box.onclick = () => {
      if (mode === 'water') this.ackWater();
      else this.closeHead();
    };
    if (timeout)
      this.headHide = setTimeout(() => {
        if (this.headMode === mode) this.closeHead();
      }, timeout);
  };
  P.ackWater = function () {
    this.waterPending = false;
    this.waterSince = 0;
    this.prefs.lastWaterAt = Date.now();
    this.headPanel.style.fontSize = '14px';
    this.resizeHeadPet(this.prefs.size || this.baseHeadSize);
    this.closeHead();
    void this.headRequest('preferences', { ackWater: true }).catch(() => {});
  };
  P.setupHeadUI = async function () {
    this.baseHeadSize = this.size;
    window.petBridge.onGameReturn?.((point) => {
      if (this.ac.signal.aborted) return;
      this.stopMove(); this.stopThrow();
      const x = toLocal(point.x) - VIEW.x - this.halfW;
      const y = toLocal(point.y) - VIEW.y - this.halfH;
      this.customPos = { rx: (x + this.halfW) / VIEW.w, ry: (y + this.halfH) / VIEW.h };
      this.position();
    });
    this.headPanel = document.createElement('div');
    this.headPanel.className = 'eh-head';
    this.headPanel.hidden = true;
    this.headPanel.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.el.append(this.headPanel);
    this.musicAudio = new Audio();
    this.musicAudio.volume = 0.5;
    this.attachStagedAudio?.();
    this.prefs = { physics: true, chatter: true, water: true, lastWaterAt: Date.now() };
    this.headStatus = { hasKey: false, model: 'deepseek-flash' };
    try {
      const status = await this.headRequest('status');
      if (this.ac.signal.aborted) return;
      Object.assign(this.prefs, status.preferences);
      this.prefs.lastWaterAt = Date.now();
      this.headTracks = status.tracks;
      this.headStatus = status;
      this.resizeHeadPet(this.prefs.size || this.baseHeadSize);
    } catch (error) {
      console.warn('[eh] settings unavailable', error.message);
    }
    // Ordinary phrases are click-only; hydration keeps its separate timer.
    this.headWaterTimer = setInterval(() => {
      if (!this.prefs.water && !this.waterPending) return;
      if (!this.waterPending && Date.now() - this.prefs.lastWaterAt >= 3600000) {
        this.waterPending = true;
        this.waterSince = Date.now();
        this.headText('该喝水啦～喝一口水，再点点我！\n点击人物或气泡，恢复原来大小。', 'water', 0);
      }
      if (this.waterPending) {
        // Growth continues to a screen-friendly upper bound; the reminder remains until acknowledged.
        const baseSize = this.prefs.size || this.baseHeadSize;
        const width = Math.min(1000, baseSize * 1.75, baseSize + Math.floor((Date.now() - this.waterSince) / 5000) * 10);
        const scale = width / baseSize;
        this.resizeHeadPet(width);
        this.headPanel.style.fontSize = 14 * scale + 'px';
      }
    }, 1000);
  };
  P.disposeHeadUI = function () {
    clearTimeout(this.headHide);
    clearInterval(this.headWaterTimer);
    this.musicAudio?.pause();
    this.headPanel?.remove();
  };
  const click = P.onClick;
  P.onClick = function (event) {
    if (this.dragState.active || this.dragState.dragging || this.justDragged) return click.call(this, event);
    if (this.waterPending) {
      this.ackWater();
      return;
    }
    click.call(this, event);
    if (this.stagedAction?.kind === 'mine') return;
    if (!event.ctrlKey && !event.metaKey && this.prefs?.chatter && (!this.headMode || this.headMode === 'message'))
      this.headText(nextPhrase());
  };
  const startThrow = P.startThrow;
  P.startThrow = function (x, y, ...rest) {
    if (this.prefs?.physics === false) {
      this.stopThrow();
      this.customPos = { rx: (x + this.halfW) / VIEW.w, ry: (y + this.halfH) / VIEW.h };
      this.position();
      return;
    }
    return startThrow.call(this, x, y, ...rest);
  };
  const deskHit = P.onDeskHit;
  P.onDeskHit = function (...args) {
    if (this.prefs?.physics !== false) return deskHit.apply(this, args);
  };
  P.openHeadFeature = async function (page) {
    if (this.waterPending) {
      this.headText('先喝一口水，再点我解除提醒吧～', 'water', 0);
      return;
    }
    if (page === 'shop' || page === 'bag') {
      await this.openWallet(page);
      return;
    }
    if (page === 'fortune' || page === 'weather') {
      this.headText(page === 'fortune' ? '正在摇签、解签…' : '正在查询天气…', page, 0);
      try {
        const result = await this.headRequest(page, page === 'fortune' ? '' : this.prefs.city);
        if (!this.ac.signal.aborted && this.headMode === page) this.headText(result.text, page, 0);
      } catch (error) {
        if (this.headMode === page) this.headText(error.message, page, 0);
      }
      return;
    }
    if (page === 'settings') {
      try {
        const status = await this.headRequest('status');
        this.prefs.autoStart = status.preferences?.autoStart === true;
        this.headStatus.startupAvailable = status.startupAvailable;
      } catch (error) { console.warn('[eh] 读取自启动状态失败', error); }
      if (this.ac.signal.aborted) return;
    }
    const box = this.makeHead(page === 'music' ? '♫ 一起听首歌' : '⚙ 我的小设置', page);
    box.onclick = null;
    box.style.fontSize = '14px';
    const button = (label, action) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = (event) => { event.stopPropagation(); action(); };
      box.append(b);
      return b;
    };
    const field = (label, value, type = 'text') => {
      const l = document.createElement('label');
      l.className = 'eh-field' + (type === 'checkbox' ? ' eh-toggle' : '');
      const caption = document.createElement('span');
      caption.textContent = label;
      const input = document.createElement('input');
      input.type = type;
      if (type === 'range') {
        input.min = '0';
        input.max = '2000';
        input.step = 'any';
      }
      input.value = value || '';
      if (type === 'checkbox') input.setAttribute('role', 'switch');
      l.append(caption, input);
      box.append(l);
      return input;
    };
    const feedback = document.createElement('p');
    feedback.className = 'eh-feedback';
    if (page === 'music') {
      const select = document.createElement('select');
      select.setAttribute('aria-label', '歌曲');
      const tracks = () => this.headTracks || [];
      let index = Math.min(this.headTrackIndex || 0, Math.max(0, tracks().length - 1));
      const fill = () => {
        select.replaceChildren();
        tracks().forEach((t, i) => {
          const option = document.createElement('option');
          option.value = i;
          option.textContent = t.name;
          select.append(option);
        });
        select.value = index;
      };
      const play = async (n) => {
        if (!tracks().length) {
          feedback.textContent = '先选几首本地音乐吧～';
          return;
        }
        index = (n + tracks().length) % tracks().length;
        this.headTrackIndex = index;
        select.value = index;
        const track = tracks()[index];
        const request = this.headTrackRequest = (this.headTrackRequest || 0) + 1;
        this.musicAudio.src = track.url;
        feedback.textContent = '♫ ' + track.name;
        try {
          await this.musicAudio.play();
        } catch (error) {
          if (request === this.headTrackRequest && error.name !== 'AbortError') feedback.textContent = '播放失败，请试试 MP3 或 WAV';
        }
      };
      const step = (offset) => {
        if (tracks().length === 1) {
          feedback.textContent = '列表只有一首歌，可以点「添加歌曲」加入更多';
          return;
        }
        return play(index + offset);
      };
      button('添加歌曲', async () => {
        try {
          const result = await this.headRequest('music');
          if (!result.canceled) {
            this.headTracks = result.tracks;
            index = Math.max(0, tracks().findIndex((track) => track.url === result.added));
            fill();
            await play(index);
          }
        } catch (e) {
          feedback.textContent = e.message;
        }
      });
      fill();
      box.append(select);
      select.onchange = () => play(Number(select.value));
      button('上一首', () => step(-1));
      button('播放 / 暂停', async () => {
        if (!this.musicAudio.src) return play(index);
        if (this.musicAudio.paused) {
          try {
            await this.musicAudio.play();
          } catch {
            feedback.textContent = '无法播放';
          }
        } else this.musicAudio.pause();
      });
      button('下一首', () => step(1));
      button('停止', () => { this.musicAudio.pause(); this.musicAudio.currentTime = 0; });
      const repeat = field('单曲循环', '', 'checkbox');
      repeat.checked = this.musicAudio.loop;
      repeat.onchange = () => { this.musicAudio.loop = repeat.checked; };
      this.musicAudio.onended = () => {
        if (!this.musicAudio.loop) void play(index + 1);
      };
      const volume = field('音量', this.musicAudio.volume, 'range');
      volume.min = 0;
      volume.max = 1;
      volume.step = 0.05;
      volume.oninput = () => (this.musicAudio.volume = Number(volume.value));
      feedback.textContent = this.musicAudio.src ? '♫ ' + (tracks()[index]?.name || '') : '关闭气泡后音乐继续播放。';
    } else {
      const size = field('人物大小', this.prefs.size || this.baseHeadSize, 'range');
      size.min = 240;
      size.max = 800;
      size.step = 10;
      const sizeValue = document.createElement('output');
      sizeValue.className = 'eh-size-value';
      sizeValue.textContent = size.value + ' px';
      size.parentElement.querySelector('span').append(sizeValue);
      size.oninput = () => {
        sizeValue.textContent = size.value + ' px';
        this.prefs.size = Number(size.value);
        this.resizeHeadPet(this.prefs.size);
      };
      const physics = field('抛掷与碰撞', '', 'checkbox');
      const physicsHelp = document.createElement('small');
      physicsHelp.textContent = '关闭后，拖动放下不反弹';
      physics.parentElement.querySelector('span').append(physicsHelp);
      physics.checked = this.prefs.physics !== false;
      physics.onchange = async () => {
        const previous = this.prefs.physics;
        this.prefs.physics = physics.checked;
        if (!physics.checked) {
          this.stopThrow(); this.stopSquash(); this.pendingSquash = false;
        }
        try {
          await this.headRequest('preferences', { physics: physics.checked });
          feedback.textContent = physics.checked ? '抛掷与碰撞已开启' : '物理效果已关闭，立即生效';
        } catch (error) { this.prefs.physics = previous; physics.checked = previous !== false; feedback.textContent = error.message; }
      };
      const chatter = field('点击时显示话语', '', 'checkbox');
      chatter.checked = this.prefs.chatter !== false;
      const water = field('每小时喝水提醒', '', 'checkbox');
      water.checked = this.prefs.water !== false;
      const autoStart = field('开机自启动', '', 'checkbox');
      box.insertBefore(autoStart.parentElement, physics.parentElement);
      autoStart.checked = this.prefs.autoStart === true;
      autoStart.disabled = this.headStatus.startupAvailable === false;
      const startupHelp = document.createElement('small');
      startupHelp.textContent = autoStart.disabled ? '请在 Windows 桌宠中使用' : '登录 Windows 后自动启动，开关立即生效';
      autoStart.parentElement.querySelector('span').append(startupHelp);
      autoStart.onchange = async () => {
        const previous = this.prefs.autoStart === true;
        autoStart.disabled = true;
        try {
          const result = await this.headRequest('startup', { enabled: autoStart.checked });
          this.prefs.autoStart = result.autoStart;
          autoStart.checked = result.autoStart;
          startupHelp.textContent = result.autoStart ? '开机自启动已开启' : '开机自启动已关闭';
        } catch (error) { autoStart.checked = previous; startupHelp.textContent = error.message; }
        finally { autoStart.disabled = false; }
      };
      const city = field('天气城市', this.prefs.city, 'text');
      city.placeholder = '例如：杭州 / Hangzhou';
      const token = field(
        this.headStatus?.hasKey ? 'DeepSeek Token（已保存，留空保留）' : 'DeepSeek Token',
        '',
        'password',
      );
      token.autocomplete = 'off';
      const actions = document.createElement('div');
      actions.className = 'eh-actions';
      box.append(actions);
      const saveButton = button('保存设置', async () => {
        try {
          const result = await this.headRequest('preferences', {
            size: Number(size.value),
            physics: physics.checked,
            chatter: chatter.checked,
            water: water.checked,
            city: city.value,
          });
          Object.assign(this.prefs, result.preferences);
          if (!this.prefs.physics) this.stopThrow();
          if (token.value.trim()) {
            const saved = await this.headRequest('save', {
              key: token.value.trim(),
              model: this.headStatus?.model || 'deepseek-flash',
            });
            this.headStatus.hasKey = saved.hasKey;
            token.value = '';
          }
          feedback.textContent = '保存好啦，下次打开也记得！';
        } catch (error) {
          feedback.textContent = error.message;
        }
      });
      const clearButton = button('清除 Token', async () => {
        try {
          await this.headRequest('save', { clearKey: true, model: this.headStatus?.model || 'deepseek-flash' });
          token.value = '';
          this.headStatus.hasKey = false;
          feedback.textContent = 'Token 已清除';
        } catch (e) {
          feedback.textContent = e.message;
        }
      });
      const waterButton = button('测试喝水提醒', () => {
        this.waterPending = true;
        this.waterSince = Date.now();
        this.headText('该喝水啦～点击我就解除提醒！', 'water', 0);
        this.resizeHeadPet(this.prefs.size || this.baseHeadSize);
      });
      actions.append(saveButton, clearButton, waterButton);
    }
    box.append(feedback);
    this.layoutHead();
  };
  P.openWallet = async function (page) {
    const shop = page === 'shop';
    const panel = this.makeHead(shop ? '商店' : '背包', page);
    panel.onclick = null;
    panel.style.fontSize = '14px';
    const balance = document.createElement('span');
    balance.className = 'eh-wallet-balance';
    const emerald = document.createElement('img');
    emerald.className = 'eh-shop-cost';
    emerald.src = './shop-assets/emerald.png';
    emerald.alt = '';
    const balanceValue = document.createElement('span');
    balanceValue.setAttribute('aria-live', 'polite');
    balance.append(emerald, balanceValue);
    panel.querySelector('h4').append(balance);
    const list = document.createElement('div');
    list.className = 'eh-shop-grid';
    const feedback = document.createElement('p');
    feedback.className = 'eh-feedback';
    panel.append(list, feedback);
    const slot = (name, icon, detail, amount) => {
      const tile = document.createElement('div');
      tile.className = 'eh-shop-slot';
      const preview = document.createElement('div');
      preview.className = 'eh-shop-art';
      preview.tabIndex = 0;
      preview.setAttribute('aria-label', name);
      const art = document.createElement(icon === 'pickaxes.png' ? 'span' : 'img');
      art.className = 'eh-shop-icon';
      if (icon === 'pickaxes.png') art.classList.add('eh-shop-pickaxe');
      else { art.src = './shop-assets/' + icon; art.alt = ''; }
      const label = document.createElement('span');
      label.className = 'eh-shop-name';
      label.textContent = name;
      preview.append(art, label);
      tile.append(preview);
      if (amount) tile.append(amount);
      tile.append(detail);
      list.append(tile);
    };
    const quantity = (value) => {
      const label = document.createElement('span');
      label.className = 'eh-shop-count';
      label.textContent = '×' + value;
      return label;
    };
    let purchasing = false;
    const render = ({wallet, products}) => {
      if (this.headMode !== page || !list.isConnected) return;
      list.replaceChildren();
      balanceValue.textContent = String(wallet.emeralds);
      balanceValue.setAttribute('aria-label', '绿宝石余额 ' + wallet.emeralds);
      for (const product of products) {
        if (!shop) {
          slot(product.name, product.icon, quantity(wallet[product.id]));
          continue;
        }
        const buy = document.createElement('button');
        const amount = product.id === 'cocoa' && product.price !== null ? document.createElement('input') : null;
        if (product.price === null) buy.textContent = '价格待定';
        else {
          const currency = document.createElement('img');
          currency.className = 'eh-shop-cost';
          currency.src = './shop-assets/emerald.png';
          currency.alt = '';
          const cost = document.createTextNode('');
          buy.append(currency, cost);
          const updateTotal = () => {
            const count = amount ? amount.valueAsNumber : 1;
            const total = count * product.price;
            const valid = Number.isSafeInteger(total) && count >= 1 && Number.isInteger(count);
            cost.data = valid ? String(total) : '—';
            buy.disabled = !valid;
            buy.setAttribute('aria-label', valid ? '购买' + product.name + '，' + total + ' 绿宝石' : '请输入有效的购买数量');
          };
          if (amount) {
            amount.type = 'number';
            amount.min = '1';
            amount.step = '1';
            amount.value = '1';
            amount.setAttribute('aria-label', '可可果购买数量');
            amount.addEventListener('input', updateTotal);
          }
          updateTotal();
        }
        if (product.price === null) buy.disabled = true;
        buy.onclick = async () => {
          if (purchasing) return;
          purchasing = true;
          buy.disabled = true;
          if (amount) amount.disabled = true;
          try {
            render(await this.headRequest('shop-buy', {id:product.id,quantity:amount ? amount.valueAsNumber : 1}));
            feedback.textContent = '已放入背包';
          } catch (error) {
            feedback.textContent = error.message;
            buy.disabled = false;
            if (amount) amount.disabled = false;
          } finally { purchasing = false; }
        };
        slot(product.name, product.icon, buy, amount);
      }
      this.layoutHead();
    };
    try { render(await this.headRequest('shop-status')); }
    catch (error) { feedback.textContent = error.message; this.layoutHead(); }
  };

  P.playItemAction = async function (action) {
    if (action === 'mine') return this.toggleMining();
    if (this.itemActionPending || this.assetRoot !== 'eh' || this.stagedAction || this.dragState.active ||
        this.waterPending || this.frozen || this.ac.signal.aborted) return false;
    const animation = {feed:'吃可可果', steal:'偷吃'}[action];
    this.itemActionPending = true;
    const previous = this.anim;
    try {
      const result = await this.headRequest('pet-item-action', action);
      if (!result.played || this.anim !== previous || this.assetRoot !== 'eh' ||
          this.stagedAction || this.dragState.active || this.ac.signal.aborted) return false;
      this.stopMove();
      this.stopThrow();
      this.playOnce(animation);
      return true;
    } catch (error) {
      if (action !== 'steal') this.headText(error.message);
      return false;
    } finally { this.itemActionPending = false; }
  };

  const miningEmojis = [...new Set(Array.from('😊🤯😟😵😡😥😱😭😴😠😰😿🤓😄😇🤑😺🙀😾👽💩🙄😣🤕😬😶😑😐🤔🙂😊😎😗🙃😕😔😲😩😨🤧🤠🧐'))];
  P.toggleMining = async function () {
    if (this.stagedAction?.kind === 'mine') {
      if (this.stagedAction.phase !== 'outro') this.stopMining(true, true);
      return false;
    }
    if (this.miningPending || this.assetRoot !== 'eh' || this.stagedAction ||
        this.dragState.active || this.waterPending || this.frozen || this.ac.signal.aborted) return false;
    this.miningPending = true;
    this.miningCancelled = false;
    try {
      await this.headRequest('mining-start');
      if (this.miningCancelled || this.assetRoot !== 'eh' || this.stagedAction ||
          this.dragState.active || this.frozen || this.ac.signal.aborted) {
        await this.headRequest('mining-stop');
        return false;
      }
      if (this.headMode === 'message') this.closeHead();
      this.stopThrow();
      this.stagedPlay('mine', 'intro');
      this.miningPayTimer = setInterval(() => {
        void this.headRequest('mining-tick').catch(error => console.warn('[eh] 挖矿结算失败', error));
      }, 60000);
      const scheduleEmoji = () => {
        this.miningEmojiTimer = setTimeout(() => {
          if (this.stagedAction?.kind !== 'mine') return;
          if (!this.headMode && !this.menuOpen && !this.waterPending) {
            this.headText(miningEmojis[Math.floor(Math.random()*miningEmojis.length)], 'mining-emoji', 15000 + Math.random()*5000);
          }
          scheduleEmoji();
        }, 4000 + Math.random()*4000);
      };
      scheduleEmoji();
      return true;
    } catch (error) {
      if (!this.ac.signal.aborted && !this.miningCancelled) this.headText(error.message);
      return false;
    } finally { this.miningPending = false; }
  };

  P.stopMining = function (resume = false, playOutro = false) {
    if (this.miningPending) this.miningCancelled = true;
    if (this.stagedAction?.kind !== 'mine') return;
    clearInterval(this.miningPayTimer);
    clearTimeout(this.miningEmojiTimer);
    const alreadyStopped = this.stagedAction.phase === 'outro';
    this.stagedAction = null;
    if (this.headMode === 'mining-emoji') this.closeHead();
    if (!alreadyStopped) {
      void this.headRequest('mining-stop').catch(error => console.warn('[eh] 挖矿结算失败', error));
    }
    if (playOutro && !alreadyStopped) {
      this.stagedPlay('mine', 'outro');
      return;
    }
    if (resume) this.playIdle();
  };
})();
