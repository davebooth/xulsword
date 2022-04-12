/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable import/no-duplicates */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-continue */
import i18next from 'i18next';
import C from '../../constant';
import { dString, getLocalizedChapterTerm } from '../../common';
import { getElementInfo } from '../../libswordElemInfo';
import {
  getCompanionModules,
  getMaxChapter,
  getMaxVerse,
  verseKey,
} from '../rutil';
import G from '../rg';
import { delayHandler } from '../libxul/xul';

import type {
  AtextPropsType,
  AtextStateType,
  LocationVKType,
  LookupInfo,
  ShowType,
  TextVKType,
  XulswordStatePref,
} from '../../type';
import type Xulsword from '../xulsword/xulsword';
import type { XulswordState } from '../xulsword/xulsword';
import type Atext from './atext';
import type ViewportWin from './viewportWin';
import type { ViewportWinState } from './viewportWin';

function alternateModules() {
  const am = G.ProgramConfig.AssociatedModules;
  const locale = am ? am.split(',') : [];
  const tabs = G.Prefs.getComplexValue(
    'xulsword.tabs'
  ) as XulswordStatePref['tabs'];
  const flat = tabs.flat().filter((m) => m) as string[];
  return locale.concat(flat);
}

export function getRefBible(
  mod: string | null,
  elem?: HTMLElement | null,
  reflist?: string | string[] | null,
  info?: Partial<LookupInfo>
): string | null {
  const inf = (typeof info === 'object' ? info : {}) as Partial<LookupInfo>;
  // Information collected during this search:
  inf.refcompanion = false;
  inf.userpref = false;
  inf.possibleV11nMismatch = false;
  // Is mod a Bible?
  let refbible = mod && G.Tab[mod].type === C.BIBLE ? mod : null;
  // Otherwise does mod have a Bible companion?
  if (!refbible && mod) {
    const aref = getCompanionModules(mod);
    const bible = aref.find((m) => G.Tab[m]?.type === C.BIBLE);
    if (bible) {
      refbible = bible;
      inf.refcompanion = true;
    }
  }
  // Otherwise can the bibleReflist text be returned from any installed Bible?
  // NOTE: this results in a questionable result when the v11n is unknown.
  if (!refbible) {
    let bibleReflist: string | string[] = '';
    if (reflist) {
      if (Array.isArray(reflist)) {
        bibleReflist = reflist[0] !== 'unavailable' ? reflist : '';
      } else {
        bibleReflist = reflist;
      }
    }
    if (!bibleReflist && elem) {
      bibleReflist = elem.innerHTML || '';
    }
    if (bibleReflist) {
      const v11n = (mod && mod in G.Tab && G.Tab[mod].v11n) || undefined;
      const v11nmod = (v11n && mod) || '';
      resolveExtendedScripRef(
        bibleReflist,
        v11nmod,
        alternateModules(),
        true,
        false,
        false,
        inf
      ).forEach((textvk) => {
        if (!refbible && textvk.module) {
          refbible = textvk.module;
          const lookupKeys: (keyof LookupInfo)[] = [
            'vkcompanion',
            'alternate',
            'anytab',
          ];
          lookupKeys.forEach((key) => {
            if (key in textvk) inf[key] = textvk[key];
          });
          inf.possibleV11nMismatch = true;
        }
      });
    }
  }
  // Finally, if we have a refbible, then has the user chosen an alternate
  // for it, to be used in its place?
  if (refbible) {
    const userprefBible = G.Prefs.getPrefOrCreate(
      `global.popup.selection.${mod}`,
      'string',
      refbible
    ) as string;
    if (userprefBible !== refbible) {
      refbible = userprefBible;
      inf.userpref = true;
    }
  }
  return refbible;
}

