<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  
  export let title = '';
  export let instructions = '';
  export let footerNote = '';
  
  const dispatch = createEventDispatcher();
  
  function handleClick() {
    dispatch('click');
  }
  
  function handleKeydown(e) {
    // Dismiss on any key press
    dispatch('click');
  }
  
  onMount(() => {
    // Add global keydown listener
    window.addEventListener('keydown', handleKeydown);
  });
  
  onDestroy(() => {
    // Clean up listener
    window.removeEventListener('keydown', handleKeydown);
  });
</script>

<div class="splash-screen" 
     on:click={handleClick} 
     on:keydown={handleClick}
     role="button"
     tabindex="0">
  <div class="top-logo">
    <div class="logo-wrapper">
      <img src="/images/orchlablogo.png" alt="Orch Lab Logo" style="width: 300px; max-width: 100%; height: auto;" />
    </div>
  </div>
  
  <div class="content">
    <h1>{title}</h1>
    <p class="instructions">{instructions}</p>
    <p class="footer-note">{footerNote}</p>
  </div>
  
  <div class="bottom-logos">
    <img src="/images/LPO_logo.png" alt="LPO Logo" class="bottom-left" />
    <img src="/images/DMLogo.png" alt="DM Logo" class="bottom-right" />
  </div>
</div>

<style>
  .splash-screen {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: white;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 4rem 3rem 6rem 3rem;
    box-sizing: border-box;
    cursor: pointer;
    z-index: 9999;
  }

  @media (orientation: landscape) {
    .splash-screen {
      max-width: 100vh;
      left: 50%;
      transform: translateX(-50%);
    }
  }
  
  .top-logo {
    display: flex;
    justify-content: center;
    align-items: flex-start;
    width: 100%;
    flex: 0 0 auto;
  }
  
  .logo-wrapper {
    width: 300px;
    max-width: 90%;
    overflow: hidden;
  }

    /* needs the !important flag to allow compatibility with ios12, otherwise images render too large */ 
  .top-logo img {
    display: block;
    width: 100% !important;
    height: auto !important;
    max-width: 100% !important;
  }
  
  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    text-align: center;
    max-width: 600px;
  }
  
  h1 {
    font-size: 4rem;
    margin-bottom: 2rem;
    color: #333;
  }
  
  .instructions {
    font-size: 2rem;
    margin-bottom: 2rem;
    color: #555;
    line-height: 1.6;
  }
  
  .footer-note {
    font-size: 1.2rem;
    color: #777;
    font-style: italic;
  }
  
  .bottom-logos {
    width: 100%;
    max-width: calc(100% - 1rem);
    position: relative;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }
  
  .bottom-left,
  .bottom-right {
    max-width: 150px;
    height: auto;
  }
  
  @media (max-width: 768px) {
    .splash-screen {
      padding: 3rem 2rem 8rem 2rem;
    }
    
    .top-logo img {
      max-width: 200px;
    }
    
    h1 {
      font-size: 3rem;
    }
    
    .instructions {
      font-size: 2rem;
    }
    
    .footer-note {
      font-size: 1.2rem;
    }
    
    .bottom-left,
    .bottom-right {
      max-width: 100px;
    }
  }
  
  /* Landscape mode on small screens (like iPhone in landscape) */
  @media (orientation: landscape) and (max-height: 500px) {
    .splash-screen {
      padding: 1rem 2rem 3rem 2rem;
    }
    
    .logo-wrapper {
      width: 120px;
      max-width: 20%;
    }
    
    h1 {
      font-size: 1.5rem;
      margin-bottom: 0.5rem;
    }
    
    .instructions {
      font-size: 0.85rem;
      margin-bottom: 0.5rem;
    }
    
    .footer-note {
      font-size: 0.75rem;
    }
    
    .bottom-left,
    .bottom-right {
      max-width: 60px;
    }
  }
</style>