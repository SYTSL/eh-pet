/**
 * dsh-pet 桌面 Helper 主进程：每只桌面宠物一个透明置顶小窗，窗口跟随渲染端上报的包围盒移动，进程内
 * 还负责托盘、bridge 数据转发与宿主存活判定；不负责渲染与命中判定（renderer.js / sprite.js）。
 * 必须保持局部小窗：Windows DWM 视频黑屏需四项同时成立——透明置顶、非点击穿透、可聚焦且已聚焦、
 * 完整盖住视频窗；本进程恰好凑齐前三项，小窗则几乎不可能满足第四项，且默认整窗点击穿透。
 * 依赖宿主注入的环境变量与同目录的纯判定模块。
 * @module dsh-pet/runtime/electron-helper/main
 */
let electronApi;
// 被以「纯 Node 模式」拉起（宿主透传 ELECTRON_RUN_AS_NODE）时内置 electron 模块不会注册：
// 报一句能定位原因的话再退出，别只留 MODULE_NOT_FOUND。
try {
  electronApi = require('electron');
} catch (error) {
  process.stderr.write(
    '[dsh-pet helper] 启动失败：本进程被以「纯 Node 模式」拉起（ELECTRON_RUN_AS_NODE=' +
      JSON.stringify(process.env.ELECTRON_RUN_AS_NODE ?? null) +
      '）。该变量必须在 spawn 前删除（见 src/host/helper-process.ts 的 helperSpawnEnv），' +
      '运行期再删无效，设成空串会让 Electron 直接 abort。原始错误：' +
      (error instanceof Error ? error.message.split('\n')[0] : String(error)) +
      '\n',
  );
  process.exit(3);
}
const { app, BrowserWindow, ipcMain, screen, shell, protocol, Tray, Menu, nativeImage, powerMonitor } = electronApi;
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { readFileSync, writeFileSync } = require('node:fs');
const fsPromises = require('node:fs/promises');
// 点击穿透兜底通道的纯判定（不依赖 Electron 的 forward 鼠标钩子；见文件头）
const { decideWindowIgnore, pointerZone } = require('./pointer-target.js');
// Linux 专用：X11 指针实时查询。穿透窗收不到鼠标事件，Chromium 的 screen.getCursorScreenPoint()
// 在 X11 上会冻结在旧坐标，兜底轮询必须直接问 X server（见 x11-pointer.js）。
const { createLinuxPointer } = require('./x11-pointer.js');
// 置顶看门狗：WS_EX_TOPMOST 只是样式位，不等于窗口真的在置顶带（见 topmost-watchdog.js 头部）
const {
  TOPMOST_WATCHDOG_TICK_MS,
  TOPMOST_WATCHDOG_ENABLED,
  shouldReassertTopmost,
  topmostLevel,
} = require('./topmost-watchdog.js');
// 宿主存活判定：宿主退出 → 管道断开 → 自己退，绝不弹框、绝不留僵尸
const { HOST_POLL_MS, hostIsGone, isBrokenPipeError, parseHostPid } = require('./host-liveness.js');
// 全局 DPI 线性化的纯判定与换算（平台例外见该文件头）
const { shouldLinearize, resolveForcedScale, resolvePetScale } = require('./dpi-linearization.js');
// 托盘的平台差异（模板图 / 左键是否自动弹菜单 / Dock）：规则住在模块里，main.js 只接线
const { trayPlatform } = require('./tray-platform.js');
const { buildDeskGeometry } = require('./desktop-geometry.js');

/** Linux 指针提供者：仅在 Linux 创建；查询失败时 get() 返回 null（调用方回退 Electron 原生 API） */
const linuxPointer = process.platform === 'linux' ? createLinuxPointer() : null;

/**
 * 当前光标位置（DIP）。
 * Linux：X11 QueryPointer 的实时值（物理像素 ÷ 缩放）；其余平台或查询尚未就绪：Electron 原生 API。
 */
function currentPointer() {
  const raw = linuxPointer && linuxPointer.get();
  if (!raw) return screen.getCursorScreenPoint();
  const scale = screen.getPrimaryDisplay().scaleFactor || 1;
  return scale === 1 ? raw : { x: Math.round(raw.x / scale), y: Math.round(raw.y / scale) };
}

// 允许无用户手势直接播放（余额动画等）
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// 显式定名：Helper 被 `electron.exe <main.js>` 直接拉起时取不到 app 名，会回落成 "Electron"，
// userData 便落到 %APPDATA%\Electron 这个公共目录，DPI 缓存与 Chromium profile 会和别人混在一起。
// 必须赶在任何 getPath('userData') 之前设；名字必须与 src/host/storage-paths.ts 的 DESKTOP_APP_NAME
// 逐字一致（测试直接读本文件比对，改名不同步就红）。
// 应用模式（本文件被 src/app/main.ts 同进程 require）：双击启动的用户没有终端，托盘必须有「退出」；
// 手动 start-desktop 流同理，BRIDGE 模式则由宿主决定能否退（见 startTray 的 quitApp）。
const APP_MODE = process.env.DSH_PET_APP_MODE === '1';
// 只供同进程应用自己的请求使用，绝不出现在渲染端地址或日志里。
const APP_TOKEN = APP_MODE ? process.env.DSH_PET_APP_TOKEN : undefined;
app.setName('dsh-pet-electron-helper');
// Windows 任务栏分组：不设 AppUserModelID 时窗口归到 electron.exe 名下，任务栏按钮意外出现就显示
// Electron 默认图标。必须在 ready 之前调用；独立应用与 DSH 内 helper 用不同 ID，避免被合成一组。
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_MODE ? 'com.dsh.pet.app' : 'com.dsh.pet.helper');
}
// 应用模式只改数据目录、不改应用名：共用同一个 userData 时两个 Chromium 进程会抢同一份 profile 互踢。
if (APP_MODE)
  app.setPath(
    'userData',
    process.env.DSH_HOME
      ? path.join(process.env.DSH_HOME, 'browser-cache')
      : path.join(app.getPath('appData'), 'dsh-pet'),
  );

/** DPI 探测子进程模式：不建窗口，只把主屏 scaleFactor 打到 stdout 就退出（见 probePrimaryScale） */
const DPI_PROBE = process.env.DSH_PET_DPI_PROBE === '1';
/** 探测进程的输出标记（父进程按它抓值） */
const DPI_MARK = 'dsh-pet-primary-scale:';

// 宿主存活：宿主退出后 stdout/stderr 的读端一起消失，helper 下一次写（每秒至少一条 /state 轮询）
// 拿到 EPIPE；未处理的流错误会成为未捕获异常，而 Electron 的默认处理器只弹框、不退出——桌宠就此
// 卡死、进程赖着不走。两条路缺一不可：① 管道守卫，任何一次写失败都不许变成异常，断开即退（只在
// 上层真的写时触发）；② 宿主探测，每 HOST_POLL_MS 用 kill(pid, 0) 问一次，ESRCH 即退（渲染端
// 崩了或根本没起来时一次写都不会发生，只有它能收敛）。两条路都只经 exitForDeadHost()，且只退一次。
let hostGone = false;
/** 宿主没了 → 立刻退出。这里不能再打日志：管道已断，写只会再踩同一个错误。 */
function exitForDeadHost() {
  if (hostGone) return;
  hostGone = true;
  app.exit(0); // 宿主消失是"环境要求我退"，不是自身崩溃，退出码 0
}

// ① 管道守卫必须赶在任何一次写之前装上（probePrimaryScale 失败就会往 stderr 写）
for (const stream of [process.stdout, process.stderr]) {
  stream.on('error', (error) => {
    if (isBrokenPipeError(error)) exitForDeadHost();
    // 其余流错误同样吞掉：Electron 的默认处理是弹模态框，不值得拿桌宠去换一个框
  });
}

