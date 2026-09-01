import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";

/* ═══════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════ */
const C = {
  navy:"#162032", blue:"#2563EB", sky:"#0EA5E9", green:"#059669",
  amber:"#D97706", rose:"#E11D48", violet:"#7C3AED", slate:"#64748B",
  light:"#F1F5F9", white:"#fff", border:"#E2E8F0"
};
const PAL = ["#2563EB","#059669","#D97706","#7C3AED","#0EA5E9","#E11D48","#8B5CF6","#F59E0B","#14B8A6","#F43F5E"];
const PAGE_SIZE = 50;
const SEARCH_FIELDS = ["ID","Debitur","Bank","Alamat","Kota_Kab","KPKNL","Jenis_Sertifikat"];

const MULTI_FILTERS = [
  { key:"Source",l:"Sumber" },{ key:"Provinsi",l:"Provinsi" },
  { key:"Kanwil",l:"Kanwil" },{ key:"KPKNL",l:"KPKNL" },
  { key:"Kota_Kab",l:"Kota/Kab" },{ key:"Jenis_Aset",l:"Jenis Aset" },
  { key:"Kepemilikan_Tier",l:"Kepemilikan" },{ key:"Masa_Berlaku",l:"Masa Berlaku" },
  { key:"Penitipan_Status",l:"Penitipan" },{ key:"Blokir_Status",l:"Surat Blokir" },
];

const TABLE_COLS = [
  { k:"ID",l:"ID",w:145 },{ k:"Source",l:"Src",w:42 },
  { k:"Debitur",l:"Debitur",w:140 },{ k:"Bank",l:"Bank",w:110 },
  { k:"Jenis_Aset",l:"Jenis",w:80 },{ k:"Provinsi",l:"Provinsi",w:100 },
  { k:"Kota_Kab",l:"Kota/Kab",w:110 },{ k:"KPKNL",l:"KPKNL",w:130 },
  { k:"Kuadran",l:"Kdr",w:32 },{ k:"Neraca_CaLK",l:"Neraca",w:62 },
  { k:"Kepemilikan_Tier",l:"Kepemilikan",w:120,badge:1 },
  { k:"Masa_Berlaku",l:"Berlaku",w:72,badge:1 },
  { k:"Penitipan_Status",l:"Titip",w:48,badge:1 },
  { k:"Blokir_Status",l:"Blokir",w:48,badge:1 },
  { k:"Luas_Tanah",l:"L.Tanah (m²)",w:90,num:1 },
  { k:"Luas_Bangunan",l:"L.Bang. (m²)",w:90,num:1 },
  { k:"Nilai",l:"Nilai (Rp)",w:120,num:1 },
  { k:"Jumlah_Dokumen",l:"Bidang",w:48,num:1 },
  { k:"Released_Reason",l:"Alasan Release",w:115 },
  { k:"Ket_Lain",l:"Keterangan",w:200 },
];

/* ═══════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════ */
function fmt(n){
  if(n==null)return"-";
  if(Math.abs(n)>=1e12)return(n/1e12).toFixed(2)+" T";
  if(Math.abs(n)>=1e9)return(n/1e9).toFixed(2)+" M";
  if(Math.abs(n)>=1e6)return(n/1e6).toFixed(1)+" Jt";
  if(Math.abs(n)>=1e3)return(n/1e3).toFixed(0)+" Rb";
  return Math.round(n).toLocaleString("id-ID");
}
function fmtCell(v,num){
  if(v==null||v==="")return"-";
  if(num)return typeof v==="number"?v.toLocaleString("id-ID"):v;
  return String(v).length>50?String(v).slice(0,48)+"...":String(v);
}
function agg(data,key,limit=12){
  const m={};
  data.forEach(r=>{const k=r[key];if(k!=null&&k!=="")m[k]=(m[k]||0)+1;});
  return Object.entries(m).map(([name,v])=>({name,v})).sort((a,b)=>b.v-a.v).slice(0,limit);
}

// Jenis Aset grouping (chart-level only, raw data stays unchanged)
function groupJA(v){
  if(!v)return null;
  const u=String(v).toUpperCase();
  if(u==="TANAH")return"Tanah";
  if(u==="TANAH DAN BANGUNAN")return"Tanah & Bangunan";
  if(u==="GEDUNG"||u==="BANGUNAN")return"Gedung/Bangunan";
  if(u==="RUKO"||u==="KIOS"||u==="TOKO")return"Ruko/Kios";
  if(u==="PABRIK"||u==="GUDANG")return"Pabrik/Gudang";
  if(u==="VILLA"||u==="RUMAH"||u==="APARTEMEN")return"Villa/Rumah/Apartemen";
  if(u==="SURAT BERHARGA")return"Surat Berharga";
  if(u==="HOTEL")return"Hotel";
  if(u==="RUANG KANTOR"||u==="RUKAN")return"Ruang Kantor";
  if(u==="PASAR")return"Pasar";
  return v;
}
function aggGrouped(data,key,groupFn,limit=12){
  const m={};
  data.forEach(r=>{const k=groupFn(r[key]);if(k)m[k]=(m[k]||0)+1;});
  return Object.entries(m).map(([name,v])=>({name,v})).sort((a,b)=>b.v-a.v).slice(0,limit);
}

