<script>
  import { createEventDispatcher } from 'svelte';
  
  const dispatch = createEventDispatcher();
  
  export let type = 'info'; // 'info' or 'settings'
  export let ariaLabel = '';
  
  function handleClick() {
    dispatch('click');
  }
</script>

<button 
  class="icon-button"
  on:click={handleClick}
  aria-label={ariaLabel}
  type="button"
>

  {#if type === 'info'}
    <img src="/images/info-icon.png" alt="" style="width: 24px; height: 24px;" />
  {:else if type === 'settings'}
    <img src="/images/settings-icon.png" alt="" style="width: 24px; height: 24px;" />
  {/if}

</button>

<style>
  .icon-button {
    position: fixed;
    z-index: 1000;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background-color: rgba(255, 255, 255, 0.85);
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    padding: 0;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }
  
  .icon-button:hover {
    background-color: rgba(255, 255, 255, 0.95);
    transform: scale(1.05);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }
  
  .icon-button:active {
    transform: scale(0.95);
  }

  /* needs the !important flag to allow compatibility with ios12, otherwise images render too large */
  .icon-button img {
    width: 24px !important;
    height: 24px !important;
    max-width: 24px !important;
    max-height: 24px !important;
    display: block;
    object-fit: contain;
  }

  /* Responsive sizing */
  @media (max-width: 480px) {
    .icon-button {
      width: 44px;
      height: 44px;
    }
    
      /* needs the !important flag to allow compatibility with ios12, otherwise images render too large */
    .icon-button img {
      width: 20px !important;
      height: 20px !important;
      max-width: 20px !important;
      max-height: 20px !important;
    }
  }
</style>
