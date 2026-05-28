<script>
  import { onMount } from 'svelte';
  import ResponsiveContainer from './lib/ResponsiveContainer.svelte';
  import GridContainer from './lib/GridContainer.svelte';
  import SplashScreen from './lib/SplashScreen.svelte';
  import IconButton from './lib/IconButton.svelte';
  import OptionsScreen from './lib/OptionsScreen.svelte';
  import { AudioEngine } from './lib/AudioEngine.js';

  let currentScreen = 'splash'; // 'splash', 'play', 'about', 'options'
  let audioEngine = null;
  let audioInitialized = false;

  let scaleConfig = {
    key: 'C',
    scale: 'major',
    octave: 4
  };

  onMount(() => {
    audioEngine = new AudioEngine();
    loadScalePreferences();
  });

  function loadScalePreferences() {
    var savedKey = localStorage.getItem('soundmakers-key');
    var savedScale = localStorage.getItem('soundmakers-scale');
    var savedOctave = localStorage.getItem('soundmakers-octave');

    if (savedKey) scaleConfig.key = savedKey;
    if (savedScale) scaleConfig.scale = savedScale;
    if (savedOctave) scaleConfig.octave = parseInt(savedOctave);

    console.log('Loaded scale preferences:', scaleConfig);
  }

  async function handleSplashClick() {
    document.body.style.setProperty('background-color', '#000', 'important');

    if (audioEngine && !audioInitialized) {
      await audioEngine.init();
      audioInitialized = true;
      console.log('Audio initialized from splash screen');
    }

    currentScreen = 'play';

    setTimeout(() => {
      window.scrollTo(0, 0);
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
      window.dispatchEvent(new Event('resize'));
    }, 100);
  }

  function gracefullyStopAllNotes() {
    if (audioEngine && audioEngine.activeOscillators) {
      var activeNotes = Array.from(audioEngine.activeOscillators.keys());
      activeNotes.forEach(function(note) {
        audioEngine.stopNote(note);
      });
    }
  }

  function handleAboutClick() {
    gracefullyStopAllNotes();
    document.body.style.setProperty('background-color', 'white', 'important');
    currentScreen = 'about';
  }

  function handleOptionsClick() {
    gracefullyStopAllNotes();
    document.body.style.setProperty('background-color', 'white', 'important');
    currentScreen = 'options';
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
    if (event.detail) {
      scaleConfig = {
        key: event.detail.key,
        scale: event.detail.scale,
        octave: event.detail.octave
      };
      console.log('Scale config updated:', scaleConfig);
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
    instructions="To play: touch or click screen or use ZXCVBNM, keys on a keyboard"
    footerNote="On Apple devices, turn off silent mode"
    on:click={handleSplashClick}
  />
{:else if currentScreen === 'about'}
  <SplashScreen
    title="Soundmakers Sampler"
    instructions="To play: touch or click screen or use ZXCVBNM, keys on a keyboard"
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
      <GridContainer {audioEngine} {scaleConfig} />
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
