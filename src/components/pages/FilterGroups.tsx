import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

// Checkboxes in folding groups — kinds of concept by family (Knowledge,
// Research, Learning…), kinds of relation by category (Derivation,
// Description…). Each group folds (a native details/summary), says how many
// of its kinds are on, and has its own checkbox for all of them: checked,
// unchecked, or mixed when only some are.

export interface FilterGroup {
  key: string;
  label: string;
  items: { key: string; label: ReactNode }[];
}

function GroupBox({ label, on, total, onChange }: { label: string; on: number; total: number; onChange: (all: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = on > 0 && on < total;
  }, [on, total]);
  return (
    <label className="atlas-check atlas-check-all">
      <input
        ref={ref}
        type="checkbox"
        checked={on === total}
        aria-checked={on > 0 && on < total ? 'mixed' : on === total}
        onChange={() => onChange(on < total)}
      />
      All of {label}
    </label>
  );
}

export default function FilterGroups({
  legend,
  note,
  groups,
  selected,
  onChange,
}: {
  legend: string;
  note?: string;
  groups: FilterGroup[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const set = (keys: string[], on: boolean) => {
    const next = new Set(selected);
    for (const k of keys) {
      if (on) next.add(k);
      else next.delete(k);
    }
    onChange(next);
  };
  return (
    <fieldset className="atlas-filter-group">
      <legend className="atlas-small-label">{legend}</legend>
      {note && <p className="atlas-filter-note">{note}</p>}
      {groups.map((g) => {
        const keys = g.items.map((i) => i.key);
        const on = keys.filter((k) => selected.has(k)).length;
        return (
          <details key={g.key} className="atlas-filter-family">
            <summary>
              {g.label}{' '}
              <span className="atlas-filter-count">
                ({on} of {keys.length})
              </span>
            </summary>
            <GroupBox label={g.label} on={on} total={keys.length} onChange={(all) => set(keys, all)} />
            {g.items.map((item) => (
              <label key={item.key} className="atlas-check atlas-check-item">
                <input type="checkbox" checked={selected.has(item.key)} onChange={() => set([item.key], !selected.has(item.key))} />
                {item.label}
              </label>
            ))}
          </details>
        );
      })}
    </fieldset>
  );
}
