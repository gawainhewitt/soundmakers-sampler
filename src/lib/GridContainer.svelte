<script>
  import { onMount, onDestroy } from 'svelte';
  import Square from './Square.svelte';

  export let samplerEngine;

  // tileStatuses is bound from App.svelte so it survives navigation
  export let tileStatuses = Array(8).fill('empty');

  // ── Keezy colour palette ──────────────────────────────────────────────────
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

  function updateTileStatus(index, status) {
    tileStatuses[index] = status;
    tileStatuses = [...tileStatuses];
  }

  async function handleTileTap(index) {
    if (!samplerEngine) return;

    const status = tileStatuses[index];

    if (status === 'empty') {
      const ok = await samplerEngine.startRecording(index);
      if (ok) updateTileStatus(index, 'recording');

    } else if (status === 'recording') {
      await samplerEngine.stopRecording(index);
      updateTileStatus(index, 'ready');

    } else if (status === 'ready') {
      samplerEngine.playTile(index, { loop: false });
    }
  }

  function updateOrientation() {
    orientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
  }

  function handleVisibilityChange() {
    if (document.hidden && samplerEngine) samplerEngine.panic();
  }

  function handleWindowBlur() {
    if (samplerEngine) samplerEngine.panic();
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
    // No panic() here — GridContainer is now always mounted
  });
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
