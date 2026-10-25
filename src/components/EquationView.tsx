import type { EquationAttrs, EquationVariable, Formula, MathNotation } from '../data/types';
import MathSource from './MathSource';

// An equation on the concept card, typeset like the editor's preview: the main
// form with its variables, then every other representation with its own.
// Loaded on demand (KaTeX is large), so the card shows the LaTeX source until
// it arrives — see ConceptMapView. LaTeX or Typst, as the concept is written (MathSource).

function Variables({ variables, notation }: { variables: EquationVariable[]; notation?: MathNotation }) {
  return (
    <dl className="concept-variables">
      {variables.map((v, i) => (
        <div key={`${v.symbol}-${i}`} className="concept-variable">
          <dt>
            <MathSource source={v.symbol} notation={notation} />
          </dt>
          <dd>{v.meaning}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function EquationView({ attrs }: { attrs: EquationAttrs }) {
  const notation = attrs.notation;
  return (
    <div className="rel-block concept-equation">
      <div className="concept-equation-formula">
        <MathSource source={attrs.equation} notation={notation} display />
      </div>
      {attrs.variables.length > 0 && (
        <>
          <h3 className="block-heading">Variables</h3>
          <Variables variables={attrs.variables} notation={notation} />
        </>
      )}
      {attrs.conditions.length > 0 && (
        <>
          <h3 className="block-heading">Conditions</h3>
          <ul className="concept-list">
            {attrs.conditions.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </>
      )}
      {attrs.representations.length > 0 && (
        <>
          <h3 className="block-heading">Other representations</h3>
          <ul className="concept-representations">
            {attrs.representations.map((r, i) => (
              <li key={`${r.name}-${i}`} className="concept-representation">
                <p className="concept-representation-name">{r.name}</p>
                {r.equation && (
                  <div className="concept-equation-formula">
                    <MathSource source={r.equation} notation={notation} display />
                  </div>
                )}
                {r.variables && r.variables.length > 0 && <Variables variables={r.variables} notation={notation} />}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** A mathematical formalism's formulas — how it works — each typeset, named and with its variables. */
export function FormulaView({ formulas, notation }: { formulas: Formula[]; notation?: MathNotation }) {
  return (
    <section className="rel-block concept-equation">
      <h3 className="block-heading">
        Formulas
        {formulas.length > 0 && <span className="rel-count">{formulas.length}</span>}
      </h3>
      {formulas.length === 0 ? (
        <p className="concept-empty">None written yet.</p>
      ) : (
        <ul className="concept-representations">
          {formulas.map((f, i) => (
            <li key={`${f.name ?? ''}-${i}`} className="concept-representation">
              {f.name && <p className="concept-representation-name">{f.name}</p>}
              <div className="concept-equation-formula">
                <MathSource source={f.equation} notation={notation} display />
              </div>
              {f.variables && f.variables.length > 0 && <Variables variables={f.variables} notation={notation} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
