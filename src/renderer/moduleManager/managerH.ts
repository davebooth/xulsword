/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-nested-ternary */
/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable import/no-duplicates */
import { Intent } from '@blueprintjs/core';
import {
  clone,
  downloadKey,
  isRepoLocal,
  keyToDownload,
  ofClass,
  repositoryKey,
  tableRowsToSelection,
  selectionToTableRows,
  versionCompare,
  isAudioVerseKey,
  subtractVerseKeyAudioChapters,
  subtractGenBookAudioChapters,
  genBookAudio2TreeNodes,
  getDeprecatedVerseKeyAudioConf,
  getDeprecatedGenBookAudioConf,
  gbPaths,
  diff,
  builtinRepos,
  repositoryModuleKey,
  tableSelectDataRows,
} from '../../common';
import C from '../../constant';
import S from '../../defaultPrefs';
import G from '../rg';
import log from '../log';
import { TCellInfo, TCellLocation } from '../libxul/table';
import { forEachNode } from '../libxul/treeview';

import type {
  DeprecatedAudioChaptersConf,
  Download,
  FTPDownload,
  GType,
  Repository,
  RepositoryListing,
  RowSelection,
  SwordConfType,
  VerseKeyAudio,
  GenBookAudioConf,
  OSISBookType,
} from '../../type';
import type { SelectVKMType, VKSelectProps } from '../libxul/vkselect';
import type ModuleManager from './manager';
import type { ManagerState } from './manager';
import type { GBModNodeList, SelectGBMType } from '../libxul/genbookselect';

export const Tables = ['language', 'module', 'repository'] as const;

// Data that is saved between window resets, but isn't saved to prefs:
export const Saved = {
  repositoryListings: [] as RepositoryListing[],

  moduleData: {} as { [modrepKey: string]: TModuleTableRow },

  moduleLangData: {} as { [langcode: string]: TModuleTableRow[] },

  language: {
    data: [] as TLanguageTableRow[],
    tableToDataRowMap: [] as number[],
    scrollTop: 0 as number,
  },

  module: {
    data: [] as TModuleTableRow[],
    tableToDataRowMap: [] as number[],
    scrollTop: 0 as number,
  },

  repository: {
    data: [] as TRepositoryTableRow[],
    tableToDataRowMap: [] as number[],
    scrollTop: 0 as number,
  },
};

export type VersekeyDialog = {
  type: 'versekey';
  conf: SwordConfType;
  selection: SelectVKMType;
  initial: VKSelectProps['initialVKM'];
  options: VKSelectProps['options'];
  chapters: VerseKeyAudio;
  callback: (result: SelectVKMType | SelectGBMType | null) => void;
};

export type GenBookDialog = {
  type: 'genbook';
  conf: SwordConfType;
  selection: SelectGBMType;
  initial: undefined;
  options: { gbmodNodeLists?: GBModNodeList[]; gbmods?: string[] };
  chapters: GenBookAudioConf;
  callback: (result: SelectVKMType | SelectGBMType | null) => void;
};

export type TRepCellInfo = TCellInfo & {
  repo: Repository;
};

export type TModCellInfo = TCellInfo & {
  shared: boolean;
  repo: Repository;
  conf: SwordConfType;
};

export type TLangCellInfo = TCellInfo & {
  code: string;
};

export type TLanguageTableRow = [string, TLangCellInfo];

export type TModuleTableRow = [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  (dataRow: number, dataCol: number) => typeof ON | typeof OFF,
  typeof ON | typeof OFF,
  typeof ON | typeof OFF,
  TModCellInfo
];

export type TRepositoryTableRow = [
  string,
  string,
  string,
  typeof ON | typeof OFF | typeof ALWAYS_ON,
  TRepCellInfo
];

export const ON = '☑';
export const OFF = '☐';
export const ALWAYS_ON = '￭';

export const LanCol = {
  iName: 0,
  iInfo: 1,
} as const;

export const ModCol = {
  iType: 0,
  iAbout: 1,
  iModule: 2,
  iRepoName: 3,
  iVersion: 4,
  iLang: 5,
  iSize: 6,
  iFeatures: 7,
  iVersification: 8,
  iScope: 9,
  iCopyright: 10,
  iLicense: 11,
  iSourceType: 12,
  iShared: 13,
  iInstalled: 14,
  iRemove: 15,
  iInfo: 16,
} as const;

export const RepCol = {
  iName: 0,
  iDomain: 1,
  iPath: 2,
  iState: 3,
  iInfo: 4,
} as const;

export const Downloads: {
  [downloadKey: string]: Promise<number | string>;
} = {};

export type ModuleUpdates = {
  doInstall: boolean;
  installed?: SwordConfType;
  updateTo: SwordConfType;
};

export function onRowsReordered(
  this: ModuleManager,
  table: typeof Tables[number],
  propColumnIndex: number,
  direction: 'ascending' | 'descending',
  tableToDataRowMap: number[]
) {
  const state = this.state as ManagerState;
  const tbl = state[table];
  if (tbl) {
    // Update our tableToDataRowMap based on the new sorting.
    Saved[table].tableToDataRowMap = tableToDataRowMap;
    // Update initial rowSort for the next Table component reset.
    const { rowSort } = tbl;
    if (
      rowSort.propColumnIndex !== propColumnIndex ||
      rowSort.direction !== direction
    ) {
      setTableState(
        this,
        table,
        { rowSort: { propColumnIndex, direction } },
        null,
        true
      );
    }
  }
}

export function onLangCellClick(
  this: ModuleManager,
  e: React.MouseEvent,
  cell: TCellLocation
) {
  const newSelection = rowSelect(this, e, 'language', cell.tableRowIndex);
  this.loadModuleTable(newSelection as string[]);
}

