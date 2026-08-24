export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  modified: number;
}

export interface AppConfig {
  notes_root: string | null;
  theme: string;
}

export function joinPath(base: string, name: string): string {
  const sep = base.includes('\\') ? '\\' : '/';
  const trimmed = base.replace(/[\\/]+$/, '');
  return trimmed + sep + name;
}

export function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || '';
}

export function dirName(path: string): string {
  const parts = path.split(/[\\/]/);
  parts.pop();
  return parts.join('\\');
}

export function stripMdExt(name: string): string {
  return name.replace(/\.md$/i, '');
}
