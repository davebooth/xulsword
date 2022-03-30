/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint global-require: off, no-console: off */

import 'core-js/stable';
import 'regenerator-runtime/runtime';
import { app, BrowserWindow, ipcMain, IpcMainEvent } from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import i18n from 'i18next';
import Subscription from '../subscription';
import Cache from '../cache';
import C from '../constant';
import G from './mg';
import MenuBuilder, { pushPrefsToMenu } from './menu';
import { jsdump } from './mutil';
import { WindowRegistry, pushPrefsToWindows } from './window';
import contextMenu from './contextMenu';
import { checkModulePrefs } from './minit';
import LibSword from './modules/libsword';

import type { GlobalPref, WindowRegistryType } from '../type';

const i18nBackendMain = require('i18next-fs-backend');

// Get the available locale list
const Locales = G.Prefs.getComplexValue(
  'global.locales'
) as GlobalPref['global']['locales'];
const AvailableLanguages = [
  ...new Set(
    Locales.map((l) => {
      return l[0];
    })
      .map((l) => {
        return [l, l.replace(/-.*$/, '')];
      })
      .flat()
  ),
];
// Select the program's locale
let Language = G.Prefs.getCharPref('global.locale');
if (!Language) {
  const oplng = 'en'; // webpack couldn't compile os-locale module
  let matched = '';
  Locales.forEach((l) => {
    if (!matched && (l[0] === oplng || l[0].replace(/-.*$/, '') === oplng))
      [matched] = l;
  });
  Language = matched || 'ru';
  G.Prefs.setCharPref('global.locale', Language);
}
// Set program menu direction and Chromium locale. This must be done
// before the app 'ready' event is fired, which happens even before
// i18next or configs are initialized. Direction need not be forced
// for locales in Chromium's list, like fa, but must be for ky-Arab.
if ((Locales.find((l) => l[0] === Language) || [])[2] === 'rtl') {
  app.commandLine.appendSwitch('force-ui-direction', 'rtl');
}
app.commandLine.appendSwitch('lang', Language.replace(/-.*$/, ''));

const isDevelopment =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDevelopment) {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

export default class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

ipcMain.on('did-finish-render', (event: IpcMainEvent) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  const wd = WindowRegistry[win.id];
  if (!wd) return;
  const { name } = wd;

  if (name === 'xulsword' && process.env.START_MINIMIZED) {
    win.minimize();
  } else {
    win.show();
    win.focus();
  }
  if (name === 'xulsword') {
    setTimeout(() => {
      G.Window.close({ name: 'splash' });
    }, 1000);
  }
  if (process.env.NODE_ENV === 'development') win.webContents.openDevTools();
});

const openMainWindow = () => {
  let options: Electron.BrowserWindowConstructorOptions = {
    title: i18n.t('programTitle'),
    fullscreenable: true,
    width: 1024,
    height: 728,
  };

  const windowsDidClose = G.Prefs.getBoolPref(`WindowsDidClose`);
  G.Prefs.setBoolPref(`WindowsDidClose`, false);
  const persistWinPref = G.Prefs.getPrefOrCreate(
    `PersistedWindows`,
    'complex',
    {},
    'windows'
  ) as WindowRegistryType | Record<string, never>;
  const persistedWindows: WindowRegistryType = [];
  if (persistWinPref) {
    G.Prefs.deleteUserPref(`PersistedWindows`, 'windows');
    if (windowsDidClose) {
      Object.entries(persistWinPref).forEach((entry) => {
        const reg = entry[1] as WindowRegistryType[number];
        if (reg && reg.name === 'xulsword') {
          if (reg.options) options = reg.options;
        } else {
          persistedWindows.push(reg);
        }
      });
    }
  }

  G.Prefs.setComplexValue(`Windows`, {}, 'windows');
  const mainWin = BrowserWindow.fromId(
    G.Window.open({ name: 'xulsword', options })
  );

  if (!mainWin) {
    return null;
  }

  const menuBuilder = new MenuBuilder(mainWin, i18n);
  menuBuilder.buildMenu();

  LibSword.init();
  checkModulePrefs();

  const subscriptions: (() => void)[] = [];
  subscriptions.push(Subscription.subscribe('setPref', pushPrefsToWindows));
  subscriptions.push(Subscription.subscribe('setPref', pushPrefsToMenu));
  subscriptions.push(
    Subscription.subscribe('resetMain', () => {
      LibSword.quit();
      Cache.clear();
      LibSword.init();
      checkModulePrefs();
      menuBuilder.buildMenu();
    })
  );

  if (isDevelopment)
    mainWin.on('ready-to-show', () => require('electron-debug')());

  mainWin.on('close', () => {
    // Persist any open windows for the next restart
    G.Prefs.setComplexValue(
      `PersistedWindows`,
      G.Prefs.getComplexValue('Windows', 'windows'),
      'windows'
    );
    // Close all other open windows
    BrowserWindow.getAllWindows().forEach((w) => {
      if (w !== mainWin) w.close();
    });
    subscriptions.forEach((dispose) => dispose());
    LibSword.quit();
  });

  mainWin.on('closed', () => {
    jsdump('NOTE: mainWindow closed...');
  });

  persistedWindows.forEach((windowDescriptor) => {
    if (windowDescriptor) G.Window.open(windowDescriptor);
  });

  return mainWin;
};