export function onModCellClick(
  this: ModuleManager,
  e: React.MouseEvent,
  cell: TCellLocation
) {
  const disabled = ofClass(['disabled'], e.target);
  if (!disabled) {
    const state = this.state as ManagerState;
    const { module } = state as ManagerState;
    const { module: modtable } = Saved;
    const { selection } = module;
    const { dataRowIndex: row, tableRowIndex, dataColIndex: col } = cell;
    const drow = modtable.data[row];
    if (drow && (col === ModCol.iInstalled || col === ModCol.iRemove)) {
      // iInstalled and iRemove column clicks
      const was = drow[col] === ON || drow[ModCol.iInfo].loading;
      const is = !was;
      const selrows = selectionToTableRows(selection);
      const datarows = (
        selrows.includes(tableRowIndex) ? selrows : [tableRowIndex]
      ).map((r) => modtable.tableToDataRowMap[r] ?? r);
      modtableUpdate(
        this,
        col === ModCol.iRemove ? !is : is,
        datarows.map((ri) => modtable.data[ri][ModCol.iInfo].conf),
        col === ModCol.iRemove
      );
    } else if (drow && col === ModCol.iShared) {
      // Shared column clicks
      const is = !drow[ModCol.iInfo].shared;
      const selrows = selectionToTableRows(selection);
      (selrows.includes(tableRowIndex) ? selrows : [tableRowIndex])
        .map((r) => modtable.tableToDataRowMap[r] ?? r)
        .forEach((r) => {
          const rrow = modtable.data[r];
          if (rrow && rrow[ModCol.iInstalled] === ON) {
            rrow[ModCol.iInfo].shared = is;
          }
        });
      setTableState(this, 'module', null, modtable.data, true);
    } else {
      rowSelect(this, e, 'module', tableRowIndex);
    }
  }
}

export function onRepoCellClick(
  this: ModuleManager,
  e: React.MouseEvent,
  cell: TCellLocation
) {
  const state = this.state as ManagerState;
  const { repository } = state;
  if (repository) {
    const { repository: repotable } = state.tables;
    const { selection } = repository;
    const { dataRowIndex: row, tableRowIndex, dataColIndex: col } = cell;
    const builtin =
      repotable.data[row] && repotable.data[row][RepCol.iInfo].repo.builtin;
    if (!builtin && col === RepCol.iState) {
      const selrows = selectionToTableRows(selection);
      switchRepo(
        this,
        (selrows.includes(tableRowIndex) ? selrows : [tableRowIndex]).map(
          (r) => Saved.repository.tableToDataRowMap[r] ?? r
        ),
        repotable.data[row][RepCol.iState] === OFF
      );
    } else if (row > -1 && col < RepCol.iState) {
      rowSelect(this, e, 'repository', tableRowIndex);
    }
  }
}

export function onCellEdited(
  this: ModuleManager,
  cell: TCellLocation,
  value: string
) {
  const table = 'repository';
  const state = this.state as ManagerState;
  const { repositories } = state;
  const tbl = state[table];
  if (repositories && tbl) {
    const newCustomRepos = clone(repositories.custom);
    const tablestate = state.tables[table];
    const { dataRowIndex: row, dataColIndex: col } = cell;
    const drow = tablestate.data[row];
    if (table === 'repository' && drow) {
      const crindex = newCustomRepos.findIndex(
        (r) => repositoryKey(r) === repositoryKey(drow[RepCol.iInfo].repo)
      );
      if (crindex !== -1) {
        newCustomRepos.splice(crindex, 1);
      }
      if (col === RepCol.iDomain) drow[RepCol.iInfo].repo.domain = value;
      else if (col === RepCol.iName) drow[RepCol.iInfo].repo.name = value;
      else if (col === RepCol.iPath) drow[RepCol.iInfo].repo.path = value;
      drow[col] = value;
      newCustomRepos.push(drow[RepCol.iInfo].repo);
      setTableState(this, 'repository', null, tablestate.data, false, {
        repositories: { ...repositories, custom: newCustomRepos },
      });
      if (
        (col === RepCol.iDomain || col === RepCol.iPath) &&
        drow[RepCol.iState] === OFF
      ) {
        setTimeout(() => switchRepo(this, [row], true), 100);
      }
    }
  }
}

