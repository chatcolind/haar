export interface PresetEffect {
  name: string;
  params: number[];  // matches EFFECT_PARAMS order for that effect
}

export interface Preset {
  name: string;
  description: string;
  oscType: string;
  noise: boolean;
  shape: number;
  unisonVoices: number;
  unisonDetune: number;
  rootNote: string;
  octave: number;
  triggerMode: 'FREE' | 'ARP';
  scale: string;
  steps: number;
  pattern: string;
  stepRate: string;    // Tone notation e.g. '16n'
  bpm: number;
  ballX: number;       // 0-1 filter cutoff
  ballY: number;       // 0-1 wet/dry
  effects: PresetEffect[];
}

export const PRESETS: Preset[] = [
  {
    name: 'Campfire Drift',
    description: 'Warm melancholic pad',
    oscType: 'triangle', noise: false, shape: 0.65,
    unisonVoices: 2, unisonDetune: 24,
    rootNote: 'D', octave: 3, triggerMode: 'FREE',
    scale: 'Dorian', steps: 4, pattern: 'Up', stepRate: '16n', bpm: 70,
    ballX: 0.55, ballY: 0.8,
    effects: [
      { name: 'Tape',     params: [40, 50, 60] },
      { name: 'Reverb',   params: [10, 80, 70] },
      { name: 'Modulate', params: [15, 40] },
    ],
  },
  {
    name: 'Morning Transmitter',
    description: 'Bright floating Lydian',
    oscType: 'triangle', noise: false, shape: 0.6,
    unisonVoices: 2, unisonDetune: 16,
    rootNote: 'A', octave: 4, triggerMode: 'FREE',
    scale: 'Lydian', steps: 4, pattern: 'Up', stepRate: '16n', bpm: 90,
    ballX: 0.9, ballY: 0.75,
    effects: [
      { name: 'Chorus', params: [25, 60, 50] },
      { name: 'Reverb', params: [8, 60, 65] },
    ],
  },
  {
    name: 'Cinematic Descent',
    description: 'Dark heavy soundscape',
    oscType: 'sawtooth', noise: false, shape: 0.9,
    unisonVoices: 4, unisonDetune: 50,
    rootNote: 'D', octave: 2, triggerMode: 'FREE',
    scale: 'Aeolian (Minor)', steps: 4, pattern: 'Up', stepRate: '16n', bpm: 60,
    ballX: 0.35, ballY: 0.85,
    effects: [
      { name: 'Tape',   params: [50, 60, 55] },
      { name: 'Filter', params: [45, 40] },
      { name: 'Reverb', params: [14, 100, 70] },
      { name: 'Delay',  params: [50, 50, 35] },
    ],
  },
  {
    name: 'Trance Pulse',
    description: 'Rhythmic hypnotic',
    oscType: 'sine', noise: false, shape: 0.3,
    unisonVoices: 2, unisonDetune: 10,
    rootNote: 'E', octave: 3, triggerMode: 'ARP',
    scale: 'Aeolian (Minor)', steps: 4, pattern: 'Up', stepRate: '8n', bpm: 110,
    ballX: 0.6, ballY: 0.7,
    effects: [
      { name: 'Reverb', params: [6, 40, 55] },
      { name: 'Space',  params: [40, 50, 45] },
    ],
  },
  {
    name: 'Glass Arpeggio',
    description: 'Crystalline high arp',
    oscType: 'fmsine', noise: false, shape: 0.12,
    unisonVoices: 2, unisonDetune: 12,
    rootNote: 'C', octave: 5, triggerMode: 'ARP',
    scale: 'Lydian', steps: 6, pattern: 'Up/Down', stepRate: '16n', bpm: 100,
    ballX: 0.95, ballY: 0.7,
    effects: [
      { name: 'Shimmer', params: [40, 40] },
      { name: 'Reverb',  params: [10, 80, 65] },
    ],
  },
  {
    name: 'Tape Loop Ghost',
    description: 'Lo-fi degraded texture',
    oscType: 'triangle', noise: false, shape: 0.6,
    unisonVoices: 3, unisonDetune: 60,
    rootNote: 'G', octave: 3, triggerMode: 'FREE',
    scale: 'Dorian', steps: 4, pattern: 'Up', stepRate: '16n', bpm: 75,
    ballX: 0.45, ballY: 0.8,
    effects: [
      { name: 'Tape',   params: [70, 70, 60] },
      { name: 'Fuzz',   params: [35, 30] },
      { name: 'Reverb', params: [12, 90, 65] },
      { name: 'Wobble', params: [25, 35] },
    ],
  },
];
