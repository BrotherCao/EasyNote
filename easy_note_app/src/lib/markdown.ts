import MarkdownIt from 'markdown-it';
import { convertFileSrc } from '@tauri-apps/api/core';
import { joinPath } from './types';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true,
});

// Default render for image: convert relative paths to asset protocol URLs
const defaultImageRender = md.renderer.rules.image ||
  function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options);
  };

md.renderer.rules.image = function (tokens, idx, options, env, self) {
  const token = tokens[idx];
  const srcIndex = token.attrIndex('src');
  if (srcIndex >= 0) {
    let src = token.attrs?.[srcIndex]?.[1] || '';
    // Only convert relative paths (not http URLs, not absolute paths starting with asset:)
    if (
      src &&
      !src.startsWith('http://') &&
      !src.startsWith('https://') &&
      !src.startsWith('asset:') &&
      !src.startsWith('data:')
    ) {
      // Resolve relative to note directory if available
      const noteDir = env?.noteDir as string | undefined;
      if (noteDir) {
        const absPath = joinPath(noteDir, src);
        try {
          src = convertFileSrc(absPath);
        } catch {
          // convertFileSrc not available (e.g., in SSR), keep original
        }
      }
      token.attrs![srcIndex][1] = src;
    }
  }
  return defaultImageRender(tokens, idx, options, env, self);
};

export function renderMarkdown(content: string, noteDir?: string): string {
  return md.render(content, { noteDir });
}
