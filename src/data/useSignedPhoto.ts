import { useEffect, useState } from 'react';

import { signedPhotoUrl, type BucketName } from './storage';

/**
 * Resolves a stored photo path to a signed URL.
 *
 * The buckets are private, so a `*_photo_url` column holds a path, not
 * something an `<Image>` can load. Returns null while resolving and on
 * failure — every caller already has a placeholder for the empty case.
 */
export function useSignedPhoto(
  bucket: BucketName,
  path: string | null | undefined,
): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }

    let cancelled = false;
    signedPhotoUrl(bucket, path)
      .then((signed) => {
        if (!cancelled) setUrl(signed);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [bucket, path]);

  return url;
}
