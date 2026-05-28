<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { ScaleGenerator } from './ScaleGenerator.js';
  
  const dispatch = createEventDispatcher();
  
  // Get available options
  const availableKeys = ScaleGenerator.getAllKeys();
  const availableScales = ScaleGenerator.getAllScaleTypes();
  const availableOctaves = ScaleGenerator.getAllOctaves();
  
  // Current selections (load from localStorage or use defaults)
  let selectedKey = 'C';
  let selectedScale = 'major';
  let selectedOctave = 4;
  
  // Load saved preferences on mount
  onMount(() => {
    var savedKey = localStorage.getItem('soundmakers-key');
    var savedScale = localStorage.getItem('soundmakers-scale');
    var savedOctave = localStorage.getItem('soundmakers-octave');
    
    if (savedKey) selectedKey = savedKey;
    if (savedScale) selectedScale = savedScale;
    if (savedOctave) selectedOctave = parseInt(savedOctave);
    
    window.addEventListener('keydown', handleKeydown);
  });
  
  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
  });
  
  function handleSave() {
    // Save to localStorage
    localStorage.setItem('soundmakers-key', selectedKey);
    localStorage.setItem('soundmakers-scale', selectedScale);
    localStorage.setItem('soundmakers-octave', selectedOctave.toString());
    
    // Dispatch save event with the selections
    dispatch('save', {
      key: selectedKey,
      scale: selectedScale,
      octave: selectedOctave
    });
  }
  
  function handleKeydown(e) {
    // Save on Enter or Escape
    if (e.key === 'Enter' || e.key === 'Escape') {
      handleSave();
    }
  }
  
  function selectKey(key) {
    selectedKey = key;
  }
  
  function selectScale(scale) {
    selectedScale = scale;
  }
  
  function selectOctave(octave) {
    selectedOctave = octave;
  }
</script>

