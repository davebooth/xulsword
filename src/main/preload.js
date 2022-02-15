const { contextBridge, ipcRenderer } = require('electron');
const backend = require('i18next-electron-fs-backend');

contextBridge.exposeInMainWorld('api', {
  i18nextElectronBackend: backend.preloadBindings(ipcRenderer, process),
});

contextBridge.exposeInMainWorld('shell', {
  process: {
    NODE_ENV() {
      return process.env.NODE_ENV;
    },
    DEBUG_PROD() {
      return process.env.DEBUG_PROD;
    },
    argv() {
      // argv[?] = window name ('main', 'splash' etc.)
      return process.argv;
    },
  },
});

const validChannels = [
  'global', // to/from main for use by the G object
  'window', // to main to perform window operations (move-to-back, close, etc.)
  'close', // from main upon window close
  'resize', // from main upon window resize
  'update-state-from-pref', // from main when state-prefs should be updated
  'component-reset', // from main when window top react components should be remounted
  'module-reset', // from main when modules or module contents may have changed
];

const listeners = [];

contextBridge.exposeInMainWorld('ipc', {
  renderer: {
    // Trigger a channel event which ipcMain is to listen for. If a single
    // response from ipcMain is desired, then 'invoke' should likely be used.
    // Otherwise event.reply() can respond from ipcMain if the renderer has
    // also added a listener for it.
    send(channel, ...args) {
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, ...args);
      } else throw Error(`ipc send bad channel: ${channel}`);
    },

    // Trigger a channel event which ipcMain is to listen for and respond to
    // using ipcMain.handle(), returning a promise containing the result arg(s).
    invoke(channel, ...args) {
      if (validChannels.includes(channel)) {
        ipcRenderer.invoke(channel, ...args);
      } else throw Error(`ipc invoke bad channel: ${channel}`);
    },

    // Make a synchronous call to ipcMain, blocking the renderer until ipcMain
    // responds using event.returnValue. Using invoke instead will not block the
    // renderer process.
    sendSync(channel, ...args) {
      if (validChannels.includes(channel)) {
        return ipcRenderer.sendSync(channel, ...args);
      }
      throw Error(`ipc sendSync bad channel: ${channel}`);
    },

    // Add listener func to be called after events from a channel of ipcMain
    on(channel, func) {
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender`
        const strippedfunc = (event, ...args) => func(...args);
        listeners.push(strippedfunc);
        ipcRenderer.on(channel, strippedfunc);
        return listeners.length - 1;
      }
      throw Error(`ipc on bad channel: ${channel}`);
    },

    // Remove the listener at the index returned by 'on' above. NOTE: listener
    // functions themselves cannot be passed back and forth for this purpose,
    // because they lose their identities when crossing the ipc boundary.
    removeListener(channel, listenerIndex) {
      if (validChannels.includes(channel)) {
        ipcRenderer.removeListener(channel, listeners[listenerIndex]);
        listeners[listenerIndex] = null;
      } else throw Error(`ipc removeListener bad channel: ${channel}`);
    },

    // One time listener func to be called after next event from a channel of
    // ipcMain.
    once(channel, func) {
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender`
        const strippedfunc = (event, ...args) => func(...args);
        ipcRenderer.once(channel, strippedfunc);
      } else throw Error(`ipc once bad channel: ${channel}`);
    },
  },
});
