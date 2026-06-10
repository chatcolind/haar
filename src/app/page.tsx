'use client';

import { useState, useRef, useCallback } from 'react';
import Header from '@/components/Header';
import ClockBar from '@/components/ClockBar';
import SectionLabel from '@/components/SectionLabel';
import SoundBall, { ACCENT_COLORS } from '@/components/SoundBall';
import ChainModule from '@/components/ChainModule';
import Banks from '@/components/Banks';
import FooterBar from '@/components/FooterBar';
import { useAudio } from '@/hooks/useAudio';

const EFFECT_TYPES = [
  'Reverb','Tape','Delay','Chorus','Filter','Pitch','Modulate','Grain',
  'Fuzz','Crush','Shimmer','Warp','Wobble','Pulse','Space',
];

const SCALES: Record<string, number[]> = {
  'Ionian (Major)':[0,2,4,5,7,9,11],'Dorian':[0,2,3,5,7,9,10],
  'Phrygian':[0,1,3,5,7,8,10],'Phrygian Dominant':[0,1,4,5,7,8,10],
  'Lydian':[0,2,4,6,7,9,11],'Lydian Dominant':[0,2,4,6,7,9,10],
  'Mixolydian':[0,2,4,5,7,9,10],'Aeolian (Minor)':[0,2,3,5,7,8,10],
  'Locrian':[0,1,3,5,6,8,10],'Melodic Minor':[0,2,3,5,7,9,11],
  'Harmonic Minor':[0,2,3,5,7,8,11],'Hungarian Minor':[0,2,3,6,7,8,11],
  'Persian':[0,1,4,5,6,8,11],'Whole Tone':[0,2,4,6,8,10],
  'Diminished':[0,2,3,5,6,8,9,11],'Pentatonic Minor':[0,3,5,7,10],
  'Pentatonic Major':[0,2,4,7,9],'Blues':[0,3,5,6,7,10],
};

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

const SCALE_NAMES = Object.keys(SCALES);
const PATTERNS = ['Up','Down','Up/Down','Random'];
const STEP_RATES = ['1/4','1/8','1/16','1/32'];

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

interface EffectModule { id:number; name:string; volume:number; muted:boolean; dotX:number; dotY:number; level:number; }
let nextId = 10;

