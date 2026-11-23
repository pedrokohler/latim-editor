/**
 * "Editor de latim": a simple word processor for writing class material in Latin and Portuguese — headings, tables,
 * lists, long and short vowels — saved automatically in this browser, exported to PDF (print → "Salvar como PDF")
 * and to Word (.docx), and able to open .docx, .html and .txt files.
 */
import { useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import { Extension, generateJSON, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { TableKit } from '@tiptap/extension-table';
import { TextStyleKit } from '@tiptap/extension-text-style';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { LONG, SHORT, PageBreak, VowelMarks } from './extensions';
import { lastOpened, liveDocs, loadDocs, newDoc, rememberOpened, saveDocs, type Doc, type Docs } from './docStore';
import './editor.css';

const FONTS: [string, string][] = [
  ['', 'Gentium (padrão)'],
  ["'Times New Roman', Times, serif", 'Times New Roman'],
  ['Georgia, serif', 'Georgia'],
  ['Arial, Helvetica, sans-serif', 'Arial'],
  ['Calibri, Carlito, sans-serif', 'Calibri'],
  ['Verdana, sans-serif', 'Verdana'],
];
const SIZES = ['8', '9', '10', '11', '12', '14', '16', '18', '20', '24', '28', '36'];
const COLORS: [string, string][] = [
  ['', 'Automática'],
  ['#000000', 'Preto'],
  ['#7a2e1f', 'Vinho'],
  ['#c62828', 'Vermelho'],
  ['#1565c0', 'Azul'],
  ['#2e7d32', 'Verde'],
  ['#6a1b9a', 'Roxo'],
  ['#757575', 'Cinza'],
];
const MARKERS: [string, string][] = [
  ['', 'Sem marca-texto'],
  ['#fff59d', 'Amarelo'],
  ['#c8e6c9', 'Verde'],
  ['#bbdefb', 'Azul'],
  ['#f8bbd0', 'Rosa'],
  ['#ffe0b2', 'Laranja'],
];

/** Tab outside lists and tables types a tab, as in Word (lists and tables keep their own Tab). */
const TabKey = Extension.create({
  name: 'tabKey',
  priority: 50,
  addKeyboardShortcuts() {
    return {
      Tab: () => (this.editor.isActive('listItem') || this.editor.isActive('table') ? false : this.editor.commands.insertContent('\t')),
    };
  },
});

function extensions() {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, code: false, codeBlock: false, link: { openOnClick: false } }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TextStyleKit.configure({ lineHeight: false }),
    Highlight.configure({ multicolor: true }),
    Subscript,
    Superscript,
    TableKit.configure({ table: { resizable: true } }),
    CharacterCount,
    Placeholder.configure({ placeholder: 'Comece a escrever… (vogal longa: _a → ā; breve: __a → ă)' }),
    VowelMarks,
    PageBreak,
    TabKey,
  ];
}

// ---------------------------------------------------------------- the documents, kept in this browser

/** The saved documents and the one to open: the last one opened, else the newest, else a new blank one. */
function boot(): { docs: Docs; currentId: string } {
  const docs = loadDocs();
  const last = lastOpened();
  if (last && docs[last]) return { docs, currentId: last };
  const live = liveDocs(docs);
  if (live.length) return { docs, currentId: live[0].id };
  const d = newDoc();
  const next = { ...docs, [d.id]: d };
  saveDocs(next);
  return { docs: next, currentId: d.id };
}

export default function EditorApp() {
  const [start] = useState(boot);
  const [docs, setDocs] = useState<Docs>(start.docs);
  const ref = useRef(docs);
  const [stored, setStored] = useState(true);
  const [currentId, setCurrentId] = useState<string>(start.currentId);

  function commit(next: Docs) {
    ref.current = next;
    setDocs(next);
    setStored(saveDocs(next));
  }

  useEffect(() => {
    document.body.classList.add('ed-open');
    return () => document.body.classList.remove('ed-open');
  }, []);

  useEffect(() => {
    rememberOpened(currentId);
  }, [currentId]);

  const update = (id: string, patch: Partial<Doc>) => {
    const cur = ref.current[id];
    if (!cur) return;
    commit({ ...ref.current, [id]: { ...cur, ...patch, updatedAt: Date.now() } });
  };

  const create = (title?: string, content: JSONContent | null = null) => {
    const d = newDoc(title, content);
    commit({ ...ref.current, [d.id]: d });
    setCurrentId(d.id);
  };

  const remove = (id: string) => {
    if (!ref.current[id]) return;
    const next = { ...ref.current };
    delete next[id];
    commit(next);
    const live = liveDocs(next);
    if (live.length) setCurrentId(live[0].id);
    else create();
  };

  const doc = docs[currentId];
  if (!doc) return <div className="card muted">Carregando os documentos…</div>;

  return (
    <DocEditor
      key={doc.id}
      doc={doc}
      docs={liveDocs(docs)}
      stored={stored}
      onOpen={setCurrentId}
      onChange={(patch) => update(doc.id, patch)}
      onCreate={create}
      onDelete={() => remove(doc.id)}
    />
  );
}

