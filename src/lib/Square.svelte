<script>
  import { createEventDispatcher, onDestroy } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  export let color = '#FF4E3A';
  export let activeColor = 'rgba(255, 255, 255, 0.55)';
  export let index = 0;
  export let orientation = 'portrait';
  export let note = 'C4';
  export let audioEngine = null;
  export let isPressed = false;

  let element;
  let activeTouchId = null;
  let localPressed = false;
  
  $: effectivePressed = isPressed || localPressed;
  
  function handlePress() {
    localPressed = true;
    if (audioEngine) audioEngine.playNote(note);
    dispatch('press', { index, note });
  }
  
  function handleRelease() {
    if (!localPressed) return;
    localPressed = false;
    activeTouchId = null;
    if (audioEngine) audioEngine.stopNote(note);
    dispatch('release', { index, note });
  }
  
  function handleTouchStart(e) {
    e.preventDefault();
    if (activeTouchId === null && e.changedTouches.length > 0) {
      activeTouchId = e.changedTouches[0].identifier;
      handlePress();
    }
  }
  
  function handleTouchEnd(e) {
    e.preventDefault();
    if (activeTouchId !== null) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouchId) {
          handleRelease();
          return;
        }
      }
    }
  }
  
  function handleTouchCancel(e) {
    e.preventDefault();
    if (activeTouchId !== null) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouchId) {
          handleRelease();
          return;
        }
      }
    }
  }
  
  function handleTouchMove(e) {
    if (activeTouchId === null || !element) return;
    
    let ourTouch = null;
    for (let i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === activeTouchId) {
        ourTouch = e.touches[i];
        break;
      }
    }
    
    if (!ourTouch) {
      handleRelease();
      return;
    }
    
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const x = ourTouch.clientX - centerX;
    const y = ourTouch.clientY - centerY;
    const distance = Math.sqrt(x * x + y * y);
    const radius = Math.min(rect.width, rect.height) / 2;
    
    if (distance > radius * 1.5) {
      handleRelease();
    }
  }
  
  onDestroy(() => {
    if (localPressed) handleRelease();
  });
</script>

<svelte:window on:blur={handleRelease} />

<div
  bind:this={element}
  class="square"
  style="background-color: {effectivePressed ? activeColor : color};"
  on:mousedown={handlePress}
  on:mouseup={handleRelease}
  on:mouseleave={handleRelease}
  on:touchstart={handleTouchStart}
  on:touchend={handleTouchEnd}
  on:touchcancel={handleTouchCancel}
  on:touchmove={handleTouchMove}
  role="button"
  tabindex="0"
>
  <span class="note-label">{note.slice(0, -1)}</span>
</div>

<style>
  .square {
    /* Fill the grid cell completely */
    width: 100%;
    height: 100%;
    
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
    transition: background-color 0.08s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    
    /* No border-radius — Keezy style is edge-to-edge rectangles */
    border-radius: 0;
  }
  
  .square:active {
    /* Subtle scale on press — keep or remove to taste */
    filter: brightness(1.15);
  }
  
  .note-label {
    font-size: 5vmin;
    font-weight: bold;
    color: rgba(0, 0, 0, 0.25);
    pointer-events: none;
  }
</style>
