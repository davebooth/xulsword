/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { ItemRendererProps } from '@blueprintjs/select';
import React from 'react';
import {
  findBookmarkItem,
  findParentOfBookmarkItem,
  ofClass,
  randomID,
  stringHash,
  tableRowsToSelection,
  tableSelectDataRows,
} from '../../common';
import { SP, SPBM } from '../../constant';
import G from '../rg';
import { bookmarkItemIcon } from '../rutil';
import Label from '../libxul/label';
import './bmManager.css';
import '@blueprintjs/select/lib/css/blueprint-select.css';

import type {
  BookmarkFolderType,
  BookmarkType,
  ContextData,
  GType,
  LocationGBType,
  LocationVKType,
} from '../../type';
import type { TCellInfo, TRowLocation } from '../libxul/table';
import type BMManagerWin from './bmManager';
import type { BMManagerState } from './bmManager';

type CellInfo = TCellInfo & {
  id: string;
  location?: LocationVKType | LocationGBType | null | undefined;
};

type TableRow = [JSX.Element, JSX.Element, JSX.Element, string, CellInfo];

export const Col = {
  iName: 0,
  iNote: 1,
  iSampleText: 2,
  iCreationDate: 3,
  iInfo: 4,
} as const;

export function onFolderSelection(
  this: BMManagerWin,
  ids: (string | number)[]
): void {
  if (ids[0]) {
    const clicked = ids[0].toString();
    this.setState((prevState: BMManagerState) => {
      let { selectedFolder } = prevState;
      selectedFolder = selectedFolder === clicked ? '' : clicked;
      const s: Partial<BMManagerState> = {
        selectedFolder,
        selectedItems: [selectedFolder],
      };
      return s;
    });
  }
}

export function onCellClick(
  this: BMManagerWin,
  e: React.MouseEvent,
  cell: TRowLocation
): void {
  this.setState((prevState: BMManagerState) => {
    const { dataRowIndex } = cell;
    const data = this.tableData();
    if (data[dataRowIndex]) {
      const { selectedItems: prevSelectedItems } = prevState;
      const selectedDataRows = tableSelectDataRows(
        dataRowIndex,
        prevSelectedItems
          .map((id) => data.findIndex((r) => r[Col.iInfo].id === id))
          .filter((r) => r !== -1),
        e
      );
      const s: Partial<BMManagerState> = {
        selectedItems: selectedDataRows.map((i) => data[i][Col.iInfo].id),
      };
      return s;
    }
    return null;
  });
}

export function onDoubleClick(this: BMManagerWin, ex: React.SyntheticEvent) {
  const { bookmarks } = this.state as BMManagerState;
  const e = ex as React.MouseEvent;
  const { bookmark } = this.bmContextData(e.target as HTMLElement);
  if (bookmark) {
    const bookmarkItem = findBookmarkItem(bookmarks, bookmark);
    if (bookmarkItem?.type === 'bookmark' && bookmarkItem.location) {
      const { location } = bookmarkItem;
      if ('v11n' in location) {
        G.Commands.goToLocationVK(location, location);
      } else {
        G.Commands.goToLocationGB(location);
      }
    }
  }
}

export function onItemSelect(
  this: BMManagerWin,
  item: BookmarkFolderType | BookmarkType
) {
  const { bookmarks } = this.state as BMManagerState;
  const { tableCompRef } = this;
  const s: Partial<BMManagerState> = {
    selectedFolder: bookmarks.id,
    selectedItems: [item.id],
  };
  this.setState(s);
  const tc = tableCompRef.current;
  if (tc) {
    const data = this.tableData();
    const selectedItem = data.findIndex((r) => r[Col.iInfo].id === item.id);
    const selectedRegion = tableRowsToSelection([selectedItem])[0];
    const r0 = selectedRegion.rows[0];
    const r1 = selectedRegion.rows[1];
    selectedRegion.rows = [r0 > 5 ? r0 - 5 : r0, r1 > 5 ? r1 - 5 : r1];
    tc.scrollToRegion(selectedRegion);
  }
}

export function onQueryChange(
  this: BMManagerWin,
  e: React.SyntheticEvent<HTMLSelectElement>
) {
  this.setState({ query: (e.target as HTMLSelectElement).value });
}