// Kepemilikan label mapping (for data exported with old labels)
const KEP_MAP={"Sertifikat":"SHP/SHM/SHGB/SHMSRS","Dok Kepemilikan":"Girik/Letter C/Petok","Dok Lainnya":"AJB/Covernote/dll"};
function mapKep(v){return KEP_MAP[v]||v;}

// Released reason mapping
function mapRel(v){if(v==="Administratif")return"Lainnya";return v;}

/* ═══════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════ */

const BADGE_COLORS={
  "SHP/SHM/SHGB/SHMSRS":{bg:"#DCFCE7",fg:"#166534"},"Sertifikat":{bg:"#DCFCE7",fg:"#166534"},
  "Girik/Letter C/Petok":{bg:"#FEF9C3",fg:"#854D0E"},"Dok Kepemilikan":{bg:"#FEF9C3",fg:"#854D0E"},
  "AJB/Covernote/dll":{bg:"#F1F5F9",fg:"#475569"},"Dok Lainnya":{bg:"#F1F5F9",fg:"#475569"},
  "Aktif":{bg:"#DCFCE7",fg:"#166534"},"Tidak Aktif":{bg:"#FEE2E2",fg:"#991B1B"},
  "Tidak Diketahui":{bg:"#F1F5F9",fg:"#475569"},
  "Sudah":{bg:"#DBEAFE",fg:"#1E40AF"},"Belum":{bg:"#FEF3C7",fg:"#92400E"},
};
function Badge({value}){
  if(!value||value==="-"||value==="N/A")return<span style={{color:"#94A3B8",fontSize:10}}>-</span>;
  const c=BADGE_COLORS[value]||{bg:"#F1F5F9",fg:"#475569"};
  return<span style={{background:c.bg,color:c.fg,padding:"1px 6px",borderRadius:3,fontSize:9,fontWeight:600,whiteSpace:"nowrap"}}>{value}</span>;
}

function KPI({label,value,sub,accent}){
  return(
    <div style={{flex:1,minWidth:120,background:C.white,borderRadius:8,padding:"12px 14px",borderLeft:`3px solid ${accent}`,boxShadow:"0 1px 2px rgba(0,0,0,0.04)"}}>
      <div style={{fontSize:9,color:C.slate,fontWeight:600,textTransform:"uppercase",letterSpacing:.3}}>{label}</div>
      <div style={{fontSize:19,fontWeight:700,color:C.navy,marginTop:2,fontVariantNumeric:"tabular-nums"}}>{value}</div>
      {sub&&<div style={{fontSize:9,color:"#94A3B8",marginTop:1}}>{sub}</div>}
    </div>
  );
}

function ChartCard({title,children,style:sx}){
  return(
    <div style={{background:C.white,borderRadius:8,padding:"12px 14px 6px",boxShadow:"0 1px 2px rgba(0,0,0,0.04)",display:"flex",flexDirection:"column",...sx}}>
      {title&&<div style={{fontSize:11,fontWeight:600,color:C.navy,marginBottom:6}}>{title}</div>}
      <div style={{flex:1,minHeight:0}}>{children}</div>
    </div>
  );
}

function HBar({data,color,h=200}){
  return(
    <ResponsiveContainer width="100%" height={h}>
      <BarChart data={data} layout="vertical" margin={{left:8,right:14,top:0,bottom:0}}>
        <XAxis type="number" tickFormatter={fmt} tick={{fontSize:9}}/>
        <YAxis type="category" dataKey="name" width={130} tick={{fontSize:9}} interval={0}/>
        <Tooltip formatter={v=>v.toLocaleString("id-ID")}/>
        <Bar dataKey="v" fill={color||C.blue} radius={[0,3,3,0]} barSize={15}/>
      </BarChart>
    </ResponsiveContainer>
  );
}

function Donut({data,h=190}){
  const total=data.reduce((s,x)=>s+x.v,0);
  if(!total)return<div style={{color:C.slate,fontSize:11,textAlign:"center",paddingTop:40}}>Tidak ada data</div>;
  return(
    <ResponsiveContainer width="100%" height={h}>
      <PieChart>
        <Pie data={data} dataKey="v" nameKey="name" cx="50%" cy="48%" innerRadius="36%" outerRadius="68%" paddingAngle={2}
          label={({name,percent})=>percent>.03?`${name} ${(percent*100).toFixed(0)}%`:""} labelLine={false} style={{fontSize:9}}>
          {data.map((_,i)=><Cell key={i} fill={PAL[i%PAL.length]}/>)}
        </Pie>
        <Tooltip formatter={v=>`${v.toLocaleString("id-ID")} (${total?((v/total)*100).toFixed(1):"0"}%)`}/>
      </PieChart>
    </ResponsiveContainer>
  );
}

function TabBar({items,active,onChange}){
  return(
    <div style={{display:"flex",gap:2,flexWrap:"wrap"}}>
      {items.map(t=>(
        <button key={t.k} onClick={()=>onChange(t.k)} style={{
          padding:"3px 8px",borderRadius:4,border:"none",fontSize:9,fontWeight:active===t.k?700:500,
          cursor:"pointer",background:active===t.k?C.blue:"transparent",color:active===t.k?C.white:C.slate
        }}>{t.l}</button>
      ))}
    </div>
  );
}