// If textvk module is not acceptable (as being a Bible or Commentary according to
// the commentary argument) or if it does not contain the text, then alternate mod-
// ules may be checked. First any companion modules are tried, unless altModules is set
// to false. Then altModules are searched in order. If still a text is not found, and
// findAny is set, then all tabs are searched in order. The textvk object reference
// is updated to contain any located text and module. If a text string was found,
// (meaning a string longer than 7 characters since modules may use various empty
// verse place-holders, it is returned, or else the empty string is returned. LookupInfo
// data is also returned via an info object if supplied.
export function findVerseKeyText(
  textvk: TextVKType,
  altModules: string[] | null | false,
  keepNotes = true,
  commentaries: boolean | 'only' | null | undefined,
  findAny = true,
  info?: Partial<LookupInfo>
): string {
  const i = (typeof info === 'object' ? info : {}) as LookupInfo;
  // Information collected during this search:
  i.vkcompanion = false;
  i.alternate = false;
  i.anytab = false;
  const vk = verseKey(textvk.location);
  // Is module acceptable, or if not, is there a companion which is?
  const mtype = textvk.module in G.Tab && G.Tab[textvk.module].type;
  const modOK =
    (mtype === C.BIBLE && commentaries !== 'only') ||
    (mtype === C.COMMENTARY && commentaries);
  if (!modOK && altModules !== false) {
    const companions = getCompanionModules(textvk.module);
    const compOK = companions.find((comp) => {
      const ctype = comp in G.Tab && G.Tab[comp].type;
      return (
        (ctype === C.BIBLE && commentaries !== 'only') ||
        (ctype === C.COMMENTARY && commentaries)
      );
    });
    const tov11n = compOK && G.Tab[compOK].v11n;
    if (tov11n) {
      vk.v11n = tov11n;
      textvk.module = compOK;
      textvk.location = vk.location();
      i.vkcompanion = true;
    }
  }
  const { book } = vk;
  function tryText(mod: string) {
    if (!mod || !(mod in G.Tab)) return;
    const { module, type, v11n } = G.Tab[mod];
    const isOK =
      (type === C.BIBLE && commentaries !== 'only') ||
      (type === C.COMMENTARY && commentaries);
    if (isOK && v11n && G.getBooksInModule(module).includes(book)) {
      const text = G.LibSword.getVerseText(
        module,
        vk.osisRef(v11n),
        keepNotes
      ).replace(/\n/g, ' ');
      if (text && text.length > 7) {
        textvk.text = text;
        textvk.module = module;
        vk.v11n = v11n;
        textvk.location = vk.location();
      }
    }
  }
  tryText(textvk.module);
  if (altModules) {
    altModules?.forEach((m) => {
      if (!textvk.text) {
        tryText(m);
        i.alternate = true;
      }
    });
    if (findAny) {
      G.Tabs.forEach((t) => {
        if (!textvk.text) {
          tryText(t.module);
          i.anytab = true;
        }
      });
    }
  }
  return textvk.text;
}

function getFootnoteText(module: string, ref: string, noteID: string): string {
  G.LibSword.getChapterText(module, ref);
  const notes = G.LibSword.getNotes().split(/(?=<div[^>]+class="nlist")/);
  for (let x = 0; x < notes.length; x += 1) {
    const osisID = notes[x].match(/data-osisID="(.*?)"/); // getAttribute('data-osisID');
    if (osisID && osisID[1] === ref + noteID) {
      return notes[x].replace(/(^<div[^>]+>|<\/div>$)/g, '');
      break;
    }
  }
  return '';
}

const NoterefRE = /^\s*(([^:]+):)?([^!:]+)(!.*?)\s*$/;

