# Trash Can + Weather Widget

**Date:** 2026-05-03  
**Status:** Approved  
**Scope:** Drag-to-trash soft-delete UX + weather widget in topbar

---

## Overview

Two independent UI features added to the KanbanClaude board:

1. **Trash Can** — fixed floating button (bottom-right). Dragging any card onto it soft-deletes the card (sets `archived = true`). Recovery via existing Archive tab.
2. **Weather Widget** — compact chip in the topbar showing current temperature + condition icon. Click opens a popover with today's detail and 5-day forecast. Uses Open-Meteo (free, no API key).

---

## Trash Can

### Behaviour

- Fixed FAB at `bottom: 24px; right: 24px; z-index: 40`
- Resting: `🗑️` icon inside a violet semi-transparent circle
- While any card is being dragged: zone grows, background shifts to red (`#e53e3e`), pulsing box-shadow
- Drop on trash zone → calls existing `DELETE /api/cards/:id` (soft-delete: `archived = true` in DB)
- Card disappears from board; recoverable via the existing Archive tab + restore flow
- No confirmation dialog — restore is one click away

### Mobile (touch)

- dnd-kit PointerSensor already handles touch; add `activationConstraint: { delay: 250, tolerance: 5 }` so long-press initiates drag
- No extra library needed; same drop-target detection applies on touch

### Implementation

**New component:** `web/src/components/TrashDropZone.tsx`

- Uses dnd-kit `useDroppable({ id: 'trash' })`
- Reads `isOver` from `useDroppable` to toggle red glow
- Reads a `isDragging` boolean prop (passed from `Board.tsx`) to control visibility expansion

**Changes to `web/src/components/Board.tsx` (or `App.tsx` — wherever DndContext lives)**

- Wrap existing `DndContext` `onDragEnd` handler: if `over?.id === 'trash'`, call `api.deleteCard(activeId)` then remove card from local state
- Pass `isDragging` state into `TrashDropZone`
- Render `<TrashDropZone>` inside the DndContext but outside the lane columns

**PointerSensor config** (already in Board/App, just update activation constraint):

```ts
useSensor(PointerSensor, {
  activationConstraint: { delay: 250, tolerance: 5 },
})
```

**API** — no new endpoint. Uses existing:
```
DELETE /api/cards/:id   → sets archived = true
```

---

## Weather Widget

### Behaviour

- Sits in topbar right cluster, left of search (⌘K) button
- On mount: requests `navigator.geolocation`; if granted, fetches Open-Meteo
- Compact chip: `⛅ 22°` with small condition label below
- Click → popover (280px) showing:
  - Today: icon, temp, condition, humidity, wind
  - 5-day rows: day name, icon, high/low
- Permission denied or fetch error: widget hides silently (no error shown)
- Caches last successful result in `localStorage` under key `weather_cache` with 30-min TTL — prevents flicker on refresh

### Open-Meteo API

No key required. Single call:
```
GET https://api.open-meteo.com/v1/forecast
  ?latitude={lat}&longitude={lon}
  &current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m
  &daily=weather_code,temperature_2m_max,temperature_2m_min
  &forecast_days=6
  &timezone=auto
```

WMO weather code → emoji mapping (subset):
| Code | Emoji |
|------|-------|
| 0 | ☀️ |
| 1–3 | 🌤️ / ⛅ / 🌥️ |
| 45, 48 | 🌫️ |
| 51–67 | 🌧️ |
| 71–77 | ❄️ |
| 80–82 | 🌦️ |
| 95 | ⛈️ |
| 96, 99 | 🌩️ |

### Implementation

**New hook:** `web/src/hooks/useWeather.ts`

- Exports `{ data, loading }` where `data` is `WeatherData | null`
- On mount: read cache from `localStorage`; if valid (< 30 min old) use it, else fetch
- Fetches geolocation, then Open-Meteo
- Writes result + timestamp to `localStorage`
- Silently swallows all errors

**New type** in `web/src/types.ts`:
```ts
export type WeatherData = {
  current: { temp: number; code: number; humidity: number; wind: number };
  daily: Array<{ date: string; code: number; max: number; min: number }>;
};
```

**New component:** `web/src/components/WeatherWidget.tsx`

- Calls `useWeather()`
- Returns `null` while loading or if `data` is null
- Compact chip: `<button>` with icon + temp + small condition text
- Click toggles `open` state → absolute-positioned popover below chip

**Changes to `web/src/components/BoardHeader.tsx`**

- Import `WeatherWidget`
- Place `<WeatherWidget />` in the right icon cluster, left of the search button

---

## Out of Scope

- Undo toast after trash (restore via Archive is sufficient)
- Per-card trash confirmation dialog
- Weather unit toggle (°C/°F) — defaults to system locale via Open-Meteo `temperature_unit` param (omit = Celsius)
- Weather location search / manual override
- Offline weather fallback beyond localStorage cache

---

## Files Touched

| Action | File |
|--------|------|
| Create | `web/src/components/TrashDropZone.tsx` |
| Create | `web/src/hooks/useWeather.ts` |
| Create | `web/src/components/WeatherWidget.tsx` |
| Modify | `web/src/components/Board.tsx` or `App.tsx` (DndContext onDragEnd + TrashDropZone render) |
| Modify | `web/src/components/BoardHeader.tsx` (add WeatherWidget) |
| Modify | `web/src/types.ts` (add WeatherData type) |
| Modify | `web/src/api.ts` (verify deleteCard exists — likely already present) |
