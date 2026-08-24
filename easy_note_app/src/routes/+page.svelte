<script lang="ts">
  import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
  import MainApp from '$lib/MainApp.svelte';
  import FloatingNote from '$lib/FloatingNote.svelte';

  const label = getCurrentWebviewWindow().label;
</script>

{#if label === 'floating'}
  <FloatingNote />
{:else}
  <MainApp />
{/if}
