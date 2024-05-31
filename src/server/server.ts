"use strict"
import { Server } from 'socket.io';
import i18n from 'i18next';
import helmet from 'helmet';
import session from 'express-session';
import log, { LogLevel } from 'electron-log';
import Setenv from './setenv.ts';
import { JSON_parse, invalidData as invd } from '../common.ts';
import C from '../constant.ts';
import G from '../main/mg.ts';
import GServer from '../main/mgServer.ts';
import handleGlobal from '../main/handleGlobal.ts';
import { GCallType } from 'type.ts';

const invalidData = (data: any, platform: any, depth = 0) => { return invd(data, platform, depth, log) };

Setenv(`${__dirname}/server_env.json`);

G.Dirs.init();

const logfile = G.Dirs.ProfD.append('xulsword.log');
log.transports.console.level = C.LogLevel;
log.transports.file.level = 'info'
log.transports.file.resolvePath = () => logfile.path;

const i18nBackendMain = require('i18next-fs-backend');

G.LibSword.init();

log.debug(`Loaded modules: ${G.LibSword.getModuleList()}`);
log.debug(`LogLevel: ${C.LogLevel}, Logfile: ${logfile.path}, Port: ${C.Server.port}`);

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
  serveClient: false,
  cors: {
    origin: process.env.CORS_ORIGIN,
    methods: ['GET'],
  }
});

io.engine.use(helmet());
io.engine.use(session({
  secret: 'fk95DSfgj7fUkldf',
  name: 'ibtxulsword',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: true, sameSite: true }
}));

io.on('connection', (socket) => {
  init('en');

  socket.on(
    'error-report',
    (args: any[], _callback: (r: any) => void) => {
      const invalid = invalidArgs(args);
      if (!invalid && args.length === 1) {
        const [message] = args;
        if (typeof message === 'string') {
          log.error(`error-report: ${message}`);
          return;
        }
      }
      log.error(`Ignoring 'error-report' call made with improper arguments. (${invalid})`);
    }
  );

  socket.on(
    'log',
    (args: any[], _callback: (r: any) => void) => {
      const invalid = invalidArgs(args);
      if (!invalid && args.length === 3) {
        const [type, windowID, json] = args;
        const logargs = JSON_parse(json);
        if (type in log
            && !Number.isNaN(Number(windowID))
            && Array.isArray(logargs)) {
          try {
            log[type as LogLevel](windowID, ...logargs);
          } catch (er: any) {
            log.error(er.toString());
          }
          return;
        }
      }
      log.error(`Ignoring 'log' call made with improper arguments. (${invalid})`);
    }
  );

  socket.on(
    'global',
    (args: any[], callback: (r: any) => void) => {
      log.debug(`Global ${args[0][0].startsWith('callBatch') ? 'batch of ' + (args[0][2] as any)[0].length : args[0]}`);
      const invalid = invalidArgs(args);
      if (!invalid && args.length === 1 && typeof callback === 'function') {
        const acall = args.shift() as GCallType;
        if (Array.isArray(acall) && acall.length && acall.length <= 3) {
          let r;
          try {
            r = handleGlobal(GServer, -1, acall, false);
          } catch (er) {
            log.error(er);
          }
          if (r instanceof Promise) {
            r.then((result) => {
              const invalid = invalidData(result, 'browser');
              if (!invalid) callback(result);
              else log.error(invalid);
            }).catch((er) => log.error(er));
          } else {
            const invalid = invalidData(r, 'browser');
            if (!invalid) callback(r);
            else log.error(invalid);
          }
          return;
        }
      }
      log.error(`Ignoring 'global' call made with improper arguments. (${invalid})`);
    }
  );

});

io.listen(C.Server.port);

// Return a reason message if arguments are invalid or null if they are valid.
function invalidArgs<T>(args: T[]): string | null {
  return Array.isArray(args)
    ? invalidData(args, 'browser')
    : `Arguments must be an array. (was ${typeof args})`;
}
