import { useState, useEffect, useCallback } from "react";

// ─── Storage helpers ──────────────────────────────────────────────────────────
const STORAGE_KEYS = {
  bookings: "salas_bookings",
  professionals: "salas_professionals",
  rooms: "salas_rooms",
  prices: "salas_prices",
};
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_ROOMS = [
  { id: 1, name: "Sala 01", color: "#16A34A" },
  { id: 2, name: "Sala 02", color: "#2563EB" },
];
const HOURS = Array.from({ length: 14 }, (_, i) => `${String(i + 7).padStart(2, "0")}:00`);
const DURATIONS = [1, 2, 3, 4];
const SPECIALTIES = ["Psicólogo(a)", "Terapeuta", "Advogado(a)", "Consultor(a)", "Médico(a)", "Dentista", "Coach", "Nutricionista", "Fisioterapeuta", "Outro"];
const STATUSES = [
  { value: "confirmed", label: "Confirmado", color: "#16a34a", bg: "#dcfce7" },
  { value: "pending",   label: "Pendente",   color: "#d97706", bg: "#fef3c7" },
  { value: "waitlist",  label: "Lista de espera", color: "#7c3aed", bg: "#ede9fe" },
];
const WEEKDAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTH_NAMES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

// ─── Date helpers ─────────────────────────────────────────────────────────────
function toKey(date) { return typeof date === "string" ? date : date.toISOString().split("T")[0]; }
function getWeekStart(d) {
  const dt = new Date(d); const day = dt.getDay();
  dt.setDate(dt.getDate() - (day === 0 ? 6 : day - 1)); return dt;
}
function addDays(d, n) { const dt = new Date(d); dt.setDate(dt.getDate() + n); return dt; }
// Full week: Mon–Sun (7 days)
function getWeekDays(base) {
  const s = getWeekStart(base);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}