// ② 宿主探测：DSH_PET_HOST_PID 由宿主 spawn 时注入；未注入或非法 → 0 → 不探测（不误退）。
// DPI 探测实例是一次性短命进程（父进程是 helper 而不是宿主），不参与这套机制。
const HOST_PID = parseHostPid(process.env.DSH_PET_HOST_PID);
if (!DPI_PROBE && HOST_PID > 0) {
  setInterval(() => {
    if (hostIsGone(HOST_PID)) exitForDeadHost();
  }, HOST_POLL_MS).unref?.();
}

// Windows 透明分层窗口（WS_EX_LAYERED）在 DWM 硬件加速合成下有缺陷：拖拽移动时窗口四周出现黑边、
// 大透明窗移动覆盖小透明窗时后者内容丢失。本进程只渲染轻量宠物动画（640×360），改走软件合成；
// 非 Windows 合成路径不同，保留硬件加速。
if (process.platform === 'win32') {
  app.disableHardwareAcceleration();
  // 它只关硬件 GL、不会去掉 Chromium 的 GPU 进程：装了虚拟显示器（ToDesk / 远程桌面 IDD 之类）时，
  // GPU 进程沙箱会在初始化阶段以 STATUS_BREAKPOINT 反复崩掉，浏览器进程随即以 0x80000003 退出，
  // helper 每起必崩而宿主只看到一行无信息量的退出码。关掉 GPU 沙箱即可恢复（单测过：
  // --disable-gpu 与 --use-angle 无效，--disable-gpu-sandbox 有效）。本进程只渲染本地素材、
  // 不加载不可信内容；需要保留沙箱的环境设 DSH_PET_GPU_SANDBOX=1。
  if (process.env.DSH_PET_GPU_SANDBOX !== '1') {
    app.commandLine.appendSwitch('disable-gpu-sandbox');
  }
}

// 全局 DPI 线性化：所有显示器强制同一 scale factor——逐屏仿射变换会在拖过屏缝时反复翻转
// （「分身闪烁」）。取值必须锁死 1，不能用主屏 scaleFactor（实测 forced=1.5 会让 bounds 与
// workArea 自相矛盾）；代价是尺寸单位变成物理像素，靠探测到的 scaleFactor 乘进 CONFIG.scale 抵掉，
// 探测失败就不启用。平台规则见 dpi-linearization.js，本文件只接线。

/** 主屏缩放缓存文件（userData 在 ready 前即可用） */
function dpiCacheFile() {
  return path.join(app.getPath('userData'), 'primary-scale.json');
}

function readCachedPrimaryScale() {
  try {
    const v = Number(JSON.parse(readFileSync(dpiCacheFile(), 'utf8')).scaleFactor);
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0; // 首次启动/文件损坏：当作无缓存，重新探测
  }
}

function writeCachedPrimaryScale(value) {
  try {
    writeFileSync(dpiCacheFile(), JSON.stringify({ scaleFactor: value }), 'utf8');
  } catch (e) {
    console.error('[dsh-pet-desktop-helper] write dpi cache failed:', String(e && e.message ? e.message : e));
  }
}

/** 从探测子进程的输出里抓 scaleFactor（0 = 没抓到） */
function parseProbeOutput(text) {
  const m = new RegExp(DPI_MARK + '([0-9.]+)').exec(String(text || ''));
  const v = m ? Number(m[1]) : 0;
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** 拉起探测子进程读主屏 scaleFactor（同一个 electron + 同一个 main.js，走 DPI_PROBE 分支） */
function probePrimaryScale() {
  const opts = {
    env: { ...process.env, DSH_PET_DPI_PROBE: '1', DSH_PET_BRIDGE: '0', DSH_PET_SMOKE: '0' },
    timeout: 20000,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  };
  let out = '';
  try {
    out = execFileSync(process.execPath, [__filename, '--dsh-pet-dpi-probe'], opts);
  } catch (e) {
    // 只认 stdout，不认退出码：不开窗口的 Electron 进程调 app.exit() 在 Windows 上偶发
    // 0xC0000005（退出期访问违例），但那时值早就写出来了，丢掉它纯属浪费一次冷启动。
    out = e && e.stdout ? String(e.stdout) : '';
    if (!parseProbeOutput(out)) {
      const detail = [
        e && e.status !== undefined ? 'status=' + e.status : '',
        e && e.stderr ? 'stderr=' + String(e.stderr).trim().slice(0, 300) : '',
      ]
        .filter(Boolean)
        .join(' ');
      console.error(
        '[dsh-pet-desktop-helper] dpi probe failed:',
        String(e && e.message ? e.message : e).split('\n')[0],
        detail,
      );
      return 0; // 探测失败：不加 switch，退回逐屏 DIP 行为
    }
  }
  const v = parseProbeOutput(out);
  if (v > 0) writeCachedPrimaryScale(v);
  return v;
}

/** 真实主屏 scaleFactor（探测所得；0 = 未知）。开启线性化后 screen API 只会报 1，只能靠它。 */
let PRIMARY_SCALE = 0;
/** 实际生效的强制缩放（0 = 未启用，坐标系维持修复前的逐屏 DIP） */
let FORCED_SCALE = 0;
const FORCE_DSF = process.env.DSH_PET_FORCE_DSF;
if (shouldLinearize({ platform: process.platform, dpiProbe: DPI_PROBE, forceDsf: FORCE_DSF })) {
  PRIMARY_SCALE = readCachedPrimaryScale() || probePrimaryScale();
  const forced = resolveForcedScale({ forceDsf: FORCE_DSF, primaryScale: PRIMARY_SCALE });
  if (forced > 0) {
    app.commandLine.appendSwitch('force-device-scale-factor', String(forced));
    FORCED_SCALE = forced;
  }
}

/**
 * 渲染端的 CONFIG.scale：宿主给的基准 × 物理像素补偿。
 * 线性化开启后 1 逻辑像素 = 1 物理像素，宠物按主屏缩放放大回原来的观感。
 */
function petScale() {
  return resolvePetScale({
    baseScale: process.env.DSH_PET_SCALE,
    primaryScale: PRIMARY_SCALE,
    forcedScale: FORCED_SCALE,
  });
}

/** bridge 模式：DSH_PET_BRIDGE=1（宿主注入）。开启时注册 dsh-pet-bridge scheme + 管道转发 */
const BRIDGE = process.env.DSH_PET_BRIDGE === '1';

/** 「打开网站」这一项的去向（宿主按自身形态注入）：
 *  'desktop' = 宿主是 DSH 桌面应用 → 唤起桌面应用主窗口；
 *  'site'    = dsh web / 独立模式 / 手写 start-desktop（无该变量）→ 原行为：默认浏览器打开站点。 */
const OPEN_TARGET = process.env.DSH_PET_OPEN_TARGET === 'desktop' ? 'desktop' : 'site';
/** 协议行前缀（与 helper-process.ts 的 BRIDGE_PREFIX 一致） */
const BRIDGE_PREFIX = 'dsh-pet-bridge:';

if (BRIDGE) {
  // 自定义 scheme：standard（可解析 URL）+ secure（按 https 对待）+ supportFetchAPI（fetch 可用）
  // + stream（视频流）+ corsEnabled（让 CORS 规则生效，配合响应里的 ACAO 头放行 file:// 源页面）
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'dsh-pet-bridge',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        bypassCSP: true,
        corsEnabled: true,
      },
    },
  ]);
}

/** 窗口表：petId -> BrowserWindow */
const windows = new Map();

/** win.id -> 上一次请求的内容区矩形（"x,y,w,h"）：pet:set-bounds 的去重基准 */
const lastRequestedBounds = new Map();

/** win.id -> 渲染端上报的窗口余量 `{ l, t }`（DIP）：上边距按气泡最大高度加高后余量不再四边相等，
 *  命中区不能按「窗口宽/4」反推，所以存下来交给 pointer-target 的 spriteHitRect */
const winMargins = new Map();

/**
 * 宠物间碰撞 broker 状态：petId -> { x, y, vx, vy, size, bottomPad }。
 * 来源是 pet:set-bounds（每帧全量）与 pet:report-flight（飞行中每 ~30ms 补速度）；
 * 任何更新都广播全量给所有窗口，飞行方据此做跨窗碰撞检测（滞后 ≤ 1 帧，可接受）。
 */
