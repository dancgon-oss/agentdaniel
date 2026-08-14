import { useState, useEffect, useCallback } from "react";

// ─── Storage helpers ──────────────────────────────────────────────────────────
const STORAGE_KEYS = {
  clientes: "dist_clientes",
  produtos: "dist_produtos",
  pedidos: "dist_pedidos",
  fornecedores: "dist_fornecedores",
  compras: "dist_compras",
  financeiro: "dist_financeiro",
  credentials: "dist_credentials",
  empresa: "dist_empresa",
};
function load(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch { return fallback; }
}
function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* storage unavailable */ } }

// ─── Constants ────────────────────────────────────────────────────────────────
const CATEGORIAS = ["Alimentos", "Bebidas", "Limpeza", "Higiene/Perfumaria", "Papelaria", "Eletrônicos", "Outros"];
const UNIDADES = ["UN", "CX", "PCT", "KG", "L", "DZ", "FD"];
const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MONTH_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

const PEDIDO_STATUS = [
  { value: "orcamento", label: "Orçamento", color: "#7c3aed", bg: "#ede9fe" },
  { value: "pedido", label: "Pedido Confirmado", color: "#d97706", bg: "#fef3c7" },
  { value: "faturado", label: "Faturado", color: "#16a34a", bg: "#dcfce7" },
  { value: "cancelado", label: "Cancelado", color: "#dc2626", bg: "#fff0f0" },
];
const COMPRA_STATUS = [
  { value: "pendente", label: "Pendente", color: "#d97706", bg: "#fef3c7" },
  { value: "recebido", label: "Recebido", color: "#16a34a", bg: "#dcfce7" },
  { value: "cancelado", label: "Cancelado", color: "#dc2626", bg: "#fff0f0" },
];
const FIN_CATS_REC = ["Venda de mercadorias", "Outros recebimentos"];
const FIN_CATS_PAG = ["Compra de mercadorias", "Fretes/Logística", "Salários/Comissões", "Aluguel", "Energia/Água", "Impostos/Taxas", "Outros"];

// ─── Seed data ────────────────────────────────────────────────────────────────
const DEFAULT_PRODUTOS = [
  { id: 1, codigo: "1001", nome: "Arroz Branco Tipo 1 5kg", categoria: "Alimentos", unidade: "UN", precoCusto: 18.5, precoVenda: 24.9, estoque: 120, estoqueMinimo: 30, obs: "" },
  { id: 2, codigo: "1002", nome: "Óleo de Soja 900ml", categoria: "Alimentos", unidade: "UN", precoCusto: 6.2, precoVenda: 8.9, estoque: 200, estoqueMinimo: 50, obs: "" },
  { id: 3, codigo: "2001", nome: "Refrigerante Cola 2L", categoria: "Bebidas", unidade: "UN", precoCusto: 5.8, precoVenda: 7.9, estoque: 15, estoqueMinimo: 40, obs: "" },
  { id: 4, codigo: "3001", nome: "Detergente Neutro 500ml", categoria: "Limpeza", unidade: "UN", precoCusto: 2.1, precoVenda: 3.5, estoque: 300, estoqueMinimo: 80, obs: "" },
  { id: 5, codigo: "4001", nome: "Papel Higiênico 12 rolos", categoria: "Higiene/Perfumaria", unidade: "PCT", precoCusto: 14.0, precoVenda: 19.9, estoque: 8, estoqueMinimo: 20, obs: "" },
];
const DEFAULT_CLIENTES = [
  { id: 1, razaoSocial: "Mercearia Bom Preço Ltda", nomeFantasia: "Bom Preço", cnpjCpf: "12.345.678/0001-90", telefone: "(11) 98888-1111", email: "contato@bompreco.com", cidade: "São Paulo", uf: "SP", endereco: "Rua das Flores, 123", limiteCredito: 5000, obs: "" },
  { id: 2, razaoSocial: "Supermercado Dois Irmãos ME", nomeFantasia: "Dois Irmãos", cnpjCpf: "98.765.432/0001-10", telefone: "(11) 97777-2222", email: "financeiro@doisirmaos.com", cidade: "Guarulhos", uf: "SP", endereco: "Av. Central, 500", limiteCredito: 8000, obs: "" },
];
const DEFAULT_FORNECEDORES = [
  { id: 1, razaoSocial: "Distribuidora Atacadão Central Ltda", cnpj: "11.222.333/0001-44", telefone: "(11) 3333-4444", email: "vendas@atacadaocentral.com", contato: "Carlos Mendes", obs: "" },
];

