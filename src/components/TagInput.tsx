import { useId, useState } from 'react';
import { TAG_LIMITS, cleanTag } from '../data/tags';

/**
 * Tags for one layer, typed in: Enter (or a comma, or "Add") adds what's typed;
 * the browser's list suggests the known tags as you type, and the ones not chosen
 * yet are offered as buttons too. A tag nobody has used yet is welcome — it says
 * so, and is suggested to others once the concept is on the map.
 */
export default function TagInput({
  title,
  question,
  value,
  onChange,
  suggestions,
}: {
  title: string;
  question: string;
  value: string[];
  onChange: (next: string[]) => void;
  suggestions: string[];
}) {
  const uid = useId();
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const has = (t: string) => value.some((v) => v.toLowerCase() === t.toLowerCase());
  const offered = suggestions.filter((s) => !has(s));
  const full = value.length >= TAG_LIMITS.perLayer;

  const add = (raw: string) => {
    const tag = cleanTag(raw).slice(0, TAG_LIMITS.length);
    setText('');
    if (!tag) return;
    if (has(tag)) return setNote(`“${tag}” is already there.`);
    if (full) return setNote(`At most ${TAG_LIMITS.perLayer} tags here.`);
    // A known tag keeps its usual capitals.
    const known = suggestions.find((s) => s.toLowerCase() === tag.toLowerCase());
    onChange([...value, known ?? tag]);
    setNote(known ? `Added “${known}”.` : `Added “${tag}”, a new tag: it’s suggested to others once this concept is on the map.`);
  };

  return (
    <fieldset className="tag-input">
      <legend>
        <strong>{title}</strong> <span className="draft-optional">optional</span>
      </legend>
      <p className="draft-hint" id={`${uid}-hint`}>
        {question} As many as fit.
      </p>
      {value.length > 0 && (
        <ul className="tag-list" aria-label={`${title}: chosen`}>
          {value.map((t) => (
            <li key={t} className="tag-chip">
              {t}
              <button
                type="button"
                className="tag-chip-remove"
                aria-label={`Remove the tag ${t}`}
                onClick={() => {
                  onChange(value.filter((v) => v !== t));
                  setNote(`Removed “${t}”.`);
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="tag-entry">
        <label htmlFor={`${uid}-input`} className="visually-hidden">
          Add a tag: {title}
        </label>
        <input
          id={`${uid}-input`}
          className="draft-input"
          list={`${uid}-list`}
          value={text}
          maxLength={TAG_LIMITS.length}
          disabled={full}
          placeholder={full ? 'Full' : 'Type a tag…'}
          autoComplete="off"
          aria-describedby={`${uid}-hint`}
          onChange={(e) => {
            if (e.target.value.endsWith(',')) add(e.target.value.slice(0, -1));
            else setText(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(text);
            }
          }}
        />
        <datalist id={`${uid}-list`}>
          {offered.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button type="button" className="draft-button" disabled={full || !cleanTag(text)} onClick={() => add(text)}>
          Add
        </button>
      </div>
      {offered.length > 0 && !full && (
        <div className="tag-suggested" role="group" aria-label={`${title}: suggested`}>
          <span className="draft-hint">Suggested:</span>
          {offered.map((s) => (
            <button key={s} type="button" className="tag-suggestion" onClick={() => add(s)} aria-label={`Add the tag ${s}`}>
              + {s}
            </button>
          ))}
        </div>
      )}
      <p className="visually-hidden" role="status">
        {note}
      </p>
    </fieldset>
  );
}
