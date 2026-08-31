import { invoke } from '@tauri-apps/api/core';

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
      console.error('fixImages failed for', absPath, e);
    }
  }
}
