<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';

  const dispatch = createEventDispatcher();

  export let tileCount = 4;

  const TILE_COUNT_OPTIONS = [1, 2, 4, 6, 8];
  let selectedCount = tileCount;

  function selectCount(count) {
    selectedCount = count;
  }

  function handleClose() {
    dispatch('save', { tileCount: selectedCount });
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' || e.key === 'Escape') handleClose();
  }

  onMount(() => window.addEventListener('keydown', handleKeydown));
  onDestroy(() => window.removeEventListener('keydown', handleKeydown));
</script>

<div class="options-screen">
  <h1>Settings</h1>

  <div class="setting">
    <label class="setting-label">Number of tiles</label>
    <div class="tile-count-options">
      {#each TILE_COUNT_OPTIONS as count}
        <button
          class="tile-count-option"
          class:selected={count === selectedCount}
          on:click={() => selectCount(count)}
          type="button"
        >
          {count}
        </button>
      {/each}
    </div>
  </div>

  <button class="close-button" on:click={handleClose}>Done</button>
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
    gap: 2rem;
    z-index: 9999;
  }

  h1 {
    font-size: 2.5rem;
    color: #333;
    margin: 0;
  }

  .setting {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .setting-label {
    font-size: 1.2rem;
    color: #555;
  }

  .tile-count-options {
    display: flex;
    gap: 1rem;
  }

  .tile-count-option {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    border: 2px solid #ddd;
    background-color: white;
    color: #333;
    font-size: 1.4rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .tile-count-option:hover {
    border-color: #06C0F0;
  }

  .tile-count-option.selected {
    background-color: #06C0F0;
    border-color: #06C0F0;
    color: white;
  }

  .close-button {
    background-color: #06C0F0;
    color: white;
    border: none;
    padding: 1rem 3rem;
    font-size: 1.2rem;
    font-weight: 600;
    border-radius: 50px;
    cursor: pointer;
  }
</style>