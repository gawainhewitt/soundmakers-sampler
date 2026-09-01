<script>
  import { onMount, onDestroy } from 'svelte';
  import Square from './Square.svelte';

  export let samplerEngine;
  export let tileCount = 4;
  export let tileStatuses = Array(4).fill('empty');

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
  // Layouts are chosen so tiles fill the whole grid (no empty cells),
  // keeping them as large as possible and centred.
  const GRID_LAYOUTS = {
    portrait: { 1: [1, 1], 2: [1, 2], 4: [2, 2], 6: [2, 3], 8: [2, 4] },
    landscape: { 1: [1, 1], 2: [2, 1], 4: [2, 2], 6: [3, 2], 8: [4, 2] },
  };

  function computeGrid(count, orient) {
    const layout = GRID_LAYOUTS[orient] && GRID_LAYOUTS[orient][count];
    if (layout) return { cols: layout[0], rows: layout[1] };
    // Fallback for any other count: fill the grid with as few cells as possible
    let cols = Math.ceil(Math.sqrt(count));
    let rows = Math.ceil(count / cols);
    if (orient === 'portrait' && cols > rows) [cols, rows] = [rows, cols];
    while (cols * rows < count) {
      if (orient === 'portrait') rows++;
      else cols++;
    }
    return { cols, rows };
  }

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