// This function tries to read a ";" separated list of Scripture
// references and returns HTML of the reference texts. It looks for
// osisRef type references as well as free hand references which
// may include commas. It will supply missing book, chapter, and verse
// information using previously read information (as is often the
// case after a comma). When necessary, this function will look through
// other Bible versions until it finds a version that includes the
// passage. It also takes care of verse system conversions in the process.
export function resolveExtendedScripRef(
  reflist: string | string[], // extended scripture reference string or array of regular refs
  mod: string, // primary module to use for text and v11n of reflist
  altModules?: string[] | null | false, // alternate modules to try if any
  keepNotes = true,
  commentaries?: boolean | 'only' | null,
  parseOnly?: boolean, // parse reflist to location array but don't resolve modules
  info?: Partial<LookupInfo>
): (TextVKType & Partial<LookupInfo>)[] {
  let reflistA = Array.isArray(reflist) ? reflist : [];
  if (typeof reflist === 'string') {
    reflistA = reflist.split(/\s*;\s*/);
    for (let i = 0; i < reflist.length; i += 1) {
      // Are there any commas? then add the sub refs to the list...
      const verses = reflist[i].split(/\s*,\s*/);
      if (verses.length !== 1) {
        let r = 1;
        for (let v = 0; v < verses.length; v += 1) {
          reflistA.splice(i + 1 - r, r, verses[v]);
          i += 1;
          i -= r;
          r = 0;
        }
      }
    }
  }
  const resolved: TextVKType[] = [];
  let bk = '';
  let ch = 0;
  let vs = 0;
  reflistA.forEach((r) => {
    let m = mod;
    let ref = r;
    let noteID;
    let text = '';
    const noteref = ref.match(NoterefRE);
    if (noteref) {
      [, , m, ref, noteID] = noteref;
      if (!m) m = mod;
      if (!parseOnly && m && noteID) {
        text = getFootnoteText(m, ref, noteID);
      }
    }
    const v11n = (m && m in G.Tab && G.Tab[m].v11n) || undefined;
    const vk = verseKey(ref, v11n);
    if (bk && !vk.book) {
      const ref2 = ref.replace(/[^\w\d:.-]+/g, '');
      const match = ref2.match(/^(\d+)(?::(\d+))?(?:-(\d+))?/);
      if (match) {
        const [, chvs1, vrs, chvs2] = match;
        vk.book = bk;
        if (vrs) {
          vk.chapter = Number(chvs1);
          vk.verse = Number(vrs);
          vk.lastverse = chvs2 ? Number(chvs2) : null;
        } else if (ch && vs) {
          vk.chapter = ch;
          vk.verse = Number(chvs1);
          vk.lastverse = chvs2 ? Number(chvs2) : null;
        } else {
          vk.chapter = Number(chvs1);
          vk.verse = null;
          vk.lastverse = null;
        }
      }
    }

    if (vk.book) {
      bk = vk.book;
      ch = vk.chapter;
      vs = vk.verse || 0;
    } else {
      // then reset our context, since we may have missed something along the way
      bk = '';
      ch = 0;
      vs = 0;
      return;
    }
    const aText: TextVKType & Partial<LookupInfo> = {
      location: vk.location(),
      module: m,
      text,
      noteID,
      ...info,
    };
    if (
      noteID ||
      parseOnly ||
      findVerseKeyText(
        aText,
        altModules || null,
        keepNotes,
        commentaries,
        true,
        aText
      )
    ) {
      resolved.push(aText);
    }
  });

  return resolved;
}

export function getRefHTML(
  extref: string,
  mod: string,
  keepNotes = true,
  parseOnly = false,
  info?: Partial<LookupInfo>
): string {
  const inf = typeof info === 'object' ? info : {};
  const resolved = resolveExtendedScripRef(
    extref,
    mod,
    alternateModules(),
    keepNotes,
    false,
    parseOnly,
    inf
  );
  const html: string[] = [];
  resolved.forEach((vktext) => {
    const { location, module, text, noteID } = vktext;
    const { direction, label, labelClass } = G.Tab[module];
    const crref = ['crref'];
    let cc: (keyof LookupInfo)[] = ['possibleV11nMismatch'];
    cc.forEach((c) => {
      if (vktext[c]) crref.push(c);
    });
    const crtext = ['crtext', `cs-${module || 'locale'}`];
    if (direction !== G.ProgramConfig.direction) {
      crtext.push('opposing-program-direction');
    }
    const fntext = crtext.splice(0, 1, 'fntext');
    const altlabel = ['altlabel', labelClass];
    cc = ['alternate', 'anytab'];
    cc.forEach((c) => {
      if (vktext[c]) altlabel.push(c);
    });
    const alt = cc.some((c) => vktext[c])
      ? ` <bdi><span class="${altlabel.join(' ')}">(${label})</span></bdi>`
      : '';
    let h = '';
    if (noteID) {
      h += `
      <bdi>
        <span class="${fntext.join(' ')}">${text}${alt}</span>
      </bdi>`;
    } else {
      const { book, chapter, verse, lastverse } = location;
      h += `
      <bdi>
        <a class="${crref.join(' ')}" data-title="${[
        book,
        chapter,
        verse,
        lastverse,
        module,
      ].join('.')}">${verseKey(location).readable()}</a>
      </bdi>
      <bdi>
        <span class="${crtext.join(' ')}">${text}${alt}</span>
      </bdi>`;
    }
    html.push(h);
  });
  return html.join('<span class="cr-sep"></span>');
}

