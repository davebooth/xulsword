const { contextBridge, ipcRenderer } = require('electron');
const backend = require('i18next-electron-fs-backend');

contextBridge.exposeInMainWorld('api', {
  i18nextElectronBackend: backend.preloadBindings(ipcRenderer, process),
});

const validChannels = ['prefs', 'jsdump'];

contextBridge.exposeInMainWorld('ipc', {
  renderer: {
    // Trigger a channel event which ipcMain is to listen for. If a single
    // response from ipcMain is desired, then 'invoke' should likely be used.
    // But event.reply() can respond from ipcMain if the renderer has also
    // added a listener for it.
    send(channel, ...args) {
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, ...args);
      }
    },

    // Trigger a channel event which ipcMain is to listen for and respond to
    // using ipcMain.handle(), returning a promise containing the result arg(s).
    invoke(channel, ...args) {
      if (validChannels.includes(channel)) {
        ipcRenderer.invoke(channel, ...args);
      }
    },

    // Make a synchronous call to ipcMain, blocking the renderer until ipcMain
    // responds using event.returnValue. Using invoke instead will not block the
    // renderer process.
    sendSync(channel, ...args) {
      if (validChannels.includes(channel)) {
        return ipcRenderer.sendSync(channel, ...args);
      }
      return null;
    },
    // Add listener func to be called after events from a channel of ipcMain
    on(channel, func) {
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender`
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    },

    // One time listener func to be called after next event from a channel of
    // ipcMain.
    once(channel, func) {
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender`
        ipcRenderer.once(channel, (event, ...args) => func(...args));
      }
    },
  },
});
