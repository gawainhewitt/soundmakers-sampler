<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { SQUARE_COLORS, computeGrid } from './tileConfig.js';

  const dispatch = createEventDispatcher();

  export let tileCount = 4;
  export let tileStatuses = Array(4).fill('empty');

  const TILE_COUNT_OPTIONS = [1, 2, 4, 6, 8];
  let selectedCount = tileCount;

  // Tiles the user has marked to clear in this session
  let clearedTiles = new Set();

  let orientation = 'portrait';
  function updateOrientation() {
    orientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
  }

  $: grid = computeGrid(selectedCount, orientation);
  $: columns = grid.cols;
  $: rows = grid.rows;

  function selectCount(count) {
    selectedCount = count;
    // Drop clear marks for tiles that no longer exist
    clearedTiles.forEach((i) => { if (i >= count) clearedTiles.delete(i); });
    clearedTiles = new Set(clearedTiles);
  }

  function toggleClear(index) {
    if (clearedTiles.has(index)) {
      clearedTiles.delete(index);
    } else {
      clearedTiles.add(index);
    }
    clearedTiles = new Set(clearedTiles);
  }

  function handleClose() {
    dispatch('save', { tileCount: selectedCount, clearedTiles: [...clearedTiles] });
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' || e.key === 'Escape') handleClose();
  }

  onMount(() => {
    updateOrientation();
    window.addEventListener('resize', updateOrientation);
    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    window.removeEventListener('resize', updateOrientation);
    window.removeEventListener('keydown', handleKeydown);
  });
</script>

<div class="options-screen">
  <h1>Settings</h1>

  <div class="setting">
    <label class="setting-label">Number of tiles</label>
    <div class="tile-count-options">
      {#each TILE_COUNT_OPTIONS as count}
        <button
          class="tile-count-option"
          class:selected={count === selectedCount}
          on:click={() => selectCount(count)}
          type="button"
        >
          {count}
        </button>
      {/each}
    </div>
  </div>

  <div class="setting">
    <label class="setting-label">Tiles — tap a tile to clear its recording</label>
    <div
      class="tile-grid {orientation}"
      style="grid-template-columns: repeat({columns}, 1fr); grid-template-rows: repeat({rows}, 1fr);"
    >
      {#each Array(selectedCount) as _, index}
        {@const isCleared = clearedTiles.has(index)}
        {@const status = isCleared ? 'empty' : tileStatuses[index]}
        <button
          class="tile"
          class:cleared={isCleared}
          style="background-color: {status === 'empty' ? '#1a1a1a' : SQUARE_COLORS[index % SQUARE_COLORS.length]};"
          on:click={() => toggleClear(index)}
          type="button"
          aria-label="Tile {index + 1}"
        >
          {#if isCleared}
            <span class="tile-label">Restore</span>
          {:else if status === 'ready'}
            <span class="tile-label">Clear</span>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <button class="close-button" on:click={handleClose}>Done</button>
</div>

<style>
  .options-screen {
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
    overflow: auto;
  }

  h1 {
    font-size: 2.5rem;
    color: #333;
    margin: 0;
  }

  .setting {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }

  .setting-label {
    font-size: 1.1rem;
    color: #555;
    text-align: center;
  }

  .tile-count-options {
    display: flex;
    gap: 1rem;
  }

  .tile-count-option {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    border: 2px solid #ddd;
    background-color: white;
    color: #333;
    font-size: 1.3rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .tile-count-option:hover {
    border-color: #06C0F0;
  }

  .tile-count-option.selected {
    background-color: #06C0F0;
    border-color: #06C0F0;
    color: white;
  }

  .tile-grid {
    display: grid;
    gap: 4px;
    width: min(80vw, 55vh);
    height: min(80vw, 55vh);
  }

  .tile {
    border: none;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
  }

  .tile:hover {
    filter: brightness(1.1);
  }

  .tile.cleared {
    opacity: 0.6;
  }

  .tile-label {
    color: rgba(255, 255, 255, 0.95);
    font-size: 1rem;
    font-weight: 600;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
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