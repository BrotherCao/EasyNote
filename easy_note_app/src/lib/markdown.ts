import MarkdownIt from 'markdown-it';
// @ts-expect-error - markdown-it-katex has no types
import katexPlugin from 'markdown-it-katex';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  breaks: true,
});

// KaTeX math formula support ($...$ inline, $$...$$ block)
md.use(katexPlugin);

// Image renderer: store absolute path in data-img-src, fix src in post-processing (Svelte action)
const defaultImageRender = md.renderer.rules.image ||
  function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options);
  };

md.renderer.rules.image = function (tokens, idx, options, env, self) {
  const token = tokens[idx];
  const srcIndex = token.attrIndex('src');
  if (srcIndex >= 0 && token.attrs) {
    const srcVal = token.attrs[srcIndex]?.[1];
    const src = typeof srcVal === 'string' ? srcVal : '';
    if (
      src &&
      !src.startsWith('http://') &&
      !src.startsWith('https://') &&
      !src.startsWith('asset:') &&
      !src.startsWith('data:')
    ) {
      // Check if src is already an absolute path (e.g. C:\Users\... or /home/...)
      const isAbsolute = /^[A-Za-z]:[\\/]/.test(src) || src.startsWith('/');
      const noteDir = env?.noteDir as string | undefined;
      const absPath = (!isAbsolute && noteDir) ? joinPathNormalized(noteDir, src) : src;
      token.attrSet('data-img-src', absPath);
      token.attrs![srcIndex][1] = '';
    }
  }
  return defaultImageRender(tokens, idx, options, env, self);
};

function joinPathNormalized(base: string, name: string): string {
  const sep = base.includes('\\') ? '\\' : '/';
  const trimmedBase = base.replace(/[\\/]+$/, '');
  const normalizedName = name.replace(/\//g, sep).replace(/\\/g, sep);
  return trimmedBase + sep + normalizedName;
}

export function renderMarkdown(content: string, noteDir?: string): string {
  return md.render(content, { noteDir });
}
