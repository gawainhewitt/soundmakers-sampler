<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';

  const dispatch = createEventDispatcher();

  export let title = 'Load a Kit';
  // Number of configured tiles (caps how many kit sounds load)
  export let tileCount = 4;
  // loadTile(fileURL, tileIndex) -> Promise<boolean>
  export let loadTile = (fileURL, tileIndex) => false;

  const KIT_FOLDER = '/kits/testkit/';
  const KIT_SIZE = 8; // up to 8 one-shot sounds in a test kit

  let loading = false;
  let loadedCount = 0;

  async function handleLoadKit() {
    if (loading) return;
    loading = true;
    loadedCount = 0;

    // Load up to the number of configured tiles (sounds beyond that are skipped)
    const limit = Math.min(KIT_SIZE, tileCount);

    for (let i = 0; i < limit; i++) {
      const ok = await loadTile(KIT_FOLDER + (i + 1) + '.wav', i);
      if (ok) loadedCount++;
    }

    loading = false;
  }

  function handleClose() {
    dispatch('close', { loaded: loadedCount });
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' || e.key === 'Escape') handleClose();
  }

  onMount(() => window.addEventListener('keydown', handleKeydown));
  onDestroy(() => window.removeEventListener('keydown', handleKeydown));
</script>

<div class="load-screen">
  <h1>{title}</h1>

  <div class="kit-list">
    <div class="kit-item">
      <div class="kit-info">
        <span class="kit-name">Test Kit</span>
        <span class="kit-meta">
          {#if loading}
            Loading…
          {:else}
            {loadedCount > 0 ? (loadedCount + ' sounds loaded') : (tileCount + ' tiles')}
          {/if}
        </span>
      </div>
      <button class="load-button" on:click={handleLoadKit} disabled={loading} type="button">
        {loading ? 'Loading…' : 'Load'}
      </button>
    </div>
  </div>

  <button class="close-button" on:click={handleClose}>Close</button>
</div>

<style>
  .load-screen {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: white;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2rem;
    z-index: 9999;
  }

  h1 {
    font-size: 2.5rem;
    color: #333;
    margin: 0;
  }

  .kit-list {
    width: 100%;
    max-width: 360px;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .kit-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 1rem;
    border: 2px solid #eee;
    border-radius: 12px;
  }

  .kit-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .kit-name {
    font-size: 1.1rem;
    font-weight: 600;
    color: #333;
  }

  .kit-meta {
    font-size: 0.85rem;
    color: #999;
  }

  .load-button {
    background-color: #06C0F0;
    color: white;
    border: none;
    padding: 0.6rem 1.5rem;
    font-size: 1rem;
    font-weight: 600;
    border-radius: 50px;
    cursor: pointer;
  }

  .load-button[disabled] {
    opacity: 0.6;
    cursor: default;
  }

  .close-button {
    background-color: #06C0F0;
    color: white;
    border: none;
    padding: 1rem 3rem;
    font-size: 1.2rem;
    font-weight: 600;
    border-radius: 50px;
    cursor: pointer;
  }
</style>