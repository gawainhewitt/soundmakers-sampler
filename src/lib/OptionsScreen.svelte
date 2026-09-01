<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { SQUARE_COLORS, computeGrid } from './tileConfig.js';

  const dispatch = createEventDispatcher();

  export let tileCount = 4;
  export let tileStatuses = Array(4).fill('empty');

  const TILE_COUNT_OPTIONS = [1, 2, 4, 6, 8];
  let selectedCount = tileCount;

  // Tiles the user has marked to clear in this session (working copy)
  let clearedTiles = new Set();

  // Index of the tile whose editor is open, or null when closed
  let selectedTile = null;

  let orientation = 'portrait';
  function updateOrientation() {
    orientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
  }

  $: grid = computeGrid(selectedCount, orientation);
  $: columns = grid.cols;
  $: rows = grid.rows;

  $: editorStatus = selectedTile !== null
    ? (clearedTiles.has(selectedTile) ? 'empty' : (tileStatuses[selectedTile] || 'empty'))
    : null;

  // Grid size in px, measured so the whole column fits the viewport in both
  // orientations (title + tile count + grid + Done all visible).
  let gridSize = 0;

  function measureGrid() {
    const screen = document.querySelector('.options-screen');
    const gridEl = document.querySelector('.tile-grid');
    if (!screen || !gridEl) return;

    const title = screen.querySelector('h1');
    const countSetting = screen.querySelector('.setting--count');
    const tilesLabel = screen.querySelector('.setting--grow .setting-label');
    const done = screen.querySelector('.close-button');

    const fixedH =
      (title ? title.getBoundingClientRect().height : 0) +
      (countSetting ? countSetting.getBoundingClientRect().height : 0) +
      (tilesLabel ? tilesLabel.getBoundingClientRect().height : 0) +
      (done ? done.getBoundingClientRect().height : 0);

    // 3 gaps of 1rem + 2rem top/bottom padding
    const gapTotal = 3 * 16;
    const paddingTotal = 4 * 16;

    const availH = screen.clientHeight - fixedH - gapTotal - paddingTotal;
    const maxByWidth = window.innerWidth * 0.8;
    gridSize = Math.max(0, Math.min(availH, maxByWidth));
  }

  function selectCount(count) {
    selectedCount = count;
    // Drop clear marks for tiles that no longer exist
    clearedTiles.forEach((i) => { if (i >= count) clearedTiles.delete(i); });
    clearedTiles = new Set(clearedTiles);
  }

  function openEditor(index) {
    selectedTile = index;
  }

  function closeEditor() {
    selectedTile = null;
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
    if (e.key === 'Enter' || e.key === 'Escape') {
      if (selectedTile !== null) closeEditor();
      else handleClose();
    }
  }

  onMount(() => {
    updateOrientation();
    measureGrid();
    window.addEventListener('resize', () => { updateOrientation(); measureGrid(); });
    window.addEventListener('orientationchange', () => { updateOrientation(); measureGrid(); });
    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    window.removeEventListener('resize', () => { updateOrientation(); measureGrid(); });
    window.removeEventListener('orientationchange', () => { updateOrientation(); measureGrid(); });
    window.removeEventListener('keydown', handleKeydown);
  });
</script>

<div class="options-screen">
  <h1>Settings</h1>

  <div class="setting setting--count">
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

  <div class="setting setting--grow">
    <label class="setting-label">Tiles — tap a tile to edit it</label>
    <div class="grid-area">
      <div
        class="tile-grid {orientation}"
        style="width: {gridSize}px; height: {gridSize}px; grid-template-columns: repeat({columns}, 1fr); grid-template-rows: repeat({rows}, 1fr);"
      >
        {#each Array(selectedCount) as _, index}
          {@const isCleared = clearedTiles.has(index)}
          {@const status = isCleared ? 'empty' : (tileStatuses[index] || 'empty')}
          <button
            class="tile"
            class:cleared={isCleared}
            style="background-color: {status === 'empty' ? '#1a1a1a' : SQUARE_COLORS[index % SQUARE_COLORS.length]};"
            on:click={() => openEditor(index)}
            type="button"
            aria-label="Tile {index + 1}"
          >
            {#if isCleared}
              <span class="tile-label">Cleared</span>
            {:else if status === 'ready'}
              <span class="tile-label">Edit</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>
  </div>

  <button class="close-button" on:click={handleClose}>Done</button>
</div>

{#if selectedTile !== null}
  <div class="editor-panel">
    <h2>Tile {selectedTile + 1}</h2>

    <div
      class="editor-tile-preview"
      style="background-color: {editorStatus === 'empty' ? '#1a1a1a' : SQUARE_COLORS[selectedTile % SQUARE_COLORS.length]};"
    ></div>

    {#if editorStatus === 'ready'}
      <button class="action-button danger" on:click={() => toggleClear(selectedTile)} type="button">
        Clear recording
      </button>
    {:else if clearedTiles.has(selectedTile)}
      <button class="action-button" on:click={() => toggleClear(selectedTile)} type="button">
        Restore recording
      </button>
    {:else}
      <p class="no-recording">No recording on this tile.</p>
    {/if}

    <button class="action-button" on:click={closeEditor} type="button">Back</button>
  </div>
{/if}

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
    justify-content: flex-start;
    gap: 1rem;
    padding: 2rem;
    box-sizing: border-box;
    z-index: 9999;
    overflow: auto;
  }

  /* Match the splash screen: in landscape, keep the layout portrait-like and
     centred within a strict space so nothing is pushed off-screen. */
  @media (orientation: landscape) {
    .options-screen {
      max-width: 100vh;
      left: 50%;
      transform: translateX(-50%);
    }
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

  .grid-area {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tile-grid {
    display: grid;
    gap: 4px;
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

  .editor-panel {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: white;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.5rem;
    padding: 2rem;
    box-sizing: border-box;
  }

  .editor-panel h2 {
    font-size: 2rem;
    color: #333;
    margin: 0;
  }

  .editor-tile-preview {
    width: 40vw;
    height: 40vw;
    max-width: 220px;
    max-height: 220px;
    border-radius: 12px;
  }

  .action-button {
    background-color: #06C0F0;
    color: white;
    border: none;
    padding: 1rem 2.5rem;
    font-size: 1.1rem;
    font-weight: 600;
    border-radius: 50px;
    cursor: pointer;
  }

  .action-button.danger {
    background-color: #e74c3c;
  }

  .no-recording {
    font-size: 1.1rem;
    color: #999;
    margin: 0;
  }
</style>