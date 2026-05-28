// SamplerEngine.js
// Web Audio API sampler — no dependencies
// Handles microphone recording and sample playback per tile

export class SamplerEngine {
  constructor() {
    this.audioContext = null;
    this.initialized = false;

    // Per-tile state
    // Each entry: { status: 'empty'|'recording'|'ready', buffer: AudioBuffer|null }
    this.tiles = Array.from({ length: 8 }, () => ({
      status: 'empty',
      buffer: null
    }));

    // Active playback sources (so we can stop them)
    // Key: tileIndex, Value: AudioBufferSourceNode
    this.activeSources = new Map();

    // Recording state
    this.mediaRecorder = null;
    this.recordingTileIndex = null;
    this.recordingChunks = [];
    this.micStream = null;
  }

  // ── Initialisation ────────────────────────────────────────────────────────

  async init() {
    if (this.initialized) return;

    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

      // iOS requires resuming the context after a user gesture
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.initialized = true;
      console.log('SamplerEngine initialised, context state:', this.audioContext.state);
    } catch (error) {
      console.error('SamplerEngine: failed to initialise audio context:', error);
      throw error;
    }
  }

  // ── Microphone access ─────────────────────────────────────────────────────

  async requestMicAccess() {
    try {
      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      console.log('SamplerEngine: microphone access granted');
      return true;
    } catch (error) {
      console.error('SamplerEngine: microphone access denied:', error);
      return false;
    }
  }

  // ── Recording ─────────────────────────────────────────────────────────────

  async startRecording(tileIndex) {
    if (!this.initialized) {
      console.warn('SamplerEngine: not initialised');
      return false;
    }

    // Already recording somewhere — stop that first
    if (this.recordingTileIndex !== null) {
      await this.stopRecording(this.recordingTileIndex);
    }

    // Request mic if we don't have it yet
    if (!this.micStream) {
      const granted = await this.requestMicAccess();
      if (!granted) return false;
    }

    try {
      this.recordingChunks = [];
      this.recordingTileIndex = tileIndex;
      this.tiles[tileIndex].status = 'recording';

      // Pick the best supported MIME type
      const mimeType = this._getBestMimeType();

      this.mediaRecorder = new MediaRecorder(
        this.micStream,
        mimeType ? { mimeType } : {}
      );

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordingChunks.push(e.data);
        }
      };

      this.mediaRecorder.start();
      console.log('SamplerEngine: recording started for tile', tileIndex, 'mime:', mimeType);
      return true;
    } catch (error) {
      console.error('SamplerEngine: failed to start recording:', error);
      this.tiles[tileIndex].status = 'empty';
      this.recordingTileIndex = null;
      return false;
    }
  }

  async stopRecording(tileIndex) {
    if (this.recordingTileIndex !== tileIndex || !this.mediaRecorder) {
      console.warn('SamplerEngine: stopRecording called for wrong tile or no active recorder');
      return false;
    }

    return new Promise((resolve) => {
      this.mediaRecorder.onstop = async () => {
        try {
          const blob = new Blob(this.recordingChunks, { type: this.mediaRecorder.mimeType });
          const arrayBuffer = await blob.arrayBuffer();
          const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

          this.tiles[tileIndex].buffer = audioBuffer;
          this.tiles[tileIndex].status = 'ready';

          console.log(
            'SamplerEngine: recording stopped for tile', tileIndex,
            '— duration:', audioBuffer.duration.toFixed(2) + 's'
          );
        } catch (error) {
          console.error('SamplerEngine: failed to decode recording:', error);
          this.tiles[tileIndex].status = 'empty';
        }

        this.recordingChunks = [];
        this.recordingTileIndex = null;
        this.mediaRecorder = null;
        resolve(true);
      };

      this.mediaRecorder.stop();
    });
  }

  // ── Playback ──────────────────────────────────────────────────────────────

  playTile(tileIndex, { loop = false } = {}) {
    const tile = this.tiles[tileIndex];
    if (!tile || tile.status !== 'ready' || !tile.buffer) {
      console.warn('SamplerEngine: tile', tileIndex, 'has no sample');
      return;
    }

    // Stop any existing playback on this tile
    this.stopTile(tileIndex);

    // Resume context if needed (iOS)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = tile.buffer;
    source.loop = loop;
    source.connect(this.audioContext.destination);
    source.start(0);

    this.activeSources.set(tileIndex, source);

    // For one-shot: clean up the map entry when playback ends naturally
    source.onended = () => {
      if (this.activeSources.get(tileIndex) === source) {
        this.activeSources.delete(tileIndex);
      }
    };

    console.log('SamplerEngine: playing tile', tileIndex, loop ? '(looping)' : '(one-shot)');
  }

  stopTile(tileIndex) {
    const source = this.activeSources.get(tileIndex);
    if (source) {
      try {
        source.stop(0);
      } catch (e) {
        // Already stopped — safe to ignore
      }
      this.activeSources.delete(tileIndex);
      console.log('SamplerEngine: stopped tile', tileIndex);
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
    return this.tiles[tileIndex]?.status ?? 'empty';
  }

  // ── Panic ─────────────────────────────────────────────────────────────────

  panic() {
    // Stop all active playback
    this.activeSources.forEach((source, index) => {
      try { source.stop(0); } catch (e) { /* ignore */ }
    });
    this.activeSources.clear();

    // Stop any in-progress recording
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    console.log('SamplerEngine: panic — all sources stopped');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  _getBestMimeType() {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',
      ''
    ];
    for (const type of candidates) {
      if (type === '' || MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
  }
}