export async function eventHandler(
  this: ModuleManager,
  ev: React.SyntheticEvent
) {
  switch (ev.type) {
    case 'click': {
      const e = ev as React.MouseEvent;
      const [id, idext] = e.currentTarget.id.split('.');
      switch (id) {
        case 'languageListClose':
        case 'languageListOpen': {
          const open = id === 'languageListOpen';
          const state = this.state as ManagerState;
          setTableState(
            this,
            'module',
            null,
            this.filterModuleTable(null, open),
            true,
            {
              language: { ...state.language, open },
            }
          );
          break;
        }
        case 'moduleInfo': {
          const div = document.getElementById('moduleInfo');
          if (div) {
            const state = this.state as ManagerState;
            const { module } = state;
            const { module: modtable } = state.tables;
            const { selection } = module;
            const infoConfigs = selectionToDataRows('module', selection)
              .map((r) => {
                return modtable.data[r][ModCol.iInfo].conf || null;
              })
              .filter(Boolean);
            const s: Partial<ManagerState> = { infoConfigs };
            this.setState(s);
          }
          break;
        }
        case 'moduleInfoBack': {
          const s: Partial<ManagerState> = {
            infoConfigs: [],
          };
          this.setState(s);
          break;
        }
        case 'cancel': {
          G.Window.close();
          break;
        }
        case 'ok': {
          G.Window.modal([
            { modal: 'transparent', window: 'all' },
            { modal: 'darkened', window: { type: 'xulsword' } },
          ]);
          try {
            const downloads = Object.keys(Downloads).map((k) =>
              keyToDownload(k)
            );
            const promises = Object.values(Downloads);
            const installed: SwordConfType[] = [];
            const removeMods: { name: string; repo: Repository }[] = [];
            const moveMods: {
              name: any;
              fromRepo: any;
              toRepo: Repository;
            }[] = [];

            const downloadResults = await Promise.allSettled(promises);
            // Un-persist these table selections.
            setTableState(this, 'module', { selection: [] });
            setTableState(this, 'repository', { selection: [] });
            const state = this.state as ManagerState;
            const { repositories } = state;
            const { repository: repotable } = state.tables;
            const { moduleData } = Saved;
            // Get a list of all currently installed modules (those found in any
            // enabled local repository).
            repotable.data.forEach((rtd, i) => {
              if (isRepoLocal(rtd[RepCol.iInfo].repo)) {
                const listing = Saved.repositoryListings[i];
                if (Array.isArray(listing)) {
                  listing.forEach((c) => installed.push(c));
                }
              }
            });

            // Remove modules (only when there are no repositories)
            if (!repositories) {
              Object.values(moduleData).forEach((row) => {
                if (row[ModCol.iInstalled] === OFF) {
                  const modkey = repositoryModuleKey(row[ModCol.iInfo].conf);
                  const lconf = installed.find(
                    (c) => repositoryModuleKey(c) === modkey
                  );
                  if (lconf) {
                    removeMods.push({
                      name: lconf.module,
                      repo: lconf.sourceRepository,
                    });
                  }
                }
              });
              const removeResult = await G.Module.remove(removeMods);
              removeResult.forEach((r, i) => {
                if (!r) log.warn(`Failed to remove module: ${removeMods[i]}`);
              });
            }

            // Move modules (between the shared and xulsword builtins).
            Object.values(moduleData).forEach((row) => {
              if (row[ModCol.iInfo].conf.xsmType !== 'XSM_audio') {
                const { shared } = row[ModCol.iInfo];
                const module = row[ModCol.iModule];
                if (!removeMods.map((m) => m.name).includes(module)) {
                  const modkey = repositoryModuleKey(row[ModCol.iInfo].conf);
                  const conf = installed.find(
                    (c) => repositoryModuleKey(c) === modkey
                  );
                  if (conf?.sourceRepository.builtin) {
                    const toRepo = builtinRepos(G.i18n, G.Dirs.path)[
                      shared ? 0 : 1
                    ];
                    if (
                      conf &&
                      repositoryKey(conf.sourceRepository) !==
                        repositoryKey(toRepo)
                    ) {
                      moveMods.push({
                        name: module,
                        fromRepo: conf.sourceRepository,
                        toRepo,
                      });
                    }
                  }
                }
              }
            });
            const moveResult = await G.Module.move(moveMods);
            moveResult.forEach((r, i) => {
              if (!r) log.warn(`Failed to move module: ${moveMods[i]}`);
            });

            // Install modules
            const install: Parameters<GType['Module']['installDownloads']>[0] =
              [];
            downloadResults.forEach((dlr, i) => {
              if (dlr.status === 'fulfilled' && dlr.value) {
                // Find the moduleData row associated with this download. The moduleData
                // audio download URLs do not include the chapter range, so it must be
                // removed from the download URL (and don't change original download object!).
                const dl = clone(downloads[i]);
                if ('http' in dl) dl.http = dl.http.replace(/&bk=.*$/, '');
                const downloadkey = downloadKey(dl);
                const key = Object.keys(moduleData).find(
                  (k) => downloadKey(getModuleDownload(k)) === downloadkey
                );
                if (key && moduleData[key][ModCol.iInstalled] === ON) {
                  install.push({
                    download: downloads[i],
                    toRepo: builtinRepos(G.i18n, G.Dirs.path)[
                      moduleData[key][ModCol.iInfo].shared ? 0 : 1
                    ],
                  });
                }
              }
            });
            G.Module.installDownloads(
              install,
              G.Window.descriptions({ type: 'xulsword' })[0]?.id
            );
            G.Window.close();
          } catch (er) {
            log.error(er);
            G.Window.modal([{ modal: 'off', window: 'all' }]);
          }
          break;
        }
        case 'repoAdd': {
          const state = this.state as ManagerState;
          const { repositories } = state;
          if (repositories) {
            const newCustomRepos = clone(repositories.custom);
            const { repository: repotables } = state.tables;
            const rawdata = Saved.repositoryListings;
            const repo: Repository = {
              name: '?',
              domain: C.Downloader.localfile,
              path: '?',
              disabled: true,
              custom: true,
              builtin: false,
            };
            const row = repositoryToRow(repo);
            row[RepCol.iInfo].classes = classes(
              [RepCol.iState],
              ['checkbox-column'],
              ['custom-repo']
            );
            row[RepCol.iInfo].editable = editable();
            repotables.data.unshift(row);
            rawdata.unshift(null);
            newCustomRepos.push(repo);
            setTableState(this, 'repository', null, repotables.data, true, {
              repositories: { ...repositories, custom: newCustomRepos },
            });
            switchRepo(this, [0], false);
          }
          break;
        }
        case 'repoDelete': {
          const state = this.state as ManagerState;
          const { repositories, repository } = state;
          if (repositories && repository) {
            const newCustomRepos = clone(repositories.custom);
            const { repository: repotable } = state.tables;
            const { selection } = repository;
            const repotableData = clone(repotable.data);
            const { repositoryListings } = Saved;
            const rows =
              (repository && selectionToDataRows('repository', selection)) ||
              [];
            rows.reverse().forEach((r) => {
              const drow = repotable.data[r];
              if (drow && drow[RepCol.iInfo].repo.custom) {
                repotableData.splice(r, 1);
                repositoryListings.splice(r, 1);
                const crIndex = repositories.custom.findIndex(
                  (ro) =>
                    repositoryKey(ro) === repositoryKey(drow[RepCol.iInfo].repo)
                );
                if (crIndex !== -1) {
                  newCustomRepos.splice(crIndex, 1);
                }
              }
            });
            setTableState(this, 'repository', null, repotableData, true, {
              repositories: { ...repositories, custom: newCustomRepos },
            });
            this.loadLanguageTable();
            this.loadModuleTable();
          }
          break;
        }
        case 'repoCancel': {
          const state = this.state as ManagerState;
          const { repository: repotable } = state.tables;
          G.Module.cancel(
            repotable.data
              .map((r, ri) =>
                r[RepCol.iInfo].loading !== false && r[RepCol.iState] !== OFF
                  ? ri
                  : null
              )
              .filter((ri) => ri !== null)
              .map((rix) => {
                const ri = rix as number;
                const r = repotable.data[ri];
                r[RepCol.iInfo].intent = intent(RepCol.iState, 'warning');
                return {
                  ...r[RepCol.iInfo].repo,
                  file: C.SwordRepoManifest,
                  type: 'ftp',
                };
              })
          );
          setTableState(this, 'repository', null, repotable.data, true);
          break;
        }
        case 'moduleCancel': {
          const { moduleData } = Saved;
          G.Module.cancel(
            Object.entries(moduleData)
              .filter((entry) => entry[1][ModCol.iInfo].loading)
              .map((entry) => {
                const dl = getModuleDownload(entry[0]);
                if (dl) {
                  entry[1][ModCol.iInfo].intent = intent(
                    ModCol.iInstalled,
                    'warning'
                  );
                }
                return dl;
              })
              .filter((d) => d !== null) as Download[]
          );
          break;
        }
        case 'internet': {
          const allow = idext === 'yes';
          const cb = document.getElementById(
            'internet.rememberChoice__input'
          ) as HTMLInputElement | null;
          if (cb && cb.checked) {
            G.Prefs.setBoolPref('global.InternetPermission', allow);
          }
          const s: Partial<ManagerState> = {
            internetPermission: allow,
          };
          this.setState(s);
          if (allow) this.loadTables();
          // If the answer is no, then close the window, as there is
          // nothing else to be done here.
          else G.Window.close();
          break;
        }
        default:
          throw Error(
            `Unhandled ModuleManager click event ${e.currentTarget.id}`
          );
      }
      break;
    }
    default:
      throw Error(`Unhandled ModuleManager event type ${ev.type}`);
  }
}

