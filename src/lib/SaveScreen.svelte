<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { SQUARE_COLORS } from './tileConfig.js';

  const dispatch = createEventDispatcher();

  export let title = 'Save a Kit';
  export let tileCount = 4;
  export let tileStatuses = Array(4).fill('empty');
  // The kit currently loaded/created, { id, title } or null.
  export let currentKit = null;
  // getTileDuration(tileIndex) -> seconds (trimmed), 0 if empty
  export let getTileDuration = (tileIndex) => 0;
  // saveKit({ onPadStatus, title?, padsetId? }) -> Promise<{ soundIds, padsFailed, padsetId?, padsetError? }>
  export let saveKit = async (opts) => ({
    soundIds: [],
    padsFailed: [],
    padsetId: null,
    padsetError: '',
  });

  // Per-pad save progress: { state: 'idle'|'saving'|'saved'|'error', message }
  let padProgress = {};
  let isSaving = false;
  let lastPadsetId = null;
  let saveMessage = '';

  // Kit name for Save As, defaulting to Kit <date> like today.
  let kitName = 'Kit ' + new Date().toLocaleString();
  // Show the name field (Save As mode): true while naming a new kit.
  let showNameField = false;

  const readyCount = tileStatuses.filter((s) => s === 'ready').length;
  const anyReady = readyCount > 0;

  function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '—';
    return seconds.toFixed(1) + 's';
  }

  function setPadProgress(index, state, message = '') {
    padProgress = { ...padProgress, [index]: { state, message } };
  }

  async function runSave(opts) {
    isSaving = true;
    saveMessage = '';
    lastPadsetId = null;
    padProgress = {};

    try {
      const result = await saveKit({
        ...opts,
        onPadStatus: (index, state, message) => setPadProgress(index, state, message),
      });
      if (result.padsetId) lastPadsetId = result.padsetId;
      if (result.padsFailed && result.padsFailed.length) {
        saveMessage = `${result.padsFailed.length} pad(s) failed to save`;
      } else {
        saveMessage = 'Saved';
      }

      return result;
    } catch (err) {
      const message = (err && err.message) ? err.message : String(err);
      saveMessage = message;

      // If the kit we were overwriting is gone, offer Save As prefilled
      if (message === 'Kit no longer exists on the server') {
        kitName = (currentKit && currentKit.title) ? currentKit.title : 'Kit ' + new Date().toLocaleString();
        showNameField = true;
      }

      return null;
    } finally {
      isSaving = false;
    }
  }

  async function handleSave() {
    if (isSaving || !anyReady || !currentKit) return;
    const result = await runSave({ padsetId: currentKit.id });
    // Overwrite keeps currentKit; the app doesn't need a new reference
    return result;
  }

  async function handleSaveAs() {
    if (isSaving || !anyReady) return;
    const trimmedName = kitName.trim();
    const result = await runSave({
      title: trimmedName !== '' ? trimmedName : undefined,
    });
    // On success, tell the app which padset was created so it becomes the
    // current kit.
    if (result && result.padsetId) {
      dispatch('saved', {
        padsetId: result.padsetId,
        title: trimmedName !== '' ? trimmedName : '',
      });
    }
  }

  function openSaveAs() {
    if (isSaving) return;
    showNameField = true;
  }

  function handleClose() {
    dispatch('close');
  }

  function handleKeydown(e) {
    // Don't close the screen while typing in an input or textarea
    const tag = e.target && e.target.tagName ? e.target.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea') return;
    if (e.key === 'Enter' || e.key === 'Escape') handleClose();
  }

  onMount(() => window.addEventListener('keydown', handleKeydown));
  onDestroy(() => window.removeEventListener('keydown', handleKeydown));
</script>