<div class="options-screen">
  <div class="content">
  <h1>Options</h1>
  
  <div class="options-wrapper">
    <!-- Key Selection -->
    <div class="option-section">
      <h2>Key</h2>
      <div class="button-grid keys">
        {#each availableKeys as key}
          <button 
            class="option-button {selectedKey === key ? 'selected' : ''}"
            on:click={() => selectKey(key)}
          >
            {key}
          </button>
        {/each}
      </div>
    </div>
    
    <!-- Scale Type Selection -->
    <div class="option-section">
      <h2>Scale</h2>
      <div class="button-grid scales">
        {#each availableScales as scale}
          <button 
            class="option-button scale-button {selectedScale === scale ? 'selected' : ''}"
            on:click={() => selectScale(scale)}
          >
            {ScaleGenerator.getScaleDisplayName(scale)}
          </button>
        {/each}
      </div>
    </div>
    
    <!-- Octave Selection -->
    <div class="option-section">
      <h2>Octave</h2>
      <div class="button-grid octaves">
        {#each availableOctaves as octave}
          <button 
            class="option-button {selectedOctave === octave ? 'selected' : ''}"
            on:click={() => selectOctave(octave)}
          >
            {octave}
          </button>
        {/each}
      </div>
    </div>
  </div>
  
  <button class="save-button" on:click={handleSave}>
    Save
  </button>
</div>
</div>

<style>
  .options-screen {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: white;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    box-sizing: border-box;
    z-index: 9999;
    overflow: hidden;
  }
  
  .content {
    max-width: 700px;
    width: 100%;
    text-align: center;
    display: flex;
    flex-direction: column;
    height: 100%;
    justify-content: space-between;
  }
  
  h1 {
    font-size: 2.5rem;
    margin-bottom: 2rem;
    color: #333;
    flex-shrink: 0;
  }
  
  .option-section {
    margin-bottom: 2.5rem;
  }
  
  h2 {
    font-size: 1.3rem;
    margin-bottom: 1rem;
    color: #555;
    font-weight: 600;
  }
  
  .button-grid {
    display: grid;
    gap: 0.75rem;
    justify-content: center;
  }
  
  .button-grid.keys {
    grid-template-columns: repeat(6, 1fr);
    max-width: 500px;
    margin: 0 auto;
  }
  
  .button-grid.scales {
    grid-template-columns: repeat(2, 1fr);
    max-width: 500px;
    margin: 0 auto;
  }
  
  .button-grid.octaves {
    grid-template-columns: repeat(5, 1fr);
    max-width: 400px;
    margin: 0 auto;
  }
  
  .option-button {
    background-color: #f5f5f5;
    color: #333;
    border: 2px solid #ddd;
    padding: 0.9rem 1.2rem;
    font-size: 1rem;
    font-weight: 600;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    min-height: 50px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .option-button.scale-button {
    font-size: 0.95rem;
  }
  
  .option-button:hover {
    background-color: #e8e8e8;
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  }
  
  .option-button:active {
    transform: translateY(0);
  }
  
  .option-button.selected {
    background-color: #FBAC2E;
    color: white;
    border-color: #FBAC2E;
    box-shadow: 0 4px 12px rgba(251, 172, 46, 0.4);
  }
  
  .option-button.selected:hover {
    background-color: #E99A1A;
  }
  
  .save-button {
    background-color: #06C0F0;
    color: white;
    border: none;
    padding: 1rem 3rem;
    font-size: 1.2rem;
    font-weight: 600;
    border-radius: 50px;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 4px 12px rgba(6, 192, 240, 0.3);
    margin-top: 1rem;
    flex-shrink: 0;
  }
  
  .save-button:hover {
    background-color: #05A8D6;
    transform: translateY(-2px);
    box-shadow: 0 6px 16px rgba(6, 192, 240, 0.4);
  }
  
  .save-button:active {
    transform: translateY(0);
    box-shadow: 0 2px 8px rgba(6, 192, 240, 0.3);
  }

  /* Tablet Portrait (iPad) */
  @media (min-width: 481px) and (max-width: 1024px) and (orientation: portrait) {
    .options-screen {
      padding: 1rem 1.5rem;
    }
    
    .content {
      gap: 0.5rem;
      justify-content: flex-start;
    }
    
    h1 {
      font-size: 2.5rem;
      margin-bottom: 0.5rem;
    }
    
    h2 {
      font-size: 1.3rem;
      margin-bottom: 0.5rem;
    }
    
    .option-section {
      margin-bottom: 0.5rem;
    }
    
    .button-grid {
      gap: 0.75rem;
    }
    
    .save-button {
      margin-top: 2.5rem;
      max-width: 50%;
      align-self: center;
    }
  }
  
  /* Mobile Portrait - Stack everything, make scales 2-column */
  @media (max-width: 480px) {
    .options-screen {
      padding: 0.5rem 1rem;
    }
    
    .content {
      justify-content: flex-start;
      gap: 0.5rem;
    }
    
    h1 {
      font-size: 1.6rem;
      margin-bottom: 0.5rem;
    }
    
    h2 {
      font-size: 0.9rem;
      margin-bottom: 0.4rem;
    }
    
    .option-section {
      margin-bottom: 0.5rem;
    }
    
    .button-grid {
      gap: 0.4rem;
    }
    
    .button-grid.keys {
      grid-template-columns: repeat(3, 1fr);
    }
    
    .button-grid.scales {
      grid-template-columns: repeat(2, 1fr);
    }
    
    .option-button {
      padding: 0.55rem 0.4rem;
      font-size: 0.8rem;
      min-height: 42px;
    }
    
    .option-button.scale-button {
      font-size: 0.75rem;
    }
    
    .save-button {
      padding: 0.7rem 1.8rem;
      font-size: 0.95rem;
      margin-top: 0.3rem;
    }
  }
  
 /* Landscape mode - Horizontal rows layout */
  @media (orientation: landscape) {
    .options-screen {
      padding: 0.5rem 2rem;
      justify-content: flex-start;
    }
    
    .content {
      max-width: 100%;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
      gap: 1.2rem;
      height: auto;
      margin-top: 0.5rem;
    }
    
    h1 {
      font-size: 2.2rem;
      margin-bottom: 0.7rem;
    }
    
    .option-section {
      margin-bottom: 0;
    }
    
    h2 {
      font-size: 1.2rem;
      margin-bottom: 0.7rem;
    }
    
    .button-grid {
      gap: 0.7rem;
      max-width: 85%;
      margin: 0 auto;
    }
    
    .button-grid.keys {
      grid-template-columns: repeat(12, 1fr);
    }
    
    .button-grid.scales {
      grid-template-columns: repeat(5, 1fr);
    }
    
    .button-grid.octaves {
      grid-template-columns: repeat(5, 1fr);
    }
    
    .option-button {
      padding: 0.9rem 0.7rem;
      font-size: 1.1rem;
      min-height: 54px;
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
    }
    
    .option-button.scale-button {
      font-size: 1.05rem;
    }
    
    .save-button {
      padding: 1rem 3rem;
      font-size: 1.3rem;
      max-width: 320px;
      align-self: center;
      margin-top: 1.2rem;
    }
  }
  
  /* Very short landscape (iPhone landscape) - Two column layout */
  @media (orientation: landscape) and (max-height: 450px) {
    .options-screen {
      padding: 0.5rem 1rem;
    }
    
    .content {
      gap: 0.5rem;
      display: grid;
      grid-template-columns: 1fr auto;
      grid-template-rows: auto 1fr;
    }
    
    h1 {
      grid-column: 1 / -1;
      font-size: 1.4rem;
      margin-bottom: 0.3rem;
    }
    
    .options-wrapper {
      grid-column: 1;
      grid-row: 2;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      overflow: hidden;
      align-self: start;
    }
    
    .save-button {
      grid-column: 2;
      grid-row: 2;
      padding: 1.5rem 1rem;
      font-size: 0.9rem;
      margin-left: -4rem;
      max-width: none;
      align-self: center;
      margin-bottom: 2.5rem;
    }
    
    h2 {
      font-size: 13px !important;
      margin-bottom: 0.3rem !important;
      line-height: 1 !important;
      font-weight: 600 !important;
      height: 16px;
    }

    .option-section {
      margin-bottom: 0;
      flex-shrink: 0;
    }
    
    .button-grid {
      gap: 0.4rem;
    }
    
    .option-button {
      padding: 0.5rem 0.3rem;
      font-size: 0.7rem;
      min-height: 36px;
    }
    
    .option-button.scale-button {
      font-size: 0.65rem;
    }
    
    
  }
  
</style>