// Select or unselect a row of a table. If the ctrl or shift key is pressed,
// the current selection will be modified accordingly. Returns the new
// selection. NOTE: returned selection is type state.table[table].selection.
export function rowSelect(
  xthis: ModuleManager,
  e: React.MouseEvent,
  table: typeof Tables[number],
  row: number
): RowSelection | string[] {
  const state = xthis.state as ManagerState;
  const tbl = state[table];
  let newSelection: RowSelection | string[] = [];
  if (tbl) {
    const { selection } = tbl;
    let rows: number[] = [];
    if (table === 'language') {
      const { data: langTableData } = state.tables.language;
      rows = selection
        .map((code) => {
          const rx = langTableData.findIndex(
            (r) => r[LanCol.iInfo].code === code
          );
          return rx === -1 ? 0 : rx;
        })
        .sort();
    } else {
      rows = selectionToTableRows(selection as RowSelection);
    }
    newSelection = tableRowsToSelection(tableSelectDataRows(row, rows, e));
    if (table === 'language') {
      const { data: langTableData } = state.tables.language;
      newSelection = selectionToTableRows(newSelection).map(
        (r) => langTableData[r][LanCol.iInfo].code
      );
    }
    const sel = newSelection as any;
    setTableState(xthis, table, { selection: sel }, null, false);
  }
  return newSelection;
}

// Get a list of disabled repositories: usually state.repositories.disabled,
// but if that is null, return the 'disabled' property of each repository.
function getDisabledRepos(xthis: ModuleManager) {
  const state = xthis.state as ManagerState;
  const { repositories } = state;
  if (repositories) {
    const { disabled } = repositories;
    const { repository: repotable } = Saved;
    return disabled
      ? disabled.slice()
      : repotable.data
          .map((r) =>
            r[RepCol.iInfo].repo.disabled
              ? repositoryKey(r[RepCol.iInfo].repo)
              : ''
          )
          .filter(Boolean);
  }
  return [];
}

function repoRowEnableDisable(
  enable: boolean,
  row: TRepositoryTableRow,
  disabledRepos: string[],
  stateIntent = Intent.NONE as Intent
): string[] {
  const rowkey = repositoryKey(row[RepCol.iInfo].repo);
  const disabledIndex = disabledRepos.findIndex((drs) => {
    return drs === rowkey;
  });
  if (enable) {
    if (disabledIndex !== -1) disabledRepos.splice(disabledIndex, 1);
    row[RepCol.iState] = row[RepCol.iInfo].repo.builtin ? ALWAYS_ON : ON;
    row[RepCol.iInfo].repo.disabled = false;
    row[RepCol.iInfo].loading = loading(RepCol.iState);
    row[RepCol.iInfo].intent = intent(RepCol.iState, stateIntent);
  } else {
    if (disabledIndex === -1) disabledRepos.push(rowkey);
    row[RepCol.iState] = OFF;
    row[RepCol.iInfo].repo.disabled = true;
    row[RepCol.iInfo].loading = false;
    row[RepCol.iInfo].intent = intent(RepCol.iState, stateIntent);
  }
  return disabledRepos;
}

// Enable or disable one or more repositories. Then update the repository
// table, download new repository data, and pass it on down the chain.
export async function switchRepo(
  xthis: ModuleManager,
  rows: number[],
  onOrOff?: boolean
) {
  const state = xthis.state as ManagerState;
  const { repositories } = state;
  if (repositories) {
    const { repository: repotable } = state.tables;
    const repoTableData = clone(repotable.data);
    const disabled = getDisabledRepos(xthis);
    const cancel: Parameters<GType['Module']['cancel']>[0] = [];
    rows.forEach((r) => {
      const drowWas = repotable.data[r];
      const drow = repoTableData[r];
      const unswitchable = !drowWas || drowWas[RepCol.iInfo].repo.builtin;
      if (drow && !unswitchable) {
        if (
          onOrOff !== false &&
          (onOrOff === true || drowWas[RepCol.iState] === OFF)
        ) {
          repoRowEnableDisable(true, drow, disabled);
        } else if (drow[RepCol.iInfo].loading) {
          drow[RepCol.iInfo].intent = intent(RepCol.iState, 'warning');
          cancel[r] = {
            ...drow[RepCol.iInfo].repo,
            file: C.SwordRepoManifest,
            type: 'ftp',
          };
        } else {
          repoRowEnableDisable(false, drow, disabled);
        }
      }
    });
    if (cancel.length) G.Module.cancel(cancel.filter((o) => o));
    const disreps = disabled
      ? {
          repositories: { ...repositories, disabled },
        }
      : undefined;
    setTableState(xthis, 'repository', null, repoTableData, true, disreps);
    const newrepos: (FTPDownload | null)[] = repoTableData.map((r, i) => {
      return !rows.includes(i) || cancel[i] || r[RepCol.iInfo].repo.disabled
        ? null
        : {
            ...r[RepCol.iInfo].repo,
            file: C.SwordRepoManifest,
            type: 'ftp',
          };
    });
    const listing = await G.Module.repositoryListing(newrepos);
    handleListings(xthis, listing);
  }
}

