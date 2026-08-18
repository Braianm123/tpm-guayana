import React, { useState, useEffect, useMemo } from "react";

/* ============================================================
   TPM GUAYANA — Optimizador de Mantenimiento Preventivo
   Talleres y pequeñas plantas · Ciudad Guayana, Venezuela
   OEE = Disponibilidad × Rendimiento × Calidad
   ============================================================ */

const T = {
  bg: "#EDEFF2",
  panel: "#FFFFFF",
  ink: "#1B2430",
  inkSoft: "#5A6675",
  line: "#D4D9E0",
  steel: "#3A6EA5",
  orange: "#E85D04",
  ok: "#2E8B57",
  warn: "#D9A404",
  danger: "#C1272D",
};

const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
`;

const display = "'Barlow Condensed', 'Arial Narrow', sans-serif";
const body = "'IBM Plex Sans', system-ui, sans-serif";
const mono = "'IBM Plex Mono', Consolas, monospace";

const STORAGE_KEY = "tpm-guayana-datos";

const uid = () => Math.random().toString(36).slice(2, 9);
const hoy = () => new Date().toISOString().slice(0, 10);
const fmt = (n, d = 1) =>
  Number.isFinite(n) ? n.toLocaleString("es-VE", { maximumFractionDigits: d, minimumFractionDigits: 0 }) : "—";
const pct = (n) => (Number.isFinite(n) ? (n * 100).toFixed(1) + " %" : "—");

/* ---------- estado de mantenimiento (semáforo) ---------- */
function estadoMaquina(m) {
  const uso = m.intervaloMant > 0 ? m.horasDesdeMant / m.intervaloMant : 0;
  if (uso >= 0.9) return { nivel: "danger", color: T.danger, etiqueta: "URGENTE", uso };
  if (uso >= 0.75) return { nivel: "warn", color: T.warn, etiqueta: "PRÓXIMO", uso };
  return { nivel: "ok", color: T.ok, etiqueta: "OK", uso };
}

/* ---------- cálculo OEE ---------- */
function calcOEE({ tiempoPlan, paradas, piezas, defectuosas, cicloIdeal }) {
  const tp = +tiempoPlan, pa = +paradas, pz = +piezas, df = +defectuosas, ci = +cicloIdeal;
  const tiempoOp = tp - pa;
  const disp = tp > 0 ? tiempoOp / tp : NaN;
  const rend = tiempoOp > 0 ? (pz * ci) / tiempoOp : NaN;
  const cal = pz > 0 ? (pz - df) / pz : NaN;
  const oee = disp * rend * cal;
  return { disp, rend, cal, oee, tiempoOp };
}

function colorOEE(oee) {
  if (!Number.isFinite(oee)) return T.inkSoft;
  if (oee >= 0.85) return T.ok;
  if (oee >= 0.6) return T.warn;
  return T.danger;
}

/* ---------- franja de seguridad (firma visual) ---------- */
const Franja = ({ color }) => (
  <div
    aria-hidden="true"
    style={{
      width: 10,
      alignSelf: "stretch",
      borderRadius: "6px 0 0 6px",
      background: `repeating-linear-gradient(135deg, ${color}, ${color} 8px, ${T.ink} 8px, ${T.ink} 16px)`,
      flexShrink: 0,
    }}
  />
);

/* ---------- componentes de UI básicos ---------- */
const Field = ({ label, children }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 130 }}>
    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: T.inkSoft }}>
      {label}
    </span>
    {children}
  </label>
);

const inputStyle = {
  padding: "9px 10px",
  border: `1.5px solid ${T.line}`,
  borderRadius: 6,
  fontFamily: mono,
  fontSize: 14,
  color: T.ink,
  background: "#FAFBFC",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const btn = (bg, small) => ({
  padding: small ? "6px 12px" : "10px 18px",
  background: bg,
  color: "#fff",
  border: "none",
  borderRadius: 6,
  fontFamily: display,
  fontWeight: 600,
  fontSize: small ? 14 : 17,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  cursor: "pointer",
});

const btnGhost = (color) => ({
  padding: "6px 12px",
  background: "transparent",
  color,
  border: `1.5px solid ${color}`,
  borderRadius: 6,
  fontFamily: display,
  fontWeight: 600,
  fontSize: 14,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  cursor: "pointer",
});

/* ============================================================ */

export default function TPMGuayana() {
  const [maquinas, setMaquinas] = useState([]);
  const [registros, setRegistros] = useState([]); // registros OEE
  const [eventos, setEventos] = useState([]); // fallas y mantenimientos
  const [tab, setTab] = useState("tablero");
  const [cargado, setCargado] = useState(false);
  const [aviso, setAviso] = useState(null);

  /* ---- persistencia (localStorage: los datos quedan guardados en el dispositivo) ---- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        setMaquinas(d.maquinas || []);
        setRegistros(d.registros || []);
        setEventos(d.eventos || []);
      }
    } catch (e) {
      /* sin datos previos o almacenamiento no disponible */
    }
    setCargado(true);
  }, []);

  useEffect(() => {
    if (!cargado) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ maquinas, registros, eventos }));
    } catch (e) {
      /* almacenamiento lleno o no disponible: los datos viven en la sesión */
    }
  }, [maquinas, registros, eventos, cargado]);

  const notificar = (msg) => {
    setAviso(msg);
    setTimeout(() => setAviso(null), 2600);
  };

  /* ---- acciones ---- */
  const agregarMaquina = (m) => {
    setMaquinas((xs) => [...xs, { id: uid(), ...m, horasTotales: 0, horasDesdeMant: 0, fallas: 0 }]);
    notificar("Máquina agregada");
  };

  const registrarHoras = (id, horas) => {
    const h = +horas;
    if (!(h > 0)) return;
    setMaquinas((xs) =>
      xs.map((m) => (m.id === id ? { ...m, horasTotales: m.horasTotales + h, horasDesdeMant: m.horasDesdeMant + h } : m))
    );
    notificar(`+${h} h registradas`);
  };

  const registrarMantenimiento = (id) => {
    setMaquinas((xs) => xs.map((m) => (m.id === id ? { ...m, horasDesdeMant: 0 } : m)));
    const m = maquinas.find((x) => x.id === id);
    setEventos((es) => [{ id: uid(), maquinaId: id, tipo: "mantenimiento", fecha: hoy(), nota: `Preventivo a las ${fmt(m?.horasTotales)} h` }, ...es]);
    notificar("Mantenimiento registrado · contador en cero");
  };

  const registrarFalla = (id, nota) => {
    setMaquinas((xs) => xs.map((m) => (m.id === id ? { ...m, fallas: m.fallas + 1 } : m)));
    setEventos((es) => [{ id: uid(), maquinaId: id, tipo: "falla", fecha: hoy(), nota: nota || "Falla no especificada" }, ...es]);
    notificar("Falla registrada");
  };

  const eliminarMaquina = (id) => {
    setMaquinas((xs) => xs.filter((m) => m.id !== id));
    setRegistros((rs) => rs.filter((r) => r.maquinaId !== id));
    setEventos((es) => es.filter((e) => e.maquinaId !== id));
  };

  const guardarOEE = (reg) => {
    setRegistros((rs) => [{ id: uid(), fecha: hoy(), ...reg }, ...rs]);
    notificar("Registro OEE guardado");
  };

  /* ---- alertas ---- */
  const alertas = useMemo(
    () =>
      maquinas
        .map((m) => ({ m, e: estadoMaquina(m) }))
        .filter((x) => x.e.nivel !== "ok")
        .sort((a, b) => b.e.uso - a.e.uso),
    [maquinas]
  );

  const tabs = [
    ["tablero", "Tablero"],
    ["maquinas", "Máquinas"],
    ["oee", "Registrar OEE"],
    ["historial", "Historial"],
  ];

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: body, color: T.ink }}>
      <style>{FONTS}</style>
      <style>{`
        input:focus, select:focus { border-color: ${T.steel} !important; }
        button:focus-visible { outline: 3px solid ${T.steel}; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
      `}</style>

      {/* ---------- encabezado ---------- */}
      <header style={{ background: T.ink, color: "#fff", padding: "18px 16px 0" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ fontFamily: display, fontWeight: 700, fontSize: 34, margin: 0, letterSpacing: "0.02em", textTransform: "uppercase" }}>
              TPM Guayana
            </h1>
            <span style={{ fontFamily: mono, fontSize: 12, color: "#9FB3C8" }}>
              Mantenimiento preventivo · Ciudad Guayana
            </span>
          </div>
          <p style={{ margin: "4px 0 14px", fontSize: 13, color: "#C3CDD8", maxWidth: 560 }}>
            Registra horas-máquina, calcula el OEE por turno y anticipa fallas con el semáforo de mantenimiento.
          </p>
          <nav style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
            {tabs.map(([k, lbl]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                style={{
                  padding: "10px 16px",
                  background: tab === k ? T.bg : "transparent",
                  color: tab === k ? T.ink : "#C3CDD8",
                  border: "none",
                  borderRadius: "8px 8px 0 0",
                  fontFamily: display,
                  fontWeight: 600,
                  fontSize: 16,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                {lbl}
                {k === "tablero" && alertas.length > 0 && (
                  <span style={{ marginLeft: 6, background: T.danger, color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 12, fontFamily: mono }}>
                    {alertas.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {/* ---------- aviso ---------- */}
      {aviso && (
        <div style={{ position: "fixed", top: 12, right: 12, zIndex: 50, background: T.ink, color: "#fff", padding: "10px 16px", borderRadius: 6, fontFamily: mono, fontSize: 13, borderLeft: `5px solid ${T.orange}` }}>
          {aviso}
        </div>
      )}

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "20px 16px 60px" }}>
        {tab === "tablero" && (
          <Tablero maquinas={maquinas} registros={registros} eventos={eventos} alertas={alertas} irA={setTab} />
        )}
        {tab === "maquinas" && (
          <Maquinas
            maquinas={maquinas}
            onAgregar={agregarMaquina}
            onHoras={registrarHoras}
            onMant={registrarMantenimiento}
            onFalla={registrarFalla}
            onEliminar={eliminarMaquina}
          />
        )}
        {tab === "oee" && <FormOEE maquinas={maquinas} onGuardar={guardarOEE} />}
        {tab === "historial" && <Historial maquinas={maquinas} registros={registros} eventos={eventos} />}
      </main>
    </div>
  );
}

/* ============================================================
   TABLERO
   ============================================================ */
function Tablero({ maquinas, registros, alertas, irA }) {
  const oeePorMaquina = (id) => {
    const rs = registros.filter((r) => r.maquinaId === id);
    if (!rs.length) return null;
    const prom = rs.reduce((s, r) => s + r.oee, 0) / rs.length;
    return { ultimo: rs[0].oee, prom, n: rs.length };
  };

  if (!maquinas.length)
    return (
      <div style={{ background: T.panel, border: `1.5px solid ${T.line}`, borderRadius: 8, padding: 32, textAlign: "center" }}>
        <p style={{ fontFamily: display, fontSize: 24, fontWeight: 600, margin: "0 0 8px", textTransform: "uppercase" }}>
          Sin máquinas registradas
        </p>
        <p style={{ color: T.inkSoft, margin: "0 0 18px" }}>
          Agrega la primera máquina del taller para empezar a seguir sus horas y su OEE.
        </p>
        <button style={btn(T.orange)} onClick={() => irA("maquinas")}>Agregar máquina</button>
      </div>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* alertas */}
      <section>
        <h2 style={h2Style}>Alertas de mantenimiento</h2>
        {!alertas.length ? (
          <div style={{ display: "flex", background: T.panel, border: `1.5px solid ${T.line}`, borderRadius: 8, overflow: "hidden" }}>
            <Franja color={T.ok} />
            <p style={{ padding: 14, margin: 0, color: T.inkSoft }}>
              Todo en orden: ninguna máquina se acerca a su intervalo de mantenimiento.
            </p>
          </div>
        ) : (
          alertas.map(({ m, e }) => (
            <div key={m.id} style={{ display: "flex", background: T.panel, border: `1.5px solid ${T.line}`, borderRadius: 8, marginBottom: 8, overflow: "hidden" }}>
              <Franja color={e.color} />
              <div style={{ padding: "12px 14px", flex: 1 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                  <strong style={{ fontFamily: display, fontSize: 19, textTransform: "uppercase" }}>{m.nombre}</strong>
                  <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 600, color: e.color }}>{e.etiqueta}</span>
                </div>
                <div style={{ fontFamily: mono, fontSize: 13, color: T.inkSoft, marginTop: 2 }}>
                  {fmt(m.horasDesdeMant)} / {fmt(m.intervaloMant)} h desde el último preventivo ({(e.uso * 100).toFixed(0)} % del intervalo)
                </div>
                <div style={{ height: 6, background: T.line, borderRadius: 3, marginTop: 8 }}>
                  <div style={{ height: 6, width: `${Math.min(e.uso, 1) * 100}%`, background: e.color, borderRadius: 3 }} />
                </div>
              </div>
            </div>
          ))
        )}
      </section>

      {/* indicadores */}
      <section>
        <h2 style={h2Style}>Indicadores por máquina</h2>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
          {maquinas.map((m) => {
            const e = estadoMaquina(m);
            const o = oeePorMaquina(m.id);
            const mtbf = m.fallas > 0 ? m.horasTotales / m.fallas : null;
            return (
              <div key={m.id} style={{ display: "flex", background: T.panel, border: `1.5px solid ${T.line}`, borderRadius: 8, overflow: "hidden" }}>
                <Franja color={e.color} />
                <div style={{ padding: "12px 14px", flex: 1 }}>
                  <strong style={{ fontFamily: display, fontSize: 19, textTransform: "uppercase" }}>{m.nombre}</strong>
                  <div style={{ fontSize: 12, color: T.inkSoft }}>{m.tipo}</div>
                  <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontFamily: mono, fontSize: 13 }}>
                    <Dato etiqueta="OEE último" valor={o ? pct(o.ultimo) : "—"} color={o ? colorOEE(o.ultimo) : T.inkSoft} />
                    <Dato etiqueta={`OEE prom (${o ? o.n : 0})`} valor={o ? pct(o.prom) : "—"} color={o ? colorOEE(o.prom) : T.inkSoft} />
                    <Dato etiqueta="Horas totales" valor={fmt(m.horasTotales) + " h"} />
                    <Dato etiqueta="MTBF" valor={mtbf ? fmt(mtbf) + " h" : "sin fallas"} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: 12, color: T.inkSoft, marginTop: 10 }}>
          Referencia de clase mundial: OEE ≥ 85 %. Semáforo de mantenimiento: verde &lt; 75 % del intervalo · amarillo 75–90 % · rojo ≥ 90 %.
        </p>
      </section>
    </div>
  );
}

const h2Style = {
  fontFamily: display,
  fontSize: 22,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  margin: "0 0 10px",
  borderBottom: `3px solid ${T.orange}`,
  display: "inline-block",
  paddingBottom: 2,
};

const Dato = ({ etiqueta, valor, color }) => (
  <div>
    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: T.inkSoft, fontFamily: body }}>{etiqueta}</div>
    <div style={{ fontWeight: 600, color: color || T.ink }}>{valor}</div>
  </div>
);

/* ============================================================
   MÁQUINAS
   ============================================================ */
function Maquinas({ maquinas, onAgregar, onHoras, onMant, onFalla, onEliminar }) {
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState("");
  const [intervalo, setIntervalo] = useState("250");
  const [horasInput, setHorasInput] = useState({});
  const [fallaInput, setFallaInput] = useState({});

  const agregar = () => {
    if (!nombre.trim() || !(+intervalo > 0)) return;
    onAgregar({ nombre: nombre.trim(), tipo: tipo.trim() || "General", intervaloMant: +intervalo });
    setNombre(""); setTipo(""); setIntervalo("250");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <section style={{ background: T.panel, border: `1.5px solid ${T.line}`, borderRadius: 8, padding: 16 }}>
        <h2 style={h2Style}>Nueva máquina</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
          <Field label="Nombre / código">
            <input style={inputStyle} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Torno CNC-01" />
          </Field>
          <Field label="Tipo">
            <input style={inputStyle} value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Torno, prensa, compresor…" />
          </Field>
          <Field label="Intervalo mant. (h)">
            <input style={inputStyle} type="number" min="1" value={intervalo} onChange={(e) => setIntervalo(e.target.value)} />
          </Field>
        </div>
        <button style={{ ...btn(T.orange), marginTop: 12 }} onClick={agregar}>Agregar máquina</button>
      </section>

      {maquinas.map((m) => {
        const e = estadoMaquina(m);
        return (
          <div key={m.id} style={{ display: "flex", background: T.panel, border: `1.5px solid ${T.line}`, borderRadius: 8, overflow: "hidden" }}>
            <Franja color={e.color} />
            <div style={{ padding: 14, flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 6 }}>
                <div>
                  <strong style={{ fontFamily: display, fontSize: 20, textTransform: "uppercase" }}>{m.nombre}</strong>
                  <span style={{ marginLeft: 8, fontSize: 12, color: T.inkSoft }}>{m.tipo}</span>
                </div>
                <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 600, color: e.color }}>{e.etiqueta}</span>
              </div>
              <div style={{ fontFamily: mono, fontSize: 13, color: T.inkSoft, margin: "4px 0 10px" }}>
                {fmt(m.horasDesdeMant)} / {fmt(m.intervaloMant)} h del intervalo · {fmt(m.horasTotales)} h totales · {m.fallas} falla{m.fallas === 1 ? "" : "s"}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  style={{ ...inputStyle, width: 90 }}
                  type="number" min="0.5" step="0.5"
                  placeholder="Horas"
                  value={horasInput[m.id] || ""}
                  onChange={(ev) => setHorasInput({ ...horasInput, [m.id]: ev.target.value })}
                />
                <button style={btn(T.steel, true)} onClick={() => { onHoras(m.id, horasInput[m.id]); setHorasInput({ ...horasInput, [m.id]: "" }); }}>
                  + Horas trabajadas
                </button>
                <button style={btn(T.ok, true)} onClick={() => onMant(m.id)}>Mantenimiento hecho</button>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
                <input
                  style={{ ...inputStyle, flex: 1, minWidth: 160 }}
                  placeholder="Descripción de la falla (opcional)"
                  value={fallaInput[m.id] || ""}
                  onChange={(ev) => setFallaInput({ ...fallaInput, [m.id]: ev.target.value })}
                />
                <button style={btn(T.danger, true)} onClick={() => { onFalla(m.id, fallaInput[m.id]); setFallaInput({ ...fallaInput, [m.id]: "" }); }}>
                  Registrar falla
                </button>
                <button style={btnGhost(T.inkSoft)} onClick={() => { if (window.confirm(`¿Eliminar ${m.nombre} y todos sus registros?`)) onEliminar(m.id); }}>
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   FORMULARIO OEE
   ============================================================ */
function FormOEE({ maquinas, onGuardar }) {
  const [maquinaId, setMaquinaId] = useState("");
  const [f, setF] = useState({ tiempoPlan: "480", paradas: "0", piezas: "", defectuosas: "0", cicloIdeal: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const res = useMemo(() => calcOEE(f), [f]);
  const listo = maquinaId && Number.isFinite(res.oee) && res.oee >= 0;

  const guardar = () => {
    if (!listo) return;
    onGuardar({
      maquinaId,
      tiempoPlan: +f.tiempoPlan, paradas: +f.paradas, piezas: +f.piezas,
      defectuosas: +f.defectuosas, cicloIdeal: +f.cicloIdeal,
      disp: res.disp, rend: res.rend, cal: res.cal, oee: res.oee,
    });
    setF({ ...f, paradas: "0", piezas: "", defectuosas: "0" });
  };

  if (!maquinas.length)
    return <p style={{ color: T.inkSoft }}>Primero agrega una máquina en la pestaña <strong>Máquinas</strong>.</p>;

  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr", maxWidth: 720 }}>
      <section style={{ background: T.panel, border: `1.5px solid ${T.line}`, borderRadius: 8, padding: 16 }}>
        <h2 style={h2Style}>Datos del turno</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
          <Field label="Máquina">
            <select style={inputStyle} value={maquinaId} onChange={(e) => setMaquinaId(e.target.value)}>
              <option value="">Selecciona…</option>
              {maquinas.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </Field>
          <Field label="Tiempo planificado (min)">
            <input style={inputStyle} type="number" min="1" value={f.tiempoPlan} onChange={set("tiempoPlan")} />
          </Field>
          <Field label="Paradas no planif. (min)">
            <input style={inputStyle} type="number" min="0" value={f.paradas} onChange={set("paradas")} />
          </Field>
          <Field label="Piezas producidas">
            <input style={inputStyle} type="number" min="0" value={f.piezas} onChange={set("piezas")} placeholder="0" />
          </Field>
          <Field label="Piezas defectuosas">
            <input style={inputStyle} type="number" min="0" value={f.defectuosas} onChange={set("defectuosas")} />
          </Field>
          <Field label="Ciclo ideal (min/pieza)">
            <input style={inputStyle} type="number" min="0" step="0.01" value={f.cicloIdeal} onChange={set("cicloIdeal")} placeholder="1.50" />
          </Field>
        </div>
      </section>

      <section style={{ background: T.ink, color: "#fff", borderRadius: 8, padding: 16 }}>
        <h2 style={{ ...h2Style, color: "#fff", borderBottomColor: T.orange }}>Resultado</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginTop: 10, fontFamily: mono }}>
          {[
            ["Disponibilidad", res.disp],
            ["Rendimiento", res.rend],
            ["Calidad", res.cal],
          ].map(([lbl, v]) => (
            <div key={lbl}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9FB3C8", fontFamily: body }}>{lbl}</div>
              <div style={{ fontSize: 22, fontWeight: 600 }}>{pct(v)}</div>
            </div>
          ))}
          <div style={{ borderLeft: `3px solid ${T.orange}`, paddingLeft: 12 }}>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em", color: "#9FB3C8", fontFamily: body }}>OEE</div>
            <div style={{ fontSize: 30, fontWeight: 700, color: Number.isFinite(res.oee) ? (res.oee >= 0.85 ? "#6FCF97" : res.oee >= 0.6 ? "#F2C94C" : "#EB5757") : "#9FB3C8" }}>
              {pct(res.oee)}
            </div>
          </div>
        </div>
        {Number.isFinite(res.rend) && res.rend > 1.05 && (
          <p style={{ fontSize: 12, color: "#F2C94C", marginTop: 10 }}>
            Rendimiento &gt; 100 %: revisa el tiempo de ciclo ideal, probablemente está sobreestimado.
          </p>
        )}
        <button style={{ ...btn(T.orange), marginTop: 14, opacity: listo ? 1 : 0.5 }} disabled={!listo} onClick={guardar}>
          Guardar registro
        </button>
      </section>
    </div>
  );
}

/* ============================================================
   HISTORIAL
   ============================================================ */
function Historial({ maquinas, registros, eventos }) {
  const nombre = (id) => maquinas.find((m) => m.id === id)?.nombre || "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section>
        <h2 style={h2Style}>Registros OEE</h2>
        {!registros.length ? (
          <p style={{ color: T.inkSoft }}>Aún no hay registros. Captura el primer turno en <strong>Registrar OEE</strong>.</p>
        ) : (
          <div style={{ overflowX: "auto", background: T.panel, border: `1.5px solid ${T.line}`, borderRadius: 8 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: mono, fontSize: 13 }}>
              <thead>
                <tr style={{ background: T.ink, color: "#fff", fontFamily: display, fontSize: 14, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  {["Fecha", "Máquina", "Disp.", "Rend.", "Cal.", "OEE"].map((h) => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {registros.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 ? "#F5F7F9" : "#fff" }}>
                    <td style={td}>{r.fecha}</td>
                    <td style={td}>{nombre(r.maquinaId)}</td>
                    <td style={td}>{pct(r.disp)}</td>
                    <td style={td}>{pct(r.rend)}</td>
                    <td style={td}>{pct(r.cal)}</td>
                    <td style={{ ...td, fontWeight: 600, color: colorOEE(r.oee) }}>{pct(r.oee)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 style={h2Style}>Fallas y mantenimientos</h2>
        {!eventos.length ? (
          <p style={{ color: T.inkSoft }}>Sin eventos registrados todavía.</p>
        ) : (
          eventos.map((e) => (
            <div key={e.id} style={{ display: "flex", background: T.panel, border: `1.5px solid ${T.line}`, borderRadius: 8, marginBottom: 8, overflow: "hidden" }}>
              <Franja color={e.tipo === "falla" ? T.danger : T.ok} />
              <div style={{ padding: "10px 14px", fontSize: 13 }}>
                <span style={{ fontFamily: mono, color: T.inkSoft }}>{e.fecha}</span>{" "}
                <strong style={{ fontFamily: display, fontSize: 16, textTransform: "uppercase" }}>{nombre(e.maquinaId)}</strong>{" "}
                <span style={{ color: e.tipo === "falla" ? T.danger : T.ok, fontWeight: 600 }}>
                  {e.tipo === "falla" ? "FALLA" : "PREVENTIVO"}
                </span>
                <div style={{ color: T.inkSoft }}>{e.nota}</div>
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

const td = { padding: "8px 12px", whiteSpace: "nowrap" };
