// SamplerEngine.js
// Web Audio API sampler — no dependencies, iOS 12 compatible
// Uses ScriptProcessorNode for recording (no MediaRecorder needed)

export class SamplerEngine {
  constructor() {
    this.audioContext = null;
    this.initialized = false;

    // Per-tile state
    // Each entry: { status: 'empty'|'recording'|'ready', buffer: AudioBuffer|null }
    this.tiles = Array.from({ length: 8 }, function() {
      return { status: 'empty', buffer: null };
    });

    // Active playback sources (so we can stop them)
    // Key: tileIndex, Value: AudioBufferSourceNode
    this.activeSources = new Map();

    // Recording state
    this.micStream = null;
    this.micSource = null;
    this.scriptProcessor = null;
    this.recordingTileIndex = null;
    this.recordingChunks = []; // array of Float32Array (mono PCM)
    this.recordingSampleRate = null;
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  async init() {
    if (this.initialized) return;

    try {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.initialized = true;
      console.log('SamplerEngine initialised, sampleRate:', this.audioContext.sampleRate);
    } catch (error) {
      console.error('SamplerEngine: failed to initialise audio context:', error);
      throw error;
    }
  }

  // ── Microphone access ─────────────────────────────────────────────────────

  async requestMicAccess() {
    try {
      // Use the older callback-style as a fallback for iOS 12
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } else if (navigator.getUserMedia) {
        // Legacy API — iOS 12 Safari may need this
        this.micStream = await new Promise(function(resolve, reject) {
          navigator.getUserMedia({ audio: true, video: false }, resolve, reject);
        });
      } else {
        throw new Error('getUserMedia not supported');
      }

      console.log('SamplerEngine: microphone access granted');
      return true;
    } catch (error) {
      console.error('SamplerEngine: microphone access denied:', error);
      return false;
    }
  }

  // ── Recording (ScriptProcessorNode — works on iOS 12) ────────────────────

  async startRecording(tileIndex) {
    if (!this.initialized) {
      console.warn('SamplerEngine: not initialised');
      return false;
    }

    // Stop any existing recording first
    if (this.recordingTileIndex !== null) {
      await this.stopRecording(this.recordingTileIndex);
    }

    // Request mic if we don't have it yet
    if (!this.micStream) {
      var granted = await this.requestMicAccess();
      if (!granted) return false;
    }

    try {
      // Resume context on iOS (requires user gesture chain)
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.recordingChunks = [];
      this.recordingTileIndex = tileIndex;
      this.recordingSampleRate = this.audioContext.sampleRate;
      this.tiles[tileIndex].status = 'recording';

      // Wire up: mic → scriptProcessor → destination (silent output keeps context alive on iOS)
      this.micSource = this.audioContext.createMediaStreamSource(this.micStream);

      // bufferSize 4096 is a safe choice for iOS 12
      // 1 input channel, 1 output channel
      this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

      var self = this;
      this.scriptProcessor.onaudioprocess = function(e) {
        if (self.recordingTileIndex === tileIndex) {
          // Copy the input buffer (don't hold a reference — it gets reused)
          var input = e.inputBuffer.getChannelData(0);
          var chunk = new Float32Array(input.length);
          chunk.set(input);
          self.recordingChunks.push(chunk);
        }
      };

      this.micSource.connect(this.scriptProcessor);
      // Must connect to destination or onaudioprocess won't fire on iOS
      this.scriptProcessor.connect(this.audioContext.destination);

      console.log('SamplerEngine: recording started for tile', tileIndex);
      return true;
    } catch (error) {
      console.error('SamplerEngine: failed to start recording:', error);
      this.tiles[tileIndex].status = 'empty';
      this.recordingTileIndex = null;
      return false;
    }
  }

