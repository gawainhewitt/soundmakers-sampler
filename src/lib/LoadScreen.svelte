<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';

  const dispatch = createEventDispatcher();

  export let title = 'Load a Kit';

  function handleClose() {
    dispatch('close');
  }

  function handleKeydown(e) {
    if (e.key === 'Enter' || e.key === 'Escape') handleClose();
  }

  onMount(() => window.addEventListener('keydown', handleKeydown));
  onDestroy(() => window.removeEventListener('keydown', handleKeydown));
</script>

<div
  class="load-screen"
  on:click={handleClose}
  on:keydown={handleKeydown}
  role="button"
  tabindex="0"
>
  <h1>{title}</h1>
  <p>Coming soon</p>
  <button class="close-button" on:click={handleClose}>Close</button>
</div>

<style>
  .load-screen {
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
    cursor: pointer;
  }

  h1 {
    font-size: 2.5rem;
    color: #333;
    margin: 0;
  }

  p {
    font-size: 1.2rem;
    color: #999;
    margin: 0;
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