function useChain(initial: string[]) {
  const [modules, setModules] = useState<EffectModule[]>(
    initial.map((name, i) => ({ id:i+1, name, volume:70, muted:false, dotX:0.5, dotY:0.5, level:70 }))
  );
  const [activeId, setActiveId] = useState<number>(1);
  const activeModule = modules.find(m => m.id === activeId) || modules[0];
  const addEffect = (name: string) => { const id=nextId++; setModules(prev=>[...prev,{id,name,volume:70,muted:false,dotX:0.5,dotY:0.5,level:70}]); setActiveId(id); };
  const removeEffect = (id: number) => { setModules(prev=>{ const r=prev.filter(m=>m.id!==id); if(activeId===id&&r.length>0) setActiveId(r[0].id); return r; }); };
  const updateModule = (id: number, updates: Partial<EffectModule>) => setModules(prev=>prev.map(m=>m.id===id?{...m,...updates}:m));
  return { modules, activeId, setActiveId, activeModule, addEffect, removeEffect, updateModule };
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

// ── Play/Stop button ──────────────────────────────────────────────────────────
function PlayButton({ isPlaying, onPlay, onStop }: { isPlaying:boolean; onPlay:()=>void; onStop:()=>void }) {
  return (
    <button
      onClick={isPlaying ? onStop : onPlay}
      style={{
        width: '100%',
        padding: '16px',
        fontFamily: 'Rajdhani, sans-serif',
        fontWeight: 700,
        fontSize: '20px',
        letterSpacing: '4px',
        textTransform: 'uppercase',
        cursor: 'pointer',
        border: `2px solid ${isPlaying ? 'var(--pink)' : 'var(--blue)'}`,
        background: isPlaying ? 'var(--pink)' : 'var(--blue)',
        color: 'white',
        clipPath: 'polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)',
        transition: 'background 0.2s, border-color 0.2s',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
      }}
    >
      <span style={{ fontSize: '18px' }}>{isPlaying ? '■' : '▶'}</span>
      {isPlaying ? 'STOP' : 'PLAY'}
    </button>
  );
}

// ── Tone controls with audio wired ────────────────────────────────────────────
function ToneControls({ audio }: { audio: ReturnType<typeof useAudio> }) {
  const [mode, setMode] = useState<'DRONE'|'ARP'>('DRONE');
  const [scale, setScale] = useState('Dorian');
  const [steps, setSteps] = useState(4);
  const [pattern, setPattern] = useState('Up');
  const [gate, setGate] = useState(70);
  const [stepRate, setStepRate] = useState('1/8');

  const KEYS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

  const smBtn = (active:boolean,ac='var(--blue)',ab='var(--blue-dark)') => ({
    fontFamily:'Space Mono, monospace' as const, fontSize:'11px', padding:'4px 8px',
    cursor:'pointer' as const,
    background:active?ac:'var(--cream-light)',
    border:`1px solid ${active?ab:'var(--border)'}`,
    color:active?'white':'var(--mid)',
  });

  const selectStyle = { fontFamily:'Rajdhani, sans-serif' as const, fontWeight:500, fontSize:'13px', padding:'6px 10px', flex:1 as const, background:'var(--cream-light)', border:'1px solid var(--border)', color:'var(--dark)', cursor:'pointer' as const };
  const rowLabel = (t:string) => <span style={{ fontFamily:'Space Mono, monospace', fontSize:'11px', color:'var(--mid)', letterSpacing:'1px', width:'48px', flexShrink:0 }}>{t}</span>;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'8px', width:'220px' }}>

      {/* Play/Stop */}
      <PlayButton isPlaying={audio.isPlaying} onPlay={audio.play} onStop={audio.stop} />

      {/* Root note */}
      <div style={{ display:'flex', gap:'3px', flexWrap:'wrap' }}>
        {KEYS.map(k => (
          <button key={k}
            onClick={() => audio.changeNote(k, audio.octave)}
            style={{ ...smBtn(audio.rootNote===k), minWidth:'28px', textAlign:'center' as const, padding:'4px 5px' }}
          >{k}</button>
        ))}
      </div>

      {/* Octave */}
      <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
        {rowLabel('OCT')}
        <div style={{ display:'flex', gap:'4px' }}>
          {[1,2,3,4].map(o => (
            <button key={o}
              onClick={() => audio.changeNote(audio.rootNote, o)}
              style={{ ...smBtn(audio.octave===o), padding:'5px 12px' }}
            >{o}</button>
          ))}
        </div>
      </div>

      {/* Mode */}
      <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
        {rowLabel('MODE')}
        <button onClick={()=>setMode('DRONE')} style={{ ...smBtn(mode==='DRONE'), flex:1, textAlign:'center' as const, fontFamily:'Rajdhani, sans-serif' as const, fontWeight:600, fontSize:'13px', letterSpacing:'2px' }}>DRONE</button>
        <button onClick={()=>setMode('ARP')} style={{ ...smBtn(mode==='ARP','var(--gold)','var(--gold-dark)'), flex:1, textAlign:'center' as const, fontFamily:'Rajdhani, sans-serif' as const, fontWeight:600, fontSize:'13px', letterSpacing:'2px', color:mode==='ARP'?'#1A1400':'var(--mid)' }}>ARP</button>
      </div>

      {/* ARP panel */}
      {mode==='ARP'&&(
        <div style={{ display:'flex', flexDirection:'column', gap:'10px', padding:'12px', background:'var(--cream-dark)', border:'1px solid var(--border)', borderLeft:'3px solid var(--gold)' }}>
          <div style={{ display:'flex', flexDirection:'column', gap:'5px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>{rowLabel('SCALE')}<select value={scale} onChange={e=>setScale(e.target.value)} style={selectStyle}>{SCALE_NAMES.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
            <div style={{ fontFamily:'Space Mono, monospace', fontSize:'11px', color:'var(--mid)', paddingLeft:'56px' }}>{SCALE_HINTS[scale]}</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>{rowLabel('STEPS')}<div style={{ display:'flex', gap:'3px', flexWrap:'wrap' as const }}>{[2,3,4,5,6,7,8].map(s=><button key={s} onClick={()=>setSteps(s)} style={{...smBtn(steps===s),padding:'4px 7px',fontSize:'11px'}}>{s}</button>)}</div></div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>{rowLabel('PATT')}<select value={pattern} onChange={e=>setPattern(e.target.value)} style={selectStyle}>{PATTERNS.map(p=><option key={p} value={p}>{p}</option>)}</select></div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            {rowLabel('GATE')}
            <div style={{ flex:1, height:'4px', background:'var(--cream-light)', position:'relative' as const, cursor:'pointer' as const, borderRadius:'2px' }} onClick={e=>{const r=e.currentTarget.getBoundingClientRect();setGate(Math.round(((e.clientX-r.left)/r.width)*100));}}>
              <div style={{ height:'100%', width:`${gate}%`, background:'var(--gold)', borderRadius:'2px' }}/>
              <div style={{ position:'absolute' as const, top:'-5px', left:`${gate}%`, transform:'translateX(-50%)', width:'13px', height:'13px', borderRadius:'50%', background:'var(--cream-light)', border:'2px solid var(--gold)' }}/>
            </div>
            <span style={{ fontFamily:'Space Mono, monospace', fontSize:'11px', color:'var(--mid)', minWidth:'34px' }}>{gate}%</span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>{rowLabel('RATE')}<div style={{ display:'flex', gap:'4px' }}>{STEP_RATES.map(r=><button key={r} onClick={()=>setStepRate(r)} style={{...smBtn(stepRate===r),padding:'4px 7px',fontSize:'11px'}}>{r}</button>)}</div></div>
        </div>
      )}
    </div>
  );
}

