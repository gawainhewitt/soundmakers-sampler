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
  
  // Scale configuration (defaults)
  let scaleConfig = {
    key: 'C',
    scale: 'major',
    octave: 4
  };

  onMount(() => {
    // Create audio engine immediately (but don't initialize yet)
    audioEngine = new AudioEngine();
    
    // Load saved scale preferences
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
  document.body.style.setProperty('background-color', 'rgb(170, 174, 182)', 'important');
  
  // Initialize audio context on user interaction (required for iOS)
  if (audioEngine && !audioInitialized) {
    await audioEngine.init();
    audioInitialized = true;
    console.log('Audio initialized from splash screen');
  }
  
  // Show play screen
  currentScreen = 'play';
  
  // CHROME iOS FIX: Wait for layout to settle after transition
  setTimeout(() => {
    window.scrollTo(0, 0);
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', `${vh}px`);
    window.dispatchEvent(new Event('resize'));
  }, 100);
}

  function gracefullyStopAllNotes() {
    // Get all active notes and stop them gracefully (with release envelope)
    if (audioEngine && audioEngine.activeOscillators) {
      var activeNotes = Array.from(audioEngine.activeOscillators.keys());
      activeNotes.forEach(function(note) {
        audioEngine.stopNote(note);
      });
      console.log('Gracefully stopped all notes');
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
    document.body.style.setProperty('background-color', 'rgb(170, 174, 182)', 'important');
    currentScreen = 'play';

    // CHROME iOS FIX: Wait for layout to settle after transition
    setTimeout(() => {
      window.scrollTo(0, 0);
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
      window.dispatchEvent(new Event('resize'));
    }, 100);
  }

  function handleOptionsSave(event) {
  // Update scale configuration with new selections
    if (event.detail) {
      scaleConfig = {
        key: event.detail.key,
        scale: event.detail.scale,
        octave: event.detail.octave
      };
      console.log('Scale config updated:', scaleConfig);
    }
    
    document.body.style.setProperty('background-color', 'rgb(170, 174, 182)', 'important');
    currentScreen = 'play';
    // CHROME iOS FIX: Wait for layout to settle after transition
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
    title="Squares"
    instructions="To play: touch or click screen or use ZXCVBNM,. keys on a keyboard"
    footerNote="On Apple devices, turn off silent mode"
    on:click={handleSplashClick}
  />
{:else if currentScreen === 'about'}
  <SplashScreen 
    title="Squares"
    instructions="To play: touch or click screen or use ZXCVBNM,. keys on a keyboard"
    footerNote="On Apple devices, turn off silent mode"
    on:click={handleAboutClose}
  />
{:else if currentScreen === 'options'}
  <OptionsScreen on:save={handleOptionsSave} />
{:else if currentScreen === 'play'}
  <!-- Icon buttons positioned in top corners -->
  <div style="position: fixed; top: 20px; left: 20px; z-index: 1000;">
    <IconButton 
      type="info" 
      ariaLabel="About"
      on:click={handleAboutClick}
    />
  </div>
  
  <div style="position: fixed; top: 20px; right: 65px; z-index: 1000;">
    <IconButton 
      type="settings" 
      ariaLabel="Options"
      on:click={handleOptionsClick}
    />
  </div>

  <main>
    <ResponsiveContainer>
      <GridContainer {audioEngine} {scaleConfig} />
    </ResponsiveContainer>
  </main>
{/if}

<style>
  main {
    text-align: center;
    padding: 1em;
    width: 100%;
    max-width: 100%;
    box-sizing: border-box;
    margin: 0;
  }


  @media (orientation: landscape) and (max-height: 500px) {
    main {
        padding: 0.5em;
      }
    }
</style>
