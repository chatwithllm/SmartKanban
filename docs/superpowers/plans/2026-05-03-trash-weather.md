# Trash Can + Weather Widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a drag-to-trash FAB for soft-deleting cards (mobile long-press supported) and a compact weather widget in the topbar.

**Architecture:** All frontend-only changes. Trash integrates with the existing dnd-kit `DndContext` in `Board.tsx` by adding a `useDroppable` zone and handling `over.id === 'trash'` in `onDragEnd`. Weather uses a new `useWeather` hook (geolocation → Open-Meteo fetch, 30-min localStorage cache) rendered as a compact chip in `BoardHeader`.

**Tech Stack:** React + TypeScript, dnd-kit 6.x (`@dnd-kit/core`), Open-Meteo REST API (free, no key), localStorage for weather cache.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `web/src/types.ts` | Add `WeatherData` type |
| Create | `web/src/hooks/useWeather.ts` | Geolocation fetch, cache, WMO emoji map |
| Create | `web/src/components/WeatherWidget.tsx` | Compact chip + forecast popover |
| Modify | `web/src/components/BoardHeader.tsx` | Import + render `WeatherWidget` left of search |
| Create | `web/src/components/TrashDropZone.tsx` | Fixed FAB, `useDroppable`, red-glow on drag |
| Modify | `web/src/components/Board.tsx` | `MouseSensor`+`TouchSensor`, trash branch in `onDragEnd`, render `TrashDropZone` |

---

## Task 1: WeatherData type + useWeather hook

**Files:**
- Modify: `web/src/types.ts`
- Create: `web/src/hooks/useWeather.ts`

- [ ] **Step 1: Add `WeatherData` type to `web/src/types.ts`**

Open `web/src/types.ts` and append at the end of the file:

```ts
export type WeatherData = {
  current: { temp: number; code: number; humidity: number; wind: number };
  daily: Array<{ date: string; code: number; max: number; min: number }>;
};
```

- [ ] **Step 2: Create `web/src/hooks/useWeather.ts`**

```ts
import { useEffect, useState } from 'react';
import type { WeatherData } from '../types.ts';

const CACHE_KEY = 'weather_cache';
const CACHE_TTL_MS = 30 * 60 * 1000;

export function wmoEmoji(code: number): string {
  if (code === 0) return '☀️';
  if (code <= 1) return '🌤️';
  if (code <= 2) return '⛅';
  if (code <= 3) return '🌥️';
  if (code === 45 || code === 48) return '🌫️';
  if (code <= 67) return '🌧️';
  if (code <= 77) return '❄️';
  if (code <= 82) return '🌦️';
  if (code === 95) return '⛈️';
  return '🌩️';
}

export function wmoCondition(code: number): string {
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Cloudy';
  if (code === 45 || code === 48) return 'Foggy';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Showers';
  return 'Storm';
}

type CacheEntry = { data: WeatherData; ts: number };

export function useWeather(): { data: WeatherData | null; loading: boolean } {
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const entry: CacheEntry = JSON.parse(raw);
        if (Date.now() - entry.ts < CACHE_TTL_MS) {
          setData(entry.data);
          setLoading(false);
          return;
        }
      }
    } catch { /* ignore */ }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude: lat, longitude: lon } = pos.coords;
          const url =
            `https://api.open-meteo.com/v1/forecast` +
            `?latitude=${lat}&longitude=${lon}` +
            `&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m` +
            `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
            `&forecast_days=6&timezone=auto`;
          const res = await fetch(url);
          const json = await res.json();
          const result: WeatherData = {
            current: {
              temp: Math.round(json.current.temperature_2m),
              code: json.current.weather_code,
              humidity: json.current.relative_humidity_2m,
              wind: Math.round(json.current.wind_speed_10m),
            },
            daily: (json.daily.time as string[]).slice(1).map((date, i) => ({
              date,
              code: json.daily.weather_code[i + 1] as number,
              max: Math.round(json.daily.temperature_2m_max[i + 1] as number),
              min: Math.round(json.daily.temperature_2m_min[i + 1] as number),
            })),
          };
          localStorage.setItem(CACHE_KEY, JSON.stringify({ data: result, ts: Date.now() }));
          setData(result);
        } catch { /* ignore */ }
        setLoading(false);
      },
      () => setLoading(false),
      { timeout: 5000 },
    );
  }, []);

  return { data, loading };
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web/src/types.ts web/src/hooks/useWeather.ts
git commit -m "feat(weather): add WeatherData type and useWeather hook"
```

---

## Task 2: WeatherWidget component

**Files:**
- Create: `web/src/components/WeatherWidget.tsx`

- [ ] **Step 1: Create `web/src/components/WeatherWidget.tsx`**

