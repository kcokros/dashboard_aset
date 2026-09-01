import { useState, useMemo, useCallback, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";

const NAVY = "#162032";
const BLUE = "#2563EB";
const SLATE = "#64748B";
const LIGHT = "#F1F5F9";
const WHITE = "#FFFFFF";
const GREEN = "#059669";
const AMBER = "#D97706";
const VIOLET = "#7C3AED";
const PIE_PAL = ["#2563EB","#059669","#D97706","#7C3AED","#0EA5E9","#E11D48","#8B5CF6","#F59E0B"];

const FILTER_KEYS = [
  { key:"Source", label:"Sumber" },
  { key:"Provinsi", label:"Provinsi" },
  { key:"Kanwil", label:"Kanwil" },
  { key:"Jenis_Aset", label:"Jenis Aset" },
  { key:"Kuadran", label:"Kuadran" },
  { key:"Neraca_CaLK", label:"Neraca/CaLK" },
  { key:"Penitipan_KPKNL", label:"Penitipan" },
  { key:"Kategori_Aset", label:"Kategori" },
];

const TABLE_COLS = [
  { key:"ID", label:"ID", w:150 },
  { key:"Source", label:"Sumber", w:60 },
  { key:"Debitur", label:"Debitur", w:160 },
  { key:"Bank", label:"Bank", w:120 },
  { key:"Jenis_Aset", label:"Jenis Aset", w:100 },
  { key:"Provinsi", label:"Provinsi", w:110 },
  { key:"Kota_Kab", label:"Kota/Kab", w:120 },
  { key:"Kanwil", label:"Kanwil", w:160 },
  { key:"KPKNL", label:"KPKNL", w:140 },
  { key:"Kuadran", label:"Kdr", w:40 },
  { key:"Neraca_CaLK", label:"Neraca", w:70 },
  { key:"Luas_Tanah", label:"Luas Tanah", w:90, num:true },
  { key:"Nilai", label:"Nilai (Rp)", w:130, num:true },
];

const SEARCH_FIELDS = ["ID","Debitur","Bank","Alamat","Kota_Kab","KPKNL"];
const PAGE_SIZE = 50;

function fmt(n) {
  if (n == null) return "-";
  if (n >= 1e12) return (n/1e12).toFixed(2) + " T";
  if (n >= 1e9) return (n/1e9).toFixed(2) + " M";
  if (n >= 1e6) return (n/1e6).toFixed(1) + " Jt";
  return n.toLocaleString("id-ID");
}

function fmtCell(v, num) {
  if (v == null || v === "") return "-";
  if (num) return typeof v === "number" ? v.toLocaleString("id-ID") : v;
  return String(v);
}

function aggregate(data, key, limit=10) {
  const m = {};
  data.forEach(r => { const k = r[key]; if (k) m[k] = (m[k]||0)+1; });
  return Object.entries(m).map(([name,v])=>({name,v})).sort((a,b)=>b.v-a.v).slice(0,limit);
}

/* ── Styles ─────────────────────────────────────────── */
const styles = {
  page: { fontFamily:"'Inter',system-ui,sans-serif", background:LIGHT, minHeight:"100vh", padding:"20px 16px" },
  hdr: { fontSize:11, fontWeight:600, color:BLUE, letterSpacing:0.8, textTransform:"uppercase" },
  h1: { fontSize:20, fontWeight:700, color:NAVY, margin:"4px 0 0" },
  sub: { fontSize:11, color:SLATE, marginTop:2 },
  kpiRow: { display:"flex", gap:10, margin:"16px 0", flexWrap:"wrap" },
  kpi: (accent) => ({
    flex:1, minWidth:140, background:WHITE, borderRadius:8, padding:"14px 16px",
    borderLeft:`3px solid ${accent}`, boxShadow:"0 1px 2px rgba(0,0,0,0.05)"
  }),
  kpiLabel: { fontSize:10, color:SLATE, fontWeight:500, textTransform:"uppercase", letterSpacing:0.3 },
  kpiVal: { fontSize:22, fontWeight:700, color:NAVY, marginTop:2, fontVariantNumeric:"tabular-nums" },
  kpiSub: { fontSize:10, color:"#94A3B8", marginTop:1 },
  filterBar: { background:WHITE, borderRadius:8, padding:"12px 14px", marginBottom:12, boxShadow:"0 1px 2px rgba(0,0,0,0.05)" },
  filterGrid: { display:"flex", gap:8, flexWrap:"wrap", alignItems:"end" },
  filterGroup: { display:"flex", flexDirection:"column", gap:2, minWidth:120, flex:1 },
  filterLabel: { fontSize:9, fontWeight:600, color:SLATE, textTransform:"uppercase", letterSpacing:0.3 },
  select: {
    padding:"6px 8px", fontSize:12, border:"1px solid #E2E8F0", borderRadius:5,
    background:WHITE, color:NAVY, cursor:"pointer", outline:"none", width:"100%"
  },
  searchWrap: { position:"relative", minWidth:200, flex:2 },
  searchInput: {
    width:"100%", padding:"6px 8px 6px 28px", fontSize:12, border:"1px solid #E2E8F0",
    borderRadius:5, background:WHITE, color:NAVY, outline:"none", boxSizing:"border-box"
  },
  searchIcon: { position:"absolute", left:8, top:8, fontSize:12, color:SLATE, pointerEvents:"none" },
  resetBtn: {
    padding:"6px 12px", fontSize:11, fontWeight:600, border:"none", borderRadius:5,
    background:"#E2E8F0", color:SLATE, cursor:"pointer", whiteSpace:"nowrap", alignSelf:"end"
  },
  chartRow: { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 },
  chartCard: {
    background:WHITE, borderRadius:8, padding:"14px 16px 8px",
    boxShadow:"0 1px 2px rgba(0,0,0,0.05)", minHeight:260
  },
  chartTitle: { fontSize:12, fontWeight:600, color:NAVY, marginBottom:8 },
  tableWrap: {
    background:WHITE, borderRadius:8, boxShadow:"0 1px 2px rgba(0,0,0,0.05)", overflow:"hidden"
  },
  tableHeader: {
    padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center",
    borderBottom:"1px solid #E2E8F0"
  },
  tableTitle: { fontSize:13, fontWeight:600, color:NAVY },
  tableCount: { fontSize:11, color:SLATE },
  tableScroll: { overflowX:"auto" },
  th: (w) => ({
    padding:"8px 10px", fontSize:10, fontWeight:600, color:SLATE, textTransform:"uppercase",
    letterSpacing:0.3, textAlign:"left", whiteSpace:"nowrap", minWidth:w,
    borderBottom:"2px solid #E2E8F0", cursor:"pointer", userSelect:"none"
  }),
  td: { padding:"7px 10px", fontSize:11, color:"#334155", borderBottom:"1px solid #F1F5F9", whiteSpace:"nowrap" },
  pager: { display:"flex", justifyContent:"center", alignItems:"center", gap:8, padding:"10px 16px" },
  pageBtn: (on) => ({
    padding:"5px 12px", fontSize:11, fontWeight:500, border:"1px solid #E2E8F0",
    borderRadius:5, background: on ? BLUE : WHITE, color: on ? WHITE : NAVY,
    cursor:"pointer", opacity: on ? 1 : 0.7
  }),
  upload: {
    display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
    minHeight:"60vh", gap:16, textAlign:"center"
  },
  uploadBox: {
    border:"2px dashed #CBD5E1", borderRadius:12, padding:"48px 40px", cursor:"pointer",
    transition:"border-color 0.2s", background:WHITE
  },
  tabs: { display:"flex", gap:3, background:"#E2E8F0", borderRadius:6, padding:2, width:"fit-content" },
  tab: (on) => ({
    padding:"5px 14px", borderRadius:5, border:"none", fontSize:11, fontWeight:600,
    cursor:"pointer", background: on ? WHITE : "transparent", color: on ? NAVY : SLATE,
    boxShadow: on ? "0 1px 2px rgba(0,0,0,0.06)" : "none"
  }),
};

function UploadView({ onData }) {
  const ref = useRef();
  const [dragging, setDragging] = useState(false);

  const handleFile = (f) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result);
        onData(json);
      } catch { alert("Format JSON tidak valid."); }
    };
    reader.readAsText(f);
  };

  return (
    <div style={styles.page}>
      <div style={styles.upload}>
        <div>
          <div style={styles.hdr}>Dashboard Aset Properti</div>
          <h1 style={{ ...styles.h1, fontSize:24 }}>Upload Data JSON</h1>
          <p style={{ color:SLATE, fontSize:13, maxWidth:400, margin:"8px auto 0", lineHeight:1.6 }}>
            Export file <code style={{ background:"#E2E8F0", padding:"1px 5px", borderRadius:3, fontSize:12 }}>aset_dashboard.json</code> dari
            Colab, lalu upload di sini.
          </p>
        </div>
        <div
          style={{ ...styles.uploadBox, borderColor: dragging ? BLUE : "#CBD5E1" }}
          onClick={() => ref.current.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
        >
          <div style={{ fontSize:32, marginBottom:8 }}>📂</div>
          <div style={{ fontSize:13, fontWeight:600, color:NAVY }}>Klik atau drag file JSON</div>
          <div style={{ fontSize:11, color:SLATE, marginTop:4 }}>aset_dashboard.json</div>
        </div>
        <input ref={ref} type="file" accept=".json" hidden onChange={e => handleFile(e.target.files[0])} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [rawData, setRawData] = useState(null);
  const [filters, setFilters] = useState({});
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [chartView, setChartView] = useState("Kuadran");

  const setFilter = useCallback((k, v) => {
    setFilters(prev => {
      const next = { ...prev, [k]: v || null };
      // Clean out null entries
      Object.keys(next).forEach(key => { if (!next[key]) delete next[key]; });
      return next;
    });
    setPage(0);
  }, []);

  // Auto-clear any filter whose selected value no longer appears
  // in its cascaded options (e.g., picked Kanwil Sulawesi then
  // switched Provinsi to Aceh)
  useMemo(() => {
    if (!rawData) return;
    let stale = false;
    const cleaned = { ...filters };
    Object.entries(filters).forEach(([k, v]) => {
      if (v && options[k] && !options[k].includes(v)) {
        delete cleaned[k];
        stale = true;
      }
    });
    if (stale) setFilters(cleaned);
  }, [options]);

  const resetFilters = useCallback(() => {
    setFilters({});
    setSearch("");
    setPage(0);
  }, []);

  const handleSort = useCallback((key) => {
    setSortKey(prev => {
      if (prev === key) { setSortAsc(a => !a); return key; }
      setSortAsc(true);
      return key;
    });
  }, []);

  // Apply all active filters + search to get final filtered set
  const filtered = useMemo(() => {
    if (!rawData) return [];
    let d = rawData;
    Object.entries(filters).forEach(([k, v]) => {
      if (v) d = d.filter(r => r[k] === v);
    });
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      d = d.filter(r => SEARCH_FIELDS.some(f => r[f] && String(r[f]).toLowerCase().includes(q)));
    }
    return d;
  }, [rawData, filters, search]);

  // Cascading options: for each filter, show only values that exist
  // in data filtered by all OTHER active filters (not itself).
  // This prevents impossible combinations while staying order-independent.
  const options = useMemo(() => {
    if (!rawData) return {};
    const activeKeys = Object.entries(filters).filter(([, v]) => v);
    const o = {};
    FILTER_KEYS.forEach(({ key }) => {
      // Apply every active filter EXCEPT this one
      let subset = rawData;
      activeKeys.forEach(([k, v]) => {
        if (k !== key) subset = subset.filter(r => r[k] === v);
      });
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        subset = subset.filter(r => SEARCH_FIELDS.some(f => r[f] && String(r[f]).toLowerCase().includes(q)));
      }
      const set = new Set();
      subset.forEach(r => { if (r[key]) set.add(r[key]); });
      o[key] = [...set].sort();
    });
    return o;
  }, [rawData, filters, search]);

  // Sorted for table
  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      let va = a[sortKey], vb = b[sortKey];
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number")
        return sortAsc ? va - vb : vb - va;
      return sortAsc
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
  }, [filtered, sortKey, sortAsc]);

  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const pageData = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // KPIs
  const kpis = useMemo(() => {
    const count = filtered.length;
    let nilai = 0, luas = 0, mapped = 0;
    filtered.forEach(r => {
      if (r.Nilai) nilai += r.Nilai;
      if (r.Luas_Tanah) luas += r.Luas_Tanah;
      if (r.Lat != null && r.Lon != null) mapped++;
    });
    return { count, nilai, luas, mapped };
  }, [filtered]);

  // Donut data for selected view
  const donutData = useMemo(() => aggregate(filtered, chartView, 8), [filtered, chartView]);

  if (!rawData) return <UploadView onData={setRawData} />;

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={{ marginBottom:4 }}>
        <div style={styles.hdr}>Direktorat Jenderal Kekayaan Negara</div>
        <h1 style={styles.h1}>Dashboard Aset Properti</h1>
        <div style={styles.sub}>{rawData.length.toLocaleString("id-ID")} aset dimuat</div>
      </div>

      {/* KPIs */}
      <div style={styles.kpiRow}>
        <div style={styles.kpi(BLUE)}>
          <div style={styles.kpiLabel}>Aset Terfilter</div>
          <div style={styles.kpiVal}>{kpis.count.toLocaleString("id-ID")}</div>
          <div style={styles.kpiSub}>dari {rawData.length.toLocaleString("id-ID")} total</div>
        </div>
        <div style={styles.kpi(GREEN)}>
          <div style={styles.kpiLabel}>Total Nilai</div>
          <div style={styles.kpiVal}>Rp {fmt(kpis.nilai)}</div>
        </div>
        <div style={styles.kpi(AMBER)}>
          <div style={styles.kpiLabel}>Luas Tanah</div>
          <div style={styles.kpiVal}>{fmt(kpis.luas)} m²</div>
        </div>
        <div style={styles.kpi(VIOLET)}>
          <div style={styles.kpiLabel}>Terpetakan</div>
          <div style={styles.kpiVal}>{kpis.mapped.toLocaleString("id-ID")}</div>
          <div style={styles.kpiSub}>{kpis.count ? ((kpis.mapped/kpis.count)*100).toFixed(0) : 0}% koordinat</div>
        </div>
      </div>

      {/* Filters */}
      <div style={styles.filterBar}>
        <div style={styles.filterGrid}>
          {FILTER_KEYS.map(({ key, label }) => {
            const opts = options[key] || [];
            const active = !!filters[key];
            return (
              <div key={key} style={styles.filterGroup}>
                <span style={styles.filterLabel}>
                  {label}
                  <span style={{ fontWeight:400, opacity:0.6, marginLeft:3 }}>({opts.length})</span>
                </span>
                <select
                  style={{ ...styles.select, borderColor: active ? BLUE : "#E2E8F0", fontWeight: active ? 600 : 400 }}
                  value={filters[key] || ""}
                  onChange={e => setFilter(key, e.target.value || null)}
                >
                  <option value="">Semua</option>
                  {opts.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            );
          })}
          <div style={styles.searchWrap}>
            <span style={styles.filterLabel}>Cari</span>
            <div style={{ position:"relative" }}>
              <span style={styles.searchIcon}>🔍</span>
              <input
                style={styles.searchInput}
                placeholder="ID, debitur, bank, alamat..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0); }}
              />
            </div>
          </div>
          <button style={styles.resetBtn} onClick={resetFilters}>Reset</button>
        </div>
      </div>

      {/* Charts */}
      <div style={styles.chartRow}>
        <div style={styles.chartCard}>
          <div style={styles.chartTitle}>Distribusi per Provinsi (Top 10)</div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={aggregate(filtered, "Provinsi")} layout="vertical" margin={{ left:10, right:16 }}>
              <XAxis type="number" tickFormatter={fmt} tick={{ fontSize:9 }} />
              <YAxis type="category" dataKey="name" width={100} tick={{ fontSize:9 }} />
              <Tooltip formatter={v => v.toLocaleString("id-ID")} />
              <Bar dataKey="v" fill={BLUE} radius={[0,3,3,0]} barSize={16} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={styles.chartCard}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
            <div style={styles.chartTitle}>Distribusi</div>
            <div style={styles.tabs}>
              {["Kuadran","Neraca_CaLK","Jenis_Aset","Kategori_Aset"].map(k => (
                <button key={k} style={styles.tab(chartView===k)} onClick={() => setChartView(k)}>
                  {k === "Neraca_CaLK" ? "Neraca" : k === "Jenis_Aset" ? "Jenis" : k === "Kategori_Aset" ? "Kategori" : k}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={donutData} dataKey="v" nameKey="name" cx="50%" cy="48%" innerRadius="40%" outerRadius="68%" paddingAngle={2}
                label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false} style={{ fontSize:10 }}>
                {donutData.map((_, i) => <Cell key={i} fill={PIE_PAL[i % PIE_PAL.length]} />)}
              </Pie>
              <Tooltip formatter={v => v.toLocaleString("id-ID")} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table */}
      <div style={styles.tableWrap}>
        <div style={styles.tableHeader}>
          <span style={styles.tableTitle}>Data Aset</span>
          <span style={styles.tableCount}>{filtered.length.toLocaleString("id-ID")} baris</span>
        </div>
        <div style={styles.tableScroll}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr>
                {TABLE_COLS.map(c => (
                  <th key={c.key} style={styles.th(c.w)} onClick={() => handleSort(c.key)}>
                    {c.label} {sortKey === c.key ? (sortAsc ? "↑" : "↓") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageData.length === 0 && (
                <tr><td colSpan={TABLE_COLS.length} style={{ ...styles.td, textAlign:"center", padding:24, color:SLATE }}>Tidak ada data sesuai filter.</td></tr>
              )}
              {pageData.map((r, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? WHITE : "#FAFBFC" }}>
                  {TABLE_COLS.map(c => (
                    <td key={c.key} style={{ ...styles.td, textAlign: c.num ? "right" : "left" }}>
                      {fmtCell(r[c.key], c.num)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div style={styles.pager}>
            <button style={styles.pageBtn(false)} onClick={() => setPage(p => Math.max(0, p-1))} disabled={page===0}>‹ Prev</button>
            <span style={{ fontSize:11, color:SLATE }}>
              {page+1} / {totalPages}
            </span>
            <button style={styles.pageBtn(false)} onClick={() => setPage(p => Math.min(totalPages-1, p+1))} disabled={page>=totalPages-1}>Next ›</button>
          </div>
        )}
      </div>

      <div style={{ textAlign:"center", fontSize:10, color:"#94A3B8", marginTop:14 }}>
        Data per Juni 2026 · Sumber: Aset Properti BPPN &amp; PPA
      </div>
    </div>
  );
}