  async stopRecording(tileIndex) {
    if (this.recordingTileIndex !== tileIndex) {
      console.warn('SamplerEngine: stopRecording called for wrong tile');
      return false;
    }

    try {
      // Disconnect the script processor
      if (this.scriptProcessor) {
        this.scriptProcessor.disconnect();
        this.scriptProcessor.onaudioprocess = null;
        this.scriptProcessor = null;
      }
      if (this.micSource) {
        this.micSource.disconnect();
        this.micSource = null;
      }

      // Assemble all chunks into a single Float32Array
      var totalLength = this.recordingChunks.reduce(function(acc, chunk) {
        return acc + chunk.length;
      }, 0);

      var pcmData = new Float32Array(totalLength);
      var offset = 0;
      for (var i = 0; i < this.recordingChunks.length; i++) {
        pcmData.set(this.recordingChunks[i], offset);
        offset += this.recordingChunks[i].length;
      }

      // Create an AudioBuffer directly from the PCM data (no encoding/decoding needed)
      var audioBuffer = this.audioContext.createBuffer(
        1,                          // mono
        pcmData.length,
        this.recordingSampleRate
      );
      audioBuffer.getChannelData(0).set(pcmData);

      this.tiles[tileIndex].buffer = audioBuffer;
      this.tiles[tileIndex].status = 'ready';

      console.log(
        'SamplerEngine: recording stopped for tile', tileIndex,
        '— duration:', audioBuffer.duration.toFixed(2) + 's',
        '— samples:', pcmData.length
      );

      this.recordingChunks = [];
      this.recordingTileIndex = null;
      return true;

    } catch (error) {
      console.error('SamplerEngine: failed to stop recording:', error);
      this.tiles[tileIndex].status = 'empty';
      this.recordingChunks = [];
      this.recordingTileIndex = null;
      return false;
    }
  }

  // ── Playback ──────────────────────────────────────────────────────────────

  playTile(tileIndex, options) {
    console.log('context state at playback:', this.audioContext.state);
    var loop = options && options.loop ? options.loop : false;
    var tile = this.tiles[tileIndex];

    if (!tile || tile.status !== 'ready' || !tile.buffer) {
      console.warn('SamplerEngine: tile', tileIndex, 'has no sample');
      return;
    }

    // Stop any existing playback on this tile
    this.stopTile(tileIndex);

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    var source = this.audioContext.createBufferSource();
    source.buffer = tile.buffer;
    source.loop = loop;
    source.connect(this.audioContext.destination);
    source.start(0);

    var self = this;
    this.activeSources.set(tileIndex, source);

    source.onended = function() {
      if (self.activeSources.get(tileIndex) === source) {
        self.activeSources.delete(tileIndex);
      }
    };

    console.log('SamplerEngine: playing tile', tileIndex, loop ? '(looping)' : '(one-shot)');
  }

  stopTile(tileIndex) {
    var source = this.activeSources.get(tileIndex);
    if (source) {
      try { source.stop(0); } catch (e) { /* already stopped */ }
      this.activeSources.delete(tileIndex);
    }
  }

  // ── Tile management ───────────────────────────────────────────────────────

  clearTile(tileIndex) {
    this.stopTile(tileIndex);
    this.tiles[tileIndex].buffer = null;
    this.tiles[tileIndex].status = 'empty';
    console.log('SamplerEngine: cleared tile', tileIndex);
  }

  getTileStatus(tileIndex) {
    return this.tiles[tileIndex] ? this.tiles[tileIndex].status : 'empty';
  }

  // ── Panic ─────────────────────────────────────────────────────────────────

  panic() {
    // Stop all playback
    var self = this;
    this.activeSources.forEach(function(source) {
      try { source.stop(0); } catch (e) { /* ignore */ }
    });
    this.activeSources.clear();

    // Stop any in-progress recording cleanly
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor.onaudioprocess = null;
      this.scriptProcessor = null;
    }
    if (this.micSource) {
      this.micSource.disconnect();
      this.micSource = null;
    }
    if (this.recordingTileIndex !== null) {
      this.tiles[this.recordingTileIndex].status = 'empty';
      this.recordingTileIndex = null;
      this.recordingChunks = [];
    }

    console.log('SamplerEngine: panic — all sources stopped');
  }
}