// Handle one or more raw repository listings, also handling any errors
// or cancelations. Also update the language and module tables, checking for
// possible module updates of installed modules.
export function handleListings(
  xthis: ModuleManager,
  listingsAndErrors: (RepositoryListing | string)[]
): void {
  const state = xthis.state as ManagerState;
  const { repositories } = state;
  const { repositoryListings } = Saved;
  if (repositories) {
    const { repository } = state.tables;
    const disabled = getDisabledRepos(xthis);
    listingsAndErrors.forEach((l, i, a) => {
      const drow = repository.data[i];
      if (l !== null && drow) {
        drow[RepCol.iInfo].loading = false;
        drow[RepCol.iInfo].intent = intent(RepCol.iState, 'none');
        if (typeof l === 'string') {
          log.info(l);
          let sint: Intent =
            a.reduce((p, c) => p + (typeof c === 'string' ? 1 : 0), 0) > 1
              ? 'danger'
              : 'none';
          if (!l.startsWith(C.UI.Manager.cancelMsg)) {
            sint = 'danger';
            xthis.addToast({
              message: l,
              timeout: 5000,
              intent: Intent.WARNING,
            });
          }
          repoRowEnableDisable(false, drow, disabled, sint);
          if (!Array.isArray(repositoryListings[i])) {
            repositoryListings[i] = null;
          }
          return null;
        }
        repositoryListings[i] = l;
        if ([ON, ALWAYS_ON].includes(drow[RepCol.iState])) {
          drow[RepCol.iInfo].intent = intent(RepCol.iState, 'success');
        }
        return l;
      }
      return null;
    });
    const disreps = disabled
      ? {
          repositories: { ...repositories, disabled },
        }
      : undefined;
    setTableState(xthis, 'repository', null, repository.data, true, disreps);
  } else {
    // Then only local repositories are being considered, with no table to update.
    listingsAndErrors.forEach((l, i) => {
      if (typeof l === 'string') {
        xthis.addToast({
          message: l,
          timeout: 5000,
          intent: Intent.WARNING,
        });
        if (!Array.isArray(repositoryListings[i])) {
          repositoryListings[i] = null;
        }
        return null;
      }
      repositoryListings[i] = l;
      return l;
    });
  }
  xthis.loadLanguageTable();
  xthis.loadModuleTable();

  if (repositories) {
    checkForModuleUpdates(xthis);
    checkForSuggestions(xthis);
  }
}

// Check enabled repository listings for installed modules that have
// newer versions available, or have been obsoleted. Begin downloading
// the updates, but ask whether to replace each installed module with
// the update before doing so. This function should be called after
// updateRepositoryLists().
export function checkForModuleUpdates(xthis: ModuleManager) {
  const { repositoryListings, repository: reptable, moduleLangData } = Saved;
  const updateable: SwordConfType[] = [];
  // Get modules in the local xulsword repository.
  reptable.data.forEach((rtd, i) => {
    if (rtd[RepCol.iInfo].repo.path === G.Dirs.path.xsModsUser) {
      const listing = repositoryListings[i];
      if (Array.isArray(listing)) listing.forEach((c) => updateable.push(c));
    }
  });
  // Add modules in other local SWORD repositories IF they are not in the
  // local xulsword repository. Modules in the shared repository are never
  // auto-updated, but newer versions will be installed into the xulsword repo.
  reptable.data.forEach((rtd, i) => {
    if (
      isRepoLocal(rtd[RepCol.iInfo].repo) &&
      rtd[RepCol.iInfo].repo.path !== G.Dirs.path.xsAudio
    ) {
      const listing = repositoryListings[i];
      if (Array.isArray(listing)) {
        listing.forEach((c) => {
          if (!updateable.some((uc) => uc.module === c.module))
            updateable.push(c);
        });
      }
    }
  });

  // Search all module table data for candidate updates.
  const moduleUpdates: ModuleUpdates[] = [];
  updateable.forEach((inst) => {
    const candidates: ModuleUpdates[] = [];
    moduleLangData.allmodules.forEach((row) => {
      const { conf } = row[ModCol.iInfo];
      if (
        inst.sourceRepository &&
        conf.xsmType !== 'XSM_audio' &&
        // module is to be obsoleted
        (conf.Obsoletes?.includes(inst.module) ||
          // module is to be replaced by a newer version
          (conf.xsmType !== 'XSM' &&
            conf.module === inst.module &&
            versionCompare(conf.Version ?? 0, inst.Version ?? 0) === 1) ||
          // module is to be replaced by an XSM module containing a newer
          // version, as long as we don't downgrade any installed modules
          (conf.xsmType === 'XSM' &&
            conf.SwordModules?.some(
              (swm, x) =>
                inst.module === swm &&
                versionCompare(
                  (conf.SwordVersions && conf.SwordVersions[x]) ?? 0,
                  inst.Version ?? 0
                ) === 1
            ) &&
            !conf.SwordModules?.some(
              (swm, x) =>
                versionCompare(
                  updateable.find((im) => im.module === swm)?.Version ?? 0,
                  (conf.SwordVersions && conf.SwordVersions[x]) ?? 0
                ) === 1
            )))
      ) {
        candidates.push({
          installed: inst,
          updateTo: conf,
          doInstall: false,
        });
      }
    });
    // Choose the first candidate with the highest version number, XSM modules first.
    const version = (x: ModuleUpdates): string => {
      let v = '0';
      if (x.updateTo.xsmType === 'XSM') {
        const i =
          x.updateTo.SwordModules?.findIndex((m) => m === inst.module) ?? -1;
        if (i !== -1 && x.updateTo.SwordVersions)
          v = `2.${x.updateTo.SwordVersions[i] ?? '0'}`;
      } else {
        v = `1.${x.updateTo.Version ?? 0}`;
      }
      return v;
    };
    candidates.sort((a, b) => versionCompare(version(b), version(a)));
    if (candidates.length) moduleUpdates.push(candidates[0]);
  });
  promptAndInstall(xthis, moduleUpdates);
}

const ModuleUpdatePrompted: string[] = [];

