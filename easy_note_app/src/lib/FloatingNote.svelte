<script lang="ts">
  import { onMount } from 'svelte';
  import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
  import {
    getCurrentNote, readTextFile, writeTextFile, hideFloatingWindow,
  } from '$lib/fs';
  import { renderMarkdown } from '$lib/markdown';
  import { baseName, stripMdExt } from '$lib/types';

  // ===== State =====
  let currentNotePath = $state<string | null>(null);
  let loadedNotePath: string | null = null;
  let noteContent = $state('');
  let noteName = $state('');
  let showPreview = $state(false);
  let saving = $state(false);
  let lastSaved = $state<number | null>(null);
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let win = getCurrentWebviewWindow();

  let renderedMarkdown = $derived(renderMarkdown(noteContent));

  onMount(() => {
    let unlisten: (() => void) | undefined;

    const setup = async () => {
      unlisten = await win.onFocusChanged(({ payload: focused }) => {
        if (focused) void loadCurrentNote();
      });
      await loadCurrentNote();
    };

    void setup();
    return () => { unlisten?.(); };
  });

  // ===== Dragging =====
  function onTitlebarMousedown(e: MouseEvent) {
    // Only start drag on left-click, not on buttons
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
</script>

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
          <div class="markdown-body">{@html renderedMarkdown}</div>
        </div>
      {:else}
        <textarea
          bind:value={noteContent}
          oninput={onInput}
          onblur={() => void doSave()}
          onkeydown={onKeydown}
          placeholder="输入 Markdown..."
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
