/**
 * Unit logos as the tracker keeps them: small data URLs on the unit registry.
 * The season lives in localStorage, so an upload is shrunk to what the largest
 * rankings card plate draws at full resolution before it is stored.
 */

/** Decode an image from a URL. */
export const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file is not an image.'));
    img.src = src;
  });

/** Read a picked image file into a data URL no larger than `max` on a side. */
export async function readLogoFile(file: File, max = 256): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    // An SVG with no size of its own reports 0; draw it at full size.
    const iw = img.naturalWidth || max;
    const ih = img.naturalHeight || max;
    const k = Math.min(1, max / Math.max(iw, ih));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(iw * k));
    canvas.height = Math.max(1, Math.round(ih * k));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    // WebP where the browser can write it, else PNG; both keep transparency.
    const webp = canvas.toDataURL('image/webp', 0.9);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
