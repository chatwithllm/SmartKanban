import { useMemo } from 'react';
import { useCardChain } from '../hooks/useCardChain.ts';
import type { Card, CardLink, Insight } from '../types.ts';
import ReactFlow, { Background, Controls, type Node, type Edge } from 'reactflow';
import 'reactflow/dist/style.css';

type Props = {
  cardId: string;
  onClose: () => void;
  onOpenCard?: (id: string) => void;
};

const STATUS_EMOJI: Record<string, string> = {
  backlog: '📥',
  today: '📅',
  in_progress: '⚡',
  done: '✅',
};

function relativeAge(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  const days = Math.floor(d / 86_400_000);
  if (days >= 1) return `${days}d ago`;
  const hrs = Math.floor(d / 3_600_000);
  if (hrs >= 1) return `${hrs}h ago`;
  const mins = Math.floor(d / 60_000);
  return `${Math.max(1, mins)}m ago`;
}

function buildGraph(
  centerId: string,
  nodes: Card[],
  edges: CardLink[],
  insights: Insight[],
): { rfNodes: Node[]; rfEdges: Edge[] } {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.from_card_id)) adj.set(e.from_card_id, []);
    if (!adj.has(e.to_card_id)) adj.set(e.to_card_id, []);
    adj.get(e.from_card_id)!.push(e.to_card_id);
    adj.get(e.to_card_id)!.push(e.from_card_id);
  }
  const depthOf = new Map<string, number>();
  const queue: string[] = [centerId];
  depthOf.set(centerId, 0);
  while (queue.length > 0) {
    const id = queue.shift()!;
    const d = depthOf.get(id)!;
    for (const next of adj.get(id) ?? []) {
      if (!depthOf.has(next)) {
        depthOf.set(next, d + 1);
        queue.push(next);
      }
    }
  }
  const byDepth = new Map<number, string[]>();
  for (const [id, d] of depthOf) {
    if (!byDepth.has(d)) byDepth.set(d, []);
    byDepth.get(d)!.push(id);
  }
  const X_STEP = 280;
  const Y_STEP = 140;
  const positions = new Map<string, { x: number; y: number }>();
  for (const [d, ids] of byDepth) {
    const half = ((ids.length - 1) * Y_STEP) / 2;
    ids.forEach((id, i) => {
      positions.set(id, { x: d * X_STEP, y: i * Y_STEP - half });
    });
  }

  const rfNodes: Node[] = nodes.map((c) => {
    const pos = positions.get(c.id) ?? { x: 0, y: 0 };
    const hasInsight = insights.some((ins) => ins.card_id === c.id);
    const isCenter = c.id === centerId;
    return {
      id: c.id,
      position: pos,
      data: {
        label: (
          <div style={{ minWidth: 180, fontSize: 12 }}>
            <div style={{ fontWeight: isCenter ? 600 : 400 }}>
              {STATUS_EMOJI[c.status] ?? ''} {c.title}
              {hasInsight && <span title="Has AI Insight"> ✨</span>}
            </div>
            <div style={{ fontSize: 11, opacity: 0.7 }}>
              {relativeAge(c.updated_at)} • {c.tags.length} tags
            </div>
          </div>
        ),
      },
      style: {
        background: isCenter ? 'rgb(var(--violet-soft))' : 'rgb(var(--card))',
        border: isCenter ? '2px solid rgb(var(--violet))' : '1px solid rgb(var(--hairline) / 0.15)',
        color: 'rgb(var(--ink))',
        borderRadius: 10,
        padding: 8,
      },
    };
  });

  const rfEdges: Edge[] = edges.map((e) => ({
    id: e.id,
    source: e.from_card_id,
    target: e.to_card_id,
    label: e.note ? `${e.label}\n"${e.note.slice(0, 40)}"` : e.label,
    style: { stroke: 'rgb(var(--violet))', strokeWidth: 1.5 },
    labelStyle: { fill: 'rgb(var(--ink))', fontSize: 11 },
    labelBgStyle: { fill: 'rgb(var(--surface))' },
  }));

  return { rfNodes, rfEdges };
}

export function CardChainModal({ cardId, onClose, onOpenCard }: Props) {
  const { data, loading, err } = useCardChain(cardId, 2);

  const { rfNodes, rfEdges } = useMemo(() => {
    if (!data) return { rfNodes: [], rfEdges: [] };
    return buildGraph(cardId, data.nodes, data.edges, data.insights);
  }, [data, cardId]);

  return (
    <div className="fixed inset-0 z-[60] bg-ink/60 flex items-stretch p-4" onClick={onClose}>
      <div
        className="modal-surface flex-1 flex flex-col"
        style={{ minHeight: 320 }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header-strip flex items-center justify-between px-5 py-3 shrink-0">
          <span className="text-2 font-semibold text-ink-rev tracking-tight2">🧬 Chain view</span>
          <button onClick={onClose} className="text-2 text-ink-rev/80 hover:text-ink-rev" aria-label="Close">✕</button>
        </header>
        <div className="flex-1 relative">
          {loading && <div className="absolute inset-0 flex items-center justify-center text-ink-soft text-2 tracking-tight2">Loading…</div>}
          {err && <div className="absolute inset-0 flex items-center justify-center text-red text-2 tracking-tight2">{err}</div>}
          {!loading && !err && rfNodes.length > 0 && (
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              fitView
              onNodeDoubleClick={(_e, n) => onOpenCard?.(n.id)}
            >
              <Background />
              <Controls />
            </ReactFlow>
          )}
          {!loading && !err && rfNodes.length === 1 && (
            <div className="absolute bottom-4 left-4 right-4 text-1 text-ink-soft tracking-tight2 text-center">
              No links yet. Add the first one from the Related cards section.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
