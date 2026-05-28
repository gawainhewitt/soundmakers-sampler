// SamplerEngine.js
// Web Audio API sampler — no dependencies, iOS 12 compatible
// ScriptProcessorNode and micSource are created once and reused across recordings

export class SamplerEngine {
  constructor() {
    this.audioContext = null;
    this.initialized = false;

    this.tiles = Array.from({ length: 8 }, function() {
      return { status: 'empty', buffer: null };
    });

    this.activeSources = new Map();

    // Mic infrastructure — created once, reused
    this.micStream = null;
    this.micSource = null;
    this.scriptProcessor = null;
    this.isCapturing = false;

    // Recording state
    this.recordingTileIndex = null;
    this.recordingChunks = [];
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

  // ── Microphone setup — called once ───────────────────────────────────────

  async setupMic() {
    if (this.micStream) return true;

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      } else if (navigator.getUserMedia) {
        this.micStream = await new Promise(function(resolve, reject) {
          navigator.getUserMedia({ audio: true, video: false }, resolve, reject);
        });
      } else {
        throw new Error('getUserMedia not supported');
      }

      console.log('SamplerEngine: microphone access granted');

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }

      this.micSource = this.audioContext.createMediaStreamSource(this.micStream);
      this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

      var self = this;
      this.scriptProcessor.onaudioprocess = function(e) {
        if (!self.isCapturing) return;
        var input = e.inputBuffer.getChannelData(0);
        var chunk = new Float32Array(input.length);
        chunk.set(input);
        self.recordingChunks.push(chunk);
      };

      this.micSource.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);

      console.log('SamplerEngine: mic pipeline established');
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

    if (this.recordingTileIndex !== null) {
      await this.stopRecording(this.recordingTileIndex);
    }

    var ready = await this.setupMic();
    if (!ready) return false;

    this.recordingChunks = [];
    this.recordingTileIndex = tileIndex;
    this.recordingSampleRate = this.audioContext.sampleRate;
    this.tiles[tileIndex].status = 'recording';
    this.isCapturing = true;

    console.log('SamplerEngine: recording started for tile', tileIndex);
    return true;
  }

  async stopRecording(tileIndex) {
    if (this.recordingTileIndex !== tileIndex) {
      console.warn('SamplerEngine: stopRecording called for wrong tile');
      return false;
    }

    this.isCapturing = false;
    this.recordingTileIndex = null;

    try {
      var totalLength = this.recordingChunks.reduce(function(acc, chunk) {
        return acc + chunk.length;
      }, 0);

      var pcmData = new Float32Array(totalLength);
      var offset = 0;
      for (var i = 0; i < this.recordingChunks.length; i++) {
        pcmData.set(this.recordingChunks[i], offset);
        offset += this.recordingChunks[i].length;
      }

      var wavBuffer = this._encodeWAV(pcmData, this.recordingSampleRate);
      var self = this;

      var audioBuffer = await new Promise(function(resolve, reject) {
        self.audioContext.decodeAudioData(wavBuffer, resolve, reject);
      });

      this.tiles[tileIndex].buffer = audioBuffer;
      this.tiles[tileIndex].status = 'ready';

      console.log(
        'SamplerEngine: recording stopped for tile', tileIndex,
        '— duration:', audioBuffer.duration.toFixed(2) + 's'
      );

      this.recordingChunks = [];
      return true;

    } catch (error) {
      console.error('SamplerEngine: failed to stop recording:', error);
      this.tiles[tileIndex].status = 'empty';
      this.recordingChunks = [];
      return false;
    }
  }

  // ── WAV encoding ──────────────────────────────────────────────────────────

  _encodeWAV(pcmFloat32, sampleRate) {
    var numChannels = 1;
    var bitsPerSample = 16;
    var bytesPerSample = bitsPerSample / 8;
    var blockAlign = numChannels * bytesPerSample;
    var byteRate = sampleRate * blockAlign;
    var dataLength = pcmFloat32.length * bytesPerSample;
    var bufferLength = 44 + dataLength;

    var buffer = new ArrayBuffer(bufferLength);
    var view = new DataView(buffer);

    this._writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    this._writeString(view, 8, 'WAVE');
    this._writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    this._writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    var dataOffset = 44;
    for (var i = 0; i < pcmFloat32.length; i++) {
      var s = Math.max(-1, Math.min(1, pcmFloat32[i]));
      view.setInt16(dataOffset, s < 0 ? s * 32768 : s * 32767, true);
      dataOffset += 2;
    }

    return buffer;
  }

  _writeString(view, offset, str) {
    for (var i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  // ── Playback ──────────────────────────────────────────────────────────────

  // Returns the buffer duration in seconds, or 0 if no sample
  playTile(tileIndex, options) {
    var loop = options && options.loop ? options.loop : false;
    var tile = this.tiles[tileIndex];

    if (!tile || tile.status !== 'ready' || !tile.buffer) {
      console.warn('SamplerEngine: tile', tileIndex, 'has no sample');
      return 0;
    }

    this.stopTile(tileIndex);

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    var source = this.audioContext.createBufferSource();
    source.buffer = tile.buffer;
    source.loop = loop;
    var gainNode = this.audioContext.createGain();
    gainNode.gain.value = 1.0;
    source.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    source.start(0);

    var self = this;
    this.activeSources.set(tileIndex, source);

    source.onended = function() {
      if (self.activeSources.get(tileIndex) === source) {
        self.activeSources.delete(tileIndex);
      }
    };

    console.log('SamplerEngine: playing tile', tileIndex, '— duration:', tile.buffer.duration.toFixed(2) + 's');
    return tile.buffer.duration;
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
    this.activeSources.forEach(function(source) {
      try { source.stop(0); } catch (e) { /* ignore */ }
    });
    this.activeSources.clear();

    this.isCapturing = false;
    if (this.recordingTileIndex !== null) {
      this.tiles[this.recordingTileIndex].status = 'empty';
      this.recordingTileIndex = null;
      this.recordingChunks = [];
    }

    console.log('SamplerEngine: panic — all sources stopped');
  }
}
