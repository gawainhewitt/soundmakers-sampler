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
    /* Safari/standalone fallback: fill the visible area so the bottom logos
       are not hidden under the browser chrome in short landscape */
    height: -webkit-fill-available;
    height: 100dvh;
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

  /* ---- iPhone only ----
     Touch devices with a short side of 500px or less: iPhone portrait and
     landscape. iPads and desktops don't match, so they keep the styles above.
     These rules come last so they override the originals on iPhone. */

  /* iPhone, both orientations: one stacked column, centred vertically,
     sized from both width and height so it fits the frame */
  @media (pointer: coarse) and (max-height: 500px), (pointer: coarse) and (max-width: 500px) {
    .splash-screen {
      max-width: none;
      left: 0;
      transform: none;
      justify-content: center;
      gap: min(2.5vh, 1.5rem);
      padding: min(3vh, 1.5rem) 1.5rem;
    }

    .logo-wrapper {
      width: min(300px, 80vw, 40vh);
      max-width: none;
    }

    .content {
      flex: 0 0 auto;
      max-width: none;
    }

    h1 {
      font-size: min(3rem, 9vh);
      margin-bottom: min(2.5vh, 1.5rem);
    }

    .instructions {
      font-size: min(1.6rem, 4.5vh);
      line-height: 1.5;
      margin-bottom: min(2.5vh, 1.5rem);
    }

    .footer-note {
      font-size: min(1rem, 2.8vh);
    }

    .bottom-logos {
      max-width: 600px;
    }

    .bottom-left,
    .bottom-right {
      max-width: none;
      width: auto;
      height: min(64px, 9vh);
    }
  }

  /* iPhone landscape: no top whitespace, smaller stack so the logos sit
     inside a short frame (about 258-375px high) */
  @media (pointer: coarse) and (max-height: 500px) and (orientation: landscape) {
    .splash-screen {
      gap: 0.5vh;
      padding: 0 1.5rem 1vh;
    }

    .logo-wrapper {
      width: min(120px, 24vh);
    }

    h1 {
      font-size: min(1.6rem, 7vh);
      margin-bottom: 0;
    }

    .instructions {
      font-size: min(1rem, 4.5vh);
      line-height: 1.25;
      margin-bottom: 0;
    }

    .footer-note {
      font-size: min(0.75rem, 3vh);
    }

    .bottom-logos {
      max-width: 100%;
    }

    .bottom-left,
    .bottom-right {
      height: min(28px, 7vh);
    }
  }
</style>
