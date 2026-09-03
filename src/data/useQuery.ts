import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

export interface QueryResult<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  refetch: () => void;
}

/**
 * Minimal fetch-on-focus hook.
 *
 * Refetching on focus rather than on mount is what makes the list correct
 * after a submit or an edit pops back to it — there is no cache to invalidate.
 * `deps` must be stable; wrap the fetcher in `useCallback` at the call site.
 */
export function useQuery<T>(
  fetcher: () => Promise<T>,
  enabled = true,
): QueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [nonce, setNonce] = useState(0);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) {
        setLoading(false);
        return;
      }

      let cancelled = false;
      setLoading(true);

      fetcher()
        .then((result) => {
          if (cancelled) return;
          setData(result);
          setError(null);
        })
        .catch((caught: unknown) => {
          if (cancelled) return;
          setError(caught instanceof Error ? caught : new Error(String(caught)));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
      // `nonce` is what makes refetch() re-run the effect while focused.
    }, [fetcher, enabled, nonce]),
  );

  return { data, error, loading, refetch };
}
