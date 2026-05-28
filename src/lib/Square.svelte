<script>
  import { createEventDispatcher, onDestroy } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  export let color = '#AD71DD';
  export let activeColor = '#06C0F0';
  export let index = 0;
  export let orientation = 'portrait';
  export let note = 'C4';
  export let audioEngine = null;
  
  export let isPressed = false;
  let element;
  let activeTouchId = null; // Track which touch is active
  let localPressed = false; // Track mouse/touch presses separately
  
  // Combine external and local pressed states
  $: effectivePressed = isPressed || localPressed;
  
  function handlePress() {
    localPressed = true;
    if (audioEngine) {
      audioEngine.playNote(note);
    }
    dispatch('press', { index, note });
  }
  
  function handleRelease() {
    if (!localPressed) return; // Already released
    localPressed = false;
    activeTouchId = null; // Clear active touch
    if (audioEngine) {
      audioEngine.stopNote(note);
    }
    dispatch('release', { index, note });
  }
  
  function handleTouchStart(e) {
    e.preventDefault();
    
    // Only respond to the first touch on this square
    if (activeTouchId === null && e.changedTouches.length > 0) {
      activeTouchId = e.changedTouches[0].identifier;
      handlePress();
    }
  }
  
  function handleTouchEnd(e) {
    e.preventDefault();
    
    // Only release if OUR specific touch ended
    if (activeTouchId !== null) {
      // Check if our touch is in the changedTouches (the touches that ended)
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
    
    // Only release if our tracked touch was cancelled
    if (activeTouchId !== null) {
      // Check if our touch is in the changedTouches
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === activeTouchId) {
          handleRelease();
          return;
        }
      }
    }
  }
  
  function handleTouchMove(e) {
    // Only check the touch we're tracking
    if (activeTouchId === null || !element) return;
    
    // Find our touch in ALL current touches
    let ourTouch = null;
    for (let i = 0; i < e.touches.length; i++) {
      if (e.touches[i].identifier === activeTouchId) {
        ourTouch = e.touches[i];
        break;
      }
    }
    
    if (!ourTouch) {
      // Our touch disappeared
      handleRelease();
      return;
    }
    
    // Check if touch moved outside square (with generous buffer)
    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const x = ourTouch.clientX - centerX;
    const y = ourTouch.clientY - centerY;
    const distance = Math.sqrt(x * x + y * y);
    const radius = rect.width / 2;
    
    // Add 50% buffer zone - only release if REALLY outside the square
    if (distance > radius * 1.5) {
      handleRelease();
    }
  }
  
  // Safety: release on component destroy
  onDestroy(() => {
    if (localPressed) {
      handleRelease();
    }
  });
</script>

<svelte:window 
  on:blur={handleRelease}
/>

<div
  bind:this={element}
  class="square {orientation}"
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
    border-radius: 5%;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
    transition: background-color 0.1s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .square.portrait {
    width: 25vw;
    height: 25vw;
  }
  
  .square.landscape {
    width: 20vh;
    height: 20vh;
  }
  
  .square:active {
    transform: scale(0.95);
  }
  
  .note-label {
    font-size: 4vmin;
    font-weight: bold;
    color: black;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
    pointer-events: none;
  }
</style>