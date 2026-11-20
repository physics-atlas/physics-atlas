import { useEffect, useRef } from 'react';
import en from '../../content/privacy/en.md?raw';
import de from '../../content/privacy/de.md?raw';
import PageText from './pages/PageText';

// The privacy notice (Decision 51), in English and German — the German text is
// the repository's one exception to "everything in English": it's for the
// site's German readers. Drawn by the atlas pages' own renderer, so it reads
// (and is announced) like every other page. Loaded on demand.

export type PrivacyLang = 'en' | 'de';

const TEXT: Record<PrivacyLang, { title: string; source: string; other: string }> = {
  en: { title: 'Privacy', source: en, other: 'Deutsche Fassung' },
  de: { title: 'Datenschutzerklärung', source: de, other: 'English version' },
};

export default function PrivacyView({ lang, onLang }: { lang: PrivacyLang; onLang: (l: PrivacyLang) => void }) {
  const t = TEXT[lang];
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    document.title = `${t.title} — Physics Atlas`;
  }, [t.title]);
  const other: PrivacyLang = lang === 'en' ? 'de' : 'en';
  return (
    <div className="feedback-view">
      <article className="feedback-panel atlas-page privacy-notice" lang={lang} aria-labelledby="privacy-title">
        <p className="privacy-lang">
          <a
            href={`?mode=privacy&lang=${other}`}
            hrefLang={other}
            lang={other}
            onClick={(e) => {
              if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              onLang(other);
              headingRef.current?.focus();
            }}
          >
            {TEXT[lang].other}
          </a>
        </p>
        <h1 id="privacy-title" ref={headingRef} tabIndex={-1}>
          {t.title}
        </h1>
        <PageText source={t.source} section="" link={(to, children) => ('url' in to ? <a href={to.url}>{children ?? to.url}</a> : children)} />
      </article>
    </div>
  );
}
