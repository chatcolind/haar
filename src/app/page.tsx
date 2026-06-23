'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Header from '@/components/Header';
import ClockBar from '@/components/ClockBar';
import SectionLabel from '@/components/SectionLabel';
import SoundBall, { ACCENT_COLORS } from '@/components/SoundBall';
import ChainModule from '@/components/ChainModule';
import Banks from '@/components/Banks';
import FooterBar from '@/components/FooterBar';
import { useAudio } from '@/hooks/useAudio';
import { useBankEngine } from '@/hooks/useBankEngine';
import { Snapshot } from '@/audio/snapshot';

const EFFECT_TYPES = [
  'Reverb','Tape','Delay','Chorus','Filter','Pitch','Modulate','Grain',
  'Fuzz','Crush','Shimmer','Warp','Wobble','Pulse','Space',
];

const SCALE_HINTS: Record<string, string> = {
  'Ionian (Major)':'Bright · resolved · uplifting','Dorian':'Jazzy · hopeful minor',
  'Phrygian':'Dark · tense · Spanish','Phrygian Dominant':'Arabic · Middle Eastern',
  'Lydian':'Floating · ethereal · Debussy','Lydian Dominant':'Jazz float · cinematic',
  'Mixolydian':'Warm · open · bluesy','Aeolian (Minor)':'Melancholic · classic minor',
  'Locrian':'Unstable · dark · experimental','Melodic Minor':'Sophisticated · jazz',
  'Harmonic Minor':'Classical · tense','Hungarian Minor':'Exotic · Eastern European',
  'Persian':'Ancient · very Middle Eastern','Whole Tone':'Dreamlike · no resolution',
  'Diminished':'Symmetrical · cinematic tension','Pentatonic Minor':'Universal · no tension',
  'Pentatonic Major':'Open · positive','Blues':'Expressive · soulful',
};

const SCALE_NAMES = Object.keys(SCALE_HINTS);
const PATTERNS    = ['Up','Down','Up/Down','Random'];
const STEP_RATES  = ['1/4','1/8','1/16','1/32'];
const RATE_TO_TONE: Record<string,string> = { '1/4':'4n','1/8':'8n','1/16':'16n','1/32':'32n' };

const EXTENDED_ACCENTS: Record<string,string> = {
  Fuzz:'#C03020',Crush:'#606060',Shimmer:'#80C0E0',
  Warp:'#8040C0',Wobble:'#40A060',Pulse:'#E06020',Space:'#2080C0',
};
const ALL_ACCENTS = { ...ACCENT_COLORS, ...EXTENDED_ACCENTS };

const EFFECT_DESCRIPTIONS: Record<string,string> = {
  Reverb:'Space · decay · room size',Tape:'Warmth · saturation · wow',
  Delay:'Echo · repeat · feedback',Chorus:'Shimmer · width · movement',
  Filter:'Tone shaping · cutoff · resonance',Pitch:'Transpose · detune',
  Modulate:'LFO filter sweep',Grain:'Granular texture · scatter',
  Fuzz:'Distortion · overdrive · grit',Crush:'Bit reduction · lo-fi · crunch',
  Shimmer:'Harmonic overtones · Eno-like',Warp:'Frequency shift · alien textures',
  Wobble:'Tape vibrato · pitch flutter',Pulse:'Tremolo · rhythmic amplitude',
  Space:'Ping-pong delay · stereo field',
};

interface EffectModule {
  id:number; name:string; volume:number; muted:boolean;
  dotX:number; dotY:number; level:number;
}
let nextId = 10;

function useChain(initial: string[], audio: ReturnType<typeof useAudio>) {
  const [modules, setModules] = useState<EffectModule[]>(
    initial.map((name, i) => ({ id:i+1, name, volume:70, muted:false, dotX:0.5, dotY:0.5, level:70 }))
  );
  const [activeId, setActiveId] = useState<number>(initial.length > 0 ? 1 : -1);
  const activeModule = modules.find(m => m.id === activeId) || modules[0];

  useEffect(() => { audio.syncChainModules(modules); }, [modules]);

  const addEffect = (name: string) => {
    const id = nextId++;
    setModules(prev => [...prev, { id, name, volume:70, muted:false, dotX:0.5, dotY:0.5, level:70 }]);
    setActiveId(id);
  };

  const removeEffect = (id: number) => {
    audio.onRemoveEffect(id);
    setModules(prev => {
      const remaining = prev.filter(m => m.id !== id);
      if (activeId === id && remaining.length > 0) setActiveId(remaining[0].id);
      return remaining;
    });
  };

  const updateModule = (id: number, updates: Partial<EffectModule>) => {
    setModules(prev => prev.map(m => {
      if (m.id !== id) return m;
      const updated = { ...m, ...updates };
      if (updates.dotX !== undefined || updates.dotY !== undefined) {
        audio.onDotMove(id, updated.dotX, updated.dotY);
      }
      if (updates.muted !== undefined) audio.onMuteEffect(id, updated.muted);
      return updated;
    }));
  };

  const loadFromSnapshot = (effects: Snapshot['effects']) => {
    const newModules = effects.map((e, i) => ({
      id: nextId++, name: e.name, volume: 70,
      muted: e.muted, dotX: e.dotX, dotY: e.dotY, level: e.level,
    }));
    setModules(newModules);
    if (newModules.length > 0) setActiveId(newModules[0].id);
  };

  return { modules, activeId, setActiveId, activeModule, addEffect, removeEffect, updateModule, loadFromSnapshot };
}

