import { useEffect, useState } from 'react';

const QUERY = '(max-width: 767px)';

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(QUERY).matches,
  );
  useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}
