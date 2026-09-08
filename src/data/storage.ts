import { Platform } from 'react-native';
import { File } from 'expo-file-system';

import { supabase } from './supabase';

/**
 * Storage buckets. Design-sheet photos live in `sheet-proof-photos` alongside
 * per-colour proof photos — one bucket for everything attached to a sheet.
 */
export const BUCKETS = {
  clientPhotos: 'client-photos',
  sheetProofPhotos: 'sheet-proof-photos',
  defectPhotos: 'defect-photos',
  /** Floor Manager: job-card design photo and materials-collection proof. */
  jobCardPhotos: 'job-card-photos',
  /** Store Manager: proof that materials were handed over. */
  issuePhotos: 'issue-photos',
  /** Accountant: payment and expense proof photos. */
  ledgerPhotos: 'ledger-photos',
  /** Company Admin: employee and finishing-partner CNIC / ID photos. */
  employeeDocs: 'employee-docs',
  /** Procurement: the supplier bill photographed at submission. */
  billPhotos: 'bill-photos',
  /** Super Admin: per-tenant CNIC photos. Written by the platform operator. */
  factoryDocs: 'factory-docs',
} as const;

export type BucketName = (typeof BUCKETS)[keyof typeof BUCKETS];

/**
 * Every object key is `{factory_id}/{name}` — the storage policies in
 * `0002_rls.sql` key off that first path segment, so a key without the
 * factory prefix will be rejected by the server.
 */
export function factoryPath(factoryId: string, fileName: string) {
  return `${factoryId}/${fileName}`;
}

function extensionOf(uri: string) {
  const match = /\.([a-zA-Z0-9]+)(?:\?|$)/.exec(uri);
  return (match?.[1] ?? 'jpg').toLowerCase();
}

function contentTypeFor(extension: string) {
  return extension === 'png' ? 'image/png' : 'image/jpeg';
}

/**
 * Read a locally captured photo into bytes the Storage client can upload.
 *
 * Two implementations because `expo-file-system` has no web build: its web
 * shim is a stub whose `FileSystemFile` has none of the class's methods, so
 * `new File(uri)` throws `this.validatePath is not a function` from the
 * constructor before any upload is attempted. On web the picker hands back a
 * `blob:` URL anyway, which `fetch` reads directly.
 */
async function readPhotoBytes(
  uri: string,
): Promise<{ bytes: ArrayBuffer | Blob; contentType: string | null }> {
  if (Platform.OS === 'web') {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Could not read the captured photo (${response.status}).`);
    }
    const blob = await response.blob();
    // A `blob:` URL carries no extension, so the blob's own MIME type is the
    // only honest source for the content type on web.
    return { bytes: blob, contentType: blob.type || null };
  }
  return { bytes: await new File(uri).arrayBuffer(), contentType: null };
}

export interface UploadPhotoArgs {
  bucket: BucketName;
  factoryId: string;
  /** Local file URI from `expo-image-picker` / `expo-camera`. */
  uri: string;
  /** Filename without extension; a timestamp is appended to avoid collisions. */
  name: string;
  /**
   * Optional segment between the factory prefix and the filename, e.g. an
   * order id. The factory prefix stays first so the storage policies still
   * match on it.
   */
  folder?: string;
}

/**
 * Upload a locally captured photo and return its storage path (not a URL) —
 * the path is what gets written to `*_photo_url` columns, and buckets are
 * private, so reads go through `signedPhotoUrl`.
 */
export async function uploadPhoto({
  bucket,
  factoryId,
  uri,
  name,
  folder,
}: UploadPhotoArgs): Promise<string> {
  const { bytes, contentType } = await readPhotoBytes(uri);
  const extension = contentType === 'image/png' ? 'png' : extensionOf(uri);
  const fileName = `${name}-${Date.now()}.${extension}`;
  const path = factoryPath(factoryId, folder ? `${folder}/${fileName}` : fileName);

  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: contentType ?? contentTypeFor(extension),
    upsert: false,
  });
  if (error) throw error;

  return path;
}

/** Signed read URL for a stored photo. Buckets are private by design. */
export async function signedPhotoUrl(
  bucket: BucketName,
  path: string,
  expiresInSeconds = 60 * 60,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}
