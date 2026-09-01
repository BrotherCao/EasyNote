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

  // ===== Image fix: MutationObserver on preview element =====
  let previewEl = $state<HTMLDivElement | null>(null);
  let imgObserver: MutationObserver | null = null;

  $effect(() => {
    renderedMarkdown;
    if (previewEl) {
      if (imgObserver) { imgObserver.disconnect(); imgObserver = null; }
      setTimeout(() => void fixImagesInNode(previewEl), 50);
      imgObserver = new MutationObserver(() => {
        setTimeout(() => void fixImagesInNode(previewEl), 50);
      });
      imgObserver.observe(previewEl, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-img-src'] });
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
      <button
        class="btn-icon"
        title="语法速查"
        onclick={() => { const e = document.getElementById('floating-syntax-help'); if (e) e.style.display = e.style.display === 'none' ? 'block' : 'none'; }}
      >
        ❓
      </button>
      <button class="btn-icon" onclick={() => void close()} title="关闭 (Esc)">✕</button>
    </div>
  </div>

  <div id="floating-syntax-help" style="display:none">
    <div class="syntax-help-overlay" onclick={() => { if (event.target === document.getElementById('floating-syntax-help')?.querySelector('.syntax-help-overlay')) { document.getElementById('floating-syntax-help')!.style.display = 'none'; } }}>
      <div class="syntax-help-panel" onclick={(e) => e.stopPropagation()}>
        <div class="syntax-help-header">
          <span>📋 语法速查</span>
          <button class="btn-icon" onclick={() => { const e = document.getElementById('floating-syntax-help'); if (e) e.style.display = 'none'; }}>✕</button>
        </div>
        <div class="syntax-help-body">
          <div class="syntax-section">
            <div class="syntax-section-title">基础</div>
            <div class="syntax-item"><code># H1</code><span class="syntax-desc">标题</span></div>
            <div class="syntax-item"><code>**粗**</code><span class="syntax-desc"><b>粗体</b></span></div>
            <div class="syntax-item"><code>*斜*</code><span class="syntax-desc"><i>斜体</i></span></div>
            <div class="syntax-item"><code>~~删~~</code><span class="syntax-desc"><s>删除</s></span></div>
            <div class="syntax-item"><code>- 项</code><span class="syntax-desc">列表</span></div>
            <div class="syntax-item"><code>- [ ]</code><span class="syntax-desc">待办</span></div>
            <div class="syntax-item"><code>![](url)</code><span class="syntax-desc">图片</span></div>
            <div class="syntax-item"><code>[](url)</code><span class="syntax-desc">链接</span></div>
            <div class="syntax-item"><code>```py</code><span class="syntax-desc">代码块</span></div>
          </div>
          <div class="syntax-section">
            <div class="syntax-section-title">公式</div>
            <div class="syntax-item"><code>$E=mc^2$</code><span class="syntax-desc">行内</span></div>
            <div class="syntax-item"><code>$$..$$</code><span class="syntax-desc">块级</span></div>
            <div class="syntax-item"><code>\frac{a}{b}</code><span class="syntax-desc">分数</span></div>
            <div class="syntax-item"><code>\sqrt{x}</code><span class="syntax-desc">根号</span></div>
            <div class="syntax-item"><code>\sum_{i=1}^n</code><span class="syntax-desc">求和</span></div>
            <div class="syntax-item"><code>\int_a^b</code><span class="syntax-desc">积分</span></div>
            <div class="syntax-item"><code>x^{n}</code><span class="syntax-desc">上标</span></div>
            <div class="syntax-item"><code>x_{n}</code><span class="syntax-desc">下标</span></div>
            <div class="syntax-item"><code>\alpha \beta</code><span class="syntax-desc">α β</span></div>
          </div>
        </div>
      </div>
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
  .syntax-help-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  }
  .syntax-help-panel {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    width: 300px;
    max-height: 400px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .syntax-help-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    font-size: 12px;
    font-weight: 600;
  }
  .syntax-help-body {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 16px;
  }
  .syntax-section {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .syntax-section-title {
    font-size: 11px;
    font-weight: 700;
    color: var(--accent);
    margin-bottom: 2px;
    padding-bottom: 2px;
    border-bottom: 1px solid var(--border);
  }
  .syntax-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    font-size: 11px;
    padding: 1px 0;
  }
  .syntax-item code {
    font-family: var(--font-mono);
    font-size: 10px;
    padding: 1px 4px;
    background: var(--bg-tertiary);
    border-radius: 3px;
    white-space: nowrap;
  }
  .syntax-desc {
    font-size: 10px;
    color: var(--fg-secondary);
    text-align: right;
    flex-shrink: 0;
  }
</style>
