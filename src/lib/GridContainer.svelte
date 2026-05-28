<script>
  import { onMount, onDestroy } from 'svelte';
  import Square from './Square.svelte';
  import { ScaleGenerator } from './ScaleGenerator.js';
  
  export let audioEngine;
  export let scaleConfig = { key: 'C', scale: 'major', octave: 4 };
  
  let squares = Array.from({ length: 9 }, function(_, i) { return i; });
  let orientation = 'portrait';
  let cleanupInterval;
  let scaleGenerator = new ScaleGenerator();
  
  // Generate scale based on configuration
  let scale = [];
  $: {
    scale = scaleGenerator.generateScale(
      scaleConfig.key,
      scaleConfig.scale,
      scaleConfig.octave
    );
    console.log('Generated scale:', scale);
    
    // Reset square states when scale changes
    resetSquareStates();
  }
  
  // Map keyboard keys to square indices
  var keyMap = {
    'z': 0,
    'x': 1,
    'c': 2,
    'v': 3,
    'b': 4,
    'n': 5,
    'm': 6,
    ',': 7,
    '.': 8
  };
  
  // Track which squares are pressed
  let squareStates = {};
  
  function resetSquareStates() {
    squareStates = {};
    squares.forEach(function(_, i) {
      if (scale[i]) {
        squareStates[scale[i]] = false;
      }
    });
  }
  
  // Track which keys are currently held down (prevent key repeat)
  let heldKeys = new Set();
  
  onMount(() => {
    // Initialize square states
    resetSquareStates();
    
    // Periodic cleanup - check for orphaned oscillators
    cleanupInterval = setInterval(function() {
      if (audioEngine) {
        // First do smart cleanup based on square states
        smartCleanup();
        // Then do nuclear cleanup of any orphaned oscillators (passing square states)
        audioEngine.cleanupOrphanedOscillators(squareStates);
      }
    }, 1000); // Check every 1 second
    
    // Add global panic button and keyboard handlers
    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('keyup', handleKeyup);
    
    // Stop all notes when page loses focus or visibility
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
  });
  
  onDestroy(() => {
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
    }
    window.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('keyup', handleKeyup);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('blur', handleWindowBlur);
    
    // Panic on unmount
    if (audioEngine) {
      audioEngine.panic();
    }
  });
  
  function handleVisibilityChange() {
    if (document.hidden && audioEngine) {
      console.log('Page hidden - stopping all notes');
      audioEngine.panic();
      // Reset all square states
      Object.keys(squareStates).forEach(function(note) {
        squareStates[note] = false;
      });
      heldKeys.clear();
    }
  }
  
  function handleWindowBlur() {
    if (audioEngine) {
      console.log('Window blur - stopping all notes');
      audioEngine.panic();
      // Reset all square states
      Object.keys(squareStates).forEach(function(note) {
        squareStates[note] = false;
      });
      heldKeys.clear();
    }
  }
  
  function smartCleanup() {
    // Get all currently playing notes
    var playingNotes = Array.from(audioEngine.activeOscillators.keys());
    
    // Stop any notes that are playing but their square is not pressed
    playingNotes.forEach(function(note) {
      if (!squareStates[note]) {
        console.warn('Cleaning up stuck note:', note);
        audioEngine.stopNote(note);
      }
    });
  }
  
  function handleKeydown(e) {
    // Press 'P' key to panic (stop all notes)
    if (e.key === 'p' || e.key === 'P') {
      if (audioEngine) {
        audioEngine.panic();
        // Reset all square states
        Object.keys(squareStates).forEach(function(note) {
          squareStates[note] = false;
        });
        heldKeys.clear();
      }
      return;
    }
    
    // Handle instrument keys (zxcvbnm,.)
    var key = e.key.toLowerCase();
    if (keyMap.hasOwnProperty(key)) {
      // Prevent key repeat - only trigger on first press
      if (heldKeys.has(key)) return;
      heldKeys.add(key);
      
      var squareIndex = keyMap[key];
      var note = scale[squareIndex];
      
      // Trigger press
      squareStates[note] = true;
      if (audioEngine) {
        audioEngine.playNote(note);
      }
      console.log('Key pressed:', key, '→', note);
    }
  }
  
  function handleKeyup(e) {
    var key = e.key.toLowerCase();
    if (keyMap.hasOwnProperty(key)) {
      heldKeys.delete(key);
      
      var squareIndex = keyMap[key];
      var note = scale[squareIndex];
      
      // Trigger release
      squareStates[note] = false;
      if (audioEngine) {
        audioEngine.stopNote(note);
      }
      console.log('Key released:', key, '→', note);
    }
  }
  
  async function initAudio() {
    // Audio should already be initialized from splash screen
    // But we can resume if suspended
    if (audioEngine && audioEngine.audioContext && audioEngine.audioContext.state === 'suspended') {
      await audioEngine.audioContext.resume();
      console.log('Audio context resumed:', audioEngine.audioContext.state);
    }
  }
  
  function updateOrientation() {
    orientation = window.innerHeight > window.innerWidth ? 'portrait' : 'landscape';
  }
  
  $: {
    if (typeof window !== 'undefined') {
      updateOrientation();
    }
  }
  
  async function handlePress(event) {
    await initAudio();
    squareStates[event.detail.note] = true;
    console.log('Square pressed:', event.detail.note);
  }
  
  function handleRelease(event) {
    squareStates[event.detail.note] = false;
    console.log('Square released:', event.detail.note);
  }
</script>

<svelte:window on:resize={updateOrientation} />

<div class="container {orientation}">
  {#each squares as index}
  <Square 
      {index}
      {orientation}
      {audioEngine}
      note={scale[index]}
      color={index % 2 === 0 ? 'rgb(255, 255, 0)' : 'rgb(0, 0, 255)'}
      activeColor="rgb(255, 0, 255)"
      isPressed={squareStates[scale[index]]}
      on:press={handlePress}
      on:release={handleRelease}
    />
  {/each}
</div>

<style>
  .container {
    display: grid;
    gap: 2vh;
    padding: 7vh 2vh 2vh 2vh;
    height: 100%;
    width: 100%;
    place-items: center;
    place-content: center;
  }

  @media (orientation: landscape) {
  .container {
    max-width: 100vh; /* or whatever value works */
    margin: 0 auto;
  }
}
  
  .container.portrait {
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 1fr);
  }
  
  .container.landscape {
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 1fr);
  }
</style>
