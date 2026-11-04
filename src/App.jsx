import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEYS = {
  bookings: "salas_bookings", professionals: "salas_professionals",
  rooms: "salas_rooms", prices: "salas_prices",
  credentials: "salas_credentials", financeiro: "salas_financeiro",
  config: "salas_config",
};

// ─── PIX helpers ──────────────────────────────────────────────────────────────
function pixCRC16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) { crc = (crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1; }
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, "0");
}
function emvField(id, value) { const len = String(value.length).padStart(2,"0"); return `${id}${len}${value}`; }
function generatePix({ key, name, city, amount, txid="***" }) {
  if (!key || !name || !city || !amount) return "";
  const merchantAcct = emvField("00","BR.GOV.BCB.PIX") + emvField("01", key);
  const addData = emvField("05", txid.substring(0,25));
  const payload =
    emvField("00","01") +
    emvField("26", merchantAcct) +
    emvField("52","0000") +
    emvField("53","986") +
    emvField("54", amount.toFixed(2)) +
    emvField("58","BR") +
    emvField("59", name.substring(0,25)) +
    emvField("60", city.substring(0,15)) +
    emvField("62", addData) +
    "6304";
  return payload + pixCRC16(payload);
}
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

const DEFAULT_ROOMS = [
  { id: 1, name: "Sala 01", color: "#72816A" },
  { id: 2, name: "Sala 02", color: "#72816A" },
];
const HOURS = Array.from({ length: 14 }, (_, i) => `${String(i + 7).padStart(2, "0")}:00`);
const DURATIONS = Array.from({ length: HOURS.length - 1 }, (_, i) => i + 1);
const SPECIALTIES = ["Psicólogo(a)", "Terapeuta", "Advogado(a)", "Consultor(a)", "Médico(a)", "Dentista", "Coach", "Nutricionista", "Fisioterapeuta", "Outro"];
const REGISTRO_TIPOS = ["CRP","CRM","OAB","CRN","CREFITO","CRO","CFP","CREA","CRC","Outro"];
function registroTipoFor(specialty) {
  if (!specialty) return "CRP";
  if (specialty.includes("Psicólogo")) return "CRP";
  if (specialty.includes("Médico")) return "CRM";
  if (specialty.includes("Advogado")) return "OAB";
  if (specialty.includes("Nutricionista")) return "CRN";
  if (specialty.includes("Fisioterapeuta")) return "CREFITO";
  if (specialty.includes("Dentista")) return "CRO";
  return "CRP";
}
const STATUSES = [
  { value: "confirmed", label: "Confirmado", color: "#72816A", bg: "#d1f0da" },
  { value: "pending",   label: "Pendente",   color: "#d97706", bg: "#fef3c7" },
  { value: "waitlist",  label: "Lista de espera", color: "#5a9baa", bg: "#E6F4F7" },
];
const WEEKDAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const FIN_CATS_REC = ["Sublocação de sala", "Consulta avulsa", "Pacote mensal", "Outros"];
const FIN_CATS_PAG = ["Aluguel", "Energia / Água", "Internet", "Material de escritório", "Manutenção", "Impostos / Taxas", "Salário / Comissão", "Outros"];