// The 'notes' argument is an HTML string containing one or more nlist
// notes. An nlist note contains a single verse-key textual note.
export function getNoteHTML(
  nlist: string,
  show:
    | {
        [key in keyof ShowType]?: boolean;
      }
    | null, // null to show all types of notes
  panelIndex = 0, // used for IDs
  openCRs = false, // show scripture reference texts or not
  keepOnlyThisNote = '' // title of a single note to keep
) {
  if (!nlist) return '';

  const index = panelIndex || 0; // w is only needed for unique id creation

  let note = nlist.split(/(?=<div[^>]+class="nlist")/);
  note = note.sort((a: string, b: string) => {
    const t1 = 'un';
    const t2 = 'fn';
    const t3 = 'cr';
    const pa = getElementInfo(a);
    const pb = getElementInfo(b);
    if (pa === null) return 1;
    if (pb === null) return -1;
    if (pa.ch === pb.ch) {
      if (pa.vs === pb.vs) {
        if (pa.ntype === pb.ntype) return 0;
        if (pa.ntype === t1) return -1;
        if (pa.ntype === t2 && pb.ntype === t3) return -1;
        return 1;
      }
      return (pa.vs || 0) > (pb.vs || 0) ? 1 : -1;
    }
    if ((pa.ch || 0) < (pb.ch || 0)) return -1;
    return 1;
  });

  // Start building our html
  let t = '';

  note.forEach((anote) => {
    const p = getElementInfo(anote);
    if (p && (!keepOnlyThisNote || p.title === keepOnlyThisNote)) {
      const body = anote.replace(/(^(<div[^>]+>\s*)+|(<\/div>\s*)+$)/g, '');
      // Check if this note should be displayed, and if not then skip it
      const notetypes = { fn: 'footnotes', cr: 'crossrefs', un: 'usernotes' };
      Object.entries(notetypes).forEach((entry) => {
        const [ntype, tx] = entry;
        const type = tx as keyof ShowType;
        if (p.ntype === ntype && show && !show[type]) p.ntype = null;
      });
      if (p.ntype) {
        // Display this note as a row in the main table
        t += `<div id="w${index}.footnote.${p.title}" `;
        t += `data-title="${p.nid}.${p.bk}.${p.ch}.${p.vs}.${p.mod}" `;
        t += `class="fnrow ${openCRs ? 'cropened' : ''}">`;

        // Write cell #1: an expander link for cross references only
        t += '<div class="fncol1">';
        if (p.ntype === 'cr') {
          t += '<div class="crtwisty"></div>';
        }
        t += '</div>';

        // These are the lines for showing expanded verse refs
        t += '<div class="fncol2"><div class="fndash"></div></div>';
        t += '<div class="fncol3">&nbsp;</div>';

        // Write cell #4: chapter and verse
        t += '<div class="fncol4">';
        if (p.ch && p.vs) {
          t += `<a class="fnlink" data-title="${p.nid}.${p.bk}.${p.ch}.${p.vs}.${p.mod}">`;
          t += `<i>${dString(p.ch)}<bdi>:</bdi>${dString(p.vs)}</i>`;
          t += '</a>';
          t += ' -';
        }
        t += '</div>';

        // Write cell #5: note body
        t += `<div class="fncol5"${
          p.ntype === 'cr' ? ` data-reflist="${body}"` : ''
        }>`;

        switch (p.ntype) {
          case 'cr': {
            // If this is a cross reference, then parse the note body for references and display them
            const info = {} as Partial<LookupInfo>;
            const m = (p.mod && getRefBible(p.mod, null, body, info)) || '';
            const keepNotes = false;
            t += getRefHTML(body, m, keepNotes, !openCRs, info);
            break;
          }

          case 'fn':
            // If this is a footnote, then just write the body
            t += `<bdi><span class="fntext cs-${
              p.mod || 'locale'
            }">${body}</span></bdi>`;
            break;

          case 'un': {
            // If this is a usernote, then add direction entities and style
            const unmod = null;
            /*
              try {
                unmod = BMDS.GetTarget(
                  BM.RDF.GetResource(decodeURIComponent(p.nid)),
                  BM.gBmProperties[C.NOTELOCALE],
                  true
                );
                unmod = unmod.QueryInterface(
                  Components.interfaces.nsIRDFLiteral
                ).Value;
              } catch (er) {}
              */
            t += `<bdi><span class="noteBoxUserNote${
              unmod ? ` cs-${unmod}` : ''
            }">${body}</span></bdi>`;
            break;
          }
          default:
        }

        // Finish this body and this row
        t += '</div>';
        t += '</div>';
      }
    }
  });

  return t;
}

// Turns headings on before reading introductions
export function getIntroductions(mod: string, vkeytext: string) {
  if (!(mod in G.Tab) || G.Tab[mod].isVerseKey) {
    return { textHTML: '', intronotes: '' };
  }

  G.LibSword.setGlobalOption('Headings', 'On');

  let intro = G.LibSword.getIntroductions(mod, vkeytext);
  const notes = G.LibSword.getNotes();

  const x = G.Prefs.getBoolPref('xulsword.show.headings') ? 1 : 0;
  G.LibSword.setGlobalOption('Headings', C.SwordFilterValues[x]);

  if (
    !intro ||
    intro.length < 10 ||
    /^\s*$/.test(intro.replace(/<[^>]*>/g, ''))
  )
    intro = '';

  return { textHTML: intro, intronotes: notes };
}

