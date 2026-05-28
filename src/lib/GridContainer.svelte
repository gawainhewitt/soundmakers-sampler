<script>
  import { onMount, onDestroy } from 'svelte';
  import Square from './Square.svelte';
  import { ScaleGenerator } from './ScaleGenerator.js';
  
  export let audioEngine;
  export let scaleConfig = { key: 'C', scale: 'major', octave: 4 };

  // ── Keezy colour palette ──────────────────────────────────────────────────
  // Easy to swap: just edit this array (one colour per square, index 0–7)
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

  // Active (pressed) colour — same for all squares, easy to change
  const ACTIVE_COLOR = 'rgba(255, 255, 255, 0.55)';
  // ─────────────────────────────────────────────────────────────────────────

  let squares = Array.from({ length: 8 }, function(_, i) { return i; });
  let orientation = 'portrait';
  let cleanupInterval;
  let scaleGenerator = new ScaleGenerator();
  
  // Generate scale based on configuration (use first 8 of the 9 notes)
  let scale = [];
  $: {
    var full = scaleGenerator.generateScale(
      scaleConfig.key,
      scaleConfig.scale,
      scaleConfig.octave
    );
    scale = full.slice(0, 8);
    console.log('Generated scale (8 notes):', scale);
    resetSquareStates();
  }
  
  // Map keyboard keys to square indices (dropped '.' — now 8 keys)
  var keyMap = {
    'z': 0,
    'x': 1,
    'c': 2,
    'v': 3,
    'b': 4,
    'n': 5,
    'm': 6,
    ',': 7
  };
  
  let squareStates = {};
  
  function resetSquareStates() {
    squareStates = {};
    squares.forEach(function(_, i) {
      if (scale[i]) {
        squareStates[scale[i]] = false;
      }
    });
  }
  
  let heldKeys = new Set();
  
  onMount(() => {
    resetSquareStates();
    updateOrientation();
    
    cleanupInterval = setInterval(function() {
      if (audioEngine) {
        smartCleanup();
        audioEngine.cleanupOrphanedOscillators(squareStates);
      }
    }, 1000);
    
    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('keyup', handleKeyup);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
  });
  
  onDestroy(() => {
    if (cleanupInterval) clearInterval(cleanupInterval);
    window.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('keyup', handleKeyup);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('blur', handleWindowBlur);
    if (audioEngine) audioEngine.panic();
  });
  
  function handleVisibilityChange() {
    if (document.hidden && audioEngine) {
      audioEngine.panic();
      Object.keys(squareStates).forEach(function(note) { squareStates[note] = false; });
      heldKeys.clear();
    }
  }
  
  function handleWindowBlur() {
    if (audioEngine) {
      audioEngine.panic();
      Object.keys(squareStates).forEach(function(note) { squareStates[note] = false; });
      heldKeys.clear();
    }
  }
  
  function smartCleanup() {
    var playingNotes = Array.from(audioEngine.activeOscillators.keys());
    playingNotes.forEach(function(note) {
      if (!squareStates[note]) {
        console.warn('Cleaning up stuck note:', note);
        audioEngine.stopNote(note);
      }
    });
  }
  
  function handleKeydown(e) {
    if (e.key === 'p' || e.key === 'P') {
      if (audioEngine) {
        audioEngine.panic();
        Object.keys(squareStates).forEach(function(note) { squareStates[note] = false; });
        heldKeys.clear();
      }
      return;
    }
    
    var key = e.key.toLowerCase();
    if (keyMap.hasOwnProperty(key)) {
      if (heldKeys.has(key)) return;
      heldKeys.add(key);
      var squareIndex = keyMap[key];
      var note = scale[squareIndex];
      squareStates[note] = true;
      if (audioEngine) audioEngine.playNote(note);
    }
  }
  
  function handleKeyup(e) {
    var key = e.key.toLowerCase();
    if (keyMap.hasOwnProperty(key)) {
      heldKeys.delete(key);
      var squareIndex = keyMap[key];
      var note = scale[squareIndex];
      squareStates[note] = false;
      if (audioEngine) audioEngine.stopNote(note);
    }
  }
  
  async function initAudio() {
    if (audioEngine && audioEngine.audioContext && audioEngine.audioContext.state === 'suspended') {
      await audioEngine.audioContext.resume();
    }
  }
  
  function updateOrientation() {
    orientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
  }
  
  async function handlePress(event) {
    await initAudio();
    squareStates[event.detail.note] = true;
  }
  
  function handleRelease(event) {
    squareStates[event.detail.note] = false;
  }
</script>

<svelte:window on:resize={updateOrientation} />

<div class="grid {orientation}">
  {#each squares as index}
    <Square
      {index}
      {orientation}
      {audioEngine}
      note={scale[index]}
      color={SQUARE_COLORS[index]}
      activeColor={ACTIVE_COLOR}
      isPressed={squareStates[scale[index]]}
      on:press={handlePress}
      on:release={handleRelease}
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

  /* Portrait: 2 columns, 4 rows */
  .grid.portrait {
    grid-template-columns: repeat(2, 1fr);
    grid-template-rows: repeat(4, 1fr);
  }

  /* Landscape: 4 columns, 2 rows */
  .grid.landscape {
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(2, 1fr);
  }
</style>
