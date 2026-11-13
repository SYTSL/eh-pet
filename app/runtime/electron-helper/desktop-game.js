const { BrowserWindow, ipcMain, screen, globalShortcut } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { rewardEmeralds } = require('./economy.js');

function installDesktopGame() {
  let game, owner, regions = [], dragging = false, timer, lastPosition;
  let creditedHits = 0;
  ipcMain.handle('game:assets',event=>{
    if(!game||event.sender!==game.webContents)throw new Error('Unauthorized');
    return [1,2,3].map(n=>'data:image/png;base64,'+fs.readFileSync(path.join(__dirname,'game-assets',`pig-${n}.png`)).toString('base64'));
  });
  const close = () => { if (game && !game.isDestroyed()) game.close(); };
  ipcMain.handle('game:start', (event, input) => {
    if (event.sender.getURL().split(/[?#]/)[0] !== pathToFileURL(path.join(__dirname, 'index.html')).href) throw new Error('Unauthorized');
    if (game && !game.isDestroyed()) { game.focus(); return { ok: true }; }
    owner = BrowserWindow.fromWebContents(event.sender);
    const area = screen.getDisplayMatching(owner.getBounds()).workArea;
    const source = new URL(String(input?.video || ''));
    const parts = decodeURIComponent(source.pathname).split('/');
    const name = parts.pop(); const species = parts.pop();
    if (!name || !species || /[\\/:]/.test(name + species) || !name.endsWith('.webm')) throw new Error('动画地址不正确');
    const root = path.resolve(__dirname, '../..');
    const home = process.env.DSH_HOME;
    const candidates = species === 'main' ? [path.join(home, 'dsh-pet/main-animation/webm', name),path.join(root,'assets/webm',name)] : [path.join(home,'dsh-pet/pet',species+'-animation',name)];
    const file = candidates.find(file => fs.existsSync(file));
    if (!file) throw new Error('找不到当前桌宠动画');
    game = new BrowserWindow({ ...area, frame:false,transparent:true,alwaysOnTop:true,skipTaskbar:true,resizable:false,hasShadow:false,webPreferences:{preload:path.join(__dirname,'game-preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true} });
    game.setAlwaysOnTop(true,'screen-saver');
    game.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    game.webContents.on('will-navigate',e=>e.preventDefault());
    regions=[];dragging=false;lastPosition=null;creditedHits=0;
    game.loadFile(path.join(__dirname,'desktop-game.html'),{query:{video:pathToFileURL(file).href}});
    owner.hide();
    timer=setInterval(()=>{
      if(!game||game.isDestroyed())return;
      const p=screen.getCursorScreenPoint();
      const hit=dragging||regions.some(r=>p.x>=area.x+r.x&&p.x<=area.x+r.x+r.w&&p.y>=area.y+r.y&&p.y<=area.y+r.y+r.h);
      game.setIgnoreMouseEvents(!hit,{forward:true});
    },25);
    globalShortcut.register('Escape',close);
    game.on('closed',()=>{
      clearInterval(timer);globalShortcut.unregister('Escape');game=null;
      if(owner&&!owner.isDestroyed()){
        if(lastPosition)owner.webContents.send('game:return',{x:area.x+lastPosition.x,y:area.y+lastPosition.y});
        owner.show();
      }
    });
    return {ok:true};
  });
  ipcMain.on('game:regions',(event,payload)=>{
    if(!game||event.sender!==game.webContents)return;
    const total = payload?.rewardHits;
    if (Number.isSafeInteger(total) && total > creditedHits && total <= creditedHits + 15) {
      try {
        rewardEmeralds(total - creditedHits);
        creditedHits = total;
      } catch (error) { console.warn('绿宝石保存失败', error.message); }
    }
    regions=Array.isArray(payload?.regions)?payload.regions.slice(0,50).filter(r=>[r.x,r.y,r.w,r.h].every(Number.isFinite)):[];
    dragging=payload?.dragging===true;
    if(payload?.position && Number.isFinite(payload.position.x)&&Number.isFinite(payload.position.y))lastPosition=payload.position;
  });
  ipcMain.on('game:exit',event=>{if(game&&event.sender===game.webContents)close()});
}
module.exports={installDesktopGame};
