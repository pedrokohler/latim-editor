# Editor de latim

Um editor de textos simples, no navegador, para preparar material de aula de latim e português:
títulos, listas, tabelas, cores, marca-texto, quebras de página, folha A4 — e vogais longas e breves
(ā ē ī ō ū, ă ĕ ĭ ŏ ŭ) fáceis de digitar.

**Abrir o editor:** https://pedrokohler.github.io/latim-editor/

Não precisa instalar nada nem criar conta. Funciona no Windows, no Mac, no Linux e no celular.

## Vogais longas e breves

- Digite `_` e depois a vogal: `_a` → **ā**, `_O` → **Ō** (como o acento ´ antes do é).
- Dois `_` e a vogal: `__a` → **ă**.
- Errou? Aperte Backspace logo em seguida e volta a ser `_a`.
- Ou use os botões de vogais abaixo da barra de ferramentas, ou o botão "¯ na vogal anterior",
  que põe (ou tira) o mácron da letra antes do cursor.

Os acentos do português (á, ê, ã, ç…) continuam funcionando como sempre.

## Exportar

No menu **Arquivo**:

- **Exportar PDF…** abre a janela de impressão: escolha **"Salvar como PDF"** como impressora.
  Só a folha sai no PDF, sem os botões. Atalho: Ctrl+P (⌘P no Mac).
- **Baixar para o Word (.docx)** gera um arquivo que abre e continua editável no Word.
- **Baixar cópia (.html)** gera uma página com o texto formatado.
- **Abrir arquivo…** abre arquivos `.docx` (Word), `.html` e `.txt` como um documento novo.

## Onde ficam os documentos

Os documentos ficam **só neste navegador, neste computador**: nada é enviado para nenhum servidor.
O editor salva sozinho enquanto você digita, e a lista de documentos fica no seletor à esquerda do título.

Por isso:

- outro navegador ou outro computador não vê os mesmos documentos;
- limpar os dados de navegação (ou usar janela anônima) apaga os documentos;
- para guardar uma cópia segura, baixe o documento para o Word (.docx) de vez em quando.

## Para desenvolvedores

```bash
npm ci
npm run dev      # http://localhost:4185/latim-editor/
npm run build    # gera dist/
```

React + [TipTap](https://tiptap.dev) + Vite. A cada push na branch `main`, o GitHub Actions publica o site no
GitHub Pages (`.github/workflows/pages.yml`).
