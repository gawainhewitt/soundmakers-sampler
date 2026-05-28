<script>
  import { onMount, onDestroy } from 'svelte';
  import Square from './Square.svelte';

  export let samplerEngine;
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

  // Playing state per tile: { playing: bool, duration: number }
  let tilePlayStates = Array.from({ length: NUM_TILES }, function() {
    return { playing: false, duration: 0 };
  });

  // Timers to reset playing state after sample finishes
  let playTimers = Array(NUM_TILES).fill(null);

  function updateTileStatus(index, status) {
    tileStatuses[index] = status;
    tileStatuses = [...tileStatuses];
  }

  function setPlaying(index, duration) {
    // Clear any existing timer for this tile
    if (playTimers[index]) {
      clearTimeout(playTimers[index]);
      playTimers[index] = null;
    }

    tilePlayStates[index] = { playing: true, duration: duration };
    tilePlayStates = [...tilePlayStates];

    // Reset after sample finishes
    playTimers[index] = setTimeout(function() {
      tilePlayStates[index] = { playing: false, duration: 0 };
      tilePlayStates = [...tilePlayStates];
      playTimers[index] = null;
    }, duration * 1000);
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
      const duration = samplerEngine.playTile(index, { loop: false });
      if (duration) setPlaying(index, duration);
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
    playTimers.forEach(function(t) { if (t) clearTimeout(t); });
  });
</script>

<div class="grid {orientation}">
  {#each Array(NUM_TILES) as _, index}
    <Square
      {index}
      color={SQUARE_COLORS[index]}
      status={tileStatuses[index]}
      playing={tilePlayStates[index].playing}
      playDuration={tilePlayStates[index].duration}
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
