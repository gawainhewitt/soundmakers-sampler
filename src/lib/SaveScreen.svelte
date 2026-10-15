<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { SQUARE_COLORS } from './tileConfig.js';

  const dispatch = createEventDispatcher();

  export let title = 'Save a Kit';
  export let tileCount = 4;
  export let tileStatuses = Array(4).fill('empty');
  // getTileDuration(tileIndex) -> seconds (trimmed), 0 if empty
  export let getTileDuration = (tileIndex) => 0;

  function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '—';
    return seconds.toFixed(1) + 's';
  }

  function handleClose() {
    dispatch('close');
  }

  function handleKeydown(e) {
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
        {tileStatuses.filter((s) => s === 'ready').length} of {tileCount}
      </span>
    </div>
  </div>

  <div class="pad-grid">
    {#each Array(tileCount) as _, index}
      {@const status = tileStatuses[index] || 'empty'}
      {@const filled = status === 'ready'}
      <div
        class="pad"
        class:filled={filled}
        style="background-color: {filled ? SQUARE_COLORS[index % SQUARE_COLORS.length] : '#e8e8e8'};"
      >
        <span class="pad-number">{index + 1}</span>
        {#if filled}
          <span class="pad-duration">{formatDuration(getTileDuration(index))}</span>
        {:else}
          <span class="pad-empty">empty</span>
        {/if}
      </div>
    {/each}
  </div>

  <button class="close-button" on:click={handleClose}>Close</button>
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