export function getChapterHeading(
  location: AtextPropsType['location'],
  module: AtextPropsType['module'],
  ilModuleOption: AtextPropsType['ilModuleOption'],
  ilModule: AtextPropsType['ilModule']
) {
  if (!location || !module) return { textHTML: '', intronotes: '' };
  const { book, chapter } = location;
  let l = G.Tab[module].config.AssociatedLocale;
  if (!l) l = i18next.language; // otherwise use current program locale
  const toptions = { lng: l, ns: 'common/books' };

  const intro = getIntroductions(module, `${book} ${chapter}`);

  let lt = G.LibSword.getModuleInformation(module, 'NoticeLink');
  if (lt === C.NOTFOUND) lt = '';
  else lt = lt.replace('<a>', "<a class='noticelink'>");

  // Chapter heading has style of the locale associated with the module, or else
  // current program locale if no associated locale is installed. But notice-link
  // is always cs-module style.
  let html = `<div class="chapterhead${
    chapter === 1 ? ' chapterfirst' : ''
  } cs-${l}">`;

  html += `<div class="chapnotice cs-${module}${!lt ? ' empty' : ''}">`;
  html += `<div class="noticelink-c">${lt}</div>`;
  html += '<div class="noticetext">'; // contains a span with class cs-mod because LibSword.getModuleInformation doesn't supply the class
  html += `<div class="cs-${module}">${
    lt ? G.LibSword.getModuleInformation(module, 'NoticeText') : ''
  }</div>`;
  html += '</div>';
  html += '<div class="head-line-break"></div>';
  html += '</div>';

  html += '<div class="chaptitle" >';
  html += `<div class="chapbk">${i18next.t(book, toptions)}</div>`;
  html += `<div class="chapch">${getLocalizedChapterTerm(
    book,
    chapter,
    l
  )}</div>`;
  html += '</div>';

  html += '<div class="chapinfo">';
  html += `<div class="listenlink" data-title="${[
    book,
    chapter,
    1,
    module,
  ].join('.')}"></div>`;
  html += `<div class="introlink${
    !intro.textHTML ? ' empty' : ''
  }" data-title="${[book, chapter, 1, module].join('.')}">${i18next.t(
    'IntroLink',
    toptions
  )}</div>`;
  if (ilModule && ilModuleOption && ilModuleOption.length > 1) {
    html += '<div class="origselect">';
    html += '<select>';
    ilModuleOption.forEach((m) => {
      const selected = m === ilModule;
      html += `<option class="origoption cs-${m}" value="${book}.1.1.${m}"${
        selected ? ' selected="selected"' : ''
      }>${G.Tab[m].label}</option>`;
    });
    html += '</select>';
    html += '</div>';
  }
  html += '</div>';

  html += '</div>';

  html += '<div class="head-line-break"></div>';

  html += `<div class="introtext${
    !intro.textHTML ? ' empty' : ''
  }" data-title="${[book, chapter, 1, module].join('.')}">${
    intro.textHTML ? intro.textHTML : ''
  }</div>`;

  return { textHTML: html, intronotes: intro.intronotes };
}