const petStates = new Map();

/** 把当前全量宠物状态广播给所有窗口（碰撞检测的共享站场） */
function broadcastPetStates() {
  const states = {};
  for (const [pid, s] of petStates) {
    states[pid] = { x: s.x, y: s.y, vx: s.vx, vy: s.vy, size: s.size, bottomPad: s.bottomPad };
  }
  for (const win of windows.values()) {
    if (!win.isDestroyed()) win.webContents.send('pet:flight-states', states);
  }
}

/** 记录/更新一只宠物的状态并广播 */
function updatePetState(petId, partial) {
  const prev = petStates.get(petId) || { x: 0, y: 0, vx: 0, vy: 0, size: 0, bottomPad: 0 };
  petStates.set(petId, Object.assign({}, prev, partial));
  broadcastPetStates();
}

/** 每窗口当前穿透状态的镜像（Electron 没有取值 API）：所有翻转都经 setWindowIgnore，供冒烟断言/排查 */
const windowIgnore = new Map();

/** 翻转整窗穿透的唯一出口：状态与镜像永远一起更新（穿透期间保留 forward） */
function setWindowIgnore(win, ignore) {
  win.setIgnoreMouseEvents(ignore, { forward: true });
  windowIgnore.set(win.id, ignore);
}

/** 兜底通道的光标轮询间隔（ms） */
const POINTER_POLL_MS = 60;
/** 冒烟期间暂停兜底轮询：它按真实光标翻转 windowIgnore，会干扰冒烟对渲染端通道的断言 */
let pointerFallbackPaused = false;

/**
 * 每窗口「渲染端正拿着鼠标输入」标记（win.id → true/false），由渲染端经 `pet:input-busy` 上报。
 *
 * 必须由渲染端说了算：兜底通道判定的是光标与窗口矩形的关系，而窗口比宠物身体大一圈；拖拽时宠物
 * 滞后于光标，甩得快时光标先出窗，翻回穿透就会断掉正在用的 pointermove/pointerup。主进程光看
 * 光标位置与窗口位移分不清拖拽跟手与漫游/抛掷，所以 busy 期间本进程绝不翻回穿透。
 */
const inputBusy = new Map();
/** 新渲染端把菜单/聊天框局部矩形单独上报，避免忙碌态下整窗透明余量吞点击。 */
const inputRegions = new Map();

/** 每窗口「光标停在余量区且非 busy」的连续时长（ms）：到点由兜底通道强制恢复穿透 */
const offBodyMs = new Map();

/**
 * 桌面宠物列表（[{id,size}]）：宿主经 DSH_PET_PETS 透传，每只宠物一个窗口。
 * 解析失败或未透传（手动 start-desktop）时回落到单个默认窗口，渲染端首帧会按真实配置自校正。
 * 空数组是合法输入、不等于未透传：宿主在「桌面宠物全关掉但仍需托住托盘」时会明确传 []，
 * 此时必须建 0 个窗口——回落成默认窗口会让渲染端读到「没有桌面宠物」并弹出错误条。
 */
function petsFromEnv() {
  try {
    const raw = process.env.DSH_PET_PETS || '';
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return arr.map((p, i) => ({
        id: String(p?.id ?? `pet-${i}`),
        size: Number(p?.size) > 0 ? Number(p.size) : 462,
        index: i,
      }));
    }
  } catch {
    /* fallthrough */
  }
  return [{ id: 'main', size: 462, index: 0 }];
}

/** 窗口初始尺寸 = 宠物包围盒 + 四周外扩余量；渲染端首帧 set-bounds 会按真实配置精确覆盖，
 *  这里只是避免启动瞬间的尺寸跳变。 */
function petWindowSize(size) {
  const height = (size * 9) / 16;
  const bottomPad = (size * (9 / 16) * (360 - 330)) / 360;
  const m = Math.round(size * 0.5);
  return { width: Math.round(size) + m * 2, height: Math.round(height + bottomPad) + m * 2 };
}

/**
 * 把窗口从任务栏摘掉（合盖/唤醒后任务栏会冒出 Electron 默认图标）。
 *
 * skipTaskbar 只在建窗时生效一次；Windows 在唤醒、显示器拓扑变化后会让 Shell 重新枚举顶层窗口，
 * 窗口重新 show 时任务栏按钮会被重建且不保证再被摘掉。show() 内部重建按钮是异步的，紧跟一个
 * 0ms 的第二次调用才算数（只调一次仍会残留按钮），所以凡是窗口可能重新出现的时机都要再摘一次。
 */
function keepOffTaskbar(win) {
  if (!win || win.isDestroyed()) return;
  win.setSkipTaskbar(true);
  setTimeout(() => {
    if (!win.isDestroyed()) win.setSkipTaskbar(true);
  }, 0);
}

/**
 * 桌面几何：逐显示器的工作区列表 + 它们的外接矩形 + 主屏下标（屏幕坐标）。
 *
 * hull 只作渲染端视口的坐标系原点与换算基准；所有边界判定（漫游落点/抛掷反弹/角落定位/菜单夹取）
 * 必须走 areas 的并集——显示器摆放不规则时 hull 里会有大片不属于任何屏的空洞，以它为边界会把
 * 宠物放进看不见的地方。
 */
function deskGeometry() {
  return buildDeskGeometry(screen.getAllDisplays(), screen.getPrimaryDisplay().id, process.platform);
}

