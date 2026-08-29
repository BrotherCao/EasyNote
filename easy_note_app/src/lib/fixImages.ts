import { invoke } from '@tauri-apps/api/core';

/**
 * Fix img[data-img-src] elements: read the image file as base64 data URL.
 * This bypasses the asset protocol entirely, avoiding path encoding issues.
 */
export async function fixImagesInNode(node: HTMLElement | null) {
  if (!node) return;
  const imgs = Array.from(node.querySelectorAll<HTMLImageElement>('img[data-img-src]'));
  for (const img of imgs) {
    const absPath = img.getAttribute('data-img-src');
    if (!absPath) continue;
    try {
      const dataUrl = await invoke<string>('read_file_as_base64', { path: absPath });
      img.src = dataUrl;
    } catch (e) {
      // Write error to diagnostic file
      try {
        await invoke('debug_write', { msg: 'IMG_ERR path=' + absPath + ' err=' + String(e) + '\n' });
      } catch { /* ignore */ }
      console.error('fixImages failed for', absPath, e);
    }
  }
  // Write success diagnostic
  const imgCount = imgs.length;
  if (imgCount > 0) {
    const report = imgs.map((img, i) => {
      const src = img.getAttribute('src') || '';
      const data = img.getAttribute('data-img-src') || '';
      return 'img[' + i + ']: src_len=' + src.length + ' src_prefix=' + src.substring(0, 40) + ' data-img-src=' + data + ' naturalW=' + img.naturalWidth + ' complete=' + img.complete;
    }).join('\n');
    try {
      await invoke('debug_write', { msg: 'FIX_DONE count=' + imgCount + '\n' + report + '\n' });
    } catch { /* ignore */ }
  }
}
