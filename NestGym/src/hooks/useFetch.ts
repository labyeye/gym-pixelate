import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Tiny data-fetching hook (the web app uses react-query). Refetches when
 * `deps` change and whenever the screen regains focus, so lists are fresh
 * after returning from a form.
 */
export function useFetch<T = any>(
  fn: () => Promise<T>,
  deps: any[] = [],
  enabled = true,
) {
  const [data, setData] = useState<T | undefined>();
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const r = await fnRef.current();
      if (id === seq.current) {
        setData(r);
        setError('');
      }
    } catch (e: any) {
      if (id === seq.current) setError(e.message || 'Failed to load');
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  const first = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (first.current) {
        first.current = false;
        return;
      }
      if (enabled) reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled, reload]),
  );

  return { data, loading, error, reload };
}

/** Small debounce for search boxes. */
export function useDebounced<T>(value: T, ms = 350) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
