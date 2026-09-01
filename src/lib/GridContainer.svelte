<script>
  import { onMount, onDestroy } from 'svelte';
  import Square from './Square.svelte';
  import { SQUARE_COLORS, computeGrid } from './tileConfig.js';

  export let samplerEngine;
  export let tileCount = 4;
  export let tileStatuses = Array(4).fill('empty');

  let orientation = 'portrait';

  // Playing state per tile: { playing: bool, duration: number }
  let tilePlayStates = Array.from({ length: tileCount }, function() {
    return { playing: false, duration: 0 };
  });

  // Timers to reset playing state after sample finishes
  let playTimers = Array(tileCount).fill(null);

  // Keep internal play state in sync when the tile count changes
  $: if (tileCount !== tilePlayStates.length) {
    for (let i = tileCount; i < playTimers.length; i++) {
      if (playTimers[i]) clearTimeout(playTimers[i]);
    }
    tilePlayStates = Array.from({ length: tileCount }, (_, i) =>
      tilePlayStates[i] || { playing: false, duration: 0 }
    );
    playTimers = Array.from({ length: tileCount }, (_, i) => playTimers[i] || null);
  }

  // Grid dimensions depend on orientation and tile count.
  $: grid = computeGrid(tileCount, orientation);
  $: columns = grid.cols;
  $: rows = grid.rows;

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

<div class="grid {orientation}" style="grid-template-columns: repeat({columns}, 1fr); grid-template-rows: repeat({rows}, 1fr);">
  {#each Array(tileCount) as _, index}
    <Square
      {index}
      color={SQUARE_COLORS[index % SQUARE_COLORS.length]}
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
</style>
