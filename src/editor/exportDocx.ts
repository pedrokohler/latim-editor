/**
 * Editor document → Word (.docx), so the file opens and keeps being edited in Word on Windows or a Mac.
 * Covers what the editor makes: headings, paragraphs (alignment), bold/italic/underline/strike, superscript and
 * subscript, color, highlight, font and size, bullet and numbered lists (nested), tables (header cells, merged
 * cells), horizontal lines and page breaks.
 */
import type { JSONContent } from '@tiptap/core';

type Docx = typeof import('docx');

const PT_DEFAULT = 12;
// Gentium is rarely installed on Windows; Word gets a font every Windows and Mac has, with ā ē ī ō ū and ă ĕ ĭ ŏ ŭ
const FONT_FOR_WORD: Record<string, string> = {
  "'Gentium Book Plus'": 'Times New Roman',
  'Gentium Book Plus': 'Times New Roman',
  Inter: 'Arial',
};

function wordFont(css?: string | null): string | undefined {
  if (!css) return undefined;
  const first = css.split(',')[0].trim();
  return FONT_FOR_WORD[first] ?? first.replace(/^['"]|['"]$/g, '');
}

/** "14pt" / "18px" → half-points */
function halfPoints(size?: string | null): number | undefined {
  if (!size) return undefined;
  const m = /^([\d.]+)(pt|px)$/.exec(size.trim());
  if (!m) return undefined;
  const pt = m[2] === 'pt' ? Number(m[1]) : Number(m[1]) * 0.75;
  return Math.round(pt * 2);
}

function hex(color?: string | null): string | undefined {
  if (!color) return undefined;
  const c = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(c)) return c.slice(1).toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(c)) return [...c.slice(1)].map((x) => x + x).join('').toUpperCase();
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c);
  if (m) return [m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('').toUpperCase();
  return undefined;
}

export async function toDocx(content: JSONContent, title: string): Promise<Blob> {
  const d: Docx = await import('docx');
  let listInstance = 0;

  const align = (a?: string) =>
    ({ center: d.AlignmentType.CENTER, right: d.AlignmentType.RIGHT, justify: d.AlignmentType.JUSTIFIED, left: d.AlignmentType.LEFT })[a ?? 'left'];

  function runs(nodes: JSONContent[] = []): (InstanceType<Docx['TextRun']>)[] {
    return nodes.flatMap((n) => {
      if (n.type === 'hardBreak') return [new d.TextRun({ break: 1 })];
      if (n.type !== 'text' || !n.text) return [];
      const marks = Object.fromEntries((n.marks ?? []).map((m) => [m.type, m.attrs ?? {}]));
      const ts = marks.textStyle ?? {};
      const hl = marks.highlight;
      return [
        new d.TextRun({
          text: n.text,
          bold: !!marks.bold,
          italics: !!marks.italic,
          underline: marks.underline ? {} : undefined,
          strike: !!marks.strike,
          superScript: !!marks.superscript,
          subScript: !!marks.subscript,
          color: hex(ts.color),
          font: wordFont(ts.fontFamily),
          size: halfPoints(ts.fontSize),
          shading: hl ? { type: d.ShadingType.CLEAR, fill: hex(hl.color) ?? 'FFF59D', color: 'auto' } : undefined,
        }),
      ];
    });
  }

  type Block = InstanceType<Docx['Paragraph']> | InstanceType<Docx['Table']>;

  function paragraph(n: JSONContent, extra: Record<string, unknown> = {}): InstanceType<Docx['Paragraph']> {
    const heading = n.type === 'heading' ? [d.HeadingLevel.HEADING_1, d.HeadingLevel.HEADING_2, d.HeadingLevel.HEADING_3][(n.attrs?.level ?? 1) - 1] : undefined;
    return new d.Paragraph({ children: runs(n.content), heading, alignment: align(n.attrs?.textAlign), ...extra });
  }

  function list(n: JSONContent, level: number, ordered: boolean, instance: number): Block[] {
    const out: Block[] = [];
    for (const item of n.content ?? []) {
      let first = true;
      for (const child of item.content ?? []) {
        if (child.type === 'bulletList' || child.type === 'orderedList') {
          const inner = child.type === 'orderedList' ? ++listInstance : 0;
          out.push(...list(child, level + 1, child.type === 'orderedList', inner));
        } else if (first) {
          out.push(paragraph(child, { numbering: { reference: ordered ? 'numbers' : 'bullets', level, instance: ordered ? instance : undefined } }));
          first = false;
        } else {
          out.push(paragraph(child, { indent: { left: 720 * (level + 1) } }));
        }
      }
    }
    return out;
  }

  function table(n: JSONContent): InstanceType<Docx['Table']> {
    const rows = (n.content ?? []).map(
      (row) =>
        new d.TableRow({
          children: (row.content ?? []).map((cell) => {
            const header = cell.type === 'tableHeader';
            const kids = blocks(cell.content ?? []);
            return new d.TableCell({
              children: kids.length ? kids : [new d.Paragraph('')],
              columnSpan: (cell.attrs?.colspan ?? 1) > 1 ? cell.attrs?.colspan : undefined,
              rowSpan: (cell.attrs?.rowspan ?? 1) > 1 ? cell.attrs?.rowspan : undefined,
              shading: header ? { type: d.ShadingType.CLEAR, fill: 'EFEAE2', color: 'auto' } : undefined,
              margins: { top: 60, bottom: 60, left: 100, right: 100 },
            });
          }),
        }),
    );
    return new d.Table({ rows, width: { size: 100, type: d.WidthType.PERCENTAGE } });
  }

  function blocks(nodes: JSONContent[]): Block[] {
    return nodes.flatMap((n): Block[] => {
      switch (n.type) {
        case 'paragraph':
        case 'heading':
          return [paragraph(n)];
        case 'bulletList':
          return list(n, 0, false, 0);
        case 'orderedList':
          return list(n, 0, true, ++listInstance);
        case 'table':
          return [table(n), new d.Paragraph('')];
        case 'blockquote':
          return blocks(n.content ?? []).map((b) => b);
        case 'horizontalRule':
          return [new d.Paragraph({ border: { bottom: { style: d.BorderStyle.SINGLE, size: 6, color: '999999', space: 1 } } })];
        case 'pageBreak':
          return [new d.Paragraph({ children: [new d.PageBreak()] })];
        default:
          return n.content ? blocks(n.content) : [];
      }
    });
  }

  const levels = (ordered: boolean) =>
    Array.from({ length: 6 }, (_, level) => ({
      level,
      format: ordered ? [d.LevelFormat.DECIMAL, d.LevelFormat.LOWER_LETTER, d.LevelFormat.LOWER_ROMAN][level % 3] : d.LevelFormat.BULLET,
      text: ordered ? `%${level + 1}.` : ['•', '◦', '▪'][level % 3],
      alignment: d.AlignmentType.LEFT,
      style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
    }));

  const doc = new d.Document({
    title,
    creator: 'Editor de latim',
    styles: { default: { document: { run: { font: 'Times New Roman', size: PT_DEFAULT * 2 } } } },
    numbering: {
      config: [
        { reference: 'bullets', levels: levels(false) },
        { reference: 'numbers', levels: levels(true) },
      ],
    },
    sections: [
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
        children: blocks(content.content ?? []),
      },
    ],
  });
  return d.Packer.toBlob(doc);
}
