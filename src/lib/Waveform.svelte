<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  // AudioBuffer whose waveform should be drawn, or null.
  export let buffer = null;
  export let color = '#06C0F0';
  // Playback cursor position on a 0..1 scale, or -1 to hide.
  export let cursor = -1;
  // Trim region on a 0..1 scale (0 = start of buffer, 1 = end).
  export let trimStart = 0;
  export let trimEnd = 1;

  let canvasEl;
  let dragging = null; // 'start' | 'end' | null

  // Horizontal inset (px) so trim handles are visible and grabbable even when
  // they sit at the very start/end of the buffer (the default range).
  const PAD = 10;

  // Width of the drawable area (between the padding insets)
  function drawWidth() {
    return (canvasEl ? canvasEl.clientWidth : 1) - PAD * 2;
  }

  // Convert a 0..1 ratio into a canvas x pixel (within the padded area)
  function pxFromRatio(ratio) {
    return PAD + ratio * drawWidth();
  }

  // Convert a client X into a 0..1 ratio (ignoring the padding)
  function ratioFromClientX(clientX) {
    const rect = canvasEl.getBoundingClientRect();
    const dw = drawWidth();
    if (dw <= 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left - PAD) / dw));
  }

  function draw() {
    const canvas = canvasEl;
    if (!buffer || !canvas) return;

    const parent = canvas.parentElement;
    if (!parent) return;

    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (!w || !h) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const data = buffer.getChannelData(0);
    const mid = h / 2;
    const numBars = w; // one vertical bar per horizontal pixel
    const samplesPerBar = Math.floor(data.length / numBars);
    if (samplesPerBar < 1) return;

    // Boundary pixels for the trim region (inset from the edges)
    const sx = Math.round(pxFromRatio(trimStart));
    const ex = Math.round(pxFromRatio(trimEnd));

    ctx.fillStyle = color;

    for (let i = 0; i < numBars; i++) {
      let min = 1;
      let max = -1;
      const start = i * samplesPerBar;
      for (let j = 0; j < samplesPerBar; j++) {
        const v = data[start + j];
        if (v < min) min = v;
        if (v > max) max = v;
      }
      if (max < min) continue;

      const x = i;
      // Dim the trimmed-out regions
      if (x < sx || x > ex) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
      } else {
        ctx.fillStyle = color;
      }
      const top = mid - max * (mid - 1);
      const bottom = mid - min * (mid - 1);
      const height = Math.max(1, bottom - top);
      ctx.fillRect(x, top, 1, height);
    }

    // Trim handle lines (yellow for visibility on the dark panel)
    ctx.fillStyle = '#FFD05A';
    ctx.fillRect(sx - 1, 0, 3, h);
    ctx.fillRect(ex - 1, 0, 3, h);

    // Playback cursor — swept across the trimmed region so it matches what is heard
    if (cursor >= 0) {
      const pos = trimStart + cursor * (trimEnd - trimStart);
      const cx = Math.min(w, Math.max(0, pxFromRatio(pos)));
      ctx.fillStyle = 'rgba(120,255,120,0.95)';
      ctx.fillRect(cx - 1, 0, 2, h);
    }
  }

  function handleDown(e) {
    if (!buffer) return;
    const ratio = ratioFromClientX(e.clientX);
    const px = e.clientX - canvasEl.getBoundingClientRect().left;

    const sx = pxFromRatio(trimStart);
    const ex = pxFromRatio(trimEnd);

    // Which handle is closer? Prefer an edge, accounting for touch size.
    const dStart = Math.abs(px - sx);
    const dEnd = Math.abs(px - ex);
    const grab = dStart < dEnd ? 'start' : 'end';

    if (Math.min(dStart, dEnd) < 28) {
      dragging = grab;
      canvasEl.setPointerCapture(e.pointerId);
      e.preventDefault();
      moveTo(ratio);
    } else {
      // Clicking inside the region moves playback cursor here (future scrub)
      dragging = null;
    }
  }

  function handleMove(e) {
    if (!dragging) return;
    moveTo(ratioFromClientX(e.clientX));
  }

  function handleUp(e) {
    if (!dragging) return;
    dragging = null;
    try { canvasEl.releasePointerCapture(e.pointerId); } catch (err) {}
  }

  function moveTo(ratio) {
    if (dragging === 'start') {
      trimStart = Math.min(ratio, trimEnd - 0.001);
    } else if (dragging === 'end') {
      trimEnd = Math.max(ratio, trimStart + 0.001);
    }
    dispatch('trimchange', { start: trimStart, end: trimEnd });
  }

  function handleResize() {
    draw();
  }

  onMount(() => {
    draw();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
  });

  onDestroy(() => {
    window.removeEventListener('resize', handleResize);
    window.removeEventListener('orientationchange', handleResize);
  });

  $: if (buffer) { cursor; trimStart; trimEnd; draw(); }
</script>

<canvas
  bind:this={canvasEl}
  on:pointerdown={handleDown}
  on:pointermove={handleMove}
  on:pointerup={handleUp}
  on:pointercancel={handleUp}
  style="touch-action: none;"
></canvas>