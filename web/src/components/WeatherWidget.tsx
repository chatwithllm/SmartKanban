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