// ---------------------------------------------------------------- one document

interface DocProps {
  doc: Doc;
  docs: Doc[];
  stored: boolean;
  onOpen: (id: string) => void;
  onChange: (patch: Partial<Doc>) => void;
  onCreate: (title?: string, content?: JSONContent | null) => void;
  onDelete: () => void;
}

function DocEditor({ doc, docs, stored, onOpen, onChange, onCreate, onDelete }: DocProps) {
  const pending = useRef<number | undefined>(undefined);
  const latest = useRef<(() => void) | null>(null);
  const [saving, setSaving] = useState(false);
  const [spell, setSpell] = useState(true);

  const editor = useEditor({
    extensions: extensions(),
    content: doc.content ?? '',
    editorProps: { attributes: { class: 'ed-content', lang: 'pt-BR', spellcheck: 'true' } },
    onUpdate: ({ editor: ed }) => {
      setSaving(true);
      latest.current = () => {
        onChange({ content: ed.getJSON() });
        setSaving(false);
        latest.current = null;
      };
      window.clearTimeout(pending.current);
      pending.current = window.setTimeout(() => latest.current?.(), 500);
    },
  });

  // leaving the document (another one, closing the page, switching apps): save what was typed in the last half second
  useEffect(() => {
    const save = () => {
      window.clearTimeout(pending.current);
      latest.current?.();
    };
    const onHide = () => document.visibilityState === 'hidden' && save();
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', save);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', save);
      save();
    };
  }, []);

  useEffect(() => {
    editor?.view.dom.setAttribute('spellcheck', String(spell));
  }, [editor, spell]);

  if (!editor) return null;

  const flushNow = () => {
    window.clearTimeout(pending.current);
    latest.current?.();
  };

  const status = saving ? 'salvando…' : stored ? '● salvo neste navegador' : '⚠ o navegador não deixou salvar';

  return (
    <div className="ed">
      <div className="ed-chrome">
        <div className="ed-docbar">
          <select
            className="ed-docpick"
            value={doc.id}
            onChange={(e) => {
              flushNow();
              onOpen(e.target.value);
            }}
            aria-label="documento aberto"
          >
            {docs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title || 'Sem título'}
              </option>
            ))}
          </select>
          <input className="ed-title" value={doc.title} onChange={(e) => onChange({ title: e.target.value })} aria-label="título do documento" />
          <FileMenu editor={editor} doc={doc} onCreate={onCreate} onDelete={onDelete} flush={flushNow} />
          <span
            className="ed-status muted small"
            title={
              stored
                ? 'os documentos ficam só neste navegador, neste aparelho; para guardar uma cópia, use Arquivo → Baixar para o Word'
                : 'armazenamento cheio ou bloqueado (janela anônima?): baixe o documento em Arquivo → Baixar para o Word'
            }
          >
            {status}
          </span>
        </div>
        <Toolbar editor={editor} spell={spell} setSpell={setSpell} />
        <VowelBar editor={editor} />
        <TableBar editor={editor} />
      </div>
      <div className="ed-desk">
        <div className="ed-paper">
          <EditorContent editor={editor} />
        </div>
      </div>
      <Footer editor={editor} />
    </div>
  );
}

// ---------------------------------------------------------------- menus and bars

function useOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', h);
    document.addEventListener('keydown', k);
    return () => {
      document.removeEventListener('pointerdown', h);
      document.removeEventListener('keydown', k);
    };
  }, [open, close]);
  return ref;
}

