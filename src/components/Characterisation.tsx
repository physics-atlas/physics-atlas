import type { GraphNode } from '../data/types';
import { MathText } from './RichText';

/** Whether a concept has any of layers 2 and 3 filled in; nothing is shown until it does. */
const hasCharacterisation = (node: GraphNode) =>
  Boolean(node.physicalRole?.length || node.mathematicalCharacter?.length || node.expressions?.length);

/**
 * A concept's role in physics, its mathematical character, its physical domain
 * (its Field) and how it's written: on its card (`level` 3) and its page (2).
 */
export default function Characterisation({ node, level }: { node: GraphNode; level: 2 | 3 }) {
  if (!hasCharacterisation(node)) return null;
  const domain = 'domain' in node.attrs ? node.attrs.domain : undefined;
  const Heading = level === 2 ? 'h2' : 'h3';
  const lists: [string, string[]][] = [
    ['Physical role', node.physicalRole ?? []],
    ['Mathematical character', node.mathematicalCharacter ?? []],
    ['Physical domain', domain ? domain.split(' / ').map((d) => d.trim()) : []],
  ];
  return (
    <>
      {lists.map(
        ([heading, items]) =>
          items.length > 0 && (
            <section key={heading} className="rel-block concept-character">
              <Heading className={level === 3 ? 'block-heading' : undefined}>{heading}</Heading>
              <ul className="concept-character-list">
                {items.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </section>
          ),
      )}
      {node.expressions && node.expressions.length > 0 && (
        <section className="rel-block concept-character">
          <Heading className={level === 3 ? 'block-heading' : undefined}>Mathematical expressions</Heading>
          <ul className="concept-character-list">
            {node.expressions.map((x, i) => (
              <li key={i}>
                <MathText tex={x.tex} />
                {x.note && <span className="concept-via"> ({x.note})</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
