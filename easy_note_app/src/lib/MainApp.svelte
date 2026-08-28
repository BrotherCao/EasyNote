<script lang="ts">
  import { onMount } from 'svelte';
  import { listen } from '@tauri-apps/api/event';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import {
    getConfig, setConfig, readTextFile, writeTextFile,
    listDir, createDirAll, removePath, renamePath,
    pathExists, pickFolder, toggleFloatingWindow,
    setCurrentNote, writeBinaryFile, generateTimestampName,
  } from '$lib/fs';
  import { renderMarkdown } from '$lib/markdown';
  import { fixImages } from '$lib/fixImages';
  import { joinPath, baseName, stripMdExt, dirName } from '$lib/types';
  import type { DirEntry, AppConfig } from '$lib/types';

  // ===== State =====
  let config = $state<AppConfig>({ notes_root: null, theme: 'system' });
  let folders = $state<DirEntry[]>([]);
  let rootNotes = $state<DirEntry[]>([]);
  let folderNotes = $state<DirEntry[]>([]);
  let selectedFolder = $state<string | null>(null);
  let selectedNote = $state<string | null>(null);
  let noteContent = $state('');
  let showSetup = $state(false);
  let showPreview = $state(true);
  let saving = $state(false);
  let lastSaved = $state<number | null>(null);
  let isLoading = $state(false);
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let currentTheme = $state('light');

  // Prompt dialog
  let promptShow = $state(false);
  let promptLabel = $state('');
  let promptValue = $state('');
  let promptResolver: ((v: string | null) => void) | null = null;

  // Confirm dialog
  let confirmShow = $state(false);
  let confirmLabel = $state('');
  let confirmResolver: ((v: boolean) => void) | null = null;

  // ===== Derived =====
  let renderedMarkdown = $derived(renderMarkdown(noteContent, selectedNote ? dirName(selectedNote) : undefined));
  let currentNoteName = $derived(selectedNote ? stripMdExt(baseName(selectedNote)) : '');
  let notes = $derived(selectedFolder ? folderNotes : rootNotes);

  // ===== Lifecycle =====
  onMount(() => {
    void init();
    // Listen for note-saved events from floating window
    const unlisten = listen<{ path: string; content: string }>('note-saved', (event) => {
      const { path, content } = event.payload;
      if (selectedNote === path && !isLoading) {
        noteContent = content;
      }
    });
    return () => { void unlisten.then((fn) => fn()); };
  });

  // ===== Init =====
  async function init() {
    config = await getConfig();
    applyTheme(config.theme);
    if (!config.notes_root || !(await pathExists(config.notes_root))) {
      showSetup = true;
      return;
    }
    try {
      await loadFolders();
    } catch (e) {
      console.error('Failed to load folders:', e);
      showSetup = true;
    }
  }

  function applyTheme(theme: string) {
    let resolved = theme;
    if (theme === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', resolved);
    currentTheme = resolved;
  }

  async function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    config.theme = next;
    await setConfig(config);
    applyTheme(next);
  }

  // ===== Folder / Note operations =====
  async function selectRootFolder() {
    const folder = await pickFolder();
    if (!folder) return;
    config.notes_root = folder;
    await setConfig(config);
    showSetup = false;
    await loadFolders();
  }

  async function loadFolders() {
    if (!config.notes_root) return;
    const entries = await listDir(config.notes_root);
    folders = entries.filter((e) => e.is_dir);
    rootNotes = entries.filter((e) => !e.is_dir && e.name.toLowerCase().endsWith('.md'));
  }

  async function selectFolder(path: string | null) {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (selectedNote && !isLoading) {
      try { await doSave(); } catch { /* ignore */ }
    }
    selectedFolder = path;
    selectedNote = null;
    noteContent = '';
    await setCurrentNote(null);
    if (path) {
      const entries = await listDir(path);
      folderNotes = entries.filter((e) => !e.is_dir && e.name.toLowerCase().endsWith('.md'));
    } else if (config.notes_root) {
      const entries = await listDir(config.notes_root);
      rootNotes = entries.filter((e) => !e.is_dir && e.name.toLowerCase().endsWith('.md'));
    }
  }

  async function selectNote(path: string) {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (selectedNote && !isLoading) {
      try { await doSave(); } catch { /* ignore */ }
    }
    isLoading = true;
    selectedNote = path;
    noteContent = await readTextFile(path);
    isLoading = false;
    await setCurrentNote(path);
  }

  // ===== Editor / Save =====
  function onEditorInput() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void doSave(), 500);
  }

  function onEditorKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      void doSave();
    }
  }

  async function onEditorBlur() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    await doSave();
  }

  async function doSave() {
    if (!selectedNote || isLoading) return;
    saving = true;
    try {
      await writeTextFile(selectedNote, noteContent);
      lastSaved = Date.now();
      // Broadcast to floating window so it can sync
      const { emit } = await import('@tauri-apps/api/event');
      await emit('note-saved', { path: selectedNote, content: noteContent });
    } catch (e) {
      console.error('Save failed:', e);
    }
    saving = false;
  }

  // ===== CRUD =====
  async function newFolder() {
    const name = await showPrompt('文件夹名称', '新文件夹');
    if (!name || !config.notes_root) return;
    const p = joinPath(config.notes_root, name);
    try {
      await createDirAll(p);
      await loadFolders();
    } catch (e) {
      console.error('Create folder failed:', e);
    }
  }

  async function deleteFolder(path: string) {
    const ok = await showConfirm(`确认删除文件夹？\n${path}`);
    if (!ok) return;
    try {
      await removePath(path);
      if (selectedFolder === path) {
        selectedFolder = null;
        folderNotes = [];
      }
      await loadFolders();
    } catch (e) {
      console.error('Delete folder failed:', e);
    }
  }

  async function newNote() {
    if (!config.notes_root) return;
    const name = await showPrompt('笔记名称', '未命名');
    if (!name) return;
    const folder = selectedFolder || config.notes_root;
    const p = joinPath(folder, name + '.md');
    try {
      await writeTextFile(p, `# ${name}\n\n`);
      await selectFolder(selectedFolder);
      await selectNote(p);
    } catch (e) {
      console.error('Create note failed:', e);
    }
  }

  async function deleteNote(path: string) {
    const ok = await showConfirm(`确认删除笔记？\n${baseName(path)}`);
    if (!ok) return;
    try {
      await removePath(path);
      if (selectedNote === path) {
        selectedNote = null;
        noteContent = '';
      }
      await selectFolder(selectedFolder);
    } catch (e) {
      console.error('Delete note failed:', e);
    }
  }

  async function renameNote(path: string) {
    const oldName = stripMdExt(baseName(path));
    const newName = await showPrompt('新名称', oldName);
    if (!newName || newName === oldName) return;
    const dir = dirName(path);
    const newPath = joinPath(dir, newName + '.md');
    try {
      await renamePath(path, newPath);
      const wasSelected = selectedNote === path;
      await selectFolder(selectedFolder);
      if (wasSelected) await selectNote(newPath);
    } catch (e) {
      console.error('Rename note failed:', e);
    }
  }

  // ===== External links =====
  function onPreviewClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    const link = target.closest('a');
    if (!link) return;
    e.preventDefault();
    const href = link.getAttribute('href');
    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      void openUrl(href);
    }
  }

  // ===== Image paste =====
  async function onPaste(e: ClipboardEvent) {
    if (!selectedNote || !config.notes_root) return;
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;

        const ext = blob.type.split('/')[1] || 'png';
        const ts = await generateTimestampName();
        const imgDir = joinPath(dirName(selectedNote), 'images');
        await createDirAll(imgDir);
        const imgName = `${ts}.${ext}`;
        const imgPath = joinPath(imgDir, imgName);

        const arrayBuffer = await blob.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);
        await writeBinaryFile(imgPath, uint8);

        const mdLink = `![image](images/${imgName})`;
        const textarea = document.querySelector('.editor-pane textarea') as HTMLTextAreaElement | null;
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

  // ===== Prompt / Confirm dialogs =====
  function showPrompt(label: string, defaultVal = ''): Promise<string | null> {
    return new Promise((resolve) => {
      promptLabel = label;
      promptValue = defaultVal;
      promptResolver = resolve;
      promptShow = true;
      setTimeout(() => {
        const inp = document.querySelector('.modal-dialog input') as HTMLInputElement | null;
        if (inp) { inp.focus(); inp.select(); }
      }, 50);
    });
  }

  function confirmPrompt() {
    promptShow = false;
    if (promptResolver) { promptResolver(promptValue); promptResolver = null; }
  }
  function cancelPrompt() {
    promptShow = false;
    if (promptResolver) { promptResolver(null); promptResolver = null; }
  }

  function showConfirm(label: string): Promise<boolean> {
    return new Promise((resolve) => {
      confirmLabel = label;
      confirmResolver = resolve;
      confirmShow = true;
    });
  }
  function confirmYes() {
    confirmShow = false;
    if (confirmResolver) { confirmResolver(true); confirmResolver = null; }
  }
  function confirmNo() {
    confirmShow = false;
    if (confirmResolver) { confirmResolver(false); confirmResolver = null; }
  }

  // ===== Helpers =====
  function formatTime(ts: number): string {
    if (!ts) return '';
    const diff = Date.now() / 1000 - ts;
    if (diff < 60) return '刚刚';
    if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
    if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
    const d = new Date(ts * 1000);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
</script>

<svelte:window on:paste={onPaste} />

<!-- ===== Setup screen ===== -->
{#if showSetup}
  <div class="setup-screen">
    <div class="setup-icon">📝</div>
    <h1>欢迎使用 EasyNote</h1>
    <p>请选择一个文件夹作为笔记根目录。所有笔记将以 .md 文件形式存储在此目录下，可用任何编辑器打开。</p>
    <button class="btn btn-primary" onclick={selectRootFolder}>选择笔记目录</button>
  </div>
{:else}
  <div class="app-layout">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-header">
        <h2>EasyNote</h2>
        <button class="btn-icon" onclick={() => void toggleFloatingWindow()} title="快捷笔记 (Ctrl+Shift+N)">📌</button>
      </div>

      <div class="sidebar-scroll">
        <!-- Folders -->
        <div class="sidebar-section-label">
          <span>文件夹</span>
          <button class="btn-icon btn-sm" onclick={newFolder} title="新建文件夹">+</button>
        </div>

        <div
          class="sidebar-item"
          class:selected={selectedFolder === null}
          onclick={() => void selectFolder(null)}
          onkeydown={(e) => { if (e.key === 'Enter') void selectFolder(null); }}
          role="button"
          tabindex="0"
        >
          <span class="item-icon">📂</span>
          <span class="item-name">全部笔记</span>
          <span class="item-meta">{rootNotes.length}</span>
        </div>

        {#each folders as folder (folder.path)}
          <div
            class="sidebar-item"
            class:selected={selectedFolder === folder.path}
            onclick={() => void selectFolder(folder.path)}
            onkeydown={(e) => { if (e.key === 'Enter') void selectFolder(folder.path); }}
            role="button"
            tabindex="0"
          >
            <span class="item-icon">📁</span>
            <span class="item-name">{folder.name}</span>
            <span class="item-actions">
              <button
                class="btn-icon btn-sm"
                onclick={(e) => { e.stopPropagation(); void deleteFolder(folder.path); }}
                title="删除文件夹"
              >✕</button>
            </span>
          </div>
        {/each}

        <!-- Notes -->
        <div class="sidebar-section-label">
          <span>笔记 {#if selectedFolder}— {folders.find(f => f.path === selectedFolder)?.name || ''}{/if}</span>
          <button class="btn-icon btn-sm" onclick={newNote} title="新建笔记">+</button>
        </div>

        {#each notes as note (note.path)}
          <div
            class="sidebar-item"
            class:selected={selectedNote === note.path}
            onclick={() => void selectNote(note.path)}
            ondblclick={() => void renameNote(note.path)}
            role="button"
            tabindex="0"
            onkeydown={(e) => { if (e.key === 'Enter') void selectNote(note.path); }}
          >
            <span class="item-icon">📄</span>
            <span class="item-name">{stripMdExt(note.name)}</span>
            <span class="item-meta">{formatTime(note.modified)}</span>
            <span class="item-actions">
              <button
                class="btn-icon btn-sm"
                onclick={(e) => { e.stopPropagation(); void deleteNote(note.path); }}
                title="删除笔记"
              >✕</button>
            </span>
          </div>
        {:else}
          <div style="padding: 12px; font-size: 12px; color: var(--fg-tertiary);">暂无笔记</div>
        {/each}
      </div>
    </aside>

    <!-- Main content -->
    <main class="main-content">
      {#if selectedNote}
        <div class="toolbar">
          <div class="toolbar-left">
            <span class="note-title">{currentNoteName}</span>
          </div>
          <div class="toolbar-right">
            <button class="btn-icon" onclick={() => showPreview = !showPreview} title={showPreview ? '隐藏预览' : '显示预览'}>
              {showPreview ? '👁' : '👁‍🗨'}
            </button>
            <button class="btn-icon" onclick={() => void toggleTheme()} title="切换主题">
              {currentTheme === 'dark' ? '☀' : '🌙'}
            </button>
          </div>
        </div>

        <div class="editor-preview" class:hidden-preview={!showPreview}>
          <div class="editor-pane">
            <textarea
              bind:value={noteContent}
              oninput={onEditorInput}
              onblur={() => void onEditorBlur()}
              onkeydown={onEditorKeydown}
              placeholder="输入 Markdown..."
              spellcheck="false"
            ></textarea>
          </div>
          <div class="preview-pane" onclick={onPreviewClick}>
            <div class="markdown-body" use:fixImages>{@html renderedMarkdown}</div>
          </div>
        </div>

        <div class="status-bar">
          <span>
            {#if saving}保存中...{:else if lastSaved}✓ 已保存{:else}{/if}
          </span>
          <span>{noteContent.length} 字符</span>
        </div>
      {:else}
        <div class="empty-state">
          <div class="empty-icon">📝</div>
          <div class="empty-text">选择或创建一个笔记开始编辑</div>
          <div class="empty-sub" style="font-size: 12px; margin-top: 4px;">双击笔记名可重命名 · Ctrl+S 保存 · Ctrl+Shift+N 打开快捷笔记</div>
        </div>
      {/if}
    </main>
  </div>
{/if}

<!-- ===== Prompt dialog ===== -->
{#if promptShow}
  <div class="modal-overlay" onclick={cancelPrompt}>
    <div class="modal-dialog" onclick={(e) => e.stopPropagation()} role="dialog">
      <p class="modal-label">{promptLabel}</p>
      <input
        type="text"
        bind:value={promptValue}
        onkeydown={(e) => {
          if (e.key === 'Enter') confirmPrompt();
          if (e.key === 'Escape') cancelPrompt();
        }}
      />
      <div class="modal-actions">
        <button class="btn" onclick={cancelPrompt}>取消</button>
        <button class="btn btn-primary" onclick={confirmPrompt}>确定</button>
      </div>
    </div>
  </div>
{/if}

<!-- ===== Confirm dialog ===== -->
{#if confirmShow}
  <div class="modal-overlay" onclick={confirmNo}>
    <div class="modal-dialog" onclick={(e) => e.stopPropagation()} role="dialog">
      <p class="modal-label" style="white-space: pre-line;">{confirmLabel}</p>
      <div class="modal-actions">
        <button class="btn" onclick={confirmNo}>取消</button>
        <button class="btn btn-danger" onclick={confirmYes}>删除</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }
  .modal-dialog {
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-lg);
    padding: 20px;
    min-width: 340px;
    max-width: 460px;
  }
  .modal-label {
    margin-bottom: 12px;
    font-size: 14px;
    color: var(--fg);
  }
  .modal-dialog input {
    width: 100%;
    padding: 8px 12px;
    margin-bottom: 16px;
    font-size: 14px;
  }
  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .item-meta {
    font-size: 11px;
    color: var(--fg-tertiary);
    flex-shrink: 0;
  }
  .empty-sub {
    color: var(--fg-tertiary);
  }
</style>
