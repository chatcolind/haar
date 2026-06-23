export interface EffectSnapshot {
  name: string;
  dotX: number;
  dotY: number;
  level: number;
  muted: boolean;
}

export interface Snapshot {
  source: 'TONE' | 'FIELD';
  note: string;
  shape: number;
  oscType: string;
  triggerMode: 'FREE' | 'BEAT' | 'ARP';
  bpm: number;
  stepRate: string;
  arpConfig: {
    scale: string;
    steps: number;
    pattern: string;
  };
  effects: EffectSnapshot[];
}
