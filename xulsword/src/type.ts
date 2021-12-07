/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

// Dummy func used as place holder
const func = () => {};

export interface BookType {
  sName: string;
  bName: string;
  bNameL: string;
}

export interface ConfigType {
  [index: string]: string;
}

export interface TabType {
  modName: string;
  modType:
    | 'Biblical Texts'
    | 'Lexicons / Dictionaries'
    | 'Commentaries'
    | 'Generic Books';
  modVersion: string;
  modDir: string;
  label: string;
  tabType: 'Texts' | 'Comms' | 'Dicts' | 'Genbks';
  isRTL: boolean;
  index: number;
  description: string;
  locName: string;
  conf: string;
  isCommDir: boolean;
  audio: { [index: string]: string };
  audioCode: string;
  lang: string;
}

export const DirsPublic = {
  path: 'readonly' as unknown as DirsDirectories,
};
export type DirsDirectories = {
  TmpD: string;
  xsAsset: string;
  xsAsar: string;
  xsProgram: string;
  xsDefaults: string;
  xsPrefDefD: string;
  ProfD: string;
  xsPrefD: string;
  xsResD: string;
  xsModsUser: string;
  xsFonts: string;
  xsAudio: string;
  xsBookmarks: string;
  xsVideo: string;
  xsLocale: string;
  xsModsCommon: string;
};
export const PrefsPublic = {
  getPrefOrCreate: func as unknown as (key: string, type: 'string' | 'number' | 'boolean' | 'complex', defval: any, aStore?: string) => any,
  getCharPref: func as unknown as (key: string, aStore?: string) => string,
  setCharPref: func as unknown as (key: string, value: string, aStore?: string) => boolean,
  getBoolPref: func as unknown as (key: string, aStore?: string) => boolean,
  setBoolPref: func as unknown as (key: string, value: boolean, aStore?: string) => boolean,
  getIntPref: func as unknown as (key: string, aStore?: string) => number,
  setIntPref: func as unknown as (key: string, value: number, aStore?: string) => boolean,
  getComplexValue: func as unknown as (key: string, aStore?: string) => any,
  setComplexValue: func as unknown as (key: string, value: any, aStore?: string) => boolean,
  clearUserPref: func as unknown as (key: string, aStore?: string) => boolean ,
  getStore: func as unknown as (aStore?: string) => { [s: string]: any } | null,
  writeAllStores: func as unknown as () => void,
};
export const LibSwordPublic = {
  hasBible: func as unknown as () => boolean,
  getMaxChapter: func as unknown as (modname: string, vkeytext: string) => number,
  getMaxVerse: func as unknown as (modname: string, vkeytext: string) => number,
  // getChapterText: func as unknown as (modname: string, vkeytext: string) => string,
  // getChapterTextMulti: func as unknown as (modstrlist: string, vkeytext: string) => string,
  // getFootnotes: func as unknown as () => string,
  // getCrossRefs: func as unknown as () => string,
  // getNotes: func as unknown as () => string,
  getVerseText: func as unknown as (vkeymod: string, vkeytext: string, keepTextNotes: boolean) => string,
  getModuleList: func as unknown as () => string,
  getModuleInformation: func as unknown as (modname: string, key: string) => string,
  getVerseSystem: func as unknown as (modname: string) => string,
  convertLocation: func as unknown as (fromv11n: string, vkeytext: string, tov11n: string) => string,
};

export const CommandsPublic = {
  addRepositoryModule: func as unknown as () => void,
  addLocalModule: func as unknown as () => void,
  removeModule: func as unknown as () => void,
  exportAudio: func as unknown as () => void,
  importAudio: func as unknown as () => void,
  pageSetup: func as unknown as () => void,
  printPreview: func as unknown as () => void,
  printPassage: func as unknown as () => void,
  print: func as unknown as () => void,
  search: func as unknown as () => void,
  copyPassage: func as unknown as () => void,
  openFontsColors: func as unknown as () => void,
  openBookmarksManager: func as unknown as () => void,
  openNewBookmarkDialog: func as unknown as () => void,
  openNewUserNoteDialog: func as unknown as () => void,
  openHelp: func as unknown as () => void,
  openTextWindow: func as unknown as () => void,
}

// This GPublic object will be used at runtime to create two different
// types of G objects sharing the same GType interface: one will be
// used in the main process and the other in renderer processes. The
// main process G properties access functions and data directly. But
// renderer process G properties request data through IPC from the main
// process G object. All readonly data is cached. The cache can be
//  cleared by G.reset().
export const GPublic = {
  // Global data for read only use
  Book: 'readonly',
  Tabs: 'readonly',
  Tab: 'readonly',

  ProgramConfig: 'readonly',
  LocaleConfigs: 'readonly',
  ModuleConfigs: 'readonly',
  ModuleConfigDefault: 'readonly',
  FontFaceConfigs: 'readonly',
  ModuleFeature: 'readonly',

  OPSYS: 'readonly',

  // Global functions
  resolveHtmlPath: func as unknown,
  setGlobalMenuFromPrefs: func as unknown,

  // Global objects with methods and/or data
  Prefs: PrefsPublic,
  LibSword: LibSwordPublic,
  Dirs: DirsPublic,
  Commands: CommandsPublic,
};

export interface GType {
  Book: BookType[];
  Tabs: TabType[];
  Tab: { [i: string]: TabType };

  ProgramConfig: ConfigType;
  LocaleConfigs: { [i: string]: ConfigType };
  ModuleConfigs: { [i: string]: ConfigType };
  ModuleConfigDefault: ConfigType;
  FontFaceConfigs: ConfigType[];
  ModuleFeature: { [i: string]: string };

  OPSYS: 'string';

  resolveHtmlPath: (htmlfile: string) => string;
  setGlobalMenuFromPrefs: (menu?: Electron.Menu) => void;

  Prefs: typeof PrefsPublic;
  LibSword: typeof LibSwordPublic;
  Dirs: typeof DirsPublic;
  Commands: typeof CommandsPublic;

  cache: { [i: string]: any };
  reset: () => void;
}
