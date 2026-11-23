/**
 * The editor's documents live only in this browser (localStorage): nothing is sent to any server. Clearing the
 * browser's site data erases them, so anything worth keeping should also be downloaded (.docx / .html / PDF).
 */
import type { JSONContent } from '@tiptap/core';

export interface Doc {
  id: string;
  title: string;
  content: JSONContent | null;
  createdAt: number;
  updatedAt: number;
}

export type Docs = Record<string, Doc>;
// every project page of pedrokohler.github.io shares one origin (and one localStorage): keep the keys distinct
const KEY = 'latim-editor.docs.v1';
const LAST = 'latim-editor.docs.last';

export function loadDocs(): Docs {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Docs;
  } catch {
    return {};
  }
}

/** false when the browser refused to save (storage full or blocked, e.g. some private windows) */
export function saveDocs(docs: Docs): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(docs));
    return true;
  } catch {
    return false;
  }
}

export function lastOpened(): string | null {
  try {
    return localStorage.getItem(LAST);
  } catch {
    return null;
  }
}

export function rememberOpened(id: string) {
  try {
    localStorage.setItem(LAST, id);
  } catch {
    /* ignore */
  }
}

export function newDoc(title = 'Documento sem título', content: JSONContent | null = null): Doc {
  const now = Date.now();
  return { id: `d${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`, title, content, createdAt: now, updatedAt: now };
}

export function liveDocs(docs: Docs): Doc[] {
  return Object.values(docs).sort((x, y) => y.updatedAt - x.updatedAt);
}