function promptAndInstall(xthis: ModuleManager, updatesx: ModuleUpdates[]) {
  // Only initiate prompt/download once per module per window lifetime.
  const updates = updatesx.filter(
    (mud) => !ModuleUpdatePrompted.includes(mud.updateTo.module)
  );
  ModuleUpdatePrompted.push(...updatesx.map((mud) => mud.updateTo.module));
  // Show a toast to ask permission to install each update.
  updates.forEach((mud) => {
    const abbr =
      (mud.updateTo.Abbreviation?.locale || mud.updateTo.module) ?? '?';
    let message: string;
    const { installed: from } = mud;
    if (from) {
      const history =
        mud.updateTo.History?.filter(
          (h) => versionCompare(h[0], from.Version ?? 0) === 1
        )
          .map((h) => h[1].locale)
          .join('\n') ?? '';
      message = `${abbr} ${mud.updateTo.Version}: ${history} (${mud.updateTo.sourceRepository.name}, ${mud.updateTo.module})`;
    } else {
      message = `${abbr} ${mud.updateTo.Description?.locale} (${mud.updateTo.sourceRepository.name}, ${mud.updateTo.module})`;
    }
    xthis.addToast({
      timeout: -1,
      intent: Intent.SUCCESS,
      message,
      action: {
        onClick: () => {
          mud.doInstall = true;
        },
        text: G.i18n.t('yes.label'),
      },
      onDismiss: () =>
        setTimeout(() => {
          if (!mud.doInstall) {
            installModuleUpdates(xthis, [mud], false);
          }
        }, 100),
      icon: 'confirm',
    });
  });
  // Download each update (to be canceled if prompt isn't accepted).
  installModuleUpdates(xthis, updates, true);
}

function installModuleUpdates(
  xthis: ModuleManager,
  moduleUpdates: ModuleUpdates[],
  on: boolean
) {
  const ons: boolean[] = [];
  const rows: SwordConfType[] = [];
  moduleUpdates.forEach((mud) => {
    const { installed, updateTo } = mud;
    // Turn off local repository module
    if (installed) {
      ons.push(!on);
      rows.push(installed);
    }
    // Turn on external update module
    if (updateTo) {
      ons.push(on);
      rows.push(updateTo);
    }
  });
  modtableUpdate(xthis, ons, rows);
}

function checkForSuggestions(xthis: ModuleManager) {
  const { moduleLangData } = Saved;
  const suggested = G.Prefs.getComplexValue(
    'moduleManager.suggested'
  ) as typeof S.prefs.moduleManager.suggested;
  const locale = G.i18n.language;
  if (suggested && suggested[locale]) {
    // Filter from Prefs any suggested mods that are already installed.
    suggested[locale] = suggested[locale].filter(
      (m) =>
        !Object.values(moduleLangData.allmodules).some(
          (r) => r[ModCol.iModule] === m && r[ModCol.iInstalled] !== OFF
        )
    );
    if (locale in suggested && suggested[locale].length) {
      // Build the list of modules to suggest.
      const suggestions: ModuleUpdates[] = [];
      suggested[locale].forEach((m) => {
        const row: TModuleTableRow | null = Object.values(
          moduleLangData.allmodules
        ).reduce((p: TModuleTableRow | null, c: TModuleTableRow) => {
          if (c[ModCol.iModule] !== m) return p;
          if (!p) return c;
          return versionCompare(
            c[ModCol.iInfo].conf.Version || 0,
            p[ModCol.iInfo].conf.Version || 0
          ) === 1
            ? c
            : p;
        }, null);
        if (row) {
          const { conf } = row[ModCol.iInfo];
          suggestions.push({
            doInstall: false,
            updateTo: conf,
          });
        }
      });
      // Remove modules being suggested from Prefs, so that user only sees
      // a particular suggestion once, ever.
      suggested[locale] = suggested[locale].filter(
        (m) => !suggestions.find((mud) => mud.updateTo.module === m)
      );
      G.Prefs.setComplexValue('moduleManager.suggested', suggested);
      promptAndInstall(xthis, suggestions);
    }
  }
}

export function getModuleRowXsmSiblings(modrepkey: string): string[] {
  const { moduleData } = Saved;
  const data = (modrepkey in moduleData && moduleData[modrepkey]) ?? null;
  if (!data) return [];
  if (data[ModCol.iInfo].conf.xsmType === 'XSM') {
    return Object.entries(moduleData)
      .map((entry) =>
        entry[1][ModCol.iInfo].conf.DataPath ===
        data[ModCol.iInfo].conf.DataPath
          ? entry[0]
          : null
      )
      .filter((i) => i !== null) as string[];
  }
  return [modrepkey];
}

function getModuleDownload(modrepkey: string): Download | null {
  const { moduleData } = Saved;
  const data = (modrepkey in moduleData && moduleData[modrepkey]) ?? null;
  if (!data) return null;
  const { xsmType } = data[ModCol.iInfo].conf;
  if (xsmType === 'XSM') {
    return {
      ...data[ModCol.iInfo].repo,
      file: data[ModCol.iInfo].conf.DataPath,
      type: 'ftp',
    };
  }
  if (xsmType === 'XSM_audio') {
    // Remote audio repositories have URL as DataPath.
    if (data[ModCol.iInfo].conf.DataPath.startsWith('http'))
      return {
        http: data[ModCol.iInfo].conf.DataPath,
        confname: data[ModCol.iInfo].conf.filename,
        ...data[ModCol.iInfo].repo,
        type: 'http',
      };
    // Local audio repositories have local path as DataPath.
    return {
      ...data[ModCol.iInfo].repo,
      file: data[ModCol.iInfo].conf.DataPath,
      type: 'ftp',
    };
  }
  return {
    module: data[ModCol.iModule],
    confname: data[ModCol.iInfo].conf.filename,
    ...data[ModCol.iInfo].repo,
    type: 'module',
  };
}

