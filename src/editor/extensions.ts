/**
 * Editor extensions of our own: long and short vowels, and page breaks.
 *
 * Long vowels: type "_" and then the vowel (_a → ā, _A → Ā) — accent first, as ´ goes before é on a Brazilian
 * keyboard and ⌥e before e on a Mac. The same on Windows, Mac, Linux and phones, on every keyboard layout, and it
 * leaves the accent keys alone (´ ^ ~ ` ¨ on ABNT2, ⌥e ⌥i ⌥n ⌥u ⌥` on a Mac), so Portuguese is typed as usual.
 * Short vowels: two "_" (__a → ă): the same key, so it also works on every keyboard (^ and ~, the usual breve marks,
 * are accent keys on ABNT2 and US-International). Backspace right after undoes the change (ā → _a).
 */
import { Extension, InputRule, Node, mergeAttributes } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export const LONG: Record<string, string> = {
  a: 'ā', e: 'ē', i: 'ī', o: 'ō', u: 'ū', y: 'ȳ',
  A: 'Ā', E: 'Ē', I: 'Ī', O: 'Ō', U: 'Ū', Y: 'Ȳ',
};
export const SHORT: Record<string, string> = {
  a: 'ă', e: 'ĕ', i: 'ĭ', o: 'ŏ', u: 'ŭ', y: 'y̆',
  A: 'Ă', E: 'Ĕ', I: 'Ĭ', O: 'Ŏ', U: 'Ŭ',
};
/** "__" then a vowel: short (__a → ă); "_" then a vowel: long (_a → ā) */
const BREVE_TYPED = /__([aeiouAEIOU])$/;
const MACRON_TYPED = /(?<!_)_([aeiouyAEIOUY])$/;
const PLAIN: Record<string, string> = Object.fromEntries([...Object.entries(LONG), ...Object.entries(SHORT)].map(([k, v]) => [v, k]));

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    vowelMarks: {
      /** put a macron (or a breve) on the vowel before the cursor; again takes it off */
      toggleVowelMark: (mark: 'long' | 'short') => ReturnType;
    };
    pageBreak: {
      setPageBreak: () => ReturnType;
    };
  }
}

export const VowelMarks = Extension.create({
  name: 'vowelMarks',
  addInputRules() {
    return [
      new InputRule({
        find: BREVE_TYPED,
        handler: ({ state, range, match }) => {
          state.tr.insertText(SHORT[match[1]], range.from, range.to);
        },
      }),
      new InputRule({
        find: MACRON_TYPED,
        handler: ({ state, range, match }) => {
          state.tr.insertText(LONG[match[1]], range.from, range.to);
        },
      }),
    ];
  },
  addProseMirrorPlugins() {
    // Input that skips the text-input hook (phone keyboards, Windows IMEs, dictation) still turns a just-typed "_a"
    // into ā and "__a" into ă. It waits one tick so the input rule above goes first (its change is the one Backspace
    // can undo); a paste, and the text Backspace brings back, are left alone.
    const key = new PluginKey<boolean>('vowelMarksTyped');
    const typedAt = (view: { state: import('@tiptap/pm/state').EditorState }) => {
      const { from, empty } = view.state.selection;
      if (!empty || from < 2) return null;
      const before = view.state.doc.textBetween(Math.max(0, from - 3), from, '\n', '\n');
      const b = BREVE_TYPED.exec(before);
      const m = b ? null : MACRON_TYPED.exec(before);
      const hit = b ?? m;
      return hit ? { from: from - hit[0].length, to: from, text: b ? SHORT[b[1]] : LONG[m![1]] } : null;
    };
    return [
      new Plugin<boolean>({
        key,
        state: {
          init: () => false,
          // a plain insertion of one to three characters ending at the cursor: typing
          apply(tr) {
            if (!tr.docChanged || tr.steps.length !== 1 || tr.getMeta('paste') || tr.getMeta('uiEvent') === 'paste' || tr.getMeta('inputRule')) return false;
            let typed = false;
            tr.mapping.maps.forEach((map) =>
              map.forEach((_os, oe, ns, ne) => {
                if (ne === tr.selection.from && ne - ns >= 1 && ne - ns <= 3 && oe - _os <= ne - ns) typed = true;
              }),
            );
            return typed;
          },
        },
        view: () => ({
          update(view) {
            if (!key.getState(view.state)) return;
            setTimeout(() => {
              if (view.isDestroyed || !key.getState(view.state)) return;
              const t = typedAt(view);
              if (t?.text) view.dispatch(view.state.tr.insertText(t.text, t.from, t.to));
            }, 0);
          },
        }),
      }),
    ];
  },
  addCommands() {
    return {
      toggleVowelMark:
        (mark) =>
        ({ state, tr, dispatch }) => {
          const { from, empty } = state.selection;
          if (!empty || from < 1) return false;
          const prev = state.doc.textBetween(from - 1, from, '\n', '\n');
          const base = PLAIN[prev] ?? prev;
          const table = mark === 'long' ? LONG : SHORT;
          const next = PLAIN[prev] && table[base] === prev ? base : table[base];
          if (!next) return false;
          if (dispatch) tr.insertText(next, from - 1, from);
          return true;
        },
    };
  },
});

/** A page break for printing / PDF / Word: a dashed line on screen, a new page on paper. */
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: 'div[data-page-break]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-page-break': '', class: 'page-break' })];
  },
  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ chain }) =>
          chain().insertContent({ type: this.name }).focus().run(),
    };
  },
  addKeyboardShortcuts() {
    return { 'Mod-Enter': () => this.editor.commands.setPageBreak() };
  },
});