const BANK_PICKER_COLORS = ['#1B5CE8','#D46090','#E8B800','#20C060','#D63020','#9020C0'];

function BankPicker({ source, onSelect, onCancel, banks }: {
  source:'TONE'|'FIELD'; onSelect:(id:number)=>void; onCancel:()=>void;
  banks:{ id:number; name:string; state:string }[];
}) {
  return (
    <div style={{ position:'absolute', bottom:'calc(100% + 4px)', left:0, right:0, background:'var(--cream-light)', border:'1px solid var(--border)', borderBottom:'none', zIndex:100, padding:'12px 16px', boxShadow:'0 -4px 16px rgba(0,0,0,0.08)' }}>
      <div style={{ fontFamily:'Space Mono, monospace', fontSize:'10px', color:'var(--light)', letterSpacing:'2px', textTransform:'uppercase', marginBottom:'10px' }}>
        Store {source} sound to bank
      </div>
      <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
        {banks.map((bank, i) => (
          <button key={bank.id} onClick={() => onSelect(bank.id)} style={{ fontFamily:'Rajdhani, sans-serif', fontWeight:600, fontSize:'13px', letterSpacing:'2px', textTransform:'uppercase', padding:'10px 18px', cursor:'pointer', background:bank.state==='EMPTY'?BANK_PICKER_COLORS[i%BANK_PICKER_COLORS.length]:'var(--cream-dark)', border:`2px solid ${bank.state==='EMPTY'?BANK_PICKER_COLORS[i%BANK_PICKER_COLORS.length]:'var(--border)'}`, color:bank.state==='EMPTY'?'white':'var(--light)', clipPath:'polygon(5px 0%, 100% 0%, calc(100% - 5px) 100%, 0% 100%)', opacity:bank.state==='EMPTY'?1:0.6 }}>
            {bank.name}
            {bank.state!=='EMPTY'&&<span style={{ display:'block', fontSize:'9px', letterSpacing:'1px', color:'var(--light)', marginTop:'2px' }}>overwrite</span>}
          </button>
        ))}
        <button onClick={onCancel} style={{ fontFamily:'Space Mono, monospace', fontSize:'10px', padding:'8px 12px', background:'transparent', border:'1px solid var(--border)', color:'var(--light)', cursor:'pointer', marginLeft:'auto', alignSelf:'center' }}>cancel</button>
      </div>
    </div>
  );
}

