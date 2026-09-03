import { SWATCHES } from '../../data/swatches';

/**
 * Client tiles get a colour block so the floor recognises a regular by shape
 * and colour rather than by reading the name. It is derived from the client id,
 * never chosen: the same client is the same colour on every device, and nobody
 * has to maintain it.
 */
const ROTATION = SWATCHES.filter((swatch) => swatch.hex && !swatch.isCustom);

export function clientColorHex(clientId: string): string {
  let hash = 0;
  for (let i = 0; i < clientId.length; i += 1) {
    hash = (hash * 31 + clientId.charCodeAt(i)) >>> 0;
  }
  const swatch = ROTATION[hash % ROTATION.length];
  return swatch?.hex ?? '#8A9099';
}
