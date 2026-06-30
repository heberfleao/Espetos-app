import { useState, useEffect } from "react";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, onSnapshot, setDoc, updateDoc,
  collection, addDoc, deleteDoc, getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ── Firebase config ────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBJgsLky3SQhv9awuzLM4XXUsG1stux41Y",
  authDomain: "assados---vendas-e-reservas.firebaseapp.com",
  projectId: "assados---vendas-e-reservas",
  storageBucket: "assados---vendas-e-reservas.firebasestorage.app",
  messagingSenderId: "968233308287",
  appId: "1:968233308287:web:443222830e26c4fec12f4a",
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// ── Constantes ─────────────────────────────────────────────────────────
const TIPOS = [
  { id: "frango",         label: "Espeto de Frango", emoji: "🍗", cor: "#E8A045" },
  { id: "frango_inteiro", label: "Frango Inteiro",   emoji: "🐔", cor: "#C8860A" },
  { id: "carne",          label: "Carne",            emoji: "🥩", cor: "#B94040" },
  { id: "salsicha",       label: "Salsichão",        emoji: "🌭", cor: "#C4622D" },
  { id: "coracao",        label: "Coração",          emoji: "❤️", cor: "#8B1A1A" },
  { id: "porco",          label: "Porco",            emoji: "🐷", cor: "#D4845A" },
];
const SOMENTE_INTEIRO = ["carne", "coracao", "porco", "frango_inteiro"];
const SO_VENDA = [];

const INIT_VENDAS = () => TIPOS.reduce((acc, t) => { acc[t.id] = { inteiro: 0, metade: 0 }; return acc; }, {});
const INIT_LIMITES = () => TIPOS.reduce((acc, t) => { acc[t.id] = null; return acc; }, {});

// ── Refs Firestore ─────────────────────────────────────────────────────
const DOC_VENDAS   = doc(db, "dia", "vendas");
const DOC_LIMITES  = doc(db, "dia", "limites");
const COL_RESERVAS = collection(db, "reservas");

