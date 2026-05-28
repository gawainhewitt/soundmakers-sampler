<script>
  import { onMount } from 'svelte';
  import ResponsiveContainer from './lib/ResponsiveContainer.svelte';
  import GridContainer from './lib/GridContainer.svelte';
  import SplashScreen from './lib/SplashScreen.svelte';
  import IconButton from './lib/IconButton.svelte';
  import OptionsScreen from './lib/OptionsScreen.svelte';
  import { SamplerEngine } from './lib/SamplerEngine.js';

  let currentScreen = 'splash';
  let samplerEngine = null;
  let audioInitialized = false;

  onMount(() => {
    samplerEngine = new SamplerEngine();
  });

  async function handleSplashClick() {
    document.body.style.setProperty('background-color', '#000', 'important');

    if (samplerEngine && !audioInitialized) {
      await samplerEngine.init();
      audioInitialized = true;
      console.log('SamplerEngine initialised from splash screen');
    }

    currentScreen = 'play';

    setTimeout(() => {
      window.scrollTo(0, 0);
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
      window.dispatchEvent(new Event('resize'));
    }, 100);
  }

  function handleOptionsClick() {
    if (samplerEngine) samplerEngine.panic();
    document.body.style.setProperty('background-color', 'white', 'important');
    currentScreen = 'options';
  }

  function handleAboutClick() {
    if (samplerEngine) samplerEngine.panic();
    document.body.style.setProperty('background-color', 'white', 'important');
    currentScreen = 'about';
  }

  function handleAboutClose() {
    document.body.style.setProperty('background-color', '#000', 'important');
    currentScreen = 'play';
    setTimeout(() => {
      window.scrollTo(0, 0);
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
      window.dispatchEvent(new Event('resize'));
    }, 100);
  }

  function handleOptionsSave(event) {
    document.body.style.setProperty('background-color', '#000', 'important');
    currentScreen = 'play';
    setTimeout(() => {
      window.scrollTo(0, 0);
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
      window.dispatchEvent(new Event('resize'));
    }, 100);
  }
</script>

{#if currentScreen === 'splash'}
  <SplashScreen
    title="Soundmakers Sampler"
    instructions="Tap a tile to record a sound. Tap again to play it back."
    footerNote="On Apple devices, turn off silent mode"
    on:click={handleSplashClick}
  />
{:else if currentScreen === 'about'}
  <SplashScreen
    title="Soundmakers Sampler"
    instructions="Tap a tile to record a sound. Tap again to play it back."
    footerNote="On Apple devices, turn off silent mode"
    on:click={handleAboutClose}
  />
{:else if currentScreen === 'options'}
  <OptionsScreen on:save={handleOptionsSave} />
{:else if currentScreen === 'play'}
  <div class="icon-top-left">
    <IconButton type="info" ariaLabel="About" on:click={handleAboutClick} />
  </div>
  <div class="icon-top-right">
    <IconButton type="settings" ariaLabel="Options" on:click={handleOptionsClick} />
  </div>

  <main>
    <ResponsiveContainer>
      <GridContainer {samplerEngine} />
    </ResponsiveContainer>
  </main>
{/if}

<style>
  main {
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    display: flex;
  }

  .icon-top-left {
    position: fixed;
    top: 20px;
    left: 20px;
    z-index: 1000;
  }

  .icon-top-right {
    position: fixed;
    top: 20px;
    right: 65px;
    z-index: 1000;
  }
</style>