function toKey(date) { return typeof date === "string" ? date : date.toISOString().split("T")[0]; }
function getWeekStart(d) { const dt = new Date(d); const day = dt.getDay(); dt.setDate(dt.getDate() - (day === 0 ? 6 : day - 1)); return dt; }
function addDays(d, n) { const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt; }
function addMonths(d, n) { const dt = new Date(d); dt.setMonth(dt.getMonth() + n); return dt; }
function getMonthGrid(base) {
  const year = base.getFullYear(), month = base.getMonth();
  const first = new Date(year, month, 1), last = new Date(year, month + 1, 0);
  const startOffset = (first.getDay() + 6) % 7;
  const endPad = (7 - ((startOffset + last.getDate()) % 7)) % 7;
  const days = [];
  for (let i = startOffset; i > 0; i--) days.push({ date: addDays(first, -i), curr: false });
  for (let i = 1; i <= last.getDate(); i++) days.push({ date: new Date(year, month, i), curr: true });
  for (let i = 1; i <= endPad; i++) days.push({ date: addDays(last, i), curr: false });
  return days;
}
function getWeekDays(base) { const s = getWeekStart(base); return Array.from({ length: 7 }, (_, i) => addDays(s, i)); }
function formatBR(d) { const dt = new Date(d + "T12:00:00"); return `${String(dt.getDate()).padStart(2,"0")}/${String(dt.getMonth()+1).padStart(2,"0")}`; }
function monthLabel(d) { return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`; }
function hourToIndex(h) { return HOURS.indexOf(h); }
function openWhatsApp(phone, name, roomName, date, hour) {
  const clean = phone.replace(/\D/g, "");
  const full = clean.startsWith("55") ? clean : "55" + clean;
  const msg = encodeURIComponent(`Olá ${name}! ✅ Sua reserva foi confirmada:\n📍 ${roomName}\n📅 ${date} às ${hour}\nQualquer dúvida, entre em contato. Obrigado!`);
  window.open(`https://wa.me/${full}?text=${msg}`, "_blank");
}
function exportCSV(rows, month, year) {
  const header = ["Data","Horário","Duração (h)","Sala","Profissional","Especialidade","Status","Valor"];
  const lines = [header.join(";"), ...rows.map(r => [formatBR(r.day),r.hour,r.duration??1,r.room,r.name,r.type,r.statusLabel||"—",`R$ ${r.price}`].join(";"))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `relatorio_${MONTH_NAMES[month]}_${year}.csv`; a.click(); URL.revokeObjectURL(url);
}

// ─── Login ────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [user, setUser] = useState(""); const [pass, setPass] = useState("");
  const [err, setErr] = useState(""); const [show, setShow] = useState(false);
  function attempt() {
    const creds = load(STORAGE_KEYS.credentials, { user: "admin", pass: "geresala123" });
    if (user.trim() === creds.user && pass === creds.pass) { onLogin(); }
    else { setErr("Usuário ou senha incorretos."); setPass(""); }
  }
  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#1a2010 0%,#2d3c20 50%,#1a2010 100%)", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ background:"#fff", borderRadius:20, padding:"48px 44px", width:400, boxShadow:"0 24px 60px rgba(0,0,0,.35)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:36 }}>
          <div style={{ width:48, height:48, background:"linear-gradient(135deg,#2d3c20,#72816A)", borderRadius:14, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>🏢</div>
          <div>
            <div style={{ fontSize:22, fontWeight:800, letterSpacing:"-.5px" }}>GereSala</div>
            <div style={{ fontSize:12, color:"#8a9a7a" }}>Sistema de Gestão de Salas</div>
          </div>
        </div>
        <div style={{ fontSize:16, fontWeight:700, marginBottom:22, color:"#1e2816" }}>Acesso ao sistema</div>
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <div>
            <div style={labelSt}>Usuário</div>
            <input value={user} onChange={e=>{setUser(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&attempt()} placeholder="Digite seu usuário" autoFocus style={inputSt} />
          </div>
          <div>
            <div style={labelSt}>Senha</div>
            <div style={{ position:"relative" }}>
              <input value={pass} onChange={e=>{setPass(e.target.value);setErr("");}} onKeyDown={e=>e.key==="Enter"&&attempt()} type={show?"text":"password"} placeholder="Digite sua senha"
                style={{ ...inputSt, border:`1.5px solid ${err?"#ef4444":"#C8B8A0"}`, paddingRight:42 }} />
              <button onClick={()=>setShow(s=>!s)} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", fontSize:14, color:"#8a9a7a" }}>{show?"🙈":"👁"}</button>
            </div>
          </div>
          {err && <div style={{ fontSize:13, color:"#ef4444", background:"#fef2f2", padding:"10px 14px", borderRadius:8, border:"1px solid #fecaca" }}>⚠️ {err}</div>}
          <button onClick={attempt} disabled={!user.trim()||!pass}
            style={{ background:user.trim()&&pass?"linear-gradient(135deg,#2d3c20,#72816A)":"#EDE4D8", color:user.trim()&&pass?"#fff":"#8a9a7a", border:"none", borderRadius:12, padding:"14px", fontSize:15, fontWeight:700, cursor:user.trim()&&pass?"pointer":"default", marginTop:4, transition:"all .2s" }}>
            Entrar
          </button>
        </div>
        <div style={{ marginTop:24, fontSize:12, color:"#b0a898", textAlign:"center" }}>GereSala CRM · Acesso restrito</div>
      </div>
    </div>
  );
}

// ─── App shell ────────────────────────────────────────────────────────────────
export default function App() {
  const [loggedIn, setLoggedIn] = useState(() => sessionStorage.getItem("gs_session") === "1");
  if (!loggedIn) return <LoginScreen onLogin={() => { sessionStorage.setItem("gs_session","1"); setLoggedIn(true); }} />;
  return <AppInner onLogout={() => { sessionStorage.removeItem("gs_session"); setLoggedIn(false); }} />;
}

function AppInner({ onLogout }) {
  const [rooms, setRooms] = useState(() => load(STORAGE_KEYS.rooms, DEFAULT_ROOMS));
  const [bookings, setBookings] = useState(() => load(STORAGE_KEYS.bookings, {}));
  const [professionals, setProfessionals] = useState(() => load(STORAGE_KEYS.professionals, []));
  const [prices, setPrices] = useState(() => load(STORAGE_KEYS.prices, { 1:80, 2:80 }));
  const [financeiro, setFinanceiro] = useState(() => load(STORAGE_KEYS.financeiro, []));
  const [config, setConfig] = useState(() => load(STORAGE_KEYS.config, { pixKey:"", pixName:"", pixCity:"", pixTipo:"Chave aleatória" }));
  const [tab, setTab] = useState("dashboard");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(toKey(new Date()));
  const [viewMode, setViewMode] = useState("day");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [toast, setToast] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [reportMonth, setReportMonth] = useState(new Date().getMonth());
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [profSearch, setProfSearch] = useState("");
  const [reportProfFilter, setReportProfFilter] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const weekDays = getWeekDays(currentDate);
  useEffect(() => { save(STORAGE_KEYS.bookings, bookings); }, [bookings]);
  useEffect(() => { save(STORAGE_KEYS.financeiro, financeiro); }, [financeiro]);
  useEffect(() => { save(STORAGE_KEYS.professionals, professionals); }, [professionals]);
  useEffect(() => { save(STORAGE_KEYS.rooms, rooms); }, [rooms]);
  useEffect(() => { save(STORAGE_KEYS.prices, prices); }, [prices]);
  useEffect(() => { save(STORAGE_KEYS.config, config); }, [config]);

  const showToast = useCallback((msg, type="ok") => { setToast({msg,type}); setTimeout(()=>setToast(null),3000); }, []);

  function hourlyRateFor(roomId, profId, profName) {
    let prof = profId ? professionals.find(p=>p.id===profId) : null;
    if (!prof && profName) prof = professionals.find(p=>p.name.trim().toLowerCase()===profName.trim().toLowerCase());
    if (prof && prof.hourlyRate!=null && prof.hourlyRate!=="") return prof.hourlyRate;
    return prices[roomId]||0;
  }
  function bookingKey(day, roomId, hour) { return `${day}_${roomId}_${hour}`; }
  function getBooking(day, roomId, hour) { return bookings[bookingKey(day, roomId, hour)]||null; }
  function getOccupyingBooking(day, roomId, hour) {
    const direct = getBooking(day, roomId, hour);
    if (direct) return { booking:direct, isStart:true };
    const idx = hourToIndex(hour);
    for (let i=idx-1;i>=0;i--) {
      const b = getBooking(day, roomId, HOURS[i]);
      if (b) { const dur=b.duration??1; if (i+dur>idx) return { booking:b, isStart:false, startHour:HOURS[i] }; break; }
    }
    return null;
  }

  function saveBooking() {
    if (!form.name?.trim()) return;
    // Multi-slot mode: form.selectedHours is set when user picks individual slots
    if (form.selectedHours && form.selectedHours.length > 0) {
      let conflicts = [];
      form.selectedHours.forEach(h => {
        const occ = getOccupyingBooking(form.day, form.roomId, h);
        if (occ && !occ.isStart) conflicts.push(h);
      });
      if (conflicts.length) { showToast(`Conflito em: ${conflicts.join(", ")}!`,"err"); return; }
      const entry = { name:form.name.trim(), type:form.type||SPECIALTIES[0], phone:form.phone||"", profId:form.profId||null, notes:form.notes||"", duration:1, status:form.status||"confirmed" };
      setBookings(b => {
        const n = {...b};
        form.selectedHours.forEach(h => { n[bookingKey(form.day,form.roomId,h)] = {...entry}; });
        return n;
      });
      setModal(null); showToast(`${form.selectedHours.length} horário${form.selectedHours.length>1?"s":""} reservado${form.selectedHours.length>1?"s":""}!`);
      return;
    }
    // Single-slot / consecutive mode
    const dur = form.duration??1;
    const startIdx = hourToIndex(form.hour);
    for (let i=startIdx;i<startIdx+dur;i++) {
      const h=HOURS[i]; if (!h) { showToast("Duração ultrapassa o horário disponível.","err"); return; }
      const occ=getOccupyingBooking(form.day, form.roomId, h);
      if (occ&&!(occ.isStart&&form.hour===h)) { showToast(`Conflito no horário ${h}!`,"err"); return; }
    }
    if (modal?.existing) {
      const oldB=bookings[bookingKey(form.day,form.roomId,form.hour)];
      const oldDur=oldB?.duration??1;
      if (oldDur!==dur) {
        setBookings(b=>{ const n={...b}; for(let i=startIdx+1;i<startIdx+oldDur;i++) delete n[bookingKey(form.day,form.roomId,HOURS[i])]; return n; });
      }
    }
    setBookings(b=>({ ...b, [bookingKey(form.day,form.roomId,form.hour)]: { name:form.name.trim(), type:form.type||SPECIALTIES[0], phone:form.phone||"", profId:form.profId||null, notes:form.notes||"", duration:dur, status:form.status||"confirmed" } }));
    setModal(null); showToast("Reserva salva!");
  }

  function deleteBooking(day, roomId, hour) {
    const b=getBooking(day,roomId,hour); const dur=b?.duration??1; const startIdx=hourToIndex(hour);
    setBookings(prev=>{ const n={...prev}; for(let i=startIdx;i<startIdx+dur;i++) delete n[bookingKey(day,roomId,HOURS[i])]; return n; });
    setConfirmDel(null); setModal(null); showToast("Reserva cancelada.","err");
  }

  function repeatProfessionalMonth(profName, fromMonth, fromYear, toMonth, toYear) {
    const targetMonth = toMonth; const targetYear = toYear;
    const sourceRows = Object.entries(bookings).filter(([key, b]) => {
      const [day, roomId, hour] = key.split("_");
      const dt = new Date(day+"T12:00:00");
      if (dt.getMonth()!==fromMonth||dt.getFullYear()!==fromYear) return false;
      if (b.name!==profName) return false;
      const startIdx=hourToIndex(hour);
      for (let i=startIdx-1;i>=0;i--) { if (getBooking(day,parseInt(roomId),HOURS[i])) return false; }
      return true;
    });
    let added=0, skipped=0;
    setBookings(prev => {
      const n={...prev};
      sourceRows.forEach(([key,b]) => {
        const [day,roomIdStr,hour]=key.split("_"); const roomId=parseInt(roomIdStr);
        const dt=new Date(day+"T12:00:00");
        const targetDate=new Date(targetYear,targetMonth,dt.getDate());
        if (targetDate.getMonth()!==targetMonth) { skipped++; return; }
        const targetDay=toKey(targetDate); const dur=b.duration??1; const startIdx=hourToIndex(hour);
        for (let i=startIdx;i<startIdx+dur;i++) { const h=HOURS[i]; if (!h||n[bookingKey(targetDay,roomId,h)]) { skipped++; return; } }
        n[bookingKey(targetDay,roomId,hour)]={...b};
        added++;
      });
      return n;
    });
    showToast(`${added} reserva${added!==1?"s":""} copiada${added!==1?"s":""} para ${MONTH_NAMES[targetMonth]}${skipped?` · ${skipped} ignorada${skipped!==1?"s":""}`:""}.`, added?"ok":"err");
    return added;
  }

  function saveProfessional() {
    if (!form.name?.trim()) return;
    if (form.id) { setProfessionals(p=>p.map(x=>x.id===form.id?{...form}:x)); }
    else { setProfessionals(p=>[...p,{...form,id:Date.now(),createdAt:new Date().toISOString()}]); }
    setModal(null); showToast("Profissional salvo!");
  }
  function deleteProfessional(id) { setProfessionals(p=>p.filter(x=>x.id!==id)); setConfirmDel(null); setModal(null); showToast("Profissional removido.","err"); }
  function saveRoom() {
    if (!form.name?.trim()) return;
    if (form.id) { setRooms(r=>r.map(x=>x.id===form.id?{...form}:x)); }
    else { const newId=Date.now(); setRooms(r=>[...r,{...form,id:newId}]); setPrices(p=>({...p,[newId]:80})); }
    setModal(null); showToast("Sala salva!");
  }

  const reportData = (() => {
    const rows=[];
    Object.entries(bookings).forEach(([key,b]) => {
      const [day,roomId,hour]=key.split("_");
      const dt=new Date(day+"T12:00:00");
      if (dt.getMonth()!==reportMonth||dt.getFullYear()!==reportYear) return;
      const room=rooms.find(r=>r.id===parseInt(roomId));
      const dur=b.duration??1;
      const price=hourlyRateFor(parseInt(roomId),b.profId,b.name)*dur;
      const statusObj=STATUSES.find(s=>s.value===(b.status||"confirmed"));
      rows.push({day,roomId:parseInt(roomId),hour,name:b.name,type:b.type,phone:b.phone,room:room?.name||"?",price,color:room?.color||"#888",duration:dur,status:b.status||"confirmed",statusLabel:statusObj?.label||"Confirmado"});
    });
    rows.sort((a,b)=>(a.day+a.hour)<(b.day+b.hour)?-1:1);
    const filteredRows=reportProfFilter?rows.filter(r=>r.name.toLowerCase().includes(reportProfFilter.toLowerCase())):rows;
    const filteredTotal=filteredRows.reduce((sum,r)=>sum+r.price,0);
    const byRoom={};
    rooms.forEach(r=>{byRoom[r.id]={name:r.name,color:r.color,count:0,revenue:0};});
    filteredRows.forEach(r=>{if(byRoom[r.roomId]){byRoom[r.roomId].count++;byRoom[r.roomId].revenue+=r.price;}});
    return {rows:filteredRows,total:filteredTotal,byRoom};
  })();

  const reportProfNames=[...new Set(Object.values(bookings).map(b=>b.name))].sort();
  const todayKey=toKey(new Date());
  const todayBookings=Object.entries(bookings).filter(([k])=>k.startsWith(todayKey));
  const totalSlots=rooms.length*HOURS.length;
  const todayReserved=todayBookings.length;

  function openBookingModal(day, roomId, hour, existing) {
    if (!existing) { const occ=getOccupyingBooking(day,roomId,hour); if (occ&&!occ.isStart) { openBookingModal(day,roomId,occ.startHour,bookings[bookingKey(day,roomId,occ.startHour)]); return; } }
    setForm(existing?{...existing,day,roomId,hour,selectedHours:null}:{day,roomId,hour,name:"",type:SPECIALTIES[0],phone:"",profId:null,notes:"",duration:1,status:"confirmed",selectedHours:[hour]});
    setModal({type:"booking",existing:!!existing});
  }

  const displayDays = viewMode==="week" ? weekDays : [weekDays.find(d=>toKey(d)===selectedDay)||new Date(selectedDay+"T12:00:00")];
  const filteredProfessionals = professionals.filter(p=>p.name.toLowerCase().includes(profSearch.toLowerCase())||(p.specialty||"").toLowerCase().includes(profSearch.toLowerCase()));

  // Current month revenue + bookings count
  const now = new Date();
  const { thisMonthRevenue, thisMonthBookings } = Object.entries(bookings).reduce((acc,[key,b]) => {
    const [day,roomId]=key.split("_"); const dt=new Date(day+"T12:00:00");
    if (dt.getMonth()!==now.getMonth()||dt.getFullYear()!==now.getFullYear()) return acc;
    return { thisMonthRevenue: acc.thisMonthRevenue+hourlyRateFor(parseInt(roomId),b.profId,b.name)*(b.duration??1), thisMonthBookings: acc.thisMonthBookings+1 };
  },{ thisMonthRevenue:0, thisMonthBookings:0 });

  // Current month expenses (financeiro "pagar" entries)
  const thisMonthExpenses = financeiro.filter(f => {
    if (f.tipo!=="pagar") return false;
    const d=new Date(f.vencimento+"T12:00:00");
    return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
  }).reduce((s,f)=>s+(parseFloat(f.valor)||0),0);

  // New professionals registered this month
  const newProfsThisMonth = professionals.filter(p => {
    if (!p.createdAt) return false;
    const d=new Date(p.createdAt);
    return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
  }).length;

  const NAV = [
    ["dashboard","📊","Dashboard"],["agenda","📅","Agenda"],["profissionais","👤","Profissionais"],
    ["relatorio","📋","Relatório"],["cobranca","💳","Cobrança"],["financeiro","💰","Financeiro"],["configuracoes","⚙️","Configurações"],
  ];

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:"#F5EFE5", fontFamily:"'Outfit',sans-serif", color:"#1a2010" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:5px;height:5px;}
        ::-webkit-scrollbar-track{background:#EDE4D8;}
        ::-webkit-scrollbar-thumb{background:#8a9a7a;border-radius:3px;}
        .btn{cursor:pointer;border:none;transition:all .15s;font-family:'Outfit',sans-serif;}
        .btn:hover{filter:brightness(.93);}
        .btn:active{transform:scale(.97);}
        .slot{cursor:pointer;transition:all .15s;}
        .slot:hover{background:#e8f0fe !important;}
        .slot-cont{cursor:pointer;transition:background .15s;}
        input,select,textarea{font-family:'Outfit',sans-serif;outline:none;}
        input:focus,select:focus,textarea:focus{border-color:#72816A !important;box-shadow:0 0 0 3px rgba(114,129,106,.15);}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes toastIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .fade-up{animation:fadeUp .2s ease}
        .toast-anim{animation:toastIn .2s ease}
        tr:hover td{background:#FBF7F2 !important;}
        .nav-item{display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:10px;cursor:pointer;transition:all .15s;color:#8a9a7a;font-size:14px;font-weight:500;border:none;background:transparent;width:100%;text-align:left;font-family:'Outfit',sans-serif;}
        .nav-item:hover{background:rgba(255,255,255,.08);color:#C8B8A0;}
        .nav-item.active{background:rgba(255,255,255,.12);color:#fff;font-weight:600;}
        .kpi-card{background:#fff;border-radius:16px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,.06);border:1px solid #C8B8A0;}
        .day-pill:hover{background:#C8B8A0 !important;}
      `}</style>

      {/* ── SIDEBAR ── */}
      <div style={{ width:sidebarOpen?240:64, background:"linear-gradient(180deg,#1a2010 0%,#2d3c20 100%)", display:"flex", flexDirection:"column", flexShrink:0, transition:"width .2s", overflow:"hidden" }}>
        {/* Logo */}
        <div style={{ padding:"24px 16px 20px", borderBottom:"1px solid rgba(255,255,255,.08)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ width:36, height:36, background:"rgba(255,255,255,.12)", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:17, flexShrink:0 }}>🏢</div>
            {sidebarOpen && <div>
              <div style={{ fontSize:16, fontWeight:800, color:"#fff", letterSpacing:"-.3px", whiteSpace:"nowrap" }}>GereSala</div>
              <div style={{ fontSize:10, color:"#596850", fontFamily:"'JetBrains Mono',monospace", whiteSpace:"nowrap" }}>CRM Profissional</div>
            </div>}
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex:1, padding:"16px 8px", display:"flex", flexDirection:"column", gap:2 }}>
          {NAV.map(([id,icon,label]) => (
            <button key={id} className={`nav-item${tab===id?" active":""}`} onClick={()=>setTab(id)}>
              <span style={{ fontSize:16, flexShrink:0 }}>{icon}</span>
              {sidebarOpen && <span>{label}</span>}
            </button>
          ))}
        </nav>

        {/* Bottom */}
        <div style={{ padding:"16px 8px", borderTop:"1px solid rgba(255,255,255,.08)" }}>
          <button className="nav-item" onClick={()=>setSidebarOpen(o=>!o)}>
            <span style={{ fontSize:14, flexShrink:0 }}>{sidebarOpen?"◀":"▶"}</span>
            {sidebarOpen && <span style={{ fontSize:13 }}>Recolher</span>}
          </button>
          <button className="nav-item" onClick={onLogout}>
            <span style={{ fontSize:16, flexShrink:0 }}>🔒</span>
            {sidebarOpen && <span>Sair</span>}
          </button>
        </div>
      </div>

      {/* ── MAIN ── */}
      <div style={{ flex:1, overflowY:"auto", overflowX:"hidden" }}>

        {/* ══ DASHBOARD ══ */}
        {tab==="dashboard" && (
          <div style={{ padding:"32px 32px", maxWidth:1200 }} className="fade-up">
            <div style={{ marginBottom:28 }}>
              <h1 style={{ fontSize:26, fontWeight:800, color:"#1a2010", letterSpacing:"-.5px" }}>Painel de Controle</h1>
              <div style={{ fontSize:14, color:"#596850", marginTop:4 }}>
                {new Date().toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
              </div>
            </div>

            {/* KPI row — grupos de cards empilhados por tema */}
            <div style={{ display:"flex", gap:14, marginBottom:28, flexWrap:"wrap" }}>

              {/* Grupo: Reservas */}
              <div style={{ display:"flex", flexDirection:"column", gap:10, flex:"1 1 160px", minWidth:150 }}>
                <div className="kpi-card" style={{ background:"#EDF0EB", border:"1.5px solid #72816A30" }}>
                  <div style={{ fontSize:10, fontWeight:700, color:"#72816A", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Reservas hoje</div>
                  <div style={{ fontSize:30, fontWeight:800, color:"#1a2010", lineHeight:1 }}>{todayReserved}</div>
                  <div style={{ marginTop:8, background:"#C8B8A0", borderRadius:4, height:4 }}>
                    <div style={{ width:totalSlots>0?`${Math.round((todayReserved/totalSlots)*100)}%`:"0%", height:"100%", background:"#72816A", borderRadius:4 }} />
                  </div>
                  <div style={{ fontSize:11, color:"#596850", marginTop:5 }}>{totalSlots} slots disponíveis</div>
                </div>
                <div className="kpi-card" style={{ background:"#EDF0EB", border:"1.5px solid #72816A30" }}>
                  <div style={{ fontSize:10, fontWeight:700, color:"#72816A", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Reservas no mês</div>
                  <div style={{ fontSize:30, fontWeight:800, color:"#535E43", lineHeight:1 }}>{thisMonthBookings}</div>
                  <div style={{ fontSize:11, color:"#596850", marginTop:8 }}>{MONTH_NAMES[now.getMonth()]} {now.getFullYear()}</div>
                </div>
              </div>

              {/* Grupo: Financeiro */}
              <div style={{ display:"flex", flexDirection:"column", gap:10, flex:"1 1 160px", minWidth:150 }}>
                <div className="kpi-card" style={{ background:"#f0f7f2", border:"1.5px solid #4a7c5930" }}>
                  <div style={{ fontSize:10, fontWeight:700, color:"#4a7c59", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Receita do mês</div>
                  <div style={{ fontSize:22, fontWeight:800, color:"#4a7c59", lineHeight:1 }}>R$ {thisMonthRevenue.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
                  <div style={{ fontSize:11, color:"#596850", marginTop:8 }}>{MONTH_NAMES[now.getMonth()]} {now.getFullYear()}</div>
                </div>
                <div className="kpi-card" style={{ background:"#fdf3f1", border:"1.5px solid #b85c5030" }}>
                  <div style={{ fontSize:10, fontWeight:700, color:"#b85c50", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Despesas do mês</div>
                  <div style={{ fontSize:22, fontWeight:800, color:"#b85c50", lineHeight:1 }}>R$ {thisMonthExpenses.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
                  <div style={{ fontSize:11, color:"#8a6a66", marginTop:8 }}>{MONTH_NAMES[now.getMonth()]} {now.getFullYear()}</div>
                </div>
              </div>

              {/* Grupo: Profissionais */}
              <div style={{ display:"flex", flexDirection:"column", gap:10, flex:"1 1 160px", minWidth:150 }}>
                <div className="kpi-card" style={{ background:"#EEF5F7", border:"1.5px solid #5a9baa30" }}>
                  <div style={{ fontSize:10, fontWeight:700, color:"#5a9baa", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Profissionais</div>
                  <div style={{ fontSize:30, fontWeight:800, color:"#1a2010", lineHeight:1 }}>{professionals.length}</div>
                  <div style={{ fontSize:11, color:"#596850", marginTop:8 }}>cadastrados no sistema</div>
                </div>
                <div className="kpi-card" style={{ background:"#EEF5F7", border:"1.5px solid #5a9baa30" }}>
                  <div style={{ fontSize:10, fontWeight:700, color:"#5a9baa", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Novos no mês</div>
                  <div style={{ fontSize:30, fontWeight:800, color:"#5a9baa", lineHeight:1 }}>{newProfsThisMonth}</div>
                  <div style={{ fontSize:11, color:"#596850", marginTop:8 }}>{MONTH_NAMES[now.getMonth()]} {now.getFullYear()}</div>
                </div>
              </div>

              {/* Grupo: Salas */}
              <div style={{ display:"flex", flexDirection:"column", gap:10, flex:"1 1 160px", minWidth:150 }}>
                <div className="kpi-card" style={{ background:"#FBF7F2", border:"1.5px solid #C8B8A030" }}>
                  <div style={{ fontSize:10, fontWeight:700, color:"#8a6a40", textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Salas ativas</div>
                  <div style={{ fontSize:30, fontWeight:800, color:"#1a2010", lineHeight:1 }}>{rooms.length}</div>
                  <div style={{ fontSize:11, color:"#596850", marginTop:8 }}>disponíveis para locação</div>
                </div>
              </div>
            </div>

            {/* Two-column: today schedule + rooms status */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:24 }}>
              {/* Today schedule */}
              <div className="kpi-card">
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                  <div style={{ fontSize:15, fontWeight:700, color:"#1a2010" }}>Agenda de Hoje</div>
                  <button className="btn" onClick={()=>setTab("agenda")} style={{ fontSize:12, color:"#72816A", background:"#F0EAE0", padding:"5px 12px", borderRadius:7, fontWeight:600 }}>Ver agenda →</button>
                </div>
                {todayBookings.length===0
                  ? <div style={{ textAlign:"center", padding:"32px 0", color:"#8a9a7a" }}><div style={{ fontSize:32 }}>📅</div><div style={{ fontSize:13, marginTop:8 }}>Nenhuma reserva hoje</div></div>
                  : <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {todayBookings.sort((a,b)=>a[0]<b[0]?-1:1).slice(0,6).map(([key,b])=>{
                      const [,roomId,hour]=key.split("_"); const room=rooms.find(r=>r.id===parseInt(roomId));
                      const st=STATUSES.find(s=>s.value===(b.status||"confirmed"));
                      return (
                        <div key={key} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", background:"#FBF7F2", borderRadius:10, cursor:"pointer", border:"1px solid #C8B8A0" }}
                          onClick={()=>{setTab("agenda");openBookingModal(todayKey,parseInt(roomId),hour,b);}}>
                          <div style={{ width:4, height:40, background:room?.color||"#888", borderRadius:2, flexShrink:0 }} />
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:13, fontWeight:600, color:"#1a2010" }}>{b.name}</div>
                            <div style={{ fontSize:11, color:"#596850", fontFamily:"'JetBrains Mono',monospace" }}>{hour} · {room?.name} {b.duration>1?`· ${b.duration}h`:""}</div>
                          </div>
                          <span style={{ fontSize:10, padding:"3px 8px", borderRadius:5, background:st?.bg, color:st?.color, fontWeight:600 }}>{st?.label}</span>
                        </div>
                      );
                    })}
                    {todayBookings.length>6 && <div style={{ fontSize:12, color:"#8a9a7a", textAlign:"center" }}>+{todayBookings.length-6} mais reservas hoje</div>}
                  </div>
                }
              </div>

              {/* Rooms + quick actions */}
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                <div className="kpi-card">
                  <div style={{ fontSize:15, fontWeight:700, color:"#1a2010", marginBottom:14 }}>Status das Salas</div>
                  {rooms.map(r=>{
                    const roomToday=todayBookings.filter(([k])=>k.includes(`_${r.id}_`)).length;
                    const pct=Math.round((roomToday/HOURS.length)*100);
                    return (
                      <div key={r.id} style={{ marginBottom:14 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                            <div style={{ width:10, height:10, borderRadius:3, background:r.color }} />
                            <span style={{ fontSize:13, fontWeight:600 }}>{r.name}</span>
                          </div>
                          <span style={{ fontSize:12, color:"#596850" }}>{roomToday}/{HOURS.length} slots · R${prices[r.id]||0}/h</span>
                        </div>
                        <div style={{ background:"#C8B8A0", borderRadius:4, height:8 }}>
                          <div style={{ width:`${pct}%`, height:"100%", background:r.color, borderRadius:4, transition:"width .4s" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="kpi-card">
                  <div style={{ fontSize:15, fontWeight:700, color:"#1a2010", marginBottom:14 }}>Ações Rápidas</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    {[
                      { icon:"📅", label:"Nova Reserva", fn:()=>{ setTab("agenda"); openBookingModal(todayKey,rooms[0]?.id,HOURS[0],null); }},
                      { icon:"👤", label:"Novo Profissional", fn:()=>{ setTab("profissionais"); setForm({name:"",specialty:SPECIALTIES[0],phone:"",email:"",notes:"",registroTipo:"CRP",registroCodigo:""}); setModal({type:"prof"}); }},
                      { icon:"📋", label:"Ver Relatório", fn:()=>setTab("relatorio") },
                      { icon:"💰", label:"Financeiro", fn:()=>setTab("financeiro") },
                    ].map(a=>(
                      <button key={a.label} className="btn" onClick={a.fn}
                        style={{ background:"#FBF7F2", border:"1.5px solid #C8B8A0", borderRadius:12, padding:"14px 10px", fontSize:12, fontWeight:600, color:"#2a3820", textAlign:"center", display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
                        <span style={{ fontSize:22 }}>{a.icon}</span>{a.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ AGENDA ══ */}
        {tab==="agenda" && (
          <div style={{ display:"flex", height:"100vh" }}>
            {/* Mini sidebar */}
            <div style={{ width:200, background:"#fff", borderRight:"1px solid #C8B8A0", padding:16, display:"flex", flexDirection:"column", gap:16, overflowY:"auto", flexShrink:0 }}>
              <div>
                <div style={sectionLabel}>Hoje</div>
                <div style={{ fontSize:30, fontWeight:800, color:"#1a2010", lineHeight:1 }}>{todayReserved}</div>
                <div style={{ fontSize:12, color:"#8a9a7a", marginTop:2 }}>de {totalSlots} horários</div>
                <div style={{ marginTop:8, background:"#C8B8A0", borderRadius:4, height:6 }}>
                  <div style={{ width:`${Math.round((todayReserved/totalSlots)*100)}%`, height:"100%", background:"#72816A", borderRadius:4 }} />
                </div>
              </div>
              <div>
                <div style={sectionLabel}>Salas</div>
                {rooms.map(r=>(
                  <div key={r.id} style={{ display:"flex", alignItems:"center", gap:7, padding:"4px 0" }}>
                    <div style={{ width:10, height:10, borderRadius:3, background:r.color, flexShrink:0 }} />
                    <span style={{ fontSize:12, color:"#3a4a2c" }}>{r.name}</span>
                    <span style={{ marginLeft:"auto", fontSize:11, fontFamily:"'JetBrains Mono',monospace", color:"#8a9a7a" }}>R${prices[r.id]||0}</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={sectionLabel}>Próximas hoje</div>
                {todayBookings.length===0&&<div style={{ fontSize:12, color:"#b0a898" }}>Nenhuma</div>}
                {todayBookings.sort((a,b)=>a[0]<b[0]?-1:1).slice(0,6).map(([key,b])=>{
                  const [,roomId,hour]=key.split("_"); const room=rooms.find(r=>r.id===parseInt(roomId));
                  const st=STATUSES.find(s=>s.value===(b.status||"confirmed"));
                  return (
                    <div key={key} style={{ marginBottom:9, cursor:"pointer", padding:"8px 10px", background:"#FBF7F2", borderRadius:8, border:"1px solid #EDE4D8" }}
                      onClick={()=>{setTab("agenda");openBookingModal(todayKey,parseInt(roomId),hour,b);}}>
                      <div style={{ fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:room?.color||"#888" }}>{hour} · {room?.name}</div>
                      <div style={{ fontSize:12, fontWeight:600, color:"#1e2816" }}>{b.name}</div>
                      <div style={{ fontSize:10, color:"#8a9a7a" }}>{b.type}{b.duration>1?` · ${b.duration}h`:""}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Grid area */}
            <div style={{ flex:1, overflowX:"auto", overflowY:"auto", display:"flex", flexDirection:"column" }}>
              {/* Toolbar */}
              <div style={{ background:"#fff", borderBottom:"1px solid #C8B8A0", padding:"10px 20px", display:"flex", gap:8, alignItems:"center", flexShrink:0, flexWrap:"wrap" }}>
                <button className="btn" onClick={()=>{ setCurrentDate(new Date()); setSelectedDay(toKey(new Date())); }}
                  style={{ background:"#EDE4D8", padding:"7px 14px", borderRadius:8, fontSize:12, fontWeight:600, color:"#2a3820" }}>Hoje</button>
                <button className="btn" onClick={()=>setCurrentDate(viewMode==="month"?addMonths(currentDate,-1):addDays(currentDate,-7))}
                  style={{ background:"#EDE4D8", padding:"7px 11px", borderRadius:8, fontSize:14 }}>‹</button>
                <button className="btn" onClick={()=>setCurrentDate(viewMode==="month"?addMonths(currentDate,1):addDays(currentDate,7))}
                  style={{ background:"#EDE4D8", padding:"7px 11px", borderRadius:8, fontSize:14 }}>›</button>
                <span style={{ fontSize:14, fontWeight:600, color:"#2a3820", marginLeft:4 }}>{viewMode==="month"?`${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`:monthLabel(weekDays[0])}</span>
                <div style={{ marginLeft:"auto", display:"flex", gap:4 }}>
                  {[["day","Dia"],["week","Semana"],["month","Mês"]].map(([v,l])=>(
                    <button key={v} className="btn" onClick={()=>setViewMode(v)}
                      style={{ background:viewMode===v?"#72816A":"#EDE4D8", color:viewMode===v?"#fff":"#596850", padding:"7px 14px", borderRadius:8, fontSize:12, fontWeight:600 }}>{l}</button>
                  ))}
                </div>
              </div>

              {/* Month view */}
              {viewMode==="month" && (()=>{
                const grid=getMonthGrid(currentDate); const todayK=toKey(new Date());
                return (
                  <div style={{ flex:1, overflowY:"auto", padding:16 }}>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, marginBottom:4 }}>
                      {["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"].map(d=>(
                        <div key={d} style={{ textAlign:"center", fontSize:11, fontWeight:700, color:"#8a9a7a", padding:"4px 0", textTransform:"uppercase", letterSpacing:.8 }}>{d}</div>
                      ))}
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4 }}>
                      {grid.map(({date,curr},i)=>{
                        const dk=toKey(date); const isToday=dk===todayK; const isSel=dk===selectedDay;
                        const dayBk=Object.entries(bookings).filter(([k])=>k.startsWith(dk+"_"));
                        return (
                          <div key={i} onClick={()=>{setSelectedDay(dk);setCurrentDate(date);setViewMode("day");}}
                            style={{ minHeight:80, borderRadius:12, border:isSel?"2px solid #72816A":isToday?"2px solid #16a34a":"1px solid #C8B8A0", background:curr?"#fff":"#FBF7F2", cursor:"pointer", padding:"8px 10px", opacity:curr?1:.4, transition:"all .15s" }}>
                            <div style={{ fontSize:13, fontWeight:isToday?800:500, color:isToday?"#72816A":isSel?"#72816A":"#596850", marginBottom:6 }}>{date.getDate()}</div>
                            {dayBk.length>0 && (
                              <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
                                {rooms.map(r=>{ const c=dayBk.filter(([k])=>k.includes(`_${r.id}_`)).length; return c>0?(
                                  <div key={r.id} style={{ display:"flex", alignItems:"center", gap:4 }}>
                                    <div style={{ width:8, height:8, borderRadius:2, background:r.color }} />
                                    <span style={{ fontSize:10, color:"#596850" }}>{c}</span>
                                  </div>):null;})}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Day tabs */}
              {viewMode!=="month" && <div style={{ display:"flex", background:"#F8F4EF", borderBottom:"1px solid #C8B8A0", flexShrink:0 }}>
                <div style={{ width:52, flexShrink:0, borderRight:"1px solid #C8B8A0" }} />
                {weekDays.map(d=>{
                  const ds=toKey(d); const isSel=ds===selectedDay; const isToday=ds===todayKey;
                  const cnt=Object.keys(bookings).filter(k=>k.startsWith(ds)).length;
                  return (
                    <div key={ds} className="day-pill" onClick={()=>{setSelectedDay(ds);setViewMode("day");}}
                      style={{ flex:1, padding:"8px 4px", textAlign:"center", borderRight:"1px solid #C8B8A0", cursor:"pointer", background:isSel?"#72816A":"transparent", minWidth:66, transition:"all .15s" }}>
                      <div style={{ fontSize:10, color:isSel?"#93b4ff":"#8a9a7a", textTransform:"capitalize" }}>{WEEKDAY_NAMES[d.getDay()]}</div>
                      <div style={{ fontSize:15, fontWeight:isToday?800:500, color:isSel?"#fff":isToday?"#72816A":"#3a4a2c", marginTop:1 }}>{formatBR(ds)}</div>
                      {cnt>0 && <div style={{ fontSize:10, color:isSel?"#93b4ff":"#72816A", fontWeight:600 }}>{cnt}</div>}
                    </div>
                  );
                })}
              </div>}

              {/* Room headers */}
              {viewMode!=="month" && <div style={{ display:"flex", background:"#F8F4EF", borderBottom:"1px solid #C8B8A0", flexShrink:0, position:"sticky", top:0, zIndex:5 }}>
                <div style={{ width:52, flexShrink:0, borderRight:"1px solid #C8B8A0" }} />
                {rooms.map(r=>(
                  <div key={r.id} style={{ flex:1, padding:"8px 12px", borderRight:"1px solid #C8B8A0", display:"flex", alignItems:"center", gap:7, minWidth:viewMode==="week"?80:140 }}>
                    <div style={{ width:10, height:10, borderRadius:3, background:r.color, flexShrink:0 }} />
                    <span style={{ fontSize:13, fontWeight:700, color:"#2a3820" }}>{r.name}</span>
                  </div>
                ))}
              </div>}

              {/* Slots */}
              {viewMode!=="month" && <div style={{ overflowY:"auto" }}>
                {displayDays.map(day=>{
                  const ds=toKey(day);
                  return (
                    <div key={ds}>
                      {viewMode==="week" && (
                        <div style={{ padding:"5px 14px", fontSize:11, color:"#8a9a7a", background:"#FBF7F2", borderBottom:"1px solid #C8B8A0", fontFamily:"'JetBrains Mono',monospace", fontWeight:500 }}>
                          {WEEKDAY_NAMES[day.getDay()]} {formatBR(ds)}
                        </div>
                      )}
                      {HOURS.map(hour=>(
                        <div key={hour} style={{ display:"flex", borderBottom:"1px solid #EDE4D8" }}>
                          <div style={{ width:52, flexShrink:0, padding:"10px 4px", borderRight:"1px solid #EDE4D8", fontSize:11, color:"#b0a898", fontFamily:"'JetBrains Mono',monospace", textAlign:"center", background:"#F8F4EF" }}>{hour}</div>
                          {rooms.map(room=>{
                            const b=getBooking(ds,room.id,hour);
                            const occ=!b?getOccupyingBooking(ds,room.id,hour):null;
                            const isCont=occ&&!occ.isStart;
                            const statusObj=b?STATUSES.find(s=>s.value===(b.status||"confirmed")):null;
                            if (isCont) return (
                              <div key={room.id} className="slot-cont"
                                onClick={()=>openBookingModal(ds,room.id,occ.startHour,bookings[bookingKey(ds,room.id,occ.startHour)])}
                                style={{ flex:1, minWidth:viewMode==="week"?80:140, padding:"6px 10px", borderRight:"1px solid #EDE4D8", background:`${room.color}0d`, borderLeft:`3px solid ${room.color}33` }}>
                                <div style={{ width:"50%", height:2, background:`${room.color}44`, borderRadius:2, margin:"auto" }} />
                              </div>
                            );
                            return (
                              <div key={room.id} className="slot" onClick={()=>openBookingModal(ds,room.id,hour,b)}
                                style={{ flex:1, minWidth:viewMode==="week"?80:140, padding:"8px 10px", borderRight:"1px solid #EDE4D8", background:b?`${room.color}12`:"#fff", borderLeft:b?`3px solid ${room.color}`:"3px solid transparent" }}>
                                {b ? (
                                  <div>
                                    <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:4 }}>
                                      <div style={{ fontSize:12, fontWeight:700, color:"#1a2010", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{b.name}</div>
                                      {b.duration>1 && <span style={{ fontSize:10, background:room.color, color:"#fff", padding:"1px 5px", borderRadius:4, flexShrink:0 }}>{b.duration}h</span>}
                                    </div>
                                    <div style={{ fontSize:10, color:room.color, fontWeight:600 }}>{b.type}</div>
                                    {statusObj&&statusObj.value!=="confirmed" && <div style={{ fontSize:10, color:statusObj.color, background:statusObj.bg, display:"inline-block", padding:"1px 5px", borderRadius:3, marginTop:2 }}>{statusObj.label}</div>}
                                    {b.phone && <div style={{ fontSize:10, color:"#8a9a7a", fontFamily:"'JetBrains Mono',monospace" }}>{b.phone}</div>}
                                  </div>
                                ) : (
                                  <div style={{ fontSize:11, color:"#C8B8A0", textAlign:"center", lineHeight:"22px" }}>+</div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>}
            </div>
          </div>
        )}

        {/* ══ PROFISSIONAIS ══ */}
        {tab==="profissionais" && (
          <div style={{ padding:"32px 32px", maxWidth:1100 }} className="fade-up">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
              <div>
                <h2 style={{ fontSize:24, fontWeight:800, color:"#1a2010" }}>Profissionais</h2>
                <div style={{ fontSize:14, color:"#596850", marginTop:2 }}>{professionals.length} cadastrado{professionals.length!==1?"s":""}</div>
              </div>
              <button className="btn" onClick={()=>{ setForm({name:"",specialty:SPECIALTIES[0],phone:"",email:"",notes:"",registroTipo:"CRP",registroCodigo:""}); setModal({type:"prof"}); }}
                style={{ background:"linear-gradient(135deg,#2d3c20,#72816A)", color:"#fff", padding:"11px 22px", borderRadius:12, fontSize:13, fontWeight:700, boxShadow:"0 4px 12px rgba(83,94,67,.35)" }}>
                + Novo Profissional
              </button>
            </div>
            <div style={{ marginBottom:20 }}>
              <input value={profSearch} onChange={e=>setProfSearch(e.target.value)} placeholder="🔍  Buscar por nome ou especialidade..."
                style={{ width:"100%", border:"1.5px solid #C8B8A0", borderRadius:12, padding:"12px 16px", fontSize:14, background:"#fff", color:"#1a2010", boxShadow:"0 1px 3px rgba(0,0,0,.04)" }} />
            </div>
            {filteredProfessionals.length===0 && (
              <div style={{ textAlign:"center", padding:"60px 0", color:"#8a9a7a" }}>
                <div style={{ fontSize:40 }}>👤</div>
                <div style={{ fontSize:14, marginTop:8 }}>{profSearch?"Nenhum resultado":"Nenhum profissional cadastrado"}</div>
              </div>
            )}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:16 }}>
              {filteredProfessionals.map(p=>(
                <ProfCard key={p.id} p={p} bookings={bookings} rooms={rooms} prices={prices} professionals={professionals}
                  onEdit={()=>{ setForm({...p}); setModal({type:"prof",existing:true}); }}
                  onRepeat={(fromM,fromY,toM,toY)=>repeatProfessionalMonth(p.name,fromM,fromY,toM,toY)}
                />
              ))}
            </div>
          </div>
        )}

        {/* ══ RELATÓRIO ══ */}
        {tab==="relatorio" && (
          <div style={{ padding:"32px 32px", maxWidth:1100 }} className="fade-up">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24, flexWrap:"wrap", gap:12 }}>
              <div>
                <h2 style={{ fontSize:24, fontWeight:800, color:"#1a2010" }}>Relatório de Faturamento</h2>
                <div style={{ fontSize:14, color:"#596850" }}>{MONTH_NAMES[reportMonth]} {reportYear}</div>
              </div>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <select value={reportMonth} onChange={e=>setReportMonth(+e.target.value)}
                  style={{ background:"#fff", border:"1.5px solid #C8B8A0", borderRadius:10, padding:"9px 14px", fontSize:13, color:"#2a3820", fontFamily:"'Outfit',sans-serif" }}>
                  {MONTH_NAMES.map((m,i)=><option key={i} value={i}>{m}</option>)}
                </select>
                <select value={reportYear} onChange={e=>setReportYear(+e.target.value)}
                  style={{ background:"#fff", border:"1.5px solid #C8B8A0", borderRadius:10, padding:"9px 14px", fontSize:13, color:"#2a3820", fontFamily:"'Outfit',sans-serif" }}>
                  {[2024,2025,2026,2027].map(y=><option key={y}>{y}</option>)}
                </select>
                {reportData.rows.length>0 && (
                  <button className="btn" onClick={()=>exportCSV(reportData.rows,reportMonth,reportYear)}
                    style={{ background:"#EDE4D8", color:"#2a3820", padding:"9px 16px", borderRadius:10, fontSize:12, fontWeight:600 }}>⬇ CSV</button>
                )}
              </div>
            </div>

            <div style={{ marginBottom:20, maxWidth:400 }}>
              <input value={reportProfFilter} onChange={e=>setReportProfFilter(e.target.value)} list="report-prof-names"
                placeholder="🔍  Filtrar por profissional..."
                style={{ width:"100%", border:"1.5px solid #C8B8A0", borderRadius:12, padding:"10px 16px", fontSize:13, background:"#fff" }} />
              <datalist id="report-prof-names">{reportProfNames.map(n=><option key={n} value={n}/>)}</datalist>
              {reportProfFilter&&reportData.rows.length>0&&(
                <div style={{ marginTop:10, display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                  <span style={{ fontSize:13, color:"#3a4a2c" }}>Total: <strong style={{ color:"#72816A" }}>R$ {reportData.total.toLocaleString("pt-BR")}</strong> ({reportData.rows.length} reservas)</span>
                  <button className="btn" onClick={()=>repeatProfessionalMonth(reportProfFilter,reportMonth,reportYear,(reportMonth+1)%12,reportMonth===11?reportYear+1:reportYear)}
                    style={{ background:"linear-gradient(135deg,#2d3c20,#72816A)", color:"#fff", padding:"7px 16px", borderRadius:8, fontSize:12, fontWeight:700, boxShadow:"0 2px 8px rgba(83,94,67,.35)" }}>
                    🔁 Repetir para {MONTH_NAMES[(reportMonth+1)%12]}
                  </button>
                </div>
              )}
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:14, marginBottom:28 }}>
              <div style={{ background:"linear-gradient(135deg,#1a2010,#2d3c20)", color:"#fff", borderRadius:16, padding:22 }}>
                <div style={{ fontSize:11, color:"#596850", textTransform:"uppercase", letterSpacing:1, fontFamily:"'JetBrains Mono',monospace" }}>Total Mês</div>
                <div style={{ fontSize:28, fontWeight:800, marginTop:6 }}>R$ {reportData.total.toLocaleString("pt-BR")}</div>
                <div style={{ fontSize:12, color:"#3a4a2c", marginTop:2 }}>{reportData.rows.length} reservas</div>
              </div>
              {rooms.map(r=>{ const rd=reportData.byRoom[r.id]||{}; return (
                <div key={r.id} style={{ background:"#fff", border:"1.5px solid #C8B8A0", borderRadius:16, padding:22, borderTop:`4px solid ${r.color}` }}>
                  <div style={{ fontSize:11, color:"#8a9a7a", textTransform:"uppercase", letterSpacing:1, fontFamily:"'JetBrains Mono',monospace" }}>{r.name}</div>
                  <div style={{ fontSize:24, fontWeight:800, marginTop:6 }}>R$ {(rd.revenue||0).toLocaleString("pt-BR")}</div>
                  <div style={{ fontSize:12, color:"#8a9a7a", marginTop:2 }}>{rd.count||0} reservas</div>
                </div>
              );})}
            </div>

            {reportData.rows.length===0 ? (
              <div style={{ textAlign:"center", padding:"60px 0", color:"#8a9a7a" }}><div style={{ fontSize:40 }}>📋</div><div style={{ fontSize:14, marginTop:8 }}>Nenhuma reserva neste período</div></div>
            ) : (
              <div style={{ background:"#fff", borderRadius:16, border:"1px solid #C8B8A0", overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,.05)" }}>
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead><tr style={{ background:"#FBF7F2" }}>
                    {["Data","Horário","Dur.","Sala","Profissional","Especialidade","Status","Valor"].map(h=>(
                      <th key={h} style={{ padding:"12px 14px", textAlign:"left", fontSize:11, color:"#8a9a7a", fontWeight:700, textTransform:"uppercase", letterSpacing:.8, borderBottom:"1px solid #C8B8A0" }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {reportData.rows.map((r,i)=>{
                      const st=STATUSES.find(s=>s.value===r.status)||STATUSES[0];
                      return (
                        <tr key={i}>
                          <td style={{ padding:"11px 14px", fontSize:13, borderBottom:"1px solid #EDE4D8", fontFamily:"'JetBrains Mono',monospace", color:"#596850" }}>{formatBR(r.day)}</td>
                          <td style={{ padding:"11px 14px", fontSize:13, borderBottom:"1px solid #EDE4D8", fontFamily:"'JetBrains Mono',monospace" }}>{r.hour}</td>
                          <td style={{ padding:"11px 14px", fontSize:13, borderBottom:"1px solid #EDE4D8", color:"#8a9a7a" }}>{r.duration}h</td>
                          <td style={{ padding:"11px 14px", fontSize:13, borderBottom:"1px solid #EDE4D8" }}>
                            <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}>
                              <span style={{ width:8, height:8, borderRadius:2, background:r.color, display:"inline-block" }} />{r.room}
                            </span>
                          </td>
                          <td style={{ padding:"11px 14px", fontSize:13, fontWeight:600, borderBottom:"1px solid #EDE4D8" }}>{r.name}</td>
                          <td style={{ padding:"11px 14px", fontSize:12, color:"#596850", borderBottom:"1px solid #EDE4D8" }}>{r.type}</td>
                          <td style={{ padding:"11px 14px", borderBottom:"1px solid #EDE4D8" }}>
                            <span style={{ fontSize:11, color:st.color, background:st.bg, padding:"3px 9px", borderRadius:6, fontWeight:700 }}>{st.label}</span>
                          </td>
                          <td style={{ padding:"11px 14px", fontSize:13, fontWeight:700, color:"#72816A", borderBottom:"1px solid #EDE4D8" }}>R$ {r.price}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot><tr style={{ background:"#FBF7F2" }}>
                    <td colSpan={7} style={{ padding:"13px 14px", fontSize:13, fontWeight:700, textAlign:"right", borderTop:"1px solid #C8B8A0" }}>Total:</td>
                    <td style={{ padding:"13px 14px", fontSize:16, fontWeight:800, color:"#72816A", borderTop:"1px solid #C8B8A0" }}>R$ {reportData.total.toLocaleString("pt-BR")}</td>
                  </tr></tfoot>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══ COBRANÇA ══ */}
        {tab==="cobranca" && <CobrancaTab bookings={bookings} professionals={professionals} rooms={rooms} prices={prices} hourlyRateFor={hourlyRateFor} config={config} />}

        {/* ══ FINANCEIRO ══ */}
        {tab==="financeiro" && <FinanceiroTab financeiro={financeiro} setFinanceiro={setFinanceiro} />}

        {/* ══ CONFIGURAÇÕES ══ */}
        {tab==="configuracoes" && (
          <div style={{ padding:"32px 32px", maxWidth:860 }} className="fade-up">
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
              <div>
                <h2 style={{ fontSize:24, fontWeight:800, color:"#1a2010" }}>Configurações</h2>
                <div style={{ fontSize:14, color:"#596850" }}>Salas, preços e acesso ao sistema</div>
              </div>
              <button className="btn" onClick={()=>{ setForm({name:"",color:"#72816A"}); setModal({type:"room"}); }}
                style={{ background:"linear-gradient(135deg,#2d3c20,#72816A)", color:"#fff", padding:"11px 22px", borderRadius:12, fontSize:13, fontWeight:700, boxShadow:"0 4px 12px rgba(83,94,67,.35)" }}>
                + Nova Sala
              </button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:16, marginBottom:32 }}>
              {rooms.map(r=>(
                <div key={r.id} style={{ background:"#fff", border:"1px solid #C8B8A0", borderRadius:16, padding:22, borderTop:`5px solid ${r.color}`, boxShadow:"0 1px 4px rgba(0,0,0,.04)" }}>
                  <div style={{ fontSize:17, fontWeight:800, marginBottom:4, color:"#1a2010" }}>{r.name}</div>
                  <div style={{ fontSize:12, color:"#8a9a7a", marginBottom:16 }}>Cor: <span style={{ background:r.color, padding:"1px 8px", borderRadius:4, color:"#fff", fontSize:11 }}>{r.color}</span></div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
                    <span style={{ fontSize:13, color:"#3a4a2c", fontWeight:500 }}>R$/hora:</span>
                    <input type="number" value={prices[r.id]||0} onChange={e=>setPrices(p=>({...p,[r.id]:+e.target.value}))}
                      style={{ width:88, border:"1.5px solid #C8B8A0", borderRadius:8, padding:"6px 10px", fontSize:15, fontWeight:700, fontFamily:"'JetBrains Mono',monospace", color:"#1a2010" }} />
                  </div>
                  <button className="btn" onClick={()=>{ setForm({...r}); setModal({type:"room",existing:true}); }}
                    style={{ width:"100%", background:"#FBF7F2", padding:"9px", borderRadius:9, fontSize:12, fontWeight:600, color:"#3a4a2c", border:"1px solid #C8B8A0" }}>
                    ✏️ Editar nome/cor
                  </button>
                </div>
              ))}
            </div>
            {/* PIX Config */}
          <div style={{ background:"#fff", borderRadius:16, border:"1px solid #C8B8A0", padding:24, maxWidth:480, boxShadow:"0 1px 4px rgba(0,0,0,.04)", marginBottom:24 }}>
            <div style={{ fontSize:15, fontWeight:700, color:"#1a2010", marginBottom:4 }}>💳 Configuração PIX</div>
            <div style={{ fontSize:12, color:"#8a9a7a", marginBottom:16 }}>Dados usados para gerar cobranças automáticas</div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:"#8a9a7a", marginBottom:5, textTransform:"uppercase", letterSpacing:.8 }}>Tipo de chave</div>
                <select value={config.pixTipo||"Chave aleatória"} onChange={e=>setConfig(c=>({...c,pixTipo:e.target.value}))}
                  style={{ width:"100%", border:"1.5px solid #C8B8A0", borderRadius:9, padding:"10px 13px", fontSize:13, fontFamily:"'Outfit',sans-serif", background:"#FBF7F2" }}>
                  {["CPF","CNPJ","E-mail","Telefone","Chave aleatória"].map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:"#8a9a7a", marginBottom:5, textTransform:"uppercase", letterSpacing:.8 }}>Chave PIX</div>
                <input value={config.pixKey||""} onChange={e=>setConfig(c=>({...c,pixKey:e.target.value}))} placeholder="Sua chave PIX"
                  style={{ width:"100%", border:"1.5px solid #C8B8A0", borderRadius:9, padding:"10px 13px", fontSize:13, fontFamily:"'Outfit',sans-serif", background:"#FBF7F2" }} />
              </div>
              <div style={{ display:"flex", gap:10 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#8a9a7a", marginBottom:5, textTransform:"uppercase", letterSpacing:.8 }}>Nome beneficiário</div>
                  <input value={config.pixName||""} onChange={e=>setConfig(c=>({...c,pixName:e.target.value}))} placeholder="Ex: Maria Silva"
                    style={{ width:"100%", border:"1.5px solid #C8B8A0", borderRadius:9, padding:"10px 13px", fontSize:13, fontFamily:"'Outfit',sans-serif", background:"#FBF7F2" }} />
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:"#8a9a7a", marginBottom:5, textTransform:"uppercase", letterSpacing:.8 }}>Cidade</div>
                  <input value={config.pixCity||""} onChange={e=>setConfig(c=>({...c,pixCity:e.target.value}))} placeholder="Ex: SAO PAULO"
                    style={{ width:"100%", border:"1.5px solid #C8B8A0", borderRadius:9, padding:"10px 13px", fontSize:13, fontFamily:"'Outfit',sans-serif", background:"#FBF7F2" }} />
                </div>
              </div>
              {config.pixKey && config.pixName && config.pixCity && (
                <div style={{ background:"#f0f7f2", border:"1px solid #bbf7d0", borderRadius:9, padding:"10px 14px", fontSize:12, color:"#72816A", fontWeight:600 }}>
                  ✅ PIX configurado — cobranças automáticas ativadas
                </div>
              )}
            </div>
          </div>

          <ChangePasswordSection />
          </div>
        )}
      </div>

      {/* ══ MODAL RESERVA ══ */}
      {modal?.type==="booking" && (
        <ModalOverlay onClose={()=>setModal(null)}>
          <div style={{ marginBottom:20, display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
            <div>
              <div style={{ fontSize:18, fontWeight:800, color:"#1a2010" }}>{modal.existing?"Editar Reserva":"Nova Reserva"}</div>
              <div style={{ fontSize:12, color:"#8a9a7a", fontFamily:"'JetBrains Mono',monospace", marginTop:3 }}>
                {rooms.find(r=>r.id===form.roomId)?.name} · {form.hour} · {formatBR(form.day)}
              </div>
            </div>
            <button className="btn" onClick={()=>setModal(null)} style={{ fontSize:22, color:"#8a9a7a", background:"transparent" }}>×</button>
          </div>
          {professionals.length>0 && (
            <div style={{ marginBottom:14 }}>
              <FormLabel>Profissional cadastrado</FormLabel>
              <select onChange={e=>{ const p=professionals.find(x=>x.id===+e.target.value); if(p) setForm(f=>({...f,name:p.name,type:p.specialty,phone:p.phone||"",profId:p.id})); }} style={fmInput}>
                <option value="">— Selecionar —</option>
                {professionals.map(p=><option key={p.id} value={p.id}>{p.name} ({p.specialty})</option>)}
              </select>
            </div>
          )}
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div><FormLabel>Nome *</FormLabel><input value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Nome do profissional" style={fmInput} /></div>
            <div><FormLabel>Especialidade</FormLabel>
              <select value={form.type||SPECIALTIES[0]} onChange={e=>setForm(f=>({...f,type:e.target.value}))} style={fmInput}>
                {SPECIALTIES.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>

            {/* ── Seletor de horários ── */}
            {!modal?.existing && (() => {
              const sel = form.selectedHours || [];
              const rate = hourlyRateFor(form.roomId, form.profId, form.name);
              return (
                <div>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                    <FormLabel>Horários do dia {formatBR(form.day)}</FormLabel>
                    <span style={{ fontSize:11, color:"#72816A", fontWeight:700 }}>{sel.length} selecionado{sel.length!==1?"s":""} · R$ {(rate*sel.length).toLocaleString("pt-BR")}</span>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:5 }}>
                    {HOURS.map(h => {
                      const occ = getOccupyingBooking(form.day, form.roomId, h);
                      const busy = occ && !(occ.isStart && sel.includes(h) && !modal?.existing);
                      const checked = sel.includes(h);
                      return (
                        <button key={h} className="btn" disabled={busy&&!checked} onClick={()=>{
                          if (busy) return;
                          setForm(f => {
                            const s = f.selectedHours||[];
                            return {...f, selectedHours: s.includes(h)?s.filter(x=>x!==h):[...s,h]};
                          });
                        }} style={{ padding:"7px 0", borderRadius:8, fontSize:12, fontWeight:700,
                          background: busy ? "#EDE4D8" : checked ? "#72816A" : "#FBF7F2",
                          color: busy ? "#b0a898" : checked ? "#fff" : "#2a3820",
                          border: checked ? "none" : "1px solid #C8B8A0",
                          cursor: busy ? "default" : "pointer",
                          textDecoration: busy ? "line-through" : "none",
                        }}>{h}</button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize:11, color:"#8a9a7a", marginTop:6 }}>Clique para selecionar. Horários riscados já estão ocupados.</div>
                </div>
              );
            })()}

            {/* Duração — só para edição de reserva existente */}
            {modal?.existing && <div>
              <FormLabel>Duração</FormLabel>
              <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                {DURATIONS.map(d=>(
                  <button key={d} className="btn" onClick={()=>setForm(f=>({...f,duration:d}))}
                    style={{ minWidth:42, flex:"1 0 auto", padding:"8px 0", borderRadius:8, fontSize:13, fontWeight:700, background:(form.duration??1)===d?"#72816A":"#EDE4D8", color:(form.duration??1)===d?"#fff":"#3a4a2c" }}>
                    {d}h
                  </button>
                ))}
              </div>
              {(form.duration??1)>1 && <div style={{ fontSize:12, color:"#72816A", marginTop:5, fontWeight:600 }}>Total: R$ {(hourlyRateFor(form.roomId,form.profId,form.name)*(form.duration??1)).toLocaleString("pt-BR")}</div>}
            </div>}
            <div>
              <FormLabel>Status</FormLabel>
              <div style={{ display:"flex", gap:6 }}>
                {STATUSES.map(s=>(
                  <button key={s.value} className="btn" onClick={()=>setForm(f=>({...f,status:s.value}))}
                    style={{ flex:1, padding:"8px 0", borderRadius:8, fontSize:11, fontWeight:700, background:(form.status||"confirmed")===s.value?s.color:s.bg, color:(form.status||"confirmed")===s.value?"#fff":s.color }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div><FormLabel>Telefone / WhatsApp</FormLabel><input value={form.phone||""} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="(11) 99999-9999" style={fmInput} /></div>
            <div><FormLabel>Observações</FormLabel><textarea value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2} style={{ ...fmInput, resize:"none" }} /></div>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:20, flexWrap:"wrap" }}>
            {modal.existing && (
              <>
                <button className="btn" onClick={()=>setConfirmDel({type:"booking",day:form.day,roomId:form.roomId,hour:form.hour})}
                  style={{ padding:"9px 14px", borderRadius:9, background:"#fef2f2", color:"#ef4444", fontSize:12, fontWeight:700, border:"1.5px solid #fecaca" }}>
                  🗑 Cancelar reserva
                </button>
                {form.phone && (
                  <button className="btn" onClick={()=>{ const room=rooms.find(r=>r.id===form.roomId); openWhatsApp(form.phone,form.name,room?.name,formatBR(form.day),form.hour); }}
                    style={{ padding:"9px 14px", borderRadius:9, background:"#f0f7f2", color:"#72816A", fontSize:12, fontWeight:700, border:"1.5px solid #bbf7d0" }}>
                    💬 WhatsApp
                  </button>
                )}
              </>
            )}
            {(() => {
              const canSave = form.name?.trim() && (modal?.existing || (form.selectedHours && form.selectedHours.length > 0));
              return (
                <button className="btn" onClick={saveBooking} disabled={!canSave}
                  style={{ marginLeft:"auto", padding:"11px 22px", borderRadius:10, background:canSave?"linear-gradient(135deg,#2d3c20,#72816A)":"#EDE4D8", color:canSave?"#fff":"#8a9a7a", fontSize:14, fontWeight:700, boxShadow:canSave?"0 4px 12px rgba(83,94,67,.35)":"none" }}>
                  {modal?.existing?"Salvar":`Confirmar ${(form.selectedHours||[]).length} horário${(form.selectedHours||[]).length!==1?"s":""}`}
                </button>
              );
            })()}
          </div>
        </ModalOverlay>
      )}

      {/* ══ MODAL PROFISSIONAL ══ */}
      {modal?.type==="prof" && (
        <ModalOverlay onClose={()=>setModal(null)}>
          <div style={{ marginBottom:20, display:"flex", justifyContent:"space-between" }}>
            <div style={{ fontSize:18, fontWeight:800, color:"#1a2010" }}>{modal.existing?"Editar Profissional":"Novo Profissional"}</div>
            <button className="btn" onClick={()=>setModal(null)} style={{ fontSize:22, color:"#8a9a7a", background:"transparent" }}>×</button>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div><FormLabel>Nome *</FormLabel><input value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Nome completo" style={fmInput} /></div>
            <div><FormLabel>Especialidade</FormLabel>
              <select value={form.specialty||SPECIALTIES[0]} onChange={e=>setForm(f=>({...f,specialty:e.target.value,registroTipo:registroTipoFor(e.target.value)}))} style={fmInput}>
                {SPECIALTIES.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <FormLabel>Registro profissional</FormLabel>
              <div style={{ display:"flex", gap:8 }}>
                <select value={form.registroTipo||registroTipoFor(form.specialty)} onChange={e=>setForm(f=>({...f,registroTipo:e.target.value}))}
                  style={{ ...fmInput, width:110, flexShrink:0 }}>
                  {REGISTRO_TIPOS.map(r=><option key={r}>{r}</option>)}
                </select>
                <input value={form.registroCodigo||""} onChange={e=>setForm(f=>({...f,registroCodigo:e.target.value}))}
                  placeholder="Nº do registro (ex: 123456/SP)" style={{ ...fmInput, flex:1 }} />
              </div>
            </div>
            <div><FormLabel>Telefone / WhatsApp</FormLabel><input value={form.phone||""} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="(11) 99999-9999" style={fmInput} /></div>
            <div><FormLabel>E-mail</FormLabel><input value={form.email||""} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="email@exemplo.com" style={fmInput} /></div>
            <div><FormLabel>Valor por hora (R$) — opcional</FormLabel>
              <input type="number" value={form.hourlyRate??""} onChange={e=>setForm(f=>({...f,hourlyRate:e.target.value===""?null:+e.target.value}))} placeholder="Deixe em branco para usar o valor da sala" style={fmInput} />
              <div style={{ fontSize:11, color:"#8a9a7a", marginTop:4 }}>Se definido, substitui o preço padrão da sala.</div>
            </div>
            <div><FormLabel>Observações</FormLabel><textarea value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} rows={2} style={{ ...fmInput, resize:"none" }} /></div>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:20 }}>
            {modal.existing && <button className="btn" onClick={()=>setConfirmDel({type:"prof",id:form.id})}
              style={{ padding:"9px 14px", borderRadius:9, background:"#fef2f2", color:"#ef4444", fontSize:12, fontWeight:700, border:"1.5px solid #fecaca" }}>🗑 Remover</button>}
            <button className="btn" onClick={saveProfessional} disabled={!form.name?.trim()}
              style={{ marginLeft:"auto", padding:"11px 22px", borderRadius:10, background:form.name?.trim()?"linear-gradient(135deg,#2d3c20,#72816A)":"#EDE4D8", color:form.name?.trim()?"#fff":"#8a9a7a", fontSize:14, fontWeight:700 }}>
              Salvar
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* ══ MODAL SALA ══ */}
      {modal?.type==="room" && (
        <ModalOverlay onClose={()=>setModal(null)}>
          <div style={{ marginBottom:20, display:"flex", justifyContent:"space-between" }}>
            <div style={{ fontSize:18, fontWeight:800, color:"#1a2010" }}>{modal.existing?"Editar Sala":"Nova Sala"}</div>
            <button className="btn" onClick={()=>setModal(null)} style={{ fontSize:22, color:"#8a9a7a", background:"transparent" }}>×</button>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            <div><FormLabel>Nome da sala *</FormLabel><input value={form.name||""} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Ex: Sala 03" style={fmInput} /></div>
            <div>
              <FormLabel>Cor de identificação</FormLabel>
              <div style={{ display:"flex", gap:10, alignItems:"center", marginTop:4 }}>
                <input type="color" value={form.color||"#72816A"} onChange={e=>setForm(f=>({...f,color:e.target.value}))}
                  style={{ width:52, height:40, border:"1.5px solid #C8B8A0", borderRadius:9, cursor:"pointer", padding:3 }} />
                <span style={{ fontSize:12, color:"#8a9a7a", fontFamily:"'JetBrains Mono',monospace" }}>{form.color}</span>
                <div style={{ width:28, height:28, borderRadius:7, background:form.color||"#72816A" }} />
              </div>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, marginTop:20 }}>
            {modal.existing && <button className="btn" onClick={()=>{ setRooms(r=>r.filter(x=>x.id!==form.id)); setModal(null); showToast("Sala removida.","err"); }}
              style={{ padding:"9px 14px", borderRadius:9, background:"#fef2f2", color:"#ef4444", fontSize:12, fontWeight:700, border:"1.5px solid #fecaca" }}>🗑 Remover</button>}
            <button className="btn" onClick={saveRoom} disabled={!form.name?.trim()}
              style={{ marginLeft:"auto", padding:"11px 22px", borderRadius:10, background:form.name?.trim()?"linear-gradient(135deg,#2d3c20,#72816A)":"#EDE4D8", color:form.name?.trim()?"#fff":"#8a9a7a", fontSize:14, fontWeight:700 }}>
              Salvar
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* Confirm delete */}
      {confirmDel && (
        <ModalOverlay onClose={()=>setConfirmDel(null)} small>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:40, marginBottom:12 }}>⚠️</div>
            <div style={{ fontSize:17, fontWeight:800, marginBottom:8, color:"#1a2010" }}>Confirmar exclusão?</div>
            <div style={{ fontSize:13, color:"#8a9a7a", marginBottom:22 }}>Esta ação não pode ser desfeita.</div>
            <div style={{ display:"flex", gap:10 }}>
              <button className="btn" onClick={()=>setConfirmDel(null)} style={{ flex:1, padding:11, borderRadius:10, background:"#EDE4D8", fontSize:13, fontWeight:600 }}>Cancelar</button>
              <button className="btn" onClick={()=>{ if(confirmDel.type==="booking") deleteBooking(confirmDel.day,confirmDel.roomId,confirmDel.hour); else if(confirmDel.type==="prof") deleteProfessional(confirmDel.id); }}
                style={{ flex:1, padding:11, borderRadius:10, background:"#ef4444", color:"#fff", fontSize:13, fontWeight:700 }}>Confirmar</button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Toast */}
      {toast && (
        <div className="toast-anim" style={{ position:"fixed", bottom:28, right:28, background:toast.type==="err"?"#fef2f2":"#f0f7f2", border:`1.5px solid ${toast.type==="err"?"#fca5a5":"#86d4a2"}`, color:toast.type==="err"?"#ef4444":"#72816A", padding:"12px 20px", borderRadius:12, fontSize:13, fontWeight:700, zIndex:999, boxShadow:"0 8px 24px rgba(0,0,0,.12)" }}>
          {toast.type==="err"?"✕ ":"✓ "}{toast.msg}
        </div>
      )}
    </div>
  );
}

// ─── Professional Card with Repeat feature ────────────────────────────────────
function ProfCard({ p, bookings, rooms, prices, professionals, onEdit, onRepeat }) {
  const [showRepeat, setShowRepeat] = useState(false);
  const now = new Date();
  const [fromMonth, setFromMonth] = useState(now.getMonth());
  const [fromYear, setFromYear] = useState(now.getFullYear());
  const [toMonth, setToMonth] = useState((now.getMonth()+1)%12);
  const [toYear, setToYear] = useState(now.getMonth()===11?now.getFullYear()+1:now.getFullYear());
  const [result, setResult] = useState(null);

  const hasBookings = Object.values(bookings).some(b=>b.name===p.name);

  function doRepeat() {
    const added = onRepeat(fromMonth, fromYear, toMonth, toYear);
    setResult(added);
    setTimeout(()=>{ setResult(null); setShowRepeat(false); },2500);
  }

  const specialtyIcon = p.specialty==="Psicólogo(a)"||p.specialty==="Terapeuta"?"🧠":p.specialty==="Advogado(a)"||p.specialty==="Consultor(a)"?"⚖️":p.specialty==="Médico(a)"||p.specialty==="Dentista"?"🩺":"💼";

  return (
    <div style={{ background:"#fff", borderRadius:16, border:"1px solid #C8B8A0", overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,.04)", transition:"all .15s" }}>
      <div style={{ padding:20, cursor:"pointer" }} onClick={onEdit}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
          <div style={{ width:44, height:44, borderRadius:14, background:"linear-gradient(135deg,#1a2010,#2d3c20)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>{specialtyIcon}</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15, fontWeight:700, color:"#1a2010" }}>{p.name}</div>
            <div style={{ fontSize:12, color:"#596850" }}>{p.specialty}</div>
          </div>
        </div>
        {p.registroCodigo&&<div style={{ fontSize:12, color:"#72816A", fontWeight:700, marginBottom:5, fontFamily:"'JetBrains Mono',monospace" }}>🪪 {p.registroTipo||"CRP"} {p.registroCodigo}</div>}
        {p.hourlyRate!=null&&p.hourlyRate!==""&&<div style={{ fontSize:12, color:"#72816A", fontWeight:700, marginBottom:5 }}>💰 R$ {p.hourlyRate}/h (valor próprio)</div>}
        {p.phone&&<div style={{ fontSize:12, color:"#596850", fontFamily:"'JetBrains Mono',monospace", marginBottom:4 }}>📱 {p.phone}</div>}
        {p.email&&<div style={{ fontSize:12, color:"#596850", marginBottom:4 }}>✉️ {p.email}</div>}
        {p.notes&&<div style={{ fontSize:11, color:"#8a9a7a", marginTop:8, borderTop:"1px solid #EDE4D8", paddingTop:8 }}>{p.notes}</div>}
      </div>

      {/* Action bar */}
      <div style={{ padding:"10px 16px", background:"#FBF7F2", borderTop:"1px solid #EDE4D8", display:"flex", gap:7 }}>
        {p.phone && (
          <button className="btn" onClick={e=>{ e.stopPropagation(); window.open(`https://wa.me/55${p.phone.replace(/\D/g,"")}`, "_blank"); }}
            style={{ flex:1, background:"#f0f7f2", color:"#72816A", padding:"7px 0", borderRadius:8, fontSize:11, fontWeight:700, border:"1px solid #bbf7d0" }}>
            💬 WhatsApp
          </button>
        )}
        {hasBookings && (
          <button className="btn" onClick={e=>{ e.stopPropagation(); setShowRepeat(r=>!r); }}
            style={{ flex:1, background:showRepeat?"#EDE4D8":"#F0EAE0", color:"#72816A", padding:"7px 0", borderRadius:8, fontSize:11, fontWeight:700, border:"1px solid #bfdbfe" }}>
            🔁 Repetir mês
          </button>
        )}
      </div>

      {/* Repeat panel */}
      {showRepeat && (
        <div style={{ padding:"16px 16px", borderTop:"1px solid #C8B8A0", background:"#F0EAE0" }}>
          {result!==null ? (
            <div style={{ textAlign:"center", padding:"8px 0", fontSize:13, fontWeight:700, color:result>0?"#72816A":"#ef4444" }}>
              {result>0?`✅ ${result} reserva${result!==1?"s":""} copiadas!`:"⚠️ Nenhuma reserva copiada"}
            </div>
          ) : (
            <>
              <div style={{ fontSize:12, fontWeight:700, color:"#535E43", marginBottom:12 }}>Copiar reservas para outro mês</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:12 }}>
                <div>
                  <div style={{ fontSize:11, color:"#8a9a7a", fontWeight:600, marginBottom:4 }}>De (mês origem)</div>
                  <select value={`${fromYear}-${fromMonth}`} onChange={e=>{ const [y,m]=e.target.value.split("-"); setFromYear(+y); setFromMonth(+m); }}
                    style={{ width:"100%", border:"1.5px solid #bfdbfe", borderRadius:8, padding:"7px 10px", fontSize:12, background:"#fff", fontFamily:"'Outfit',sans-serif" }}>
                    {[2024,2025,2026,2027].flatMap(y=>MONTH_NAMES.map((m,i)=>(
                      <option key={`${y}-${i}`} value={`${y}-${i}`}>{m} {y}</option>
                    )))}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize:11, color:"#8a9a7a", fontWeight:600, marginBottom:4 }}>Para (mês destino)</div>
                  <select value={`${toYear}-${toMonth}`} onChange={e=>{ const [y,m]=e.target.value.split("-"); setToYear(+y); setToMonth(+m); }}
                    style={{ width:"100%", border:"1.5px solid #bfdbfe", borderRadius:8, padding:"7px 10px", fontSize:12, background:"#fff", fontFamily:"'Outfit',sans-serif" }}>
                    {[2024,2025,2026,2027].flatMap(y=>MONTH_NAMES.map((m,i)=>(
                      <option key={`${y}-${i}`} value={`${y}-${i}`}>{m} {y}</option>
                    )))}
                  </select>
                </div>
              </div>
              <button className="btn" onClick={doRepeat}
                style={{ width:"100%", background:"linear-gradient(135deg,#2d3c20,#72816A)", color:"#fff", padding:"9px", borderRadius:9, fontSize:12, fontWeight:700, boxShadow:"0 4px 10px rgba(83,94,67,.35)" }}>
                🔁 Copiar reservas
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PIX QR Code component ───────────────────────────────────────────────────
function PixQRCode({ pixString }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || !pixString) return;
    function render() {
      if (!window.QRCode) return;
      ref.current.innerHTML = "";
      new window.QRCode(ref.current, { text: pixString, width: 180, height: 180, colorDark:"#1a2010", colorLight:"#ffffff" });
    }
    if (window.QRCode) { render(); return; }
    if (!document.querySelector('script[data-qr]')) {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
      s.setAttribute("data-qr","1");
      s.onload = render;
      document.head.appendChild(s);
    } else {
      const wait = setInterval(()=>{ if (window.QRCode) { clearInterval(wait); render(); } },100);
    }
  }, [pixString]);
  return <div ref={ref} style={{ display:"flex", justifyContent:"center" }} />;
}

// ─── Cobrança Mensal ──────────────────────────────────────────────────────────
function CobrancaTab({ bookings, professionals, rooms, prices, hourlyRateFor, config }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [expanded, setExpanded] = useState(null); // profName

  // Build per-professional summary for the selected month
  const profSummaries = (() => {
    const map = {};
    Object.entries(bookings).forEach(([key, b]) => {
      const [day, roomId] = key.split("_");
      const dt = new Date(day + "T12:00:00");
      if (dt.getMonth() !== month || dt.getFullYear() !== year) return;
      const name = b.name || "?";
      if (!map[name]) {
        const prof = professionals.find(p => p.name.trim().toLowerCase() === name.trim().toLowerCase());
        map[name] = { name, prof, slots: 0, hours: 0, total: 0, phone: b.phone || prof?.phone || "" };
      }
      const dur = b.duration ?? 1;
      const rate = hourlyRateFor(parseInt(roomId), b.profId, name);
      map[name].slots++;
      map[name].hours += dur;
      map[name].total += rate * dur;
    });
    return Object.values(map).sort((a,b) => b.total - a.total);
  })();

  const totalGeral = profSummaries.reduce((s, p) => s + p.total, 0);
  const pixOk = config.pixKey && config.pixName && config.pixCity;

  function waMessage(p) {
    const pix = pixOk ? generatePix({ key: config.pixKey, name: config.pixName, city: config.pixCity, amount: p.total, txid: p.name.replace(/\s/g,"").substring(0,20) }) : "";
    const mesAno = `${MONTH_NAMES[month]} ${year}`;
    let msg = `Olá ${p.name}! 👋\n\nSegue o resumo da locação de sala referente a *${mesAno}*:\n\n`;
    msg += `📊 *Horas utilizadas:* ${p.hours}h\n`;
    msg += `💰 *Valor total:* R$ ${p.total.toLocaleString("pt-BR", { minimumFractionDigits:2 })}\n\n`;
    if (pixOk) {
      msg += `Para pagamento via PIX:\n🔑 *Chave (${config.pixTipo||"PIX"}):* ${config.pixKey}\n`;
      msg += `📋 *Copia e Cola:*\n${pix}\n\n`;
    }
    msg += `Qualquer dúvida, entre em contato. Obrigado! 🏢`;
    return msg;
  }

  function sendWA(p) {
    const phone = p.phone.replace(/\D/g,"");
    const full = phone.startsWith("55") ? phone : "55" + phone;
    window.open(`https://wa.me/${full}?text=${encodeURIComponent(waMessage(p))}`, "_blank");
  }

  return (
    <div style={{ padding:"32px 32px", maxWidth:960 }} className="fade-up">
      <div style={{ marginBottom:28 }}>
        <h2 style={{ fontSize:24, fontWeight:800, color:"#1a2010" }}>Cobrança Mensal</h2>
        <div style={{ fontSize:14, color:"#596850", marginTop:2 }}>Gere cobranças com QR Code PIX e envie via WhatsApp</div>
      </div>

      {/* Month selector */}
      <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:24, flexWrap:"wrap" }}>
        <select value={month} onChange={e=>setMonth(+e.target.value)}
          style={{ border:"1.5px solid #C8B8A0", borderRadius:10, padding:"9px 14px", fontSize:13, background:"#fff", fontFamily:"'Outfit',sans-serif", color:"#2a3820" }}>
          {MONTH_NAMES.map((m,i)=><option key={i} value={i}>{m}</option>)}
        </select>
        <select value={year} onChange={e=>setYear(+e.target.value)}
          style={{ border:"1.5px solid #C8B8A0", borderRadius:10, padding:"9px 14px", fontSize:13, background:"#fff", fontFamily:"'Outfit',sans-serif", color:"#2a3820" }}>
          {[2024,2025,2026,2027].map(y=><option key={y}>{y}</option>)}
        </select>
        <div style={{ marginLeft:"auto", background:"linear-gradient(135deg,#1a2010,#2d3c20)", color:"#fff", borderRadius:12, padding:"10px 20px", fontSize:14, fontWeight:700 }}>
          Total: R$ {totalGeral.toLocaleString("pt-BR", { minimumFractionDigits:2 })}
        </div>
      </div>

      {!pixOk && (
        <div style={{ background:"#fffbeb", border:"1.5px solid #fcd34d", borderRadius:12, padding:"14px 18px", marginBottom:20, fontSize:13, color:"#92400e", fontWeight:600 }}>
          ⚠️ Configure sua chave PIX em <strong>Configurações</strong> para habilitar os QR Codes de cobrança.
        </div>
      )}

      {profSummaries.length === 0 ? (
        <div style={{ textAlign:"center", padding:"60px 0", color:"#8a9a7a" }}>
          <div style={{ fontSize:40 }}>💳</div>
          <div style={{ fontSize:14, marginTop:8 }}>Nenhuma reserva em {MONTH_NAMES[month]} {year}</div>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          {profSummaries.map(p => {
            const isOpen = expanded === p.name;
            const pixStr = pixOk ? generatePix({ key:config.pixKey, name:config.pixName, city:config.pixCity, amount:p.total, txid:p.name.replace(/\s/g,"").substring(0,20) }) : "";
            return (
              <div key={p.name} style={{ background:"#fff", borderRadius:16, border:"1px solid #C8B8A0", overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,.04)" }}>
                {/* Summary row */}
                <div style={{ display:"flex", alignItems:"center", gap:16, padding:"18px 22px", cursor:"pointer" }} onClick={()=>setExpanded(isOpen?null:p.name)}>
                  <div style={{ width:44, height:44, background:"linear-gradient(135deg,#1a2010,#2d3c20)", borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>👤</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:15, fontWeight:700, color:"#1a2010" }}>{p.name}</div>
                    <div style={{ fontSize:12, color:"#596850" }}>{p.prof?.specialty || "Profissional"} · {p.hours}h em {p.slots} reserva{p.slots!==1?"s":""}</div>
                  </div>
                  <div style={{ textAlign:"right", marginRight:12 }}>
                    <div style={{ fontSize:20, fontWeight:800, color:"#72816A" }}>R$ {p.total.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
                    <div style={{ fontSize:11, color:"#8a9a7a" }}>{p.hours}h × R${(p.total/p.hours).toFixed(0)}/h</div>
                  </div>
                  <div style={{ fontSize:20, color:"#8a9a7a", transition:"transform .2s", transform:isOpen?"rotate(180deg)":"rotate(0)" }}>⌄</div>
                </div>

                {/* Expanded: QR + actions */}
                {isOpen && (
                  <div style={{ borderTop:"1px solid #EDE4D8", padding:"22px 22px", background:"#FBF7F2" }}>
                    <div style={{ display:"flex", gap:24, flexWrap:"wrap" }}>
                      {/* QR Code */}
                      <div style={{ flex:"0 0 auto" }}>
                        {pixOk ? (
                          <div style={{ background:"#fff", borderRadius:14, padding:16, border:"1px solid #C8B8A0", display:"inline-block", textAlign:"center" }}>
                            <PixQRCode pixString={pixStr} />
                            <div style={{ fontSize:11, color:"#596850", marginTop:8, fontWeight:600 }}>QR Code PIX · R$ {p.total.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
                          </div>
                        ) : (
                          <div style={{ background:"#fff", borderRadius:14, padding:24, border:"1.5px dashed #C8B8A0", textAlign:"center", color:"#8a9a7a" }}>
                            <div style={{ fontSize:32 }}>⚠️</div>
                            <div style={{ fontSize:12, marginTop:8 }}>Configure o PIX<br/>em Configurações</div>
                          </div>
                        )}
                      </div>

                      {/* Info + actions */}
                      <div style={{ flex:1, minWidth:220 }}>
                        <div style={{ marginBottom:14 }}>
                          <div style={{ fontSize:12, color:"#8a9a7a", fontWeight:700, textTransform:"uppercase", letterSpacing:.8, marginBottom:6 }}>Resumo da cobrança</div>
                          <div style={{ background:"#fff", borderRadius:10, border:"1px solid #C8B8A0", padding:"12px 14px", fontSize:13, lineHeight:1.8, color:"#2a3820" }}>
                            <div>📅 Mês: <strong>{MONTH_NAMES[month]} {year}</strong></div>
                            <div>⏱ Horas: <strong>{p.hours}h</strong></div>
                            <div>📊 Reservas: <strong>{p.slots}</strong></div>
                            <div>💰 Total: <strong style={{ color:"#72816A" }}>R$ {p.total.toLocaleString("pt-BR",{minimumFractionDigits:2})}</strong></div>
                            {p.prof?.registroCodigo && <div>🪪 {p.prof.registroTipo||"Reg"}: <strong>{p.prof.registroCodigo}</strong></div>}
                          </div>
                        </div>

                        {pixOk && (
                          <div style={{ marginBottom:12 }}>
                            <div style={{ fontSize:11, color:"#8a9a7a", fontWeight:700, textTransform:"uppercase", letterSpacing:.8, marginBottom:5 }}>PIX Copia e Cola</div>
                            <div style={{ background:"#fff", border:"1px solid #C8B8A0", borderRadius:9, padding:"8px 12px", fontSize:10, fontFamily:"'JetBrains Mono',monospace", color:"#2a3820", wordBreak:"break-all", lineHeight:1.5, maxHeight:60, overflow:"auto" }}>{pixStr}</div>
                            <button onClick={()=>navigator.clipboard?.writeText(pixStr).then(()=>{})}
                              style={{ marginTop:5, background:"#F0EAE0", border:"none", borderRadius:7, padding:"6px 12px", fontSize:11, fontWeight:700, color:"#72816A", cursor:"pointer", fontFamily:"'Outfit',sans-serif" }}>
                              📋 Copiar código PIX
                            </button>
                          </div>
                        )}

                        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                          {p.phone ? (
                            <button onClick={()=>sendWA(p)}
                              style={{ flex:1, background:"linear-gradient(135deg,#16a34a,#15803d)", color:"#fff", border:"none", borderRadius:10, padding:"11px 16px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'Outfit',sans-serif", boxShadow:"0 4px 10px rgba(74,124,89,.3)" }}>
                              💬 Enviar via WhatsApp
                            </button>
                          ) : (
                            <div style={{ flex:1, background:"#EDE4D8", borderRadius:10, padding:"11px 16px", fontSize:12, color:"#8a9a7a", textAlign:"center" }}>
                              Sem telefone cadastrado
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Financeiro ───────────────────────────────────────────────────────────────
function FinanceiroTab({ financeiro, setFinanceiro }) {
  const today = new Date().toISOString().split("T")[0];
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroMes, setFiltroMes] = useState(()=>today.slice(0,7));
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [confirmDel, setConfirmDel] = useState(null);

  const lista = financeiro.filter(i=>{
    if (filtroTipo!=="todos"&&i.tipo!==filtroTipo) return false;
    if (filtroStatus!=="todos"&&i.status!==filtroStatus) return false;
    if (filtroMes&&!i.vencimento.startsWith(filtroMes)) return false;
    return true;
  }).sort((a,b)=>a.vencimento.localeCompare(b.vencimento));

  const totalRec=financeiro.filter(i=>i.tipo==="receber"&&i.vencimento.startsWith(filtroMes)).reduce((s,i)=>s+i.valor,0);
  const totalPag=financeiro.filter(i=>i.tipo==="pagar"&&i.vencimento.startsWith(filtroMes)).reduce((s,i)=>s+i.valor,0);
  const totalRecPago=financeiro.filter(i=>i.tipo==="receber"&&i.status==="pago"&&i.vencimento.startsWith(filtroMes)).reduce((s,i)=>s+i.valor,0);
  const totalPagPago=financeiro.filter(i=>i.tipo==="pagar"&&i.status==="pago"&&i.vencimento.startsWith(filtroMes)).reduce((s,i)=>s+i.valor,0);
  const saldo=totalRecPago-totalPagPago;

  function openNew(tipo) { setForm({tipo,descricao:"",valor:"",vencimento:today,categoria:tipo==="receber"?FIN_CATS_REC[0]:FIN_CATS_PAG[0],status:"pendente",obs:""}); setModal({mode:"new"}); }
  function openEdit(item) { setForm({...item}); setModal({mode:"edit"}); }
  function saveFin() {
    if (!form.descricao?.trim()||!form.valor||!form.vencimento) return;
    const item={...form,valor:parseFloat(form.valor)};
    if (modal.mode==="new") setFinanceiro(f=>[...f,{...item,id:Date.now()}]);
    else setFinanceiro(f=>f.map(x=>x.id===item.id?item:x));
    setModal(null);
  }
  function toggleStatus(id) { setFinanceiro(f=>f.map(x=>x.id===id?{...x,status:x.status==="pago"?"pendente":"pago"}:x)); }
  function del(id) { setFinanceiro(f=>f.filter(x=>x.id!==id)); setConfirmDel(null); setModal(null); }
  function statusColor(item) {
    if (item.status==="pago") return {bg:"#f0f7f2",color:"#72816A",label:"Pago"};
    if (item.vencimento<today) return {bg:"#fef2f2",color:"#ef4444",label:"Vencido"};
    return {bg:"#fffbeb",color:"#d97706",label:"Pendente"};
  }
  const mesLabel=(()=>{ const [y,m]=filtroMes.split("-"); return `${MONTH_NAMES[parseInt(m)-1]} ${y}`; })();

  return (
    <div style={{ padding:"32px 32px", maxWidth:1100 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:24, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ fontSize:24, fontWeight:800, color:"#1a2010" }}>Financeiro</h2>
          <div style={{ fontSize:14, color:"#596850" }}>Contas a pagar e a receber · {mesLabel}</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={()=>openNew("receber")} style={{ background:"#72816A", color:"#fff", border:"none", borderRadius:12, padding:"11px 20px", fontSize:13, fontWeight:700, cursor:"pointer", boxShadow:"0 4px 12px rgba(74,124,89,.3)" }}>+ A Receber</button>
          <button onClick={()=>openNew("pagar")} style={{ background:"#ef4444", color:"#fff", border:"none", borderRadius:12, padding:"11px 20px", fontSize:13, fontWeight:700, cursor:"pointer", boxShadow:"0 4px 12px rgba(239,68,68,.3)" }}>+ A Pagar</button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:14, marginBottom:24 }}>
        {[
          {label:"A Receber",val:totalRec,sub:`Recebido: R$ ${totalRecPago.toLocaleString("pt-BR",{minimumFractionDigits:2})}`,color:"#72816A",bg:"#f0f7f2",border:"#b8e6c8"},
          {label:"A Pagar",val:totalPag,sub:`Pago: R$ ${totalPagPago.toLocaleString("pt-BR",{minimumFractionDigits:2})}`,color:"#ef4444",bg:"#fef2f2",border:"#fecaca"},
          {label:"Saldo líquido",val:saldo,sub:"Recebido menos pago",color:saldo>=0?"#72816A":"#ef4444",bg:"#F0EAE0",border:"#C8B8A0"},
        ].map(c=>(
          <div key={c.label} style={{ background:c.bg, border:`1.5px solid ${c.border}`, borderRadius:16, padding:"22px 24px" }}>
            <div style={{ fontSize:11, color:"#8a9a7a", fontWeight:700, textTransform:"uppercase", letterSpacing:.8, marginBottom:6 }}>{c.label}</div>
            <div style={{ fontSize:26, fontWeight:800, color:c.color }}>R$ {c.val.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
            <div style={{ fontSize:12, color:"#8a9a7a", marginTop:4 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap", alignItems:"center" }}>
        <input type="month" value={filtroMes} onChange={e=>setFiltroMes(e.target.value)}
          style={{ border:"1.5px solid #C8B8A0", borderRadius:9, padding:"8px 12px", fontSize:13, background:"#fff", fontFamily:"'Outfit',sans-serif" }} />
        {[["todos","Todos"],["receber","A Receber"],["pagar","A Pagar"]].map(([v,l])=>(
          <button key={v} onClick={()=>setFiltroTipo(v)}
            style={{ padding:"8px 16px", borderRadius:9, fontSize:12, fontWeight:600, border:"1.5px solid #C8B8A0", cursor:"pointer", background:filtroTipo===v?"#1a2010":"#fff", color:filtroTipo===v?"#fff":"#596850", fontFamily:"'Outfit',sans-serif" }}>{l}</button>
        ))}
        {["todos","pendente","pago"].map(v=>(
          <button key={v} onClick={()=>setFiltroStatus(v)}
            style={{ padding:"8px 16px", borderRadius:9, fontSize:12, fontWeight:600, border:"1.5px solid #C8B8A0", cursor:"pointer", background:filtroStatus===v?"#3a4a2c":"#fff", color:filtroStatus===v?"#fff":"#596850", fontFamily:"'Outfit',sans-serif" }}>
            {v==="todos"?"Todos status":v==="pago"?"✅ Pago":"⏳ Pendente"}
          </button>
        ))}
      </div>

      {lista.length===0 ? (
        <div style={{ textAlign:"center", padding:"60px 0", color:"#8a9a7a" }}><div style={{ fontSize:40 }}>💰</div><div style={{ fontSize:14, marginTop:8 }}>Nenhum lançamento encontrado</div></div>
      ) : (
        <div style={{ background:"#fff", borderRadius:16, border:"1px solid #C8B8A0", overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,.05)" }}>
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead><tr style={{ background:"#FBF7F2" }}>
              {["Tipo","Descrição","Categoria","Vencimento","Valor","Status",""].map(h=>(
                <th key={h} style={{ padding:"12px 14px", textAlign:"left", fontSize:11, color:"#8a9a7a", fontWeight:700, textTransform:"uppercase", letterSpacing:.8, borderBottom:"1px solid #C8B8A0" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {lista.map(item=>{ const s=statusColor(item); return (
                <tr key={item.id} style={{ borderBottom:"1px solid #EDE4D8" }}>
                  <td style={{ padding:"11px 14px" }}>
                    <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:6, background:item.tipo==="receber"?"#f0f7f2":"#fef2f2", color:item.tipo==="receber"?"#72816A":"#ef4444" }}>
                      {item.tipo==="receber"?"↓ Receber":"↑ Pagar"}
                    </span>
                  </td>
                  <td style={{ padding:"11px 14px", fontSize:13, fontWeight:600, color:"#1a2010" }}>{item.descricao}</td>
                  <td style={{ padding:"11px 14px", fontSize:12, color:"#596850" }}>{item.categoria}</td>
                  <td style={{ padding:"11px 14px", fontSize:12, fontFamily:"'JetBrains Mono',monospace", color:item.vencimento<today&&item.status!=="pago"?"#ef4444":"#3a4a2c" }}>
                    {item.vencimento.split("-").reverse().join("/")}
                  </td>
                  <td style={{ padding:"11px 14px", fontSize:13, fontWeight:800, color:item.tipo==="receber"?"#72816A":"#ef4444" }}>
                    R$ {parseFloat(item.valor).toLocaleString("pt-BR",{minimumFractionDigits:2})}
                  </td>
                  <td style={{ padding:"11px 14px" }}>
                    <button onClick={()=>toggleStatus(item.id)} style={{ fontSize:11, fontWeight:700, padding:"4px 10px", borderRadius:7, border:"none", cursor:"pointer", background:s.bg, color:s.color, fontFamily:"'Outfit',sans-serif" }}>{s.label}</button>
                  </td>
                  <td style={{ padding:"11px 14px" }}>
                    <button onClick={()=>openEdit(item)} style={{ background:"#EDE4D8", border:"none", borderRadius:7, padding:"5px 12px", fontSize:11, cursor:"pointer", color:"#3a4a2c", fontFamily:"'Outfit',sans-serif", fontWeight:600 }}>✏️ Editar</button>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ModalOverlay onClose={()=>setModal(null)}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
            <div style={{ fontSize:18, fontWeight:800, color:"#1a2010" }}>{modal.mode==="new"?(form.tipo==="receber"?"Nova Conta a Receber":"Nova Conta a Pagar"):"Editar Lançamento"}</div>
            <button onClick={()=>setModal(null)} style={{ fontSize:22, color:"#8a9a7a", background:"transparent", border:"none", cursor:"pointer" }}>×</button>
          </div>
          {confirmDel ? (
            <div style={{ textAlign:"center", padding:"20px 0" }}>
              <div style={{ fontSize:14, marginBottom:20, color:"#1a2010" }}>Excluir este lançamento?</div>
              <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
                <button onClick={()=>setConfirmDel(null)} style={{ padding:"10px 22px", borderRadius:10, background:"#EDE4D8", border:"none", cursor:"pointer", fontWeight:700, fontFamily:"'Outfit',sans-serif" }}>Cancelar</button>
                <button onClick={()=>del(form.id)} style={{ padding:"10px 22px", borderRadius:10, background:"#ef4444", color:"#fff", border:"none", cursor:"pointer", fontWeight:700, fontFamily:"'Outfit',sans-serif" }}>Excluir</button>
              </div>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:13 }}>
              <div>
                <FormLabel>Tipo</FormLabel>
                <div style={{ display:"flex", gap:8 }}>
                  {[["receber","↓ A Receber"],["pagar","↑ A Pagar"]].map(([v,l])=>(
                    <button key={v} onClick={()=>setForm(f=>({...f,tipo:v,categoria:v==="receber"?FIN_CATS_REC[0]:FIN_CATS_PAG[0]}))}
                      style={{ flex:1, padding:"9px", borderRadius:9, border:"none", cursor:"pointer", fontWeight:700, fontSize:13, fontFamily:"'Outfit',sans-serif",
                        background:form.tipo===v?(v==="receber"?"#72816A":"#ef4444"):"#EDE4D8", color:form.tipo===v?"#fff":"#3a4a2c" }}>{l}</button>
                  ))}
                </div>
              </div>
              <div><FormLabel>Descrição *</FormLabel><input value={form.descricao||""} onChange={e=>setForm(f=>({...f,descricao:e.target.value}))} placeholder="Ex: Aluguel sala julho" style={fmInput} /></div>
              <div><FormLabel>Categoria</FormLabel>
                <select value={form.categoria||""} onChange={e=>setForm(f=>({...f,categoria:e.target.value}))} style={fmInput}>
                  {(form.tipo==="receber"?FIN_CATS_REC:FIN_CATS_PAG).map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <div style={{ display:"flex", gap:12 }}>
                <div style={{ flex:1 }}><FormLabel>Valor (R$) *</FormLabel><input type="number" value={form.valor||""} onChange={e=>setForm(f=>({...f,valor:e.target.value}))} placeholder="0,00" style={fmInput} /></div>
                <div style={{ flex:1 }}><FormLabel>Vencimento *</FormLabel><input type="date" value={form.vencimento||""} onChange={e=>setForm(f=>({...f,vencimento:e.target.value}))} style={fmInput} /></div>
              </div>
              <div>
                <FormLabel>Status</FormLabel>
                <div style={{ display:"flex", gap:8 }}>
                  {[["pendente","⏳ Pendente"],["pago","✅ Pago"]].map(([v,l])=>(
                    <button key={v} onClick={()=>setForm(f=>({...f,status:v}))}
                      style={{ flex:1, padding:"9px", borderRadius:9, border:"none", cursor:"pointer", fontWeight:700, fontSize:13, fontFamily:"'Outfit',sans-serif", background:form.status===v?"#1a2010":"#EDE4D8", color:form.status===v?"#fff":"#3a4a2c" }}>{l}</button>
                  ))}
                </div>
              </div>
              <div><FormLabel>Observação</FormLabel><textarea value={form.obs||""} onChange={e=>setForm(f=>({...f,obs:e.target.value}))} rows={2} style={{ ...fmInput, resize:"none" }} /></div>
              <div style={{ display:"flex", gap:8, marginTop:4 }}>
                {modal.mode==="edit" && <button onClick={()=>setConfirmDel(true)} style={{ padding:"10px 16px", borderRadius:9, background:"#fef2f2", color:"#ef4444", border:"1.5px solid #fecaca", fontWeight:700, fontSize:12, cursor:"pointer", fontFamily:"'Outfit',sans-serif" }}>🗑 Excluir</button>}
                <button onClick={saveFin} disabled={!form.descricao?.trim()||!form.valor||!form.vencimento}
                  style={{ marginLeft:"auto", padding:"11px 26px", borderRadius:10, border:"none", fontWeight:700, fontSize:13, cursor:"pointer", fontFamily:"'Outfit',sans-serif",
                    background:form.descricao?.trim()&&form.valor&&form.vencimento?"linear-gradient(135deg,#2d3c20,#72816A)":"#EDE4D8",
                    color:form.descricao?.trim()&&form.valor&&form.vencimento?"#fff":"#8a9a7a" }}>Salvar</button>
              </div>
            </div>
          )}
        </ModalOverlay>
      )}
    </div>
  );
}

// ─── Change Password ──────────────────────────────────────────────────────────
function ChangePasswordSection() {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState(""); const [n1, setN1] = useState(""); const [n2, setN2] = useState(""); const [newUser, setNewUser] = useState("");
  const [msg, setMsg] = useState(null);
  function savePass() {
    const creds=load(STORAGE_KEYS.credentials,{user:"admin",pass:"geresala123"});
    if (cur!==creds.pass) { setMsg({ok:false,text:"Senha atual incorreta."}); return; }
    if (n1.length<4) { setMsg({ok:false,text:"Nova senha deve ter no mínimo 4 caracteres."}); return; }
    if (n1!==n2) { setMsg({ok:false,text:"As novas senhas não coincidem."}); return; }
    const user=newUser.trim()||creds.user;
    localStorage.setItem(STORAGE_KEYS.credentials,JSON.stringify({user,pass:n1}));
    setMsg({ok:true,text:"Acesso atualizado com sucesso!"}); setCur(""); setN1(""); setN2(""); setNewUser("");
    setTimeout(()=>{ setMsg(null); setOpen(false); },2000);
  }
  return (
    <div style={{ background:"#fff", borderRadius:16, border:"1px solid #C8B8A0", padding:24, maxWidth:480, boxShadow:"0 1px 4px rgba(0,0,0,.04)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
        <div>
          <div style={{ fontSize:15, fontWeight:700, color:"#1a2010" }}>🔒 Acesso ao sistema</div>
          <div style={{ fontSize:12, color:"#8a9a7a", marginTop:2 }}>Altere usuário e senha de login</div>
        </div>
        <button onClick={()=>{ setOpen(o=>!o); setMsg(null); }}
          style={{ background:"#EDE4D8", border:"1.5px solid #C8B8A0", borderRadius:9, padding:"8px 16px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'Outfit',sans-serif", color:"#3a4a2c" }}>
          {open?"Cancelar":"Alterar"}
        </button>
      </div>
      {open && (
        <div style={{ marginTop:20, display:"flex", flexDirection:"column", gap:12 }}>
          {[["Novo usuário (opcional)",newUser,setNewUser,"text","Deixe em branco para manter"],["Senha atual *",cur,setCur,"password",""],["Nova senha *",n1,setN1,"password","Mínimo 4 caracteres"],["Confirmar nova senha *",n2,setN2,"password",""]].map(([label,val,set,type,hint])=>(
            <div key={label}>
              <div style={{ fontSize:11, fontWeight:700, color:"#8a9a7a", marginBottom:5, textTransform:"uppercase", letterSpacing:.8 }}>{label}</div>
              <input type={type} value={val} onChange={e=>{ set(e.target.value); setMsg(null); }} placeholder={hint} style={{ width:"100%", boxSizing:"border-box", border:"1.5px solid #C8B8A0", borderRadius:9, padding:"10px 13px", fontSize:13, fontFamily:"'Outfit',sans-serif" }} />
            </div>
          ))}
          {msg && <div style={{ fontSize:12, padding:"9px 13px", borderRadius:8, background:msg.ok?"#f0f7f2":"#fef2f2", color:msg.ok?"#72816A":"#ef4444", fontWeight:600 }}>{msg.ok?"✅":"⚠️"} {msg.text}</div>}
          <button onClick={savePass} style={{ background:"linear-gradient(135deg,#1a2010,#2d3c20)", color:"#fff", border:"none", borderRadius:10, padding:"12px", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'Outfit',sans-serif" }}>Salvar acesso</button>
        </div>
      )}
    </div>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────
function ModalOverlay({ children, onClose, small }) {
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.6)", display:"flex", alignItems:"flex-start", justifyContent:"center", zIndex:200, overflowY:"auto", padding:"32px 16px" }}>
      <div onClick={e=>e.stopPropagation()}
        style={{ background:"#fff", borderRadius:20, padding:28, width:small?330:480, maxWidth:"100%", boxShadow:"0 24px 60px rgba(0,0,0,.2)", border:"1px solid #C8B8A0", animation:"fadeUp .2s ease", margin:"auto" }}>
        {children}
      </div>
    </div>
  );
}

function FormLabel({ children }) {
  return <label style={{ fontSize:11, color:"#8a9a7a", display:"block", marginBottom:5, textTransform:"uppercase", letterSpacing:.9, fontFamily:"'JetBrains Mono',monospace", fontWeight:600 }}>{children}</label>;
}

const labelSt = { fontSize:11, fontWeight:700, color:"#596850", marginBottom:5, textTransform:"uppercase", letterSpacing:.8 };
const inputSt = { width:"100%", boxSizing:"border-box", border:"1.5px solid #C8B8A0", borderRadius:10, padding:"12px 14px", fontSize:14, outline:"none", fontFamily:"'Outfit',sans-serif", color:"#1a2010", background:"#fff" };
const fmInput = { width:"100%", border:"1.5px solid #C8B8A0", borderRadius:9, padding:"10px 13px", fontSize:13, color:"#1a2010", background:"#FBF7F2", display:"block", fontFamily:"'Outfit',sans-serif", outline:"none" };
const sectionLabel = { fontSize:10, color:"#8a9a7a", textTransform:"uppercase", letterSpacing:1.2, marginBottom:8, fontFamily:"'JetBrains Mono',monospace", fontWeight:700 };
