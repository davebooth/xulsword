import { Server } from 'socket.io';
import i18n from 'i18next';
import log, { LogLevel } from 'electron-log';
import Setenv from '../setenv.ts';
import { JSON_parse, GCacheKey, JSON_stringify } from '../common.ts';
import C from '../constant.ts';
import G from '../main/mgServer.ts';
import handleGlobal from '../main/handleGlobal.ts';

Setenv(`${__dirname}/../../server_env.json`);

const i18nBackendMain = require('i18next-fs-backend');

G.LibSword.init();

log.info(`Loaded modules: ${G.LibSword.getModuleList()}`);

const AvailableLanguages = [
  ...new Set(
    C.Locales.map((l) => {
      return l[0];
    })
      .map((l) => {
        return [l, l.replace(/-.*$/, '')];
      })
      .flat()
  ),
];

const init = async (lng: string) => {
  await i18n
    .use(i18nBackendMain)
    .init({
      lng,
      fallbackLng: C.FallbackLanguage[lng] || ['en'],
      supportedLngs: AvailableLanguages,
      preload: AvailableLanguages,

      ns: ['xulsword', 'branding', 'config', 'books', 'numbers'],
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
      saveMissing: C.isDevelopment,
      saveMissingTo: 'current',

      react: {
        useSuspense: false,
      },

      interpolation: {
        escapeValue: false, // not needed for react as it escapes by default
      },

      keySeparator: false,
    })
    .catch((e) => {
      log.error(`ERROR: ${e}`);
    });

  // Do this in the background...
  // G.getSystemFonts();
};

const server = require('http').createServer();

const io = new Server(server, {
  cors: {
    origin: 'http://127.0.0.1:8080',
    methods: ['GET', 'POST'],
    // allowHeaders: ['my-custom-header'],
    // credentials: true,
  }
});

io.on('connection', (socket) => {
  init('en');

  socket.on(
    'error-report',
    (args: any[], callback: (r: any) => void) => {
      const [message] = args;
      throw Error(message);
    }
  );

  socket.on(
    'log',
    (args: any[], callback: (r: any) => void) => {
      const [type, windowID, json] = args;
      log[type](windowID, ...JSON_parse(json));
    }
  );

  socket.on(
    'global',
    (args: any[], callback: (r: any) => void) => {
      const acall = args.shift();
      const r = handleGlobal(-1, acall);
      log.debug(`On global: ${JSON_stringify(acall)}`);
      if (typeof callback === 'function') callback(r);
      else {
        throw Error(`G callback is not a function, is '${typeof callback}': ${JSON_stringify(acall)}`);
      }
    }
  );

});


io.listen(3000);