function createPetWindows() {
  const geo = deskGeometry();
  const area = geo.hull;
  const configUrl = process.env.DSH_PET_CONFIG_URL || 'http://127.0.0.1:3080/dsh-pet-7340/config';
  const pets = petsFromEnv();
  const scale = petScale();
  for (const pet of pets) {
    if (windows.has(pet.id) && !windows.get(pet.id).isDestroyed()) continue;
    // 初始窗口尺寸也要吃缩放补偿，否则启动瞬间会有一次可见的尺寸跳变
    const { width, height } = petWindowSize(pet.size * scale);
    const win = new BrowserWindow({
      icon: trayIcon(true),
      width,
      height,
      x: area.x, // 初始左上角；renderer 首帧按配置角落/位置校正
      y: area.y,
      show: false,
      useContentSize: true,
      // macOS 默认会把已显示窗口的 y 钳到菜单栏下沿；局部画布的透明余量必须允许伸出屏幕。
      enableLargerThanScreen: true,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      // 任务栏按钮万一还是冒出来（唤醒后重建），至少显示宠物图标而不是 Electron 默认原子图
      icon: path.join(__dirname, '..', '..', 'assets', 'logo.png'),
      resizable: false,
      hasShadow: false,
      // 可聚焦：对话输入框/菜单需要窗口焦点才能打字；显示用 showInactive()，不打断其它应用。
      focusable: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        paintWhenInitiallyHidden: false,
        spellcheck: false,
      },
    });
    win.setAlwaysOnTop(true, topmostLevel(process.platform));
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    // 窗口被另一只宠物完全遮挡时 Chromium 默认会暂停本窗口渲染，表现成小宠物「消失」；
    // 关掉后台节流让被遮挡窗口持续渲染，移开遮挡后立刻可见。
    win.webContents.setBackgroundThrottling(false);
    // 屏蔽 Electron 默认右键菜单：右键菜单由渲染端统一自绘，绝无双菜单
    win.webContents.on('context-menu', (event) => event.preventDefault());
    // 页面级缩放 = petScale()（渲染端 CONFIG.scale 的同一来源）：整窗内容统一放大，固定 px 的
    // 菜单/弹窗随之恢复 DIP 观感；跨进程交换仍走物理像素，由渲染端 toScreen/toLocal 收口。
    // webPreferences.zoomFactor 对 show:false 的窗口不生效（实测），须在加载完成后设置。
    win.webContents.on('did-finish-load', () => {
      win.webContents.setZoomFactor(scale);
    });
    // 默认整窗点击穿透（渲染端在光标进出身体命中区时经 IPC 翻转）；
    // forward:true 保证穿透期间 mousemove 仍转发进渲染端做命中判定。
    setWindowIgnore(win, true);
    // 任务栏按钮可能在 show / ready-to-show / 唤醒 / 显示器变化后重建（见 keepOffTaskbar）
    win.on('show', () => keepOffTaskbar(win));
    win.once('ready-to-show', () => {
      keepOffTaskbar(win);
      win.showInactive();
    });
    // 兜底显示：paintWhenInitiallyHidden:false 时渲染器可能不产出首帧，ready-to-show 便永不触发，
    // 而 show 只挂在它上面 → 窗口永远隐藏。页面加载完成后强制兜底一次；zoomFactor 在更早注册的
    // did-finish-load 里设置，顺序不受影响。
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        if (!win.isDestroyed() && !win.isVisible()) win.showInactive();
      }, 400);
    });
    // 兜底交互：正规翻转链路只有 forward 鼠标钩子一个入口，该钩子在 Windows 上可能静默失效，
    // 失效后悬浮、拖拽、点击与右键全废。这里按真实光标位置独立判定，与渲染端通道并存、
    // 判定区域一致（状态未变不翻转）。唯一不能自行决定的是 busy：渲染端正拿着输入时不得翻回穿透
    // （主进程光看光标与窗口位移分不清拖拽跟手和漫游/抛掷，所以由渲染端上报）。
    const pointerTimer = setInterval(() => {
      if (pointerFallbackPaused || win.isDestroyed()) return;
      const b = win.getBounds();
      if (b.width < 8 || b.height < 8) return; // 尺寸还没落定（renderer 首帧上报前）
      const ignoring = windowIgnore.get(win.id) !== false;
      const busy = inputBusy.get(win.id) === true;
      const point = currentPointer();
      // 余量区停留计时：只在"非 busy 且在余量区"时累加，离开余量区即清零；busy 期间不累加。
      const mg = winMargins.get(win.id);
      const zone = pointerZone(b, point, mg);
      const nextMs = !busy && zone === 'margin' ? (offBodyMs.get(win.id) ?? 0) + POINTER_POLL_MS : 0;
      offBodyMs.set(win.id, nextMs);
      const next = decideWindowIgnore(b, point, ignoring, busy, nextMs, inputRegions.get(win.id), mg);
      if (next !== ignoring) setWindowIgnore(win, next);
    }, POINTER_POLL_MS);
    // 置顶看门狗：建窗时那次 setAlwaysOnTop 之后再没复查，外部一次 z 序扰动就能让宠物沉底，而
    // WS_EX_TOPMOST 位还在（点击穿透的读-改-写会把它写回来），查位永远得 true。这里低频重钉一次，
    // 落地不移动、不重绘、不抢焦点（依据与代价见 topmost-watchdog.js）。
    // 总开关当前关闭：重钉会把宠物抬到所有置顶窗口之上，打断全屏游戏与截图。
    let lastTopmostAssertMs = Date.now();
    const topmostTimer = setInterval(() => {
      const nowMs = Date.now();
      const due = shouldReassertTopmost(
        {
          nowMs,
          lastAssertMs: lastTopmostAssertMs,
          destroyed: win.isDestroyed(),
          visible: win.isVisible(),
          paused: pointerFallbackPaused,
        },
        TOPMOST_WATCHDOG_ENABLED,
      );
      if (!due) return;
      lastTopmostAssertMs = nowMs;
      win.setAlwaysOnTop(true, topmostLevel(process.platform));
    }, TOPMOST_WATCHDOG_TICK_MS);
    win.on('closed', () => {
      clearInterval(pointerTimer);
      clearInterval(topmostTimer);
      windows.delete(pet.id);
      lastRequestedBounds.delete(win.id);
      winMargins.delete(win.id);
      windowIgnore.delete(win.id);
      inputBusy.delete(win.id);
      inputRegions.delete(win.id);
      offBodyMs.delete(win.id);
    });
    win
      // 绝对路径：本文件有两条运行方式（宿主 spawn / 同进程 require），相对路径会按 Electron 的
      // app 路径解析，同进程时那是 lib/，必然 ERR_FILE_NOT_FOUND。
      .loadFile(path.join(__dirname, 'index.html'), {
        query: {
          configUrl,
          bridge: BRIDGE ? '1' : '0',
          // 工具项「打开网站」的文案按宿主形态自动变（见 sprite.js）：desktop=唤起桌面应用 / site=打开站点
          openTarget: OPEN_TARGET,
          scale: String(scale),
          petIndex: String(pet.index),
          workAreaW: String(area.width),
          workAreaH: String(area.height),
          workAreaX: String(area.x),
          workAreaY: String(area.y),
          // 逐屏工作区（屏幕坐标）+ 主屏下标：边界判定走它们的并集。首帧就要用，所以走 query；
          // 运行期变化再经 pet:displays 推送。
          areas: JSON.stringify(geo.areas),
          workAreas: JSON.stringify(geo.workAreas),
          topInsetRatio: String(geo.topInsetRatio),
          // 逐屏完整面板（含任务栏区）：抛掷越界侧探测用（任务栏条带不当墙，见 shared/physics.ts）
          panels: JSON.stringify(geo.panels),
          primaryIndex: String(geo.primaryIndex),
        },
      })
      .catch((error) => {
        console.error(`[dsh-pet-desktop-helper] page load failed (${pet.id}):`, error);
        win.destroy();
      });
    windows.set(pet.id, win);
  }
}

// bridge 协议：渲染端的每个 fetch 落到 dsh-pet-bridge://，protocol.handle 把请求以一行 JSON 写
// stdout 转发宿主。宿主应答不走近 0 号管道（Electron 主进程在 Windows 上收不到 piped stdin），
// 所以本进程开一个 127.0.0.1 随机端口 HTTP 回调，按 id 唤醒等待中的请求；素材只回绝对路径，
// 由本进程自行读盘应答（二进制不过管道）。协议行统一前缀 BRIDGE_PREFIX，宿主据此区分协议与日志。

let bridgeSeq = 0;
/** id -> {resolve, reject}：一个请求对应宿主的一次回调应答 */
const bridgePending = new Map();
let bridgeCallbackUrl = '';

/** 渲染端请求 → 宿主（请求行带回调 URL）；返回宿主应答（{status, contentType?, body?, file?}），超时抛错 */
function bridgeRequest(method, url, body) {
  return new Promise((resolve, reject) => {
    const id = ++bridgeSeq;
    bridgePending.set(id, { resolve, reject });
    process.stdout.write(BRIDGE_PREFIX + JSON.stringify({ id, method, url, body, cb: bridgeCallbackUrl }) + '\n');
    // 宿主若长期不应答（进程退出/宿主动作挂起）不无限挂起：45s 兜底（LLM 生成最长 30-60s）
    setTimeout(() => {
      const p = bridgePending.get(id);
      if (!p) return;
      bridgePending.delete(id);
      p.reject(new Error('bridge request timeout'));
    }, 45000).unref?.();
  });
}

/** 把宿主回调应答（{id, status, ...}）派发给对应请求 */
function bridgeResolve(resp) {
  const p = resp && bridgePending.get(resp.id);
  if (!p) return;
  bridgePending.delete(resp.id);
  p.resolve(resp);
}

/** 本地回调服务器：宿主把应答 POST 到这里（127.0.0.1 随机端口，绕开 stdin/DSH 闸门） */
function startBridgeCallback() {
  const http = require('node:http');
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/respond') {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('dsh-pet: not found');
      return;
    }
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        bridgeResolve(JSON.parse(raw));
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('ok');
      } catch {
        res.writeHead(400, { 'content-type': 'text/plain' });
        res.end('dsh-pet: bad payload');
      }
    });
    req.on('error', () => {
      res.writeHead(400, { 'content-type': 'text/plain' });
      res.end('dsh-pet: bad payload');
    });
  });
  server.on('error', (e) => {
    console.error('[dsh-pet-desktop-helper] bridge callback server error:', String(e && e.message ? e.message : e));
  });
  server.listen(0, '127.0.0.1', () => {
    const addr = server.address();
    bridgeCallbackUrl = 'http://127.0.0.1:' + (addr && typeof addr === 'object' ? addr.port : 0) + '/respond';
    console.error('[dsh-pet-desktop-helper] bridge callback: ' + bridgeCallbackUrl);
  });
  return server;
}

