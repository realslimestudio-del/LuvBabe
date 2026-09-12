const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('lovebabeDesktop', {
  backup:(payload,reason)=>ipcRenderer.invoke('backup',payload,reason),
  openBackupFolder:()=>ipcRenderer.invoke('open-backup-folder'),
  exportBackup:(payload)=>ipcRenderer.invoke('export-backup',payload)
});
window.addEventListener('DOMContentLoaded',()=>{
  try{
    const set=Storage.prototype.setItem, remove=Storage.prototype.removeItem;
    let timer=null;
    function snapshot(){
      try{
        const data={};
        for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);data[k]=localStorage.getItem(k);}
        clearTimeout(timer);
        timer=setTimeout(()=>ipcRenderer.invoke('backup',data,'autosave').catch(()=>{}),1200);
      }catch{}
    }
    Storage.prototype.setItem=function(k,v){const r=set.call(this,k,v);if(this===localStorage)snapshot();return r;};
    Storage.prototype.removeItem=function(k){const r=remove.call(this,k);if(this===localStorage)snapshot();return r;};
    setTimeout(snapshot,2500);
  }catch{}
});
