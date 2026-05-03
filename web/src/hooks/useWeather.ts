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

    async function fetchWeather(lat: number, lon: number) {
      const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,weather_code,relative_humidity_2m,wind_speed_10m` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
        `&forecast_days=6&timezone=auto`;
      const res = await fetch(url);
      const json = await res.json();
      return {
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
      } as WeatherData;
    }

    async function ipFallback() {
      try {
        const geo = await fetch('https://ipapi.co/json/');
        const j = await geo.json();
        if (j.latitude && j.longitude) {
          return fetchWeather(j.latitude, j.longitude);
        }
      } catch { /* ignore */ }
      return null;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const result = await fetchWeather(pos.coords.latitude, pos.coords.longitude);
          localStorage.setItem(CACHE_KEY, JSON.stringify({ data: result, ts: Date.now() }));
          setData(result);
        } catch { /* ignore */ }
        setLoading(false);
      },
      async () => {
        // Geolocation blocked (HTTP/LAN) — fall back to IP-based location
        const result = await ipFallback();
        if (result) {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ data: result, ts: Date.now() }));
          setData(result);
        }
        setLoading(false);
      },
      { timeout: 5000 },
    );
  }, []);

  return { data, loading };
}