function Pop({ label, title, children, className = '' }: { label: React.ReactNode; title: string; children: (close: () => void) => React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const ref = useOutside(open, close);
  return (
    <div className={`ed-pop ${className}`} ref={ref}>
      <button type="button" className="ed-btn" title={title} aria-label={title} aria-expanded={open} onClick={() => setOpen(!open)}>
        {label}
      </button>
      {open && <div className="ed-menu">{children(close)}</div>}
    </div>
  );
}

const keep = (e: React.MouseEvent | React.PointerEvent) => e.preventDefault(); // keep the selection in the page

function Btn({ on, title, onClick, children, disabled }: { on?: boolean; title: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" className={`ed-btn ${on ? 'on' : ''}`} title={title} aria-label={title} aria-pressed={on} disabled={disabled} onMouseDown={keep} onClick={onClick}>
      {children}
    </button>
  );
}

const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const safeName = (t: string) => (t.trim() || 'documento').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const EXPORT_CSS = `body{font-family:'Gentium Book Plus','Times New Roman',serif;font-size:12pt;line-height:1.5;max-width:17cm;margin:2cm auto;color:#000}
table{border-collapse:collapse;width:100%;margin:8pt 0}td,th{border:1px solid #888;padding:4pt 6pt;vertical-align:top}th{background:#efeae2}
.page-break{break-after:page}@page{size:A4;margin:2cm}`;

export function printDoc(title: string) {
  const before = document.title;
  document.title = title || 'documento';
  window.print();
  document.title = before;
}

function FileMenu({ editor, doc, onCreate, onDelete, flush }: { editor: Editor; doc: Doc; onCreate: DocProps['onCreate']; onDelete: () => void; flush: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');

  async function openFile(f: File) {
    setBusy('Abrindo…');
    try {
      const title = f.name.replace(/\.[^.]+$/, '');
      if (/\.docx$/i.test(f.name)) {
        const mammoth = await import('mammoth');
        const { value } = await mammoth.convertToHtml({ arrayBuffer: await f.arrayBuffer() });
        onCreate(title, htmlToJson(value));
      } else if (/\.html?$/i.test(f.name)) {
        const dom = new DOMParser().parseFromString(await f.text(), 'text/html');
        dom.querySelectorAll('script,style,link,meta').forEach((n) => n.remove());
        onCreate(title, htmlToJson(dom.body.innerHTML));
      } else if (/\.txt$/i.test(f.name)) {
        const text = await f.text();
        onCreate(title, { type: 'doc', content: text.split(/\r?\n/).map((l) => ({ type: 'paragraph', content: l ? [{ type: 'text', text: l }] : [] })) });
      } else {
        alert('Este editor abre arquivos .docx (Word), .html e .txt.');
      }
    } catch (e) {
      alert(`Não consegui abrir o arquivo: ${(e as Error).message}`);
    } finally {
      setBusy('');
    }
  }

  async function toWord() {
    flush();
    setBusy('Gerando .docx…');
    try {
      const { toDocx } = await import('./exportDocx');
      download(await toDocx(editor.getJSON(), doc.title), `${safeName(doc.title)}.docx`);
    } finally {
      setBusy('');
    }
  }

  function toHtml() {
    flush();
    const html = `<!doctype html>\n<html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>${EXPORT_CSS}</style></head><body>\n${editor.getHTML()}\n</body></html>\n`;
    download(new Blob([html], { type: 'text/html;charset=utf-8' }), `${safeName(doc.title)}.html`);
  }

  return (
    <>
      <Pop label={busy || 'Arquivo ▾'} title="arquivo: novo, abrir, exportar" className="ed-file">
        {(close) => (
          <div className="ed-list">
            <button type="button" onClick={() => (close(), onCreate())}>Novo documento</button>
            <button type="button" onClick={() => (close(), fileRef.current?.click())}>Abrir arquivo… (.docx, .html, .txt)</button>
            <hr />
            <button type="button" onClick={() => (close(), printDoc(doc.title))}>Exportar PDF… <span className="muted small">({mod}P → “Salvar como PDF”)</span></button>
            <button type="button" onClick={() => (close(), void toWord())}>Baixar para o Word (.docx)</button>
            <button type="button" onClick={() => (close(), toHtml())}>Baixar cópia (.html)</button>
            <hr />
            <button type="button" onClick={() => (close(), flush(), onCreate(`${doc.title} (cópia)`, editor.getJSON()))}>Duplicar</button>
            <button
              type="button"
              className="danger"
              onClick={() => {
                close();
                if (confirm(`Excluir “${doc.title}”? Não dá para desfazer.`)) onDelete();
              }}
            >
              Excluir documento
            </button>
          </div>
        )}
      </Pop>
      <input
        ref={fileRef}
        type="file"
        hidden
        accept=".docx,.html,.htm,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/html,text/plain"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void openFile(f);
        }}
      />
    </>
  );
}

