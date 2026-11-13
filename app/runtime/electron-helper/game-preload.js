const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('desktopGame',{
 assets:()=>ipcRenderer.invoke('game:assets'),
 update:payload=>ipcRenderer.send('game:regions',payload),
 exit:()=>ipcRenderer.send('game:exit'),
});
