// SamplerEngine.js
// Web Audio API sampler — no dependencies, iOS 12 compatible
// ScriptProcessorNode and micSource are created once and reused across recordings

import { encodeToMp3 } from './mp3Encoder.js';

export class SamplerEngine {
  constructor(tileCount) {
    this.audioContext = null;
    this.initialized = false;

    this.tiles = Array.from({ length: tileCount || 4 }, function() {
      return { status: 'empty', buffer: null, trimStart: 0, trimEnd: 0, speed: 1, reverse: false, reversedBuffer: null, reverb: 0, delay: 0, volume: 1, previousVolume: null, mp3: null, mp3Promise: null, mp3Error: null, recordingId: 0, serverSoundId: null, serverFileId: null };
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
    // A new recording starts: orphan any in-flight encode from the previous one
    this.tiles[tileIndex].recordingId = (this.tiles[tileIndex].recordingId || 0) + 1;
    this.tiles[tileIndex].mp3 = null;
    this.tiles[tileIndex].mp3Promise = null;
    this.tiles[tileIndex].mp3Error = null;
    // A fresh recording is no longer the server-loaded sound
    this.tiles[tileIndex].serverSoundId = null;
    this.tiles[tileIndex].serverFileId = null;
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
      this.tiles[tileIndex].trimStart = 0;
      this.tiles[tileIndex].trimEnd = audioBuffer.duration;
      this.tiles[tileIndex].speed = 1;
      this.tiles[tileIndex].reverse = false;
      this.tiles[tileIndex].reverb = 0;
      this.tiles[tileIndex].delay = 0;
      this.tiles[tileIndex].reversedBuffer = null;

      // ── Background MP3 encode (not awaited) ────────────────────────────────
      // Encode the recorded Float32 samples to MP3 in a Web Worker. The result
      // is stored on the tile only if no newer recording has replaced this one.
      this.tiles[tileIndex].mp3 = null;
      this.tiles[tileIndex].mp3Error = null;

      var encodeId = this.tiles[tileIndex].recordingId;
      var encodeSamples = pcmData; // Float32Array; encodeToMp3 converts internally
      var encodeStart = (import.meta.env.DEV) ? performance.now() : 0;

      this.tiles[tileIndex].mp3Promise = encodeToMp3(encodeSamples, {
        sampleRate: this.recordingSampleRate,
        channels: 1,
      })
        .then(function(blob) {
          if (self.tiles[tileIndex] && self.tiles[tileIndex].recordingId === encodeId) {
            self.tiles[tileIndex].mp3 = blob;
          }

          // TEMP: remove after encode test
          if (import.meta.env.DEV) {
            console.log(
              'SamplerEngine: mp3 encode finished for tile', tileIndex,
              'in', ((performance.now() - encodeStart) / 1000).toFixed(2) + 's',
              'size:', blob.size, 'bytes'
            );
          }
          // END TEMP
          return blob;
        })
        .catch(function(error) {
          var message = error && error.message ? error.message : String(error);
          console.error('SamplerEngine: mp3 encode failed for tile', tileIndex, message);
          if (self.tiles[tileIndex] && self.tiles[tileIndex].recordingId === encodeId) {
            self.tiles[tileIndex].mp3Error = message;
          }
        });

      console.log(
        'SamplerEngine: recording stopped for tile', tileIndex,
        '— duration:', audioBuffer.duration.toFixed(2) + 's'
      );

      this.recordingChunks = [];
      return true;

    } catch (error) {
      console.error('SamplerEngine: failed to stop recording:', error);
      this.tiles[tileIndex].status = 'empty';
      this.tiles[tileIndex].mp3 = null;
      this.tiles[tileIndex].mp3Promise = null;
      this.tiles[tileIndex].mp3Error = null;
      this.tiles[tileIndex].recordingId = (this.tiles[tileIndex].recordingId || 0) + 1;
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
    var reverse = !!tile.reverse;
    var buf = reverse ? this._getReversedBuffer(tile) : tile.buffer;
    source.buffer = buf;
    source.loop = loop;

    // Per-tile volume (linear gain, 0 = silent, clamped to 0..16)
    var volume = (typeof tile.volume === 'number') ? Math.max(0, Math.min(16, tile.volume)) : 1;
    var volumeGain = this.audioContext.createGain();
    volumeGain.gain.value = volume;

    // Dry path
    var dryGain = this.audioContext.createGain();
    dryGain.gain.value = 1.0;
    source.connect(dryGain);
    dryGain.connect(volumeGain);

    // Reverb (wet) path — ConvolverNode with a generated impulse response
    var reverbAmount = (typeof tile.reverb === 'number') ? Math.max(0, Math.min(1, tile.reverb)) : 0;
    if (reverbAmount > 0) {
      var convolver = this.audioContext.createConvolver();
      convolver.buffer = this._getImpulseResponse();
      convolver.normalize = true;
      var reverbGain = this.audioContext.createGain();
      reverbGain.gain.value = reverbAmount;
      source.connect(convolver);
      convolver.connect(reverbGain);
      reverbGain.connect(volumeGain);
    }

    // Delay (wet) path — DelayNode with feedback
    var delayAmount = (typeof tile.delay === 'number') ? Math.max(0, Math.min(1, tile.delay)) : 0;
    if (delayAmount > 0) {
      var delay = this.audioContext.createDelay(2.0);
      delay.delayTime.value = 0.3;
      var feedback = this.audioContext.createGain();
      feedback.gain.value = 0.35;
      var delayGain = this.audioContext.createGain();
      delayGain.gain.value = delayAmount;
      source.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(delayGain);
      delayGain.connect(volumeGain);
    }

    volumeGain.connect(this.audioContext.destination);

    // Playback speed effect (playbackRate; also shifts pitch)
    var speed = (typeof tile.speed === 'number' && tile.speed > 0) ? tile.speed : 1;
    source.playbackRate.value = speed;

    // Honour any trim points (default to the full buffer). Trim start/end are in
    // original-buffer time; map them into the (possibly reversed) buffer.
    var start = (typeof tile.trimStart === 'number') ? tile.trimStart : 0;
    var originalEnd = (typeof tile.trimEnd === 'number' && tile.trimEnd > 0)
      ? tile.trimEnd
      : buf.duration;
    var dur = Math.max(0.001, originalEnd - start);
    var offset = reverse ? (buf.duration - originalEnd) : start;
    source.start(0, offset, dur);

    var self = this;
    this.activeSources.set(tileIndex, source);

    source.onended = function() {
      if (self.activeSources.get(tileIndex) === source) {
        self.activeSources.delete(tileIndex);
      }
    };

    // Audible duration (seconds) accounts for the speed change
    var audible = dur / speed;
    console.log('SamplerEngine: playing tile', tileIndex, '— duration:', audible.toFixed(2) + 's', 'speed:', speed.toFixed(2));
    return audible;
  }

  setSpeed(tileIndex, speed) {
    var tile = this.tiles[tileIndex];
    if (!tile || !tile.buffer) return false;
    tile.speed = Math.max(0.25, Math.min(4, speed));
    console.log('SamplerEngine: tile', tileIndex, 'speed →', tile.speed.toFixed(2));
    return true;
  }

  getSpeed(tileIndex) {
    var tile = this.tiles[tileIndex];
    return tile ? tile.speed || 1 : 1;
  }

  setReverse(tileIndex, reverse) {
    var tile = this.tiles[tileIndex];
    if (!tile) return false;
    tile.reverse = !!reverse;
    console.log('SamplerEngine: tile', tileIndex, 'reverse →', tile.reverse);
    return true;
  }

  getReverse(tileIndex) {
    var tile = this.tiles[tileIndex];
    return tile ? !!tile.reverse : false;
  }

  setReverb(tileIndex, amount) {
    var tile = this.tiles[tileIndex];
    if (!tile) return false;
    tile.reverb = Math.max(0, Math.min(1, amount));
    console.log('SamplerEngine: tile', tileIndex, 'reverb →', tile.reverb.toFixed(2));
    return true;
  }

  getReverb(tileIndex) {
    var tile = this.tiles[tileIndex];
    return tile ? tile.reverb || 0 : 0;
  }

  setDelay(tileIndex, amount) {
    var tile = this.tiles[tileIndex];
    if (!tile) return false;
    tile.delay = Math.max(0, Math.min(1, amount));
    console.log('SamplerEngine: tile', tileIndex, 'delay →', tile.delay.toFixed(2));
    return true;
  }

  getDelay(tileIndex) {
    var tile = this.tiles[tileIndex];
    return tile ? tile.delay || 0 : 0;
  }

  getVolume(tileIndex) {
    var tile = this.tiles[tileIndex];
    return tile ? tile.volume || 0 : 1;
  }

  setVolume(tileIndex, amount) {
    var tile = this.tiles[tileIndex];
    if (!tile) return false;
    tile.volume = Math.max(0, Math.min(16, amount));
    console.log('SamplerEngine: tile', tileIndex, 'volume →', tile.volume.toFixed(2));
    return true;
  }

  // Scan the trimmed region for the largest absolute sample and set the volume
  // so that peak lands at 0.9 (a comfortable headroom). Returns the new gain.
  autoLevel(tileIndex) {
    var tile = this.tiles[tileIndex];
    if (!tile || !tile.buffer) return null;

    var data = tile.buffer.getChannelData(0);
    var startSample = Math.floor((typeof tile.trimStart === 'number' ? tile.trimStart : 0) * tile.buffer.sampleRate);
    var endSample = Math.ceil((typeof tile.trimEnd === 'number' && tile.trimEnd > 0 ? tile.trimEnd : tile.buffer.duration) * tile.buffer.sampleRate);
    startSample = Math.max(0, Math.min(data.length, startSample));
    endSample = Math.max(0, Math.min(data.length, endSample));

    var peak = 0;
    for (var i = startSample; i < endSample; i++) {
      var v = Math.abs(data[i]);
      if (v > peak) peak = v;
    }

    if (peak === 0) return null;

    var gain = Math.min(16, 0.9 / peak);
    this.tiles[tileIndex].previousVolume = this.tiles[tileIndex].volume;
    this.tiles[tileIndex].volume = gain;
    console.log('SamplerEngine: tile', tileIndex, 'auto level →', gain.toFixed(2), '(peak', peak.toFixed(3) + ')');
    return gain;
  }

  undoAutoLevel(tileIndex) {
    var tile = this.tiles[tileIndex];
    if (!tile || tile.previousVolume === null) return false;
    tile.volume = tile.previousVolume;
    tile.previousVolume = null;
    console.log('SamplerEngine: tile', tileIndex, 'volume restored →', tile.volume.toFixed(2));
    return true;
  }

  canUndoAutoLevel(tileIndex) {
    var tile = this.tiles[tileIndex];
    return tile ? tile.previousVolume !== null : false;
  }

  setTrim(tileIndex, start, end) {
    var tile = this.tiles[tileIndex];
    if (!tile || !tile.buffer) return false;
    var duration = tile.buffer.duration;
    tile.trimStart = Math.max(0, Math.min(duration, start));
    tile.trimEnd = Math.max(0, Math.min(duration, end));
    console.log('SamplerEngine: tile', tileIndex, 'trim →', tile.trimStart.toFixed(2), '-', tile.trimEnd.toFixed(2));
    return true;
  }

  // Permanently remove the audio outside the trim points, keeping only the
  // trimmed region on the tile. Returns true if the buffer was cropped.
  async cropToTrim(tileIndex) {
    var tile = this.tiles[tileIndex];
    if (!tile || !tile.buffer) return false;

    var buffer = tile.buffer;
    var rate = buffer.sampleRate;
    var startSec = (typeof tile.trimStart === 'number') ? tile.trimStart : 0;
    var endSec = (typeof tile.trimEnd === 'number' && tile.trimEnd > 0)
      ? tile.trimEnd
      : buffer.duration;

    // If the trim already covers the whole buffer there is nothing to remove
    if (startSec <= 0 && endSec >= buffer.duration) return false;

    var startSample = Math.max(0, Math.floor(startSec * rate));
    var endSample = Math.min(buffer.length, Math.floor(endSec * rate));
    var length = Math.max(1, endSample - startSample);

    var newBuffer = this.audioContext.createBuffer(buffer.numberOfChannels, length, rate);
    for (var ch = 0; ch < buffer.numberOfChannels; ch++) {
      var src = buffer.getChannelData(ch);
      var dst = newBuffer.getChannelData(ch);
      for (var i = 0; i < length; i++) {
        dst[i] = src[startSample + i];
      }
    }

    // Replace the buffer and reset trim to the full (cropped) range
    this.stopTile(tileIndex);
    tile.buffer = newBuffer;
    tile.trimStart = 0;
    tile.trimEnd = newBuffer.duration;
    tile.reversedBuffer = null;

    // The audio changed, so the sound can no longer be updated in place
    tile.serverSoundId = null;
    tile.serverFileId = null;

    // Re-encode the MP3 from the cropped channel 0 data (same pattern as
    // stopRecording): orphan any in-flight encode, then replace it.
    tile.recordingId = (tile.recordingId || 0) + 1;
    tile.mp3 = null;
    tile.mp3Error = null;

    var self = this;
    var encodeId = tile.recordingId;
    var encodeSamples = newBuffer.getChannelData(0);

    tile.mp3Promise = encodeToMp3(encodeSamples, {
      sampleRate: rate,
      channels: 1,
    })
      .then(function(blob) {
        if (self.tiles[tileIndex] && self.tiles[tileIndex].recordingId === encodeId) {
          self.tiles[tileIndex].mp3 = blob;
        }
        return blob;
      })
      .catch(function(error) {
        var message = error && error.message ? error.message : String(error);
        console.error('SamplerEngine: mp3 re-encode failed for tile', tileIndex, message);
        if (self.tiles[tileIndex] && self.tiles[tileIndex].recordingId === encodeId) {
          self.tiles[tileIndex].mp3Error = message;
        }
      });

    console.log('SamplerEngine: cropped tile', tileIndex, 'to', newBuffer.duration.toFixed(2) + 's');
    return true;
  }

  stopTile(tileIndex) {
    var source = this.activeSources.get(tileIndex);
    if (source) {
      try { source.stop(0); } catch (e) { /* already stopped */ }
      this.activeSources.delete(tileIndex);
    }
  }

  // Returns a cached reversed copy of the tile's buffer, reversing the sample
  // data itself (more reliable than a negative playbackRate, which is not
  // supported consistently across browsers). Monochannel data: for simplicity we
  // reverse the first channel.
  _getReversedBuffer(tile) {
    if (tile.reversedBuffer) return tile.reversedBuffer;

    var orig = tile.buffer;
    var channels = orig.numberOfChannels;
    var length = orig.length;
    var out = this.audioContext.createBuffer(channels, length, orig.sampleRate);
    for (var ch = 0; ch < channels; ch++) {
      var src = orig.getChannelData(ch);
      var dst = out.getChannelData(ch);
      for (var i = 0; i < length; i++) {
        dst[i] = src[length - 1 - i];
      }
    }
    tile.reversedBuffer = out;
    return out;
  }

  // ── Tile management ───────────────────────────────────────────────────────

  // Load an audio file (URL) into a tile, decoding it and marking the tile ready.
  // Reuses the normal tile path, so trim/speed/reverse/reverb/delay all apply.
  async loadTileFromUrl(fileURL, tileIndex) {
    try {
      var response = await fetch(fileURL);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      var arrayBuffer = await response.arrayBuffer();
      return await this.loadTileFromArrayBuffer(arrayBuffer, tileIndex);
    } catch (error) {
      console.error('SamplerEngine: failed to load', fileURL, 'into tile', tileIndex, error);
      return false;
    }
  }

  // Load already-fetched audio bytes into a tile, decoding and marking it ready.
  // Resets trim/speed/reverse/reverb/delay to defaults (apply settings after).
  async loadTileFromArrayBuffer(arrayBuffer, tileIndex) {
    var tile = this.tiles[tileIndex];
    if (!tile) return false;

    try {
      var self = this;
      var audioBuffer = await new Promise(function(resolve, reject) {
        self.audioContext.decodeAudioData(arrayBuffer, resolve, reject);
      });

      this.stopTile(tileIndex);
      tile.buffer = audioBuffer;
      tile.status = 'ready';
      tile.trimStart = 0;
      tile.trimEnd = audioBuffer.duration;
      tile.speed = 1;
      tile.reverse = false;
      tile.reverb = 0;
      tile.delay = 0;
      tile.volume = 1;
      tile.previousVolume = null;
      tile.reversedBuffer = null;
      // A fresh sound replaces any previous recording: discard stale MP3 state
      tile.mp3 = null;
      tile.mp3Promise = null;
      tile.mp3Error = null;
      tile.recordingId = (tile.recordingId || 0) + 1;

      console.log('SamplerEngine: loaded tile', tileIndex, '— duration:', audioBuffer.duration.toFixed(2) + 's');
      return true;
    } catch (error) {
      console.error('SamplerEngine: failed to load bytes into tile', tileIndex, error);
      return false;
    }
  }

  // Generate a simple decaying-noise impulse response, cached once.
  _getImpulseResponse() {
    if (this._reverbIR) return this._reverbIR;

    var ctx = this.audioContext;
    var rate = ctx.sampleRate;
    var length = Math.floor(rate * 2.5); // 2.5s reverb tail
    var impulse = ctx.createBuffer(2, length, rate);
    for (var ch = 0; ch < 2; ch++) {
      var data = impulse.getChannelData(ch);
      for (var i = 0; i < length; i++) {
        // exponentially decaying noise
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
      }
    }
    this._reverbIR = impulse;
    return impulse;
  }

  clearTile(tileIndex) {
    this.stopTile(tileIndex);
    this.tiles[tileIndex].buffer = null;
    this.tiles[tileIndex].status = 'empty';
    this.tiles[tileIndex].trimStart = 0;
    this.tiles[tileIndex].trimEnd = 0;
    this.tiles[tileIndex].speed = 1;
    this.tiles[tileIndex].reverse = false;
    this.tiles[tileIndex].reverb = 0;
    this.tiles[tileIndex].delay = 0;
    this.tiles[tileIndex].volume = 1;
    this.tiles[tileIndex].previousVolume = null;
    this.tiles[tileIndex].reversedBuffer = null;
    this.tiles[tileIndex].mp3 = null;
    this.tiles[tileIndex].mp3Promise = null;
    this.tiles[tileIndex].mp3Error = null;
    this.tiles[tileIndex].serverSoundId = null;
    this.tiles[tileIndex].serverFileId = null;
    this.tiles[tileIndex].recordingId = (this.tiles[tileIndex].recordingId || 0) + 1;
    console.log('SamplerEngine: cleared tile', tileIndex);
  }

  getTileStatus(tileIndex) {
    return this.tiles[tileIndex] ? this.tiles[tileIndex].status : 'empty';
  }

  getTileBuffer(tileIndex) {
    return this.tiles[tileIndex] ? this.tiles[tileIndex].buffer : null;
  }

// Trimmed duration in seconds for a ready tile, or 0 if empty
  getTileDuration(tileIndex) {
    const tile = this.tiles[tileIndex];
    if (!tile || !tile.buffer) return 0;
    const start = (typeof tile.trimStart === 'number') ? tile.trimStart : 0;
    const end = (typeof tile.trimEnd === 'number' && tile.trimEnd > 0)
      ? tile.trimEnd
      : tile.buffer.duration;
    return Math.max(0, end - start);
  }

  // Returns a Promise<Blob> for the tile's MP3 encoding.
  // - If the encode is already done, resolves immediately with the Blob.
  // - If the encode is in flight, awaits it and resolves with the Blob.
  // - Otherwise rejects with an error.
  getTileMp3(tileIndex) {
    const tile = this.tiles[tileIndex];
    if (!tile) return Promise.reject(new Error('no such tile'));
    if (tile.mp3) return Promise.resolve(tile.mp3);
    if (tile.mp3Promise) {
      return tile.mp3Promise.then(() => {
        if (tile.mp3) return tile.mp3;
        throw new Error(`no MP3 available for tile ${tileIndex}`);
      });
    }
    return Promise.reject(new Error('there is no recording to encode'));
  }

  getTileCount() {
    return this.tiles.length;
  }

  // Record that a tile's sound came from the server (used by the save flow to
  // PATCH the existing item instead of re-uploading).
  markTileFromServer(tileIndex, { soundId, fileId }) {
    var tile = this.tiles[tileIndex];
    if (!tile) return false;
    tile.serverSoundId = soundId || null;
    tile.serverFileId = fileId || null;
    return true;
  }

  // Returns { soundId, fileId } if the tile holds a server-loaded sound, or
  // { soundId: null, fileId: null } if it was recorded locally.
  getServerRef(tileIndex) {
    var tile = this.tiles[tileIndex];
    if (!tile) return { soundId: null, fileId: null };
    return {
      soundId: tile.serverSoundId || null,
      fileId: tile.serverFileId || null,
    };
  }

  getTrim(tileIndex) {
    const tile = this.tiles[tileIndex];
    if (!tile || !tile.buffer) return [0, 0];
    const dur = tile.buffer.duration;
    return [tile.trimStart || 0, tile.trimEnd || dur];
  }

  // Resize the number of tiles, preserving any existing recordings
  setTileCount(count) {
    var self = this;
    var newTiles = Array.from({ length: count }, function(_, i) {
      return self.tiles[i] || { status: 'empty', buffer: null, trimStart: 0, trimEnd: 0, speed: 1, reverse: false, reversedBuffer: null, reverb: 0, delay: 0, volume: 1, previousVolume: null, mp3: null, mp3Promise: null, mp3Error: null, recordingId: 0, serverSoundId: null, serverFileId: null };
    });

    // Stop any playback/recording that falls outside the new range
    self.activeSources.forEach(function(source, idx) {
      if (idx >= count) {
        try { source.stop(0); } catch (e) { /* ignore */ }
        self.activeSources.delete(idx);
      }
    });

    if (self.recordingTileIndex !== null && self.recordingTileIndex >= count) {
      self.isCapturing = false;
      self.recordingTileIndex = null;
      self.recordingChunks = [];
    }

    self.tiles = newTiles;
    console.log('SamplerEngine: tile count set to', count);
  }

  // ── Panic ─────────────────────────────────────────────────────────────────

  // Stop any active recording (keeping the recorded sound) and stop all
  // playback. Returns the index of the tile that was recording, or null.
  async stopActiveRecording() {
    var stoppedIndex = null;
    if (this.recordingTileIndex !== null) {
      var index = this.recordingTileIndex;
      var ok = await this.stopRecording(index);
      if (ok) stoppedIndex = index;
    }

    this.activeSources.forEach(function(source) {
      try { source.stop(0); } catch (e) { /* ignore */ }
    });
    this.activeSources.clear();

    return stoppedIndex;
  }

  panic() {
    this.activeSources.forEach(function(source) {
      try { source.stop(0); } catch (e) { /* ignore */ }
    });
    this.activeSources.clear();

    this.isCapturing = false;
    if (this.recordingTileIndex !== null) {
      var idx = this.recordingTileIndex;
      this.tiles[idx].status = 'empty';
      this.tiles[idx].mp3 = null;
      this.tiles[idx].mp3Promise = null;
      this.tiles[idx].mp3Error = null;
      this.tiles[idx].serverSoundId = null;
      this.tiles[idx].serverFileId = null;
      this.tiles[idx].recordingId = (this.tiles[idx].recordingId || 0) + 1;
      this.recordingTileIndex = null;
      this.recordingChunks = [];
    }

    console.log('SamplerEngine: panic — all sources stopped');
  }
}
