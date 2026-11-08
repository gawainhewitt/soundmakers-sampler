<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { apiMessage } from './api.js';

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
      kitError = apiMessage(err);
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
      kitError = apiMessage(err);
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
      kitError = apiMessage(err);
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

  // 2 kits per page only on phones in landscape (short side of the viewport
  // is small, e.g. ~390-430pt on iPhone); 4 everywhere else.
  function getPerPage() {
    const shortSide = Math.min(window.innerWidth, window.innerHeight);
    const isPhoneLandscape = window.innerWidth > window.innerHeight && shortSide <= 500;
    return isPhoneLandscape ? 2 : 4;
  }

  // Per-page size of the last loaded page (so resize/rotate events that don't
  // change orientation don't trigger a reload).
  let lastPerPage = 0;

  async function loadPage(n) {
    const perPage = getPerPage();
    lastPerPage = perPage;
    try {
      const result = await listPadsetPage({ page: n, perPage: perPage });
      padsets = result.items;
      page = n;
      hasMore = result.hasMore;
      padsetsError = '';
    } catch (err) {
      padsetsError = apiMessage(err);
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

  // Reload the current page, stepping back if the page is past the end for
  // the new per-page size (e.g. after rotating with fewer kits loaded).
  async function reloadForOrientation() {
    if (getPerPage() === lastPerPage) return;
    let n = page;
    await loadPage(n);
    while (n > 1 && padsets.length === 0 && !hasMore) {
      n -= 1;
      await loadPage(n);
    }
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('resize', reloadForOrientation);
    window.addEventListener('orientationchange', reloadForOrientation);
    loadPage(1);
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('resize', reloadForOrientation);
    window.removeEventListener('orientationchange', reloadForOrientation);
  });
</script>

<div class="load-screen">
  <h1>{title}</h1>

  {#if kitError}
    <p class="kit-error">{kitError}</p>
  {/if}

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
  </div>

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

  <button class="close-button" on:click={handleClose}>Close</button>
</div>

<style>
  .load-screen {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;                      /* fallback: large viewport */
    height: -webkit-fill-available;     /* iOS 9-15: URL-bar aware */
    height: 100dvh;                     /* modern iOS: dynamic viewport */
    background-color: white;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    padding-top: max(0.75rem, env(safe-area-inset-top));
    padding-bottom: calc(0.5rem + env(safe-area-inset-bottom));
    box-sizing: border-box;
    z-index: 9999;
    overflow: hidden;
  }

  h1 {
    font-size: 1.8rem;
    color: #333;
    margin: 0;
  }

  .kit-list {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
    width: 100%;
    max-width: 420px;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
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
    gap: 0.35rem;
    padding: 0.5rem 0.75rem;
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
    flex-shrink: 0;
    font-size: 0.9rem;
    color: #e74c3c;
    margin: 0;
  }

  .pager-row {
    width: 100%;
    max-width: 420px;
    flex-shrink: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    padding-top: 0.25rem;
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
    padding: 0.6rem 2rem;
    font-size: 1.05rem;
    font-weight: 600;
    border-radius: 50px;
    cursor: pointer;
    flex-shrink: 0;
  }

  /* Compact full-width layout for short landscape viewports: single column,
     list as a 2-column grid, pager and Close centred below. */
  @media (orientation: landscape) and (max-height: 500px) {
    h1 {
      font-size: 1.5rem;
    }

    .kit-list {
      width: 100%;
      max-width: none;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 0.5rem;
    }

    .kit-section-label {
      grid-column: 1 / -1;
    }

    .kit-item {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
      min-width: 0;
      padding: 0.5rem 0.75rem;
    }

    .kit-info {
      flex: 1 1 auto;
      min-width: 0;
      width: auto;
      margin-right: 0.5rem;
    }

    .kit-actions {
      flex-shrink: 0;
    }

    /* iOS 9 has no flex gap: space the card buttons with margins */
    .kit-actions .load-button + .delete-button,
    .kit-actions .delete-button + .delete-button {
      margin-left: 0.4rem;
    }

    .kit-name {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 0.95rem;
    }

    .kit-meta {
      font-size: 0.75rem;
    }

    .pager-row {
      width: 100%;
      max-width: none;
      justify-content: center;
    }

    .page-label {
      margin: 0 0.5rem;
    }

    .close-button {
      padding: 0.6rem 2rem;
    }

    .load-button,
    .delete-button {
      padding: 0.3rem 0.6rem;
    }
  }
</style>
