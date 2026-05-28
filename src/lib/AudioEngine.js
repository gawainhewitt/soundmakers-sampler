import * as Tone from 'tone';

export class AudioEngine {
  constructor() {
    this.sampler = null;
    this.reverb = null;
    this.initialized = false;
    this.activeNotes = new Set(); // Track currently playing notes
  }

  // Initialize audio context (must be called after user interaction on iOS)
  async init() {
    if (this.initialized) return;
    
    try {
      // Start Tone.js audio context
      await Tone.start();
      console.log('Tone.js started, audio context state:', Tone.context.state);
      
      // Create sampler with horn samples
      this.sampler = new Tone.Sampler({
        urls: {
          B2: "horn-tone-b2-optimized.mp3",
          C3: "horn-tone-c3-optimized.mp3",
          E3: "horn-tone-e3-optimized.mp3",
          G3: "horn-tone-g3-optimized.mp3",
          A3: "horn-tone-a3-optimized.mp3",
          C4: "horn-tone-c4-optimized.mp3"
        },
        baseUrl: "/sounds/",
        release: 8,
        onload: () => {
          console.log('Sampler loaded successfully');
        }
      }).toDestination();
      
      this.initialized = true;
      console.log('AudioEngine initialized with Tone.js');
      
    } catch (error) {
      console.error('Failed to initialize audio:', error);
    }
  }

  playNote(note) {
    if (!this.sampler || !this.initialized) {
      console.warn('Sampler not ready');
      return;
    }
    
    // Stop existing note first (important for retriggering)
    this.stopNote(note);
    
    // Play the note with Tone.js (duration set to 8 seconds, will be stopped earlier if needed)
    this.sampler.triggerAttack(note, Tone.now());
    this.activeNotes.add(note);
    
    console.log('Playing note:', note);
  }

  stopNote(note) {
    if (!this.sampler || !this.initialized) return;
    
    if (this.activeNotes.has(note)) {
      // Release the note (will respect the 8-second release time)
      this.sampler.triggerRelease(note, Tone.now());
      this.activeNotes.delete(note);
      
      console.log('Stopping note:', note);
    }
  }

  // Emergency stop all notes
  panic() {
    console.log('PANIC: Stopping all notes');
    
    if (this.sampler && this.initialized) {
      // Release all currently active notes
      this.activeNotes.forEach(note => {
        this.sampler.triggerRelease(note, Tone.now());
      });
      
      // Alternative: force stop everything immediately
      this.sampler.releaseAll(Tone.now());
      
      this.activeNotes.clear();
    }
  }

  // Cleanup for orphaned notes (simplified since Tone.js handles this better)
  cleanupOrphanedOscillators(squareStates = {}) {
    // Check for notes that are marked as active but shouldn't be
    this.activeNotes.forEach(note => {
      if (!squareStates[note]) {
        console.warn('Cleaning up orphaned note:', note);
        this.stopNote(note);
      }
    });
  }

  // Force stop all (for compatibility)
  forceStopAllOscillators() {
    this.panic();
  }
}