/** HTML from a file → editor JSON (the editor's own schema: markup it does not know is dropped, text is kept). */
function htmlToJson(html: string): JSONContent {
  return generateJSON(html, extensions());
}

function styleOf(editor: Editor) {
  if (editor.isActive('heading', { level: 1 })) return 'h1';
  if (editor.isActive('heading', { level: 2 })) return 'h2';
  if (editor.isActive('heading', { level: 3 })) return 'h3';
  return 'p';
}

function Toolbar({ editor, spell, setSpell }: { editor: Editor; spell: boolean; setSpell: (v: boolean) => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      style: styleOf(e),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      strike: e.isActive('strike'),
      sup: e.isActive('superscript'),
      sub: e.isActive('subscript'),
      font: (e.getAttributes('textStyle').fontFamily as string | undefined) ?? '',
      size: ((e.getAttributes('textStyle').fontSize as string | undefined) ?? '').replace('pt', ''),
      align: (['center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) ?? 'left',
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      inList: e.isActive('listItem'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const c = () => editor.chain().focus();

  return (
    <div className="ed-toolbar" role="toolbar" aria-label="formatação">
      <div className="ed-group">
        <Btn title={`desfazer (${mod}Z)`} onClick={() => c().undo().run()} disabled={!s.canUndo}>
          <Icon d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />
        </Btn>
        <Btn title={`refazer (${mod === '⌘' ? '⌘⇧Z' : 'Ctrl+Y'})`} onClick={() => c().redo().run()} disabled={!s.canRedo}>
          <Icon d="m15 14 5-5-5-5M20 9H9a5 5 0 0 0 0 10h3" />
        </Btn>
      </div>
      <div className="ed-group">
        <select
          className="ed-select"
          value={s.style}
          aria-label="estilo do parágrafo"
          onChange={(e) => {
            const v = e.target.value;
            if (v === 'p') c().setParagraph().run();
            else c().setHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
          }}
        >
          <option value="p">Texto normal</option>
          <option value="h1">Título 1</option>
          <option value="h2">Título 2</option>
          <option value="h3">Título 3</option>
        </select>
        <select
          className="ed-select"
          value={FONTS.some(([v]) => v === s.font) ? s.font : ''}
          aria-label="fonte"
          onChange={(e) => (e.target.value ? c().setFontFamily(e.target.value).run() : c().unsetFontFamily().run())}
        >
          {FONTS.map(([v, l]) => (
            <option key={l} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select
          className="ed-select narrow"
          value={s.size || '12'}
          aria-label="tamanho da letra"
          onChange={(e) => (e.target.value === '12' ? c().unsetFontSize().run() : c().setFontSize(`${e.target.value}pt`).run())}
        >
          {SIZES.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
      </div>
      <div className="ed-group">
        <Btn on={s.bold} title={`negrito (${mod}B)`} onClick={() => c().toggleBold().run()}>
          <b>N</b>
        </Btn>
        <Btn on={s.italic} title={`itálico (${mod}I)`} onClick={() => c().toggleItalic().run()}>
          <i style={{ fontFamily: 'Georgia, serif' }}>I</i>
        </Btn>
        <Btn on={s.underline} title={`sublinhado (${mod}U)`} onClick={() => c().toggleUnderline().run()}>
          <u>S</u>
        </Btn>
        <Btn on={s.strike} title="tachado" onClick={() => c().toggleStrike().run()}>
          <s>ab</s>
        </Btn>
        <Btn on={s.sup} title="sobrescrito" onClick={() => c().toggleSuperscript().run()}>
          x<sup>2</sup>
        </Btn>
        <Btn on={s.sub} title="subscrito" onClick={() => c().toggleSubscript().run()}>
          x<sub>2</sub>
        </Btn>
        <Pop label={<span className="ed-a">A</span>} title="cor da letra">
          {(close) => (
            <div className="ed-swatches">
              {COLORS.map(([v, l]) => (
                <button
                  key={l}
                  type="button"
                  title={l}
                  aria-label={l}
                  style={{ background: v || 'linear-gradient(135deg,#fff 45%,#c62828 50%,#fff 55%)' }}
                  onClick={() => {
                    if (v) c().setColor(v).run();
                    else c().unsetColor().run();
                    close();
                  }}
                />
              ))}
            </div>
          )}
        </Pop>
        <Pop label={<span className="ed-hl">ab</span>} title="marca-texto">
          {(close) => (
            <div className="ed-swatches">
              {MARKERS.map(([v, l]) => (
                <button
                  key={l}
                  type="button"
                  title={l}
                  aria-label={l}
                  style={{ background: v || 'linear-gradient(135deg,#fff 45%,#c62828 50%,#fff 55%)' }}
                  onClick={() => {
                    if (v) c().setHighlight({ color: v }).run();
                    else c().unsetHighlight().run();
                    close();
                  }}
                />
              ))}
            </div>
          )}
        </Pop>
      </div>
      <div className="ed-group">
        {(
          [
            ['left', 'alinhar à esquerda', 'M4 6h16M4 10h10M4 14h16M4 18h10'],
            ['center', 'centralizar', 'M4 6h16M7 10h10M4 14h16M7 18h10'],
            ['right', 'alinhar à direita', 'M4 6h16M10 10h10M4 14h16M10 18h10'],
            ['justify', 'justificar', 'M4 6h16M4 10h16M4 14h16M4 18h16'],
          ] as const
        ).map(([a, t, d]) => (
          <Btn key={a} on={s.align === a} title={t} onClick={() => c().setTextAlign(a).run()}>
            <Icon d={d} />
          </Btn>
        ))}
      </div>
      <div className="ed-group">
        <Btn on={s.bullet} title="lista com marcadores" onClick={() => c().toggleBulletList().run()}>
          <Icon d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
        </Btn>
        <Btn on={s.ordered} title="lista numerada" onClick={() => c().toggleOrderedList().run()}>
          <Icon d="M10 6h10M10 12h10M10 18h10M4 4h1v4M4 8h2M4 12.5c0-1 2-1 2 0s-2 1.5-2 2.5h2M4 17h2v3H4M5 18.5h1" />
        </Btn>
        <Btn title="diminuir recuo da lista (Shift+Tab)" disabled={!s.inList} onClick={() => c().liftListItem('listItem').run()}>
          <Icon d="M4 6h16M11 10h9M11 14h9M4 18h16M8 9l-3 3 3 3" />
        </Btn>
        <Btn title="aumentar recuo da lista (Tab)" disabled={!s.inList} onClick={() => c().sinkListItem('listItem').run()}>
          <Icon d="M4 6h16M11 10h9M11 14h9M4 18h16M5 9l3 3-3 3" />
        </Btn>
      </div>
      <div className="ed-group">
        <TablePicker editor={editor} />
        <Btn title="linha horizontal" onClick={() => c().setHorizontalRule().run()}>
          <Icon d="M4 12h16" />
        </Btn>
        <Btn title={`quebra de página (${mod}Enter)`} onClick={() => c().setPageBreak().run()}>
          <Icon d="M6 3v5h12V3M6 21v-5h12v5M3 12h3M9 12h2M13 12h2M18 12h3" />
        </Btn>
        <Btn title="limpar formatação" onClick={() => c().unsetAllMarks().clearNodes().run()}>
          <Icon d="M6 4h12M12 4l-4 16M4 20l16-16" />
        </Btn>
        <Btn on={spell} title={spell ? 'corretor ortográfico ligado (português)' : 'corretor ortográfico desligado'} onClick={() => setSpell(!spell)}>
          <span style={{ fontSize: 12 }}>abc✓</span>
        </Btn>
      </div>
    </div>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function TablePicker({ editor }: { editor: Editor }) {
  const [hover, setHover] = useState<[number, number]>([0, 0]);
  return (
    <Pop label={<Icon d="M4 5h16v14H4zM4 10h16M4 15h16M9.5 5v14M14.5 5v14" />} title="inserir tabela">
      {(close) => (
        <div className="ed-grid" onMouseLeave={() => setHover([0, 0])}>
          <div className="small muted">{hover[0] ? `${hover[0]} × ${hover[1]}` : 'tabela: linhas × colunas'}</div>
          <div className="ed-cells">
            {Array.from({ length: 8 }, (_, r) =>
              Array.from({ length: 8 }, (_, col) => (
                <button
                  key={`${r}-${col}`}
                  type="button"
                  aria-label={`${r + 1} linhas, ${col + 1} colunas`}
                  className={r < hover[0] && col < hover[1] ? 'on' : ''}
                  onMouseEnter={() => setHover([r + 1, col + 1])}
                  onFocus={() => setHover([r + 1, col + 1])}
                  onClick={() => {
                    editor.chain().focus().insertTable({ rows: r + 1, cols: col + 1, withHeaderRow: false }).run();
                    close();
                  }}
                />
              )),
            )}
          </div>
        </div>
      )}
    </Pop>
  );
}

function TableBar({ editor }: { editor: Editor }) {
  const s = useEditorState({ editor, selector: ({ editor: e }) => ({ inTable: e.isActive('table'), canMerge: e.can().mergeOrSplit() }) });
  if (!s.inTable) return null;
  const c = () => editor.chain().focus();
  return (
    <div className="ed-tablebar" role="toolbar" aria-label="tabela">
      <span className="small muted">Tabela:</span>
      <button type="button" onMouseDown={keep} onClick={() => c().addRowBefore().run()}>+ linha acima</button>
      <button type="button" onMouseDown={keep} onClick={() => c().addRowAfter().run()}>+ linha abaixo</button>
      <button type="button" onMouseDown={keep} onClick={() => c().addColumnBefore().run()}>+ coluna à esquerda</button>
      <button type="button" onMouseDown={keep} onClick={() => c().addColumnAfter().run()}>+ coluna à direita</button>
      <button type="button" onMouseDown={keep} onClick={() => c().deleteRow().run()}>− linha</button>
      <button type="button" onMouseDown={keep} onClick={() => c().deleteColumn().run()}>− coluna</button>
      <button type="button" onMouseDown={keep} disabled={!s.canMerge} onClick={() => c().mergeOrSplit().run()} title="selecione várias células arrastando para mesclar">
        mesclar / dividir células
      </button>
      <button type="button" onMouseDown={keep} onClick={() => c().toggleHeaderRow().run()}>linha de cabeçalho</button>
      <button type="button" className="danger" onMouseDown={keep} onClick={() => c().deleteTable().run()}>excluir tabela</button>
    </div>
  );
}

function VowelBar({ editor }: { editor: Editor }) {
  const ins = (v: string) => editor.chain().focus().insertContent(v).run();
  const longs = ['a', 'e', 'i', 'o', 'u', 'y'].map((v) => LONG[v]);
  const capLongs = ['A', 'E', 'I', 'O', 'U', 'Y'].map((v) => LONG[v]);
  const shorts = ['a', 'e', 'i', 'o', 'u'].map((v) => SHORT[v]);
  return (
    <div className="ed-vowels" aria-label="vogais longas e breves">
      {[...longs, ...capLongs].map((v) => (
        <button key={v} type="button" className="ed-v" onMouseDown={keep} onClick={() => ins(v)} title={`inserir ${v}`}>
          {v}
        </button>
      ))}
      <span className="ed-sep" />
      {shorts.map((v) => (
        <button key={v} type="button" className="ed-v" onMouseDown={keep} onClick={() => ins(v)} title={`inserir ${v} (breve)`}>
          {v}
        </button>
      ))}
      <span className="ed-sep" />
      <button type="button" className="ed-v wide" onMouseDown={keep} onClick={() => editor.chain().focus().toggleVowelMark('long').run()} title="põe ou tira o mácron da vogal antes do cursor">
        ¯ na vogal anterior
      </button>
      <button type="button" className="ed-v wide" onMouseDown={keep} onClick={() => editor.chain().focus().toggleVowelMark('short').run()} title="põe ou tira a breve da vogal antes do cursor">
        ˘ na vogal anterior
      </button>
      <span className="small muted ed-tip">
        digitando: <kbd>_</kbd> e a vogal → <b>ā</b> · <kbd>_</kbd><kbd>_</kbd> e a vogal → <b>ă</b> (como o ´ antes do é) · acentos do português como sempre
      </span>
    </div>
  );
}

function Footer({ editor }: { editor: Editor }) {
  const s = useEditorState({ editor, selector: ({ editor: e }) => ({ words: e.storage.characterCount.words() as number }) });
  return (
    <div className="ed-footer small muted">
      {s.words} {s.words === 1 ? 'palavra' : 'palavras'} · A4 · {mod}P exporta PDF
    </div>
  );
}
