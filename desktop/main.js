const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

function backupDir(){ return path.join(app.getPath('userData'), 'Backups'); }
function ensureBackupDir(){ fs.mkdirSync(backupDir(), { recursive:true }); }
function saveBackup(payload, reason='auto'){
  try{
    ensureBackupDir();
    const stamp = new Date().toISOString().replace(/[:.]/g,'-');
    const file = path.join(backupDir(), `lovebabe-${stamp}-${reason}.json`);
    fs.writeFileSync(file, JSON.stringify({version:1, backedUpAt:new Date().toISOString(), payload}, null, 2), 'utf8');
    const files = fs.readdirSync(backupDir()).filter(f=>f.endsWith('.json')).sort().reverse();
    for(const old of files.slice(30)) { try{ fs.unlinkSync(path.join(backupDir(), old)); }catch{} }
    return true;
  }catch(e){ return false; }
}
function createWindow(){
  const win = new BrowserWindow({ width:1440, height:920, minWidth:1024, minHeight:700, title:'Lovebabe', backgroundColor:'#0e0e10', autoHideMenuBar:true,
    webPreferences:{ preload:path.join(__dirname,'preload.js'), contextIsolation:true, nodeIntegration:false }});
  win.loadFile(path.join(__dirname,'app.html'));
}
app.whenReady().then(()=>{
  ensureBackupDir();
  ipcMain.handle('backup', (_e,payload,reason)=>saveBackup(payload,reason||'auto'));
  ipcMain.handle('open-backup-folder', ()=>shell.openPath(backupDir()));
  ipcMain.handle('export-backup', async (_e,payload)=>{
    const r=await dialog.showSaveDialog({title:'สำรองข้อมูล Lovebabe',defaultPath:`lovebabe-backup-${new Date().toISOString().slice(0,10)}.json`,filters:[{name:'JSON Backup',extensions:['json']}]});
    if(r.canceled||!r.filePath)return false;
    fs.writeFileSync(r.filePath,JSON.stringify(payload,null,2),'utf8');
    return true;
  });
  createWindow();
  app.on('activate',()=>{ if(BrowserWindow.getAllWindows().length===0)createWindow(); });
});
app.on('window-all-closed',()=>{ if(process.platform!=='darwin')app.quit(); });