function MultiChips({label,all,selected,onChange}){
  return(
    <div>
      <div style={{fontSize:8.5,fontWeight:600,color:C.slate,textTransform:"uppercase",letterSpacing:.3,marginBottom:3}}>{label}</div>
      <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
        {all.map(opt=>{
          const on=selected.has(opt);
          return<button key={opt} onClick={()=>{const n=new Set(selected);if(on)n.delete(opt);else n.add(opt);onChange(n);}}
            style={{padding:"3px 8px",borderRadius:4,border:`1px solid ${on?C.blue:C.border}`,fontSize:10,fontWeight:on?600:400,
              cursor:"pointer",background:on?C.blue:"transparent",color:on?C.white:C.navy}}>{opt}</button>;
        })}
      </div>
    </div>
  );
}

/* ── Multi-select dropdown ── */
function FilterDropdown({label,allOptions,selected,onChange}){
  // selected: null = no filter (all pass), Set = only these pass
  const [open,setOpen]=useState(false);
  const [q,setQ]=useState("");
  const ref=useRef();

  useEffect(()=>{
    if(!open)return;
    const h=e=>{if(ref.current&&!ref.current.contains(e.target)){setOpen(false);setQ("");}};
    document.addEventListener("mousedown",h);
    return()=>document.removeEventListener("mousedown",h);
  },[open]);

  const isAll=selected===null;
  const count=isAll?allOptions.length:selected.size;
  const isActive=!isAll&&count<allOptions.length;
  const visible=q?allOptions.filter(o=>o.toLowerCase().includes(q.toLowerCase())):allOptions;
  const isChecked=opt=>isAll||selected.has(opt);

  const toggle=opt=>{
    if(isAll){
      const next=new Set(allOptions);next.delete(opt);onChange(next);
    } else {
      const next=new Set(selected);
      if(next.has(opt))next.delete(opt);else next.add(opt);
      if(next.size===allOptions.length)onChange(null);else onChange(next);
    }
  };

  return(
    <div ref={ref} style={{position:"relative",flex:1,minWidth:105}}>
      <div style={{fontSize:8,fontWeight:600,color:C.slate,textTransform:"uppercase",letterSpacing:.3,marginBottom:1}}>
        {label} <span style={{opacity:.5}}>({allOptions.length})</span>
      </div>
      <button onClick={()=>setOpen(p=>!p)} style={{
        width:"100%",padding:"5px 7px",fontSize:11,border:`1px solid ${isActive?C.blue:C.border}`,borderRadius:4,
        background:C.white,color:C.navy,cursor:"pointer",textAlign:"left",fontWeight:isActive?600:400,
        display:"flex",justifyContent:"space-between",alignItems:"center"
      }}>
        <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
          {isAll?"Semua":count===0?"Tidak ada":`${count} dipilih`}
        </span>
        <span style={{fontSize:8,marginLeft:4,color:C.slate}}>▾</span>
      </button>

      {open&&(
        <div style={{
          position:"absolute",top:"100%",left:0,minWidth:200,maxWidth:320,zIndex:50,marginTop:2,
          background:C.white,border:`1px solid ${C.border}`,borderRadius:6,
          boxShadow:"0 4px 12px rgba(0,0,0,0.1)",overflow:"hidden"
        }}>
          {/* Search (only if many options) */}
          {allOptions.length>6&&(
            <div style={{padding:"6px 8px",borderBottom:`1px solid ${C.border}`}}>
              <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cari..."
                style={{width:"100%",padding:"4px 6px",fontSize:11,border:`1px solid ${C.border}`,borderRadius:3,outline:"none",boxSizing:"border-box",background:C.white,color:C.navy}}/>
            </div>
          )}

          {/* Select all / Clear */}
          <div style={{display:"flex",gap:4,padding:"5px 8px",borderBottom:`1px solid ${C.light}`}}>
            <button onClick={()=>onChange(null)} style={{fontSize:10,color:C.blue,background:"none",border:"none",cursor:"pointer",fontWeight:600,padding:0}}>Pilih Semua</button>
            <span style={{color:C.border}}>|</span>
            <button onClick={()=>onChange(new Set())} style={{fontSize:10,color:C.rose,background:"none",border:"none",cursor:"pointer",fontWeight:600,padding:0}}>Hapus</button>
          </div>

          {/* Options list */}
          <div style={{maxHeight:220,overflowY:"auto"}}>
            {visible.length===0&&<div style={{padding:"8px 10px",fontSize:10,color:C.slate}}>Tidak ditemukan</div>}
            {visible.map(opt=>(
              <label key={opt} style={{
                display:"flex",alignItems:"center",gap:6,padding:"4px 10px",cursor:"pointer",fontSize:11,color:C.navy,
                background:isChecked(opt)?"#F8FAFC":"transparent"
              }} onMouseDown={e=>e.preventDefault()} onClick={()=>toggle(opt)}>
                <span style={{
                  width:14,height:14,borderRadius:3,border:`1.5px solid ${isChecked(opt)?C.blue:C.border}`,
                  background:isChecked(opt)?C.blue:"transparent",display:"flex",alignItems:"center",justifyContent:"center",
                  flexShrink:0,fontSize:9,color:C.white,fontWeight:700
                }}>{isChecked(opt)?"✓":""}</span>
                <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{opt}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function RangeInput({label,value,onChange,formatFn}){
  const [lo,hi]=value;
  const [loTxt,setLoTxt]=useState(String(lo));
  const [hiTxt,setHiTxt]=useState(String(hi));
  useEffect(()=>{setLoTxt(String(Math.round(lo)));setHiTxt(String(Math.round(hi)));},[lo,hi]);
  const commit=()=>{const nlo=Number(loTxt)||0;const nhi=Number(hiTxt)||0;onChange([Math.min(nlo,nhi),Math.max(nlo,nhi)]);};
  const inSt={width:100,padding:"5px 6px",fontSize:11,border:`1px solid ${C.border}`,borderRadius:4,color:C.navy,background:C.white,outline:"none",textAlign:"right",fontVariantNumeric:"tabular-nums"};
  return(
    <div style={{flex:1,minWidth:180}}>
      <div style={{fontSize:8.5,fontWeight:600,color:C.slate,textTransform:"uppercase",letterSpacing:.3,marginBottom:3}}>{label}</div>
      <div style={{display:"flex",alignItems:"center",gap:4}}>
        <input style={inSt} value={loTxt} onChange={e=>setLoTxt(e.target.value)} onBlur={commit} onKeyDown={e=>e.key==="Enter"&&commit()}/>
        <span style={{fontSize:10,color:C.slate}}>s/d</span>
        <input style={inSt} value={hiTxt} onChange={e=>setHiTxt(e.target.value)} onBlur={commit} onKeyDown={e=>e.key==="Enter"&&commit()}/>
      </div>
      <div style={{fontSize:9,color:"#94A3B8",marginTop:2}}>{formatFn(lo)} — {formatFn(hi)}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   UPLOAD VIEW
   ═══════════════════════════════════════════════════════ */
function UploadView({onData}){
  const ref=useRef();
  const [drag,setDrag]=useState(false);
  const go=f=>{const r=new FileReader();r.onload=e=>{try{onData(JSON.parse(e.target.result))}catch{alert("JSON tidak valid")}};r.readAsText(f);};
  return(
    <div style={{fontFamily:"'Inter',system-ui,sans-serif",background:C.light,minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",boxSizing:"border-box",width:"100%",colorScheme:"light"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:11,fontWeight:600,color:C.blue,letterSpacing:.8,textTransform:"uppercase"}}>Dashboard Aset Properti</div>
        <h1 style={{fontSize:22,fontWeight:700,color:C.navy,margin:"6px 0 10px"}}>Upload Data JSON</h1>
        <p style={{color:C.slate,fontSize:12,maxWidth:380,margin:"0 auto 20px",lineHeight:1.6}}>
          Export <code style={{background:C.border,padding:"1px 5px",borderRadius:3,fontSize:11}}>aset_dashboard.json</code> dari Colab.
        </p>
        <div onClick={()=>ref.current.click()}
          onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
          onDrop={e=>{e.preventDefault();setDrag(false);go(e.dataTransfer.files[0])}}
          style={{border:`2px dashed ${drag?C.blue:C.border}`,borderRadius:12,padding:"44px 36px",cursor:"pointer",background:C.white}}>
          <div style={{fontSize:28,marginBottom:6}}>📂</div>
          <div style={{fontSize:13,fontWeight:600,color:C.navy}}>Klik atau drag file JSON</div>
        </div>
        <input ref={ref} type="file" accept=".json" hidden onChange={e=>e.target.files[0]&&go(e.target.files[0])}/>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN DASHBOARD
   ═══════════════════════════════════════════════════════ */
export default function Dashboard(){
  const [raw,setRaw]=useState(null);
  // Multi-select filters: null = no filter (all), Set = selected values
  const [mf,setMf]=useState({});
  const [neracaSel,setNeracaSel]=useState(null);
  const [kuadranSel,setKuadranSel]=useState(null);
  const [ranges,setRanges]=useState({});
  const [search,setSearch]=useState("");
  const [page,setPage]=useState(0);
  const [sortKey,setSortKey]=useState(null);
  const [sortAsc,setSortAsc]=useState(true);
  const [geoTab,setGeoTab]=useState("Provinsi");
  const [showF,setShowF]=useState(true);

  // Set a multi-filter
  const setMfKey=useCallback((key,val)=>{
    setMf(p=>{const n={...p};n[key]=val;return n;});setPage(0);
  },[]);

  /* ── Init on load: apply groupings to data ── */
  useEffect(()=>{
    if(!raw)return;
    raw.forEach(r=>{
      r.Jenis_Aset=groupJA(r.Jenis_Aset)||r.Jenis_Aset;
      r.Kepemilikan_Tier=mapKep(r.Kepemilikan_Tier)||r.Kepemilikan_Tier;
      r.Released_Reason=mapRel(r.Released_Reason)||r.Released_Reason;
    });
    const nv=new Set(),kv=new Set();
    let lt=[Infinity,0],lb=[Infinity,0],nv2=[Infinity,0];
    raw.forEach(r=>{
      if(r.Neraca_CaLK)nv.add(r.Neraca_CaLK);
      if(r.Kuadran)kv.add(r.Kuadran);
      if(r.Luas_Tanah!=null){lt[0]=Math.min(lt[0],r.Luas_Tanah);lt[1]=Math.max(lt[1],r.Luas_Tanah);}
      if(r.Luas_Bangunan!=null){lb[0]=Math.min(lb[0],r.Luas_Bangunan);lb[1]=Math.max(lb[1],r.Luas_Bangunan);}
      if(r.Nilai!=null&&r.Nilai>0){nv2[0]=Math.min(nv2[0],r.Nilai);nv2[1]=Math.max(nv2[1],r.Nilai);}
    });
    if(lt[0]===Infinity)lt=[0,1];if(lb[0]===Infinity)lb=[0,1];if(nv2[0]===Infinity)nv2=[0,1];
    const nd=new Set(nv);nd.delete("RELEASED");
    setNeracaSel(nd);setKuadranSel(kv);
    setRanges({Luas_Tanah:lt,Luas_Bangunan:lb,Nilai:nv2});
    setMf({});
  },[raw]);

  const dataR=useMemo(()=>{
    if(!raw)return null;
    let lt=[Infinity,0],lb=[Infinity,0],nv=[Infinity,0];
    raw.forEach(r=>{
      if(r.Luas_Tanah!=null){lt[0]=Math.min(lt[0],r.Luas_Tanah);lt[1]=Math.max(lt[1],r.Luas_Tanah);}
      if(r.Luas_Bangunan!=null){lb[0]=Math.min(lb[0],r.Luas_Bangunan);lb[1]=Math.max(lb[1],r.Luas_Bangunan);}
      if(r.Nilai!=null&&r.Nilai>0){nv[0]=Math.min(nv[0],r.Nilai);nv[1]=Math.max(nv[1],r.Nilai);}
    });
    if(lt[0]===Infinity)lt=[0,1];if(lb[0]===Infinity)lb=[0,1];if(nv[0]===Infinity)nv=[0,1];
    return{Luas_Tanah:lt,Luas_Bangunan:lb,Nilai:nv};
  },[raw]);

  const allNeraca=useMemo(()=>raw?[...new Set(raw.map(r=>r.Neraca_CaLK).filter(Boolean))].sort():[],[raw]);
  const allKuadran=useMemo(()=>raw?[...new Set(raw.map(r=>r.Kuadran).filter(Boolean))].sort():[],[raw]);

  const resetAll=useCallback(()=>{
    setMf({});setSearch("");setPage(0);setSortKey(null);
    if(raw&&dataR){
      const nd=new Set(allNeraca);nd.delete("RELEASED");setNeracaSel(nd);
      setKuadranSel(new Set(allKuadran));
      setRanges({Luas_Tanah:[...dataR.Luas_Tanah],Luas_Bangunan:[...dataR.Luas_Bangunan],Nilai:[...dataR.Nilai]});
    }
  },[raw,dataR,allNeraca,allKuadran]);

  // Helper: is a multi-filter active (restricting)?
  const isActive=(key)=>{
    const s=mf[key];return s!==null&&s!==undefined;
  };
  const passes=(r,key)=>{
    const s=mf[key];
    if(s===null||s===undefined)return true;
    return s.has(r[key]);
  };

  /* ── Filtered data ── */
  const filtered=useMemo(()=>{
    if(!raw||!neracaSel||!kuadranSel||!ranges.Luas_Tanah)return[];
    let d=raw;
    // Multi-select dropdown filters
    MULTI_FILTERS.forEach(({key})=>{
      const s=mf[key];
      if(s!==null&&s!==undefined&&s.size>0){
        d=d.filter(r=>r[key]!=null&&s.has(r[key]));
      } else if(s!==null&&s!==undefined&&s.size===0){
        d=[];
      }
    });
    // Neraca + Kuadran chips
    d=d.filter(r=>{
      if(r.Neraca_CaLK&&!neracaSel.has(r.Neraca_CaLK))return false;
      if(r.Kuadran&&!kuadranSel.has(r.Kuadran))return false;
      const lt=r.Luas_Tanah,lb=r.Luas_Bangunan,nv=r.Nilai;
      if(lt!=null&&(lt<ranges.Luas_Tanah[0]||lt>ranges.Luas_Tanah[1]))return false;
      if(lb!=null&&(lb<ranges.Luas_Bangunan[0]||lb>ranges.Luas_Bangunan[1]))return false;
      if(nv!=null&&nv>0&&(nv<ranges.Nilai[0]||nv>ranges.Nilai[1]))return false;
      return true;
    });
    if(search.trim()){const q=search.trim().toLowerCase();d=d.filter(r=>SEARCH_FIELDS.some(f=>r[f]&&String(r[f]).toLowerCase().includes(q)));}
    return d;
  },[raw,mf,neracaSel,kuadranSel,ranges,search]);

  /* ── Cascading dropdown options ── */
  const dropOpts=useMemo(()=>{
    if(!raw||!neracaSel||!kuadranSel)return{};
    const o={};
    MULTI_FILTERS.forEach(({key})=>{
      let sub=raw;
      // Apply all OTHER active multi-filters
      MULTI_FILTERS.forEach(({key:k2})=>{
        if(k2===key)return;
        const s=mf[k2];
        if(s!==null&&s!==undefined&&s.size>0)sub=sub.filter(r=>r[k2]!=null&&s.has(r[k2]));
      });
      // Apply neraca + kuadran
      sub=sub.filter(r=>{
        if(r.Neraca_CaLK&&!neracaSel.has(r.Neraca_CaLK))return false;
        if(r.Kuadran&&!kuadranSel.has(r.Kuadran))return false;
        return true;
      });
      if(search.trim()){const q=search.trim().toLowerCase();sub=sub.filter(r=>SEARCH_FIELDS.some(f=>r[f]&&String(r[f]).toLowerCase().includes(q)));}
      const set=new Set();sub.forEach(r=>{if(r[key]!=null)set.add(r[key]);});
      o[key]=[...set].sort();
    });
    return o;
  },[raw,mf,neracaSel,kuadranSel,search]);

  /* ── Auto-clear stale multi-filter values ── */
  useEffect(()=>{
    if(!Object.keys(dropOpts).length)return;
    let changed=false;const next={...mf};
    MULTI_FILTERS.forEach(({key})=>{
      const s=mf[key];
      if(s===null||s===undefined)return;
      const avail=new Set(dropOpts[key]||[]);
      const cleaned=new Set([...s].filter(v=>avail.has(v)));
      if(cleaned.size!==s.size){next[key]=cleaned.size===avail.size?null:cleaned;changed=true;}
    });
    if(changed)setMf(next);
  },[dropOpts]);

  /* ── Sort ── */
  const sorted=useMemo(()=>{
    if(!sortKey)return filtered;
    return[...filtered].sort((a,b)=>{
      let va=a[sortKey],vb=b[sortKey];
      if(va==null)return 1;if(vb==null)return -1;
      if(typeof va==="number"&&typeof vb==="number")return sortAsc?va-vb:vb-va;
      return sortAsc?String(va).localeCompare(String(vb)):String(vb).localeCompare(String(va));
    });
  },[filtered,sortKey,sortAsc]);

  const totalPg=Math.ceil(sorted.length/PAGE_SIZE);
  const pgData=sorted.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);

  const kpi=useMemo(()=>{
    let nilai=0,luas=0,mapped=0,bidang=0;
    filtered.forEach(r=>{
      if(r.Nilai)nilai+=r.Nilai;if(r.Luas_Tanah)luas+=r.Luas_Tanah;
      if(r.Lat!=null&&r.Lon!=null)mapped++;if(r.Jumlah_Dokumen)bidang+=r.Jumlah_Dokumen;
    });
    return{count:filtered.length,nilai,luas,mapped,bidang:Math.round(bidang)};
  },[filtered]);

  const handleSort=useCallback(k=>{setSortKey(p=>{if(p===k){setSortAsc(a=>!a);return k;}setSortAsc(true);return k;});},[]);

  // Count active filters for badge
  const activeFilterCount=useMemo(()=>{
    let c=0;
    MULTI_FILTERS.forEach(({key})=>{const s=mf[key];if(s!==null&&s!==undefined)c++;});
    if(!allNeraca.every(v=>neracaSel&&neracaSel.has(v)))c++;
    if(!allKuadran.every(v=>kuadranSel&&kuadranSel.has(v)))c++;
    return c;
  },[mf,neracaSel,kuadranSel,allNeraca,allKuadran]);

  if(!raw)return<UploadView onData={setRaw}/>;
  if(!neracaSel||!ranges.Luas_Tanah)return null;

  const thSt=w=>({padding:"6px 8px",fontSize:9,fontWeight:600,color:C.slate,textTransform:"uppercase",letterSpacing:.2,
    textAlign:"left",whiteSpace:"nowrap",minWidth:w,borderBottom:`2px solid ${C.border}`,cursor:"pointer",userSelect:"none",
    position:"sticky",top:0,background:C.white,zIndex:1});
  const tdSt={padding:"5px 8px",fontSize:10.5,color:"#334155",borderBottom:`1px solid ${C.light}`,whiteSpace:"nowrap"};
  const geoTabs=[{k:"Provinsi",l:"Provinsi"},{k:"Kota_Kab",l:"Kota/Kab"},{k:"Kanwil",l:"Kanwil"},{k:"KPKNL",l:"KPKNL"}];

  return(
    <div style={{fontFamily:"'Inter',system-ui,sans-serif",background:C.light,minHeight:"100vh",padding:"16px 14px",maxWidth:1280,margin:"0 auto",boxSizing:"border-box",width:"100%",colorScheme:"light"}}>

      {/* ── Header ── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"start",marginBottom:4}}>
        <div>
          <div style={{fontSize:10,fontWeight:600,color:C.blue,letterSpacing:.8,textTransform:"uppercase"}}>Direktorat Jenderal Kekayaan Negara</div>
          <h1 style={{fontSize:18,fontWeight:700,color:C.navy,margin:"3px 0 0"}}>Dashboard Aset Properti</h1>
          <div style={{fontSize:10,color:C.slate,marginTop:1}}>{raw.length.toLocaleString("id-ID")} aset dimuat</div>
        </div>
        <button onClick={()=>{setRaw(null);setMf({});setSearch("");}} style={{padding:"5px 10px",fontSize:10,border:`1px solid ${C.border}`,borderRadius:5,background:C.white,color:C.slate,cursor:"pointer"}}>Ganti File</button>
      </div>

      {/* ── KPIs ── */}
      <div style={{display:"flex",gap:8,margin:"12px 0",flexWrap:"wrap"}}>
        <KPI label="Aset Terfilter" value={kpi.count.toLocaleString("id-ID")} sub={`dari ${raw.length.toLocaleString("id-ID")}`} accent={C.blue}/>
        <KPI label="Jumlah Bidang" value={kpi.bidang.toLocaleString("id-ID")} accent={C.sky}/>
        <KPI label="Total Nilai" value={"Rp "+fmt(kpi.nilai)} accent={C.green}/>
        <KPI label="Luas Tanah" value={fmt(kpi.luas)+" m²"} accent={C.amber}/>
        <KPI label="Terpetakan" value={kpi.mapped.toLocaleString("id-ID")} sub={kpi.count?((kpi.mapped/kpi.count)*100).toFixed(0)+"% koordinat":""} accent={C.violet}/>
      </div>

      {/* ── Filters ── */}
      <div style={{background:C.white,borderRadius:8,boxShadow:"0 1px 2px rgba(0,0,0,0.04)",marginBottom:10,overflow:"visible"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 12px",borderBottom:showF?`1px solid ${C.border}`:"none"}}>
          <button onClick={()=>setShowF(p=>!p)} style={{background:"none",border:"none",cursor:"pointer",fontSize:12,fontWeight:600,color:C.navy,display:"flex",alignItems:"center",gap:4}}>
            <span style={{fontSize:14,transition:"transform .15s",display:"inline-block",transform:showF?"rotate(90deg)":"rotate(0)"}}>▸</span> Filter &amp; Pencarian
          </button>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            {activeFilterCount>0&&<span style={{fontSize:9,color:C.blue,fontWeight:600}}>{activeFilterCount} filter aktif</span>}
            <button onClick={resetAll} style={{padding:"4px 10px",fontSize:10,fontWeight:600,border:"none",borderRadius:4,background:C.border,color:C.slate,cursor:"pointer"}}>Reset</button>
          </div>
        </div>

        {showF&&<div style={{padding:"10px 12px"}}>
          {/* Search */}
          <div style={{marginBottom:8,maxWidth:420}}>
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:8,top:6,fontSize:12,color:C.slate}}>🔍</span>
              <input value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}
                placeholder="Cari ID, debitur, bank, alamat, KPKNL..."
                style={{width:"100%",padding:"6px 8px 6px 28px",fontSize:11,border:`1px solid ${C.border}`,borderRadius:5,color:C.navy,background:C.white,outline:"none",boxSizing:"border-box"}}/>
            </div>
          </div>

          {/* Multi-select dropdowns */}
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
            {MULTI_FILTERS.map(({key,l})=>(
              <FilterDropdown key={key} label={l}
                allOptions={dropOpts[key]||[]}
                selected={mf[key]===undefined?null:mf[key]}
                onChange={val=>setMfKey(key,val)}/>
            ))}
          </div>

          {/* Neraca + Kuadran chips */}
          <div style={{display:"flex",gap:20,flexWrap:"wrap",marginBottom:8}}>
            <MultiChips label="Neraca / CaLK (default: tanpa Released)" all={allNeraca} selected={neracaSel} onChange={s=>{setNeracaSel(s);setPage(0);}}/>
            <MultiChips label="Kuadran" all={allKuadran} selected={kuadranSel} onChange={s=>{setKuadranSel(s);setPage(0);}}/>
          </div>

          {/* Range inputs */}
          <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
            <RangeInput label="Luas Tanah (m²)" value={ranges.Luas_Tanah} onChange={v=>{setRanges(p=>({...p,Luas_Tanah:v}));setPage(0);}} formatFn={v=>fmt(v)+" m²"}/>
            <RangeInput label="Luas Bangunan (m²)" value={ranges.Luas_Bangunan} onChange={v=>{setRanges(p=>({...p,Luas_Bangunan:v}));setPage(0);}} formatFn={v=>fmt(v)+" m²"}/>
            <RangeInput label="Nilai (Rp)" value={ranges.Nilai} onChange={v=>{setRanges(p=>({...p,Nilai:v}));setPage(0);}} formatFn={v=>"Rp "+fmt(v)}/>
          </div>
        </div>}
      </div>

      {/* ══════════════════════════════════════════════════
         CHARTS
         ══════════════════════════════════════════════════ */}

      {/* Row 1: Geography (tabbed) + Jenis Aset (grouped) */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        <ChartCard style={{minHeight:300}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
            <span style={{fontSize:11,fontWeight:600,color:C.navy}}>Distribusi Wilayah</span>
            <TabBar items={geoTabs} active={geoTab} onChange={setGeoTab}/>
          </div>
          <HBar data={agg(filtered,geoTab)} h={260}/>
        </ChartCard>

        <ChartCard title="Jenis Aset" style={{minHeight:300}}>
          <HBar data={agg(filtered,"Jenis_Aset")} h={260}/>
        </ChartCard>
      </div>

      {/* Row 2: Kuadran + Kepemilikan + Source */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
        <ChartCard title="Kuadran">
          <Donut data={agg(filtered,"Kuadran",6)}/>
        </ChartCard>
        <ChartCard title="Kepemilikan Dokumen">
          <Donut data={agg(filtered,"Kepemilikan_Tier",5)}/>
        </ChartCard>
        <ChartCard title="Sumber (BPPN vs PPA)">
          <Donut data={agg(filtered,"Source",3)}/>
        </ChartCard>
      </div>

      {/* Row 3: Masa Berlaku + Penitipan + Blokir */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:10}}>
        <ChartCard title="Masa Berlaku Dokumen">
          <Donut data={agg(filtered,"Masa_Berlaku",5)}/>
        </ChartCard>
        <ChartCard title="Penitipan ke KPKNL">
          <Donut data={agg(filtered,"Penitipan_Status",3)}/>
        </ChartCard>
        <ChartCard title="Surat Blokir">
          <Donut data={agg(filtered,"Blokir_Status",3)}/>
        </ChartCard>
      </div>

      {/* Row 4: Released (conditional) */}
      {neracaSel.has("RELEASED")&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
          <ChartCard title="Alasan Released" style={{minHeight:260}}>
            <HBar data={agg(filtered.filter(r=>r.Neraca_CaLK==="RELEASED"),"Released_Reason",8)} color={C.rose} h={220}/>
          </ChartCard>
          <ChartCard title="Released per Sumber">
            <Donut data={agg(filtered.filter(r=>r.Neraca_CaLK==="RELEASED"),"Source",3)} h={220}/>
          </ChartCard>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
         TABLE
         ══════════════════════════════════════════════════ */}
      <div style={{background:C.white,borderRadius:8,boxShadow:"0 1px 2px rgba(0,0,0,0.04)",overflow:"hidden"}}>
        <div style={{padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:`1px solid ${C.border}`}}>
          <span style={{fontSize:12,fontWeight:600,color:C.navy}}>Data Aset</span>
          <span style={{fontSize:10,color:C.slate}}>{filtered.length.toLocaleString("id-ID")} baris</span>
        </div>
        <div style={{overflowX:"auto",maxHeight:540}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr>{TABLE_COLS.map(c=><th key={c.k} style={thSt(c.w)} onClick={()=>handleSort(c.k)}>{c.l}{sortKey===c.k?(sortAsc?" ↑":" ↓"):""}</th>)}</tr>
            </thead>
            <tbody>
              {pgData.length===0&&<tr><td colSpan={TABLE_COLS.length} style={{...tdSt,textAlign:"center",padding:24,color:C.slate}}>Tidak ada data.</td></tr>}
              {pgData.map((r,i)=>(
                <tr key={i} style={{background:i%2===0?C.white:"#FAFBFC"}}>
                  {TABLE_COLS.map(c=>(
                    <td key={c.k} style={{...tdSt,textAlign:c.num?"right":"left"}}>
                      {c.badge?<Badge value={r[c.k]}/>:fmtCell(r[c.k],c.num)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPg>1&&(
          <div style={{display:"flex",justifyContent:"center",alignItems:"center",gap:8,padding:"8px",borderTop:`1px solid ${C.border}`}}>
            <button onClick={()=>setPage(0)} disabled={page===0} style={{padding:"4px 8px",fontSize:10,border:`1px solid ${C.border}`,borderRadius:4,background:C.white,color:C.navy,cursor:page===0?"default":"pointer",opacity:page===0?.3:1}}>«</button>
            <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0} style={{padding:"4px 8px",fontSize:10,border:`1px solid ${C.border}`,borderRadius:4,background:C.white,color:C.navy,cursor:page===0?"default":"pointer",opacity:page===0?.3:1}}>‹</button>
            <span style={{fontSize:10,color:C.slate,minWidth:60,textAlign:"center"}}>{page+1} / {totalPg}</span>
            <button onClick={()=>setPage(p=>Math.min(totalPg-1,p+1))} disabled={page>=totalPg-1} style={{padding:"4px 8px",fontSize:10,border:`1px solid ${C.border}`,borderRadius:4,background:C.white,color:C.navy,cursor:page>=totalPg-1?"default":"pointer",opacity:page>=totalPg-1?.3:1}}>›</button>
            <button onClick={()=>setPage(totalPg-1)} disabled={page>=totalPg-1} style={{padding:"4px 8px",fontSize:10,border:`1px solid ${C.border}`,borderRadius:4,background:C.white,color:C.navy,cursor:page>=totalPg-1?"default":"pointer",opacity:page>=totalPg-1?.3:1}}>»</button>
          </div>
        )}
      </div>

      <div style={{textAlign:"center",fontSize:9,color:"#94A3B8",marginTop:12}}>Data per Juni 2026 · Aset Properti Eks BPPN &amp; Eks Kelolaan PT PPA</div>
    </div>
  );
}
