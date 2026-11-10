import { useDoc } from '../../store/documentStore';
import * as A from '../../store/actions';
import { Section } from '../controls/Controls';

export function CategoryPanel() {
  const doc = useDoc();
  const counts = new Map<string, number>();
  for (const n of Object.values(doc.nodes)) if (n.categoryId) counts.set(n.categoryId, (counts.get(n.categoryId) ?? 0) + 1);

  return (
    <Section
      title="Categories"
      actions={
        <button className="btn ghost small" onClick={() => A.addCategory()}>
          + Add
        </button>
      }
    >
      <ul className="category-list">
        {doc.categoryOrder.map((id) => {
          const c = doc.categories[id];
          const count = counts.get(id) ?? 0;
          return (
            <li key={id}>
              <input
                type="color"
                className="swatch"
                value={c.color}
                title="Category color (updates bubbles that follow it)"
                onChange={(e) => A.updateCategory(id, { color: e.target.value })}
              />
              <input
                className="input bare"
                value={c.name}
                onChange={(e) => A.updateCategory(id, { name: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              />
              <button
                className="count"
                title="Select bubbles in this category"
                onClick={() => A.selectNodes(doc.nodeOrder.filter((nid) => doc.nodes[nid].categoryId === id))}
              >
                {count}
              </button>
              <button className="icon-btn" title="Delete category" onClick={() => A.deleteCategory(id)}>
                ×
              </button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
