<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';

  const dispatch = createEventDispatcher();

  export let title = 'Load a Kit';
  // Number of configured tiles (caps how many kit sounds load)
  export let tileCount = 4;
  // loadKit({ padsetId, tileCount }) -> Promise<{ loaded, skipped, errors }>
  export let loadKit = async (opts) => ({ loaded: 0, skipped: 0, errors: [] });
  // listPadsets() -> Promise<Item[]> (server kits)
  export let listPadsets = async () => [];
  // listPadsetPage({ page, perPage }) -> Promise<{ items, hasMore }>
  export let listPadsetPage = async (opts) => ({ items: [], hasMore: false });
  // deleteKit({ padset }) -> Promise<{ deletedSounds, skippedShared, errors }>
  export let deleteKit = async (opts) => ({ deletedSounds: [], skippedShared: 0, errors: [] });
  // renameKit({ padset, title }) -> Promise<item>
  export let renameKit = async (opts) => ({});

  // Server kits
  let padsets = [];
  let padsetsError = '';
  let page = 1;
  let hasMore = false;
  let kitLoadingId = null;
  let kitError = '';
  let deletingId = null;
  let renamingId = null;
  let renameValue = '';
  let renameBusy = false;

  async function handleLoadServerKit(padset) {
    if (kitLoadingId !== null) return;
    kitLoadingId = padset.id;
    kitError = '';

    try {
      const result = await loadKit({ padsetId: padset.id, tileCount });
      // Close so App.svelte updates tileStatuses and currentKit.
      dispatch('close', {
        loaded: result.loaded,
        padsetId: padset.id,
        title: padset.title || '',
      });
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
      // Reload the current page so it refills to 4 kits when more exist.
      await loadPage(page);
      // If that page is now empty and we're not on the first page, step back.
      if (padsets.length === 0 && page > 1) {
        await loadPage(page - 1);
      }
    } catch (err) {
      kitError = (err && err.message) ? err.message : String(err);
    } finally {
      deletingId = null;
    }
  }

  function startRename(padset) {
    if (renamingId !== null || renamingId === padset.id) return;
    renamingId = padset.id;
    renameValue = padset.title || '';
    renameBusy = false;
    kitError = '';
    // Focus the input after it renders
    requestAnimationFrame(() => {
      const input = document.querySelector('.rename-input');
      if (input instanceof HTMLElement) input.focus();
    });
  }

  function cancelRename() {
    renamingId = null;
    renameBusy = false;
  }

  async function saveRename(padset) {
    if (renameBusy) return;
    renameBusy = true;
    kitError = '';
    try {
      const updated = await renameKit({ padset, title: renameValue });
      // Update the list title in place, then close the input
      padsets = padsets.map((p) => (p.id === padset.id ? { ...p, title: updated.title } : p));
      renamingId = null;
    } catch (err) {
      kitError = (err && err.message) ? err.message : String(err);
    } finally {
      renameBusy = false;
    }
  }

  function handleRenameKeydown(e, padset) {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveRename(padset);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelRename();
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

  async function loadPage(n) {
    try {
      const result = await listPadsetPage({ page: n, perPage: 4 });
      padsets = result.items;
      page = n;
      hasMore = result.hasMore;
      padsetsError = '';
    } catch (err) {
      padsetsError = (err && err.message) ? err.message : String(err);
    }
  }

  function goToPage(n) {
    loadPage(n);
  }

  const anyActionInProgress = () =>
    kitLoadingId !== null || deletingId !== null || renamingId !== null;

  function handleClose() {
    dispatch('close');
  }

  function handleKeydown(e) {
    // Don't close the screen while typing in the rename input
    const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea') return;
    if (e.key === 'Enter' || e.key === 'Escape') handleClose();
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    loadPage(1);
  });

  onDestroy(() => window.removeEventListener('keydown', handleKeydown));
</script>

<div class="load-screen">
  <h1>{title}</h1>

  <div class="kit-list">
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
            {#if renamingId === padset.id}
              <input
                class="rename-input"
                type="text"
                bind:value={renameValue}
                on:keydown={(e) => handleRenameKeydown(e, padset)}
                disabled={renameBusy}
                maxlength="100"
              />
            {:else}
              <span class="kit-name">{padset.title || 'Untitled'}</span>
            {/if}
            <span class="kit-meta">{formatDate(padset.updatedAt || padset.createdAt)}</span>
          </div>
          <div class="kit-actions">
            {#if renamingId === padset.id}
              <button
                class="delete-button rename-save"
                on:click={() => saveRename(padset)}
                disabled={renameBusy}
                type="button"
              >
                {renameBusy ? 'Saving…' : 'Save'}
              </button>
              <button
                class="delete-button"
                on:click={cancelRename}
                disabled={renameBusy}
                type="button"
              >
                Cancel
              </button>
            {:else}
              <button
                class="load-button"
                on:click={() => handleLoadServerKit(padset)}
                disabled={kitLoadingId !== null || deletingId !== null || renamingId !== null}
                type="button"
              >
                {kitLoadingId === padset.id ? 'Loading…' : 'Load'}
              </button>
              <button
                class="delete-button"
                on:click={() => handleDeleteServerKit(padset)}
                disabled={kitLoadingId !== null || deletingId !== null || renamingId !== null}
                type="button"
              >
                {deletingId === padset.id ? 'Deleting…' : 'Delete'}
              </button>
              <button
                class="delete-button"
                on:click={() => startRename(padset)}
                disabled={kitLoadingId !== null || deletingId !== null || renamingId !== null}
                type="button"
              >
                Rename
              </button>
            {/if}
          </div>
        </div>
      {/each}
    {/if}

    {#if padsets.length > 0}
      <div class="pager-row">
        <button
          class="delete-button"
          on:click={() => goToPage(page - 1)}
          disabled={page === 1 || anyActionInProgress()}
          type="button"
        >
          Previous
        </button>
        <span class="page-label">Page {page}</span>
        <button
          class="delete-button"
          on:click={() => goToPage(page + 1)}
          disabled={!hasMore || anyActionInProgress()}
          type="button"
        >
          Next
        </button>
      </div>
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
    max-width: 420px;
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
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border: 2px solid #eee;
    border-radius: 12px;
  }

  .kit-info {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .kit-name {
    font-size: 1.1rem;
    font-weight: 600;
    color: #333;
    word-break: break-word;
  }

  .rename-input {
    width: 100%;
    padding: 0.4rem 0.6rem;
    font-size: 1rem;
    border: 2px solid #ddd;
    border-radius: 8px;
    color: #333;
    box-sizing: border-box;
  }

  .kit-meta {
    font-size: 0.85rem;
    color: #999;
    white-space: nowrap;
  }

  .kit-error {
    font-size: 0.9rem;
    color: #e74c3c;
    margin: 0;
  }

  .pager-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    padding-top: 0.5rem;
  }

  .page-label {
    font-size: 0.9rem;
    color: #555;
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
    justify-content: flex-start;
    align-items: center;
    gap: 0.5rem;
  }

  .delete-button {
    background-color: #e0e0e0;
    color: #333;
    border: none;
    padding: 0.5rem 0.9rem;
    font-size: 0.85rem;
    font-weight: 600;
    border-radius: 50px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .delete-button[disabled] {
    opacity: 0.6;
    cursor: default;
  }

  .rename-save {
    background-color: #06C0F0;
    color: white;
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