export function buttonHandler(this: BMManagerWin, e: React.SyntheticEvent) {
  const state = this.state as BMManagerState;
  const { bookmarks, selectedFolder, selectedItems, cut, copy } = state;
  const button = ofClass(['button'], e.target);
  if (button) {
    let titleKey = 'menu.edit.properties';
    let bmPropertiesState:
      | Parameters<GType['Commands']['openBookmarkProperties']>[1]
      | undefined;
    let newitem:
      | Parameters<GType['Commands']['openBookmarkProperties']>[2]
      | undefined;
    switch (button.element.id.split('.').pop()) {
      case 'newFolder': {
        titleKey = 'menu.folder.add';
        bmPropertiesState = {
          treeSelection: selectedFolder,
          anyChildSelectable: false,
        };
        newitem = { location: undefined };
        break;
      }
      case 'add': {
        const xulsword = G.Prefs.getComplexValue(
          'xulsword'
        ) as typeof SP.xulsword;
        const { panels, location } = xulsword;
        let module = panels.find((m) => m && m in G.Tab && G.Tab[m].isVerseKey);
        if (!module) module = G.Tabs.find((t) => t.isVerseKey)?.module;
        if (module) {
          titleKey = 'menu.bookmark.add';
          bmPropertiesState = {
            treeSelection: selectedFolder,
            anyChildSelectable: false,
          };
          newitem = { module, location };
        }
        break;
      }
      case 'properties': {
        if (selectedItems) {
          const item = findBookmarkItem(bookmarks, selectedItems[0]);
          if (item) {
            const parent = findParentOfBookmarkItem(
              bookmarks,
              selectedItems[0]
            );
            bmPropertiesState = {
              bookmark: item.id,
              treeSelection: parent?.id ?? undefined,
              anyChildSelectable: true,
            };
          }
        }
        break;
      }
      case 'delete': {
        if (selectedItems) {
          G.Commands.deleteBookmarkItems(selectedItems);
          return;
        }
        break;
      }
      case 'cut': {
        if (selectedItems) {
          const s: Partial<BMManagerState> = {
            cut: selectedItems,
            copy: null,
            reset: randomID(),
          };
          this.setState(s);
        }
        break;
      }
      case 'copy': {
        if (selectedItems) {
          const s: Partial<BMManagerState> = {
            copy: selectedItems,
            cut: null,
            reset: randomID(),
          };
          this.setState(s);
        }
        break;
      }
      case 'paste': {
        if (selectedItems[0] && (cut || copy)) {
          G.Commands.pasteBookmarkItems(cut, copy, selectedItems[0]);
          const s: Partial<BMManagerState> = {
            cut: null,
            copy: null,
            reset: randomID(),
          };
          this.setState(s);
        }
        break;
      }
      case 'move': {
        if (selectedItems[0]) {
          titleKey = 'menu.edit.move';
          bmPropertiesState = {
            bookmark: selectedItems[0],
            treeSelection: selectedItems[0],
            anyChildSelectable: true,
            hide: ['location', 'note', 'text'],
          };
        }
        break;
      }
      case 'undo': {
        if (G.canUndo()) G.Commands.undo();
        break;
      }
      case 'redo': {
        if (G.canRedo()) G.Commands.redo();
        break;
      }
      default: {
        throw new Error(`Unhandled bmManager button type: ${button.type}`);
      }
    }
    if (bmPropertiesState || newitem) {
      G.Commands.openBookmarkProperties(
        G.i18n.t(titleKey),
        bmPropertiesState || {},
        newitem
      );
    }
  }
}

function tooltip(strings: string[]) {
  return (_dataRowIndex: number, dataColIndex: number): string => {
    return strings[dataColIndex];
  };
}