// Returns true if v is a visible verse element, false otherwise. If
// ignoreNotebox is true, v is considered visible even if it's behind
// the notebox (useful for multi-column scrolling to prevent notebox
// flashing).
function verseIsVisible(v: HTMLElement, ignoreNotebox = false): boolean {
  // return false if we're not a verse
  if (!v?.classList?.contains('vs') || !('parentNode' in v)) return false;
  const sb = v.parentNode as HTMLElement;
  const nbc = sb?.nextSibling as HTMLElement;
  const nb = nbc?.lastChild as HTMLElement;
  const atext = sb?.parentNode as HTMLElement;
  if (!sb || !nbc || !nb || !atext || !atext.classList.contains('atext'))
    return false;
  const { module, columns: clx } = atext.dataset;
  const columns = Number(clx);
  if (!module) return false;
  const hd = sb.previousSibling as HTMLElement;

  // return false if we're not visible or being displayed
  const style = window.getComputedStyle(v);
  if (style.display === 'none' || style.visibility === 'hidden') return false;

  // are we a single column window?
  if (columns === 1) {
    return (
      v.offsetTop - sb.offsetTop >= sb.scrollTop &&
      v.offsetTop - sb.offsetTop <
        sb.scrollTop + sb.offsetHeight - hd.offsetHeight
    );
  }

  // multi-column windows...
  if (G.Tab[module].config.direction === 'ltr') {
    // we are LTR
    // are we outside the visible columns?
    if (v.offsetLeft > sb.offsetWidth) return false;

    // are we in the last visible column but under the footnote box?
    const partialVerse = true;
    if (
      !ignoreNotebox &&
      v.offsetLeft > sb.offsetWidth - 1.1 * nb.offsetWidth &&
      v.offsetTop + (partialVerse ? 0 : v.offsetHeight) >
        atext.offsetHeight - nbc.offsetHeight - hd.offsetHeight
    ) {
      return false;
    }

    // then we must be visible
    return true;
  }

  // we are RTL
  // are we outside the visible columns?
  if (v.offsetLeft < 0) return false;

  // are we in the last visible column but under the footnote box?
  if (
    v.offsetLeft < 0.9 * nb.offsetWidth &&
    v.offsetTop + v.offsetHeight > atext.offsetHeight - nbc.offsetHeight
  ) {
    return false;
  }

  // then we must be visible
  return true;
}

// Implement Atext verse scroll for single column panels.
export function versekeyScroll(
  sbe: HTMLElement,
  scrollProps: typeof C.ScrollPropsVK
) {
  const { module, location, scroll } = scrollProps;
  if (!location) return;
  const { book, chapter, verse } = location;
  if (!verse || scroll === null || scroll === undefined) return;

  sbe.scrollLeft = 0; // commentary may have been non-zero

  // find the element to scroll to
  let av = sbe.firstChild as ChildNode | null;
  let v = null as HTMLElement | null;
  let vf = null;
  while (av && !v) {
    const p = getElementInfo(av as HTMLElement);
    if (p !== null && p.type === 'vs') {
      if (!vf && p.bk === book && p.ch === chapter) vf = av as HTMLElement;
      if (
        p.bk === book &&
        p.ch === chapter &&
        p.vs &&
        p.lv &&
        verse >= p.vs &&
        verse <= p.lv
      )
        v = av as HTMLElement;
    }
    av = av.nextSibling;
  }

  // if not found, use first verse in current chapter
  if (!v) v = vf;

  // if neither verse nor chapter has been found, return null
  if (!v) return;

  // perform appropriate scroll action
  let vOffsetTop = v.offsetTop;
  let vt = v as HTMLElement | null;
  while (vt && vt.parentNode !== v.offsetParent) {
    vt = vt.parentNode as HTMLElement | null;
    if (vt && vt.offsetTop) vOffsetTop -= vt.offsetTop;
  }

  // some special rules for commentaries
  if (module && G.Tab[module].type === C.COMMENTARY) {
    // if part of commentary element is already visible, don't rescroll
    if (
      vOffsetTop < sbe.scrollTop &&
      vOffsetTop + v.offsetHeight > sbe.scrollTop + 20
    ) {
      return;
    }

    // commentaries should never scroll verse to middle, only to top
    if (scroll.verseAt === 'center') scroll.verseAt = 'top';
  }
  // if this is verse 1 then center becomes top
  if (verse === 1 && scroll.verseAt === 'center') scroll.verseAt = 'top';

  // scroll single column windows...
  switch (scroll.verseAt) {
    // put selected verse at the top of the window or link
    case 'top': {
      if (verse === 1) sbe.scrollTop = 0;
      else sbe.scrollTop = vOffsetTop;
      break;
    }
    // put selected verse in the middle of the window or link
    case 'center': {
      const middle = Math.round(
        vOffsetTop - sbe.offsetHeight / 2 + v.offsetHeight / 2
      );
      if (vOffsetTop < middle) {
        sbe.scrollTop = vOffsetTop;
      } else {
        sbe.scrollTop = middle;
      }
      break;
    }

    default:
      throw Error(`Unsupported single column scroll "${scroll.verseAt}"`);
  }
}

