<script>
  import { setContext } from 'svelte';
  import { writable } from 'svelte/store';
  
  // Create a writable store for orientation
  const orientation = writable('portrait');
  
  // Set context so child components can access it
  setContext('orientation', orientation);
  
  // Function to check orientation
  function checkOrientation() {
    if (window.innerWidth > window.innerHeight) {
      orientation.set('landscape');
    } else {
      orientation.set('portrait');
    }
  }
  
  // Check on mount
  import { onMount } from 'svelte';
  onMount(() => {
    checkOrientation();
    
    // Listen for orientation changes
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);
    
    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  });
</script>

<div class="responsive-container">
  <slot />
</div>

<style>
    .responsive-container {
        width: 90vw;
        height: 90vh;
        /* Use dvh (dynamic viewport height) if available, fallback to vh */
        height: 90dvh;
        margin: 0 auto;
        overflow: hidden;
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        
        /* Respect safe areas (notch, home indicator) */
        padding-top: env(safe-area-inset-top);
        padding-bottom: env(safe-area-inset-bottom);
        padding-left: env(safe-area-inset-left);
        padding-right: env(safe-area-inset-right);
        
        box-sizing: border-box;
    }
</style>