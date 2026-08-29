import { invoke } from '@tauri-apps/api/core';

/**
 * Fix img[data-img-src] elements: read the image file as base64 data URL.
 * This bypasses the asset protocol entirely, avoiding path encoding issues.
 */
export async function fixImagesInNode(node: HTMLElement | null) {
  if (!node) return;
  const imgs = node.querySelectorAll<HTMLImageElement>('img[data-img-src]');
  const promises: Promise<void>[] = [];
  imgs.forEach((img) => {
    const absPath = img.getAttribute('data-img-src');
    if (!absPath) return;
    promises.push(
      invoke<string>('read_file_as_base64', { path: absPath })
        .then((dataUrl) => {
          img.src = dataUrl;
        })
        .catch((e) => {
          console.error('fixImages: read_file_as_base64 failed for', absPath, e);
        })
    );
  });
  await Promise.all(promises);
}