function formatBR(d) {
  const dt = new Date(d + "T12:00:00");
  return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(d) { return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`; }
function hourToIndex(h) { return HOURS.indexOf(h); }

// ─── WhatsApp ─────────────────────────────────────────────────────────────────
function openWhatsApp(phone, name, roomName, date, hour) {
  const clean = phone.replace(/\D/g, "");
  const full = clean.startsWith("55") ? clean : "55" + clean;
  const msg = encodeURIComponent(`Olá ${name}! ✅ Sua reserva foi confirmada:\n📍 ${roomName}\n📅 ${date} às ${hour}\nQualquer dúvida, entre em contato. Obrigado!`);
  window.open(`https://wa.me/${full}?text=${msg}`, "_blank");
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
function exportCSV(rows, month, year) {
  const header = ["Data", "Horário", "Duração (h)", "Sala", "Profissional", "Especialidade", "Status", "Valor"];
  const lines = [header.join(";"), ...rows.map(r =>
    [formatBR(r.day), r.hour, r.duration ?? 1, r.room, r.name, r.type, r.statusLabel || "—", `R$ ${r.price}`].join(";")
  )];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url;
  a.download = `relatorio_${MONTH_NAMES[month]}_${year}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [rooms, setRooms] = useState(() => load(STORAGE_KEYS.rooms, DEFAULT_ROOMS));
  const [bookings, setBookings] = useState(() => load(STORAGE_KEYS.bookings, {}));
  const [professionals, setProfessionals] = useState(() => load(STORAGE_KEYS.professionals, []));
  const [prices, setPrices] = useState(() => load(STORAGE_KEYS.prices, { 1: 80, 2: 80 }));

  const [tab, setTab] = useState("agenda");
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

  const weekDays = getWeekDays(currentDate);

  useEffect(() => { save(STORAGE_KEYS.bookings, bookings); }, [bookings]);
  useEffect(() => { save(STORAGE_KEYS.professionals, professionals); }, [professionals]);
  useEffect(() => { save(STORAGE_KEYS.rooms, rooms); }, [rooms]);
  useEffect(() => { save(STORAGE_KEYS.prices, prices); }, [prices]);

  const showToast = useCallback((msg, type = "ok") => {
    setToast({ msg, type }); setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Booking helpers ───────────────────────────────────────────────────────
  function bookingKey(day, roomId, hour) { return `${day}_${roomId}_${hour}`; }
  function getBooking(day, roomId, hour) { return bookings[bookingKey(day, roomId, hour)] || null; }

  // Returns the booking that occupies this slot (start or continuation of multi-hour)
  function getOccupyingBooking(day, roomId, hour) {
    const direct = getBooking(day, roomId, hour);
    if (direct) return { booking: direct, isStart: true };
    const idx = hourToIndex(hour);
    for (let i = idx - 1; i >= 0; i--) {
      const b = getBooking(day, roomId, HOURS[i]);
      if (b) {
        const dur = b.duration ?? 1;
        if (i + dur > idx) return { booking: b, isStart: false, startHour: HOURS[i] };
        break;
      }
    }
    return null;
  }

  function saveBooking() {
    if (!form.name?.trim()) return;
    const dur = form.duration ?? 1;
    const startIdx = hourToIndex(form.hour);
    for (let i = startIdx; i < startIdx + dur; i++) {
      const h = HOURS[i];
      if (!h) { showToast("Duração ultrapassa o horário disponível.", "err"); return; }
      const occ = getOccupyingBooking(form.day, form.roomId, h);
      if (occ && !(occ.isStart && form.hour === h)) {
        showToast(`Conflito no horário ${h}!`, "err"); return;
      }
    }
    if (modal?.existing) {
      const oldB = bookings[bookingKey(form.day, form.roomId, form.hour)];
      const oldDur = oldB?.duration ?? 1;
      if (oldDur !== dur) {
        setBookings(b => {
          const n = { ...b };
          for (let i = startIdx + 1; i < startIdx + oldDur; i++) {
            delete n[bookingKey(form.day, form.roomId, HOURS[i])];
          }
          return n;
        });
      }
    }
    const key = bookingKey(form.day, form.roomId, form.hour);
    setBookings(b => ({
      ...b,
      [key]: {
        name: form.name.trim(),
        type: form.type || SPECIALTIES[0],
        phone: form.phone || "",
        profId: form.profId || null,
        notes: form.notes || "",
        duration: dur,
        status: form.status || "confirmed",
      },
    }));
    setModal(null);
    showToast("Reserva salva!");
  }

  function deleteBooking(day, roomId, hour) {
    const b = getBooking(day, roomId, hour);
    const dur = b?.duration ?? 1;
    const startIdx = hourToIndex(hour);
    setBookings(prev => {
      const n = { ...prev };
      for (let i = startIdx; i < startIdx + dur; i++) {
        delete n[bookingKey(day, roomId, HOURS[i])];
      }
      return n;
    });
    setConfirmDel(null); setModal(null);
    showToast("Reserva cancelada.", "err");
  }

  // ── Professional helpers ──────────────────────────────────────────────────
  function saveProfessional() {
    if (!form.name?.trim()) return;
    if (form.id) {
      setProfessionals(p => p.map(x => x.id === form.id ? { ...form } : x));
    } else {
      setProfessionals(p => [...p, { ...form, id: Date.now() }]);
    }
    setModal(null); showToast("Profissional salvo!");
  }

  function deleteProfessional(id) {
    setProfessionals(p => p.filter(x => x.id !== id));
    setConfirmDel(null); setModal(null);
    showToast("Profissional removido.", "err");
  }

  // ── Room helpers ──────────────────────────────────────────────────────────
  function saveRoom() {
    if (!form.name?.trim()) return;
    if (form.id) {
      setRooms(r => r.map(x => x.id === form.id ? { ...form } : x));
    } else {
      const newId = Date.now();
      setRooms(r => [...r, { ...form, id: newId }]);
      setPrices(p => ({ ...p, [newId]: 80 }));
    }
    setModal(null); showToast("Sala salva!");
  }

  // ── Report data ───────────────────────────────────────────────────────────
  const reportData = (() => {
    const rows = [];
    Object.entries(bookings).forEach(([key, b]) => {
      const [day, roomId, hour] = key.split("_");
      const dt = new Date(day + "T12:00:00");
      if (dt.getMonth() !== reportMonth || dt.getFullYear() !== reportYear) return;
      // skip continuation slots — only count the start slot
      const startIdx = hourToIndex(hour);
      for (let i = startIdx - 1; i >= 0; i--) {
        if (getBooking(day, parseInt(roomId), HOURS[i])) return;
      }
      const room = rooms.find(r => r.id === parseInt(roomId));
      const dur = b.duration ?? 1;
      const price = (prices[roomId] || 0) * dur;
      const statusObj = STATUSES.find(s => s.value === (b.status || "confirmed"));
      rows.push({ day, roomId: parseInt(roomId), hour, name: b.name, type: b.type, phone: b.phone, room: room?.name || "?", price, color: room?.color || "#888", duration: dur, status: b.status || "confirmed", statusLabel: statusObj?.label || "Confirmado" });
    });
    rows.sort((a, b) => (a.day + a.hour) < (b.day + b.hour) ? -1 : 1);
    const filteredRows = reportProfFilter
      ? rows.filter(r => r.name.toLowerCase().includes(reportProfFilter.toLowerCase()))
      : rows;
    const filteredTotal = filteredRows.reduce((sum, r) => sum + r.price, 0);
    const byRoom = {};
    rooms.forEach(r => { byRoom[r.id] = { name: r.name, color: r.color, count: 0, revenue: 0 }; });
    filteredRows.forEach(r => { if (byRoom[r.roomId]) { byRoom[r.roomId].count++; byRoom[r.roomId].revenue += r.price; } });
    return { rows: filteredRows, total: filteredTotal, byRoom };
  })();

  const reportProfNames = [...new Set(Object.values(bookings).map(b => b.name))].sort();

  // ── Render helpers ────────────────────────────────────────────────────────
  const todayKey = toKey(new Date());
  const todayBookings = Object.entries(bookings).filter(([k]) => k.startsWith(todayKey));
  const totalSlots = rooms.length * HOURS.length;
  const todayReserved = todayBookings.length;

  function openBookingModal(day, roomId, hour, existing) {
    if (!existing) {
      const occ = getOccupyingBooking(day, roomId, hour);
      if (occ && !occ.isStart) {
        openBookingModal(day, roomId, occ.startHour, bookings[bookingKey(day, roomId, occ.startHour)]);
        return;
      }
    }
    setForm(existing
      ? { ...existing, day, roomId, hour }
      : { day, roomId, hour, name: "", type: SPECIALTIES[0], phone: "", profId: null, notes: "", duration: 1, status: "confirmed" }
    );
    setModal({ type: "booking", existing: !!existing });
  }

  const displayDays = viewMode === "week"
    ? weekDays
    : [weekDays.find(d => toKey(d) === selectedDay) || new Date(selectedDay + "T12:00:00")];

  const filteredProfessionals = professionals.filter(p =>
    p.name.toLowerCase().includes(profSearch.toLowerCase()) ||
    (p.specialty || "").toLowerCase().includes(profSearch.toLowerCase())
  );

  // ─── UI ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#F5F3EE", fontFamily: "'Outfit', sans-serif", color: "#1a1a1a" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:5px;height:5px;}
        ::-webkit-scrollbar-track{background:#ede9e0;}
        ::-webkit-scrollbar-thumb{background:#c5bfb3;border-radius:3px;}
        .btn{cursor:pointer;border:none;transition:all .15s;font-family:'Outfit',sans-serif;}
        .btn:hover{filter:brightness(.93);}
        .btn:active{transform:scale(.97);}
        .slot{cursor:pointer;transition:all .15s;}
        .slot:hover{background:#ede9e0 !important;}
        .slot-cont{cursor:pointer;transition:background .15s;}
        .tab{cursor:pointer;transition:all .15s;border:none;background:transparent;font-family:'Outfit',sans-serif;}
        .nav-btn{cursor:pointer;border:none;background:transparent;transition:all .15s;font-family:'Outfit',sans-serif;}
        .nav-btn:hover{background:#ede9e0;border-radius:6px;}
        input,select,textarea{font-family:'Outfit',sans-serif;outline:none;}
        input:focus,select:focus,textarea:focus{border-color:#1a1a1a !important;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes toastIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .fade-up{animation:fadeUp .2s ease}
        .toast-anim{animation:toastIn .2s ease}
        tr:hover td{background:#f5f1e8 !important;}
        .day-pill:hover{background:#e8e3d8 !important;}
        .prof-card:hover{border-color:#c5bfb3 !important;box-shadow:0 2px 12px rgba(0,0,0,.06);}
      `}</style>

      {/* ── TOP NAV ── */}
      <div style={{ background: "#fff", borderBottom: "1.5px solid #e5e0d6", padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 58, position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 34, height: 34, background: "#1a1a1a", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🏢</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-.3px" }}>GereSala</div>
            <div style={{ fontSize: 10, color: "#999", fontFamily: "'JetBrains Mono', monospace" }}>Sublocação Profissional</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 2 }}>
          {[["agenda", "📅 Agenda"], ["profissionais", "👤 Profissionais"], ["relatorio", "📊 Relatório"], ["configuracoes", "⚙️ Salas"]].map(([id, label]) => (
            <button key={id} className="tab" onClick={() => setTab(id)}
              style={{ padding: "7px 14px", borderRadius: 8, fontSize: 13, fontWeight: tab === id ? 600 : 400, background: tab === id ? "#1a1a1a" : "transparent", color: tab === id ? "#fff" : "#666" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════ AGENDA ══════════════════════ */}
      {tab === "agenda" && (
        <div style={{ display: "flex", height: "calc(100vh - 58px)" }}>
          {/* Sidebar */}
          <div style={{ width: 210, background: "#fff", borderRight: "1.5px solid #e5e0d6", padding: 20, display: "flex", flexDirection: "column", gap: 20, overflowY: "auto", flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8, fontFamily: "'JetBrains Mono',monospace" }}>Hoje</div>
              <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1 }}>{todayReserved}</div>
              <div style={{ fontSize: 12, color: "#aaa", marginTop: 2 }}>de {totalSlots} horários</div>
              <div style={{ marginTop: 8, background: "#eee", borderRadius: 4, height: 5 }}>
                <div style={{ width: `${Math.round((todayReserved / totalSlots) * 100)}%`, height: "100%", background: "#16A34A", borderRadius: 4, transition: "width .4s" }} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8, fontFamily: "'JetBrains Mono',monospace" }}>Salas</div>
              {rooms.map(r => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 0" }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: r.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "#555" }}>{r.name}</span>
                  <span style={{ marginLeft: "auto", fontSize: 11, fontFamily: "'JetBrains Mono',monospace", color: "#bbb" }}>R${prices[r.id] || 0}/h</span>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#aaa", textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 8, fontFamily: "'JetBrains Mono',monospace" }}>Reservas hoje</div>
              {todayBookings.length === 0 && <div style={{ fontSize: 12, color: "#ccc" }}>Nenhuma</div>}
              {todayBookings.sort((a, b) => a[0] < b[0] ? -1 : 1).slice(0, 8).map(([key, b]) => {
                const [, roomId, hour] = key.split("_");
                const room = rooms.find(r => r.id === parseInt(roomId));
                const statusObj = STATUSES.find(s => s.value === (b.status || "confirmed"));
                return (
                  <div key={key} style={{ marginBottom: 10, cursor: "pointer" }} onClick={() => { setTab("agenda"); openBookingModal(todayKey, parseInt(roomId), hour, b); }}>
                    <div style={{ fontSize: 10, fontFamily: "'JetBrains Mono',monospace", color: room?.color || "#888" }}>{hour} · {room?.name}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>{b.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                      <span style={{ fontSize: 10, color: "#aaa" }}>{b.type}</span>
                      {b.duration > 1 && <span style={{ fontSize: 10, color: "#888", background: "#f0ede6", padding: "0 4px", borderRadius: 3 }}>{b.duration}h</span>}
                      {statusObj && <span style={{ fontSize: 10, color: statusObj.color, background: statusObj.bg, padding: "0 4px", borderRadius: 3 }}>{statusObj.label}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Grid */}
          <div style={{ flex: 1, overflowX: "auto", overflowY: "auto", display: "flex", flexDirection: "column" }}>
            {/* Toolbar */}
            <div style={{ background: "#fff", borderBottom: "1.5px solid #e5e0d6", padding: "10px 20px", display: "flex", gap: 8, alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
              <button className="btn" onClick={() => { setCurrentDate(new Date()); setSelectedDay(toKey(new Date())); }}
                style={{ background: "#f0ede6", padding: "6px 13px", borderRadius: 7, fontSize: 12, fontWeight: 500 }}>Hoje</button>
              <button className="nav-btn btn" onClick={() => setCurrentDate(addDays(currentDate, -7))} style={{ padding: "6px 10px", borderRadius: 7, fontSize: 14 }}>‹</button>
              <button className="nav-btn btn" onClick={() => setCurrentDate(addDays(currentDate, 7))} style={{ padding: "6px 10px", borderRadius: 7, fontSize: 14 }}>›</button>
              <span style={{ fontSize: 13, color: "#777", fontFamily: "'JetBrains Mono',monospace", marginLeft: 4 }}>{monthLabel(weekDays[0])}</span>
              <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                {[["day", "Dia"], ["week", "Semana"]].map(([v, l]) => (
                  <button key={v} className="btn" onClick={() => setViewMode(v)}
                    style={{ background: viewMode === v ? "#1a1a1a" : "#f0ede6", color: viewMode === v ? "#fff" : "#555", padding: "6px 13px", borderRadius: 7, fontSize: 12, fontWeight: 500 }}>{l}</button>
                ))}
              </div>
            </div>

            {/* Day tabs – full week Mon–Sun */}
            <div style={{ display: "flex", background: "#faf9f6", borderBottom: "1.5px solid #e5e0d6", flexShrink: 0 }}>
              <div style={{ width: 56, flexShrink: 0, borderRight: "1px solid #e5e0d6" }} />
              {weekDays.map(d => {
                const ds = toKey(d);
                const isSel = ds === selectedDay;
                const isToday = ds === todayKey;
                const dayBookings = Object.keys(bookings).filter(k => k.startsWith(ds)).length;
                return (
                  <div key={ds} className="day-pill" onClick={() => { setSelectedDay(ds); setViewMode("day"); }}
                    style={{ flex: 1, padding: "8px 6px", textAlign: "center", borderRight: "1px solid #e5e0d6", cursor: "pointer", background: isSel ? "#1a1a1a" : "transparent", minWidth: 70, transition: "all .15s" }}>
                    <div style={{ fontSize: 10, color: isSel ? "#aaa" : "#bbb", textTransform: "capitalize", fontFamily: "'JetBrains Mono',monospace" }}>{WEEKDAY_NAMES[d.getDay()]}</div>
                    <div style={{ fontSize: 15, fontWeight: isToday ? 700 : 500, color: isSel ? "#fff" : isToday ? "#1a1a1a" : "#888", marginTop: 1 }}>{formatBR(ds)}</div>
                    {dayBookings > 0 && <div style={{ fontSize: 10, color: isSel ? "#aaa" : "#16A34A", fontWeight: 600 }}>{dayBookings}</div>}
                  </div>
                );
              })}
            </div>

            {/* Room headers */}
            <div style={{ display: "flex", background: "#faf9f6", borderBottom: "1.5px solid #e5e0d6", flexShrink: 0, position: "sticky", top: 0, zIndex: 5 }}>
              <div style={{ width: 56, flexShrink: 0, borderRight: "1px solid #e5e0d6" }} />
              {rooms.map(r => (
                <div key={r.id} style={{ flex: 1, padding: "8px 12px", borderRight: "1px solid #e5e0d6", display: "flex", alignItems: "center", gap: 6, minWidth: viewMode === "week" ? 80 : 140 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: r.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#333" }}>{r.name}</span>
                </div>
              ))}
            </div>

            {/* Slots */}
            <div style={{ overflowY: "auto" }}>
              {displayDays.map(day => {
                const ds = toKey(day);
                return (
                  <div key={ds}>
                    {viewMode === "week" && (
                      <div style={{ padding: "5px 14px", fontSize: 11, color: "#bbb", background: "#f5f3ef", borderBottom: "1px solid #ede9e0", fontFamily: "'JetBrains Mono',monospace", fontWeight: 500 }}>
                        {WEEKDAY_NAMES[day.getDay()]} {formatBR(ds)}
                      </div>
                    )}
                    {HOURS.map(hour => (
                      <div key={hour} style={{ display: "flex", borderBottom: "1px solid #ede9e0" }}>
                        <div style={{ width: 56, flexShrink: 0, padding: "10px 6px", borderRight: "1px solid #ede9e0", fontSize: 11, color: "#ccc", fontFamily: "'JetBrains Mono',monospace", textAlign: "center", background: "#faf9f6" }}>{hour}</div>
                        {rooms.map(room => {
                          const b = getBooking(ds, room.id, hour);
                          const occ = !b ? getOccupyingBooking(ds, room.id, hour) : null;
                          const isCont = occ && !occ.isStart;
                          const statusObj = b ? STATUSES.find(s => s.value === (b.status || "confirmed")) : null;

                          if (isCont) {
                            return (
                              <div key={room.id} className="slot-cont"
                                onClick={() => openBookingModal(ds, room.id, occ.startHour, bookings[bookingKey(ds, room.id, occ.startHour)])}
                                style={{ flex: 1, minWidth: viewMode === "week" ? 80 : 140, padding: "6px 10px", borderRight: "1px solid #ede9e0", background: `${room.color}0d`, borderLeft: `3px solid ${room.color}44` }}>
                                <div style={{ width: "60%", height: 2, background: `${room.color}44`, borderRadius: 2, margin: "auto" }} />
                              </div>
                            );
                          }

                          return (
                            <div key={room.id} className="slot" onClick={() => openBookingModal(ds, room.id, hour, b)}
                              style={{ flex: 1, minWidth: viewMode === "week" ? 80 : 140, padding: "8px 10px", borderRight: "1px solid #ede9e0", background: b ? `${room.color}14` : "#fff", borderLeft: b ? `3px solid ${room.color}` : "3px solid transparent" }}>
                              {b ? (
                                <div>
                                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 4 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{b.name}</div>
                                    {b.duration > 1 && <span style={{ fontSize: 10, background: room.color, color: "#fff", padding: "1px 5px", borderRadius: 3, flexShrink: 0 }}>{b.duration}h</span>}
                                  </div>
                                  <div style={{ fontSize: 10, color: room.color, fontWeight: 500 }}>{b.type}</div>
                                  {statusObj && statusObj.value !== "confirmed" && (
                                    <div style={{ fontSize: 10, color: statusObj.color, background: statusObj.bg, display: "inline-block", padding: "1px 5px", borderRadius: 3, marginTop: 2 }}>{statusObj.label}</div>
                                  )}
                                  {b.phone && <div style={{ fontSize: 10, color: "#aaa", fontFamily: "'JetBrains Mono',monospace" }}>{b.phone}</div>}
                                </div>
                              ) : (
                                <div style={{ fontSize: 11, color: "#ddd", textAlign: "center", lineHeight: "22px" }}>+</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════ PROFISSIONAIS ══════════════════════ */}
      {tab === "profissionais" && (
        <div style={{ maxWidth: 900, margin: "32px auto", padding: "0 24px" }} className="fade-up">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700 }}>Profissionais</h2>
              <div style={{ fontSize: 13, color: "#aaa" }}>{professionals.length} cadastrado{professionals.length !== 1 ? "s" : ""}</div>
            </div>
            <button className="btn" onClick={() => { setForm({ name: "", specialty: SPECIALTIES[0], phone: "", email: "", notes: "" }); setModal({ type: "prof" }); }}
              style={{ background: "#1a1a1a", color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600 }}>
              + Novo Profissional
            </button>
          </div>

          {/* Search */}
          <div style={{ marginBottom: 20 }}>
            <input value={profSearch} onChange={e => setProfSearch(e.target.value)} placeholder="🔍  Buscar por nome ou especialidade..."
              style={{ width: "100%", border: "1.5px solid #e5e0d6", borderRadius: 10, padding: "10px 14px", fontSize: 13, background: "#fff", color: "#1a1a1a" }} />
          </div>

          {filteredProfessionals.length === 0 && (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#ccc" }}>
              <div style={{ fontSize: 40 }}>👤</div>
              <div style={{ fontSize: 14, marginTop: 8 }}>{profSearch ? "Nenhum resultado encontrado" : "Nenhum profissional cadastrado"}</div>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
            {filteredProfessionals.map(p => (
              <div key={p.id} className="prof-card" style={{ background: "#fff", borderRadius: 14, padding: 20, border: "1.5px solid #e5e0d6", cursor: "pointer", transition: "all .15s" }}
                onClick={() => { setForm({ ...p }); setModal({ type: "prof", existing: true }); }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                    {p.specialty === "Psicólogo(a)" || p.specialty === "Terapeuta" ? "🧠" :
                      p.specialty === "Advogado(a)" || p.specialty === "Consultor(a)" ? "⚖️" :
                        p.specialty === "Médico(a)" || p.specialty === "Dentista" ? "🩺" : "💼"}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: "#aaa" }}>{p.specialty}</div>
                  </div>
                </div>
                {p.phone && <div style={{ fontSize: 12, color: "#888", fontFamily: "'JetBrains Mono',monospace", marginBottom: 4 }}>📱 {p.phone}</div>}
                {p.email && <div style={{ fontSize: 12, color: "#888", marginBottom: 4 }}>✉️ {p.email}</div>}
                {p.notes && <div style={{ fontSize: 11, color: "#bbb", marginTop: 8, borderTop: "1px solid #f0ede6", paddingTop: 8 }}>{p.notes}</div>}
                {p.phone && (
                  <button className="btn" onClick={e => { e.stopPropagation(); window.open(`https://wa.me/55${p.phone.replace(/\D/g, "")}`, "_blank"); }}
                    style={{ marginTop: 12, background: "#dcfce7", color: "#16a34a", padding: "6px 12px", borderRadius: 7, fontSize: 11, fontWeight: 600, width: "100%" }}>
                    💬 Abrir WhatsApp
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════ RELATÓRIO ══════════════════════ */}
      {tab === "relatorio" && (
        <div style={{ maxWidth: 1000, margin: "32px auto", padding: "0 24px" }} className="fade-up">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700 }}>Relatório de Faturamento</h2>
              <div style={{ fontSize: 13, color: "#aaa" }}>{MONTH_NAMES[reportMonth]} {reportYear}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select value={reportMonth} onChange={e => setReportMonth(+e.target.value)}
                style={{ background: "#fff", border: "1.5px solid #e5e0d6", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#333" }}>
                {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <select value={reportYear} onChange={e => setReportYear(+e.target.value)}
                style={{ background: "#fff", border: "1.5px solid #e5e0d6", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#333" }}>
                {[2024, 2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
              </select>
              {reportData.rows.length > 0 && (
                <button className="btn" onClick={() => exportCSV(reportData.rows, reportMonth, reportYear)}
                  style={{ background: "#f0ede6", color: "#555", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600 }}>
                  ⬇ Exportar CSV
                </button>
              )}
            </div>
          </div>

          {/* Filtro por profissional */}
          <div style={{ marginBottom: 20, position: "relative", maxWidth: 360 }}>
            <input value={reportProfFilter} onChange={e => setReportProfFilter(e.target.value)} list="report-prof-names"
              placeholder="🔍  Buscar por profissional para ver valor no mês..."
              style={{ width: "100%", border: "1.5px solid #e5e0d6", borderRadius: 10, padding: "10px 14px", fontSize: 13, background: "#fff", color: "#1a1a1a" }} />
            <datalist id="report-prof-names">
              {reportProfNames.map(n => <option key={n} value={n} />)}
            </datalist>
            {reportProfFilter && (
              <div style={{ marginTop: 8, fontSize: 13, color: "#555" }}>
                Total de <strong>{reportProfFilter}</strong> em {MONTH_NAMES[reportMonth]}: <strong style={{ color: "#16a34a" }}>R$ {reportData.total.toLocaleString("pt-BR")}</strong> ({reportData.rows.length} reserva{reportData.rows.length !== 1 ? "s" : ""})
              </div>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, marginBottom: 28 }}>
            <div style={{ background: "#1a1a1a", color: "#fff", borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 11, color: "#777", textTransform: "uppercase", letterSpacing: 1, fontFamily: "'JetBrains Mono',monospace" }}>Total Mês</div>
              <div style={{ fontSize: 30, fontWeight: 700, marginTop: 6 }}>R$ {reportData.total.toLocaleString("pt-BR")}</div>
              <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{reportData.rows.length} reservas</div>
            </div>
            {rooms.map(r => {
              const rd = reportData.byRoom[r.id] || {};
              return (
                <div key={r.id} style={{ background: "#fff", border: "1.5px solid #e5e0d6", borderRadius: 14, padding: 20, borderTop: `4px solid ${r.color}` }}>
                  <div style={{ fontSize: 11, color: "#aaa", textTransform: "uppercase", letterSpacing: 1, fontFamily: "'JetBrains Mono',monospace" }}>{r.name}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, marginTop: 6 }}>R$ {(rd.revenue || 0).toLocaleString("pt-BR")}</div>
                  <div style={{ fontSize: 12, color: "#aaa", marginTop: 2 }}>{rd.count || 0} reservas</div>
                </div>
              );
            })}
          </div>

          {reportData.rows.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#ccc" }}>
              <div style={{ fontSize: 40 }}>📊</div>
              <div style={{ fontSize: 14, marginTop: 8 }}>Nenhuma reserva neste período</div>
            </div>
          ) : (
            <div style={{ background: "#fff", borderRadius: 14, border: "1.5px solid #e5e0d6", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "#faf9f6" }}>
                    {["Data", "Horário", "Dur.", "Sala", "Profissional", "Especialidade", "Status", "Valor"].map(h => (
                      <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: 11, color: "#aaa", fontWeight: 600, textTransform: "uppercase", letterSpacing: .8, borderBottom: "1.5px solid #e5e0d6", fontFamily: "'JetBrains Mono',monospace" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportData.rows.map((r, i) => {
                    const statusObj = STATUSES.find(s => s.value === r.status) || STATUSES[0];
                    return (
                      <tr key={i}>
                        <td style={{ padding: "10px 14px", fontSize: 13, borderBottom: "1px solid #f0ede6", fontFamily: "'JetBrains Mono',monospace", color: "#555" }}>{formatBR(r.day)}</td>
                        <td style={{ padding: "10px 14px", fontSize: 13, borderBottom: "1px solid #f0ede6", fontFamily: "'JetBrains Mono',monospace" }}>{r.hour}</td>
                        <td style={{ padding: "10px 14px", fontSize: 13, borderBottom: "1px solid #f0ede6", color: "#888", fontFamily: "'JetBrains Mono',monospace" }}>{r.duration}h</td>
                        <td style={{ padding: "10px 14px", fontSize: 13, borderBottom: "1px solid #f0ede6" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color, display: "inline-block", flexShrink: 0 }} />
                            {r.room}
                          </span>
                        </td>
                        <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 500, borderBottom: "1px solid #f0ede6" }}>{r.name}</td>
                        <td style={{ padding: "10px 14px", fontSize: 12, color: "#888", borderBottom: "1px solid #f0ede6" }}>{r.type}</td>
                        <td style={{ padding: "10px 14px", borderBottom: "1px solid #f0ede6" }}>
                          <span style={{ fontSize: 11, color: statusObj.color, background: statusObj.bg, padding: "2px 8px", borderRadius: 5, fontWeight: 600 }}>{statusObj.label}</span>
                        </td>
                        <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, color: "#16a34a", borderBottom: "1px solid #f0ede6" }}>R$ {r.price}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: "#faf9f6" }}>
                    <td colSpan={7} style={{ padding: "12px 14px", fontSize: 13, fontWeight: 700, textAlign: "right", borderTop: "1.5px solid #e5e0d6" }}>Total:</td>
                    <td style={{ padding: "12px 14px", fontSize: 15, fontWeight: 700, color: "#16a34a", borderTop: "1.5px solid #e5e0d6" }}>R$ {reportData.total.toLocaleString("pt-BR")}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════ CONFIGURAÇÕES ══════════════════════ */}
      {tab === "configuracoes" && (
        <div style={{ maxWidth: 800, margin: "32px auto", padding: "0 24px" }} className="fade-up">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700 }}>Configuração de Salas</h2>
              <div style={{ fontSize: 13, color: "#aaa" }}>Gerencie salas e preços por hora</div>
            </div>
            <button className="btn" onClick={() => { setForm({ name: "", color: "#16A34A" }); setModal({ type: "room" }); }}
              style={{ background: "#1a1a1a", color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600 }}>
              + Nova Sala
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 16 }}>
            {rooms.map(r => (
              <div key={r.id} style={{ background: "#fff", border: "1.5px solid #e5e0d6", borderRadius: 14, padding: 20, borderTop: `5px solid ${r.color}` }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{r.name}</div>
                <div style={{ fontSize: 12, color: "#aaa", marginBottom: 14 }}>Cor: <span style={{ background: r.color, padding: "1px 8px", borderRadius: 4, color: "#fff", fontSize: 11 }}>{r.color}</span></div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <span style={{ fontSize: 13, color: "#555" }}>R$/hora:</span>
                  <input type="number" value={prices[r.id] || 0} onChange={e => setPrices(p => ({ ...p, [r.id]: +e.target.value }))}
                    style={{ width: 80, border: "1.5px solid #e5e0d6", borderRadius: 7, padding: "5px 8px", fontSize: 14, fontWeight: 600, fontFamily: "'JetBrains Mono',monospace" }} />
                </div>
                <button className="btn" onClick={() => { setForm({ ...r }); setModal({ type: "room", existing: true }); }}
                  style={{ width: "100%", background: "#f5f3ee", padding: "8px", borderRadius: 8, fontSize: 12, fontWeight: 500 }}>
                  ✏️ Editar nome/cor
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════ MODAL RESERVA ══════════════════════ */}
      {modal?.type === "booking" && (
        <ModalOverlay onClose={() => setModal(null)}>
          <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 700 }}>{modal.existing ? "Editar Reserva" : "Nova Reserva"}</div>
              <div style={{ fontSize: 12, color: "#aaa", fontFamily: "'JetBrains Mono',monospace", marginTop: 3 }}>
                {rooms.find(r => r.id === form.roomId)?.name} · {form.hour} · {formatBR(form.day)}
              </div>
            </div>
            <button className="btn" onClick={() => setModal(null)} style={{ fontSize: 22, color: "#ccc", background: "transparent" }}>×</button>
          </div>

          {professionals.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <Label>Profissional cadastrado</Label>
              <select onChange={e => {
                const p = professionals.find(x => x.id === +e.target.value);
                if (p) setForm(f => ({ ...f, name: p.name, type: p.specialty, phone: p.phone || "", profId: p.id }));
              }} style={inputStyle}>
                <option value="">— Selecionar —</option>
                {professionals.map(p => <option key={p.id} value={p.id}>{p.name} ({p.specialty})</option>)}
              </select>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div><Label>Nome *</Label><input value={form.name || ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome do profissional" style={inputStyle} /></div>
            <div><Label>Especialidade</Label>
              <select value={form.type || SPECIALTIES[0]} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} style={inputStyle}>
                {SPECIALTIES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>

            {/* Duration selector */}
            <div>
              <Label>Duração</Label>
              <div style={{ display: "flex", gap: 6 }}>
                {DURATIONS.map(d => (
                  <button key={d} className="btn" onClick={() => setForm(f => ({ ...f, duration: d }))}
                    style={{ flex: 1, padding: "8px 0", borderRadius: 8, fontSize: 13, fontWeight: 600, background: (form.duration ?? 1) === d ? "#1a1a1a" : "#f0ede6", color: (form.duration ?? 1) === d ? "#fff" : "#555" }}>
                    {d}h
                  </button>
                ))}
              </div>
              {(form.duration ?? 1) > 1 && (
                <div style={{ fontSize: 11, color: "#aaa", marginTop: 5, fontFamily: "'JetBrains Mono',monospace" }}>
                  Valor total: R$ {((prices[form.roomId] || 0) * (form.duration ?? 1)).toLocaleString("pt-BR")}
                </div>
              )}
            </div>

            {/* Status selector */}
            <div>
              <Label>Status</Label>
              <div style={{ display: "flex", gap: 6 }}>
                {STATUSES.map(s => (
                  <button key={s.value} className="btn" onClick={() => setForm(f => ({ ...f, status: s.value }))}
                    style={{ flex: 1, padding: "7px 0", borderRadius: 8, fontSize: 11, fontWeight: 600, background: (form.status || "confirmed") === s.value ? s.color : s.bg, color: (form.status || "confirmed") === s.value ? "#fff" : s.color }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div><Label>Telefone / WhatsApp</Label><input value={form.phone || ""} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(11) 99999-9999" style={inputStyle} /></div>
            <div><Label>Observações</Label><textarea value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder="Anotações opcionais..." style={{ ...inputStyle, resize: "none" }} /></div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
            {modal.existing && (
              <>
                <button className="btn" onClick={() => setConfirmDel({ type: "booking", day: form.day, roomId: form.roomId, hour: form.hour })}
                  style={{ padding: "9px 14px", borderRadius: 8, background: "#fff0f0", color: "#dc2626", fontSize: 12, fontWeight: 600, border: "1.5px solid #fecaca" }}>
                  🗑 Cancelar reserva
                </button>
                {form.phone && (
                  <button className="btn" onClick={() => {
                    const room = rooms.find(r => r.id === form.roomId);
                    openWhatsApp(form.phone, form.name, room?.name, formatBR(form.day), form.hour);
                  }} style={{ padding: "9px 14px", borderRadius: 8, background: "#dcfce7", color: "#16a34a", fontSize: 12, fontWeight: 600, border: "1.5px solid #bbf7d0" }}>
                    💬 Confirmar via WhatsApp
                  </button>
                )}
              </>
            )}
            <button className="btn" onClick={saveBooking} disabled={!form.name?.trim()}
              style={{ marginLeft: "auto", padding: "10px 20px", borderRadius: 9, background: form.name?.trim() ? "#1a1a1a" : "#eee", color: form.name?.trim() ? "#fff" : "#aaa", fontSize: 13, fontWeight: 600 }}>
              {modal.existing ? "Salvar" : "Confirmar reserva"}
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* ══════════════════════ MODAL PROFISSIONAL ══════════════════════ */}
      {modal?.type === "prof" && (
        <ModalOverlay onClose={() => setModal(null)}>
          <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between" }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{modal.existing ? "Editar Profissional" : "Novo Profissional"}</div>
            <button className="btn" onClick={() => setModal(null)} style={{ fontSize: 22, color: "#ccc", background: "transparent" }}>×</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div><Label>Nome *</Label><input value={form.name || ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Nome completo" style={inputStyle} /></div>
            <div><Label>Especialidade</Label>
              <select value={form.specialty || SPECIALTIES[0]} onChange={e => setForm(f => ({ ...f, specialty: e.target.value }))} style={inputStyle}>
                {SPECIALTIES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div><Label>Telefone / WhatsApp</Label><input value={form.phone || ""} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(11) 99999-9999" style={inputStyle} /></div>
            <div><Label>E-mail</Label><input value={form.email || ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@exemplo.com" style={inputStyle} /></div>
            <div><Label>Observações</Label><textarea value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: "none" }} /></div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            {modal.existing && (
              <button className="btn" onClick={() => setConfirmDel({ type: "prof", id: form.id })}
                style={{ padding: "9px 14px", borderRadius: 8, background: "#fff0f0", color: "#dc2626", fontSize: 12, fontWeight: 600, border: "1.5px solid #fecaca" }}>
                🗑 Remover
              </button>
            )}
            <button className="btn" onClick={saveProfessional} disabled={!form.name?.trim()}
              style={{ marginLeft: "auto", padding: "10px 20px", borderRadius: 9, background: form.name?.trim() ? "#1a1a1a" : "#eee", color: form.name?.trim() ? "#fff" : "#aaa", fontSize: 13, fontWeight: 600 }}>
              Salvar
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* ══════════════════════ MODAL SALA ══════════════════════ */}
      {modal?.type === "room" && (
        <ModalOverlay onClose={() => setModal(null)}>
          <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between" }}>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{modal.existing ? "Editar Sala" : "Nova Sala"}</div>
            <button className="btn" onClick={() => setModal(null)} style={{ fontSize: 22, color: "#ccc", background: "transparent" }}>×</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div><Label>Nome da sala *</Label><input value={form.name || ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Sala 05" style={inputStyle} /></div>
            <div>
              <Label>Cor de identificação</Label>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 4 }}>
                <input type="color" value={form.color || "#16A34A"} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                  style={{ width: 48, height: 36, border: "1.5px solid #e5e0d6", borderRadius: 8, cursor: "pointer", padding: 2 }} />
                <span style={{ fontSize: 12, color: "#aaa", fontFamily: "'JetBrains Mono',monospace" }}>{form.color}</span>
                <div style={{ width: 24, height: 24, borderRadius: 6, background: form.color || "#16A34A" }} />
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            {modal.existing && (
              <button className="btn" onClick={() => { setRooms(r => r.filter(x => x.id !== form.id)); setModal(null); showToast("Sala removida.", "err"); }}
                style={{ padding: "9px 14px", borderRadius: 8, background: "#fff0f0", color: "#dc2626", fontSize: 12, fontWeight: 600, border: "1.5px solid #fecaca" }}>
                🗑 Remover
              </button>
            )}
            <button className="btn" onClick={saveRoom} disabled={!form.name?.trim()}
              style={{ marginLeft: "auto", padding: "10px 20px", borderRadius: 9, background: form.name?.trim() ? "#1a1a1a" : "#eee", color: form.name?.trim() ? "#fff" : "#aaa", fontSize: 13, fontWeight: 600 }}>
              Salvar
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* Confirm delete */}
      {confirmDel && (
        <ModalOverlay onClose={() => setConfirmDel(null)} small>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Confirmar exclusão?</div>
            <div style={{ fontSize: 13, color: "#aaa", marginBottom: 20 }}>Esta ação não pode ser desfeita.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={() => setConfirmDel(null)} style={{ flex: 1, padding: 10, borderRadius: 8, background: "#f5f3ee", fontSize: 13 }}>Cancelar</button>
              <button className="btn" onClick={() => {
                if (confirmDel.type === "booking") deleteBooking(confirmDel.day, confirmDel.roomId, confirmDel.hour);
                else if (confirmDel.type === "prof") deleteProfessional(confirmDel.id);
              }} style={{ flex: 1, padding: 10, borderRadius: 8, background: "#dc2626", color: "#fff", fontSize: 13, fontWeight: 600 }}>Confirmar</button>
            </div>
          </div>
        </ModalOverlay>
      )}

      {/* Toast */}
      {toast && (
        <div className="toast-anim" style={{
          position: "fixed", bottom: 24, right: 24,
          background: toast.type === "err" ? "#fff0f0" : "#f0fdf4",
          border: `1.5px solid ${toast.type === "err" ? "#fca5a5" : "#86efac"}`,
          color: toast.type === "err" ? "#dc2626" : "#16a34a",
          padding: "11px 18px", borderRadius: 10, fontSize: 13, fontWeight: 600, zIndex: 999, boxShadow: "0 4px 20px rgba(0,0,0,.1)"
        }}>
          {toast.type === "err" ? "✕ " : "✓ "}{toast.msg}
        </div>
      )}
    </div>
  );
}

function ModalOverlay({ children, onClose, small }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}>
      <div className="fade-up" onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 18, padding: 28, width: small ? 320 : 440, maxWidth: "100%", boxShadow: "0 20px 60px rgba(0,0,0,.18)", border: "1.5px solid #e5e0d6" }}>
        {children}
      </div>
    </div>
  );
}

function Label({ children }) {
  return <label style={{ fontSize: 11, color: "#aaa", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: .9, fontFamily: "'JetBrains Mono',monospace" }}>{children}</label>;
}

const inputStyle = { width: "100%", border: "1.5px solid #e5e0d6", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#1a1a1a", background: "#faf9f6", display: "block" };