/** 处理一个渲染端请求：拼宿主请求行 → 等应答 → 组装 Response（素材读盘） */
async function handleBridgeRequest(request) {
  const url = new URL(request.url); // dsh-pet-bridge://dsh-pet/dsh-pet-7340/...
  const method = request.method || 'GET';
  let body;
  if (method === 'POST' || method === 'PUT') {
    body = await request.text();
  }
  const resp = await bridgeRequest(method, url.pathname + url.search, body);
  const headers = { 'access-control-allow-origin': '*' }; // 渲染端页面是 file:// 源，scheme 跨源需 CORS
  if (resp.contentType) headers['content-type'] = resp.contentType;
  if (resp.file) {
    // 素材：直接读盘返回（宿主已解析好绝对路径；带 range 让视频能拖动进度条）
    try {
      const data = await fsPromises.readFile(resp.file);
      return new Response(new Uint8Array(data), { status: resp.status || 200, headers });
    } catch (e) {
      console.error('[dsh-pet-desktop-helper] bridge file read failed:', resp.file, e);
      return new Response('dsh-pet: asset read failed', { status: 500, headers });
    }
  }
  return new Response(resp.body ?? '', { status: resp.status || 200, headers });
}

// 系统托盘：桌面端的显示开关。
// 托盘放在本进程，是因为它是桌面模式唯一不进浏览器的入口：某只宠物的 display 改成 web/none 后
// 桌面窗口与它自己的右键菜单一起消失，只有托盘还能在桌面侧把它切回来。
// 它不是非有不可：main 条目的 trayEnabled 为 false 时不建托盘，宿主也就不再为本进程常驻。
// 数据不新增通道：读写都走渲染端在用的同一条 bridge。菜单是静态的——每次切换 display 宿主都会重启
// 本进程（syncDesktop），新进程按新配置重建菜单，所以不需要「重建菜单刷新勾选」的逻辑。

const PET_ROUTE = '/dsh-pet-7340';
const ORIGIN = new URL(process.env.DSH_PET_CONFIG_URL || 'http://127.0.0.1:3080/dsh-pet-7340/config').origin;
const TRAY_PLATFORM = trayPlatform(process.platform);

/** 与宿主 handlePetRoute 通信：bridge 模式走管道，手动 start-desktop 流退回 HTTP 直连 */
async function hostRequest(method, url, body) {
  if (BRIDGE) return bridgeRequest(method, url, body);
  const resp = await fetch(ORIGIN + url, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(APP_TOKEN ? { 'X-DSH-Pet-Token': APP_TOKEN } : {}),
    },
    body,
  });
  return { status: resp.status, body: await resp.text() };
}

const isDesktopDisplay = (display) => display === 'desktop' || display === 'both';

/** 翻转「桌面位」：both↔web、desktop↔none——浏览器位保持不动，因此不制造新的单向门 */
const toggleDisplay = (display) =>
  display === 'both' ? 'web' : display === 'web' ? 'both' : display === 'desktop' ? 'none' : 'desktop';

let tray = null;

/** 写回某只宠物的 display：宿主写完配置会重启本进程，响应可能永远不回（同 sprite.js 的 setPetDisplay） */
function traySetPetDisplay(id, display) {
  hostRequest('POST', PET_ROUTE + '/pet-display', JSON.stringify({ id, display })).catch((e) => {
    console.error('[dsh-pet-desktop-helper] tray pet-display failed:', String(e && e.message ? e.message : e));
  });
}

/** 托盘图标：包内 logo 缩到 16×16（macOS 要模板图，否则深色菜单栏下看不见） */
function trayIcon(fullSize = false) {
  const file = path.join(__dirname, '..', '..', 'assets', 'logo.png');
  let img = nativeImage.createFromDataURL('data:image/png;base64,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');
  if (img.isEmpty()) img = nativeImage.createFromPath(file);
  if (img.isEmpty()) {
    // 读不到图标 = 托盘不可见但菜单逻辑照跑，最难查的一种坏法：必须留下能定位的日志
    console.error('[dsh-pet-desktop-helper] tray icon missing or unreadable: ' + file);
    return img;
  }
  if (!fullSize) img = img.resize({ width: 16, quality: 'best' });
  if (TRAY_PLATFORM.templateImage) img.setTemplateImage(true);
  return img;
}

/**
 * 建托盘：列出配置里全部宠物（含 display 为 web/none 的——它们当前勾是空的，点一下就能送回来，
 * 这是托盘相对宠物右键菜单的增量）。勾 = 当前 display 含 desktop/both。
 */
async function startTray() {
  try {
    // 请求行要携带回调 URL，而端口在 startBridgeCallback 的 listen 回调里才有值（最多等 2s）
    for (let i = 0; BRIDGE && !bridgeCallbackUrl && i < 100; i += 1) {
      await new Promise((r) => setTimeout(r, 20));
    }
    const resp = await hostRequest('GET', PET_ROUTE + '/config');
    const merged = JSON.parse(resp.body || '{}');
    // 托盘开关（main 条目的 trayEnabled）：只有显式 false 才不建，缺失或写坏时保持建，
    // 免得一份老配置或一个错值让托盘无声消失。与下面的 pets 取自同一份成品配置。
    if (merged && merged.main && merged.main.trayEnabled === false) return;
    // 成品聚合的形状是 { <条目>: <整份配置文档> }：顶层键不是宠物，宠物在各条目的 pets 数组里
    // （与渲染端同一契约）。托盘只要 id/name/display，所以不吹条目级字段。
    const pets = Object.values(merged)
      .flatMap((conf) => (conf && Array.isArray(conf.pets) ? conf.pets : []))
      .map((pet) => ({
        id: String((pet && pet.id) || ''),
        name: String((pet && pet.name) || '').trim(), // host 已保证 name 缺失时回落 id
        display: String((pet && pet.display) || ''),
      }))
      .filter((pet) => pet.id);
    if (!pets.length) return; // 配置里没有任何宠物：没有可切换的对象，不建托盘
    // 托盘「退出」是否可用：独立应用与手动 start-desktop 流都可以自己 app.quit()；
    // BRIDGE 下本进程由宿主拉起，自己退会被当成崩溃按退避重启，必须先问宿主（GET /quit 的 canQuit）。
    // 探测失败一律按不支持处理，菜单项因此不出现。
    let hostCanQuit = false;
    if (BRIDGE && !APP_MODE) {
      try {
        hostCanQuit = JSON.parse((await hostRequest('GET', PET_ROUTE + '/quit')).body || '{}').canQuit === true;
      } catch (e) {
        console.error('[dsh-pet-desktop-helper] quit capability probe failed:', String(e && e.message ? e.message : e));
      }
    }
    const canQuit = APP_MODE || !BRIDGE || hostCanQuit;
    const quitApp = () => {
      if (!BRIDGE || APP_MODE) {
        app.quit();
        return;
      }
      // 交给宿主停机：它会先停本进程再退，所以这条请求不用等结果
      hostRequest('POST', PET_ROUTE + '/quit').catch((e) => {
        console.error('[dsh-pet-desktop-helper] tray quit failed:', String(e && e.message ? e.message : e));
      });
    };
    tray = new Tray(trayIcon());
    tray.setToolTip('dsh-pet 桌面宠物');
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '退出', click: quitApp },
      ]),
    );
    // Windows 上 setContextMenu 只接管右键，左键默认什么都不做（macOS 相反：左键即弹菜单）
    if (TRAY_PLATFORM.leftClickPopsMenu) tray.on('click', () => tray.popUpContextMenu());
  } catch (e) {
    console.error('[dsh-pet-desktop-helper] tray init failed:', String(e && e.message ? e.message : e));
  }
}

