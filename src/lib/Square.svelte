<script>
  import { createEventDispatcher } from 'svelte';

  const dispatch = createEventDispatcher();

  export let index = 0;
  export let color = '#FF4E3A';
  export let status = 'empty'; // 'empty' | 'recording' | 'ready'
  export let playing = false;
  export let playDuration = 0; // seconds

  // Generate a brighter version of the tile colour for the fill overlay
  function brightenColor(hex) {
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    r = Math.min(255, Math.round(r + (255 - r) * 0.45));
    g = Math.min(255, Math.round(g + (255 - g) * 0.45));
    b = Math.min(255, Math.round(b + (255 - b) * 0.45));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  $: brightColor = color ? brightenColor(color) : 'rgba(255,255,255,0.6)';
  $: fillStyle = playing
    ? 'animation-duration: ' + playDuration + 's; background-color: ' + brightColor + ';'
    : '';

  function handleTouchStart(e) {
    e.preventDefault();
  }

  function handleTouchEnd(e) {
    e.preventDefault();
    dispatch('tap');
  }

  function handleClick() {
    dispatch('tap');
  }
</script>

<div
  class="square"
  class:recording={status === 'recording'}
  style="background-color: {status === 'empty' ? '#1a1a1a' : color};"
  on:click={handleClick}
  on:touchstart={handleTouchStart}
  on:touchend={handleTouchEnd}
  role="button"
  tabindex="0"
>
  <!-- Playback fill overlay — sweeps left to right -->
  {#if playing}
    <div class="play-fill" style={fillStyle}></div>
  {/if}

  {#if status === 'empty'}
    <svg class="icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="9" y="2" width="6" height="11" rx="3" fill="rgba(255,255,255,0.5)" />
      <path d="M5 11a7 7 0 0 0 14 0" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-linecap="round" fill="none"/>
      <line x1="12" y1="18" x2="12" y2="22" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-linecap="round"/>
      <line x1="8" y1="22" x2="16" y2="22" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-linecap="round"/>
    </svg>

  {:else if status === 'recording'}
    <div class="record-ring">
      <div class="record-dot"></div>
    </div>

  {:else if status === 'ready'}
    <svg class="icon icon--play" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="6,3 20,12 6,21" fill="rgba(0,0,0,0.2)" />
    </svg>
  {/if}
</div>

<style>
  .square {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
    position: relative;
    overflow: hidden;
  }

  .square.recording {
    animation: pulse-bg 1s ease-in-out infinite alternate;
  }

  @keyframes pulse-bg {
    from { filter: brightness(1); }
    to   { filter: brightness(0.7); }
  }

  /* Playback fill — starts at 0 width, sweeps to 100% */
  .play-fill {
    position: absolute;
    top: 0;
    left: 0;
    width: 0%;
    height: 100%;
    animation-name: fill-sweep;
    animation-timing-function: linear;
    animation-fill-mode: forwards;
    pointer-events: none;
    z-index: 1;
  }

  @keyframes fill-sweep {
    from { width: 0%; }
    to   { width: 100%; }
  }

  .icon {
    width: 30%;
    height: 30%;
    max-width: 64px;
    max-height: 64px;
    pointer-events: none;
    position: relative;
    z-index: 2;
  }

  .icon--play {
    transform: translateX(5%);
  }

  .record-ring {
    width: 40%;
    height: 40%;
    max-width: 80px;
    max-height: 80px;
    border-radius: 50%;
    border: 3px solid rgba(255, 255, 255, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: ring-pulse 1s ease-in-out infinite alternate;
    position: relative;
    z-index: 2;
  }

  .record-dot {
    width: 40%;
    height: 40%;
    border-radius: 50%;
    background-color: rgba(255, 0, 0, 0.9);
  }

  @keyframes ring-pulse {
    from { transform: scale(1);    opacity: 1; }
    to   { transform: scale(1.15); opacity: 0.7; }
  }
</style>