const init = async () => {
  if (isDevelopment) {
    await (async () => {
      const installer = require('electron-devtools-installer');
      const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
      const extensions = ['REACT_DEVELOPER_TOOLS'];
      return installer
        .default(
          extensions.map((name) => installer[name]),
          forceDownload
        )
        .catch((e: Error) => jsdump(e));
    })();
  }
  // Remove this if your app does not use auto updates
  // new AppUpdater();
  await i18n
    .use(i18nBackendMain)
    .init({
      lng: Language,
      fallbackLng: isDevelopment
        ? 'cimode'
        : C.FallbackLanguage[Language] || ['en'],
      supportedLngs: AvailableLanguages,
      preload: AvailableLanguages,

      ns: ['xulsword', 'common/config', 'common/books', 'common/numbers'],
      defaultNS: 'xulsword',

      debug: false,

      backend: {
        // path where resources get loaded from
        loadPath: `${G.Dirs.path.xsAsset}/locales/{{lng}}/{{ns}}.json`,
        // path to post missing resources
        addPath: `${G.Dirs.path.xsAsset}/locales/{{lng}}/{{ns}}.missing.json`,
        // jsonIndent to use when storing json files
        jsonIndent: 2,
      },
      saveMissing: isDevelopment,
      saveMissingTo: 'current',

      react: {
        useSuspense: false,
      },

      interpolation: {
        escapeValue: false, // not needed for react as it escapes by default
      },
    })
    .catch((e) => jsdump(e));

  return i18n;
};

const subscriptions: (() => void)[] = [];
subscriptions.push(Subscription.subscribe('createWindow', contextMenu));

app.on('window-all-closed', () => {
  G.Prefs.setBoolPref(`WindowsDidClose`, true);

  // Write all prefs to disk when app closes
  G.Prefs.writeAllStores();

  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    subscriptions.forEach((dispose) => dispose());
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (!WindowRegistry.some((wd) => wd && wd.name === 'xulsword'))
    openMainWindow();
});

app
  .whenReady()
  .then(() => {
    return init();
  })
  .then(() => {
    if (!(C.DEVELSPLASH === 1 && isDevelopment)) {
      G.Window.open({
        name: 'splash',
        type: 'dialog',
        options:
          isDevelopment && C.DEVELSPLASH === 2
            ? {
                title: 'xulsword',
                width: 500,
                height: 400,
              }
            : {
                title: 'xulsword',
                width: 500,
                height: 375,
                alwaysOnTop: true,
                frame: false,
                transparent: true,
                backgroundColor: '#FFFFFF00',
              },
      });
    }
    return openMainWindow();
  })
  .catch((e) => {
    throw e.stack;
  });
