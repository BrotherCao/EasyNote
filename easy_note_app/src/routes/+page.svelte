<script lang="ts">
  import { onMount } from 'svelte';
  import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
  import MainApp from '$lib/MainApp.svelte';
  import FloatingNote from '$lib/FloatingNote.svelte';

  let windowLabel = $state<'main' | 'floating' | null>(null);

  onMount(() => {
    windowLabel = getCurrentWebviewWindow().label as 'main' | 'floating';
  });
</script>

{#if windowLabel === 'floating'}
  <FloatingNote />
{:else if windowLabel === 'main'}
  <MainApp />
{:else}
  <!-- Loading... -->
{/if}
