/* eslint-disable @typescript-eslint/no-explicit-any */
import { BrowserWindow } from 'electron';
import contextMenuCreator from 'electron-context-menu';
import i18n from 'i18next';
import { findBookmarkItem } from '../common';
import { SP, SPBM } from '../constant';
import G from './mg';
import CommandsX from './components/commands';
import setViewportTabs from './tabs';
import Data from './components/data';

import type { AddCaller, ContextData, LocationVKType } from '../type';
import type { AboutWinState } from '../renderer/about/about';

// Require the calling window argument, since rg will not add it when
// Commands are called from the main process.
const Commands = CommandsX as AddCaller['Commands'];

const defaultContextData: ContextData = { type: 'general' };

export type ContextMenuType = typeof contextMenu;

export default function contextMenu(
  window: BrowserWindow,
  dispose: (() => void)[]
): void {
  // Custom context-menu target data is written to Data to be read when
  // the menu is being built.
  const cm = () => {
    return (Data.read('contextData') || defaultContextData) as ContextData;
  };

  dispose.push(
    contextMenuCreator({
      window,

      showInspectElement: Boolean(
        process.env.NODE_ENV === 'development' ||
          process.env.DEBUG_PROD === 'true'
      ),

      showSearchWithGoogle: false,
      showCopyImage: false,
      showSaveImageAs: true,
      showSelectAll: false,

      labels: {
        cut: i18n.t('menu.edit.cut'),
        // copy: i18n.t('menu.edit.copy'),
        paste: i18n.t('menu.edit.paste'),
        // selectAll: i18n.t('menu.edit.selectAll'),
        learnSpelling: 'learnSpelling',
        // lookUpSelection: 'lookUpSelection',
        searchWithGoogle: 'searchWithGoogle',
        saveImage: 'saveImage',
        // saveImageAs: 'saveImageAs',
        copyLink: 'copyLink',
        saveLinkAs: 'saveLinkAs',
        copyImage: 'copyImage',
        copyImageAddress: 'copyImageAddress',
        inspect: 'inspect',
        services: 'Services',
      },

      prepend: (actions, params) => {
        const d = cm();
        const generalMenu = [
          {
            label: `${i18n.t('Search')}: ${d.lemma}`,
            visible: Boolean(d.lemma),
            click: () => {
              if (d.search) Commands.search(d.search, window.id);
            },
          },
          actions.separator(),
          {
            label: i18n.t('menu.help.about'),
            visible: Object.keys(d).length > 0,
            enabled: Boolean(d.tab || d.context),
            click: () => {
              const mod = d.context || d.tab;
              if (mod) {
                const modules = [mod];
                if (mod && mod in G.Tab) {
                  G.LibSword.getModuleInformation(mod, 'Companion')
                    .split(/\s*,\s*/)
                    .forEach((c) => {
                      if (c && c in G.Tab) modules.push(c);
                    });
                }
                const s: Partial<AboutWinState> = {
                  showModules: true,
                  configs: modules.map((m) => G.Tab[m].conf),
                  showConf: '',
                  editConf: false,
                };
                Commands.openAbout(s, window.id);
              }
            },
          },
          {
            label: i18n.t('menu.options.font'),
            visible: Object.keys(d).length > 0,
            enabled: Boolean(d.context),
            click: () => {
              if (d.context) {
                Commands.openFontsColors(d.context, window.id);
              }
            },
          },
          {
            label: i18n.t('menu.context.close'),
            visible: Object.keys(d).length > 0,
            enabled: Boolean(
              (d.tab || d.context) && d.panelIndex !== undefined
            ),
            click: () => {
              const mod = d.tab || d.context;
              if (mod && d.panelIndex !== undefined)
                setViewportTabs(d.panelIndex, mod, 'hide');
            },
          },
        ];

        const Bookmarks = G.Prefs.getComplexValue(
          'manager.bookmarks',
          'bookmarks'
        ) as typeof SPBM.manager.bookmarks;
        const { bookmark } = d;
        const bookmarkItem =
          (bookmark && findBookmarkItem(Bookmarks, bookmark)) || null;

        const bookmarkManagerMenu: Electron.MenuItemConstructorOptions[] = [
          {
            label: i18n.t('menu.open'),
            enabled:
              bookmarkItem?.type === 'bookmark' && !!bookmarkItem.location,
            click: () => {
              if (bookmarkItem?.type === 'bookmark' && bookmarkItem.location) {
                const { location } = bookmarkItem;
                if ('v11n' in location) {
                  Commands.goToLocationVK(
                    location,
                    location,
                    undefined,
                    undefined,
                    window.id
                  );
                } else {
                  Commands.goToLocationGB(
                    location,
                    undefined,
                    undefined,
                    window.id
                  );
                }
              }
            },
          },
        ];
        if (d.type === 'bookmarkManager') return bookmarkManagerMenu;
        return generalMenu;
      },

      append: (actions, params) => {
        const d = cm();
        const generalMenu = [
          {
            label: i18n.t('Search'),
            visible: Object.keys(d).length > 0,
            enabled: Boolean(d.selection && d.context),
            click: () => {
              const { selection, context: module } = d;
              if (selection && module)
                Commands.search(
                  {
                    module,
                    searchtext: selection,
                    type: 'SearchExactText',
                  },
                  window.id
                );
            },
          },
          {
            label: i18n.t('menu.context.openSelectedRef'),
            visible: Object.keys(d).length > 0,
            enabled: Boolean(d.selectionParsedVK),
            click: () => {
              const loc = d.selectionParsedVK as LocationVKType;
              if (typeof loc === 'object') {
                Commands.goToLocationVK(
                  loc,
                  loc,
                  undefined,
                  undefined,
                  window.id
                );
              }
            },
          },
          {
            label: i18n.t('menu.context.selectVerse'),
            visible: Object.keys(d).length > 0 && !d.isPinned,
            enabled: Boolean(d.location),
            click: () => {
              const { location: locationVK } = d;
              if (locationVK && typeof locationVK === 'object') {
                Commands.goToLocationVK(
                  locationVK,
                  locationVK,
                  undefined,
                  undefined,
                  window.id
                );
              }
            },
          },
          actions.separator(),
          {
            label: i18n.t('menu.print'),
            visible: true,
            enabled: true,
            click: () => {
              Commands.print(window.id);
            },
          },
          actions.separator(),
          {
            label: i18n.t('menu.bookmark.add'),
            visible: Object.keys(d).length > 0,
            enabled: Boolean((d.context && d.location) || d.locationGB),
            click: () => {
              const { context: module, location, locationGB } = d;
              if ((module && location) || locationGB) {
                Commands.openBookmarkProperties(
                  i18n.t('menu.bookmark.add'),
                  {},
                  {
                    location: locationGB || location,
                    module: module || undefined,
                  },
                  window.id
                );
              }
            },
          },
          {
            label: i18n.t('menu.usernote.add'),
            visible: Object.keys(d).length > 0,
            enabled: Boolean((d.context && d.location) || d.locationGB),
            click: () => {
              const { context: module, location, locationGB } = d;
              if ((module && location) || locationGB) {
                Commands.openBookmarkProperties(
                  i18n.t('menu.usernote.add'),
                  {},
                  {
                    location: locationGB || location,
                    module: module || undefined,
                  },
                  window.id
                );
              }
            },
          },
          {
            label: i18n.t('menu.usernote.properties'),
            visible: Object.keys(d).length > 0,
            enabled: Boolean(d.bookmark),
            click: () => {
              if (d.bookmark) {
                Commands.openBookmarkProperties(
                  i18n.t('menu.usernote.properties'),
                  { bookmark: d.bookmark, anyChildSelectable: true },
                  undefined,
                  window.id
                );
              }
            },
          },
          {
            label: i18n.t('menu.usernote.delete'),
            visible: Object.keys(d).length > 0,
            enabled: Boolean(d.bookmark),
            click: () => {
              if (d.bookmark) {
                Commands.deleteBookmarkItems([d.bookmark], window.id);
              }
            },
          },
        ];

        const xulsword = G.Prefs.getComplexValue(
          'xulsword'
        ) as typeof SP.xulsword;
        const { location: xslocation, panels } = xulsword;
        const module =
          d.context ||
          panels.find((m) => m && m in G.Tab && G.Tab[m].isVerseKey) ||
          G.Tabs.find((t) => t.isVerseKey)?.module ||
          '';

        const bookmarkManagerMenu: Electron.MenuItemConstructorOptions[] = [
          /*
          {
            label: i18n.t('menu.print'),
            visible: true,
            enabled: true,
            click: () => {
              Commands.print(window.id);
            },
          },
          actions.separator(), */
          {
            label: i18n.t('menu.edit.cut'),
            enabled: Boolean(d.bookmarks),
            click: () => {
              if (d.bookmarks) {
                G.Prefs.setComplexValue(
                  'manager.cut',
                  d.bookmarks,
                  'bookmarks'
                );
                G.Prefs.setComplexValue('manager.copy', null, 'bookmarks');
              }
            },
          },
          {
            label: i18n.t('menu.edit.copy'),
            enabled: Boolean(d.bookmarks),
            click: () => {
              if (d.bookmarks) {
                G.Prefs.setComplexValue(
                  'manager.copy',
                  d.bookmarks,
                  'bookmarks'
                );
                G.Prefs.setComplexValue('manager.cut', null, 'bookmarks');
              }
            },
          },
          {
            label: i18n.t('menu.edit.paste'),
            enabled: Boolean(
              G.Prefs.getComplexValue('manager.cut', 'bookmarks') ||
                G.Prefs.getComplexValue('manager.copy', 'bookmarks')
            ),
            click: () => {
              const cut = G.Prefs.getComplexValue(
                'manager.cut',
                'bookmarks'
              ) as typeof SPBM.manager.cut;
              const copy = G.Prefs.getComplexValue(
                'manager.copy',
                'bookmarks'
              ) as typeof SPBM.manager.copy;
              G.Prefs.setComplexValue('manager.cut', null, 'bookmarks');
              G.Prefs.setComplexValue('manager.copy', null, 'bookmarks');
              if (d.bookmark) {
                G.Commands.pasteBookmarkItems(cut, copy, d.bookmark);
              }
            },
          },
          {
            label: i18n.t('menu.edit.undo'),
            enabled: G.canUndo(),
            click: () => {
              G.Commands.undo();
            },
          },
          {
            label: i18n.t('menu.edit.redo'),
            enabled: G.canRedo(),
            click: () => {
              G.Commands.redo();
            },
          },
          {
            label: i18n.t('menu.edit.delete'),
            visible: Object.keys(d).length > 0,
            enabled: Boolean(d.bookmark),
            click: () => {
              if (d.bookmark) {
                Commands.deleteBookmarkItems([d.bookmark], window.id);
              }
            },
          },
          actions.separator(),
          {
            label: i18n.t('menu.bookmark.add'),
            visible: Object.keys(d).length > 0,
            enabled: Boolean(d.bookmark),
            click: () => {
              if (d.bookmark) {
                Commands.openBookmarkProperties(
                  i18n.t('menu.bookmark.add'),
                  { treeSelection: d.bookmark, anyChildSelectable: true },
                  { location: xslocation, module },
                  window.id
                );
              }
            },
          },
          {
            label: i18n.t('menu.folder.add'),
            enabled: Boolean(d.bookmark),
            click: () => {
              if (d.bookmark) {
                Commands.openBookmarkProperties(
                  i18n.t('menu.folder.add'),
                  { treeSelection: d.bookmark, anyChildSelectable: false },
                  {
                    location: null,
                  },
                  window.id
                );
              }
            },
          },
          actions.separator(),
          {
            label: i18n.t('menu.edit.properties'),
            visible: Object.keys(d).length > 0,
            enabled: Boolean(d.bookmark),
            click: () => {
              if (d.bookmark) {
                Commands.openBookmarkProperties(
                  i18n.t('menu.edit.properties'),
                  { bookmark: d.bookmark, anyChildSelectable: true },
                  undefined,
                  window.id
                );
              }
            },
          },
        ];

        if (d.type === 'bookmarkManager') return bookmarkManagerMenu;
        return generalMenu;
      },
    })
  );

  // This context-menu handler must come last after contextMenuCreator, to
  // delete target data after it has been used to build the context menu.
  window.webContents.on('context-menu', () => {
    Data.readAndDelete('contextData');
  });
}
