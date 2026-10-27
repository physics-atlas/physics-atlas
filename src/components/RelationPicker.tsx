import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { EDGE_SENTENCE_TEMPLATES } from '../data/types';
import type { EdgeType } from '../data/types';
import { OTHER_RELATION } from '../community/relationTypes';

// Picks a relation's type, each choice shown as its sentence with the relation
// in bold and the two concept names quieter around it ("Vlasov eq. **is a
// strict prerequisite for** Structure Formation"). A native <select> can't
// style part of an option, so this is the WAI-ARIA APG select-only combobox: a
// button that opens a listbox, with the keyboard of a native select. Its last
// choice, "Other…", asks for a new kind of relation (relationTypes.ts).

type Choice = EdgeType | typeof OTHER_RELATION;

/** The template's runs: the two ends, and the relation's own words between them. */
function Sentence({ type, from, to }: { type: Choice; from: string; to: string }) {
  if (type === OTHER_RELATION)
    return (
      <span className="relation-sentence">
        <strong className="relation-name">Other…</strong> <span className="relation-end">a new kind of relation</span>
      </span>
    );
  const runs = EDGE_SENTENCE_TEMPLATES[type]
    .replace(/\.$/, '')
    .split(/(\{s\}|\{t\})/)
    .filter((run) => run.trim() !== '');
  return (
    <span className="relation-sentence">
      {runs.map((run, i) =>
        run === '{s}' || run === '{t}' ? (
          <span key={i} className="relation-end">
            {run === '{s}' ? from : to}
          </span>
        ) : (
          <strong key={i} className="relation-name">
            {run.trim()}
          </strong>
        ),
      )}
    </span>
  );
}

export default function RelationPicker({
  id,
  value,
  types,
  from,
  to,
  onChange,
}: {
  /** The button's id — what the field's <label htmlFor> points at */
  id: string;
  value: Choice;
  types: EdgeType[];
  from: string;
  to: string;
  onChange: (type: Choice) => void;
}) {
  const choices: Choice[] = [...types, OTHER_RELATION];
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, choices.indexOf(value)));
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });
  const optionId = (i: number) => `${listId}-${i}`;

  // Keep the highlighted choice in view while moving through a long list.
  useEffect(() => {
    if (open) document.getElementById(optionId(active))?.scrollIntoView({ block: 'nearest' });
  });

  const openAt = (i: number) => {
    setActive(Math.min(choices.length - 1, Math.max(0, i)));
    setOpen(true);
  };
  const choose = (i: number) => {
    setOpen(false);
    if (choices[i] !== value) onChange(choices[i]);
  };

  /** Type-ahead on the relation's own words: "str" finds "is a strict prerequisite for". */
  const seek = (key: string) => {
    const now = performance.now();
    typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + key.toLowerCase(), at: now };
    const words = (t: Choice) =>
      t === OTHER_RELATION ? 'other' : EDGE_SENTENCE_TEMPLATES[t].replace(/\{s\}|\{t\}/g, '').trim().toLowerCase();
    const hit = choices.findIndex((t) => words(t).startsWith(typed.current.text) || t.startsWith(typed.current.text));
    if (hit >= 0) openAt(hit);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const keys: Record<string, () => void> = open
      ? {
          ArrowDown: () => setActive((a) => Math.min(choices.length - 1, a + 1)),
          ArrowUp: () => setActive((a) => Math.max(0, a - 1)),
          Home: () => setActive(0),
          End: () => setActive(choices.length - 1),
          PageDown: () => setActive((a) => Math.min(choices.length - 1, a + 8)),
          PageUp: () => setActive((a) => Math.max(0, a - 8)),
          Enter: () => choose(active),
          ' ': () => choose(active),
          Escape: () => setOpen(false),
        }
      : {
          ArrowDown: () => openAt(choices.indexOf(value)),
          ArrowUp: () => openAt(choices.indexOf(value)),
          Enter: () => openAt(choices.indexOf(value)),
          ' ': () => openAt(choices.indexOf(value)),
          Home: () => openAt(0),
          End: () => openAt(choices.length - 1),
        };
    if (e.key === 'Tab') {
      if (open) choose(active);
      return;
    }
    const act = keys[e.key];
    if (act) {
      e.preventDefault();
      act();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      seek(e.key);
    }
  };

  return (
    <div className="relation-picker">
      <button
        id={id}
        type="button"
        role="combobox"
        className="draft-input relation-picker-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optionId(active) : undefined}
        onClick={() => (open ? setOpen(false) : openAt(choices.indexOf(value)))}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      >
        <Sentence type={value} from={from} to={to} />
        <span className="relation-picker-caret" aria-hidden>
          ▾
        </span>
      </button>
      <ul ref={listRef} id={listId} role="listbox" className="relation-picker-list" hidden={!open} aria-label="Relations">
        {choices.map((t, i) => (
          <li
            key={t}
            id={optionId(i)}
            role="option"
            aria-selected={t === value}
            className={`relation-picker-option ${i === active ? 'relation-picker-option-active' : ''}`}
            // mousedown, not click: the button keeps focus, so its blur doesn't close the list first
            onMouseDown={(e) => {
              e.preventDefault();
              choose(i);
            }}
            onMouseEnter={() => setActive(i)}
          >
            <Sentence type={t} from={from} to={to} />
          </li>
        ))}
      </ul>
    </div>
  );
}
