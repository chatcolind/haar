'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { BankState } from '@/hooks/useBankEngine';

const SOURCE_COLOR: Record<string,string> = { TONE:'var(--blue)', FIELD:'var(--red)' };
const STATE_COLOR:  Record<string,string> = { LIVE:'var(--blue)', MUTED:'var(--light)', FADING:'var(--pink)', EMPTY:'var(--cream-dark)' };

function WaveformDisplay({ active, color }: { active:boolean; color:string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const draw = () => {
      const W=canvas.width, H=canvas.height;
      ctx.clearRect(0,0,W,H);
      if (!active) {
        ctx.strokeStyle='#C8C0B0'; ctx.lineWidth=1; ctx.setLineDash([3,3]);
        ctx.beginPath(); ctx.moveTo(0,H/2); ctx.lineTo(W,H/2); ctx.stroke();
        ctx.setLineDash([]); return;
      }
      const t=Date.now()/1000;
      ctx.beginPath();
      for(let x=0;x<=W;x++){
        const nx=x/W;
        let y=H/2;
        y+=Math.sin(nx*10+t*2.5)*(H*0.28);
        y+=Math.sin(nx*6+t*1.6)*(H*0.14);
        y+=Math.sin(nx*18+t*4.2)*(H*0.06);
        if(x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.lineTo(W,H); ctx.lineTo(0,H); ctx.closePath();
      ctx.fillStyle=color+'22'; ctx.fill();
      ctx.beginPath(); ctx.strokeStyle=color; ctx.lineWidth=1.5;
      for(let x=0;x<=W;x++){
        const nx=x/W;
        let y=H/2;
        y+=Math.sin(nx*10+t*2.5)*(H*0.28);
        y+=Math.sin(nx*6+t*1.6)*(H*0.14);
        y+=Math.sin(nx*18+t*4.2)*(H*0.06);
        if(x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
      rafRef.current=requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  },[active,color]);
  return <canvas ref={canvasRef} width={80} height={24} style={{ display:'block', width:'80px', height:'24px', flexShrink:0 }}/>;
}

const NUM_BANDS=24;
const BAND_PROFILE=[0.85,0.92,0.95,0.88,0.78,0.68,0.55,0.48,0.38,0.32,0.28,0.24,0.20,0.18,0.15,0.13,0.11,0.09,0.08,0.07,0.06,0.05,0.04,0.03];
const BAND_LABELS=['Sub','Bass','Lo-mid','Mid','Hi-mid','Air'];

function SpectrumAnalyser({ activeCount }: { activeCount:number }) {
  const canvasRef=useRef<HTMLCanvasElement>(null); const rafRef=useRef<number>(0);
  useEffect(()=>{
    const canvas=canvasRef.current; if(!canvas) return;
    const ctx=canvas.getContext('2d'); if(!ctx) return;
    const draw=()=>{
      const W=canvas.width,H=canvas.height-14; ctx.clearRect(0,0,canvas.width,canvas.height);
      const t=Date.now()/1000; const scale=activeCount===0?0.04:activeCount===1?0.55:1.0; const bandW=Math.floor(W/NUM_BANDS)-1;
      for(let i=0;i<NUM_BANDS;i++){const base=BAND_PROFILE[i]*scale;const noise=Math.sin(t*(2.5+i*0.35))*0.07+Math.sin(t*(5.1+i*0.7))*0.04;const level=Math.min(1,Math.max(0.01,base+noise));const barH=Math.round(level*H);const x=i*(bandW+1);const r=level>0.7?200:level>0.5?Math.round(200*((level-0.5)/0.2)):30;const g=level>0.85?Math.round(160*(1-(level-0.85)/0.15)):160;ctx.fillStyle=`rgb(${r},${Math.max(40,g)},30)`;ctx.fillRect(x,H-barH,bandW,barH);}
      ctx.fillStyle='#A8A090';ctx.font='8px monospace';ctx.textAlign='center';
      BAND_LABELS.forEach((lbl,i)=>{ctx.fillText(lbl,Math.round((i/(BAND_LABELS.length-1))*(W-20)+10),canvas.height-2);});
      rafRef.current=requestAnimationFrame(draw);
    };
    draw(); return ()=>cancelAnimationFrame(rafRef.current);
  },[activeCount]);
  return <canvas ref={canvasRef} width={320} height={50} style={{ display:'block', width:'100%', height:'50px', flex:1 }}/>;
}

function PanControl({ value, onChange, color }: { value:number; onChange:(v:number)=>void; color:string }) {
  const dragging=useRef(false);
  const set=(e:React.MouseEvent<HTMLDivElement>)=>{const r=e.currentTarget.getBoundingClientRect();onChange(Math.min(100,Math.max(0,Math.round(((e.clientX-r.left)/r.width)*100))));};
  const panLabel=()=>{const d=value-50;if(Math.abs(d)<4)return 'C';return d<0?`L${Math.abs(d)}`:`R${d}`;};
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'5px' }}>
      <span style={{ fontFamily:'Space Mono, monospace', fontSize:'9px', color:'var(--light)', letterSpacing:'1px', width:'22px' }}>PAN</span>
      <div onMouseDown={e=>{dragging.current=true;set(e);}} onMouseMove={e=>{if(dragging.current)set(e);}} onMouseUp={()=>{dragging.current=false;}} onMouseLeave={()=>{dragging.current=false;}}
        style={{ flex:1, height:'3px', background:'var(--cream-dark)', position:'relative', cursor:'pointer', borderRadius:'2px' }}>
        <div style={{ position:'absolute', top:'-3px', left:'50%', transform:'translateX(-50%)', width:'1px', height:'9px', background:'var(--border)' }}/>
        <div style={{ position:'absolute', top:0, left:value<50?`${value}%`:'50%', width:`${Math.abs(value-50)}%`, height:'100%', background:color+'66', borderRadius:'2px' }}/>
        <div style={{ position:'absolute', top:'-5px', left:`${value}%`, transform:'translateX(-50%)', width:'11px', height:'11px', borderRadius:'50%', background:'var(--cream-light)', border:`1.5px solid ${color}` }}/>
      </div>
      <span style={{ fontFamily:'Space Mono, monospace', fontSize:'9px', color:'var(--light)', minWidth:'22px', textAlign:'right' }}>{panLabel()}</span>
    </div>
  );
}

interface BanksProps {
  banks: BankState[];
  onMasterStop: () => void;
  onMasterPlay: () => void;
  onSetFader: (id:number, v:number) => void;
  onSetPan:   (id:number, v:number) => void;
  onMute:     (id:number) => void;
  onUnmute:   (id:number) => void;
  onFade:     (id:number) => void;
  onClear:    (id:number) => void;
  onRename:   (id:number, name:string) => void;
  onEdit:     (id:number) => void;
  onAddBank:  () => void;
}

export default function Banks({
  banks, onMasterStop, onMasterPlay, onSetFader, onSetPan, onMute, onUnmute, onFade, onClear, onRename, onEdit, onAddBank,
}: BanksProps) {
  const [masterFader, setMasterFader] = useState(80);
  const [editingName, setEditingName] = useState<number|null>(null);
  const [confirmClear, setConfirmClear] = useState<number|null>(null);
  const [selectedBank, setSelectedBank] = useState<number|null>(null);
  const masterDragging = useRef(false);
  const faderDragging  = useRef(false);
  const activeCount = banks.filter(b=>b.state==='LIVE'||b.state==='FADING').length;

  // Keyboard volume control
  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{
      if(selectedBank===null) return;
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;
      const target=document.activeElement;
      if(target&&(target.tagName==='INPUT'||target.tagName==='BUTTON')) return;
      e.preventDefault();
      const bank=banks.find(b=>b.id===selectedBank);
      if(!bank) return;
      const delta=(e.key==='ArrowRight'||e.key==='ArrowUp')?(e.shiftKey?5:1):-(e.shiftKey?5:1);
      onSetFader(selectedBank, Math.min(100,Math.max(0,bank.fader+delta)));
    };
    window.addEventListener('keydown',handler);
    return ()=>window.removeEventListener('keydown',handler);
  },[selectedBank,banks,onSetFader]);

  const handleFaderDrag=(e:React.MouseEvent<HTMLDivElement>,id:number)=>{
    const r=e.currentTarget.getBoundingClientRect();
    onSetFader(id,Math.min(100,Math.max(0,Math.round(((e.clientX-r.left)/r.width)*100))));
  };

  const handleMasterDrag=(e:React.MouseEvent<HTMLDivElement>)=>{
    const r=e.currentTarget.getBoundingClientRect();
    setMasterFader(Math.min(100,Math.max(0,Math.round(((e.clientX-r.left)/r.width)*100))));
  };

  const btn=(v:'default'|'muted'|'fade'|'clear'|'edit'|'confirm'|'save')=>{
    const base={fontFamily:'Rajdhani, sans-serif' as const,fontWeight:600 as const,fontSize:'11px',letterSpacing:'1px',textTransform:'uppercase' as const,padding:'4px 10px',cursor:'pointer' as const,flexShrink:0,border:'1px solid var(--border)',background:'var(--cream-light)',color:'var(--dark)',clipPath:'polygon(4px 0%, 100% 0%, calc(100% - 4px) 100%, 0% 100%)'};
    if(v==='muted')   return {...base,background:'var(--red)',borderColor:'var(--red-dark)',color:'white'};
    if(v==='fade')    return {...base,borderColor:'var(--pink)',color:'var(--pink)'};
    if(v==='clear')   return {...base,color:'var(--light)',fontSize:'10px' as const};
    if(v==='edit')    return {...base,borderColor:'var(--blue)',color:'var(--blue)'};
    if(v==='save')    return {...base,background:'var(--pink)',borderColor:'var(--pink)',color:'white'};
    if(v==='confirm') return {...base,background:'var(--red)',borderColor:'var(--red-dark)',color:'white',fontSize:'10px' as const};
    return base;
  };

  return (
    <div style={{ padding:'0 24px' }}>

      {/* Master strip */}
      <div style={{ background:'var(--cream-dark)', border:'1px solid var(--border)', borderLeft:'4px solid var(--gold)', marginBottom:'2px', padding:'10px 16px', display:'flex', flexDirection:'column', gap:'8px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
          <div style={{ flexShrink:0, minWidth:'80px' }}>
            <div style={{ fontFamily:'Rajdhani, sans-serif', fontWeight:600, fontSize:'14px', letterSpacing:'3px', color:'var(--dark)', textTransform:'uppercase' }}>Master</div>
            <div style={{ fontFamily:'Space Mono, monospace', fontSize:'10px', color:'var(--light)', letterSpacing:'1px', marginTop:'2px' }}>{activeCount===0?'no banks active':`${activeCount} bank${activeCount>1?'s':''} live`}</div>
            <div style={{ display:'flex', gap:'4px', marginTop:'6px' }}>
              <button onClick={onMasterStop} style={{ fontFamily:'Rajdhani, sans-serif', fontWeight:700, fontSize:'10px', letterSpacing:'1px', padding:'3px 8px', cursor:'pointer', background:'var(--pink)', border:'none', color:'white', clipPath:'polygon(3px 0%, 100% 0%, calc(100% - 3px) 100%, 0% 100%)' }}>■ STOP</button>
              <button onClick={onMasterPlay} style={{ fontFamily:'Rajdhani, sans-serif', fontWeight:700, fontSize:'10px', letterSpacing:'1px', padding:'3px 8px', cursor:'pointer', background:'var(--blue)', border:'none', color:'white', clipPath:'polygon(3px 0%, 100% 0%, calc(100% - 3px) 100%, 0% 100%)' }}>▶ PLAY</button>
            </div>
          </div>
          <SpectrumAnalyser activeCount={activeCount}/>
          <span style={{ fontFamily:'Rajdhani, sans-serif', fontWeight:600, fontSize:'14px', color:'var(--dark)', minWidth:'52px', textAlign:'right', letterSpacing:'1px', flexShrink:0 }}>{activeCount===0?'−∞ dB':activeCount===1?'−8 dB':'−4 dB'}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          <span style={{ fontFamily:'Space Mono, monospace', fontSize:'10px', color:'var(--light)', letterSpacing:'1px', width:'36px' }}>LEVEL</span>
          <div onMouseDown={e=>{masterDragging.current=true;handleMasterDrag(e);}} onMouseMove={e=>{if(masterDragging.current)handleMasterDrag(e);}} onMouseUp={()=>{masterDragging.current=false;}} onMouseLeave={()=>{masterDragging.current=false;}}
            style={{ flex:1, height:'3px', background:'var(--cream-light)', position:'relative', cursor:'pointer', borderRadius:'2px' }}>
            <div style={{ position:'absolute', left:0, top:0, height:'100%', width:`${masterFader}%`, background:'var(--gold)', borderRadius:'2px' }}/>
            <div style={{ position:'absolute', top:'-6px', left:`${masterFader}%`, transform:'translateX(-50%)', width:'14px', height:'14px', borderRadius:'50%', background:'var(--cream-light)', border:'2px solid var(--gold)' }}/>
          </div>
          <span style={{ fontFamily:'Space Mono, monospace', fontSize:'11px', color:'var(--light)', minWidth:'22px' }}>{masterFader}</span>
        </div>
      </div>

      {/* Bank strips */}
      {banks.map(bank=>{
        const isLive=bank.state==='LIVE', isMuted=bank.state==='MUTED';
        const isEmpty=bank.state==='EMPTY', isFading=bank.state==='FADING';
        const srcColor=bank.source?SOURCE_COLOR[bank.source]:'var(--light)';
        const stateColor=STATE_COLOR[bank.state];
        const isSelected=selectedBank===bank.id;

        return (
          <div key={bank.id}
            onClick={()=>!isEmpty&&setSelectedBank(isSelected?null:bank.id)}
            style={{ display:'flex', alignItems:'center', gap:'10px', padding:'8px 16px', background:isSelected?'rgba(27,92,232,0.04)':isLive||isMuted||isFading?'var(--cream-light)':'var(--cream)', border:'1px solid var(--border)', borderTop:'none', borderLeft:`4px solid ${isSelected?'var(--pink)':stateColor}`, opacity:isMuted?0.45:isFading?0.7:1, transition:'opacity 0.3s,border-color 0.2s', cursor:isEmpty?'default':'pointer' }}>

            <div style={{ width:'7px', height:'7px', borderRadius:'50%', background:isSelected?'var(--pink)':stateColor, flexShrink:0, transition:'background 0.2s' }}/>

            <div style={{ flexShrink:0, width:'80px' }}>
              {editingName===bank.id?(
                <input autoFocus defaultValue={bank.name}
                  onBlur={e=>{onRename(bank.id,e.target.value);setEditingName(null);}}
                  onKeyDown={e=>{if(e.key==='Enter'){onRename(bank.id,(e.target as HTMLInputElement).value);setEditingName(null);}if(e.key==='Escape')setEditingName(null);e.stopPropagation();}}
                  onClick={e=>e.stopPropagation()}
                  style={{ fontFamily:'Rajdhani, sans-serif', fontWeight:600, fontSize:'13px', letterSpacing:'2px', background:'transparent', border:'none', borderBottom:'1px solid var(--pink)', color:'var(--dark)', outline:'none', width:'76px' }}/>
              ):(
                <div onClick={e=>{e.stopPropagation();setEditingName(bank.id);}} style={{ fontFamily:'Rajdhani, sans-serif', fontWeight:600, fontSize:'13px', letterSpacing:'2px', color:isEmpty?'var(--light)':'var(--dark)', cursor:'text' }}>{bank.name}</div>
              )}
            </div>

            <div style={{ fontFamily:'Space Mono, monospace', fontSize:'10px', letterSpacing:'1px', padding:'2px 7px', flexShrink:0, background:bank.source?srcColor+'18':'transparent', border:`1px solid ${bank.source?srcColor+'44':'var(--cream-dark)'}`, color:bank.source?srcColor:'var(--light)' }}>{bank.source??'EMPTY'}</div>

            <WaveformDisplay active={isLive||isFading} color={bank.source==='TONE'?'#1B5CE8':bank.source==='FIELD'?'#D63020':'#C0B8A8'}/>

            {!isEmpty?(
              <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'5px', minWidth:'140px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                  <div
                    onMouseDown={e=>{e.stopPropagation();faderDragging.current=true;handleFaderDrag(e,bank.id);}}
                    onMouseMove={e=>{if(e.buttons===1&&faderDragging.current){e.stopPropagation();handleFaderDrag(e,bank.id);}}}
                    onMouseUp={()=>{faderDragging.current=false;}}
                    style={{ flex:1, height:'3px', background:'var(--cream-dark)', position:'relative', cursor:'pointer', borderRadius:'2px' }}>
                    <div style={{ position:'absolute', left:0, top:0, height:'100%', width:`${bank.fader}%`, background:srcColor, borderRadius:'2px' }}/>
                    <div style={{ position:'absolute', top:'-6px', left:`${bank.fader}%`, transform:'translateX(-50%)', width:'14px', height:'14px', borderRadius:'50%', background:'var(--cream-light)', border:`2px solid ${srcColor}` }}/>
                  </div>
                  <span style={{ fontFamily:'Space Mono, monospace', fontSize:'11px', color:'var(--mid)', minWidth:'24px', textAlign:'right' }}>{bank.fader}</span>
                </div>
                <PanControl value={bank.pan} onChange={v=>onSetPan(bank.id,v)} color={srcColor}/>
                {isSelected&&<div style={{ fontFamily:'Space Mono, monospace', fontSize:'9px', color:'var(--pink)', letterSpacing:'1px' }}>← → volume · shift = ×5</div>}
              </div>
            ):<div style={{ flex:1 }}/>}

            <div style={{ display:'flex', gap:'5px', alignItems:'center', flexShrink:0 }} onClick={e=>e.stopPropagation()}>
              {(isLive||isMuted)&&(
                <>
                  <button onClick={()=>isMuted?onUnmute(bank.id):onMute(bank.id)} style={btn(isMuted?'muted':'default')}>{isMuted?'UNMUTE':'MUTE'}</button>
                  <button onClick={()=>onEdit(bank.id)} style={btn('edit')}>EDIT</button>
                  <button onClick={()=>onFade(bank.id)} style={btn('fade')}>FADE</button>
                  {confirmClear===bank.id?(
                    <>
                      <button onClick={()=>{onClear(bank.id);setConfirmClear(null);setSelectedBank(null);}} style={btn('confirm')}>CONFIRM</button>
                      <button onClick={()=>setConfirmClear(null)} style={btn('clear')}>CANCEL</button>
                    </>
                  ):(
                    <button onClick={()=>setConfirmClear(bank.id)} style={btn('clear')}>CLEAR</button>
                  )}
                </>
              )}
              {isFading&&<span style={{ fontFamily:'Space Mono, monospace', fontSize:'10px', color:'var(--pink)', letterSpacing:'1px' }}>fading...</span>}
            </div>
          </div>
        );
      })}

      {banks.length<6&&(
        <div style={{ marginTop:'6px' }}>
          <button onClick={onAddBank} style={{ fontFamily:'Rajdhani, sans-serif', fontWeight:500, fontSize:'12px', letterSpacing:'2px', textTransform:'uppercase', padding:'7px 16px', background:'transparent', border:'1px dashed var(--border)', color:'var(--light)', cursor:'pointer', display:'flex', alignItems:'center', gap:'6px' }}>
            <span style={{ fontSize:'16px', lineHeight:1 }}>+</span> Add Bank
          </button>
        </div>
      )}

      {selectedBank!==null&&(
        <div style={{ marginTop:'6px', fontFamily:'Space Mono, monospace', fontSize:'9px', color:'var(--light)', letterSpacing:'1px' }}>
          Bank {selectedBank} selected · ← → fine · shift+← → coarse · click again to deselect
        </div>
      )}
    </div>
  );
}