<div class="save-screen">
  <h1>{title}</h1>

  <div class="kit-summary">
    <div class="summary-row">
      <span class="summary-label">Tiles</span>
      <span class="summary-value">{tileCount}</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Sounds</span>
      <span class="summary-value">
        {readyCount} of {tileCount}
      </span>
    </div>
    {#if lastPadsetId}
      <div class="summary-row">
        <span class="summary-label">Padset id</span>
        <span class="summary-value">{lastPadsetId}</span>
      </div>
    {/if}
  </div>

  <div class="pad-grid">
    {#each Array(tileCount) as _, index}
      {@const status = tileStatuses[index] || 'empty'}
      {@const filled = status === 'ready'}
      {@const progress = padProgress[index] || { state: 'idle', message: '' }}
      <div
        class="pad"
        class:filled={filled}
        class:saving={progress.state === 'saving'}
        class:error={progress.state === 'error'}
        style="background-color: {filled ? SQUARE_COLORS[index % SQUARE_COLORS.length] : '#e8e8e8'};"
      >
        <span class="pad-number">{index + 1}</span>

        {#if progress.state === 'saving'}
          <span class="pad-saving">saving…</span>
        {:else if progress.state === 'saved'}
          <span class="pad-saved">✓</span>
        {:else if progress.state === 'error'}
          <span class="pad-error">✗ {progress.message}</span>
        {:else if filled}
          <span class="pad-duration">{formatDuration(getTileDuration(index))}</span>
        {:else}
          <span class="pad-empty">empty</span>
        {/if}
      </div>
    {/each}
  </div>

  {#if currentKit}
    <p class="saving-to">Saving to: {currentKit.title || 'Untitled'}</p>
  {/if}

  {#if saveMessage}
    <p class="save-message">{saveMessage}</p>
  {/if}

  {#if showNameField}
    <div class="kit-name-field">
      <label class="kit-name-label" for="kit-name-input">Kit name</label>
      <input
        id="kit-name-input"
        class="kit-name-input"
        type="text"
        bind:value={kitName}
        maxlength="100"
        disabled={isSaving}
      />
    </div>
  {/if}

  <div class="button-row">
    {#if currentKit && !showNameField}
      <button
        class="close-button"
        on:click={handleSave}
        disabled={isSaving || !anyReady}
        type="button"
      >
        {isSaving ? 'Saving…' : 'Save'}
      </button>
    {/if}

    {#if currentKit && !showNameField}
      <button
        class="close-button secondary"
        on:click={openSaveAs}
        disabled={isSaving || !anyReady}
        type="button"
      >
        Save As
      </button>
    {:else}
      <button
        class="close-button"
        on:click={handleSaveAs}
        disabled={isSaving || !anyReady}
        type="button"
      >
        {isSaving ? 'Saving…' : 'Save As'}
      </button>
    {/if}

    <button class="close-button secondary" on:click={handleClose} type="button">Close</button>
  </div>
</div>

<style>
  .save-screen {
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
    gap: 1.5rem;
    z-index: 9999;
    overflow-y: auto;
  }

  h1 {
    font-size: 2.5rem;
    color: #333;
    margin: 0;
  }

  .kit-summary {
    display: flex;
    gap: 2rem;
  }

  .summary-row {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }

  .summary-label {
    font-size: 0.85rem;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .summary-value {
    font-size: 1.4rem;
    font-weight: 600;
    color: #333;
  }

  .pad-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
    width: 100%;
    max-width: 360px;
  }

  @media (max-width: 480px) {
    .pad-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .pad {
    aspect-ratio: 1;
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    position: relative;
  }

  .pad.saving {
    animation: pad-pulse 1s ease-in-out infinite alternate;
  }

  .pad.error {
    box-shadow: 0 0 0 3px rgba(231, 76, 60, 0.6);
  }

  @keyframes pad-pulse {
    from { filter: brightness(1); }
    to   { filter: brightness(0.75); }
  }

  .pad-number {
    font-size: 1.2rem;
    font-weight: 700;
    color: rgba(0, 0, 0, 0.55);
  }

  .pad-duration {
    font-size: 0.8rem;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.55);
  }

  .pad-empty {
    font-size: 0.8rem;
    color: #aaa;
  }

  .pad-saving {
    font-size: 0.8rem;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.6);
  }

  .pad-saved {
    font-size: 1.3rem;
    font-weight: 700;
    color: #fff;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  }

  .pad-error {
    font-size: 0.7rem;
    font-weight: 600;
    color: rgba(0, 0, 0, 0.75);
    text-align: center;
    padding: 0 0.25rem;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .save-message {
    font-size: 1rem;
    color: #333;
    margin: 0;
  }

  .saving-to {
    font-size: 1.1rem;
    color: #555;
    margin: 0;
  }

  .kit-name-field {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    width: 100%;
    max-width: 360px;
  }

  .kit-name-label {
    font-size: 0.85rem;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .kit-name-input {
    width: 100%;
    padding: 0.6rem 0.9rem;
    font-size: 1rem;
    border: 2px solid #ddd;
    border-radius: 10px;
    color: #333;
    box-sizing: border-box;
  }

  .kit-name-input[disabled] {
    opacity: 0.6;
  }

  .button-row {
    display: flex;
    gap: 1rem;
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

  .close-button.secondary {
    background-color: #e0e0e0;
    color: #333;
  }

  .close-button[disabled] {
    opacity: 0.5;
    cursor: default;
  }
</style>