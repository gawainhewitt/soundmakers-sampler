<script>
  import { onMount, onDestroy } from 'svelte';
  import Square from './Square.svelte';

  export let samplerEngine;

  // ── Keezy colour palette ──────────────────────────────────────────────────
  // Easy to swap: edit this array (one colour per square, index 0–7)
  const SQUARE_COLORS = [
    '#FF4E3A', // red-orange
    '#FFD05A', // yellow
    '#6EEAA0', // mint green
    '#A8C86A', // olive green
    '#FF6B9D', // hot pink
    '#FF9130', // orange
    '#B97FE8', // purple
    '#5BEDA0', // bright green
  ];
  // ─────────────────────────────────────────────────────────────────────────

  const NUM_TILES = 8;
  let orientation = 'portrait';

  // Mirror of samplerEngine.tiles[i].status for reactive UI updates
  // 'empty' | 'recording' | 'ready'
  let tileStatuses = Array(NUM_TILES).fill('empty');

  function updateTileStatus(index, status) {
    tileStatuses[index] = status;
    tileStatuses = [...tileStatuses]; // trigger Svelte reactivity
  }

  async function handleTileTap(index) {
    if (!samplerEngine) return;

    const status = tileStatuses[index];

    if (status === 'empty') {
      // Start recording this tile
      const ok = await samplerEngine.startRecording(index);
      if (ok) {
        updateTileStatus(index, 'recording');
      }

    } else if (status === 'recording') {
      // Stop recording — engine decodes and sets buffer
      await samplerEngine.stopRecording(index);
      updateTileStatus(index, 'ready');

    } else if (status === 'ready') {
      // Play back the sample (one-shot by default)
      samplerEngine.playTile(index, { loop: false });
    }
  }

  function updateOrientation() {
    orientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
  }

  onMount(() => {
    updateOrientation();
    window.addEventListener('resize', updateOrientation);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
  });

  onDestroy(() => {
    window.removeEventListener('resize', updateOrientation);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('blur', handleWindowBlur);
    if (samplerEngine) samplerEngine.panic();
  });

  function handleVisibilityChange() {
    if (document.hidden && samplerEngine) samplerEngine.panic();
  }

  function handleWindowBlur() {
    if (samplerEngine) samplerEngine.panic();
  }
</script>

<div class="grid {orientation}">
  {#each Array(NUM_TILES) as _, index}
    <Square
      {index}
      color={SQUARE_COLORS[index]}
      status={tileStatuses[index]}
      on:tap={() => handleTileTap(index)}
    />
  {/each}
</div>

<style>
  .grid {
    display: grid;
    width: 100%;
    height: 100%;
    gap: 0;
  }

  .grid.portrait {
    grid-template-columns: repeat(2, 1fr);
    grid-template-rows: repeat(4, 1fr);
  }

  .grid.landscape {
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(2, 1fr);
  }
</style>