// ─── Format helpers ───────────────────────────────────────────────────────────
function fmtBRL(v) { return `R$ ${(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtDateBR(iso) { return iso ? iso.split("-").reverse().join("/") : "—"; }
function todayISO() { return new Date().toISOString().split("T")[0]; }
function monthKeyOf(iso) { return (iso || "").slice(0, 7); }
function nextNumero(list, prefix) {
  const nums = list.map(x => parseInt((x.numero || "").split("-")[1] || "0", 10));
  const max = nums.length ? Math.max(...nums) : 0;
  return `${prefix}-${String(max + 1).padStart(4, "0")}`;
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────
const inputStyle = { width: "100%", boxSizing: "border-box", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#0f172a", background: "#f8fafc", display: "block" };
const thStyle = { padding: "11px 14px", textAlign: "left", fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: .8, borderBottom: "1.5px solid #e2e8f0", fontFamily: "'JetBrains Mono',monospace", whiteSpace: "nowrap" };
const tdStyle = { padding: "10px 14px", fontSize: 13, borderBottom: "1px solid #f1f5f9" };
const cardBox = { background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 14 };

function Label({ children }) {
  return <label style={{ fontSize: 11, color: "#94a3b8", display: "block", marginBottom: 5, textTransform: "uppercase", letterSpacing: .9, fontFamily: "'JetBrains Mono',monospace" }}>{children}</label>;
}
function Field({ label, children }) { return <div><Label>{label}</Label>{children}</div>; }

function ModalOverlay({ children, onClose, small, wide }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16, overflowY: "auto" }}>
      <div className="fade-up" onClick={e => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 18, padding: 28, width: small ? 340 : wide ? 640 : 460, maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.22)", border: "1.5px solid #e2e8f0" }}>
        {children}
      </div>
    </div>
  );
}
function ModalHeader({ title, sub, onClose }) {
  return (
    <div style={{ marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
      <div>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "'JetBrains Mono',monospace", marginTop: 3 }}>{sub}</div>}
      </div>
      <button className="btn" onClick={onClose} style={{ fontSize: 22, color: "#cbd5e1", background: "transparent" }}>×</button>
    </div>
  );
}
function StatusBadge({ value, list }) {
  const s = list.find(x => x.value === value) || list[0];
  return <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 6, background: s.bg, color: s.color, whiteSpace: "nowrap" }}>{s.label}</span>;
}
function EmptyState({ icon = "📭", text }) {
  return <div style={{ textAlign: "center", padding: "60px 0", color: "#cbd5e1" }}><div style={{ fontSize: 40 }}>{icon}</div><div style={{ fontSize: 14, marginTop: 8, color: "#94a3b8" }}>{text}</div></div>;
}
function StatCard({ label, value, sub, color = "#2563EB", bg = "#eff6ff", border = "#bfdbfe" }) {
  return (
    <div style={{ background: bg, border: `1.5px solid ${border}`, borderRadius: 14, padding: "18px 20px" }}>
      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: .8, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
function PageHeader({ title, sub, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>{title}</h2>
        <div style={{ fontSize: 13, color: "#94a3b8" }}>{sub}</div>
      </div>
      {action}
    </div>
  );
}
function PrimaryButton({ children, onClick, disabled, color = "#2563EB" }) {
  return (
    <button className="btn" onClick={onClick} disabled={disabled}
      style={{ background: disabled ? "#e2e8f0" : color, color: disabled ? "#94a3b8" : "#fff", border: "none", borderRadius: 10, padding: "10px 18px", fontSize: 13, fontWeight: 600, cursor: disabled ? "default" : "pointer" }}>
      {children}
    </button>
  );
}

// ─── Items builder (used by Pedidos and Compras) ─────────────────────────────
function ItemsBuilder({ produtos, itens, setItens, priceField }) {
  const [prodId, setProdId] = useState("");
  const [qtd, setQtd] = useState(1);
  const [preco, setPreco] = useState("");

  function addItem() {
    if (!prodId || !qtd || qtd <= 0) return;
    const p = produtos.find(x => x.id === +prodId);
    if (!p) return;
    const precoUnit = preco !== "" ? parseFloat(preco) : (p[priceField] || 0);
    setItens(list => [...list, { produtoId: +prodId, qtd: +qtd, precoUnit }]);
    setProdId(""); setQtd(1); setPreco("");
  }
  function removeItem(idx) { setItens(list => list.filter((_, i) => i !== idx)); }

  const total = itens.reduce((s, it) => s + it.qtd * it.precoUnit, 0);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ flex: "2 1 180px" }}>
          <Label>Produto</Label>
          <select value={prodId} onChange={e => { setProdId(e.target.value); setPreco(""); }} style={inputStyle}>
            <option value="">— Selecionar —</option>
            {produtos.map(p => <option key={p.id} value={p.id}>{p.codigo} · {p.nome}</option>)}
          </select>
        </div>
        <div style={{ flex: "0 1 80px" }}>
          <Label>Qtd</Label>
          <input type="number" min="1" value={qtd} onChange={e => setQtd(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ flex: "0 1 110px" }}>
          <Label>Preço unit.</Label>
          <input type="number" step="0.01" value={preco} onChange={e => setPreco(e.target.value)}
            placeholder={prodId ? String(produtos.find(x => x.id === +prodId)?.[priceField] ?? "") : "0,00"} style={inputStyle} />
        </div>
        <button className="btn" onClick={addItem} disabled={!prodId}
          style={{ padding: "9px 16px", borderRadius: 8, background: prodId ? "#1e293b" : "#e2e8f0", color: prodId ? "#fff" : "#94a3b8", fontSize: 13, fontWeight: 600, border: "none", height: 37 }}>
          + Adicionar
        </button>
      </div>

      {itens.length === 0 ? (
        <div style={{ fontSize: 12, color: "#cbd5e1", padding: "16px 0", textAlign: "center", border: "1.5px dashed #e2e8f0", borderRadius: 10 }}>Nenhum item adicionado</div>
      ) : (
        <div style={{ border: "1.5px solid #e2e8f0", borderRadius: 10, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {itens.map((it, idx) => {
                const p = produtos.find(x => x.id === it.produtoId);
                return (
                  <tr key={idx} style={{ borderBottom: idx < itens.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                    <td style={{ padding: "8px 12px", fontSize: 12.5 }}>{p?.nome || "?"}</td>
                    <td style={{ padding: "8px 12px", fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>{it.qtd} {p?.unidade}</td>
                    <td style={{ padding: "8px 12px", fontSize: 12, color: "#94a3b8", whiteSpace: "nowrap" }}>{fmtBRL(it.precoUnit)}</td>
                    <td style={{ padding: "8px 12px", fontSize: 12.5, fontWeight: 700, whiteSpace: "nowrap" }}>{fmtBRL(it.qtd * it.precoUnit)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right" }}>
                      <button className="btn" onClick={() => removeItem(idx)} style={{ background: "transparent", color: "#dc2626", fontSize: 13 }}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ textAlign: "right", marginTop: 10, fontSize: 14, fontWeight: 700 }}>
        Total: <span style={{ fontFamily: "'JetBrains Mono',monospace" }}>{fmtBRL(total)}</span>
      </div>
    </div>
  );
}

// ─── Change password ──────────────────────────────────────────────────────────
function ChangePasswordSection() {
  const [open, setOpen] = useState(false);
  const [cur, setCur] = useState(""); const [n1, setN1] = useState(""); const [n2, setN2] = useState("");
  const [newUser, setNewUser] = useState("");
  const [msg, setMsg] = useState(null);

  function saveCreds() {
    const creds = load(STORAGE_KEYS.credentials, { user: "admin", pass: "distri123" });
    if (cur !== creds.pass) { setMsg({ ok: false, text: "Senha atual incorreta." }); return; }
    if (n1.length < 4) { setMsg({ ok: false, text: "Nova senha deve ter no mínimo 4 caracteres." }); return; }
    if (n1 !== n2) { setMsg({ ok: false, text: "As novas senhas não coincidem." }); return; }
    const user = newUser.trim() || creds.user;
    localStorage.setItem(STORAGE_KEYS.credentials, JSON.stringify({ user, pass: n1 }));
    setMsg({ ok: true, text: "Acesso atualizado com sucesso!" });
    setCur(""); setN1(""); setN2(""); setNewUser("");
    setTimeout(() => { setMsg(null); setOpen(false); }, 2000);
  }

  return (
    <div style={{ ...cardBox, padding: 24, maxWidth: 480 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700 }}>🔒 Acesso ao sistema</div>
          <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 2 }}>Altere usuário e senha de login</div>
        </div>
        <button onClick={() => { setOpen(o => !o); setMsg(null); }}
          style={{ background: "#f1f5f9", border: "1.5px solid #e2e8f0", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
          {open ? "Cancelar" : "Alterar"}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 12 }}>
          {[["Novo usuário (opcional)", newUser, setNewUser, "text", "Deixe em branco para manter o atual"],
            ["Senha atual *", cur, setCur, "password", ""],
            ["Nova senha *", n1, setN1, "password", "Mínimo 4 caracteres"],
            ["Confirmar nova senha *", n2, setN2, "password", ""]
          ].map(([label, val, set, type, hint]) => (
            <Field key={label} label={label}>
              <input type={type} value={val} onChange={e => { set(e.target.value); setMsg(null); }} placeholder={hint} style={inputStyle} />
            </Field>
          ))}
          {msg && <div style={{ fontSize: 12, padding: "8px 12px", borderRadius: 7, background: msg.ok ? "#f0fdf4" : "#fff0f0", color: msg.ok ? "#16a34a" : "#dc2626" }}>{msg.ok ? "✅" : "⚠️"} {msg.text}</div>}
          <button onClick={saveCreds} style={{ background: "#1e293b", color: "#fff", border: "none", borderRadius: 9, padding: "11px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Salvar acesso</button>
        </div>
      )}
    </div>
  );
}

// ─── Login screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [show, setShow] = useState(false);

  function attempt() {
    const creds = load(STORAGE_KEYS.credentials, { user: "admin", pass: "distri123" });
    if (user.trim() === creds.user && pass === creds.pass) onLogin();
    else { setErr("Usuário ou senha incorretos."); setPass(""); }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 18, padding: "44px 40px", width: 360, boxShadow: "0 8px 40px #0004" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 32 }}>
          <div style={{ width: 40, height: 40, background: "#2563EB", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📦</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>DistriFlow</div>
            <div style={{ fontSize: 11, color: "#94a3b8" }}>Gestão para Distribuidoras</div>
          </div>
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 20, color: "#334155" }}>Acesso ao sistema</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Usuário">
            <input value={user} onChange={e => { setUser(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && attempt()}
              placeholder="Digite seu usuário" autoFocus style={inputStyle} />
          </Field>
          <Field label="Senha">
            <div style={{ position: "relative" }}>
              <input value={pass} onChange={e => { setPass(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && attempt()}
                type={show ? "text" : "password"} placeholder="Digite sua senha"
                style={{ ...inputStyle, padding: "9px 40px 9px 12px", borderColor: err ? "#dc2626" : "#e2e8f0" }} />
              <button onClick={() => setShow(s => !s)} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 15, color: "#94a3b8" }}>{show ? "🙈" : "👁"}</button>
            </div>
          </Field>
          {err && <div style={{ fontSize: 12, color: "#dc2626", background: "#fff0f0", padding: "8px 12px", borderRadius: 7 }}>⚠️ {err}</div>}
          <button onClick={attempt} disabled={!user.trim() || !pass}
            style={{ background: user.trim() && pass ? "#2563EB" : "#eee", color: user.trim() && pass ? "#fff" : "#aaa", border: "none", borderRadius: 10, padding: "13px", fontSize: 14, fontWeight: 700, cursor: user.trim() && pass ? "pointer" : "default", marginTop: 4 }}>
            Entrar
          </button>
        </div>
        <div style={{ marginTop: 20, fontSize: 11, color: "#cbd5e1", textAlign: "center" }}>
          Usuário padrão: <b>admin</b> · Senha: <b>distri123</b>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════ DASHBOARD ═══════════════════════════════════════
function DashboardTab({ clientes, produtos, pedidos, financeiro }) {
  const now = new Date();
  const curMonth = monthKeyOf(todayISO());
  const faturados = pedidos.filter(p => p.status === "faturado");
  const faturamentoMes = faturados.filter(p => monthKeyOf(p.data) === curMonth).reduce((s, p) => s + pedidoTotal(p), 0);
  const pedidosAbertos = pedidos.filter(p => p.status === "orcamento" || p.status === "pedido").length;
  const in7 = new Date(now); in7.setDate(in7.getDate() + 7);
  const in7key = in7.toISOString().split("T")[0];
  const aVencer = financeiro.filter(f => f.status !== "pago" && f.vencimento >= todayISO() && f.vencimento <= in7key);
  const vencidas = financeiro.filter(f => f.status !== "pago" && f.vencimento < todayISO());
  const estoqueBaixo = produtos.filter(p => p.estoque <= p.estoqueMinimo);

  const last6 = Array.from({ length: 6 }, (_, i) => { const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1); return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: MONTH_SHORT[d.getMonth()] }; });
  const vendasPorMes = last6.map(m => ({ ...m, total: faturados.filter(p => monthKeyOf(p.data) === m.key).reduce((s, p) => s + pedidoTotal(p), 0) }));
  const maxVenda = Math.max(1, ...vendasPorMes.map(m => m.total));

  const ultimosPedidos = [...pedidos].sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id).slice(0, 5);

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 28px 40px" }}>
      <PageHeader title="Dashboard" sub={`Visão geral · ${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: 14, marginBottom: 24 }}>
        <StatCard label="Faturamento do mês" value={fmtBRL(faturamentoMes)} color="#16a34a" bg="#f0fdf4" border="#bbf7d0" sub={`${faturados.filter(p => monthKeyOf(p.data) === curMonth).length} pedidos faturados`} />
        <StatCard label="Pedidos em aberto" value={pedidosAbertos} color="#d97706" bg="#fffbeb" border="#fde68a" sub="orçamentos + confirmados" />
        <StatCard label="Contas a vencer (7 dias)" value={aVencer.length} color="#2563EB" bg="#eff6ff" border="#bfdbfe" sub={vencidas.length ? `${vencidas.length} já vencida(s)` : "nenhuma vencida"} />
        <StatCard label="Produtos com estoque baixo" value={estoqueBaixo.length} color="#dc2626" bg="#fff0f0" border="#fecaca" sub={`de ${produtos.length} produtos`} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16, marginBottom: 20 }}>
        <div style={{ ...cardBox, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Vendas faturadas — últimos 6 meses</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 140 }}>
            {vendasPorMes.map(m => (
              <div key={m.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "'JetBrains Mono',monospace" }}>{m.total > 0 ? fmtBRL(m.total).replace("R$ ", "") : ""}</div>
                <div style={{ width: "100%", maxWidth: 34, height: Math.max(4, (m.total / maxVenda) * 100), background: m.key === curMonth ? "#2563EB" : "#bfdbfe", borderRadius: "6px 6px 0 0" }} />
                <div style={{ fontSize: 11, color: "#94a3b8" }}>{m.label}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ ...cardBox, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Estoque baixo</div>
          {estoqueBaixo.length === 0 ? <div style={{ fontSize: 12, color: "#cbd5e1" }}>Tudo certo por aqui 👍</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {estoqueBaixo.slice(0, 6).map(p => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                  <span>{p.nome}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", color: "#dc2626", fontWeight: 700 }}>{p.estoque} {p.unidade}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ ...cardBox, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Últimos pedidos</div>
        {ultimosPedidos.length === 0 ? <EmptyState icon="🧾" text="Nenhum pedido lançado ainda" /> : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <tbody>
              {ultimosPedidos.map(p => (
                <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "8px 4px", fontSize: 12, fontFamily: "'JetBrains Mono',monospace", color: "#94a3b8" }}>{p.numero}</td>
                  <td style={{ padding: "8px 4px", fontSize: 13 }}>{clientes.find(c => c.id === p.clienteId)?.nomeFantasia || "?"}</td>
                  <td style={{ padding: "8px 4px", fontSize: 12, color: "#94a3b8" }}>{fmtDateBR(p.data)}</td>
                  <td style={{ padding: "8px 4px", fontSize: 13, fontWeight: 700 }}>{fmtBRL(pedidoTotal(p))}</td>
                  <td style={{ padding: "8px 4px" }}><StatusBadge value={p.status} list={PEDIDO_STATUS} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function pedidoTotal(p) { return Math.max(0, (p.itens || []).reduce((s, it) => s + it.qtd * it.precoUnit, 0) - (p.desconto || 0)); }
function compraTotal(c) { return (c.itens || []).reduce((s, it) => s + it.qtd * it.precoUnit, 0); }

// ═══════════════════════════ CLIENTES ════════════════════════════════════════
function ClientesTab({ clientes, setClientes, showToast }) {
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [confirmDel, setConfirmDel] = useState(null);

  const lista = clientes.filter(c =>
    c.razaoSocial.toLowerCase().includes(search.toLowerCase()) ||
    (c.nomeFantasia || "").toLowerCase().includes(search.toLowerCase()) ||
    (c.cnpjCpf || "").includes(search)
  );

  function openNew() { setForm({ razaoSocial: "", nomeFantasia: "", cnpjCpf: "", telefone: "", email: "", endereco: "", cidade: "", uf: "SP", limiteCredito: "", obs: "" }); setModal({ mode: "new" }); }
  function openEdit(c) { setForm({ ...c }); setModal({ mode: "edit" }); }
  function saveCliente() {
    if (!form.razaoSocial?.trim()) return;
    const item = { ...form, limiteCredito: parseFloat(form.limiteCredito) || 0 };
    if (modal.mode === "new") setClientes(l => [...l, { ...item, id: Date.now() }]);
    else setClientes(l => l.map(x => x.id === item.id ? item : x));
    setModal(null); showToast("Cliente salvo!");
  }
  function delCliente(id) { setClientes(l => l.filter(x => x.id !== id)); setConfirmDel(null); setModal(null); showToast("Cliente removido.", "err"); }

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 28px 40px" }}>
      <PageHeader title="Clientes" sub={`${clientes.length} cliente(s) cadastrado(s)`} action={<PrimaryButton onClick={openNew}>+ Novo Cliente</PrimaryButton>} />

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por razão social, nome fantasia ou CNPJ..."
        style={{ ...inputStyle, maxWidth: 380, marginBottom: 18 }} />

      {lista.length === 0 ? <EmptyState icon="👥" text="Nenhum cliente encontrado" /> : (
        <div style={{ ...cardBox, overflow: "hidden", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f8fafc" }}>{["Razão Social", "CNPJ/CPF", "Cidade/UF", "Telefone", "Limite Crédito", ""].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
            <tbody>
              {lista.map(c => (
                <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={tdStyle}><div style={{ fontWeight: 600 }}>{c.nomeFantasia || c.razaoSocial}</div><div style={{ fontSize: 11, color: "#94a3b8" }}>{c.razaoSocial}</div></td>
                  <td style={tdStyle}>{c.cnpjCpf || "—"}</td>
                  <td style={tdStyle}>{c.cidade ? `${c.cidade}/${c.uf}` : "—"}</td>
                  <td style={tdStyle}>{c.telefone || "—"}</td>
                  <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono',monospace" }}>{fmtBRL(c.limiteCredito)}</td>
                  <td style={tdStyle}><button className="btn" onClick={() => openEdit(c)} style={{ background: "#f1f5f9", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, color: "#334155" }}>✏️ Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ModalOverlay onClose={() => setModal(null)}>
          <ModalHeader title={modal.mode === "new" ? "Novo Cliente" : "Editar Cliente"} onClose={() => setModal(null)} />
          {confirmDel ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 14, marginBottom: 20 }}>Excluir este cliente?</div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button onClick={() => setConfirmDel(null)} style={{ padding: "9px 20px", borderRadius: 8, background: "#f1f5f9", border: "none", cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
                <button onClick={() => delCliente(form.id)} style={{ padding: "9px 20px", borderRadius: 8, background: "#dc2626", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600 }}>Excluir</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="Razão Social *"><input value={form.razaoSocial || ""} onChange={e => setForm(f => ({ ...f, razaoSocial: e.target.value }))} style={inputStyle} /></Field>
              <Field label="Nome Fantasia"><input value={form.nomeFantasia || ""} onChange={e => setForm(f => ({ ...f, nomeFantasia: e.target.value }))} style={inputStyle} /></Field>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}><Field label="CNPJ/CPF"><input value={form.cnpjCpf || ""} onChange={e => setForm(f => ({ ...f, cnpjCpf: e.target.value }))} style={inputStyle} /></Field></div>
                <div style={{ flex: 1 }}><Field label="Telefone"><input value={form.telefone || ""} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} style={inputStyle} /></Field></div>
              </div>
              <Field label="E-mail"><input value={form.email || ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inputStyle} /></Field>
              <Field label="Endereço"><input value={form.endereco || ""} onChange={e => setForm(f => ({ ...f, endereco: e.target.value }))} style={inputStyle} /></Field>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 2 }}><Field label="Cidade"><input value={form.cidade || ""} onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))} style={inputStyle} /></Field></div>
                <div style={{ flex: 1 }}><Field label="UF"><select value={form.uf || "SP"} onChange={e => setForm(f => ({ ...f, uf: e.target.value }))} style={inputStyle}>{UFS.map(u => <option key={u}>{u}</option>)}</select></Field></div>
              </div>
              <Field label="Limite de crédito (R$)"><input type="number" step="0.01" value={form.limiteCredito ?? ""} onChange={e => setForm(f => ({ ...f, limiteCredito: e.target.value }))} style={inputStyle} /></Field>
              <Field label="Observações"><textarea value={form.obs || ""} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} rows={2} style={{ ...inputStyle, resize: "none" }} /></Field>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {modal.mode === "edit" && <button onClick={() => setConfirmDel(true)} style={{ padding: "9px 14px", borderRadius: 8, background: "#fff0f0", color: "#dc2626", border: "1.5px solid #fecaca", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>🗑 Excluir</button>}
                <button onClick={saveCliente} disabled={!form.razaoSocial?.trim()}
                  style={{ marginLeft: "auto", padding: "10px 24px", borderRadius: 9, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", background: form.razaoSocial?.trim() ? "#2563EB" : "#eee", color: form.razaoSocial?.trim() ? "#fff" : "#aaa" }}>Salvar</button>
              </div>
            </div>
          )}
        </ModalOverlay>
      )}
    </div>
  );
}

// ═══════════════════════════ PRODUTOS ════════════════════════════════════════
function ProdutosTab({ produtos, setProdutos, showToast }) {
  const [search, setSearch] = useState("");
  const [catFiltro, setCatFiltro] = useState("todas");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [ajuste, setAjuste] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);

  const lista = produtos.filter(p =>
    (catFiltro === "todas" || p.categoria === catFiltro) &&
    (p.nome.toLowerCase().includes(search.toLowerCase()) || p.codigo.includes(search))
  );

  function openNew() { setForm({ codigo: "", nome: "", categoria: CATEGORIAS[0], unidade: UNIDADES[0], precoCusto: "", precoVenda: "", estoque: 0, estoqueMinimo: 10, obs: "" }); setModal({ mode: "new" }); }
  function openEdit(p) { setForm({ ...p }); setModal({ mode: "edit" }); }
  function saveProduto() {
    if (!form.nome?.trim() || !form.codigo?.trim()) return;
    const item = { ...form, precoCusto: parseFloat(form.precoCusto) || 0, precoVenda: parseFloat(form.precoVenda) || 0, estoque: parseFloat(form.estoque) || 0, estoqueMinimo: parseFloat(form.estoqueMinimo) || 0 };
    if (modal.mode === "new") setProdutos(l => [...l, { ...item, id: Date.now() }]);
    else setProdutos(l => l.map(x => x.id === item.id ? item : x));
    setModal(null); showToast("Produto salvo!");
  }
  function delProduto(id) { setProdutos(l => l.filter(x => x.id !== id)); setConfirmDel(null); setModal(null); showToast("Produto removido.", "err"); }

  function openAjuste(p) { setAjuste({ produtoId: p.id, tipo: "entrada", qtd: "", motivo: "" }); }
  function confirmAjuste() {
    if (!ajuste.qtd || +ajuste.qtd <= 0) return;
    const delta = ajuste.tipo === "entrada" ? +ajuste.qtd : -(+ajuste.qtd);
    setProdutos(l => l.map(p => p.id === ajuste.produtoId ? { ...p, estoque: Math.max(0, p.estoque + delta) } : p));
    setAjuste(null); showToast("Estoque ajustado!");
  }

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 28px 40px" }}>
      <PageHeader title="Produtos" sub={`${produtos.length} produto(s) no catálogo`} action={<PrimaryButton onClick={openNew}>+ Novo Produto</PrimaryButton>} />

      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome ou código..." style={{ ...inputStyle, maxWidth: 280 }} />
        <select value={catFiltro} onChange={e => setCatFiltro(e.target.value)} style={{ ...inputStyle, maxWidth: 200 }}>
          <option value="todas">Todas categorias</option>
          {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      {lista.length === 0 ? <EmptyState icon="📦" text="Nenhum produto encontrado" /> : (
        <div style={{ ...cardBox, overflow: "hidden", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f8fafc" }}>{["Código", "Produto", "Categoria", "Un.", "Custo", "Venda", "Estoque", ""].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
            <tbody>
              {lista.map(p => {
                const baixo = p.estoque <= p.estoqueMinimo;
                return (
                  <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono',monospace", color: "#94a3b8" }}>{p.codigo}</td>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{p.nome}</td>
                    <td style={tdStyle}>{p.categoria}</td>
                    <td style={tdStyle}>{p.unidade}</td>
                    <td style={{ ...tdStyle, color: "#94a3b8" }}>{fmtBRL(p.precoCusto)}</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtBRL(p.precoVenda)}</td>
                    <td style={tdStyle}>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: baixo ? "#dc2626" : "#16a34a", background: baixo ? "#fff0f0" : "#f0fdf4", padding: "2px 8px", borderRadius: 6, fontSize: 12 }}>
                        {p.estoque} {p.unidade}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                      <button className="btn" onClick={() => openAjuste(p)} style={{ background: "#eff6ff", color: "#2563EB", border: "none", borderRadius: 6, padding: "5px 9px", fontSize: 11, marginRight: 6 }}>📦 Ajustar</button>
                      <button className="btn" onClick={() => openEdit(p)} style={{ background: "#f1f5f9", border: "none", borderRadius: 6, padding: "5px 9px", fontSize: 11, color: "#334155" }}>✏️</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ModalOverlay onClose={() => setModal(null)}>
          <ModalHeader title={modal.mode === "new" ? "Novo Produto" : "Editar Produto"} onClose={() => setModal(null)} />
          {confirmDel ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 14, marginBottom: 20 }}>Excluir este produto?</div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button onClick={() => setConfirmDel(null)} style={{ padding: "9px 20px", borderRadius: 8, background: "#f1f5f9", border: "none", cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
                <button onClick={() => delProduto(form.id)} style={{ padding: "9px 20px", borderRadius: 8, background: "#dc2626", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600 }}>Excluir</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}><Field label="Código *"><input value={form.codigo || ""} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} style={inputStyle} /></Field></div>
                <div style={{ flex: 2 }}><Field label="Unidade"><select value={form.unidade || UNIDADES[0]} onChange={e => setForm(f => ({ ...f, unidade: e.target.value }))} style={inputStyle}>{UNIDADES.map(u => <option key={u}>{u}</option>)}</select></Field></div>
              </div>
              <Field label="Nome do produto *"><input value={form.nome || ""} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} style={inputStyle} /></Field>
              <Field label="Categoria"><select value={form.categoria || CATEGORIAS[0]} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} style={inputStyle}>{CATEGORIAS.map(c => <option key={c}>{c}</option>)}</select></Field>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}><Field label="Preço custo (R$)"><input type="number" step="0.01" value={form.precoCusto ?? ""} onChange={e => setForm(f => ({ ...f, precoCusto: e.target.value }))} style={inputStyle} /></Field></div>
                <div style={{ flex: 1 }}><Field label="Preço venda (R$)"><input type="number" step="0.01" value={form.precoVenda ?? ""} onChange={e => setForm(f => ({ ...f, precoVenda: e.target.value }))} style={inputStyle} /></Field></div>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}><Field label="Estoque atual"><input type="number" value={form.estoque ?? 0} onChange={e => setForm(f => ({ ...f, estoque: e.target.value }))} style={inputStyle} /></Field></div>
                <div style={{ flex: 1 }}><Field label="Estoque mínimo"><input type="number" value={form.estoqueMinimo ?? 0} onChange={e => setForm(f => ({ ...f, estoqueMinimo: e.target.value }))} style={inputStyle} /></Field></div>
              </div>
              <Field label="Observações"><textarea value={form.obs || ""} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} rows={2} style={{ ...inputStyle, resize: "none" }} /></Field>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {modal.mode === "edit" && <button onClick={() => setConfirmDel(true)} style={{ padding: "9px 14px", borderRadius: 8, background: "#fff0f0", color: "#dc2626", border: "1.5px solid #fecaca", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>🗑 Excluir</button>}
                <button onClick={saveProduto} disabled={!form.nome?.trim() || !form.codigo?.trim()}
                  style={{ marginLeft: "auto", padding: "10px 24px", borderRadius: 9, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", background: form.nome?.trim() && form.codigo?.trim() ? "#2563EB" : "#eee", color: form.nome?.trim() && form.codigo?.trim() ? "#fff" : "#aaa" }}>Salvar</button>
              </div>
            </div>
          )}
        </ModalOverlay>
      )}

      {ajuste && (
        <ModalOverlay onClose={() => setAjuste(null)} small>
          <ModalHeader title="Ajustar Estoque" sub={produtos.find(p => p.id === ajuste.produtoId)?.nome} onClose={() => setAjuste(null)} />
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 8 }}>
              {[["entrada", "↓ Entrada"], ["saida", "↑ Saída"]].map(([v, l]) => (
                <button key={v} onClick={() => setAjuste(a => ({ ...a, tipo: v }))}
                  style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, background: ajuste.tipo === v ? (v === "entrada" ? "#16a34a" : "#dc2626") : "#f1f5f9", color: ajuste.tipo === v ? "#fff" : "#555" }}>{l}</button>
              ))}
            </div>
            <Field label="Quantidade"><input type="number" min="1" value={ajuste.qtd} onChange={e => setAjuste(a => ({ ...a, qtd: e.target.value }))} style={inputStyle} /></Field>
            <Field label="Motivo"><input value={ajuste.motivo} onChange={e => setAjuste(a => ({ ...a, motivo: e.target.value }))} placeholder="Ex: inventário, avaria..." style={inputStyle} /></Field>
            <button onClick={confirmAjuste} disabled={!ajuste.qtd || +ajuste.qtd <= 0}
              style={{ padding: "10px 24px", borderRadius: 9, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", background: ajuste.qtd && +ajuste.qtd > 0 ? "#2563EB" : "#eee", color: ajuste.qtd && +ajuste.qtd > 0 ? "#fff" : "#aaa" }}>Confirmar</button>
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

// ═══════════════════════════ PEDIDOS (VENDAS) ════════════════════════════════
function PedidosTab({ pedidos, setPedidos, clientes, produtos, setProdutos, setFinanceiro, showToast }) {
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroCliente, setFiltroCliente] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [itens, setItens] = useState([]);

  const lista = pedidos.filter(p =>
    (filtroStatus === "todos" || p.status === filtroStatus) &&
    (!filtroCliente || p.clienteId === +filtroCliente)
  ).sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id);

  function openNew() {
    setForm({ clienteId: clientes[0]?.id || "", data: todayISO(), desconto: "", obs: "" });
    setItens([]);
    setModal({ mode: "new" });
  }
  function openView(p) { setForm({ ...p }); setItens(p.itens || []); setModal({ mode: "view", pedido: p }); }

  function savePedido() {
    if (!form.clienteId || itens.length === 0) return;
    const item = { id: Date.now(), numero: nextNumero(pedidos, "PED"), clienteId: +form.clienteId, data: form.data || todayISO(), itens, desconto: parseFloat(form.desconto) || 0, status: "orcamento", faturadoProcessado: false, obs: form.obs || "" };
    setPedidos(l => [...l, item]);
    setModal(null); showToast("Pedido criado como orçamento!");
  }

  function avancarStatus(p, novoStatus) {
    if (novoStatus === "faturado" && !p.faturadoProcessado) {
      const faltando = p.itens.filter(it => {
        const prod = produtos.find(x => x.id === it.produtoId);
        return !prod || prod.estoque < it.qtd;
      });
      if (faltando.length > 0) {
        showToast(`Estoque insuficiente para faturar: ${faltando.map(it => produtos.find(x => x.id === it.produtoId)?.nome || "?").join(", ")}`, "err");
        return;
      }
      setProdutos(list => list.map(prod => {
        const it = p.itens.find(x => x.produtoId === prod.id);
        return it ? { ...prod, estoque: prod.estoque - it.qtd } : prod;
      }));
      const cliente = clientes.find(c => c.id === p.clienteId);
      setFinanceiro(f => [...f, {
        id: Date.now(), tipo: "receber", descricao: `Pedido ${p.numero} — ${cliente?.nomeFantasia || cliente?.razaoSocial || "Cliente"}`,
        categoria: FIN_CATS_REC[0], valor: pedidoTotal(p), vencimento: p.data, status: "pendente", obs: "", origem: p.numero,
      }]);
      setPedidos(l => l.map(x => x.id === p.id ? { ...x, status: "faturado", faturadoProcessado: true } : x));
      showToast(`Pedido ${p.numero} faturado! Estoque baixado e lançamento financeiro criado.`);
      setModal(null);
      return;
    }
    setPedidos(l => l.map(x => x.id === p.id ? { ...x, status: novoStatus } : x));
    setModal(null);
    showToast(`Pedido ${p.numero} atualizado.`);
  }

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 28px 40px" }}>
      <PageHeader title="Pedidos" sub={`${pedidos.length} pedido(s) lançado(s)`} action={<PrimaryButton onClick={openNew} disabled={clientes.length === 0 || produtos.length === 0}>+ Novo Pedido</PrimaryButton>} />
      {(clientes.length === 0 || produtos.length === 0) && <div style={{ fontSize: 12, color: "#d97706", marginBottom: 14 }}>Cadastre ao menos um cliente e um produto para criar pedidos.</div>}

      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        {[["todos", "Todos"], ...PEDIDO_STATUS.map(s => [s.value, s.label])].map(([v, l]) => (
          <button key={v} onClick={() => setFiltroStatus(v)}
            style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, border: "1.5px solid #e2e8f0", cursor: "pointer", background: filtroStatus === v ? "#1e293b" : "#fff", color: filtroStatus === v ? "#fff" : "#555" }}>{l}</button>
        ))}
        <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} style={{ ...inputStyle, maxWidth: 220 }}>
          <option value="">Todos os clientes</option>
          {clientes.map(c => <option key={c.id} value={c.id}>{c.nomeFantasia || c.razaoSocial}</option>)}
        </select>
      </div>

      {lista.length === 0 ? <EmptyState icon="🧾" text="Nenhum pedido encontrado" /> : (
        <div style={{ ...cardBox, overflow: "hidden", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f8fafc" }}>{["Nº", "Cliente", "Data", "Total", "Status", ""].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
            <tbody>
              {lista.map(p => (
                <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono',monospace", color: "#94a3b8" }}>{p.numero}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{clientes.find(c => c.id === p.clienteId)?.nomeFantasia || "?"}</td>
                  <td style={tdStyle}>{fmtDateBR(p.data)}</td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtBRL(pedidoTotal(p))}</td>
                  <td style={tdStyle}><StatusBadge value={p.status} list={PEDIDO_STATUS} /></td>
                  <td style={tdStyle}><button className="btn" onClick={() => openView(p)} style={{ background: "#f1f5f9", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, color: "#334155" }}>Ver / Ações</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal?.mode === "new" && (
        <ModalOverlay onClose={() => setModal(null)} wide>
          <ModalHeader title="Novo Pedido" sub="Criado inicialmente como orçamento" onClose={() => setModal(null)} />
          <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 2 }}><Field label="Cliente *"><select value={form.clienteId} onChange={e => setForm(f => ({ ...f, clienteId: e.target.value }))} style={inputStyle}>{clientes.map(c => <option key={c.id} value={c.id}>{c.nomeFantasia || c.razaoSocial}</option>)}</select></Field></div>
            <div style={{ flex: 1 }}><Field label="Data"><input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} style={inputStyle} /></Field></div>
          </div>
          <Label>Itens do pedido</Label>
          <ItemsBuilder produtos={produtos} itens={itens} setItens={setItens} priceField="precoVenda" />
          <div style={{ marginTop: 12 }}><Field label="Desconto (R$)"><input type="number" step="0.01" value={form.desconto} onChange={e => setForm(f => ({ ...f, desconto: e.target.value }))} style={inputStyle} /></Field></div>
          <div style={{ marginTop: 12 }}><Field label="Observações"><textarea value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} rows={2} style={{ ...inputStyle, resize: "none" }} /></Field></div>
          <div style={{ display: "flex", marginTop: 20 }}>
            <button onClick={savePedido} disabled={!form.clienteId || itens.length === 0}
              style={{ marginLeft: "auto", padding: "10px 24px", borderRadius: 9, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", background: form.clienteId && itens.length > 0 ? "#2563EB" : "#eee", color: form.clienteId && itens.length > 0 ? "#fff" : "#aaa" }}>Salvar Orçamento</button>
          </div>
        </ModalOverlay>
      )}

      {modal?.mode === "view" && (
        <ModalOverlay onClose={() => setModal(null)} wide>
          <ModalHeader title={`Pedido ${modal.pedido.numero}`} sub={`${clientes.find(c => c.id === modal.pedido.clienteId)?.razaoSocial || "?"} · ${fmtDateBR(modal.pedido.data)}`} onClose={() => setModal(null)} />
          <div style={{ marginBottom: 12 }}><StatusBadge value={modal.pedido.status} list={PEDIDO_STATUS} /></div>
          <div style={{ border: "1.5px solid #e2e8f0", borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {modal.pedido.itens.map((it, idx) => {
                  const prod = produtos.find(x => x.id === it.produtoId);
                  return (
                    <tr key={idx} style={{ borderBottom: idx < modal.pedido.itens.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                      <td style={{ padding: "8px 12px", fontSize: 12.5 }}>{prod?.nome || "?"}</td>
                      <td style={{ padding: "8px 12px", fontSize: 12, color: "#94a3b8" }}>{it.qtd} {prod?.unidade}</td>
                      <td style={{ padding: "8px 12px", fontSize: 12, color: "#94a3b8" }}>{fmtBRL(it.precoUnit)}</td>
                      <td style={{ padding: "8px 12px", fontSize: 12.5, fontWeight: 700 }}>{fmtBRL(it.qtd * it.precoUnit)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {modal.pedido.desconto > 0 && <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "right" }}>Desconto: -{fmtBRL(modal.pedido.desconto)}</div>}
          <div style={{ textAlign: "right", fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Total: {fmtBRL(pedidoTotal(modal.pedido))}</div>
          {modal.pedido.obs && <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 12 }}>Obs: {modal.pedido.obs}</div>}

          <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
            {modal.pedido.status === "orcamento" && (
              <>
                <button onClick={() => avancarStatus(modal.pedido, "cancelado")} style={{ padding: "9px 14px", borderRadius: 8, background: "#fff0f0", color: "#dc2626", border: "1.5px solid #fecaca", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>Cancelar</button>
                <button onClick={() => avancarStatus(modal.pedido, "pedido")} style={{ marginLeft: "auto", padding: "10px 20px", borderRadius: 9, background: "#d97706", color: "#fff", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Confirmar Pedido</button>
              </>
            )}
            {modal.pedido.status === "pedido" && (
              <>
                <button onClick={() => avancarStatus(modal.pedido, "cancelado")} style={{ padding: "9px 14px", borderRadius: 8, background: "#fff0f0", color: "#dc2626", border: "1.5px solid #fecaca", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>Cancelar</button>
                <button onClick={() => avancarStatus(modal.pedido, "faturado")} style={{ marginLeft: "auto", padding: "10px 20px", borderRadius: 9, background: "#16a34a", color: "#fff", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>💵 Faturar Pedido</button>
              </>
            )}
          </div>
        </ModalOverlay>
      )}
    </div>
  );
}

// ═══════════════════════════ COMPRAS / FORNECEDORES ══════════════════════════
function ComprasTab({ fornecedores, setFornecedores, compras, setCompras, produtos, setProdutos, setFinanceiro, showToast }) {
  const [sub, setSub] = useState("compras");

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 28px 40px" }}>
      <PageHeader title="Compras" sub="Fornecedores e pedidos de compra" />
      <div style={{ display: "flex", gap: 4, marginBottom: 22 }}>
        {[["compras", "Pedidos de Compra"], ["fornecedores", "Fornecedores"]].map(([v, l]) => (
          <button key={v} onClick={() => setSub(v)}
            style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", background: sub === v ? "#1e293b" : "#f1f5f9", color: sub === v ? "#fff" : "#555" }}>{l}</button>
        ))}
      </div>
      {sub === "compras"
        ? <ComprasList compras={compras} setCompras={setCompras} fornecedores={fornecedores} produtos={produtos} setProdutos={setProdutos} setFinanceiro={setFinanceiro} showToast={showToast} />
        : <FornecedoresList fornecedores={fornecedores} setFornecedores={setFornecedores} showToast={showToast} />}
    </div>
  );
}

function FornecedoresList({ fornecedores, setFornecedores, showToast }) {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [confirmDel, setConfirmDel] = useState(null);

  function openNew() { setForm({ razaoSocial: "", cnpj: "", telefone: "", email: "", contato: "", obs: "" }); setModal({ mode: "new" }); }
  function openEdit(f) { setForm({ ...f }); setModal({ mode: "edit" }); }
  function saveFornecedor() {
    if (!form.razaoSocial?.trim()) return;
    if (modal.mode === "new") setFornecedores(l => [...l, { ...form, id: Date.now() }]);
    else setFornecedores(l => l.map(x => x.id === form.id ? form : x));
    setModal(null); showToast("Fornecedor salvo!");
  }
  function delFornecedor(id) { setFornecedores(l => l.filter(x => x.id !== id)); setConfirmDel(null); setModal(null); showToast("Fornecedor removido.", "err"); }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}><PrimaryButton onClick={openNew}>+ Novo Fornecedor</PrimaryButton></div>
      {fornecedores.length === 0 ? <EmptyState icon="🚚" text="Nenhum fornecedor cadastrado" /> : (
        <div style={{ ...cardBox, overflow: "hidden", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f8fafc" }}>{["Razão Social", "CNPJ", "Contato", "Telefone", ""].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
            <tbody>
              {fornecedores.map(f => (
                <tr key={f.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{f.razaoSocial}</td>
                  <td style={tdStyle}>{f.cnpj || "—"}</td>
                  <td style={tdStyle}>{f.contato || "—"}</td>
                  <td style={tdStyle}>{f.telefone || "—"}</td>
                  <td style={tdStyle}><button className="btn" onClick={() => openEdit(f)} style={{ background: "#f1f5f9", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, color: "#334155" }}>✏️ Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && (
        <ModalOverlay onClose={() => setModal(null)}>
          <ModalHeader title={modal.mode === "new" ? "Novo Fornecedor" : "Editar Fornecedor"} onClose={() => setModal(null)} />
          {confirmDel ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 14, marginBottom: 20 }}>Excluir este fornecedor?</div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button onClick={() => setConfirmDel(null)} style={{ padding: "9px 20px", borderRadius: 8, background: "#f1f5f9", border: "none", cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
                <button onClick={() => delFornecedor(form.id)} style={{ padding: "9px 20px", borderRadius: 8, background: "#dc2626", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600 }}>Excluir</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <Field label="Razão Social *"><input value={form.razaoSocial || ""} onChange={e => setForm(f => ({ ...f, razaoSocial: e.target.value }))} style={inputStyle} /></Field>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}><Field label="CNPJ"><input value={form.cnpj || ""} onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))} style={inputStyle} /></Field></div>
                <div style={{ flex: 1 }}><Field label="Telefone"><input value={form.telefone || ""} onChange={e => setForm(f => ({ ...f, telefone: e.target.value }))} style={inputStyle} /></Field></div>
              </div>
              <Field label="Contato"><input value={form.contato || ""} onChange={e => setForm(f => ({ ...f, contato: e.target.value }))} style={inputStyle} /></Field>
              <Field label="E-mail"><input value={form.email || ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inputStyle} /></Field>
              <Field label="Observações"><textarea value={form.obs || ""} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} rows={2} style={{ ...inputStyle, resize: "none" }} /></Field>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {modal.mode === "edit" && <button onClick={() => setConfirmDel(true)} style={{ padding: "9px 14px", borderRadius: 8, background: "#fff0f0", color: "#dc2626", border: "1.5px solid #fecaca", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>🗑 Excluir</button>}
                <button onClick={saveFornecedor} disabled={!form.razaoSocial?.trim()}
                  style={{ marginLeft: "auto", padding: "10px 24px", borderRadius: 9, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", background: form.razaoSocial?.trim() ? "#2563EB" : "#eee", color: form.razaoSocial?.trim() ? "#fff" : "#aaa" }}>Salvar</button>
              </div>
            </div>
          )}
        </ModalOverlay>
      )}
    </div>
  );
}

function ComprasList({ compras, setCompras, fornecedores, produtos, setProdutos, setFinanceiro, showToast }) {
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [itens, setItens] = useState([]);

  function openNew() { setForm({ fornecedorId: fornecedores[0]?.id || "", data: todayISO(), obs: "" }); setItens([]); setModal({ mode: "new" }); }
  function openView(c) { setModal({ mode: "view", compra: c }); }

  function saveCompra() {
    if (!form.fornecedorId || itens.length === 0) return;
    const item = { id: Date.now(), numero: nextNumero(compras, "COMP"), fornecedorId: +form.fornecedorId, data: form.data || todayISO(), itens, status: "pendente", recebidoProcessado: false, obs: form.obs || "" };
    setCompras(l => [...l, item]);
    setModal(null); showToast("Pedido de compra criado!");
  }

  function receberCompra(c) {
    if (c.recebidoProcessado) return;
    setProdutos(list => list.map(prod => {
      const it = c.itens.find(x => x.produtoId === prod.id);
      return it ? { ...prod, estoque: prod.estoque + it.qtd } : prod;
    }));
    const forn = fornecedores.find(f => f.id === c.fornecedorId);
    setFinanceiro(f => [...f, {
      id: Date.now(), tipo: "pagar", descricao: `Compra ${c.numero} — ${forn?.razaoSocial || "Fornecedor"}`,
      categoria: FIN_CATS_PAG[0], valor: compraTotal(c), vencimento: c.data, status: "pendente", obs: "", origem: c.numero,
    }]);
    setCompras(l => l.map(x => x.id === c.id ? { ...x, status: "recebido", recebidoProcessado: true } : x));
    showToast(`Compra ${c.numero} recebida! Estoque atualizado e conta a pagar criada.`);
    setModal(null);
  }

  function cancelarCompra(c) { setCompras(l => l.map(x => x.id === c.id ? { ...x, status: "cancelado" } : x)); setModal(null); showToast("Compra cancelada.", "err"); }

  const lista = [...compras].sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <PrimaryButton onClick={openNew} disabled={fornecedores.length === 0 || produtos.length === 0}>+ Novo Pedido de Compra</PrimaryButton>
      </div>
      {(fornecedores.length === 0 || produtos.length === 0) && <div style={{ fontSize: 12, color: "#d97706", marginBottom: 14 }}>Cadastre ao menos um fornecedor e um produto para lançar compras.</div>}

      {lista.length === 0 ? <EmptyState icon="🚚" text="Nenhuma compra lançada" /> : (
        <div style={{ ...cardBox, overflow: "hidden", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f8fafc" }}>{["Nº", "Fornecedor", "Data", "Total", "Status", ""].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
            <tbody>
              {lista.map(c => (
                <tr key={c.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono',monospace", color: "#94a3b8" }}>{c.numero}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{fornecedores.find(f => f.id === c.fornecedorId)?.razaoSocial || "?"}</td>
                  <td style={tdStyle}>{fmtDateBR(c.data)}</td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtBRL(compraTotal(c))}</td>
                  <td style={tdStyle}><StatusBadge value={c.status} list={COMPRA_STATUS} /></td>
                  <td style={tdStyle}><button className="btn" onClick={() => openView(c)} style={{ background: "#f1f5f9", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, color: "#334155" }}>Ver / Ações</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal?.mode === "new" && (
        <ModalOverlay onClose={() => setModal(null)} wide>
          <ModalHeader title="Novo Pedido de Compra" onClose={() => setModal(null)} />
          <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
            <div style={{ flex: 2 }}><Field label="Fornecedor *"><select value={form.fornecedorId} onChange={e => setForm(f => ({ ...f, fornecedorId: e.target.value }))} style={inputStyle}>{fornecedores.map(f => <option key={f.id} value={f.id}>{f.razaoSocial}</option>)}</select></Field></div>
            <div style={{ flex: 1 }}><Field label="Data"><input type="date" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} style={inputStyle} /></Field></div>
          </div>
          <Label>Itens da compra</Label>
          <ItemsBuilder produtos={produtos} itens={itens} setItens={setItens} priceField="precoCusto" />
          <div style={{ marginTop: 12 }}><Field label="Observações"><textarea value={form.obs} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} rows={2} style={{ ...inputStyle, resize: "none" }} /></Field></div>
          <div style={{ display: "flex", marginTop: 20 }}>
            <button onClick={saveCompra} disabled={!form.fornecedorId || itens.length === 0}
              style={{ marginLeft: "auto", padding: "10px 24px", borderRadius: 9, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", background: form.fornecedorId && itens.length > 0 ? "#2563EB" : "#eee", color: form.fornecedorId && itens.length > 0 ? "#fff" : "#aaa" }}>Salvar Pedido de Compra</button>
          </div>
        </ModalOverlay>
      )}

      {modal?.mode === "view" && (
        <ModalOverlay onClose={() => setModal(null)} wide>
          <ModalHeader title={`Compra ${modal.compra.numero}`} sub={`${fornecedores.find(f => f.id === modal.compra.fornecedorId)?.razaoSocial || "?"} · ${fmtDateBR(modal.compra.data)}`} onClose={() => setModal(null)} />
          <div style={{ marginBottom: 12 }}><StatusBadge value={modal.compra.status} list={COMPRA_STATUS} /></div>
          <div style={{ border: "1.5px solid #e2e8f0", borderRadius: 10, overflow: "hidden", marginBottom: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {modal.compra.itens.map((it, idx) => {
                  const prod = produtos.find(x => x.id === it.produtoId);
                  return (
                    <tr key={idx} style={{ borderBottom: idx < modal.compra.itens.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                      <td style={{ padding: "8px 12px", fontSize: 12.5 }}>{prod?.nome || "?"}</td>
                      <td style={{ padding: "8px 12px", fontSize: 12, color: "#94a3b8" }}>{it.qtd} {prod?.unidade}</td>
                      <td style={{ padding: "8px 12px", fontSize: 12, color: "#94a3b8" }}>{fmtBRL(it.precoUnit)}</td>
                      <td style={{ padding: "8px 12px", fontSize: 12.5, fontWeight: 700 }}>{fmtBRL(it.qtd * it.precoUnit)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ textAlign: "right", fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Total: {fmtBRL(compraTotal(modal.compra))}</div>
          {modal.compra.status === "pendente" && (
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={() => cancelarCompra(modal.compra)} style={{ padding: "9px 14px", borderRadius: 8, background: "#fff0f0", color: "#dc2626", border: "1.5px solid #fecaca", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>Cancelar</button>
              <button onClick={() => receberCompra(modal.compra)} style={{ marginLeft: "auto", padding: "10px 20px", borderRadius: 9, background: "#16a34a", color: "#fff", border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>📥 Marcar como Recebido</button>
            </div>
          )}
        </ModalOverlay>
      )}
    </div>
  );
}

// ═══════════════════════════ FINANCEIRO ══════════════════════════════════════
function FinanceiroTab({ financeiro, setFinanceiro, showToast }) {
  const today = todayISO();
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroStatus, setFiltroStatus] = useState("todos");
  const [filtroMes, setFiltroMes] = useState(() => today.slice(0, 7));
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [confirmDel, setConfirmDel] = useState(null);

  const lista = financeiro.filter(i => {
    if (filtroTipo !== "todos" && i.tipo !== filtroTipo) return false;
    if (filtroStatus !== "todos" && i.status !== filtroStatus) return false;
    if (filtroMes && !i.vencimento.startsWith(filtroMes)) return false;
    return true;
  }).sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  const totalRec = financeiro.filter(i => i.tipo === "receber" && i.vencimento.startsWith(filtroMes)).reduce((s, i) => s + i.valor, 0);
  const totalPag = financeiro.filter(i => i.tipo === "pagar" && i.vencimento.startsWith(filtroMes)).reduce((s, i) => s + i.valor, 0);
  const totalRecPago = financeiro.filter(i => i.tipo === "receber" && i.status === "pago" && i.vencimento.startsWith(filtroMes)).reduce((s, i) => s + i.valor, 0);
  const totalPagPago = financeiro.filter(i => i.tipo === "pagar" && i.status === "pago" && i.vencimento.startsWith(filtroMes)).reduce((s, i) => s + i.valor, 0);
  const saldo = totalRecPago - totalPagPago;

  function openNew(tipo) { setForm({ tipo, descricao: "", valor: "", vencimento: today, categoria: tipo === "receber" ? FIN_CATS_REC[0] : FIN_CATS_PAG[0], status: "pendente", obs: "" }); setModal({ mode: "new" }); }
  function openEdit(item) { setForm({ ...item }); setModal({ mode: "edit" }); }
  function saveItem() {
    if (!form.descricao?.trim() || !form.valor || !form.vencimento) return;
    const item = { ...form, valor: parseFloat(form.valor) };
    if (modal.mode === "new") setFinanceiro(f => [...f, { ...item, id: Date.now() }]);
    else setFinanceiro(f => f.map(x => x.id === item.id ? item : x));
    setModal(null); showToast("Lançamento salvo!");
  }
  function toggleStatus(id) { setFinanceiro(f => f.map(x => x.id === id ? { ...x, status: x.status === "pago" ? "pendente" : "pago" } : x)); }
  function del(id) { setFinanceiro(f => f.filter(x => x.id !== id)); setConfirmDel(null); setModal(null); showToast("Lançamento removido.", "err"); }
  function statusColor(item) {
    if (item.status === "pago") return { bg: "#f0fdf4", color: "#16a34a", label: "Pago" };
    if (item.vencimento < today) return { bg: "#fff0f0", color: "#dc2626", label: "Vencido" };
    return { bg: "#fffbeb", color: "#d97706", label: "Pendente" };
  }

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 28px 40px" }}>
      <PageHeader title="Financeiro" sub="Contas a pagar e a receber" action={
        <div style={{ display: "flex", gap: 8 }}>
          <PrimaryButton onClick={() => openNew("receber")} color="#16a34a">+ A Receber</PrimaryButton>
          <PrimaryButton onClick={() => openNew("pagar")} color="#dc2626">+ A Pagar</PrimaryButton>
        </div>
      } />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 14, marginBottom: 24 }}>
        <StatCard label="A Receber" value={fmtBRL(totalRec)} color="#16a34a" bg="#f0fdf4" border="#bbf7d0" sub={`Recebido: ${fmtBRL(totalRecPago)}`} />
        <StatCard label="A Pagar" value={fmtBRL(totalPag)} color="#dc2626" bg="#fff0f0" border="#fecaca" sub={`Pago: ${fmtBRL(totalPagPago)}`} />
        <StatCard label="Saldo (recebido − pago)" value={fmtBRL(saldo)} color={saldo >= 0 ? "#2563eb" : "#dc2626"} bg="#eff6ff" border="#bfdbfe" />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
        <input type="month" value={filtroMes} onChange={e => setFiltroMes(e.target.value)} style={{ ...inputStyle, width: "auto" }} />
        {[["todos", "Todos"], ["receber", "A Receber"], ["pagar", "A Pagar"]].map(([v, l]) => (
          <button key={v} onClick={() => setFiltroTipo(v)} style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, border: "1.5px solid #e2e8f0", cursor: "pointer", background: filtroTipo === v ? "#1e293b" : "#fff", color: filtroTipo === v ? "#fff" : "#555" }}>{l}</button>
        ))}
        {["todos", "pendente", "pago"].map(v => (
          <button key={v} onClick={() => setFiltroStatus(v)} style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 500, border: "1.5px solid #e2e8f0", cursor: "pointer", background: filtroStatus === v ? "#555" : "#fff", color: filtroStatus === v ? "#fff" : "#555" }}>
            {v === "todos" ? "Todos status" : v === "pago" ? "✅ Pago" : "⏳ Pendente"}
          </button>
        ))}
      </div>

      {lista.length === 0 ? <EmptyState icon="💰" text="Nenhum lançamento encontrado" /> : (
        <div style={{ ...cardBox, overflow: "hidden", overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f8fafc" }}>{["Tipo", "Descrição", "Categoria", "Vencimento", "Valor", "Status", ""].map(h => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
            <tbody>
              {lista.map(item => {
                const s = statusColor(item);
                return (
                  <tr key={item.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={tdStyle}><span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 5, background: item.tipo === "receber" ? "#f0fdf4" : "#fff0f0", color: item.tipo === "receber" ? "#16a34a" : "#dc2626" }}>{item.tipo === "receber" ? "↓ Receber" : "↑ Pagar"}</span></td>
                    <td style={{ ...tdStyle, fontWeight: 500 }}>{item.descricao}{item.origem && <span style={{ fontSize: 10, color: "#94a3b8", marginLeft: 6 }}>({item.origem})</span>}</td>
                    <td style={{ ...tdStyle, color: "#94a3b8" }}>{item.categoria}</td>
                    <td style={{ ...tdStyle, fontFamily: "'JetBrains Mono',monospace", color: item.vencimento < today && item.status !== "pago" ? "#dc2626" : "#555" }}>{fmtDateBR(item.vencimento)}</td>
                    <td style={{ ...tdStyle, fontWeight: 700, color: item.tipo === "receber" ? "#16a34a" : "#dc2626" }}>{fmtBRL(item.valor)}</td>
                    <td style={tdStyle}><button onClick={() => toggleStatus(item.id)} style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, border: "none", cursor: "pointer", background: s.bg, color: s.color }}>{s.label}</button></td>
                    <td style={tdStyle}><button onClick={() => openEdit(item)} style={{ background: "#f1f5f9", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, cursor: "pointer", color: "#334155" }}>✏️</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <ModalOverlay onClose={() => setModal(null)}>
          <ModalHeader title={modal.mode === "new" ? (form.tipo === "receber" ? "Nova Conta a Receber" : "Nova Conta a Pagar") : "Editar Lançamento"} onClose={() => setModal(null)} />
          {confirmDel ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ fontSize: 14, marginBottom: 20 }}>Excluir este lançamento?</div>
              <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                <button onClick={() => setConfirmDel(null)} style={{ padding: "9px 20px", borderRadius: 8, background: "#f1f5f9", border: "none", cursor: "pointer", fontWeight: 600 }}>Cancelar</button>
                <button onClick={() => del(form.id)} style={{ padding: "9px 20px", borderRadius: 8, background: "#dc2626", color: "#fff", border: "none", cursor: "pointer", fontWeight: 600 }}>Excluir</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <div>
                <Label>Tipo</Label>
                <div style={{ display: "flex", gap: 8 }}>
                  {[["receber", "↓ A Receber"], ["pagar", "↑ A Pagar"]].map(([v, l]) => (
                    <button key={v} onClick={() => setForm(f => ({ ...f, tipo: v, categoria: v === "receber" ? FIN_CATS_REC[0] : FIN_CATS_PAG[0] }))}
                      style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, background: form.tipo === v ? (v === "receber" ? "#16a34a" : "#dc2626") : "#f1f5f9", color: form.tipo === v ? "#fff" : "#555" }}>{l}</button>
                  ))}
                </div>
              </div>
              <Field label="Descrição *"><input value={form.descricao || ""} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} style={inputStyle} /></Field>
              <Field label="Categoria"><select value={form.categoria || ""} onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))} style={inputStyle}>{(form.tipo === "receber" ? FIN_CATS_REC : FIN_CATS_PAG).map(c => <option key={c}>{c}</option>)}</select></Field>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}><Field label="Valor (R$) *"><input type="number" value={form.valor || ""} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))} style={inputStyle} /></Field></div>
                <div style={{ flex: 1 }}><Field label="Vencimento *"><input type="date" value={form.vencimento || ""} onChange={e => setForm(f => ({ ...f, vencimento: e.target.value }))} style={inputStyle} /></Field></div>
              </div>
              <div>
                <Label>Status</Label>
                <div style={{ display: "flex", gap: 8 }}>
                  {[["pendente", "⏳ Pendente"], ["pago", "✅ Pago"]].map(([v, l]) => (
                    <button key={v} onClick={() => setForm(f => ({ ...f, status: v }))} style={{ flex: 1, padding: "8px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13, background: form.status === v ? "#1e293b" : "#f1f5f9", color: form.status === v ? "#fff" : "#555" }}>{l}</button>
                  ))}
                </div>
              </div>
              <Field label="Observação"><textarea value={form.obs || ""} onChange={e => setForm(f => ({ ...f, obs: e.target.value }))} rows={2} style={{ ...inputStyle, resize: "none" }} /></Field>
              <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                {modal.mode === "edit" && <button onClick={() => setConfirmDel(true)} style={{ padding: "9px 14px", borderRadius: 8, background: "#fff0f0", color: "#dc2626", border: "1.5px solid #fecaca", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>🗑 Excluir</button>}
                <button onClick={saveItem} disabled={!form.descricao?.trim() || !form.valor || !form.vencimento}
                  style={{ marginLeft: "auto", padding: "10px 24px", borderRadius: 9, border: "none", fontWeight: 700, fontSize: 13, cursor: "pointer", background: form.descricao?.trim() && form.valor && form.vencimento ? "#2563EB" : "#eee", color: form.descricao?.trim() && form.valor && form.vencimento ? "#fff" : "#aaa" }}>Salvar</button>
              </div>
            </div>
          )}
        </ModalOverlay>
      )}
    </div>
  );
}

// ═══════════════════════════ RELATÓRIOS ══════════════════════════════════════
function exportCSV(rows, headers, filename) {
  const lines = [headers.join(";"), ...rows.map(r => r.join(";"))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}

function RelatoriosTab({ pedidos, clientes, produtos }) {
  const [mes, setMes] = useState(() => todayISO().slice(0, 7));
  const faturados = pedidos.filter(p => p.status === "faturado" && monthKeyOf(p.data) === mes);
  const totalMes = faturados.reduce((s, p) => s + pedidoTotal(p), 0);

  const porCliente = {};
  faturados.forEach(p => { const c = clientes.find(x => x.id === p.clienteId); const nome = c?.nomeFantasia || c?.razaoSocial || "?"; porCliente[nome] = (porCliente[nome] || 0) + pedidoTotal(p); });
  const rankingClientes = Object.entries(porCliente).sort((a, b) => b[1] - a[1]);

  const porProduto = {};
  faturados.forEach(p => p.itens.forEach(it => {
    const prod = produtos.find(x => x.id === it.produtoId);
    const nome = prod?.nome || "?";
    if (!porProduto[nome]) porProduto[nome] = { qtd: 0, total: 0 };
    porProduto[nome].qtd += it.qtd; porProduto[nome].total += it.qtd * it.precoUnit;
  }));
  const rankingProdutos = Object.entries(porProduto).sort((a, b) => b[1].total - a[1].total);

  const [y, m] = mes.split("-");
  const mesLabel = `${MONTH_NAMES[parseInt(m) - 1]} ${y}`;

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 28px 40px" }}>
      <PageHeader title="Relatórios" sub={`Desempenho de vendas — ${mesLabel}`} action={
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="month" value={mes} onChange={e => setMes(e.target.value)} style={{ ...inputStyle, width: "auto" }} />
          <button onClick={() => exportCSV(faturados.map(p => [p.numero, fmtDateBR(p.data), (clientes.find(c => c.id === p.clienteId)?.razaoSocial || "?"), pedidoTotal(p).toFixed(2)]), ["Nº Pedido", "Data", "Cliente", "Total"], `vendas_${mes}.csv`)}
            style={{ padding: "9px 16px", borderRadius: 9, background: "#f1f5f9", border: "1.5px solid #e2e8f0", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>⬇ Exportar CSV</button>
        </div>
      } />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 14, marginBottom: 24 }}>
        <StatCard label="Total faturado no mês" value={fmtBRL(totalMes)} color="#16a34a" bg="#f0fdf4" border="#bbf7d0" />
        <StatCard label="Pedidos faturados" value={faturados.length} color="#2563EB" bg="#eff6ff" border="#bfdbfe" />
        <StatCard label="Ticket médio" value={fmtBRL(faturados.length ? totalMes / faturados.length : 0)} color="#7c3aed" bg="#f5f3ff" border="#ddd6fe" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ ...cardBox, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Ranking por cliente</div>
          {rankingClientes.length === 0 ? <div style={{ fontSize: 12, color: "#cbd5e1" }}>Sem vendas faturadas no período</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rankingClientes.map(([nome, total], i) => (
                <div key={nome} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
                  <span><span style={{ color: "#cbd5e1", fontFamily: "'JetBrains Mono',monospace", marginRight: 6 }}>{i + 1}.</span>{nome}</span>
                  <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{fmtBRL(total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ ...cardBox, padding: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Ranking por produto</div>
          {rankingProdutos.length === 0 ? <div style={{ fontSize: 12, color: "#cbd5e1" }}>Sem vendas faturadas no período</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rankingProdutos.map(([nome, d], i) => (
                <div key={nome} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
                  <span><span style={{ color: "#cbd5e1", fontFamily: "'JetBrains Mono',monospace", marginRight: 6 }}>{i + 1}.</span>{nome} <span style={{ color: "#94a3b8" }}>({d.qtd})</span></span>
                  <span style={{ fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>{fmtBRL(d.total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════ CONFIGURAÇÕES ═══════════════════════════════════
function ConfiguracoesTab({ empresa, setEmpresa, showToast }) {
  const [form, setForm] = useState(empresa);
  function saveEmpresa() { setEmpresa(form); showToast("Dados da empresa salvos!"); }

  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: "28px 28px 40px" }}>
      <PageHeader title="Configurações" sub="Dados da empresa e acesso ao sistema" />
      <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 480 }}>
        <div style={{ ...cardBox, padding: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>🏢 Dados da empresa</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Field label="Razão Social"><input value={form.nome || ""} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} style={inputStyle} /></Field>
            <Field label="CNPJ"><input value={form.cnpj || ""} onChange={e => setForm(f => ({ ...f, cnpj: e.target.value }))} style={inputStyle} /></Field>
            <Field label="Cidade/UF"><input value={form.cidade || ""} onChange={e => setForm(f => ({ ...f, cidade: e.target.value }))} style={inputStyle} /></Field>
            <button onClick={saveEmpresa} style={{ background: "#1e293b", color: "#fff", border: "none", borderRadius: 9, padding: "11px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Salvar dados</button>
          </div>
        </div>
        <ChangePasswordSection />
      </div>
    </div>
  );
}

// ═══════════════════════════ APP SHELL ═══════════════════════════════════════
const NAV = [
  ["dashboard", "📊", "Dashboard"],
  ["clientes", "👥", "Clientes"],
  ["produtos", "📦", "Produtos"],
  ["pedidos", "🧾", "Pedidos"],
  ["compras", "🚚", "Compras"],
  ["financeiro", "💰", "Financeiro"],
  ["relatorios", "📈", "Relatórios"],
  ["configuracoes", "⚙️", "Configurações"],
];

export default function App() {
  const [loggedIn, setLoggedIn] = useState(() => sessionStorage.getItem("df_session") === "1");
  if (!loggedIn) return <LoginScreen onLogin={() => { sessionStorage.setItem("df_session", "1"); setLoggedIn(true); }} />;
  return <AppInner onLogout={() => { sessionStorage.removeItem("df_session"); setLoggedIn(false); }} />;
}

function AppInner({ onLogout }) {
  const [clientes, setClientes] = useState(() => load(STORAGE_KEYS.clientes, DEFAULT_CLIENTES));
  const [produtos, setProdutos] = useState(() => load(STORAGE_KEYS.produtos, DEFAULT_PRODUTOS));
  const [pedidos, setPedidos] = useState(() => load(STORAGE_KEYS.pedidos, []));
  const [fornecedores, setFornecedores] = useState(() => load(STORAGE_KEYS.fornecedores, DEFAULT_FORNECEDORES));
  const [compras, setCompras] = useState(() => load(STORAGE_KEYS.compras, []));
  const [financeiro, setFinanceiro] = useState(() => load(STORAGE_KEYS.financeiro, []));
  const [empresa, setEmpresa] = useState(() => load(STORAGE_KEYS.empresa, { nome: "Minha Distribuidora Ltda", cnpj: "", cidade: "" }));
  const [tab, setTab] = useState("dashboard");
  const [toast, setToast] = useState(null);

  useEffect(() => { save(STORAGE_KEYS.clientes, clientes); }, [clientes]);
  useEffect(() => { save(STORAGE_KEYS.produtos, produtos); }, [produtos]);
  useEffect(() => { save(STORAGE_KEYS.pedidos, pedidos); }, [pedidos]);
  useEffect(() => { save(STORAGE_KEYS.fornecedores, fornecedores); }, [fornecedores]);
  useEffect(() => { save(STORAGE_KEYS.compras, compras); }, [compras]);
  useEffect(() => { save(STORAGE_KEYS.financeiro, financeiro); }, [financeiro]);
  useEffect(() => { save(STORAGE_KEYS.empresa, empresa); }, [empresa]);

  const showToast = useCallback((msg, type = "ok") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#F1F5F9", fontFamily: "'Outfit', sans-serif", color: "#0f172a", display: "flex" }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:5px;height:5px;}
        ::-webkit-scrollbar-track{background:#e2e8f0;}
        ::-webkit-scrollbar-thumb{background:#94a3b8;border-radius:3px;}
        .btn{cursor:pointer;border:none;transition:all .15s;font-family:'Outfit',sans-serif;}
        .btn:hover{filter:brightness(.94);}
        .btn:active{transform:scale(.97);}
        .nav-item{cursor:pointer;transition:all .15s;}
        input,select,textarea{font-family:'Outfit',sans-serif;outline:none;}
        input:focus,select:focus,textarea:focus{border-color:#2563EB !important;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        @keyframes toastIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
        .fade-up{animation:fadeUp .2s ease}
        .toast-anim{animation:toastIn .2s ease}
        tr:hover td{background:#f8fafc !important;}
      `}</style>

      {/* Sidebar */}
      <div style={{ width: 224, background: "#0f172a", color: "#fff", display: "flex", flexDirection: "column", flexShrink: 0, position: "sticky", top: 0, height: "100vh" }}>
        <div style={{ padding: "22px 20px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #1e293b" }}>
          <div style={{ width: 34, height: 34, background: "#2563EB", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📦</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>DistriFlow</div>
            <div style={{ fontSize: 10, color: "#64748b", fontFamily: "'JetBrains Mono',monospace" }}>Gestão para Distribuidoras</div>
          </div>
        </div>
        <div style={{ flex: 1, padding: "14px 12px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
          {NAV.map(([id, icon, label]) => (
            <div key={id} className="nav-item" onClick={() => setTab(id)}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 9, fontSize: 13.5, fontWeight: tab === id ? 600 : 400, background: tab === id ? "#2563EB" : "transparent", color: tab === id ? "#fff" : "#94a3b8" }}>
              <span style={{ fontSize: 15 }}>{icon}</span>{label}
            </div>
          ))}
        </div>
        <div style={{ padding: 16, borderTop: "1px solid #1e293b" }}>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8, fontFamily: "'JetBrains Mono',monospace" }}>{empresa.nome}</div>
          <button onClick={onLogout} style={{ width: "100%", background: "#1e293b", border: "none", borderRadius: 8, padding: "9px 0", fontSize: 12, fontWeight: 600, color: "#cbd5e1", cursor: "pointer" }}>🔒 Sair</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
        {tab === "dashboard" && <DashboardTab clientes={clientes} produtos={produtos} pedidos={pedidos} financeiro={financeiro} />}
        {tab === "clientes" && <ClientesTab clientes={clientes} setClientes={setClientes} showToast={showToast} />}
        {tab === "produtos" && <ProdutosTab produtos={produtos} setProdutos={setProdutos} showToast={showToast} />}
        {tab === "pedidos" && <PedidosTab pedidos={pedidos} setPedidos={setPedidos} clientes={clientes} produtos={produtos} setProdutos={setProdutos} setFinanceiro={setFinanceiro} showToast={showToast} />}
        {tab === "compras" && <ComprasTab fornecedores={fornecedores} setFornecedores={setFornecedores} compras={compras} setCompras={setCompras} produtos={produtos} setProdutos={setProdutos} setFinanceiro={setFinanceiro} showToast={showToast} />}
        {tab === "financeiro" && <FinanceiroTab financeiro={financeiro} setFinanceiro={setFinanceiro} showToast={showToast} />}
        {tab === "relatorios" && <RelatoriosTab pedidos={pedidos} clientes={clientes} produtos={produtos} />}
        {tab === "configuracoes" && <ConfiguracoesTab empresa={empresa} setEmpresa={setEmpresa} showToast={showToast} />}
      </div>

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
