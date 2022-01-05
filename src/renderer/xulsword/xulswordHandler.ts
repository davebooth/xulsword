/* eslint-disable import/no-cycle */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-loop-func */
import React from 'react';
import C from '../../constant';
import {
  decodeOSISRef,
  escapeRE,
  firstIndexOfBookGroup,
  getElementInfo,
  ofClass,
} from '../../common';
import { textChange, wheelscroll } from '../viewport/zversekey';
import Atext from '../viewport/atext';
import { convertDotString } from '../rutil';
import G from '../rg';
import Xulsword, { XulswordState } from './xulsword';
import ViewportWin from '../viewport/viewportWin';

export default function handler(
  this: Xulsword | ViewportWin,
  es: React.SyntheticEvent<any>,
  noteboxResizing?: number[],
  maximize?: boolean
) {
  const { versification } = this;
  const state = this.state as XulswordState;
  const { modules } = state;
  const target = es.target as HTMLElement;
  const atxt = ofClass(['atext'], target);
  const atext = atxt?.element;
  const n = Number(atext?.dataset.wnum);
  const i = n - 1;
  const isPinned = atext?.classList.contains('pinned');
  const module = modules[i];
  const type = module ? G.Tab[module].type : null;
  switch (es.type) {
    case 'click': {
      const e = es as React.MouseEvent;
      const targ = ofClass(
        [
          'text-pin',
          'text-win',
          'chaptermenucell',
          'heading-link',
          'bookname',
          'bookgroup',
          'open-chooser',
          'close-chooser',
          'notebox-maximizer',
          'reg-tab', // a regular tab
          'mts-tab', // the multi-tab main tab
          'mto-tab', // a multi-tab option tab
          'ilt-tab', // the interlinear tab
          'prevchaplink',
          'nextchaplink',
          'keylist',
          'sr',
          'dt',
          'dtl',
          'popupBackLink',
          'fnlink',
          'crref',
          'origoption',
        ],
        target
      );
      if (targ === null) return;
      e.preventDefault();
      const elem = targ.element;
      const p = getElementInfo(elem);
      switch (targ.type) {
        case 'text-win': {
          if (atext) {
            const options = {
              title: 'viewport',
              webPreferences: { additionalArguments: [] },
              boundingClientRect: atext.getBoundingClientRect(),
            };
            G.openWindow('viewport', options);
          }
          break;
        }
        case 'text-pin': {
          const c = ofClass(['show1', 'show2', 'show3'], target);
          const columns = c ? Number(c.type.substring(c.type.length - 1)) : 1;
          this.setState((prevState: XulswordState) => {
            const { isPinned: ip } = prevState;
            for (let x = i; x < columns + i; x += 1) {
              ip[x] = !ip[x];
            }
            return { isPinned: ip };
          });
          break;
        }
        case 'bookgroup': {
          const { bookgroup } = targ.element.dataset;
          const b = bookgroup ? firstIndexOfBookGroup(bookgroup) : null;
          if (b !== null) {
            this.setState({
              book: G.Books[b].sName,
              chapter: 1,
              verse: 1,
              selection: '',
            });
          }
          break;
        }
        case 'bookname': {
          const { book } = targ.element.dataset;
          if (book) {
            this.setState({
              book,
              chapter: 1,
              verse: 1,
              selection: '',
            });
          }
          break;
        }
        case 'chaptermenucell': {
          const { book, chapter } = targ.element.dataset;
          if (chapter) {
            this.setState({
              book,
              chapter: Number(chapter),
              verse: 1,
              selection: '',
            });
          }
          break;
        }
        case 'heading-link': {
          const {
            module: m,
            book: b,
            chapter: c,
            verse: v,
          } = targ.element.dataset;
          if (m) {
            const from = [b, c, v, G.Tab[m].v11n].join('.');
            const to = this.versification
              ? convertDotString(from, this.versification)
              : from;
            const [book, chapter, verse] = to.split('.');
            this.setState({
              book,
              chapter: Number(chapter),
              verse: Number(verse),
              selection: '',
            });
          }
          break;
        }
        case 'open-chooser': {
          this.setState({ showChooser: true });
          break;
        }
        case 'close-chooser': {
          this.setState({ showChooser: false });
          break;
        }
        case 'notebox-maximizer': {
          if (atext) {
            this.setState((prevState: XulswordState) => {
              const { maximizeNoteBox, noteBoxHeight } = prevState;
              if (maximizeNoteBox[i] > 0) {
                noteBoxHeight[i] = maximizeNoteBox[i];
                maximizeNoteBox[i] = 0;
              } else {
                maximizeNoteBox[i] = noteBoxHeight[i];
                noteBoxHeight[i] =
                  atext.clientHeight -
                  C.TextHeaderHeight -
                  C.TextBBTopMargin -
                  5;
              }
              return { maximizeNoteBox, noteBoxHeight };
            });
          }
          break;
        }
        case 'reg-tab':
        case 'mts-tab':
        case 'mto-tab':
        case 'ilt-tab': {
          const m = targ.element.dataset.module;
          if (m && m !== 'disabled' && !state.isPinned[i]) {
            if (targ.type === 'ilt-tab') {
              this.setState((prevState: XulswordState) => {
                const { ilModules } = prevState;
                ilModules[i] = ilModules[i] ? '' : m;
                return { ilModules };
              });
            } else {
              this.setState((prevState: XulswordState) => {
                const { modules: mods, mtModules } = prevState;
                mods[i] = m;
                if (targ.type === 'mto-tab' || targ.type === 'mts-tab') {
                  mtModules[i] = m;
                }
                return {
                  modules: mods,
                  mtModules,
                };
              });
            }
          }
          break;
        }
        case 'prevchaplink': {
          if (atext && !isPinned) {
            const s = textChange(atext, false);
            if (s) this.setState(s);
          }
          break;
        }
        case 'nextchaplink': {
          if (atext && !isPinned) {
            const s = textChange(atext, true);
            if (s) this.setState(s);
          }
          break;
        }
        case 'sr':
        case 'dt':
        case 'dtl':
        case 'popupBackLink':
          if (p && typeof p.osisref === 'string') {
            this.setState((prevState: XulswordState) => {
              const { keys, flagScroll } = prevState;
              const str = p.osisref as string;
              keys[i] = decodeOSISRef(str.replace(/^[^:]+:/, ''));
              flagScroll[i] = C.SCROLLTYPECHAP;
              return { keys, flagScroll };
            });
          }
          break;
        case 'keylist': {
          if (atext && target.title) {
            this.setState((prevState: XulswordState) => {
              const { keys } = prevState;
              keys[i] = decodeURIComponent(target.title);
              return { keys };
            });
            const keytextbox = atext.getElementsByClassName('keytextbox');
            if (keytextbox) {
              const ktb = keytextbox[0] as HTMLElement;
              setTimeout(() => {
                ktb.focus();
              }, 1);
            }
          }
          break;
        }
        case 'fnlink':
        case 'crref': {
          if (versification && module && p && p.mod && p.bk && p.ch && p.vs) {
            switch (type) {
              case C.BIBLE:
              case C.COMMENTARY: {
                const lvv = p.lv && targ.type === 'crref' ? p.lv : p.vs;
                const [bk, ch, vs, lv] = G.LibSword.convertLocation(
                  G.LibSword.getVerseSystem(p.mod),
                  [p.bk, p.ch, p.vs, lvv].join('.'),
                  versification
                ).split('.');
                this.setState((prevState: XulswordState) => {
                  let { flagScroll } = prevState;
                  flagScroll = flagScroll.map(() => C.SCROLLTYPECENTER);
                  return {
                    book: bk,
                    chapter: ch,
                    verse: vs,
                    flagScroll,
                    selection: [bk, ch, vs, lv].join('.'),
                  };
                });
                break;
              }
              default:
            }
          }
          break;
        }
        case 'origoption': {
          const value = elem.getAttribute('value');
          if (value) {
            const [, , , mod] = value.split('.');
            this.setState((prevState: XulswordState) => {
              const { ilModules } = prevState;
              ilModules[i] = mod;
              return { ilModules };
            });
          }
          break;
        }
        default:
          throw Error(
            `Unhandled handleViewport click event on '${target.className}'`
          );
      }
      break;
    }

    case 'keydown': {
      const e = es as React.KeyboardEvent;
      const targ = ofClass(['keytextbox'], target);
      if (targ && module) {
        e.preventDefault();
        e.stopPropagation();
        const select = targ.element as HTMLSelectElement;
        const { value } = select;
        if (!value) {
          select.style.color = '';
        } else if (Atext?.cache?.keyList) {
          const re = new RegExp(`(^|<nx>)(${escapeRE(value)}[^<]*)<nx>`, 'i');
          const firstMatch = `${Atext.cache.keyList[module].join(
            '<nx>'
          )}<nx>`.match(re);
          if (!firstMatch) {
            if (e.key !== 'backspace') {
              // eslint-disable-next-line no-console
              console.log('\u0007');
              select.style.color = 'red';
            }
          } else {
            select.style.color = '';
            this.setState((prevState: XulswordState) => {
              const { keys } = prevState;
              [, , keys[i]] = firstMatch;
              return { keys };
            });
          }
        }
      }
      break;
    }

    case 'wheel': {
      const e = es as React.MouseEvent;
      if (atext && type !== C.DICTIONARY && !ofClass(['nbc'], target)) {
        this.mouseWheel.atext = atext;
        this.mouseWheel.count += e.detail;
        if (this.mouseWheel.TO) window.clearTimeout(this.mouseWheel.TO);
        this.mouseWheel.TO = window.setTimeout(() => {
          wheelscroll(this);
        }, 250);
      }
      break;
    }

    // mousemove events passed from Atext's handler. This event means
    // the bb bar is being dragged while maximizeNoteBox > 0.
    case 'mousemove': {
      this.setState((prevState) => {
        const { maximizeNoteBox } = prevState as XulswordState;
        maximizeNoteBox[i] = 0;
        return { maximizeNoteBox };
      });
      break;
    }

    // mouseup events passed from Atext's handler.
    case 'mouseup': {
      if (noteboxResizing) {
        this.setState((prevState: XulswordState) => {
          const { maximizeNoteBox, noteBoxHeight } = prevState;
          const [initial, final] = noteboxResizing;
          if (maximize) maximizeNoteBox[i] = noteBoxHeight[i];
          noteBoxHeight[i] += initial - final;
          return { maximizeNoteBox, noteBoxHeight };
        });
      }
      break;
    }

    default:
      throw Error(`Unhandled handleViewport event type '${es.type}'`);
  }
}
