/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable new-cap */
import path from 'path';
import i18next from 'i18next';
import C from '../constant';
import Dirs from './modules/dirs';
import Prefs from './modules/prefs';
import Cache from '../cache';
import nsILocalFile from './components/nsILocalFile';
import LibSword from './modules/libsword';
import getFontFamily from './fontfamily';

import type { ConfigType, FeatureType, GlobalPrefType, GType } from '../type';

// If a module config fontFamily specifies a URL to a font, rather
// than a fontFamily, then parse the URL. Otherwise return null.
function fontURL(mod: string) {
  const url = LibSword.getModuleInformation(mod, 'Font').match(
    /(\w+:\/\/[^"')]+)\s*$/
  );
  return url
    ? { name: `_${url[1].replace(/[^\w\d]/g, '_')}`, url: url[1] }
    : null;
}

// Read fonts which are in xulsword's xsFonts directory.
// The fonts pref is used to cache costly font data.
// If 'font' is in the pref-value, it is used, otherwise it is added
// to the pref-value. IMPORTANT: If a font is ever updated or removed,
// the fonts pref MUST be reset or updated.
export function getFontFaceConfigs(): { [i: string]: string } {
  if (!Cache.has('fontFaceConfigs')) {
    if (!LibSword.isReady('getFontFaceConfigs')) {
      throw Error(
        `getFontFaceConfigs must not be run until LibSword is ready!`
      );
    }

    // Look for xulsword local fonts, which may be included with some
    // XSM modules.
    const ret = {} as { [i: string]: string };
    let fonts = Prefs.getPrefOrCreate('fonts', 'complex', {}, 'fonts') as {
      [i: string]: { fontFamily: string; path: string };
    };
    const fontdir = Dirs.xsFonts.directoryEntries;
    let reread = false;
    fontdir?.forEach((file) => {
      if (!Object.keys(fonts).includes(file)) {
        reread = true;
      }
    });
    if (reread) {
      fonts = {};
      fontdir?.forEach((file) => {
        const font = new nsILocalFile(path.join(Dirs.path.xsFonts, file));
        let fontFamily = 'dir';
        if (!font.isDirectory()) {
          const ff = getFontFamily(font.path);
          if (ff) {
            // replace is for BPG Sans Regular, because otherwise it doesn't load in Chrome
            fontFamily = ff.replace(' GPL&GNU', '');
          } else fontFamily = 'unknown';
        }
        fonts[file] = { fontFamily, path: font.path };
      });
      Prefs.setComplexValue('fonts', fonts, 'fonts');
    }

    Object.values(fonts).forEach((info) => {
      if (info.fontFamily !== 'unknown' && info.fontFamily !== 'dir')
        ret[info.fontFamily] = `file://${info.path}`;
    });

    // Look for module config Font, which may be a URL or a fontFamily name.
    // If ther is a URL, add the font to our list of available fonts.
    const mods = LibSword.getModuleList();
    const disable =
      !Prefs.getPrefOrCreate(
        'global.HaveInternetPermission',
        'boolean',
        false
      ) &&
      !Prefs.getPrefOrCreate(
        'global.SessionHasInternetPermission',
        'boolean',
        false
      );
    if (!disable && mods && mods !== C.NOMODULES) {
      const modulelist = mods.split(C.CONFSEP);
      const modules = modulelist.map((m: string) => m.split(';')[0]);
      modules.forEach((m) => {
        const url = fontURL(m);
        if (url) ret[url.name] = url.url;
      });
    }
    Cache.write(ret, 'fontFaceConfigs');
  }

  return Cache.read('fontFaceConfigs');
}

// Return a locale (if any) to associate with a module:
//    Return a Locale with exact same language code as module
//    Return a Locale having same base language code as module, prefering current Locale over any others
//    Return a Locale which lists the module as an associated module
//    Return null if no match
function getLocaleOfModule(module: string) {
  let myLocale: string | null = null;

  const progLocale = i18next.language;
  let ml: any = LibSword.getModuleInformation(module, 'Lang').toLowerCase();
  if (ml === C.NOTFOUND) ml = undefined;

  const locales = Prefs.getComplexValue(
    'global.locales'
  ) as GlobalPrefType['global']['locales'];

  let stop = false;
  locales.forEach((l: any) => {
    const [locale] = l;
    if (stop) return;
    const lcs = locale.toLowerCase();

    if (ml && ml === lcs) {
      myLocale = locale;
      stop = true;
      return;
    }
    if (ml && lcs && ml.replace(/-.*$/, '') === lcs.replace(/-.*$/, '')) {
      myLocale = locale;
      if (myLocale === progLocale) stop = true;
    }
  });

  if (myLocale) return myLocale;

  const regex = new RegExp(`(^|s|,)+${module}(,|s|$)+`);
  locales.forEach((l: any) => {
    const [locale] = l;
    const toptions = {
      lng: locale,
      ns: 'common/config',
    };
    if (i18next.t('DefaultModule', toptions).match(regex)) myLocale = locale;
  });

  return myLocale;
}

export function getModuleConfig(mod: string) {
  if (!LibSword.isReady('getModuleConfig') && mod !== 'LTR_DEFAULT') {
    throw Error(
      `getModuleConfig(modname) must not be called until LibSword is ready!`
    );
  }
  if (!Cache.has(`moduleConfig${mod}`)) {
    const moduleConfig = {} as ConfigType;

    // All config properties should be present, having a valid value or null.
    // Read values from module's .conf file
    Object.entries(C.ConfigTemplate).forEach((entry) => {
      const prop = entry[0] as keyof typeof C.ConfigTemplate;
      const keyobj = entry[1];
      let r = null;
      if (keyobj.modConf) {
        if (mod !== 'LTR_DEFAULT') {
          r = LibSword.getModuleInformation(mod, keyobj.modConf);
          if (r === C.NOTFOUND) r = null;
        }
      }
      moduleConfig[prop] = r;
    });

    // Assign associated locales
    if (mod !== 'LTR_DEFAULT') {
      const lom = getLocaleOfModule(mod);
      moduleConfig.AssociatedLocale = lom || null;
    } else {
      moduleConfig.AssociatedLocale = i18next.language;
      moduleConfig.AssociatedModules = null;
    }

    // Normalize direction value
    moduleConfig.direction =
      moduleConfig.direction && moduleConfig.direction.search(/RtoL/i) !== -1
        ? 'rtl'
        : 'ltr';

    // if fontFamily specifies a font URL, rather than a fontFamily, then create a
    // @font-face CSS entry and use it for this module.
    const url = fontURL(mod);
    if (url) moduleConfig.fontFamily = url.name;

    // Insure there are single quotes around font names
    if (moduleConfig.fontFamily) {
      moduleConfig.fontFamily = moduleConfig.fontFamily.replace(/"/g, "'");
      if (!/'.*'/.test(moduleConfig.fontFamily))
        moduleConfig.fontFamily = `'${moduleConfig.fontFamily}'`;
    }
    Cache.write(moduleConfig, `moduleConfig${mod}`);
  }

  return Cache.read(`moduleConfig${mod}`);
}

export function getModuleConfigDefault() {
  return getModuleConfig('LTR_DEFAULT');
}

export function localeConfig(locale: string) {
  const lconfig = {} as ConfigType;
  const toptions = { lng: locale, ns: 'common/config' };
  // All config properties should be present, having a valid value or null.
  // Read any values from locale's config.json file.
  Object.entries(C.ConfigTemplate).forEach((entry) => {
    const prop = entry[0] as keyof typeof C.ConfigTemplate;
    const keyobj = entry[1];
    let r = null;
    if (keyobj.localeConf !== null) {
      r = i18next.exists(keyobj.localeConf, toptions)
        ? i18next.t(keyobj.localeConf, toptions)
        : null;
    }
    lconfig[prop] = r;
  });
  lconfig.AssociatedLocale = locale || null;
  // Module associations...
  const modules: string[] = [];
  const mods = LibSword.getModuleList();
  if (mods && mods !== C.NOMODULES) {
    mods.split(C.CONFSEP).forEach((m) => {
      const [mod] = m.split(';');
      modules.push(mod);
    });
  }
  const { AssociatedModules } = lconfig;
  const ams = (AssociatedModules && AssociatedModules.split(/\s*,\s*/)) || [];
  lconfig.AssociatedModules = null;
  const assocmods: Set<string> = new Set(
    ams.filter((m) => Object.keys(modules).includes(m))
  );
  // Associate with modules having configs that associate with this locale.
  modules.forEach((m) => {
    const config = getModuleConfig(m);
    if ('AssociatedLocale' in config && config.AssociatedLocale === locale) {
      assocmods.add(m);
    }
  });
  // Associate with modules sharing this exact locale
  modules.forEach((m) => {
    if (LibSword.getModuleInformation(m, 'Lang') === locale) {
      assocmods.add(m);
    }
  });
  // Associate with modules sharing this locale's base language
  modules.forEach((m) => {
    if (
      LibSword.getModuleInformation(m, 'Lang').replace(/-.*$/, '') ===
      locale.replace(/-.*$/, '')
    ) {
      assocmods.add(m);
    }
  });
  if (assocmods.size) {
    lconfig.AssociatedModules = Array.from(assocmods).join(',');
  }
  // Insure there are single quotes around font names
  if (lconfig.fontFamily) {
    lconfig.fontFamily = lconfig.fontFamily.replace(/"/g, "'");
    if (!/'.*'/.test(lconfig.fontFamily))
      lconfig.fontFamily = `'${lconfig.fontFamily}'`;
  }
  return lconfig;
}

export function getLocaleConfigs(): { [i: string]: ConfigType } {
  if (!Cache.has('localeConfigs')) {
    const ret = {} as { [i: string]: ConfigType };
    // Default locale config must have all CSS settings in order to
    // override unrelated ancestor config CSS.
    ret.locale = localeConfig(i18next.language);
    Object.entries(C.ConfigTemplate).forEach((entry) => {
      const key = entry[0] as keyof ConfigType;
      const typeobj = entry[1];
      if (typeobj.CSS && !ret.locale[key]) {
        const v = C.LocaleDefaultConfigCSS[key] || 'initial';
        ret.locale[key] = `${v} !important`;
      }
    });
    const locales = Prefs.getComplexValue(
      'global.locales'
    ) as GlobalPrefType['global']['locales'];
    locales.forEach((l: any) => {
      const [lang] = l;
      ret[lang] = localeConfig(lang);
    });
    Cache.write(ret, 'localeConfigs');
  }
  return Cache.read('localeConfigs');
}

export function getFeatureModules(): FeatureType {
  if (!Cache.has('featureModules')) {
    // These are CrossWire SWORD standard module features
    const sword = {
      strongsNumbers: [] as string[],
      greekDef: [] as string[],
      hebrewDef: [] as string[],
      greekParse: [] as string[],
      hebrewParse: [] as string[],
      dailyDevotion: {} as { [i: string]: string },
      glossary: [] as string[],
      images: [] as string[],
      noParagraphs: [] as string[], // should be typeset as verse-per-line
    };
    // These are xulsword features that use certain modules
    const xulsword = {
      greek: [] as string[],
      hebrew: [] as string[],
    };

    const modlist = LibSword.getModuleList();
    if (modlist === C.NOMODULES) return { ...sword, ...xulsword };
    modlist.split(C.CONFSEP).forEach((m) => {
      const [module, type] = m.split(';');
      let mlang = LibSword.getModuleInformation(module, 'Lang');
      const dash = mlang.indexOf('-');
      mlang = mlang.substring(0, dash === -1 ? mlang.length : dash);
      if (module !== 'LXX' && type === C.BIBLE && /^grc$/i.test(mlang))
        xulsword.greek.push(module);
      else if (
        type === C.BIBLE &&
        /^heb?$/i.test(mlang) &&
        !/HebModern/i.test(module)
      )
        xulsword.hebrew.push(module);

      // These Strongs feature modules do not have Strongs number keys, and so cannot be used
      const notStrongsKeyed = new RegExp(
        '^(AbbottSmith|InvStrongsRealGreek|InvStrongsRealHebrew)$',
        'i'
      );
      if (!notStrongsKeyed.test(module)) {
        const feature = LibSword.getModuleInformation(module, 'Feature');
        const features = feature.split(C.CONFSEP);
        Object.keys(sword).forEach((k) => {
          const swordk = k as keyof typeof sword;
          const swordf =
            swordk.substring(0, 1).toUpperCase() + swordk.substring(1);
          if (features.includes(swordf)) {
            if (swordk === 'dailyDevotion') {
              sword[swordk][module] = 'DailyDevotionToday';
            } else {
              sword[swordk].push(module);
            }
          }
        });
      }
    });
    Cache.write({ ...sword, ...xulsword }, 'featureModules');
  }

  return Cache.read('featureModules');
}