function ToneControls({ audio, bpm, onSnapshotLoad }: {
  audio: ReturnType<typeof useAudio>;
  bpm: number;
  onSnapshotLoad?: (cb: (snap: Snapshot) => void) => void;
}) {
  const [unisonVoices, setUnisonVoices] = useState(1);
  const [unisonDetune, setUnisonDetune] = useState(20);
  const [scale, setScaleState]       = useState('Lydian');
  const [steps, setStepsState]       = useState(4);
  const [pattern, setPatternState]   = useState('Up');
  const [stepRate, setStepRateState] = useState('1/16');

  const setScale    = (v: string) => { setScaleState(v);   audio.updateArpConfig({ scale:v, bpm }); };
  const setSteps    = (v: number) => { setStepsState(v);   audio.updateArpConfig({ steps:v, bpm }); };
  const setPattern  = (v: string) => { setPatternState(v); audio.updateArpConfig({ pattern:v, bpm }); };
  const setStepRate = (v: string) => { setStepRateState(v); audio.updateArpConfig({ stepRate:RATE_TO_TONE[v]??v, bpm }); };

  // Expose a way to load a snapshot into these controls
  useEffect(() => {
    if (onSnapshotLoad) {
      onSnapshotLoad((snap: Snapshot) => {
        setScaleState(snap.arpConfig.scale);
        setStepsState(snap.arpConfig.steps);
        setPatternState(snap.arpConfig.pattern);
        const displayRate = Object.entries(RATE_TO_TONE).find(([,v]) => v === snap.stepRate)?.[0] ?? '1/16';
        setStepRateState(displayRate);
      });
    }
  }, [onSnapshotLoad]);

  const KEYS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

  const smBtn = (active: boolean, ac = 'var(--blue)', ab = 'var(--blue-dark)') => ({
    fontFamily:'Space Mono, monospace' as const, fontSize:'11px', padding:'4px 8px',
    cursor:'pointer' as const,
    background: active ? ac : 'var(--cream-light)',
    border: `1px solid ${active ? ab : 'var(--border)'}`,
    color: active ? 'white' : 'var(--mid)',
  });

  const selectStyle = {
    fontFamily:'Rajdhani, sans-serif' as const, fontWeight:500,
    fontSize:'13px', padding:'6px 10px', flex:1 as const,
    background:'var(--cream-light)', border:'1px solid var(--border)',
    color:'var(--dark)', cursor:'pointer' as const,
  };

  const rowLabel = (t: string) => (
    <span style={{ fontFamily:'Space Mono, monospace', fontSize:'11px', color:'var(--mid)', letterSpacing:'1px', width:'48px', flexShrink:0 }}>{t}</span>
  );

  const shapeLabel = audio.shape < 0.25 ? 'PING' : audio.shape < 0.55 ? 'PLUCK' : audio.shape < 0.8 ? 'SWELL' : 'DRONE';
  const shapeColor = audio.shape < 0.25 ? 'var(--gold)' : audio.shape < 0.55 ? 'var(--pink)' : audio.shape < 0.8 ? '#9020C0' : 'var(--blue)';

  const handlePlay = () => {
    if (audio.isPlaying) { audio.stop(); return; }
    audio.play({ scale, steps, pattern, stepRate: RATE_TO_TONE[stepRate]??stepRate, bpm });
  };

  const playBtnLabel = () => {
    if (audio.isPlaying) return { icon:'■', label:'STOP' };
    if (audio.triggerMode === 'ARP') return { icon:'▶', label:'ARP' };
    return { icon:'▶', label:'PLAY' };
  };
  const { icon, label } = playBtnLabel();

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'10px', width:'220px' }}>

      {/* Source selector */}
      <div style={{ display:'flex', gap:'3px', flexWrap:'wrap' }}>
        {[
          { id:'sine', label:'SINE', noise:false }, { id:'triangle', label:'TRI', noise:false },
          { id:'sawtooth', label:'SAW', noise:false }, { id:'square', label:'SQR', noise:false },
          { id:'fmsine', label:'FM', noise:false }, { id:'pink', label:'NOISE', noise:true },
        ].map(({ id, label: btnLabel, noise }) => (
          <button key={id} onClick={() => {
            if (noise) {
              const isActive = audio.oscillator === id;
              if (isActive) { audio.setNoise?.(false); audio.changeOscillator('triangle'); }
              else { audio.changeOscillator(id); audio.setNoise?.(true, 'pink'); }
            } else {
              audio.setNoise?.(false);
              audio.changeOscillator(id);
            }
          }} style={{
            fontFamily:'Space Mono, monospace', fontSize:'10px',
            padding:'4px 8px', cursor:'pointer', letterSpacing:'1px',
            background: audio.oscillator === id ? (noise ? 'var(--gold)' : 'var(--blue)') : 'var(--cream-light)',
            border: `1px solid ${audio.oscillator === id ? (noise ? '#c49a00' : 'var(--blue-dark)') : 'var(--border)'}`,
            color: audio.oscillator === id ? (noise ? '#1A1400' : 'white') : 'var(--mid)',
            flex: 1,
          }}>{btnLabel}</button>
        ))}
      </div>

      {/* Unison + Detune */}
      <div style={{ background:'var(--cream-dark)', border:'1px solid var(--border)', borderLeft:'3px solid var(--gold)', padding:'10px 12px', display:'flex', flexDirection:'column', gap:'8px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <span style={{ fontFamily:'Space Mono, monospace', fontSize:'10px', color:'var(--light)', letterSpacing:'1px' }}>UNISON</span>
          <div style={{ display:'flex', gap:'3px' }}>
            {[1,2,3,4].map(v => (
              <button key={v} onClick={() => { setUnisonVoices(v); audio.setUnison(v, unisonDetune); }} style={{
                fontFamily:'Space Mono, monospace', fontSize:'10px', padding:'3px 8px', cursor:'pointer',
                background: unisonVoices===v ? 'var(--gold)' : 'var(--cream-light)',
                border: `1px solid ${unisonVoices===v ? '#c49a00' : 'var(--border)'}`,
                color: unisonVoices===v ? '#1A1400' : 'var(--mid)',
              }}>{v}</button>
            ))}
          </div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
          <span style={{ fontFamily:'Space Mono, monospace', fontSize:'10px', color:'var(--light)', letterSpacing:'1px', width:'44px' }}>DETUNE</span>
          <div
            style={{ flex:1, height:'4px', background:'var(--cream-light)', position:'relative' as const, cursor:'pointer', borderRadius:'2px', opacity: unisonVoices===1 ? 0.3 : 1 }}
            onClick={e => {
              if (unisonVoices === 1) return;
              const r = e.currentTarget.getBoundingClientRect();
              const v = Math.round(Math.min(1, Math.max(0, (e.clientX-r.left)/r.width)) * 100);
              setUnisonDetune(v);
              audio.setUnison(unisonVoices, v);
            }}
            onMouseMove={e => {
              if (e.buttons !== 1 || unisonVoices === 1) return;
              const r = e.currentTarget.getBoundingClientRect();
              const v = Math.round(Math.min(1, Math.max(0, (e.clientX-r.left)/r.width)) * 100);
              setUnisonDetune(v);
              audio.setUnison(unisonVoices, v);
            }}
          >
            <div style={{ height:'100%', width:`${unisonDetune}%`, background:'var(--gold)', borderRadius:'2px' }}/>
            <div style={{ position:'absolute' as const, top:'-6px', left:`${unisonDetune}%`, transform:'translateX(-50%)', width:'14px', height:'14px', borderRadius:'50%', background:'var(--cream-light)', border:'2px solid var(--gold)' }}/>
          </div>
          <span style={{ fontFamily:'Space Mono, monospace', fontSize:'10px', color:'var(--gold)', minWidth:'28px', textAlign:'right' as const }}>{unisonDetune}¢</span>
        </div>
      </div>

      {/* Shape dial */}
      <div style={{ background:'var(--cream-dark)', border:'1px solid var(--border)', borderLeft:`3px solid ${shapeColor}`, padding:'10px 12px', display:'flex', flexDirection:'column', gap:'6px', transition:'border-color 0.3s' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ fontFamily:'Space Mono, monospace', fontSize:'10px', color:'var(--light)', letterSpacing:'1px' }}>PING</span>
          <span style={{ fontFamily:'Rajdhani, sans-serif', fontWeight:700, fontSize:'14px', letterSpacing:'3px', color:shapeColor, transition:'color 0.2s' }}>{shapeLabel}</span>
          <span style={{ fontFamily:'Space Mono, monospace', fontSize:'10px', color:'var(--light)', letterSpacing:'1px' }}>DRONE</span>
        </div>
        <div
          style={{ height:'4px', background:'var(--cream-light)', position:'relative' as const, cursor:'pointer', borderRadius:'2px' }}
          onClick={e => { const r=e.currentTarget.getBoundingClientRect(); audio.changeShape(Math.min(1,Math.max(0,(e.clientX-r.left)/r.width))); }}
          onMouseMove={e => { if(e.buttons!==1) return; const r=e.currentTarget.getBoundingClientRect(); audio.changeShape(Math.min(1,Math.max(0,(e.clientX-r.left)/r.width))); }}
        >
          <div style={{ height:'100%', width:`${audio.shape*100}%`, background:shapeColor, borderRadius:'2px', transition:'background 0.2s' }}/>
          <div style={{ position:'absolute' as const, top:'-6px', left:`${audio.shape*100}%`, transform:'translateX(-50%)', width:'14px', height:'14px', borderRadius:'50%', background:'var(--cream-light)', border:`2px solid ${shapeColor}`, transition:'border-color 0.2s' }}/>
        </div>
        <div style={{ fontFamily:'Space Mono, monospace', fontSize:'9px', color:'var(--light)', letterSpacing:'1px', textAlign:'center' as const }}>drag to morph · works live</div>
      </div>

      {/* Mode toggle */}
      <div style={{ display:'flex', gap:'4px' }}>
        <button onClick={() => audio.setTriggerMode('FREE')} style={{
          flex:1, fontFamily:'Rajdhani, sans-serif', fontWeight:700,
          fontSize:'12px', letterSpacing:'2px', padding:'8px 4px',
          cursor:'pointer', textAlign:'center' as const,
          background: audio.triggerMode!=='ARP'?'var(--blue)':'var(--cream-light)',
          border:`1px solid ${audio.triggerMode!=='ARP'?'var(--blue-dark)':'var(--border)'}`,
          color: audio.triggerMode!=='ARP'?'white':'var(--mid)',
          clipPath:'polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)',
        }}>PLAY</button>
        <button onClick={() => audio.setTriggerMode('ARP')} style={{
          flex:1, fontFamily:'Rajdhani, sans-serif', fontWeight:700,
          fontSize:'12px', letterSpacing:'2px', padding:'8px 4px',
          cursor:'pointer', textAlign:'center' as const,
          background: audio.triggerMode==='ARP'?'var(--gold)':'var(--cream-light)',
          border:`1px solid ${audio.triggerMode==='ARP'?'#c49a00':'var(--border)'}`,
          color: audio.triggerMode==='ARP'?'#1A1400':'var(--mid)',
          clipPath:'polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)',
        }}>ARP</button>
      </div>

      {/* Play button */}
      <button onClick={handlePlay} style={{
        width:'100%', padding:'14px', fontFamily:'Rajdhani, sans-serif', fontWeight:700,
        fontSize:'18px', letterSpacing:'4px', textTransform:'uppercase', cursor:'pointer',
        border:`2px solid ${audio.isPlaying?'var(--pink)':'var(--blue)'}`,
        background:audio.isPlaying?'var(--pink)':'var(--blue)', color:'white',
        clipPath:'polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)',
        transition:'background 0.2s, border-color 0.2s',
        display:'flex', alignItems:'center', justifyContent:'center', gap:'10px',
      }}>
        <span style={{ fontSize:'16px' }}>{icon}</span>{label}
      </button>

      {/* Root note */}
      <div style={{ display:'flex', gap:'3px', flexWrap:'wrap' }}>
        {KEYS.map(k => (
          <button key={k} onClick={() => audio.changeNote(k, audio.octave)}
            style={{...smBtn(audio.rootNote===k), minWidth:'28px', textAlign:'center' as const, padding:'4px 5px'}}
          >{k}</button>
        ))}
      </div>

      {/* Octave */}
      <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
        {rowLabel('OCT')}
        <div style={{ display:'flex', gap:'4px' }}>
          {[1,2,3,4].map(o => (
            <button key={o} onClick={() => audio.changeNote(audio.rootNote, o)}
              style={{...smBtn(audio.octave===o), padding:'5px 12px'}}
            >{o}</button>
          ))}
        </div>
      </div>

      {/* ARP options */}
      {audio.triggerMode === 'ARP' && (
        <div style={{ display:'flex', flexDirection:'column', gap:'10px', padding:'12px', background:'var(--cream-dark)', border:'1px solid var(--border)', borderLeft:'3px solid var(--gold)' }}>
          <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
              {rowLabel('SCALE')}
              <select value={scale} onChange={e=>setScale(e.target.value)} style={selectStyle}>
                {SCALE_NAMES.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={{ fontFamily:'Space Mono, monospace', fontSize:'11px', color:'var(--mid)', paddingLeft:'56px' }}>{SCALE_HINTS[scale]}</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            {rowLabel('STEPS')}
            <div style={{ display:'flex', gap:'3px', flexWrap:'wrap' as const }}>
              {[2,3,4,5,6,7,8].map(s => (
                <button key={s} onClick={()=>setSteps(s)} style={{...smBtn(steps===s),padding:'4px 7px',fontSize:'11px'}}>{s}</button>
              ))}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            {rowLabel('PATT')}
            <select value={pattern} onChange={e=>setPattern(e.target.value)} style={selectStyle}>
              {PATTERNS.map(p=><option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            {rowLabel('RATE')}
            <div style={{ display:'flex', gap:'4px' }}>
              {STEP_RATES.map(r => (
                <button key={r} onClick={()=>setStepRate(r)} style={{...smBtn(stepRate===r),padding:'4px 7px',fontSize:'11px'}}>{r}</button>
              ))}
            </div>
          </div>
          <div style={{ fontFamily:'Space Mono, monospace', fontSize:'10px', color:'var(--light)', letterSpacing:'1px' }}>
            {steps} steps · changes apply live
          </div>
        </div>
      )}
    </div>
  );
}

function FieldControls({ recRunning, recSecs, onRec, onStop }: {
  recRunning:boolean; recSecs:number; onRec:()=>void; onStop:()=>void;
}) {
  const fmtTime = (s:number) => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  return (
    <div style={{ width:'220px', display:'flex', flexDirection:'column', gap:'10px' }}>
      <button onClick={recRunning?onStop:onRec} style={{ fontFamily:'Rajdhani, sans-serif', fontWeight:700, fontSize:'18px', letterSpacing:'3px', textTransform:'uppercase', padding:'14px 20px', background:recRunning?'var(--cream-light)':'var(--red)', border:`2px solid ${recRunning?'var(--border)':'var(--red-dark)'}`, color:recRunning?'var(--mid)':'white', cursor:'pointer', clipPath:'polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)' }}>{recRunning?'■  STOP':'●  REC'}</button>
      <div style={{ display:'flex', gap:'8px' }}>
        {[{label:'Loop',bg:'var(--gold)',color:'#1A1400',border:'var(--gold-dark)'}].map(({label,bg,color,border})=>(
          <button key={label} style={{ fontFamily:'Rajdhani, sans-serif', fontWeight:600, fontSize:'14px', letterSpacing:'2px', textTransform:'uppercase', padding:'10px 0', flex:1, background:bg, border:`1px solid ${border}`, color, cursor:'pointer', clipPath:'polygon(5px 0%, 100% 0%, calc(100% - 5px) 100%, 0% 100%)' }}>{label}</button>
        ))}
      </div>
      <div style={{ background:'var(--cream-dark)', border:'1px solid var(--border)', borderLeft:`3px solid ${recRunning?'var(--red)':'var(--pink)'}`, padding:'12px 14px' }}>
        <div style={{ display:'flex', gap:'16px', marginBottom:'10px' }}>
          {[{label:'TIME',value:fmtTime(recSecs)},{label:'GRID',value:'4/4 · 110'},{label:'SNAP',value:'1 BAR'}].map(({label,value})=>(
            <div key={label}>
              <div style={{ fontFamily:'Space Mono, monospace', fontSize:'11px', color:'var(--light)', letterSpacing:'1px', marginBottom:'3px' }}>{label}</div>
              <div style={{ fontFamily:'Rajdhani, sans-serif', fontWeight:600, fontSize:'16px', color:'var(--dark)', letterSpacing:'1px' }}>{value}</div>
            </div>
          ))}
        </div>
        <div style={{ fontFamily:'Space Mono, monospace', fontSize:'11px', color:recRunning?'var(--red)':'var(--pink)', letterSpacing:'1px', lineHeight:1.4, borderTop:'1px solid var(--border)', paddingTop:'8px' }}>
          {recRunning?'● RECORDING — SNAP ON STOP':'STANDBY — SNAP TO BAR'}
        </div>
      </div>
    </div>
  );
}

function SignalSection({ inputLabel, isField=false, chain, bankEngine, audio, bpm, editingBankId, onSnapshotLoad }: {
  inputLabel:string; isField?:boolean;
  chain: ReturnType<typeof useChain>;
  bankEngine: ReturnType<typeof useBankEngine>;
  audio: ReturnType<typeof useAudio>;
  bpm: number;
  editingBankId: number | null;
  onSnapshotLoad?: (cb: (snap: Snapshot) => void) => void;
}) {
  const [showPicker, setShowPicker]   = useState(false);
  const [showEffects, setShowEffects] = useState(false);
  const [recRunning, setRecRunning]   = useState(false);
  const [ballX, setBallX] = useState(1.0); // start fully open/bright
  const [ballY, setBallY] = useState(0.8); // start mostly wet
  const [recSecs, setRecSecs]         = useState(0);
  const recIntervalRef                = useRef<NodeJS.Timeout|null>(null);
  const source: 'TONE'|'FIELD'        = isField ? 'FIELD' : 'TONE';

  const startRec = () => {
    setRecRunning(true); setRecSecs(0);
    recIntervalRef.current = setInterval(()=>setRecSecs(s=>s+1),1000);
  };
  const stopRec = () => {
    setRecRunning(false);
    if (recIntervalRef.current) clearInterval(recIntervalRef.current);
  };

  const activeModule = chain.activeModule;

  // Take a snapshot of current state for storing to bank
  const takeSnapshot = useCallback((): Snapshot => {
    return {
      source,
      note: `${audio.rootNote}${audio.octave}`,
      shape: audio.shape,
      oscType: audio.oscillator,
      triggerMode: audio.triggerMode === 'ARP' ? 'ARP' : 'FREE',
      bpm,
      stepRate: audio.getArpConfig?.()?.stepRate ?? '16n',
      arpConfig: {
        scale: audio.getArpConfig?.()?.scale ?? 'Dorian',
        steps: audio.getArpConfig?.()?.steps ?? 4,
        pattern: audio.getArpConfig?.()?.pattern ?? 'Up',
      },
      effects: chain.modules.map(m => ({
        name: m.name,
        dotX: m.dotX,
        dotY: m.dotY,
        level: m.level,
        muted: m.muted,
      })),
    };
  }, [source, audio, bpm, chain.modules]);

  return (
    <div style={{ display:'flex', gap:'24px', alignItems:'flex-start' }}>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'10px', flexShrink:0, width:'220px' }}>
        <SoundBall
          dotX={ballX}
          dotY={ballY}
          onDotChange={(x,y) => { setBallX(x); setBallY(y); audio.onBallMove(x,y); }}
          onDotRelease={(x,y) => { setBallX(x); setBallY(y); audio.onBallMove(x,y); }}
          onReset={() => { setBallX(1.0); setBallY(0.8); audio.onBallMove(1.0,0.8); }}
        />
        {!isField ? (
          <ToneControls audio={audio} bpm={bpm} onSnapshotLoad={onSnapshotLoad} />
        ) : (
          <FieldControls recRunning={recRunning} recSecs={recSecs} onRec={startRec} onStop={stopRec} />
        )}
      </div>

      <div style={{ width:'420px', display:'flex', flexDirection:'column', position:'relative' }}>
        <div style={{ fontFamily:'Space Mono, monospace', fontSize:'11px', color:'var(--light)', letterSpacing:'2px', textTransform:'uppercase', marginBottom:'10px' }}>{inputLabel}</div>

        <ChainModule name={isField?'Field':'Tone'} stage={isField?'mic · input 2':'source · ebow'} accentColor={isField?'var(--red)':'var(--blue)'} isSource />

        {chain.modules.map((mod,idx) => (
          <div key={mod.id}>
            <div style={{ textAlign:'center', fontFamily:'Space Mono, monospace', fontSize:'12px', color:'var(--pink)', padding:'4px 0', background:'var(--cream)', borderLeft:'1px solid var(--border)', borderRight:'1px solid var(--border)' }}>↓</div>
            <ChainModule
              name={mod.name} stage={`fx · stage ${idx+1}`}
              accentColor={ALL_ACCENTS[mod.name]||'var(--light)'}
              isActive={mod.id===chain.activeId} isMuted={mod.muted}
              params={mod.params}
              onActivate={() => chain.setActiveId(mod.id)}
              onParamChange={(paramIdx, val) => {
                const newParams = [...(mod.params ?? [])];
                newParams[paramIdx] = val;
                chain.updateModule(mod.id, { params: newParams });
                audio.onEffectParamChange?.(mod.id, mod.name, paramIdx, val);
              }}
              onMute={() => chain.updateModule(mod.id,{muted:!mod.muted})}
              onRemove={() => chain.removeEffect(mod.id)}
            />
          </div>
        ))}

        <button onClick={()=>setShowEffects(p=>!p)} style={{ width:'100%', padding:'12px 16px', background:'transparent', border:'1px dashed var(--border)', borderTop:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:'8px', fontFamily:'Rajdhani, sans-serif', fontWeight:500, fontSize:'14px', letterSpacing:'2px', color:'var(--light)', textTransform:'uppercase' }}>
          <span style={{ fontSize:'18px', lineHeight:1 }}>+</span> Add Effect
        </button>

        {showEffects&&(
          <div style={{ padding:'12px 16px', background:'var(--cream-light)', border:'1px solid var(--border)', borderTop:'none', display:'flex', flexDirection:'column', gap:'4px' }}>
            <div style={{ fontFamily:'Space Mono, monospace', fontSize:'10px', color:'var(--light)', letterSpacing:'2px', textTransform:'uppercase', marginBottom:'6px' }}>Select effect</div>
            {EFFECT_TYPES.map(name=>(
              <button key={name} onClick={()=>{chain.addEffect(name);setShowEffects(false);}}
                style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 12px', border:'none', background:'var(--cream)', cursor:'pointer', textAlign:'left' as const, width:'100%', borderLeft:`3px solid ${ALL_ACCENTS[name]||'var(--light)'}`, marginBottom:'2px' }}
                onMouseEnter={e=>{(e.currentTarget as HTMLButtonElement).style.background='var(--cream-dark)';}}
                onMouseLeave={e=>{(e.currentTarget as HTMLButtonElement).style.background='var(--cream)';}}>
                <span style={{ fontFamily:'Rajdhani, sans-serif', fontWeight:600, fontSize:'14px', letterSpacing:'2px', color:ALL_ACCENTS[name]||'var(--dark)', textTransform:'uppercase', minWidth:'80px' }}>{name}</span>
                <span style={{ fontFamily:'Space Mono, monospace', fontSize:'10px', color:'var(--light)', letterSpacing:'0.5px' }}>{EFFECT_DESCRIPTIONS[name]}</span>
              </button>
            ))}
          </div>
        )}

        {/* Store to bank */}
        <div style={{ position:'relative' }}>
          <button onClick={()=>setShowPicker(p=>!p)} style={{ width:'100%', padding:'12px 16px', background:showPicker?'var(--blue)':'transparent', border:`1px solid var(--blue)`, borderTop:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:'8px', fontFamily:'Rajdhani, sans-serif', fontWeight:600, fontSize:'13px', letterSpacing:'2px', color:showPicker?'white':'var(--blue)', textTransform:'uppercase', transition:'background 0.15s, color 0.15s' }}>
            <span style={{ fontSize:'16px', lineHeight:1 }}>→</span> Store to bank
          </button>
          {showPicker&&(
            <BankPicker
              source={source}
              banks={bankEngine.banks}
              onSelect={(bankId) => {
                bankEngine.storeToBank(bankId, takeSnapshot());
                setShowPicker(false);
                // Stop tone generator and clear chain — bank takes over
                audio.stop();
                chain.loadFromSnapshot([]);
              }}
              onCancel={() => setShowPicker(false)}
            />
          )}
        </div>

        {/* Editing indicator */}
        {editingBankId !== null && (
          <div style={{ marginTop:'6px', padding:'8px 12px', background:'rgba(212,96,144,0.1)', border:'1px solid var(--pink)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontFamily:'Space Mono, monospace', fontSize:'10px', color:'var(--pink)', letterSpacing:'1px' }}>
              ● EDITING BANK {editingBankId}
            </span>
            <button
              onClick={() => {
                bankEngine.updateBankSound(editingBankId, takeSnapshot());
                bankEngine.stopEditing();
              }}
              style={{ fontFamily:'Rajdhani, sans-serif', fontWeight:600, fontSize:'11px', letterSpacing:'2px', padding:'4px 10px', cursor:'pointer', background:'var(--pink)', border:'none', color:'white', clipPath:'polygon(3px 0%, 100% 0%, calc(100% - 3px) 100%, 0% 100%)' }}
            >SAVE TO BANK</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function Home() {
  const audio       = useAudio();
  const bankEngine  = useBankEngine();
  const [bpm, setBpm] = useState(110);

  const toneChain  = useChain([], audio);
  const fieldChain = useChain([], audio);

  // Snapshot loader ref — allows ToneControls to receive a snapshot
  const snapshotLoaderRef = useRef<((snap: Snapshot) => void) | null>(null);

  const handleSnapshotLoad = useCallback((cb: (snap: Snapshot) => void) => {
    snapshotLoaderRef.current = cb;
  }, []);

  // When edit is pressed on a bank — load snapshot into tone controls
  const handleEditBank = useCallback((bankId: number) => {
    const snapshot = bankEngine.getEditSnapshot(bankId);
    if (!snapshot) return;

    bankEngine.startEditing(bankId);

    // Load effects into chain
    toneChain.loadFromSnapshot(snapshot.effects);

    // Load tone controls state
    if (snapshotLoaderRef.current) snapshotLoaderRef.current(snapshot);

    // Load audio state
    const noteParts = snapshot.note.match(/([A-G]#?)(\d+)/);
    if (noteParts) audio.changeNote(noteParts[1], parseInt(noteParts[2]));
    audio.changeShape(snapshot.shape);
    audio.changeOscillator(snapshot.oscType);
    audio.setTriggerMode(snapshot.triggerMode === 'ARP' ? 'ARP' : 'FREE');
    audio.updateArpConfig({
      scale: snapshot.arpConfig.scale,
      steps: snapshot.arpConfig.steps,
      pattern: snapshot.arpConfig.pattern,
      stepRate: snapshot.stepRate,
      bpm: snapshot.bpm,
    });
  }, [bankEngine, toneChain, audio]);

  return (
    <div style={{ background:'var(--cream)', minHeight:'100vh', display:'flex', flexDirection:'column' }}>
      <Header />
      <ClockBar onBpmChange={(b) => { setBpm(b); audio.setBpm(b); }} />
      <div style={{ flex:1, paddingBottom:'24px' }}>
        <SectionLabel left="Signal Build" right="Tone · Field" />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0', padding:'0 24px' }}>
          <div style={{ borderRight:'1px solid var(--border)', paddingRight:'28px' }}>
            <div style={{ fontFamily:'Space Mono, monospace', fontSize:'11px', color:'var(--pink)', letterSpacing:'2px', textTransform:'uppercase', marginBottom:'14px', display:'flex', alignItems:'center', gap:'8px' }}>
              <div style={{ width:'7px', height:'7px', borderRadius:'50%', background:'var(--blue)' }}/>
              Tone — Input 1
            </div>
            <SignalSection
              inputLabel="Input 1 · Tone"
              chain={toneChain}
              bankEngine={bankEngine}
              audio={audio}
              bpm={bpm}
              editingBankId={bankEngine.editingBankId}
              onSnapshotLoad={handleSnapshotLoad}
            />
          </div>
          <div style={{ paddingLeft:'28px' }}>
            <div style={{ fontFamily:'Space Mono, monospace', fontSize:'11px', color:'var(--pink)', letterSpacing:'2px', textTransform:'uppercase', marginBottom:'14px', display:'flex', alignItems:'center', gap:'8px' }}>
              <div style={{ width:'7px', height:'7px', borderRadius:'50%', background:'var(--red)' }}/>
              Field — Input 2
            </div>
            <SignalSection
              inputLabel="Input 2 · Field / Mic"
              isField
              chain={fieldChain}
              bankEngine={bankEngine}
              audio={audio}
              bpm={bpm}
              editingBankId={bankEngine.editingBankId}
            />
          </div>
        </div>
        <SectionLabel left="Live Mix" right="Banks" />
        <Banks
          banks={bankEngine.banks}
          onMasterStop={() => bankEngine.banks.forEach(b => { if(b.state==='LIVE') bankEngine.muteBank(b.id); })}
          onMasterPlay={() => bankEngine.banks.forEach(b => { if(b.state==='MUTED') bankEngine.unmuteBank(b.id); })}
          onSetFader={bankEngine.setFader}
          onSetPan={bankEngine.setPan}
          onMute={bankEngine.muteBank}
          onUnmute={bankEngine.unmuteBank}
          onFade={bankEngine.fadeBank}
          onClear={bankEngine.clearBank}
          onRename={bankEngine.renameBank}
          onEdit={handleEditBank}
          onAddBank={bankEngine.addBank}
        />
      </div>
      <FooterBar />
    </div>
  );
}