```tsx
import { useState, useRef, useEffect } from 'react';
import { useWeather, wmoEmoji, wmoCondition } from '../hooks/useWeather.ts';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function WeatherWidget() {
  const { data, loading } = useWeather();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (loading || !data) return null;

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      {/* Compact chip */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 8px', borderRadius: 8,
          background: 'rgb(var(--surface))',
          border: '1px solid rgb(var(--hairline) / 0.10)',
          cursor: 'pointer', lineHeight: 1,
        }}
        title="Weather forecast"
      >
        <span style={{ fontSize: 20 }}>{wmoEmoji(data.current.code)}</span>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'rgb(var(--ink))', lineHeight: 1.2 }}>
            {data.current.temp}°
          </div>
          <div style={{ fontSize: 9, color: 'rgb(var(--ink-3))', lineHeight: 1.2 }}>
            {wmoCondition(data.current.code)}
          </div>
        </div>
      </button>

      {/* Forecast popover */}
      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            width: 280, borderRadius: 12, zIndex: 200,
            background: 'rgb(var(--surface))',
            border: '1px solid rgb(var(--hairline) / 0.10)',
            boxShadow: 'var(--sh-2)',
            padding: 16,
          }}
        >
          {/* Today detail row */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 12,
              marginBottom: 12, paddingBottom: 12,
              borderBottom: '1px solid rgb(var(--hairline) / 0.08)',
            }}
          >
            <span style={{ fontSize: 36 }}>{wmoEmoji(data.current.code)}</span>
            <div>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'rgb(var(--ink))', lineHeight: 1 }}>
                {data.current.temp}°
              </div>
              <div style={{ fontSize: 11, color: 'rgb(var(--ink-2))', marginTop: 2 }}>
                💧 {data.current.humidity}% · 💨 {data.current.wind} km/h
              </div>
            </div>
          </div>

          {/* 5-day forecast */}
          {data.daily.slice(0, 5).map((d) => {
            const dow = DAY_NAMES[new Date(d.date).getDay()];
            return (
              <div
                key={d.date}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}
              >
                <span style={{ width: 32, fontSize: 12, color: 'rgb(var(--ink-2))' }}>{dow}</span>
                <span style={{ fontSize: 16 }}>{wmoEmoji(d.code)}</span>
                <span style={{ flex: 1 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'rgb(var(--ink))' }}>{d.max}°</span>
                <span style={{ fontSize: 11, color: 'rgb(var(--ink-3))', marginLeft: 4 }}>{d.min}°</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/WeatherWidget.tsx
git commit -m "feat(weather): add WeatherWidget chip with forecast popover"
```

---

## Task 3: Wire WeatherWidget into BoardHeader

**Files:**
- Modify: `web/src/components/BoardHeader.tsx`

Context: `BoardHeader.tsx` has a right-side cluster: flex row containing search input, then an Actions `div` with `✦`, `notificationBell`, `⚙`, divider, profile dropdown. Weather chip should sit left of the search input.

The section around line 155 looks like:

```tsx
<div style={{ flex: 1, minWidth: 0 }} />

{/* Search */}
<div style={{ position: 'relative', flex: '0 1 220px', minWidth: 140 }}>
  ...
</div>

{/* Actions */}
<div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
```

- [ ] **Step 1: Add `WeatherWidget` import to `web/src/components/BoardHeader.tsx`**

Add after the last existing import line at the top of the file:

```tsx
import { WeatherWidget } from './WeatherWidget.tsx';
```

- [ ] **Step 2: Insert `<WeatherWidget />` left of the search input**

Find the `{/* Search */}` block (around line 157). Insert `<WeatherWidget />` immediately before it:

```tsx
        <WeatherWidget />

        {/* Search */}
        <div style={{ position: 'relative', flex: '0 1 220px', minWidth: 140 }}>
```

- [ ] **Step 3: Start dev server and smoke-test weather**

```bash
cd web && npm run dev
```

Open `http://localhost:5173`. The topbar should show a weather chip (or nothing if geolocation is denied). If the browser prompts for location, allow it. The chip should display an emoji + temperature. Click it → 5-day popover opens. Click outside → closes.

