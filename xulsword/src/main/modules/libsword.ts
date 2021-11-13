/* eslint-disable class-methods-use-this */
import { LibSwordPublic } from '../../type';

const LibSword: LibSwordClass = {
  hasBible() {
    return true;
  },

  libSwordReady() {
    return true;
  },

  getMaxChapter(modname, vkeytext) {
    return 15;
  },

  getMaxVerse(modname, vkeytext) {
    return 88;
  },

  getModuleInformation(modname, key) {
    return `This is ${key} of ${modname}`;
  },

  getModuleList() {
    return 'KJV<nx>SYN';
  },

  getVerseText(
    modname: string,
    vkeytext: string,
    keepTextNotes: boolean
  ): string {
    return 'This is some verse text!';
  },

  getVerseSystem(modname) {
    return 'KJV';
  },

  convertLocation(fromv11n, vkeytext, tov11n) {
    return fromv11n;
  },
};

// The DirsClass interface is only available in main process directly through the Dirs object
type LibSwordClass = typeof LibSwordPublic & {
  libSwordReady: () => boolean;
};

export default LibSword as LibSwordClass;
