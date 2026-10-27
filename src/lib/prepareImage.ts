import { FIGURE_MAX_BYTES, FIGURE_MAX_SIDE, FIGURE_TYPES } from '../community/figures';

// A picture chosen in the proposal editor, made ready to propose: one of the
// kinds the atlas takes, its longest side at most FIGURE_MAX_SIDE and its file
// at most FIGURE_MAX_BYTES. A large photo is scaled down and re-encoded (WebP,
// or JPEG where the browser can't write WebP); a small one is kept as it is,
// so a diagram stays sharp. A GIF is never re-encoded (it may move).

const readAsDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

const bytesOf = (dataUrl: string) => Math.floor(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4);

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('unreadable'));
    img.src = src;
  });

export async function prepareImage(file: File): Promise<{ data: string } | { problem: string }> {
  const max = `${FIGURE_MAX_BYTES / 1_000_000} MB`;
  if (!(Object.values(FIGURE_TYPES) as string[]).includes(file.type))
    return { problem: `“${file.name}” isn't a PNG, JPEG, WebP or GIF picture.` };
  const original = await readAsDataUrl(file);
  if (file.type === 'image/gif')
    return file.size <= FIGURE_MAX_BYTES ? { data: original } : { problem: `“${file.name}” is larger than ${max} — GIFs can't be made smaller here.` };
  let img: HTMLImageElement;
  try {
    img = await loadImage(original);
  } catch {
    return { problem: `“${file.name}” couldn't be read as a picture.` };
  }
  const scale = Math.min(1, FIGURE_MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  if (scale === 1 && file.size <= FIGURE_MAX_BYTES) return { data: original };
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
  for (const [type, quality] of [
    ['image/webp', 0.85],
    ['image/jpeg', 0.85],
    ['image/webp', 0.7],
    ['image/jpeg', 0.7],
  ] as const) {
    const data = canvas.toDataURL(type, quality);
    // A browser that can't write the type gives a PNG instead: try the next.
    if (data.startsWith(`data:${type}`) && bytesOf(data) <= FIGURE_MAX_BYTES) return { data };
  }
  return { problem: `“${file.name}” is still larger than ${max} once made smaller — try a smaller picture.` };
}