If geolocation is denied: chip is hidden. No error shown.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/BoardHeader.tsx
git commit -m "feat(weather): wire WeatherWidget into topbar"
```

---

## Task 4: TrashDropZone component

**Files:**
- Create: `web/src/components/TrashDropZone.tsx`

Context: This component registers as a dnd-kit drop target with `id: 'trash'`. It is a fixed FAB positioned at `bottom: 88px; right: 20px` (above the existing `+` add-card FAB at `bottom: 24px; right: 24px`). `isDragging` prop controls the always-visible expansion — the zone grows and glows while any card is being dragged. `isOver` triggers the full red fill.

- [ ] **Step 1: Create `web/src/components/TrashDropZone.tsx`**

```tsx
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
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/src/components/TrashDropZone.tsx
git commit -m "feat(trash): add TrashDropZone droppable component"
```

---

## Task 5: Wire TrashDropZone into Board — dual sensors + trash onDragEnd

**Files:**
- Modify: `web/src/components/Board.tsx`

Context: `Board.tsx` currently uses a single `PointerSensor` with `{ distance: 4 }`. We replace it with `MouseSensor` (distance: 4 for desktop) + `TouchSensor` (delay: 250, tolerance: 5 for mobile long-press). The `onDragEnd` handler gets a new early-return branch when `over.id === 'trash'` — it calls the existing `onDelete` prop and returns. `TrashDropZone` renders inside `DndContext` but outside the lanes grid, receiving `isDragging={activeId !== null}`.

Current imports (line 1–11):

```tsx
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
```

- [ ] **Step 1: Replace `PointerSensor` import with `MouseSensor` + `TouchSensor`**

In `web/src/components/Board.tsx`, replace the import block with:

```tsx
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
```

- [ ] **Step 2: Add `TrashDropZone` import**

After the last existing import line, add:

```tsx
import { TrashDropZone } from './TrashDropZone.tsx';
```

- [ ] **Step 3: Replace `useSensors` call**

Find (line 30):

```tsx
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
```

Replace with:

```tsx
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );
```

- [ ] **Step 4: Add trash branch to `onDragEnd`**

Find the start of `onDragEnd` (line 55):

```tsx
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;

    const activeCard = cards.find((c) => c.id === active.id);
    if (!activeCard) return;

    const overId = String(over.id);
```

Replace with:

```tsx
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;

    const activeCard = cards.find((c) => c.id === active.id);
    if (!activeCard) return;

    if (over.id === 'trash') {
      onDelete(activeCard.id);
      return;
    }

    const overId = String(over.id);
```

- [ ] **Step 5: Render `TrashDropZone` inside `DndContext`**

Find the closing `</DndContext>` tag (currently the last element before the outer closing tag). The rendered JSX currently ends with:

```tsx
      <DragOverlay>
        {activeCard ? <CardView card={activeCard} users={users} dragging /> : null}
      </DragOverlay>
      <button
        type="button"
        className="fab hidden md:inline-flex"
        style={{ width: '48px', height: '48px', right: '24px', bottom: '24px' }}
        onClick={() => window.dispatchEvent(new CustomEvent('kanban:add-card', { detail: { status: 'today' } }))}
        aria-label="Add card to Today"
      >
        <span className="text-2xl leading-none" aria-hidden>+</span>
      </button>
    </DndContext>
```

Add `<TrashDropZone>` after `</DragOverlay>` and before the `<button>`:

```tsx
      <DragOverlay>
        {activeCard ? <CardView card={activeCard} users={users} dragging /> : null}
      </DragOverlay>
      <TrashDropZone isDragging={activeId !== null} />
      <button
        type="button"
        className="fab hidden md:inline-flex"
        style={{ width: '48px', height: '48px', right: '24px', bottom: '24px' }}
        onClick={() => window.dispatchEvent(new CustomEvent('kanban:add-card', { detail: { status: 'today' } }))}
        aria-label="Add card to Today"
      >
        <span className="text-2xl leading-none" aria-hidden>+</span>
      </button>
    </DndContext>
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Smoke-test drag-to-trash (desktop)**

With dev server running (`npm run dev`):

1. Open `http://localhost:5173`
2. Trash FAB visible at bottom-right (violet circle, above `+` button) — confirm
3. Start dragging a card → trash FAB grows and shifts to red-tinted glow — confirm
4. Drop card on trash → card disappears from board — confirm
5. Open Archive tab → deleted card appears there — confirm
6. Restore it → card reappears in board — confirm

- [ ] **Step 8: Smoke-test drag-to-trash (mobile / touch)**

Open DevTools → toggle device toolbar (mobile emulation). Pick a phone preset.

1. Long-press (hold 250ms) on a card → drag activates — confirm
2. Drag to trash FAB → red glow — confirm
3. Release → card soft-deleted — confirm

- [ ] **Step 9: Commit**

```bash
git add web/src/components/Board.tsx
git commit -m "feat(trash): wire TrashDropZone into Board with touch sensor support"
```

---

## Smoke-Test Checklist (post all tasks)

- [ ] Weather chip visible in topbar (requires geolocation allow)
- [ ] Weather chip hidden if geolocation denied (no error)
- [ ] Click weather chip → popover with today detail + 5 days
- [ ] Click outside → popover closes
- [ ] Refresh → chip shows immediately from cache (no flicker, no geolocation prompt)
- [ ] Trash FAB visible at bottom-right above `+` button
- [ ] Drag card on desktop → FAB expands + glows red-tinted
- [ ] Drop on trash → card removed from board
- [ ] Archive tab shows the trashed card
- [ ] Restore from Archive → card back on board
- [ ] Mobile emulation: long-press 250ms → drag activates → drop on trash works