function aTextWheelScroll2(
  count: number,
  atext: HTMLElement,
  prevState: XulswordState | ViewportWinState | AtextStateType
) {
  let ret:
    | Partial<XulswordState>
    | Partial<ViewportWinState>
    | Partial<AtextStateType>
    | null = null;
  const atextstate =
    'pin' in prevState ? prevState : (null as AtextStateType | null);
  const parentstate =
    'location' in prevState
      ? prevState
      : (null as XulswordState | ViewportWinState | null);
  const location = atextstate?.pin?.location || parentstate?.location;
  if (location) {
    const panelIndex = Number(atext.dataset.index);
    const columns = Number(atext.dataset.columns);
    const { module } = atext.dataset;
    let newloc;
    // Multi-column wheel scroll simply adds a verse delta to verse state.
    if (columns > 1) newloc = verseChange(location, count);
    // Single-column wheel scroll allows default browser smooth scroll for
    // a certain period before updaing verse state to the new top verse.
    else {
      // get first verse which begins in window
      const sb = atext.getElementsByClassName('sb')[0];
      let v = sb.firstChild as HTMLElement | null;
      while (v && !verseIsVisible(v)) {
        v = v.nextSibling as HTMLElement | null;
      }
      if (!v) return null;
      const p = getElementInfo(v);
      if (p) {
        const { bk: book, ch, vs: verse } = p;
        const chapter = Number(ch);
        const v11n = (module && module in G.Tab && G.Tab[module].v11n) || 'KJV';
        if (book && chapter && verse) {
          newloc = verseKey({ book, chapter, verse, v11n }).location(
            location.v11n
          );
        }
      }
    }
    if (newloc) {
      const skipTextUpdate: boolean[] = [];
      skipTextUpdate[panelIndex] = columns === 1;
      if (parentstate) {
        ret = {
          location: newloc,
          scroll: {
            verseAt: 'top',
            skipTextUpdate,
          },
        };
      }
      if (atextstate?.pin) {
        ret = {
          pin: {
            ...atextstate.pin,
            location: newloc,
            scroll: {
              verseAt: 'top',
              skipTextUpdate,
            },
          },
        };
      }
    }
  }
  return ret;
}

let WheelSteps = 0;
export function aTextWheelScroll(
  e: React.WheelEvent,
  atext: HTMLElement,
  caller: Xulsword | ViewportWin | Atext
) {
  WheelSteps += Math.round(e.deltaY / 80);
  if (WheelSteps) {
    const { columns } = atext.dataset;
    delayHandler.bind(caller)(
      () => {
        caller.setState(
          (prevState: XulswordState | ViewportWinState | AtextStateType) => {
            const s = aTextWheelScroll2(WheelSteps, atext, prevState);
            WheelSteps = 0;
            return s;
          }
        );
      },
      columns === '1'
        ? C.UI.Atext.wheelScrollDelay
        : C.UI.Atext.multiColWheelScrollDelay,
      'wheelScrollTO'
    )();
  }
}

export function highlight(
  sbe: HTMLElement,
  selection: LocationVKType,
  module: string
) {
  // First unhilight everything
  Array.from(sbe.getElementsByClassName('hl')).forEach((v) => {
    v.classList.remove('hl');
  });

  if (!selection) return;
  const { book, chapter, verse, lastverse } = verseKey(
    selection,
    G.Tab[module].v11n || undefined
  ).location();
  if (verse) {
    const lv = lastverse || verse;
    // Then find the verse element(s) to highlight
    let av = sbe.firstChild as HTMLElement | null;
    while (av) {
      const v = getElementInfo(av);
      if (v && v.type === 'vs') {
        let hi = v.bk === book && v.ch === chapter;
        if (!v.lv || !v.vs || v.lv < verse || v.vs > lv) hi = false;
        if (hi) av.classList.add('hl');
      }

      av = av.nextSibling as HTMLElement | null;
    }
  }
}

export function trimNotes(sbe: HTMLElement, nbe: HTMLElement): boolean {
  let havefn = false;

  // get first chapter/verse
  let vf = sbe.firstChild as HTMLElement | null;
  while (vf && !verseIsVisible(vf, true)) {
    vf = vf.nextSibling as HTMLElement | null;
  }

  // get last chapter/verse
  const atext = sbe.parentNode as HTMLElement;
  const multicol = atext.dataset.columns !== '1';
  let vl = sbe.lastChild as HTMLElement | null;
  while (vl && !verseIsVisible(vl, !multicol)) {
    vl = vl.previousSibling as HTMLElement | null;
  }

  const f = vf ? getElementInfo(vf) : null;
  const l = vl ? getElementInfo(vl) : null;

  // hide footnotes whose references are scrolled off the window
  if (nbe.innerHTML) {
    const nt = Array.from(nbe.getElementsByClassName('fnrow')) as HTMLElement[];
    nt.forEach((nti) => {
      const v = getElementInfo(nti);
      if (v) {
        let display = '';
        if (
          f &&
          v.ch &&
          f.ch &&
          v.vs &&
          f.vs &&
          (v.ch < f.ch || (v.ch === f.ch && v.vs < f.vs))
        )
          display = 'none';
        if (
          l &&
          vl &&
          v.ch &&
          l.ch &&
          v.vs &&
          l.vs &&
          (v.ch > l.ch || (v.ch === l.ch && v.vs > l.vs))
        )
          display = 'none';
        nti.style.display = display;
        if (display !== 'none') havefn = true;
      }
    });
  }

  return havefn;
}

