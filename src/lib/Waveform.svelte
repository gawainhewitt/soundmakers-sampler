<script>
  import { onMount, onDestroy } from 'svelte';

  // AudioBuffer whose waveform should be drawn, or null.
  export let buffer = null;
  export let color = '#06C0F0';
  // Playback cursor position on a 0..1 scale, or -1 to hide.
  export let cursor = -1;

  let canvasEl;

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
      const top = mid - max * (mid - 1);
      const bottom = mid - min * (mid - 1);
      const height = Math.max(1, bottom - top);
      ctx.fillRect(x, top, 1, height);
    }

    // Playback cursor
    if (cursor >= 0) {
      const cx = Math.min(w, Math.max(0, cursor * w));
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.fillRect(cx - 1, 0, 2, h);
    }
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

  $: if (buffer) { cursor; draw(); } // redraw when buffer or cursor changes
</script>

<canvas bind:this={canvasEl}></canvas>

<style>
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>