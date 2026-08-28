<script lang="ts">
  import { onMount } from 'svelte';
  import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
  import { listen, emit } from '@tauri-apps/api/event';
  import {
    getCurrentNote, readTextFile, writeTextFile, writeBinaryFile,
    createDirAll, hideFloatingWindow, generateTimestampName,
  } from '$lib/fs';
  import { getConfig } from '$lib/fs';
  import { renderMarkdown } from '$lib/markdown';
  import { fixImagesInNode } from '$lib/fixImages';
  import { baseName, stripMdExt, joinPath, dirName } from '$lib/types';
  import type { AppConfig } from '$lib/types';

  // ===== State =====
  let config = $state<AppConfig>({ notes_root: null, theme: 'system' });
  let currentNotePath = $state<string | null>(null);
  let loadedNotePath: string | null = null;
  let noteContent = $state('');
  let noteName = $state('');
  let showPreview = $state(false);
  let saving = $state(false);
  let lastSaved = $state<number | null>(null);
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let win = getCurrentWebviewWindow();

  let renderedMarkdown = $derived(renderMarkdown(noteContent, currentNotePath ? dirName(currentNotePath) : undefined));

  // ===== Effect: fix image srcs after markdown re-renders =====
  let previewEl = $state<HTMLDivElement | null>(null);
  $effect(() => {
    renderedMarkdown;
    if (previewEl) {
      setTimeout(() => fixImagesInNode(previewEl), 0);
    }
  });

  onMount(() => {
    let unlistenFocus: (() => void) | undefined;
    let unlistenHide: (() => void) | undefined;
    let unlistenSync: (() => void) | undefined;

    const setup = async () => {
      config = await getConfig();
      unlistenFocus = await win.onFocusChanged(({ payload: focused }) => {
        if (focused) void loadCurrentNote();
        else void doSave();
      });
      unlistenHide = await win.onCloseRequested(() => {
        void doSave();
      });
      // Listen for note-saved events from main window
      unlistenSync = await listen<{ path: string; content: string }>('note-saved', (event) => {
        const { path, content } = event.payload;
        if (currentNotePath === path) {
          loadedNotePath = path; // prevent reload from getCurrentNote on next focus
          noteContent = content;
        }
      });
      await loadCurrentNote();
    };

    void setup();
    return () => { unlistenFocus?.(); unlistenHide?.(); unlistenSync?.(); };
  });

  // ===== Dragging =====
  function onTitlebarMousedown(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    if (e.buttons === 1) {
      void win.startDragging();
    }
  }

  // ===== Load current note (called on focus) =====
  async function loadCurrentNote() {
    const path = await getCurrentNote();
    if (path === loadedNotePath) return;

    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (currentNotePath && noteContent) {
      try { await doSave(); } catch { /* ignore */ }
    }

    loadedNotePath = path;
    if (path) {
      try {
        currentNotePath = path;
        noteContent = await readTextFile(path);
        noteName = stripMdExt(baseName(path));
      } catch (e) {
        console.error('Failed to load note:', e);
        currentNotePath = null;
        noteContent = '';
        noteName = '';
      }
    } else {
      currentNotePath = null;
      noteContent = '';
      noteName = '';
    }
  }

  // ===== Editor / Save =====
  function onInput() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void doSave(), 500);
  }

  function onKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      void doSave();
    }
    if (e.key === 'Escape') {
      void close();
    }
  }

  async function doSave() {
    if (!currentNotePath) return;
    saving = true;
    try {
      await writeTextFile(currentNotePath, noteContent);
      lastSaved = Date.now();
      // Broadcast to main window so it can sync
      await emit('note-saved', { path: currentNotePath, content: noteContent });
    } catch (e) {
      console.error('Save failed:', e);
    }
    saving = false;
  }

  async function close() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    await doSave();
    await hideFloatingWindow();
  }

  // ===== Image paste =====
  async function onPaste(e: ClipboardEvent) {
    if (!currentNotePath || !config.notes_root) return;
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;

        const ext = blob.type.split('/')[1] || 'png';
        const ts = await generateTimestampName();
        const imgDir = joinPath(dirName(currentNotePath), 'images');
        await createDirAll(imgDir);
        const imgName = `${ts}.${ext}`;
        const imgPath = joinPath(imgDir, imgName);

        const arrayBuffer = await blob.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);
        await writeBinaryFile(imgPath, uint8);

        const mdLink = `![image](images/${imgName})`;
        const textarea = document.querySelector('.floating-editor textarea') as HTMLTextAreaElement | null;
        if (textarea) {
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          noteContent = noteContent.slice(0, start) + mdLink + '\n' + noteContent.slice(end);
          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = start + mdLink.length + 1;
          }, 0);
        } else {
          noteContent += '\n' + mdLink + '\n';
        }
        void doSave();
      }
    }
  }
</script>

<svelte:window on:paste={onPaste} />

<div class="floating-container">
  <!-- Custom title bar -->
  <div class="floating-titlebar" onmousedown={onTitlebarMousedown}>
    <div class="title-drag-area">
      <span class="title-text">📌 {noteName || 'EasyNote'}</span>
    </div>
    <div class="title-actions">
      <button
        class="btn-icon"
        onclick={() => showPreview = !showPreview}
        title={showPreview ? '编辑' : '预览'}
      >
        {showPreview ? '✏️' : '👁'}
      </button>
      <button class="btn-icon" onclick={() => void close()} title="关闭 (Esc)">✕</button>
    </div>
  </div>

  {#if currentNotePath}
    <div class="floating-editor">
      {#if showPreview}
        <div class="floating-preview">
          <div class="markdown-body" bind:this={previewEl}>{@html renderedMarkdown}</div>
        </div>
      {:else}
        <textarea
          bind:value={noteContent}
          oninput={onInput}
          onblur={() => void doSave()}
          onkeydown={onKeydown}
          placeholder="输入 Markdown... (Ctrl+V 粘贴图片)"
          spellcheck="false"
        ></textarea>
      {/if}
    </div>

    <div class="floating-statusbar">
      <span>
        {#if saving}保存中...{:else if lastSaved}✓ 已保存{:else}{noteContent.length} 字符{/if}
      </span>
      <span style="font-size: 10px;">Ctrl+S 保存 · Esc 关闭</span>
    </div>
  {:else}
    <div class="floating-editor">
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <div class="empty-text">请先在主窗口选择一个笔记</div>
      </div>
    </div>
  {/if}
</div>

<style>
  .floating-titlebar {
    display: flex;
    align-items: center;
    padding: 4px 4px 4px 12px;
    background: var(--bg-tertiary);
    border-bottom: 1px solid var(--border);
    user-select: none;
    min-height: 32px;
    cursor: default;
  }
  .title-drag-area {
    flex: 1;
    display: flex;
    align-items: center;
    min-width: 0;
    overflow: hidden;
    cursor: grab;
  }
  .title-drag-area:active {
    cursor: grabbing;
  }
  .title-actions {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
  }
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 8px;
    color: var(--fg-tertiary);
  }
  .empty-icon { font-size: 28px; }
  .empty-text { font-size: 13px; }
</style>
