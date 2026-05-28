// ScaleGenerator.js - Generates musical scales for the grid

export class ScaleGenerator {
  constructor() {
    // All 12 chromatic notes
    this.chromaticNotes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    // Scale patterns in semitones from root
    this.scalePatterns = {
      'major': [0, 2, 4, 5, 7, 9, 11, 12, 14], // C D E F G A B C D
      'minor': [0, 2, 3, 5, 7, 8, 10, 12, 14], // C D Eb F G Ab Bb C D (natural minor)
      'pentatonic': [0, 2, 4, 7, 9, 12, 14, 16, 19], // C D E G A C D E G
      'major-blues': [0, 2, 3, 4, 7, 9, 12, 14, 15], // C D Eb E G A C D Eb
      'minor-blues': [0, 3, 5, 6, 7, 10, 12, 15, 17] // C Eb F F# G Bb C Eb F
    };
  }
  
  // Get note name from chromatic index
  getNoteName(chromaticIndex) {
    var normalizedIndex = chromaticIndex % 12;
    if (normalizedIndex < 0) normalizedIndex += 12;
    return this.chromaticNotes[normalizedIndex];
  }
  
  // Get chromatic index for a given note name
  getNoteIndex(noteName) {
    return this.chromaticNotes.indexOf(noteName);
  }
  
  // Generate a 9-note scale
  generateScale(rootNote, scaleType, octave) {
    var pattern = this.scalePatterns[scaleType];
    if (!pattern) {
      console.error('Unknown scale type:', scaleType);
      pattern = this.scalePatterns['major']; // fallback
    }
    
    var rootIndex = this.getNoteIndex(rootNote);
    if (rootIndex === -1) {
      console.error('Unknown root note:', rootNote);
      rootIndex = 0; // fallback to C
    }
    
    var scale = [];
    
    // Generate 9 notes
    for (var i = 0; i < 9; i++) {
      var semitones = pattern[i];
      var noteIndex = rootIndex + semitones;
      var noteName = this.getNoteName(noteIndex);
      
      // Calculate octave (adjust when crossing octave boundary)
      var noteOctave = octave + Math.floor((rootIndex + semitones) / 12);
      
      scale.push(noteName + noteOctave);
    }
    
    return scale;
  }
  
  // Get user-friendly scale names
  static getScaleDisplayName(scaleType) {
    var displayNames = {
      'major': 'Major',
      'minor': 'Minor', 
      'pentatonic': 'Pentatonic Major',
      'major-blues': 'Major Blues',
      'minor-blues': 'Minor Blues'
    };
    return displayNames[scaleType] || scaleType;
  }
  
  // Get all available keys
  static getAllKeys() {
    return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  }
  
  // Get all available scale types
  static getAllScaleTypes() {
    return ['major', 'minor', 'pentatonic', 'major-blues', 'minor-blues'];
  }
  
  // Get all available octaves
  static getAllOctaves() {
    return [1, 2, 3, 4, 5];
  }
}
