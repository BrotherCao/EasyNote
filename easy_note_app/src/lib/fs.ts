import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { AppConfig, DirEntry } from './types';

export async function getConfig(): Promise<AppConfig> {
  return invoke<AppConfig>('get_config');
}

export async function setConfig(config: AppConfig): Promise<void> {
  await invoke('set_config', { config });
}

export async function readTextFile(path: string): Promise<string> {
  return invoke<string>('read_text_file', { path });
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  await invoke('write_text_file', { path, content });
}

export async function writeBinaryFile(path: string, data: Uint8Array): Promise<void> {
  await invoke('write_binary_file', { path, data });
}

export async function createDirAll(path: string): Promise<void> {
  await invoke('create_dir_all', { path });
}

export async function removePath(path: string): Promise<void> {
  await invoke('remove_path', { path });
}

export async function renamePath(from: string, to: string): Promise<void> {
  await invoke('rename_path', { from, to });
}

export async function listDir(path: string): Promise<DirEntry[]> {
  return invoke<DirEntry[]>('list_dir', { path });
}

export async function pathExists(path: string): Promise<boolean> {
  return invoke<boolean>('path_exists', { path });
}

export async function generateTimestampName(): Promise<string> {
  return invoke<string>('generate_timestamp_name');
}

export async function toggleFloatingWindow(): Promise<boolean> {
  return invoke<boolean>('toggle_floating_window');
}

export async function hideFloatingWindow(): Promise<void> {
  await invoke('hide_floating_window');
}

export async function pickFolder(): Promise<string | null> {
  const selected = await open({ directory: true, multiple: false });
  if (selected === null) return null;
  return typeof selected === 'string' ? selected : null;
}

export async function setCurrentNote(path: string | null): Promise<void> {
  await invoke('set_current_note', { path });
}

export async function getCurrentNote(): Promise<string | null> {
  return invoke<string | null>('get_current_note');
}