async function promptAudioChapters(
  xthis: ModuleManager,
  conf: SwordConfType
): Promise<string> {
  if (conf.xsmType === 'XSM_audio') {
    const { AudioChapters } = conf;
    if (AudioChapters) {
      let audio: SelectVKMType | SelectGBMType | null = null;
      audio = await new Promise((resolve) => {
        // Subtract audio files that are already installed.
        const installed = G.AudioConfs[conf.module]?.AudioChapters;
        const dialog: Partial<VersekeyDialog> | Partial<GenBookDialog> = {
          conf,
          callback: (result) => resolve(result),
        };
        if (isAudioVerseKey(AudioChapters)) {
          const d = dialog as VersekeyDialog;
          let ac = clone(AudioChapters) as VerseKeyAudio;
          ac = installed
            ? subtractVerseKeyAudioChapters(ac, installed as VerseKeyAudio)
            : ac;
          const books = Object.entries(ac)
            .filter((e) => e[1].some((v) => v))
            .map((e) => e[0]) as OSISBookType[];
          if (!books.length) return resolve(null);
          d.type = 'versekey';
          d.chapters = ac;
          d.initial = {
            book: books[0],
            chapter: 1,
            lastchapter: 1,
            vkmod: '',
            v11n: 'KJV',
          };
          d.selection = d.initial;
          let ch: number[] | undefined;
          const acbk0 = ac[books[0]];
          if (acbk0) {
            ch = acbk0
              .map((n, i) => (n ? i : undefined))
              .filter(Boolean) as number[];
          }
          d.options = {
            books,
            chapters: ch,
            lastchapters: ch,
            verses: [],
            lastverses: [],
            vkmods: [],
          };
        } else {
          const d = dialog as GenBookDialog;
          let ac = clone(AudioChapters) as GenBookAudioConf;
          ac = installed
            ? subtractGenBookAudioChapters(ac, installed as GenBookAudioConf)
            : ac;
          if (!Object.keys(ac).length) return resolve(null);
          const paths =
            conf.module in G.Tab
              ? gbPaths(G.LibSword.getGenBookTableOfContents(conf.module))
              : {};
          d.type = 'genbook';
          d.selection = {
            gbmod: conf.module,
            parent: '',
            children: [],
          };
          d.options = {
            gbmodNodeLists: [
              {
                module: conf.module,
                label: conf.Description?.locale || conf.module,
                labelClass: 'cs-locale',
                nodes: forEachNode(
                  genBookAudio2TreeNodes(ac, conf.module),
                  (n) => {
                    const path = n.id
                      .toString()
                      .split(C.GBKSEP)
                      .filter(Boolean)
                      .map((s) => Number(s.replace(/^(\d+).*?$/, '$1')));
                    const entry = Object.entries(paths).find(
                      (e) => !diff(e[1], path)
                    );
                    const keys = (entry ? entry[0] : '').split(C.GBKSEP);
                    let label = '';
                    while (keys.length && !label) label = keys.pop() || '';
                    n.label =
                      label || n.label.toString().replace(/^\d+\s(.*?)$/, '$1');
                  }
                ),
              },
            ],
          };
        }
        const d = dialog as VersekeyDialog | GenBookDialog;
        const state = xthis.state as ManagerState;
        const { showAudioDialog } = state;
        showAudioDialog.push(d);
        return xthis.setState({ showAudioDialog });
      });
      if (audio) {
        // TODO: Implement swordzip API on server.
        let bkchs: DeprecatedAudioChaptersConf;
        if ('gbmod' in audio) {
          bkchs = getDeprecatedGenBookAudioConf(audio);
        } else {
          bkchs = getDeprecatedVerseKeyAudioConf(audio);
        }
        const { bk, ch1, ch2 } = bkchs;
        return `&bk=${bk}&ch=${ch1}&cl=${ch2}`;
      }
    } else {
      throw new Error(
        `Audio config is missing AudioChapters: '${conf.module}'`
      );
    }
  }
  return '';
}

function handleError(xthis: ModuleManager, er: any, modrepkeys: string[]) {
  const state = xthis.state as ManagerState;
  const { module: modtable } = state.tables;
  const { moduleData } = Saved;
  let intentx: Intent = 'none';
  if (er.message !== C.UI.Manager.cancelMsg) {
    intentx = Intent.DANGER;
    xthis.addToast({
      message: er.toString(),
      timeout: 5000,
      intent: Intent.WARNING,
    });
  }
  modrepkeys.forEach((k) => {
    moduleData[k][ModCol.iInfo].loading = false;
    moduleData[k][ModCol.iInfo].intent = intent(ModCol.iInstalled, intentx);
  });
  setTableState(xthis, 'module', null, modtable.data, true);
  return null;
}

// Perform async repository module downloads corresponding to a given
// set of module configs.
export function download(xthis: ModuleManager, configs: SwordConfType[]): void {
  const { module: modtable } = Saved;
  configs.forEach(async (conf) => {
    const modkey = repositoryModuleKey(conf);
    const modkeys = getModuleRowXsmSiblings(modkey);
    const dlobj = getModuleDownload(modkey);
    if (dlobj) {
      const { moduleData } = Saved;
      modkeys.forEach((k) => {
        moduleData[k][ModCol.iInfo].loading = loading(ModCol.iInstalled);
      });
      if ('http' in dlobj && conf.xsmType === 'XSM_audio') {
        try {
          const urlfrag = await promptAudioChapters(xthis, conf);
          if (urlfrag) dlobj.http += urlfrag;
          else throw new Error(C.UI.Manager.cancelMsg);
        } catch (er) {
          handleError(xthis, er, [modkey]);
          return;
        }
      }
      try {
        const downloadkey = downloadKey(dlobj);
        Downloads[downloadkey] = G.Module.download(dlobj);
        const dl = await Downloads[downloadkey];
        modkeys.forEach((k) => {
          moduleData[k][ModCol.iInfo].loading = false;
        });
        let newintent: Intent = Intent.NONE;
        if (typeof dl === 'string') {
          if (!dl.startsWith(C.UI.Manager.cancelMsg)) {
            newintent = Intent.DANGER;
            xthis.addToast({
              message: dl,
              timeout: 5000,
              intent: Intent.WARNING,
            });
          }
        } else if (dl > 0) {
          newintent = Intent.SUCCESS;
          modkeys.forEach((k) => {
            moduleData[k][ModCol.iInstalled] = ON;
          });
        } else {
          newintent = Intent.WARNING;
          modkeys.forEach((k) => {
            moduleData[k][ModCol.iInstalled] = OFF;
          });
        }
        modkeys.forEach((k) => {
          moduleData[k][ModCol.iInfo].intent = intent(
            ModCol.iInstalled,
            newintent
          );
        });
        setTableState(xthis, 'module', null, modtable.data, true);
      } catch (er) {
        handleError(xthis, er, modkeys);
      }
    }
  });
}

