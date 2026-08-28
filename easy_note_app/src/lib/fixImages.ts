import { convertFileSrc } from '@tauri-apps/api/core';

/**
 * Svelte action: find all [data-img-src] elements in the node,
 * convert their disk path to an asset protocol URL, and set as src.
 * This runs AFTER DOM rendering, so Tauri internals are guaranteed available.
 */
export function fixImages(node: HTMLElement) {
  function resolve() {
    const imgs = node.querySelectorAll<HTMLImageElement>('img[data-img-src]');
    imgs.forEach((img) => {
      const absPath = img.getAttribute('data-img-src');
      if (!absPath) return;
      try {
        const url = convertFileSrc(absPath);
        img.src = url;
      } catch (e) {
        console.error('fixImages: convertFileSrc failed for', absPath, e);
      }
    });
  }

  // Resolve on next tick (after DOM is painted)
  const id = setTimeout(resolve, 0);

  return {
    update() {
      clearTimeout(id);
      setTimeout(resolve, 0);
    },
    destroy() {
      clearTimeout(id);
    },
  };
}