function FieldControls({ recRunning,recSecs,onRec,onStop }: { recRunning:boolean;recSecs:number;onRec:()=>void;onStop:()=>void }) {
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

function SignalSection({ inputLabel,isField=false,chain,banks,onStoreToBank,audio }: {
  inputLabel:string; isField?:boolean;
  chain:ReturnType<typeof useChain>;
  banks:{ id:number; name:string; state:string }[];
  onStoreToBank:(bankId:number,source:'TONE'|'FIELD')=>void;
  audio?: ReturnType<typeof useAudio>;
}) {
  const [showPicker, setShowPicker]   = useState(false);
  const [showEffects, setShowEffects] = useState(false);
  const [recRunning, setRecRunning]   = useState(false);
  const [recSecs, setRecSecs]         = useState(0);
  const [recIntervalId, setRecIntervalId] = useState<NodeJS.Timeout|null>(null);
  const source: 'TONE'|'FIELD' = isField ? 'FIELD' : 'TONE';

  const startRec = () => { setRecRunning(true);setRecSecs(0);const id=setInterval(()=>setRecSecs(s=>s+1),1000);setRecIntervalId(id); };
  const stopRec  = () => { setRecRunning(false);if(recIntervalId)clearInterval(recIntervalId); };

  const activeModule = chain.activeModule;

  return (
    <div style={{ display:'flex', gap:'24px', alignItems:'flex-start' }}>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'10px', flexShrink:0, width:'220px' }}>
        <SoundBall
          activeEffect={activeModule?.name||'Reverb'}
          dotX={activeModule?.dotX||0.5}
          dotY={activeModule?.dotY||0.5}
          onDotChange={(x,y)=>{if(activeModule)chain.updateModule(activeModule.id,{dotX:x,dotY:y});}}
          onReset={()=>{if(activeModule)chain.updateModule(activeModule.id,{dotX:0.5,dotY:0.5});}}
          level={activeModule?.level||70}
          onLevelChange={v=>{if(activeModule)chain.updateModule(activeModule.id,{level:v});}}
          dimmed={chain.modules.length===0}
        />
        {!isField && audio ? (
          <ToneControls audio={audio} />
        ) : (
          <FieldControls recRunning={recRunning} recSecs={recSecs} onRec={startRec} onStop={stopRec} />
        )}
      </div>

      <div style={{ width:'420px', display:'flex', flexDirection:'column', position:'relative' }}>
        <div style={{ fontFamily:'Space Mono, monospace', fontSize:'11px', color:'var(--light)', letterSpacing:'2px', textTransform:'uppercase', marginBottom:'10px' }}>{inputLabel}</div>

        <ChainModule name={isField?'Field':'Tone'} stage={isField?'mic · input 2':'source · ebow'} accentColor={isField?'var(--red)':'var(--blue)'} isSource />

        {chain.modules.map((mod,idx)=>(
          <div key={mod.id}>
            <div style={{ textAlign:'center', fontFamily:'Space Mono, monospace', fontSize:'12px', color:'var(--pink)', padding:'4px 0', background:'var(--cream)', borderLeft:'1px solid var(--border)', borderRight:'1px solid var(--border)' }}>↓</div>
            <ChainModule name={mod.name} stage={`fx · stage ${idx+1}`} accentColor={ALL_ACCENTS[mod.name]||'var(--light)'} isActive={mod.id===chain.activeId} volume={mod.volume} isMuted={mod.muted}
              onActivate={()=>chain.setActiveId(mod.id)} onVolumeChange={v=>chain.updateModule(mod.id,{volume:v})} onMute={()=>chain.updateModule(mod.id,{muted:!mod.muted})} onRemove={()=>chain.removeEffect(mod.id)} />
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

        <div style={{ position:'relative' }}>
          <button onClick={()=>setShowPicker(p=>!p)} style={{ width:'100%', padding:'12px 16px', background:showPicker?'var(--blue)':'transparent', border:`1px solid var(--blue)`, borderTop:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:'8px', fontFamily:'Rajdhani, sans-serif', fontWeight:600, fontSize:'13px', letterSpacing:'2px', color:showPicker?'white':'var(--blue)', textTransform:'uppercase', transition:'background 0.15s, color 0.15s' }}>
            <span style={{ fontSize:'16px', lineHeight:1 }}>→</span> Store to bank
          </button>
          {showPicker&&(
            <BankPicker source={source} banks={banks}
              onSelect={(bankId)=>{onStoreToBank(bankId,source);setShowPicker(false);}}
              onCancel={()=>setShowPicker(false)} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const audio      = useAudio();
  const toneChain  = useChain(['Tape','Reverb','Modulate']);
  const fieldChain = useChain(['Reverb','Delay']);

  const [bankList, setBankList] = useState([
    { id:1, name:'Bank 1', state:'EMPTY' },
    { id:2, name:'Bank 2', state:'EMPTY' },
    { id:3, name:'Bank 3', state:'EMPTY' },
  ]);

  const storeFnRef = useRef<((source:'TONE'|'FIELD',bankId:number)=>void)|null>(null);

  const handleStoreToBank = (bankId: number, source: 'TONE'|'FIELD') => {
    if (storeFnRef.current) storeFnRef.current(source, bankId);
    setBankList(prev => prev.map(b => b.id===bankId ? { ...b, state:'LIVE' } : b));
  };

  return (
    <div style={{ background:'var(--cream)', minHeight:'100vh', display:'flex', flexDirection:'column' }}>
      <Header />
      <ClockBar />
      <div style={{ flex:1, paddingBottom:'24px' }}>
        <SectionLabel left="Signal Build" right="Tone · Field" />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'0', padding:'0 24px' }}>
          <div style={{ borderRight:'1px solid var(--border)', paddingRight:'28px' }}>
            <div style={{ fontFamily:'Space Mono, monospace', fontSize:'11px', color:'var(--pink)', letterSpacing:'2px', textTransform:'uppercase', marginBottom:'14px', display:'flex', alignItems:'center', gap:'8px' }}>
              <div style={{ width:'7px', height:'7px', borderRadius:'50%', background:'var(--blue)' }}/>
              Tone — Input 1
            </div>
            <SignalSection inputLabel="Input 1 · Tone" chain={toneChain} banks={bankList} onStoreToBank={handleStoreToBank} audio={audio} />
          </div>
          <div style={{ paddingLeft:'28px' }}>
            <div style={{ fontFamily:'Space Mono, monospace', fontSize:'11px', color:'var(--pink)', letterSpacing:'2px', textTransform:'uppercase', marginBottom:'14px', display:'flex', alignItems:'center', gap:'8px' }}>
              <div style={{ width:'7px', height:'7px', borderRadius:'50%', background:'var(--red)' }}/>
              Field — Input 2
            </div>
            <SignalSection inputLabel="Input 2 · Field / Mic" isField chain={fieldChain} banks={bankList} onStoreToBank={handleStoreToBank} />
          </div>
        </div>
        <SectionLabel left="Live Mix" right="Banks" />
        <Banks storeFnRef={storeFnRef} onBankListChange={setBankList} />
      </div>
      <FooterBar />
    </div>
  );
}