export function tableData(this: BMManagerWin): TableRow[] {
  const state = this.state as BMManagerState;
  const { bookmarks, selectedFolder, cut, copy } = state;
  const getRow = (
    item: BookmarkFolderType | BookmarkType,
    level: number
  ): TableRow => {
    const { id, label, note, creationDate, labelLocale, noteLocale } = item;
    let mclass = 'cs-locale';
    if ('location' in item && item.location) {
      if ('v11n' in item.location) mclass = `cs-${item.location.vkmod}`;
      else mclass = `cs-${item.location.module}`;
    }
    const sampleText = 'sampleText' in item ? item.sampleText : '';
    let label2 = label;
    if (label.startsWith('i18n:') && G.i18n.exists(label.substring(5))) {
      label2 = G.i18n.t(label.substring(5));
    }
    const classes: string[] = [];
    if (cut && cut.includes(id)) {
      classes.push('is-cut');
    }
    if (copy && copy.includes(id)) {
      classes.push('is-copy');
    }
    const r: TableRow = [
      <span className="label-cell" key={stringHash(id, label, note)}>
        {[...Array(level).keys()].map((a) => (
          <div key={`ind${a}`} className="indent" />
        ))}
        {bookmarkItemIcon(item)}
        <Label className={labelLocale} value={label2} />
      </span>,
      <span key={note} className={noteLocale}>
        {note}
      </span>,
      <span key={[sampleText, mclass].join('.')} className={mclass}>
        {sampleText}
      </span>,
      new Date(creationDate).toLocaleDateString(G.i18n.language),
      {
        id,
        location: 'location' in item ? item.location : undefined,
        classes,
        tooltip: tooltip([label2, note, sampleText, 'VALUE']),
      },
    ];
    return r;
  };
  const data: TableRow[] = [];
  const addItems = (folder: BookmarkFolderType, level = 0) => {
    data.push(getRow(folder, level));
    folder.childNodes.forEach((cn) => {
      if (cn.type === 'folder') addItems(cn, level + 2);
      else data.push(getRow(cn, level + 1));
    });
  };
  const selfolder = findBookmarkItem(
    bookmarks,
    selectedFolder || SPBM.manager.bookmarks.id
  );
  if (selfolder && selfolder.type === 'folder') addItems(selfolder);
  return data;
}

export function inputValueRenderer(
  item: BookmarkFolderType | BookmarkType
): string {
  const { label } = item;
  return label;
}

export function itemRenderer(
  item: BookmarkFolderType | BookmarkType,
  itemProps: ItemRendererProps
): JSX.Element | null {
  const { handleClick, ref } = itemProps;
  const d0 = `${item.note ? `[${item.note}]` : ''} ${
    ('sampleText' in item && item.sampleText) || ''
  }`.trim();
  const d = `${d0.replace(/^(.{128}.*?)\b.*$/, '$1')}…`;
  return (
    <li
      className="search-result-item"
      title={d0}
      ref={ref}
      onClick={handleClick}
    >
      {bookmarkItemIcon(item)} <Label value={item.label} />
      <span className="description">{d ? `: ${d}` : ''}</span>
    </li>
  );
}

export function itemPredicate(
  query: string,
  item: BookmarkFolderType | BookmarkType
): boolean {
  const { type, label, note } = item;
  const parts: string[] = [label, note];
  if (type === 'bookmark') {
    const { sampleText, location } = item;
    if (location && 'v11n' in location) {
      parts.push(sampleText);
    } else if (location) {
      const { key } = location;
      parts.push(sampleText, key);
    }
  }
  const querylc = query.toLowerCase();
  const is = parts.join(' ').toLowerCase();
  if (is.includes(querylc)) return true;
  return querylc.split(' ').every((w) => is.includes(w));
}

export function bmContextData(
  this: BMManagerWin,
  elem: HTMLElement
): ContextData {
  const { selectedItems } = this.state as BMManagerState;
  const data = this.tableData();
  const r: ContextData = { type: 'bookmarkManager' };
  const point = ofClass(['bp4-table-cell'], elem);
  if (point) {
    const ri = point.element.className.match(/\bbp4-table-cell-row-(\d+)\b/);
    if (ri) {
      const tableDataRowIndex = Number(ri[1]);
      const selectedDataRows = selectedItems.map((id) =>
        data.findIndex((row) => row[Col.iInfo].id === id)
      );
      const rows = selectedDataRows.includes(tableDataRowIndex)
        ? selectedDataRows
        : [tableDataRowIndex];
      r.bookmarks = rows.map((row) => data[row][Col.iInfo].id);
      if (r.bookmarks.length === 1) {
        [r.bookmark] = r.bookmarks;
      }
    }
  }

  return r;
}
