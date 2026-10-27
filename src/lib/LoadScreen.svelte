<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';

  const dispatch = createEventDispatcher();

  export let title = 'Load a Kit';
  // Number of configured tiles (caps how many kit sounds load)
  export let tileCount = 4;
  // loadTile(fileURL, tileIndex) -> Promise<boolean> (preset kits)
  export let loadTile = (fileURL, tileIndex) => false;
  // loadKit({ padsetId, tileCount }) -> Promise<{ loaded, skipped, errors }>
  export let loadKit = async (opts) => ({ loaded: 0, skipped: 0, errors: [] });
  // listPadsets() -> Promise<Item[]> (server kits)
  export let listPadsets = async () => [];
  // deleteKit({ padset }) -> Promise<{ deletedSounds, skippedShared, errors }>
  export let deleteKit = async (opts) => ({ deletedSounds: [], skippedShared: 0, errors: [] });

  const KIT_FOLDER = '/kits/testkit/';
  const KIT_SIZE = 8; // up to 8 one-shot sounds in a test kit

  let loading = false;
  let loadedCount = 0;

  // Server kits
  let padsets = [];
  let padsetsError = '';
  let kitLoadingId = null;
  let kitError = '';
  let deletingId = null;

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

  async function handleLoadServerKit(padset) {
    if (kitLoadingId !== null) return;
    kitLoadingId = padset.id;
    kitError = '';

    try {
      const result = await loadKit({ padsetId: padset.id, tileCount });
      // Close so App.svelte updates tileStatuses from the engine
      dispatch('close', { loaded: result.loaded });
    } catch (err) {
      kitError = (err && err.message) ? err.message : String(err);
      kitLoadingId = null;
    }
  }

  async function handleDeleteServerKit(padset) {
    if (deletingId !== null) return;
    const title = padset.title || 'Untitled';
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;

    deletingId = padset.id;
    kitError = '';

    try {
      await deleteKit(padset);
      // Remove it from the list so it disappears without a reload
      padsets = padsets.filter((p) => p.id !== padset.id);
    } catch (err) {
      kitError = (err && err.message) ? err.message : String(err);
    } finally {
      deletingId = null;
    }
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return '';
    }
  }

  async function loadPadsets() {
    try {
      padsets = await listPadsets();
      padsetsError = '';
    } catch (err) {
      padsetsError = (err && err.message) ? err.message : String(err);
    }
  }

  function handleClose() {
    dispatch('close', { loaded: loadedCount });
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' || e.key === 'Escape') handleClose();
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    loadPadsets();
  });

  onDestroy(() => window.removeEventListener('keydown', handleKeydown));
</script>

<div class="load-screen">
  <h1>{title}</h1>

  <div class="kit-list">
    <!-- Preset kit (unchanged) -->
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

    <!-- Saved kits from the server -->
    <div class="kit-section-label">Saved kits</div>

    {#if padsetsError}
      <p class="kit-error">{padsetsError}</p>
    {:else if padsets.length === 0}
      <p class="kit-meta">No saved kits yet.</p>
    {:else}
      {#each padsets as padset}
        <div class="kit-item">
          <div class="kit-info">
            <span class="kit-name">{padset.title || 'Untitled'}</span>
            <span class="kit-meta">{formatDate(padset.updatedAt || padset.createdAt)}</span>
          </div>
          <div class="kit-actions">
            <button
              class="load-button"
              on:click={() => handleLoadServerKit(padset)}
              disabled={kitLoadingId !== null || deletingId !== null}
              type="button"
            >
              {kitLoadingId === padset.id ? 'Loading…' : 'Load'}
            </button>
            <button
              class="delete-button"
              on:click={() => handleDeleteServerKit(padset)}
              disabled={kitLoadingId !== null || deletingId !== null}
              type="button"
            >
              {deletingId === padset.id ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      {/each}
    {/if}

    {#if kitError}
      <p class="kit-error">{kitError}</p>
    {/if}
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
    overflow-y: auto;
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

  .kit-section-label {
    font-size: 0.85rem;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-top: 0.5rem;
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
    min-width: 0;
  }

  .kit-name {
    font-size: 1.1rem;
    font-weight: 600;
    color: #333;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .kit-meta {
    font-size: 0.85rem;
    color: #999;
  }

  .kit-error {
    font-size: 0.9rem;
    color: #e74c3c;
    margin: 0;
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
    flex-shrink: 0;
  }

  .kit-actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .delete-button {
    background-color: #e0e0e0;
    color: #333;
    border: none;
    padding: 0.6rem 1rem;
    font-size: 0.9rem;
    font-weight: 600;
    border-radius: 50px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .delete-button[disabled] {
    opacity: 0.6;
    cursor: default;
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
