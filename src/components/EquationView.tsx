import type { EquationAttrs, EquationVariable, Formula } from '../data/types';
import { MathText } from './RichText';

// An equation on the concept card, typeset like the editor's preview: the main
// form with its variables, then every other representation with its own.
// Loaded on demand (KaTeX is large), so the card shows the LaTeX source until
// it arrives — see ConceptMapView.

function Variables({ variables }: { variables: EquationVariable[] }) {
  return (
    <dl className="concept-variables">
      {variables.map((v, i) => (
        <div key={`${v.symbol}-${i}`} className="concept-variable">
          <dt>
            <MathText tex={v.symbol} />
          </dt>
          <dd>{v.meaning}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function EquationView({ attrs }: { attrs: EquationAttrs }) {
  return (
    <div className="rel-block concept-equation">
      <div className="concept-equation-formula">
        <MathText tex={attrs.equation} display />
      </div>
      {attrs.variables.length > 0 && (
        <>
          <h3 className="block-heading">Variables</h3>
          <Variables variables={attrs.variables} />
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
                    <MathText tex={r.equation} display />
                  </div>
                )}
                {r.variables && r.variables.length > 0 && <Variables variables={r.variables} />}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** A mathematical formalism's formulas — how it works — each typeset, named and with its variables. */
export function FormulaView({ formulas }: { formulas: Formula[] }) {
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
                <MathText tex={f.equation} display />
              </div>
              {f.variables && f.variables.length > 0 && <Variables variables={f.variables} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