function modtableUpdate(
  xthis: ModuleManager,
  on: boolean | boolean[],
  configs: SwordConfType[],
  iRemove = false
) {
  const { moduleData } = Saved;
  const cancel: Download[] = [];
  configs.forEach((conf, i) => {
    const row = moduleData[repositoryModuleKey(conf)];
    if (Array.isArray(on) ? on[i] : on) {
      row[ModCol.iRemove] = OFF;
      if (row[ModCol.iInfo].loading) {
        // if installing a module that's loading, ignore and do nothing
      } else if (iRemove || isRepoLocal(row[ModCol.iInfo].repo)) {
        // if installing a module is already installed or downloaded, just check the installed box
        row[ModCol.iInstalled] = ON;
        // otherwise download the module
      } else download(xthis, [conf]);
    } else if (row[ModCol.iInfo].loading) {
      // if uninstalling a module that is loading, cancel the download
      row[ModCol.iInfo].intent = intent(ModCol.iInstalled, 'warning');
      const dl = getModuleDownload(repositoryModuleKey(row[ModCol.iInfo].conf));
      if (dl) cancel.push(dl);
    } else {
      // otherwise uncheck the installed box and check the remove box
      row[ModCol.iRemove] = ON;
      row[ModCol.iInstalled] = OFF;
      row[ModCol.iInfo].intent = intent(ModCol.iInstalled, 'none');
    }
  });
  if (cancel.length) G.Module.cancel(cancel);
  if (configs.length) setTableState(xthis, 'module', null, null, true);
}

// Do any or all of the following with minimum setState() calls:
// Update Saved table data for immediate use and for window re-renders.
// Change table state and data state.
// Force re-render of a table.
// Change other ModuleManager state
export function setTableState(
  xthis: ModuleManager,
  table: typeof Tables[number],
  tableState?: Partial<
    ManagerState['language' | 'module' | 'repository']
  > | null,
  tableData?:
    | TLanguageTableRow[]
    | TModuleTableRow[]
    | TRepositoryTableRow[]
    | null,
  tableReset?: boolean,
  s?: Partial<ManagerState>
) {
  const state = xthis.state as ManagerState;
  const news: Partial<ManagerState> = s || {};
  // Ignore new tableState if it is null (meaning table doesn't exist).
  if (tableState && state[table] !== null) {
    news[table] = { ...state[table], ...tableState } as any;
  }
  if (tableData) {
    news.tables = { ...state.tables };
    news.tables[table].data = tableData;
    Saved[table].data = tableData;
  }
  if (Object.keys(news).length) xthis.sState(news);
  // Two setState() calls must be used: first call allows statePrefs to be
  // written to Prefs so afterward the reset will properly load updated values.
  if (tableReset) {
    xthis.sState((prevState) => {
      const { render } = prevState.tables[table];
      const trnews = { tables: { ...prevState.tables } };
      trnews.tables[table].render = render + 1;
      return trnews;
    });
  }
}

// Given a table selection, return the selected data rows in ascending order.
// This is like selectionToRows, but returns data rows rather than table rows.
export function selectionToDataRows(
  table: typeof Tables[number],
  selection: RowSelection | string[]
): number[] {
  if (table === 'language') {
    return selection
      .map((code) => {
        const { data } = Saved[table];
        return data.findIndex((r) => r[LanCol.iInfo].code === code);
      })
      .filter((i) => i !== -1);
  }
  const tablerows = selectionToTableRows(selection as RowSelection);
  return tablerows
    .map((r) => Saved[table].tableToDataRowMap[r] ?? r)
    .sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
}

// Create a new repository table row from a Repository object.
export function repositoryToRow(repo: Repository): TRepositoryTableRow {
  const on = builtinRepos(G.i18n, G.Dirs.path)
    .map((r) => repositoryKey(r))
    .includes(repositoryKey(repo))
    ? ALWAYS_ON
    : ON;
  return [
    repo.name || '?',
    repo.domain,
    repo.path,
    repo.disabled ? on : OFF,
    { repo },
  ];
}

export function allAudioInstalled(conf: SwordConfType): boolean {
  let allInstalled = false;
  const remoteAudioChapters = conf.AudioChapters;
  const localAudioChapters = G.AudioConfs[conf.module]?.AudioChapters;
  if (
    !remoteAudioChapters ||
    !localAudioChapters ||
    (isAudioVerseKey(remoteAudioChapters) &&
      !Object.keys(
        subtractVerseKeyAudioChapters(
          remoteAudioChapters as VerseKeyAudio,
          localAudioChapters as VerseKeyAudio
        )
      ).length) ||
    (!isAudioVerseKey(remoteAudioChapters) &&
      !Object.keys(
        subtractGenBookAudioChapters(
          remoteAudioChapters as GenBookAudioConf,
          localAudioChapters as GenBookAudioConf
        )
      ).length)
  ) {
    allInstalled = true;
  }
  return allInstalled;
}

// The following functions return custom callbacks meant to be sent
// to tables for applying values, settings, classes etc. to particular
// table cells.
export function loading(columnIndex: number) {
  return (_ri: number, ci: number) => {
    return ci === columnIndex;
  };
}

export function editable() {
  return (_ri: number, ci: number) => {
    return ci < RepCol.iState;
  };
}

export function intent(columnIndex: number, theIntent: Intent) {
  return (_ri: number, ci: number) => {
    return ci === columnIndex ? theIntent : 'none';
  };
}

export function classes(
  columnIndexArray: number[],
  theClasses: string[],
  wholeRowClasses?: string[]
) {
  return (_ri: number, ci: number) => {
    const cs = wholeRowClasses?.slice() || [];
    if (columnIndexArray.includes(ci))
      theClasses.forEach((c) => {
        if (!cs.includes(c)) cs.push(c);
      });
    return cs;
  };
}

export function modclasses() {
  return (ri: number, ci: number) => {
    const cs: string[] = [];
    if ([ModCol.iShared, ModCol.iInstalled, ModCol.iRemove].includes(ci as any))
      cs.push('checkbox-column');
    const drow = Saved.module.data[ri];
    if (drow && drow[ModCol.iInstalled] === OFF && ci === ModCol.iShared) {
      cs.push('disabled');
    } else if (
      ci === ModCol.iShared &&
      drow[ModCol.iInfo].conf.xsmType === 'XSM_audio'
    ) {
      cs.push('disabled');
    }
    return cs;
  };
}

export function tooltip(atooltip: string, skipColumnIndexArray: number[]) {
  return (_ri: number, ci: number) => {
    return skipColumnIndexArray.includes(ci) ? undefined : atooltip;
  };
}
