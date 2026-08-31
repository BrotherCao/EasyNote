import { invoke } from '@tauri-apps/api/core';

export async function fixImagesInNode(node: HTMLElement | null) {
  if (!node) return;

  // 1. Fix local images (data-img-src attribute set by markdown renderer)
  const localImgs = Array.from(node.querySelectorAll<HTMLImageElement>('img[data-img-src]'));
  for (const img of localImgs) {
    const absPath = img.getAttribute('data-img-src');
    if (!absPath) continue;
    try {
      const dataUrl = await invoke<string>('read_file_as_base64', { path: absPath });
      img.src = dataUrl;
    } catch (e) {
      console.error('fixImages local failed for', absPath, e);
    }
  }

  // 2. Fix network images (http/https URLs that failed to load)
  const allImgs = Array.from(node.querySelectorAll<HTMLImageElement>('img'));
  for (const img of allImgs) {
    // Skip if already has data-img-src (handled above) or already loaded
    if (img.hasAttribute('data-img-src')) continue;
    const src = img.getAttribute('src') || '';
    if (!src.startsWith('http://') && !src.startsWith('https://')) continue;
    // Only fix if image failed to load
    if (img.naturalWidth > 0) continue;
    try {
      const resp = await fetch(src);
      const ct = resp.headers.get('content-type') || '';
      if (!ct.startsWith('image/')) {
        console.error('fixImages network: not an image, content-type:', ct, 'for', src);
        continue;
      }
      const blob = await resp.blob();
      const reader = new FileReader();
      const dataUrl: string = await new Promise((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      img.src = dataUrl;
    } catch (e) {
      console.error('fixImages network failed for', src, e);
    }
  }
}
