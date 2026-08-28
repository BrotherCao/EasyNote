import { convertFileSrc } from '@tauri-apps/api/core';

/**
 * Fix img[data-img-src] elements: convert disk path to asset protocol URL.
 * Call this after the markdown HTML is rendered.
 */
export function fixImagesInNode(node: HTMLElement | null) {
  if (!node) return;
  const imgs = node.querySelectorAll<HTMLImageElement>('img[data-img-src]');
  imgs.forEach((img) => {
    const absPath = img.getAttribute('data-img-src');
    if (!absPath) return;
    try {
      // Normalize backslashes to forward slashes for cleaner asset URL
      const normalized = absPath.replace(/\\/g, '/');
      img.src = convertFileSrc(normalized);
    } catch (e) {
      console.error('fixImages: convertFileSrc failed for', absPath, e);
    }
  });
}
