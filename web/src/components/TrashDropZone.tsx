import { useDroppable } from '@dnd-kit/core';

type Props = { isDragging: boolean };

export function TrashDropZone({ isDragging }: Props) {
  const { setNodeRef, isOver } = useDroppable({ id: 'trash' });

  const size = isOver || isDragging ? 60 : 48;
  const bg = isOver
    ? '#e53e3e'
    : isDragging
    ? 'rgba(229, 62, 62, 0.22)'
    : 'rgb(var(--violet) / 0.75)';
  const shadow = isOver
    ? '0 0 0 4px rgba(229,62,62,0.35), 0 6px 20px rgba(229,62,62,0.45)'
    : isDragging
    ? '0 0 0 2px rgba(229,62,62,0.3), 0 4px 12px rgba(0,0,0,0.2)'
    : '0 4px 12px rgba(0,0,0,0.25)';

  return (
    <div
      ref={setNodeRef}
      aria-label="Trash — drop card here to delete"
      style={{
        position: 'fixed',
        bottom: 88,
        right: 20,
        width: size,
        height: size,
        borderRadius: 999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: isOver ? 26 : 20,
        transition: 'all 0.15s ease',
        background: bg,
        boxShadow: shadow,
        zIndex: 40,
        cursor: 'default',
        userSelect: 'none',
      }}
    >
      🗑️
    </div>
  );
}