export function findVerseElement(
  sbe: HTMLElement,
  chapter: number,
  verse: number
): HTMLElement | null {
  let c = sbe.firstChild as HTMLElement | null;
  while (c) {
    if (c.classList?.contains('vs') && c.dataset.title) {
      const [, ch, vs, lv] = c.dataset.title.split('.');
      if (Number(ch) === chapter) {
        for (let x = Number(vs); x <= Number(lv); x += 1) {
          if (x === verse) return c;
        }
      }
    }
    c = c.nextSibling as HTMLElement | null;
  }
  return null;
}

// For versekey modules only. Change to a particular bk.ch or change
// the passed chapter by a delta if possible. Returns null if a requested
// change is not possible. NOTE: This function currently considers changes
// between books as not possible, although this could be done.
export function chapterChange(
  location: LocationVKType | null,
  chDelta?: number
): LocationVKType | null {
  if (!location) return null;
  const { book } = location;
  let { chapter } = location;
  if (chDelta) chapter += chDelta;
  if (chapter < 1) return null;
  const maxchapter = getMaxChapter(location.v11n, location.book);
  if (!maxchapter || chapter > maxchapter) return null;
  location.book = book;
  location.chapter = chapter;
  location.verse = 1;
  return location;
}

// For versekey modules only. Change to a particular bk.ch.vs or change
// the passed verse by a delta if possible. Returns null if a requested
// change is not possible.
export function verseChange(
  location: LocationVKType | null,
  vsDelta?: number
): LocationVKType | null {
  if (!location) return null;
  let { book, chapter, verse } = location;
  const { v11n } = location;
  if (!verse) return null;
  if (vsDelta) verse += vsDelta;
  const maxvs = getMaxVerse(v11n, [book, chapter].join('.'));
  let ps;
  if (verse < 1) {
    if (!vsDelta) return null;
    ps = chapterChange(location, -1);
    if (!ps) return null;
    verse = getMaxVerse(v11n, `${ps.book}.${ps.chapter}`);
    book = ps.book;
    chapter = ps.chapter;
  } else if (verse > maxvs) {
    if (!vsDelta) return null;
    ps = chapterChange(location, 1);
    if (!ps) return null;
    verse = 1;
    book = ps.book;
    chapter = ps.chapter;
  }
  return {
    book,
    chapter,
    verse,
    v11n,
  };
}

//
// Atext previous/next functions:
//

// For multi-column Bibles only.
export function pageChange(
  atext: HTMLElement,
  next: boolean
): LocationVKType | null {
  if (!next) {
    let firstVerse: HTMLElement | undefined;
    Array.from(atext.getElementsByClassName('vs')).forEach((v: any) => {
      if (!firstVerse && verseIsVisible(v)) firstVerse = v;
    });
    if (firstVerse) {
      const ei = getElementInfo(firstVerse);
      if (ei && (Number(ei.ch) !== 1 || ei.vs !== 1)) {
        return {
          book: ei.bk || 'Gen',
          chapter: Number(ei.ch),
          verse: ei.vs,
          v11n: (ei.mod && ei.mod in G.Tab && G.Tab[ei.mod].v11n) || 'KJV',
        };
      }
    }
  } else {
    let lastVerse: HTMLElement | undefined;
    Array.from(atext.getElementsByClassName('vs'))
      .reverse()
      .forEach((v: any) => {
        if (!lastVerse && verseIsVisible(v)) lastVerse = v;
      });
    if (lastVerse) {
      const ei = getElementInfo(lastVerse);
      if (ei) {
        const v11n = (ei.mod && ei.mod in G.Tab && G.Tab[ei.mod].v11n) || 'KJV';
        const vk = verseKey({
          book: ei.bk || 'Gen',
          chapter: Number(ei.ch),
          verse: ei.vs,
          v11n,
        });
        if (
          vk.chapter !== getMaxChapter(v11n, vk.osisRef()) ||
          vk.verse !== getMaxVerse(v11n, vk.osisRef())
        )
          return vk.location();
      }
    }
  }
  return null;
}
