import { useEffect, useState } from 'react';
import EditorApp from './editor/Editor';

type Theme = 'auto' | 'light' | 'dark';
const THEME_KEY = 'latim-editor.theme';

function savedTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : 'auto';
  } catch {
    return 'auto';
  }
}

export function App() {
  const [theme, setTheme] = useState<Theme>(savedTheme);

  useEffect(() => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  return (
    <div className="app wide">
      <header className="top">
        <span className="brand">Editor de latim</span>
        <span className="tagline muted small">ā ē ī ō ū · ă ĕ ĭ ŏ ŭ · PDF · Word</span>
        <select className="theme" value={theme} onChange={(e) => setTheme(e.target.value as Theme)} aria-label="tema" title="tema claro ou escuro">
          <option value="auto">Tema: automático</option>
          <option value="light">Tema: claro</option>
          <option value="dark">Tema: escuro</option>
        </select>
      </header>
      <EditorApp />
    </div>
  );
}
