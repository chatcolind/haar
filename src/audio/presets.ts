export interface PresetLayer {
  enabled: boolean;
  waveform: string;
  octave: number;
  detune: number;
  level: number;
  cutoff: number;
  pan: number;
}

export interface PresetEffect {
  name: string;
  params: number[];
}

export interface Preset {
  name: string;
  description: string;
  layers: PresetLayer[];
  shape: number;
  rootNote: string;
  octave: number;
  triggerMode: 'FREE' | 'ARP';
  scale: string;
  steps: number;
  pattern: string;
  stepRate: string;
  bpm: number;
  ballX: number;
  ballY: number;
  effects: PresetEffect[];
}

// L = layer helper
const L = (o: Partial<PresetLayer>): PresetLayer => ({
  enabled: true, waveform: 'triangle', octave: 0, detune: 0, level: 0.7, cutoff: 3000, pan: 0, ...o,
});

export const PRESETS: Preset[] = [
  {
    name: 'Cathedral',
    description: 'Full · sacred · wide',
    layers: [
      L({ waveform: 'sawtooth', octave: 0,  detune: -6, level: 0.55, cutoff: 2600, pan: -0.3 }), // body
      L({ waveform: 'sine',     octave: -1, detune: 0,  level: 0.6,  cutoff: 1200, pan: 0    }), // sub weight
      L({ waveform: 'fmsine',   octave: 1,  detune: 7,  level: 0.28, cutoff: 6000, pan: 0.4  }), // bell light
      L({ waveform: 'sine',     octave: 2,  detune: 4,  level: 0.12, cutoff: 9000, pan: 0.15, }), // air shimmer
    ],
    shape: 0.7, rootNote: 'A', octave: 3, triggerMode: 'FREE',
    scale: 'Lydian', steps: 4, pattern: 'Up', stepRate: '16n', bpm: 70,
    ballX: 0.85, ballY: 0.85,
    effects: [
      { name: 'Tape',   params: [30, 40, 45] },
      { name: 'Chorus', params: [20, 55, 45] },
      { name: 'Reverb', params: [16, 50, 75] },
    ],
  },
  {
    name: 'Rained Off',
    description: 'Sad · intimate · dark',
    layers: [
      L({ waveform: 'triangle', octave: 0,  detune: -8, level: 0.6,  cutoff: 1800, pan: -0.2 }),
      L({ waveform: 'sine',     octave: -1, detune: 0,  level: 0.5,  cutoff: 900,  pan: 0    }),
      L({ waveform: 'triangle', octave: 0,  detune: 9,  level: 0.4,  cutoff: 2200, pan: 0.25 }),
      L({ enabled: false }),
    ],
    shape: 0.72, rootNote: 'D', octave: 3, triggerMode: 'FREE',
    scale: 'Aeolian (Minor)', steps: 4, pattern: 'Up', stepRate: '16n', bpm: 60,
    ballX: 0.45, ballY: 0.85,
    effects: [
      { name: 'Tape',   params: [45, 55, 50] },
      { name: 'Delay',  params: [55, 45, 30] },
      { name: 'Reverb', params: [14, 80, 70] },
    ],
  },
  {
    name: 'Sunroom',
    description: 'Happy · warm · open',
    layers: [
      L({ waveform: 'triangle', octave: 0,  detune: -5, level: 0.6,  cutoff: 4000, pan: -0.3 }),
      L({ waveform: 'square',   octave: -1, detune: 0,  level: 0.35, cutoff: 1400, pan: 0    }),
      L({ waveform: 'fmsine',   octave: 1,  detune: 6,  level: 0.3,  cutoff: 7000, pan: 0.35 }),
      L({ enabled: false }),
    ],
    shape: 0.6, rootNote: 'C', octave: 4, triggerMode: 'FREE',
    scale: 'Ionian (Major)', steps: 4, pattern: 'Up', stepRate: '16n', bpm: 90,
    ballX: 0.9, ballY: 0.7,
    effects: [
      { name: 'Chorus', params: [30, 60, 50] },
      { name: 'Reverb', params: [8, 50, 60] },
    ],
  },
  {
    name: 'Broken Toy',
    description: 'Quirky · off-kilter · BoC',
    layers: [
      L({ waveform: 'fmsine',   octave: 0,  detune: -14, level: 0.5,  cutoff: 2800, pan: -0.35 }),
      L({ waveform: 'sawtooth', octave: -1, detune: 12,  level: 0.35, cutoff: 1500, pan: 0.3   }),
      L({ waveform: 'triangle', octave: 1,  detune: -8,  level: 0.3,  cutoff: 4500, pan: 0.15  }),
      L({ enabled: false }),
    ],
    shape: 0.6, rootNote: 'F', octave: 3, triggerMode: 'FREE',
    scale: 'Phrygian', steps: 4, pattern: 'Up', stepRate: '16n', bpm: 75,
    ballX: 0.55, ballY: 0.8,
    effects: [
      { name: 'Tape',   params: [70, 65, 55] },
      { name: 'Wobble', params: [30, 40] },
      { name: 'Fuzz',   params: [30, 30] },
      { name: 'Reverb', params: [12, 70, 65] },
    ],
  },
  {
    name: 'Tectonic',
    description: 'Huge · driven · physical',
    layers: [
      L({ waveform: 'sawtooth', octave: 0,  detune: -7, level: 0.55, cutoff: 2400, pan: -0.4 }),
      L({ waveform: 'sawtooth', octave: -1, detune: 7,  level: 0.5,  cutoff: 1000, pan: 0.4  }),
      L({ waveform: 'sine',     octave: -2, detune: 0,  level: 0.6,  cutoff: 700,  pan: 0    }), // deep sub
      L({ enabled: false }),
    ],
    shape: 0.85, rootNote: 'E', octave: 2, triggerMode: 'FREE',
    scale: 'Aeolian (Minor)', steps: 4, pattern: 'Up', stepRate: '16n', bpm: 60,
    ballX: 0.5, ballY: 0.8,
    effects: [
      { name: 'Fuzz',   params: [45, 40] },
      { name: 'Filter', params: [50, 35] },
      { name: 'Reverb', params: [14, 90, 70] },
    ],
  },
  {
    name: 'Drift',
    description: 'Eno · evolving · ambient',
    layers: [
      L({ waveform: 'sine',     octave: 0,  detune: -4, level: 0.55, cutoff: 3000, pan: -0.25 }),
      L({ waveform: 'triangle', octave: 0,  detune: 6,  level: 0.4,  cutoff: 2500, pan: 0.25  }),
      L({ waveform: 'sine',     octave: 1,  detune: 3,  level: 0.25, cutoff: 6000, pan: 0     }),
      L({ waveform: 'sine',     octave: 2,  detune: -3, level: 0.1,  cutoff: 9000, pan: 0.1   }),
    ],
    shape: 0.8, rootNote: 'A', octave: 3, triggerMode: 'FREE',
    scale: 'Whole Tone', steps: 4, pattern: 'Up', stepRate: '16n', bpm: 50,
    ballX: 0.8, ballY: 0.9,
    effects: [
      { name: 'Chorus',   params: [15, 50, 40] },
      { name: 'Reverb',   params: [18, 100, 80] },
      { name: 'Modulate', params: [10, 40] },
    ],
  },
];
