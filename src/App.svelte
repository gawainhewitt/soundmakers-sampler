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

  // Number of tiles — configurable in settings, persisted locally
  let tileCount = 4;
  if (typeof localStorage !== 'undefined') {
    const saved = parseInt(localStorage.getItem('tileCount') || '', 10);
    if (saved && saved > 0) tileCount = saved;
  }

  // Tile statuses live here so they survive screen changes
  // 'empty' | 'recording' | 'ready'
  let tileStatuses = Array(tileCount).fill('empty');

  onMount(() => {
    samplerEngine = new SamplerEngine(tileCount);
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

  async function handleOptionsClick() {
    if (samplerEngine) {
      const stoppedIndex = await samplerEngine.stopActiveRecording();
      if (stoppedIndex !== null && stoppedIndex < tileStatuses.length) {
        tileStatuses[stoppedIndex] = 'ready';
        tileStatuses = [...tileStatuses];
      }
    }
    document.body.style.setProperty('background-color', 'white', 'important');
    currentScreen = 'options';
  }

  async function handleAboutClick() {
    if (samplerEngine) {
      const stoppedIndex = await samplerEngine.stopActiveRecording();
      if (stoppedIndex !== null && stoppedIndex < tileStatuses.length) {
        tileStatuses[stoppedIndex] = 'ready';
        tileStatuses = [...tileStatuses];
      }
    }
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

  function resizeTileStatuses(count) {
    const next = Array.from({ length: count }, (_, i) => tileStatuses[i] || 'empty');
    tileStatuses = next;
  }

  function handleOptionsSave(event) {
    const detail = event.detail || {};
    if (detail.tileCount && detail.tileCount !== tileCount) {
      tileCount = detail.tileCount;
      resizeTileStatuses(tileCount);
      if (samplerEngine) samplerEngine.setTileCount(tileCount);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('tileCount', String(tileCount));
      }
    }

    if (detail.clearedTiles && detail.clearedTiles.length) {
      detail.clearedTiles.forEach((index) => {
        if (index >= tileCount) return;
        if (samplerEngine) samplerEngine.clearTile(index);
        if (index < tileStatuses.length) tileStatuses[index] = 'empty';
      });
      tileStatuses = [...tileStatuses];
    }

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
  <OptionsScreen
    {tileCount}
    {tileStatuses}
    getTileBuffer={(i) => (samplerEngine ? samplerEngine.getTileBuffer(i) : null)}
    getTrim={(i) => (samplerEngine ? samplerEngine.getTrim(i) : [0, 0])}
    getSpeed={(i) => (samplerEngine ? samplerEngine.getSpeed(i) : 1)}
    getReverse={(i) => (samplerEngine ? samplerEngine.getReverse(i) : false)}
    playTile={(i, opts) => (samplerEngine ? samplerEngine.playTile(i, opts) : 0)}
    stopTile={(i) => (samplerEngine ? samplerEngine.stopTile(i) : null)}
    setTrim={(i, s, e) => (samplerEngine ? samplerEngine.setTrim(i, s, e) : false)}
    setSpeed={(i, s) => (samplerEngine ? samplerEngine.setSpeed(i, s) : false)}
    setReverse={(i, r) => (samplerEngine ? samplerEngine.setReverse(i, r) : false)}
    on:save={handleOptionsSave}
  />
{/if}

<!-- Keep GridContainer always mounted so tileStatuses and samplerEngine state are preserved -->
<div class="play-layer" class:hidden={currentScreen !== 'play'}>
  <div class="icon-top-left">
    <IconButton type="info" ariaLabel="About" on:click={handleAboutClick} />
  </div>
  <div class="icon-top-right">
    <IconButton type="settings" ariaLabel="Options" on:click={handleOptionsClick} />
  </div>

  <main>
    <ResponsiveContainer>
      <GridContainer {samplerEngine} {tileCount} bind:tileStatuses />
    </ResponsiveContainer>
  </main>
</div>

<style>
  .play-layer {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: flex;
  }

  .play-layer.hidden {
    display: none;
  }

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