// ── App ────────────────────────────────────────────────────────────────
export default function App() {
  const [vendas, setVendas]           = useState(INIT_VENDAS());
  const [limites, setLimites]         = useState(INIT_LIMITES());
  const [reservas, setReservas]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [online, setOnline]           = useState(true);

  const [aba, setAba]                 = useState("painel");
  const [modal, setModal]             = useState(null);
  const [qtd, setQtd]                 = useState(1);
  const [nome, setNome]               = useState("");
  const [confirmarBaixa, setConfirmarBaixa] = useState(null);
  const [modalLimite, setModalLimite] = useState(null);
  const [limiteInput, setLimiteInput] = useState("");
  const [modalReset, setModalReset]   = useState(false);
  const [senhaInput, setSenhaInput]   = useState("");
  const [senhaErro, setSenhaErro]     = useState(false);
  const [busca, setBusca]             = useState("");

  const fmt = (n) => (n % 1 === 0 ? n : n.toFixed(1));

  // ── Listeners em tempo real ────────────────────────────────────────
  useEffect(() => {
    let count = 0;
    const onDone = () => { count++; if (count >= 3) setLoading(false); };

    const unsubVendas = onSnapshot(DOC_VENDAS, (snap) => {
      if (snap.exists()) setVendas({ ...INIT_VENDAS(), ...snap.data() });
      else setDoc(DOC_VENDAS, INIT_VENDAS());
      onDone();
    }, () => { setOnline(false); onDone(); });

    const unsubLimites = onSnapshot(DOC_LIMITES, (snap) => {
      if (snap.exists()) setLimites({ ...INIT_LIMITES(), ...snap.data() });
      else setDoc(DOC_LIMITES, INIT_LIMITES());
      onDone();
    }, () => { setOnline(false); onDone(); });

    const unsubReservas = onSnapshot(COL_RESERVAS, (snap) => {
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      lista.sort((a, b) => (a.ts || 0) - (b.ts || 0));
      setReservas(lista);
      onDone();
    }, () => { setOnline(false); onDone(); });

    window.addEventListener("online",  () => setOnline(true));
    window.addEventListener("offline", () => setOnline(false));

    return () => { unsubVendas(); unsubLimites(); unsubReservas(); };
  }, []);

  // ── Helpers ───────────────────────────────────────────────────────
  const reservasPorTipo = (tipoId) => reservas.filter(r => r.tipoId === tipoId);

  const consumido = (tipoId) => {
    const v = vendas[tipoId] || { inteiro: 0, metade: 0 };
    const r = reservasPorTipo(tipoId).reduce((s, x) => s + (x.tamanho === "inteiro" ? x.qtd : x.qtd / 2), 0);
    return v.inteiro + v.metade / 2 + r;
  };

  const disponivel = (tipoId) => {
    const lim = limites[tipoId];
    return lim === null ? null : Math.max(0, lim - consumido(tipoId));
  };

  const totalVendidos   = Object.values(vendas).reduce((s, v) => s + v.inteiro + v.metade / 2, 0);
  const totalReservados = reservas.reduce((s, r) => s + (r.tamanho === "inteiro" ? r.qtd : r.qtd / 2), 0);

  // ── Ações ─────────────────────────────────────────────────────────
  const abrirModal = (tipo, tipoId, tamanho) => { setModal({ tipo, tipoId, tamanho }); setQtd(1); setNome(""); };

  const maxPermitido = () => {
    if (!modal) return 99;
    const disp = disponivel(modal.tipoId);
    return disp === null ? 99 : Math.floor(disp * (modal.tamanho === "metade" ? 2 : 1));
  };

  const confirmar = async () => {
    const { tipo, tipoId, tamanho } = modal;
    if (tipo === "vender") {
      const novo = {
        ...vendas,
        [tipoId]: {
          inteiro: (vendas[tipoId]?.inteiro || 0) + (tamanho === "inteiro" ? qtd : 0),
          metade:  (vendas[tipoId]?.metade  || 0) + (tamanho === "metade"  ? qtd : 0),
        },
      };
      await setDoc(DOC_VENDAS, novo);
    } else {
      if (!nome.trim()) return;
      await addDoc(COL_RESERVAS, {
        tipoId, tamanho, qtd,
        nome: nome.trim(),
        hora: new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        ts: Date.now(),
      });
    }
    setModal(null);
  };

  const darBaixa = async (reserva) => {
    const novo = {
      ...vendas,
      [reserva.tipoId]: {
        inteiro: (vendas[reserva.tipoId]?.inteiro || 0) + (reserva.tamanho === "inteiro" ? reserva.qtd : 0),
        metade:  (vendas[reserva.tipoId]?.metade  || 0) + (reserva.tamanho === "metade"  ? reserva.qtd : 0),
      },
    };
    await setDoc(DOC_VENDAS, novo);
    await deleteDoc(doc(db, "reservas", reserva.id));
    setConfirmarBaixa(null);
  };

  const cancelarReserva = async (id) => {
    await deleteDoc(doc(db, "reservas", id));
    setConfirmarBaixa(null);
  };

  const abrirLimite = (tipoId) => {
    setModalLimite(tipoId);
    setLimiteInput(limites[tipoId] !== null ? String(limites[tipoId]) : "");
  };

  const salvarLimite = async () => {
    const val = parseInt(limiteInput);
    const novo = { ...limites, [modalLimite]: isNaN(val) || val <= 0 ? null : val };
    await setDoc(DOC_LIMITES, novo);
    setModalLimite(null);
  };

  const abrirReset = () => { setSenhaInput(""); setSenhaErro(false); setModalReset(true); };

  const confirmarReset = async () => {
    if (senhaInput !== "12345") { setSenhaErro(true); return; }
    // Apaga vendas e limites
    await setDoc(DOC_VENDAS,  INIT_VENDAS());
    await setDoc(DOC_LIMITES, INIT_LIMITES());
    // Apaga todas as reservas em batch
    const snap = await getDocs(COL_RESERVAS);
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    setModalReset(false);
  };

  const exportarPDF = () => {
    const hoje = new Date().toLocaleDateString("pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const linhasVendas = TIPOS.map(t => {
      const v = vendas[t.id] || { inteiro: 0, metade: 0 };
      const soloInt = SOMENTE_INTEIRO.includes(t.id);
      if (soloInt) return v.inteiro > 0 ? `${t.label}: ${v.inteiro} inteiro${v.inteiro !== 1 ? "s" : ""}` : null;
      const p = [];
      if (v.inteiro > 0) p.push(`${v.inteiro} inteiro${v.inteiro !== 1 ? "s" : ""}`);
      if (v.metade  > 0) p.push(`${v.metade} metade${v.metade !== 1 ? "s" : ""}`);
      return p.length > 0 ? `${t.label}: ${p.join(", ")}` : null;
    }).filter(Boolean);

    const linhasReservas = reservas.map(r => {
      const t = TIPOS.find(x => x.id === r.tipoId);
      return `${r.nome} — ${r.qtd}× ${t?.label} (${r.tamanho}) às ${r.hora}`;
    });

    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">
<title>Relatório Espetos — ${hoje}</title>
<style>
body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;color:#222}
h1{color:#c8560a;margin-bottom:4px}.data{color:#888;font-size:14px;margin-bottom:32px}
h2{border-bottom:2px solid #eee;padding-bottom:6px;margin-top:28px}
ul{padding-left:20px}li{margin:6px 0;font-size:15px}
.totais{display:flex;gap:32px;margin:28px 0}
.total-box{background:#f5f5f5;border-radius:8px;padding:16px 24px;text-align:center}
.total-num{font-size:36px;font-weight:800;color:#c8560a}
.total-label{font-size:12px;color:#888;margin-top:4px}
.vazio{color:#aaa;font-style:italic}
footer{margin-top:48px;font-size:12px;color:#ccc;text-align:center}
</style></head><body>
<h1>🔥 Relatório de Espetos</h1>
<div class="data">${hoje}</div>
<div class="totais">
  <div class="total-box"><div class="total-num">${fmt(totalVendidos)}</div><div class="total-label">Total vendidos</div></div>
  <div class="total-box"><div class="total-num">${fmt(totalReservados)}</div><div class="total-label">Reservas ativas</div></div>
</div>
<h2>Vendas do dia</h2>
${linhasVendas.length > 0 ? `<ul>${linhasVendas.map(l=>`<li>${l}</li>`).join("")}</ul>` : `<p class="vazio">Nenhuma venda registrada.</p>`}
<h2>Reservas ativas</h2>
${linhasReservas.length > 0 ? `<ul>${linhasReservas.map(l=>`<li>${l}</li>`).join("")}</ul>` : `<p class="vazio">Nenhuma reserva ativa.</p>`}
<footer>Gerado às ${new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})} · Espetos Assados</footer>
</body></html>`;

    const blob = new Blob([html], { type: "text/html" });
    const url  = URL.createObjectURL(blob);
    const win  = window.open(url, "_blank");
    if (win) win.onload = () => win.print();
  };

  const tipo      = modal       ? TIPOS.find(t => t.id === modal.tipoId)      : null;
  const tipoLimite = modalLimite ? TIPOS.find(t => t.id === modalLimite)      : null;

  // ── Loading ───────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ ...s.root, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔥</div>
      <div style={{ color: "#666", fontSize: 15 }}>Conectando ao servidor...</div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div style={s.root}>

      {/* HEADER */}
      <div style={s.header}>
        <div style={s.headerInner}>
          <div>
            <div style={s.logo}>🔥 Espetos</div>
            <div style={s.logoSub}>
              {online
                ? <span style={{ color: "#5dbe8a" }}>● online</span>
                : <span style={{ color: "#c0392b" }}>● offline</span>}
            </div>
          </div>
          <div style={s.badges}>
            <div style={{ ...s.badge, background: "#2a2a2a" }}>
              <span style={s.badgeNum}>{fmt(totalVendidos)}</span>
              <span style={s.badgeLabel}>vendidos</span>
            </div>
            <div style={{ ...s.badge, background: "#1a3a2a" }}>
              <span style={{ ...s.badgeNum, color: "#5dbe8a" }}>{fmt(totalReservados)}</span>
              <span style={s.badgeLabel}>reservados</span>
            </div>
          </div>
        </div>
        <div style={s.abas}>
          {["painel", "reservas"].map(a => (
            <button key={a} onClick={() => setAba(a)} style={{ ...s.aba, ...(aba === a ? s.abaAtiva : {}) }}>
              {a === "painel" ? "Painel" : `Reservas${reservas.length > 0 ? ` (${reservas.length})` : ""}`}
            </button>
          ))}
        </div>
      </div>

      {/* ── ABA PAINEL ── */}
      {aba === "painel" && (
        <div style={s.body}>
          {TIPOS.map(t => {
            const v        = vendas[t.id] || { inteiro: 0, metade: 0 };
            const totalV   = v.inteiro + v.metade / 2;
            const resT     = reservasPorTipo(t.id);
            const totalR   = resT.reduce((s, r) => s + (r.tamanho === "inteiro" ? r.qtd : r.qtd / 2), 0);
            const lim      = limites[t.id];
            const disp     = disponivel(t.id);
            const soloInt  = SOMENTE_INTEIRO.includes(t.id);
            const soVenda  = SO_VENDA.includes(t.id);
            const esgotado = disp !== null && disp === 0;
            const pct      = lim ? Math.min(100, (consumido(t.id) / lim) * 100) : 0;
            const barColor = pct >= 90 ? "#c0392b" : pct >= 70 ? "#e67e22" : "#5dbe8a";

            return (
              <div key={t.id} style={{ ...s.card, borderLeft: `4px solid ${t.cor}` }}>
                <div style={s.cardHeader}>
                  <span style={s.cardEmoji}>{t.emoji}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={s.cardTipo}>{t.label}</span>
                      {soloInt && <span style={s.tag}>só inteiro</span>}
                    </div>
                    <div style={s.cardSub}>
                      <span style={{ color: "#aaa" }}>{fmt(totalV)} vendido{totalV !== 1 ? "s" : ""}</span>
                      {totalR > 0 && <span style={{ color: "#5dbe8a", marginLeft: 8 }}>· {fmt(totalR)} reservado{totalR !== 1 ? "s" : ""}</span>}
                    </div>
                  </div>
                  <button onClick={() => abrirLimite(t.id)} style={s.limiteTag}>
                    {lim !== null ? `Limite: ${lim}` : "Sem limite"}
                  </button>
                </div>

                {/* Disponibilidade */}
                {lim !== null && (
                  <div style={{ marginBottom: 12, background: esgotado ? "#1e0a0a" : "#0d1f12", border: `1.5px solid ${esgotado ? "#5a1a1a" : barColor}33`, borderRadius: 10, padding: "10px 12px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 0.5 }}>Disponível</span>
                      {esgotado
                        ? <span style={{ color: "#c0392b", fontWeight: 800, fontSize: 15 }}>⛔ Esgotado</span>
                        : <span style={{ color: barColor, fontWeight: 800, fontSize: 26, lineHeight: 1 }}>{fmt(disp)} <span style={{ fontSize: 13, color: "#444", fontWeight: 400 }}>/ {lim}</span></span>
                      }
                    </div>
                    <div style={{ background: "#1a1a1a", borderRadius: 4, height: 6, overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 4, width: `${pct}%`, background: barColor, transition: "width .3s" }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#444", marginTop: 5 }}>
                      <span>{fmt(v.inteiro + v.metade / 2)} vendido{totalV !== 1 ? "s" : ""}</span>
                      <span>{fmt(totalR)} reservado{totalR !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                )}

                {/* Contadores */}
                {soloInt ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
                    <Cell label="Vendidos"   valor={v.inteiro} />
                    <Cell label="Reservados" valor={resT.reduce((s,r)=>s+r.qtd,0)} accent="#5dbe8a" />
                  </div>
                ) : (
                  <div style={s.cells}>
                    <Cell label="Inteiro vendido"   valor={v.inteiro} />
                    <Cell label="Metade vendida"    valor={v.metade} />
                    <Cell label="Inteiro reservado" valor={resT.filter(r=>r.tamanho==="inteiro").reduce((s,r)=>s+r.qtd,0)} accent="#5dbe8a" />
                    <Cell label="Metade reservada"  valor={resT.filter(r=>r.tamanho==="metade").reduce((s,r)=>s+r.qtd,0)}  accent="#5dbe8a" />
                  </div>
                )}

                {/* Botões */}
                {soloInt ? (
                  <div style={{ display: "grid", gridTemplateColumns: soVenda ? "1fr" : "1fr 1fr", gap: 6 }}>
                    <Btn label="+ Espeto inteiro" onClick={() => abrirModal("vender",   t.id, "inteiro")} cor={t.cor}    disabled={esgotado} />
                    {!soVenda && <Btn label="+ Reservar" onClick={() => abrirModal("reservar", t.id, "inteiro")} cor="#3a7a5a" disabled={esgotado} />}
                  </div>
                ) : (
                  <div style={s.botoesGrid}>
                    <Btn label="+ Espeto inteiro"   onClick={() => abrirModal("vender",   t.id, "inteiro")} cor={t.cor}    disabled={esgotado} />
                    <Btn label="+ Meio espeto"      onClick={() => abrirModal("vender",   t.id, "metade")}  cor={t.cor}    outline disabled={esgotado} />
                    <Btn label="+ Reservar inteiro" onClick={() => abrirModal("reservar", t.id, "inteiro")} cor="#3a7a5a"  disabled={esgotado} />
                    <Btn label="+ Reservar meio"    onClick={() => abrirModal("reservar", t.id, "metade")}  cor="#3a7a5a"  outline disabled={esgotado} />
                  </div>
                )}
              </div>
            );
          })}

          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            <button onClick={exportarPDF} style={{ ...s.resetBtn, marginTop: 0, flex: 1, color: "#E8A045", borderColor: "#3a2a10" }}>
              📄 Exportar PDF
            </button>
            <button onClick={abrirReset} style={{ ...s.resetBtn, marginTop: 0, flex: 1 }}>
              Resetar dia
            </button>
          </div>
        </div>
      )}

      {/* ── ABA RESERVAS ── */}
      {aba === "reservas" && (
        <div style={s.body}>
          {/* Busca */}
          {reservas.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <input
                placeholder="🔍 Buscar por nome..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
                style={{ ...s.input, fontSize: 15 }}
              />
            </div>
          )}

          {reservas.length === 0 ? (
            <div style={s.empty}>Nenhuma reserva ativa.<br/>Adicione pelo painel.</div>
          ) : busca.trim() ? (
            /* ── Modo busca: lista plana filtrada ── */
            (() => {
              const filtradas = reservas.filter(r =>
                r.nome.toLowerCase().includes(busca.trim().toLowerCase())
              );
              return filtradas.length === 0 ? (
                <div style={s.empty}>Nenhuma reserva encontrada para "{busca}".</div>
              ) : (
                filtradas.map(r => {
                  const t = TIPOS.find(x => x.id === r.tipoId);
                  return (
                    <div key={r.id} style={{ ...s.resCard, borderLeft: `4px solid ${t?.cor}` }}>
                      <div style={s.resTop}>
                        <span style={s.resEmoji}>{t?.emoji}</span>
                        <div style={{ flex: 1 }}>
                          <div style={s.resNome}>{r.nome}</div>
                          <div style={s.resInfo}>{r.qtd}× {t?.label} ({r.tamanho}) · {r.hora}</div>
                        </div>
                        <div style={s.resBtns}>
                          <button style={s.baixaBtn} onClick={() => setConfirmarBaixa(r)}>✓ Pago</button>
                          <button style={s.cancelBtn} onClick={() => cancelarReserva(r.id)}>✕</button>
                        </div>
                      </div>
                    </div>
                  );
                })
              );
            })()
          ) : (
            /* ── Modo normal: agrupado por tipo ── */
            TIPOS.map(t => {
              const resT = reservasPorTipo(t.id);
              if (resT.length === 0) return null;
              const totalR = resT.reduce((s, r) => s + (r.tamanho === "inteiro" ? r.qtd : r.qtd / 2), 0);
              return (
                <div key={t.id} style={{ marginBottom: 20 }}>
                  {/* Cabeçalho do grupo */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: `1px solid ${t.cor}33` }}>
                    <span style={{ fontSize: 20 }}>{t.emoji}</span>
                    <span style={{ fontWeight: 700, fontSize: 15, color: t.cor }}>{t.label}</span>
                    <span style={{ marginLeft: "auto", fontSize: 12, color: "#666", background: "#1a1a1a", borderRadius: 6, padding: "2px 8px" }}>
                      {resT.length} reserva{resT.length !== 1 ? "s" : ""} · {fmt(totalR)} espeto{totalR !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {/* Lista do grupo */}
                  {resT.map(r => (
                    <div key={r.id} style={{ ...s.resCard, borderLeft: `4px solid ${t.cor}`, marginBottom: 8 }}>
                      <div style={s.resTop}>
                        <div style={{ flex: 1 }}>
                          <div style={s.resNome}>{r.nome}</div>
                          <div style={s.resInfo}>{r.qtd}× {r.tamanho} · {r.hora}</div>
                        </div>
                        <div style={s.resBtns}>
                          <button style={s.baixaBtn} onClick={() => setConfirmarBaixa(r)}>✓ Pago</button>
                          <button style={s.cancelBtn} onClick={() => cancelarReserva(r.id)}>✕</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── MODAL VENDER / RESERVAR ── */}
      {modal && tipo && (() => {
        const max = maxPermitido();
        const semEstoque = max === 0;
        return (
          <div style={s.overlay} onClick={() => setModal(null)}>
            <div style={s.modalBox} onClick={e => e.stopPropagation()}>
              <div style={s.modalTitulo}>{tipo.emoji} {tipo.label}</div>
              <div style={s.modalSub}>{modal.tipo === "vender" ? "Vender" : "Reservar"} — {modal.tamanho === "inteiro" ? "espeto inteiro" : "meio espeto"}</div>
              {semEstoque ? (
                <div style={{ color: "#c0392b", textAlign: "center", marginBottom: 24, fontSize: 15 }}>⛔ Quantidade disponível esgotada.</div>
              ) : (
                <>
                  {modal.tipo === "reservar" && (
                    <div style={s.inputWrap}>
                      <input autoFocus placeholder="Nome do cliente" value={nome}
                        onChange={e => setNome(e.target.value)} style={s.input} />
                    </div>
                  )}
                  <div style={s.qtdRow}>
                    <button style={s.qtdBtn} onClick={() => setQtd(q => Math.max(1, q - 1))}>−</button>
                    <div style={{ textAlign: "center" }}>
                      <span style={s.qtdNum}>{qtd}</span>
                      {max < 99 && <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>máx {max}</div>}
                    </div>
                    <button style={s.qtdBtn} onClick={() => setQtd(q => Math.min(max, q + 1))}>+</button>
                  </div>
                  <button
                    style={{ ...s.confirmarBtn, background: modal.tipo === "vender" ? tipo.cor : "#3a7a5a", opacity: modal.tipo === "reservar" && !nome.trim() ? 0.4 : 1 }}
                    onClick={confirmar}
                    disabled={modal.tipo === "reservar" && !nome.trim()}
                  >Confirmar</button>
                </>
              )}
              <button style={s.cancelarBtn} onClick={() => setModal(null)}>Cancelar</button>
            </div>
          </div>
        );
      })()}

      {/* ── MODAL DAR BAIXA ── */}
      {confirmarBaixa && (
        <div style={s.overlay} onClick={() => setConfirmarBaixa(null)}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitulo}>Confirmar pagamento</div>
            <div style={{ color: "#aaa", fontSize: 15, marginBottom: 6 }}>
              <strong style={{ color: "#f0f0f0" }}>{confirmarBaixa.nome}</strong>
            </div>
            <div style={{ color: "#666", fontSize: 13, marginBottom: 28 }}>
              {confirmarBaixa.qtd}× {TIPOS.find(t=>t.id===confirmarBaixa.tipoId)?.label} ({confirmarBaixa.tamanho})
            </div>
            <button style={{ ...s.confirmarBtn, background: "#3a7a5a", marginBottom: 10 }} onClick={() => darBaixa(confirmarBaixa)}>✓ Pagou — dar baixa</button>
            <button style={{ ...s.confirmarBtn, background: "#5a1a1a", marginBottom: 10 }} onClick={() => cancelarReserva(confirmarBaixa.id)}>✕ Cancelar reserva</button>
            <button style={s.cancelarBtn} onClick={() => setConfirmarBaixa(null)}>Voltar</button>
          </div>
        </div>
      )}

      {/* ── MODAL LIMITE ── */}
      {modalLimite && tipoLimite && (
        <div style={s.overlay} onClick={() => setModalLimite(null)}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitulo}>{tipoLimite.emoji} {tipoLimite.label}</div>
            <div style={s.modalSub}>Quantidade disponível hoje</div>
            <div style={s.inputWrap}>
              <input autoFocus type="number" min="1" placeholder="Ex: 50 (vazio = sem limite)"
                value={limiteInput} onChange={e => setLimiteInput(e.target.value)} style={s.input} />
            </div>
            <button style={{ ...s.confirmarBtn, background: tipoLimite.cor }} onClick={salvarLimite}>Salvar</button>
            {limites[modalLimite] !== null && (
              <button style={{ ...s.confirmarBtn, background: "#2a2a2a", marginBottom: 4 }}
                onClick={() => { setLimiteInput(""); setTimeout(salvarLimite, 0); }}>
                Remover limite
              </button>
            )}
            <button style={s.cancelarBtn} onClick={() => setModalLimite(null)}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ── MODAL RESET ── */}
      {modalReset && (
        <div style={s.overlay} onClick={() => setModalReset(false)}>
          <div style={s.modalBox} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitulo}>🔒 Resetar dia</div>
            <div style={s.modalSub}>Digite a senha para confirmar</div>
            <div style={s.inputWrap}>
              <input autoFocus type="password" placeholder="Senha" value={senhaInput}
                onChange={e => { setSenhaInput(e.target.value); setSenhaErro(false); }}
                onKeyDown={e => e.key === "Enter" && confirmarReset()}
                style={{ ...s.input, borderColor: senhaErro ? "#c0392b" : "#3a3a3a" }} />
              {senhaErro && <div style={{ color: "#c0392b", fontSize: 12, marginTop: 6 }}>Senha incorreta.</div>}
            </div>
            <button style={{ ...s.confirmarBtn, background: "#5a1a1a" }} onClick={confirmarReset}>Confirmar reset</button>
            <button style={s.cancelarBtn} onClick={() => setModalReset(false)}>Cancelar</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Cell({ label, valor, accent = "#E8A045" }) {
  return (
    <div style={s.cell}>
      <div style={{ ...s.cellNum, color: accent }}>{valor}</div>
      <div style={s.cellLabel}>{label}</div>
    </div>
  );
}

function Btn({ label, onClick, cor, outline, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...s.btn,
      background: outline ? "transparent" : cor,
      border: `1.5px solid ${cor}`,
      color: outline ? cor : "#fff",
      opacity: disabled ? 0.3 : 1,
      cursor: disabled ? "not-allowed" : "pointer",
    }}>{label}</button>
  );
}

const s = {
  root: { minHeight: "100vh", background: "#111", color: "#f0f0f0", fontFamily: "'Inter', sans-serif", maxWidth: 520, margin: "0 auto" },
  header: { background: "#1a1a1a", borderBottom: "1px solid #2a2a2a", position: "sticky", top: 0, zIndex: 10 },
  headerInner: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px 10px" },
  logo: { fontSize: 22, fontWeight: 800, letterSpacing: -0.5 },
  logoSub: { fontSize: 12, marginTop: 1 },
  badges: { display: "flex", gap: 8 },
  badge: { padding: "6px 12px", borderRadius: 8, textAlign: "center", minWidth: 64 },
  badgeNum: { display: "block", fontSize: 20, fontWeight: 800, color: "#E8A045", lineHeight: 1 },
  badgeLabel: { display: "block", fontSize: 10, color: "#666", marginTop: 2 },
  abas: { display: "flex", borderTop: "1px solid #222" },
  aba: { flex: 1, background: "none", border: "none", color: "#666", padding: "10px 0", fontSize: 14, cursor: "pointer", fontFamily: "inherit" },
  abaAtiva: { color: "#E8A045", borderBottom: "2px solid #E8A045", fontWeight: 700 },
  body: { padding: "12px 12px 32px" },
  card: { background: "#1a1a1a", borderRadius: 12, padding: 14, marginBottom: 12 },
  cardHeader: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 },
  cardEmoji: { fontSize: 28 },
  cardTipo: { fontWeight: 700, fontSize: 17 },
  cardSub: { fontSize: 12, marginTop: 2 },
  tag: { fontSize: 10, background: "#2a2a2a", color: "#666", borderRadius: 4, padding: "2px 6px" },
  limiteTag: { fontSize: 11, background: "#222", color: "#888", border: "1px solid #333", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" },
  cells: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6, marginBottom: 12 },
  cell: { background: "#111", borderRadius: 8, padding: "8px 4px", textAlign: "center" },
  cellNum: { fontSize: 22, fontWeight: 800, lineHeight: 1 },
  cellLabel: { fontSize: 9, color: "#555", marginTop: 3, lineHeight: 1.2 },
  botoesGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 },
  btn: { borderRadius: 8, padding: "9px 4px", fontSize: 12, fontFamily: "inherit", fontWeight: 600 },
  resetBtn: { width: "100%", background: "transparent", border: "1px solid #333", color: "#444", borderRadius: 8, padding: 10, fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  resCard: { background: "#1a1a1a", borderRadius: 12, padding: 14, marginBottom: 10 },
  resTop: { display: "flex", alignItems: "center", gap: 10 },
  resEmoji: { fontSize: 24 },
  resNome: { fontWeight: 700, fontSize: 16 },
  resInfo: { fontSize: 12, color: "#666", marginTop: 2 },
  resBtns: { display: "flex", gap: 6 },
  baixaBtn: { background: "#3a7a5a", border: "none", color: "#fff", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" },
  cancelBtn: { background: "#2a2a2a", border: "none", color: "#888", borderRadius: 8, padding: "8px 10px", fontSize: 14, cursor: "pointer", fontFamily: "inherit" },
  empty: { textAlign: "center", color: "#444", paddingTop: 60, fontSize: 15, lineHeight: 1.8 },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.8)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 100 },
  modalBox: { background: "#1e1e1e", borderRadius: "16px 16px 0 0", padding: "28px 24px 40px", width: "100%", maxWidth: 520 },
  modalTitulo: { fontSize: 22, fontWeight: 800, marginBottom: 4 },
  modalSub: { color: "#888", fontSize: 14, marginBottom: 20, textTransform: "capitalize" },
  inputWrap: { marginBottom: 16 },
  input: { width: "100%", background: "#2a2a2a", border: "1.5px solid #3a3a3a", color: "#f0f0f0", borderRadius: 10, padding: "12px 14px", fontSize: 16, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  qtdRow: { display: "flex", alignItems: "center", justifyContent: "center", gap: 28, marginBottom: 24 },
  qtdBtn: { width: 44, height: 44, borderRadius: "50%", background: "#2a2a2a", border: "none", color: "#fff", fontSize: 24, cursor: "pointer", fontFamily: "inherit" },
  qtdNum: { fontSize: 40, fontWeight: 800, minWidth: 50, textAlign: "center" },
  confirmarBtn: { width: "100%", border: "none", color: "#fff", borderRadius: 10, padding: 14, fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 },
  cancelarBtn: { width: "100%", background: "none", border: "none", color: "#555", fontSize: 14, cursor: "pointer", fontFamily: "inherit", padding: 8 },
};