app.whenReady().then(() => {
  if (APP_MODE)
    process.on('dsh-pet:refresh-desktop', (options) => {
      if (!options?.keepExisting) {
        for (const win of [...windows.values()]) win.destroy();
        windows.clear();
      }
      createPetWindows();
      if (options?.refreshId) windows.get(options.refreshId)?.webContents.send('pet:role-changed');
      if (tray) {
        tray.destroy();
        tray = null;
      }
      void startTray();
    });
  require('./companion.js').installCompanion();
  require('./desktop-game.js').installDesktopGame();
  // 探测子进程：此时没有 force-device-scale-factor，读到的是 Windows 的真实主屏缩放。
  // 退出推迟一拍——在 ready 回调里直接 app.exit() 会赶在 stdout 落盘前拆掉进程
  if (DPI_PROBE) {
    process.stdout.write(DPI_MARK + screen.getPrimaryDisplay().scaleFactor + '\n');
    setTimeout(() => app.exit(0), 0);
    return;
  }
  console.error(
    '[dsh-pet-desktop-helper] displays: ' +
      JSON.stringify(deskGeometry()) +
      ' forcedScaleFactor=' +
      (FORCED_SCALE || 'off') +
      ' primaryScale=' +
      (PRIMARY_SCALE || 'unknown') +
      ' petScale=' +
      petScale(),
  );

  if (BRIDGE) {
    // 自定义 scheme 接住渲染端全部请求（配置/余额/碎碎念/广播/素材）
    protocol.handle('dsh-pet-bridge', (request) =>
      handleBridgeRequest(request).catch((e) => {
        console.error('[dsh-pet-desktop-helper] bridge handler error:', String(e && e.message ? e.message : e));
        return new Response('dsh-pet: bridge error', {
          status: 502,
          headers: { 'access-control-allow-origin': '*' },
        });
      }),
    );
    startBridgeCallback(); // 宿主应答回调服务器（stdin 在 Electron 主进程不可用，改走本地 HTTP）
  }

  // macOS：桌面宠物不该占 Dock。不跟 trayEnabled 联动——宠物本体的右键菜单仍在，桌面侧还能操作。
  if (TRAY_PLATFORM.hideDock && app.dock) app.dock.hide();

  // 托盘：不 await（建窗与建托盘互不依赖），内部自己等 bridge 回调服务就绪
  void startTray();

  linuxPointer?.start();
  createPetWindows();

  // 合盖/唤醒是任务栏按钮重建最集中的时刻：resume / unlock-screen 后把每只宠物重新摘一次。
  // powerMonitor 只能在 ready 之后使用，所以挂在这里而不是模块顶层。
  const reassertTaskbar = () => {
    for (const win of windows.values()) keepOffTaskbar(win);
  };
  powerMonitor.on('resume', reassertTaskbar);
  powerMonitor.on('unlock-screen', reassertTaskbar);

  // 宠物窗口跟随：renderer 逐帧上报窗口内容区位置/尺寸
  ipcMain.on('pet:set-bounds', (event, bounds) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    const x = Number(bounds?.x);
    const y = Number(bounds?.y);
    const width = Number(bounds?.width);
    const height = Number(bounds?.height);
    if (![x, y, width, height].every(Number.isFinite)) return;
    // 去重必须比较我们上一次请求的值，绝不能拿 win.getContentBounds() 的回读值来比：
    // 跨缩放屏的 DIP↔物理往返有向外取整与原点舍入，读回值永远不等于设定值，去重就永远不生效。
    const rect = { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
    const key = rect.x + ',' + rect.y + ',' + rect.width + ',' + rect.height;
    if (lastRequestedBounds.get(win.id) !== key) {
      lastRequestedBounds.set(win.id, key);
      win.setContentBounds(rect, false);
    }
    // 窗口余量（左右/上）：命中区判定的依据，余量四边不再相等。
    const ml = Number(bounds?.marginL);
    const mt = Number(bounds?.marginT);
    if (Number.isFinite(ml) && Number.isFinite(mt)) winMargins.set(win.id, { l: ml, t: mt });
    // 碰撞站场的位置必须用包围盒左上角（渲染端显式上报 boxX/boxY）：窗口坐标 = 包围盒 − margin，
    // 直接拿窗口坐标会让跨窗检测整体错位。
    const petId = [...windows.keys()].find((id) => windows.get(id) === win);
    if (petId) {
      const bx = Number(bounds?.boxX);
      const by = Number(bounds?.boxY);
      const size = Number(bounds?.size);
      const bottomPad = Number(bounds?.bottomPad);
      const vx = Number(bounds?.vx);
      const vy = Number(bounds?.vy);
      // 位置 + 尺寸 + 速度一并登记：set-bounds 每次位置变化都会触发，带上尺寸静止宠物才能被
      // 跨窗碰撞检测看见；速度取渲染端上报值（飞行中实时、静止/拖拽 = 0），落地后不残留旧速度。
      updatePetState(petId, {
        x: Number.isFinite(bx) ? bx : x,
        y: Number.isFinite(by) ? by : y,
        size: Number.isFinite(size) && size > 0 ? size : petStates.get(petId)?.size || 0,
        bottomPad: Number.isFinite(bottomPad) && bottomPad > 0 ? bottomPad : petStates.get(petId)?.bottomPad || 0,
        vx: Number.isFinite(vx) ? vx : 0,
        vy: Number.isFinite(vy) ? vy : 0,
      });
    }
  });

  // 飞行状态上报（碰撞站场）：renderer 飞行中每 ~30ms 上报一次自己的位置/速度/尺寸
  ipcMain.on('pet:report-flight', (event, state) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    const petId = [...windows.keys()].find((id) => windows.get(id) === win);
    if (!petId) return;
    const s = state || {};
    const x = Number(s.x);
    const y = Number(s.y);
    const vx = Number(s.vx);
    const vy = Number(s.vy);
    const size = Number(s.size);
    const bottomPad = Number(s.bottomPad);
    if (![x, y, vx, vy, size, bottomPad].every(Number.isFinite)) return;
    updatePetState(petId, { x, y, vx, vy, size, bottomPad });
  });

  // 碰撞结果转发：飞行方窗口检测到撞到 targetId → 把动量结果（目标新初速）转发给目标窗口
  ipcMain.on('pet:collide-result', (event, payload) => {
    const targetId = payload && typeof payload === 'object' ? String(payload.targetId || '') : '';
    const vx = Number(payload?.vx);
    const vy = Number(payload?.vy);
    if (!targetId || !Number.isFinite(vx) || !Number.isFinite(vy)) return;
    const targetWin = windows.get(targetId);
    if (targetWin && !targetWin.isDestroyed()) {
      targetWin.webContents.send('pet:hit', { vx, vy });
    }
  });

  // 点击穿透翻转：渲染端在光标进出身体命中区时上报；穿透期间仍保留 forward。
  // 兜底轮询也走同一个出口 setWindowIgnore，两条通道共享同一份镜像状态。
  ipcMain.on('pet:set-interactive', (event, interactive) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    const input = inputRegions.get(win.id);
    // 渲染端的旧 menuOpen/chatOpen 守卫会请求整窗可交互；这里按真实光标和控件矩形裁定。
    const ignoring =
      interactive && input && inputBusy.get(win.id)
        ? decideWindowIgnore(
            win.getContentBounds(),
            screen.getCursorScreenPoint(),
            false,
            true,
            0,
            input,
            winMargins.get(win.id),
          )
        : !interactive;
    setWindowIgnore(win, ignoring);
  });

  // 拖拽持有完整输入租约；菜单/对话则由 inputRegions 把交互限制在实际控件矩形内。
  // 这里只存标记、不直接翻窗口——唯一出口仍是 setWindowIgnore，否则两条通道会抢着翻同一个窗口。
  ipcMain.on('pet:input-busy', (event, busy) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    inputBusy.set(win.id, !!busy);
  });

  ipcMain.on('pet:input-regions', (event, input) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed() || !input || !Array.isArray(input.rects)) return;
    const rects = input.rects.filter(
      (r) => r && [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width > 0 && r.height > 0,
    );
    inputRegions.set(win.id, { dragging: input.dragging === true, rects });
  });

  // 右键菜单「打开网站」：交给系统默认浏览器（等效网页里 Ctrl+点击链接），不建专属窗口——
  // 宠物窗口是透明小窗，不该承载常规网页浏览。URL 由渲染端从 configUrl 推导。
  const openSite = (url) => {
    // 宿主注入的已鉴权站点 URL（含本进程启动令牌）：DSH 只在 GET / 接受它并换发浏览器 Cookie，
    // 裸 origin 在默认浏览器里必然 401。令牌等价登录态，只在与目标同 origin 时启用，
    // 绝不让它被带去别的站点；取不到该变量时行为与以前一致。
    let target = url;
    const authed = process.env.DSH_PET_SITE_URL || '';
    if (/^https?:[/][/]/.test(authed)) {
      try {
        if (new URL(authed).origin === new URL(url).origin) target = authed;
      } catch {
        /* 形状不对：保持裸地址（原行为） */
      }
    }
    shell.openExternal(target).catch((error) => {
      console.error('[dsh-pet-desktop-helper] openExternal failed:', error);
    });
  };

  // 去向由宿主形态决定：desktop 用应用自注册的 dsh:// 协议把主窗口叫回前台（已运行则被单实例锁
  // 拦下、宿主收到 second-instance 后聚焦；未运行则协议直接把应用拉起来），比 spawn 宿主 exe 干净；
  // site 则是原行为：系统默认浏览器打开站点。
  ipcMain.on('pet:open-site', (event, payload) => {
    const url = payload && typeof payload === 'object' ? String(payload.url || '') : '';
    if (!/^https?:[/][/]/.test(url)) return;
    if (OPEN_TARGET === 'desktop') {
      // 协议未注册（绿色版 / 注册表被清）时回落成打开站点，至少不是"点了没反应"
      shell.openExternal('dsh://open').catch((error) => {
        console.error('[dsh-pet-desktop-helper] open dsh:// failed, falling back to site:', error);
        openSite(url);
      });
      return;
    }
    openSite(url);
  });

  // 显示器热更新：分辨率/缩放变化、插拔屏、旋转都会让桌面几何失效（原先只在建窗时经 query 注入
  // 一次，运行期永不更新）。这里重算并推给所有窗口，渲染端就地重挂。
  let displaysTimer = null;
  const pushDisplays = () => {
    const geo = deskGeometry();
    lastRequestedBounds.clear(); // 坐标系变了，去重缓存作废，下一帧必须真的重设一次
    for (const win of windows.values()) {
      if (win.isDestroyed()) continue;
      // 显示器拓扑变化同样是任务栏按钮重建的时机
      keepOffTaskbar(win);
      win.webContents.send('pet:displays', geo);
    }
    console.error('[dsh-pet-desktop-helper] displays changed: ' + JSON.stringify(geo));
    // 主屏缩放可能一起变了：线性化生效期间 screen API 只报被强制的值，真实值只能靠探测子进程拿；
    // 不一致就刷新缓存，下次启动自动用上。
    if (FORCED_SCALE > 0) {
      setTimeout(() => {
        const real = probePrimaryScale();
        if (real > 0 && Math.abs(real - PRIMARY_SCALE) > 1e-6) {
          console.error(
            '[dsh-pet-desktop-helper] primary scaleFactor changed ' +
              PRIMARY_SCALE +
              ' -> ' +
              real +
              '; restart the desktop pet to resize',
          );
        }
      }, 1000).unref?.();
    }
  };
  /** 显示器事件会连发（一次改动能来好几条），去抖后只重算一次 */
  const scheduleDisplays = () => {
    if (displaysTimer) clearTimeout(displaysTimer);
    displaysTimer = setTimeout(() => {
      displaysTimer = null;
      pushDisplays();
    }, 300);
  };
  screen.on('display-metrics-changed', scheduleDisplays);
  screen.on('display-added', scheduleDisplays);
  screen.on('display-removed', scheduleDisplays);

  // 冒烟自检（默认关闭）：DSH_PET_SMOKE=1 时延时截图到 DSH_PET_SMOKE_OUT 后退出，
  // 用于验证窗口/渲染/动画链路。
  if (process.env.DSH_PET_SMOKE === '1') {
    const smokeOut = process.env.DSH_PET_SMOKE_OUT || path.join(app.getPath('temp'), 'dsh-pet-smoke.png');
    const afterMs = Number(process.env.DSH_PET_SMOKE_AFTER_MS || 9000);
    const target = windows.values().next().value;
    if (target) {
      // 转发渲染端 console（定位动画/余额/错误问题）
      target.webContents.on('console-message', (event) => {
        console.log(`[renderer:${event.level}] ${event.message}`);
      });
    }
    setTimeout(async () => {
      try {
        const first = windows.values().next().value;
        if (first && !first.isDestroyed()) {
          const dump = await first.webContents.executeJavaScript(`(async () => ({
            hasBridge: typeof window.petBridge !== 'undefined',
            hasSetInteractive: typeof window.petBridge?.setInteractive === 'function',
            viewport: window.innerWidth + 'x' + window.innerHeight,
            dpr: window.devicePixelRatio,
            debug: window.__dshPetDebug || null,
            sprites: document.querySelectorAll('.pet-sprite').length,
            errorVisible: document.getElementById('pet-error').classList.contains('visible'),
            errorText: document.getElementById('pet-error').textContent,
            firstBubble: (document.querySelector('.pet-bubble.is-on') || { textContent: '' }).textContent.slice(0, 120),
            hitCursor: (function () {
              var hit = document.querySelector('.pet-hit');
              return hit ? getComputedStyle(hit).cursor : '';
            })(),
            dragTransform: (function () {
              var hit = document.querySelector('.pet-hit');
              var stage = document.querySelector('.pet-stage');
              if (!hit || !stage) return 'no-sprite';
              var out = { idle: stage.style.transform };
              hit.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 120, clientY: 120, screenX: 120, screenY: 120, pointerId: 91 }));
              out.duringClick = stage.style.transform;
              hit.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 120, clientY: 120, screenX: 120, screenY: 120, pointerId: 91 }));
              out.afterClick = stage.style.transform;
              hit.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 200, clientY: 200, screenX: 200, screenY: 200, pointerId: 92 }));
              hit.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 280, clientY: 240, screenX: 280, screenY: 240, pointerId: 92 }));
              out.duringDrag = stage.style.transform;
              window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: 280, clientY: 240, screenX: 280, screenY: 240, pointerId: 92 }));
              out.afterDrag = stage.style.transform;
              return out;
            })(),
            releaseKeptPosition: await (async function () {
              // 独立不变量：把宠物先拖到工作区内的固定安全点（600,300），松手后窗口位置必须原地不动。
              // 拖拽抛掷物理（弹簧跟手+甩抛）下：指针长距跳跃后弹簧需要 ~0.3s 收敛，
              // 松手前停留超过 RELEASE_STALE_MS(150ms) 判为「温柔放下」（估速 null，不抛掷）——
              // 所以先等弹簧到位、再停留才松手，只测"释放瞬间是否位移"。
              var d = window.__dshPetDebug;
              var hit = document.querySelector('.pet-hit');
              if (!d || !d.dragPos || !hit) return null;
              var P = { x: d.dragPos.x, y: d.dragPos.y };
              var T = { x: 600, y: 300 }; // 目标窗口左上角（1708×1020 工作区内，远离四边）
              var upX = 1000 + (T.x - P.x);
              var upY = 600 + (T.y - P.y);
              var sleep = function (ms) {
                return new Promise(function (r) {
                  setTimeout(r, ms);
                });
              };
              hit.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 1000, clientY: 600, screenX: 1000, screenY: 600, pointerId: 93 }));
              hit.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: upX, clientY: upY, screenX: upX, screenY: upY, pointerId: 93 }));
              await sleep(400); // 弹簧跟随收敛
              var during = { x: d.dragPos.x, y: d.dragPos.y };
              await sleep(200); // 轨迹过期 → 估速 null → 温柔放下（不抛掷）
              window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: upX, clientY: upY, screenX: upX, screenY: upY, pointerId: 93 }));
              await sleep(80); // 释放处理完成
              var released = d.lastDragRelease ? { x: d.lastDragRelease.x, y: d.lastDragRelease.y } : null;
              return {
                during: during,
                released: released,
                kept: !!(released && Math.abs(released.x - during.x) <= 1 && Math.abs(released.y - during.y) <= 1),
              };
            })(),
            interactiveFlip: (function () {
              // 点击穿透命中判定：光标在命中区内→可交互；移出→穿透；拖拽中（pointer 已捕获）→强制可交互。
              // hitRect 是 sprite 坐标，mousemove 用窗口坐标——测试事件需加上窗口外扩余量 winMargin。
              var d = window.__dshPetDebug;
              var hit = document.querySelector('.pet-hit');
              if (!d || !d.hitRect || !d.winMargin || !hit) return null;
              var r = d.hitRect;
              var m = d.winMargin;
              var xIn = m.l + r.x + r.w / 2;
              var yIn = m.t + r.y + r.h / 2;
              var xOut = Math.max(0, m.l + r.x - 20);
              var yOut = Math.max(0, m.t + r.y - 20);
              var out = {};
              window.dispatchEvent(new MouseEvent('mousemove', { clientX: xIn, clientY: yIn, screenX: xIn, screenY: yIn }));
              out.inside = d.interactive === true;
              window.dispatchEvent(new MouseEvent('mousemove', { clientX: xOut, clientY: yOut, screenX: xOut, screenY: yOut }));
              out.outside = d.interactive === false;
              hit.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: xIn, clientY: yIn, screenX: xIn, screenY: yIn, pointerId: 94 }));
              window.dispatchEvent(new MouseEvent('mousemove', { clientX: xOut, clientY: yOut, screenX: xOut, screenY: yOut }));
              out.duringDragForced = d.interactive === true;
              window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: xOut, clientY: yOut, screenX: xOut, screenY: yOut, pointerId: 94 }));
              return out;
            })(),
            videoSrcA: (document.querySelectorAll('.pet-sprite video')[0] || { src: '' }).src,
            videoSrcB: (document.querySelectorAll('.pet-sprite video')[1] || { src: '' }).src,
            // 右键菜单自检：在命中区派发 contextmenu → 校验菜单挂载/根文案/子面板/运行错误
            menuSmoke: await (async function () {
              // 前面 drag/release/interactive 测试刚拖过宠：justDragged 100ms 内屏蔽右键，
              // 真实用户不会拖完立刻右键——先等 250ms 消除该时序影响
              await new Promise(function (resolve) {
                setTimeout(resolve, 250);
              });
              var hit = document.querySelector('.pet-hit');
              var d = window.__dshPetDebug;
              if (!hit || !d) return null;
              var errsBefore = (d.errors || []).length;
              try {
                hit.dispatchEvent(
                  new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 400, clientY: 260, screenX: 400, screenY: 260 }),
                );
              } catch (err) {
                return { threw: String(err), menuMounted: false };
              }
              var menu = document.querySelector('.dsh-pet-menu');
              var out = {
                threw: null,
                menuMounted: !!menu,
                menuOpen: d.menuOpen === true,
                rootText: menu ? menu.textContent.slice(0, 60) : '',
                errsNew: (d.errors || []).length - errsBefore,
              };
              if (menu) {
                var branch = menu.querySelector('.dsh-pet-menu-branch');
                if (branch) {
                  branch.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, relatedTarget: menu }));
                  var panels = Array.prototype.slice.call(
                    menu.querySelectorAll('.dsh-pet-menu-column'),
                  );
                  var visible = function () {
                    return panels.filter(function (p) {
                      return p.style.display !== 'none';
                    });
                  };
                  out.panelCount = panels.length;
                  out.lvl2AfterHoverRoot = visible().length;
                  // 二级：悬停「动作」下的第一个分类 → 打开三级面板（具体动画）
                  var panel1 = visible().filter(function (p) {
                    return p !== panels[0];
                  })[0];
                  if (panel1) {
                    var cat = panel1.querySelector('.dsh-pet-menu-branch');
                    if (cat) {
                      cat.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false, relatedTarget: panel1 }));
                      await new Promise(function (resolve) {
                        setTimeout(resolve, 50);
                      });
                      out.lvl3AfterHoverCat = visible().length;
                      // 重放用户路径：鼠标从分类项移向三级面板（先离开分类项进入 4px 缝隙，
                      // 再进入三级面板）——缝隙里 mouseleave 会排 160ms 关闭定时器
                      cat.dispatchEvent(
                        new MouseEvent('mouseleave', { bubbles: false, relatedTarget: document.body }),
                      );
                      await new Promise(function (resolve) {
                        setTimeout(resolve, 60);
                      });
                      var panel2 = visible()[visible().length - 1];
                      if (panel2) {
                        panel2.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
                      }
                      await new Promise(function (resolve) {
                        setTimeout(resolve, 220);
                      });
                      out.lvl3SurvivedAfterReenter = visible().length;
                      // 极端情况：缝隙停留超过关闭延时（鼠标犹豫）
                      cat.dispatchEvent(
                        new MouseEvent('mouseleave', { bubbles: false, relatedTarget: document.body }),
                      );
                      await new Promise(function (resolve) {
                        setTimeout(resolve, 260);
                      });
                      out.lvl3AfterGapHover = visible().length;
                    }
                  }
                }
              }
              return out;
            })(),
          }))()`);
          console.log(
            '[dsh-pet-desktop-helper] smoke dump: windows=' +
              windows.size +
              ' ids=' +
              JSON.stringify([...windows.keys()]) +
              ' => ' +
              JSON.stringify(dump),
          );
          console.log('[dsh-pet-desktop-helper] smoke bounds:', JSON.stringify(first.getContentBounds()));
          // 点击穿透 round-trip：true → 窗口捕获输入，false → 恢复整窗穿透；状态取自主进程镜像。
          // 期间暂停兜底轮询：它按真实光标翻转，冒烟时鼠标不在宠物身上会覆盖本断言的状态。
          pointerFallbackPaused = true;
          await first.webContents.executeJavaScript('window.petBridge.setInteractive(true); true;');
          await new Promise((r) => setTimeout(r, 80));
          const interactiveIgnoring = windowIgnore.get(first.id);
          await first.webContents.executeJavaScript('window.petBridge.setInteractive(false); true;');
          await new Promise((r) => setTimeout(r, 80));
          const passthroughIgnoring = windowIgnore.get(first.id);
          pointerFallbackPaused = false;
          console.log(
            '[dsh-pet-desktop-helper] smoke interactive round-trip:',
            JSON.stringify({ interactiveIgnoring, passthroughIgnoring }),
          );
          const image = await first.webContents.capturePage();
          writeFileSync(smokeOut, image.toPNG());
          console.log('[dsh-pet-desktop-helper] smoke capture:', smokeOut);
        }
      } catch (error) {
        console.error('[dsh-pet-desktop-helper] smoke capture failed:', error);
      }
      setTimeout(() => app.quit(), 500);
    }, afterMs);
  }
});

// 退出时销毁托盘图标：不销毁会在 Windows 通知区留下「幽灵图标」（鼠标划过才消失）。
// 宿主改 display 时是 SIGTERM/SIGKILL 硬杀，Windows 上拦不到，所以这条只覆盖优雅退出。
app.on('before-quit', () => {
  if (!tray) return;
  try {
    tray.destroy();
  } catch (e) {
    console.error('[dsh-pet-desktop-helper] tray destroy failed:', String(e && e.message ? e.message : e));
  }
  tray = null;
});

app.on('window-all-closed', () => {
  // 托盘常驻：桌面上没有宠物也要留着，否则「全关掉」就再也切不回来
  if (tray) return;
  app.quit();
});
