import React, { useState, useEffect, useMemo, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

/* ============================================================
   TPM GUAYANA — Optimizador de Mantenimiento Preventivo
   Talleres y pequeñas plantas · Ciudad Guayana, Venezuela
   VERSIÓN 2: causas de parada, Pareto, tendencia OEE,
   exportación CSV, ayuda contextual, guía e interpretación.
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

/* ================= CONFIGURACIÓN DE SUPABASE =================
   Pega aquí los DOS valores de tu proyecto de Supabase:
   Supabase → Settings → API → "Project URL" y "anon public" key.
   ============================================================= */
const SUPABASE_URL = "https://rqesuuaojeufkhltsjbi.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxZXN1dWFvamV1ZmtobHRzamJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxODUwMjgsImV4cCI6MjEwMjc2MTAyOH0.3xlwg5vozoafC-_0EvNtrDWAeVL2M-h2N1VvG--qRMY";

const supabase = SUPABASE_URL.startsWith("https://")
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

/* ---------- mapeo app (camelCase) ⇄ base de datos (snake_case) ---------- */
const aMaquinaDB = (m, userId) => ({
  id: m.id, user_id: userId, nombre: m.nombre, tipo: m.tipo,
  intervalo_mant: m.intervaloMant, horas_totales: m.horasTotales,
  horas_desde_mant: m.horasDesdeMant, fallas: m.fallas,
});
const deMaquinaDB = (r) => ({
  id: r.id, nombre: r.nombre, tipo: r.tipo, intervaloMant: +r.intervalo_mant,
  horasTotales: +r.horas_totales, horasDesdeMant: +r.horas_desde_mant, fallas: r.fallas,
});
const aRegistroDB = (r, userId) => ({
  id: r.id, user_id: userId, maquina_id: r.maquinaId, fecha: r.fecha,
  tiempo_plan: r.tiempoPlan, paradas: r.paradas, causa: r.causa || "",
  piezas: r.piezas, defectuosas: r.defectuosas, ciclo_ideal: r.cicloIdeal,
  disp: r.disp, rend: r.rend, cal: r.cal, oee: r.oee,
});
const deRegistroDB = (r) => ({
  id: r.id, maquinaId: r.maquina_id, fecha: r.fecha, tiempoPlan: +r.tiempo_plan,
  paradas: +r.paradas, causa: r.causa || "", piezas: +r.piezas,
  defectuosas: +r.defectuosas, cicloIdeal: +r.ciclo_ideal,
  disp: r.disp, rend: r.rend, cal: r.cal, oee: r.oee,
});
const aEventoDB = (e, userId) => ({
  id: e.id, user_id: userId, maquina_id: e.maquinaId, tipo: e.tipo, fecha: e.fecha, nota: e.nota,
});
const deEventoDB = (r) => ({
  id: r.id, maquinaId: r.maquina_id, tipo: r.tipo, fecha: r.fecha, nota: r.nota,
});

const CAUSAS_PARADA = [
  "Falla mecánica",
  "Falla eléctrica",
  "Falta de material",
  "Corte de energía",
  "Ajuste / cambio de producto",
  "Falta de operario",
  "Otra",
];

const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
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

/* ---------- interpretación automática del OEE ---------- */
function interpretarOEE(res) {
  if (!Number.isFinite(res.oee)) return null;
  const o = res.oee;
  let nivel;
  if (o >= 0.85) nivel = "Nivel de clase mundial: la máquina aprovecha casi todo su potencial.";
  else if (o >= 0.6) nivel = "Nivel aceptable, pero con margen claro de mejora.";
  else if (o >= 0.4) nivel = "Nivel bajo: es el rango típico de talleres sin gestión formal de mantenimiento.";
  else nivel = "Nivel crítico: la máquina pierde más de la mitad de su capacidad productiva.";

  const comps = [
    { n: "Disponibilidad", v: res.disp, msg: "la mayor pérdida fueron las PARADAS. Revisa las causas de parada de este turno y prioriza reducirlas." },
    { n: "Rendimiento", v: res.rend, msg: "la mayor pérdida fue la VELOCIDAD: la máquina produjo más lento que su ritmo ideal (microparadas, ritmo reducido)." },
    { n: "Calidad", v: res.cal, msg: "la mayor pérdida fueron los DEFECTOS: revisa ajustes, herramientas o materia prima." },
  ].filter((c) => Number.isFinite(c.v));
  if (!comps.length) return nivel;
  const peor = comps.reduce((a, b) => (b.v < a.v ? b : a));
  return `${nivel} El factor más débil fue ${peor.n} (${pct(peor.v)}): ${peor.msg}`;
}

/* ---------- exportación CSV (formato Excel en español: ; y coma decimal) ---------- */
function descargarCSV(nombreArchivo, filas) {
  const esc = (v) => {
    if (v === null || v === undefined) return "";
    let s = typeof v === "number" ? String(v).replace(".", ",") : String(v);
    if (s.includes(";") || s.includes('"') || s.includes("\n")) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const csv = "\uFEFF" + filas.map((f) => f.map(esc).join(";")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

/* ---------- ayuda contextual: icono ⓘ con explicación desplegable ---------- */
function Ayuda({ texto }) {
  const [abierta, setAbierta] = useState(false);
  const ultimoPuntero = useRef("mouse");
  return (
    <span
      style={{ position: "relative", display: "inline-block" }}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") setAbierta(true); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") setAbierta(false); }}
    >
      <button
        onPointerDown={(e) => { ultimoPuntero.current = e.pointerType; }}
        onClick={(e) => {
          e.stopPropagation();
          /* en pantallas táctiles (sin cursor) el toque abre/cierra; con mouse basta el hover */
          if (ultimoPuntero.current !== "mouse") setAbierta((v) => !v);
        }}
        aria-label="Ayuda"
        style={{
          width: 18, height: 18, borderRadius: 9, border: `1.5px solid ${T.steel}`,
          background: abierta ? T.steel : "transparent", color: abierta ? "#fff" : T.steel,
          fontSize: 11, fontWeight: 700, lineHeight: "15px", cursor: "pointer",
          marginLeft: 5, padding: 0, verticalAlign: "middle", fontFamily: body,
        }}
      >
        i
      </button>
      {abierta && (
        <span
          onClick={() => setAbierta(false)}
          style={{
            position: "absolute", zIndex: 40, top: 22, left: -80, width: 230,
            background: T.ink, color: "#fff", padding: "10px 12px", borderRadius: 8,
            fontSize: 12, fontWeight: 400, lineHeight: 1.45, fontFamily: body,
            textTransform: "none", letterSpacing: "normal", boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
            borderLeft: `4px solid ${T.orange}`, cursor: "pointer", display: "block", textAlign: "left",
          }}
        >
          {texto}
        </span>
      )}
    </span>
  );
}

/* ---------- componentes de UI básicos ---------- */
const Field = ({ label, ayuda, children }) => (
  <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 130 }}>
    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: T.inkSoft }}>
      {label}
      {ayuda && <Ayuda texto={ayuda} />}
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

/* ============================================================ */

export default function TPMGuayana() {
  const [usuario, setUsuario] = useState(null);
  const [autListo, setAutListo] = useState(false);
  const [maquinas, setMaquinas] = useState([]);
  const [registros, setRegistros] = useState([]); // registros OEE
  const [eventos, setEventos] = useState([]); // fallas y mantenimientos
  const [tab, setTab] = useState("tablero");
  const [cargado, setCargado] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [enLinea, setEnLinea] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pendientes, setPendientes] = useState(0);
  const sincronizando = useRef(false);

  const claveCache = usuario ? `tpm-cache-${usuario.id}` : null;
  const claveOutbox = usuario ? `tpm-pendientes-${usuario.id}` : null;

  /* ---- sesión (login persistente) ---- */
  useEffect(() => {
    if (!supabase) { setAutListo(true); return; }
    supabase.auth.getSession().then(({ data }) => {
      setUsuario(data.session?.user || null);
      setAutListo(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_ev, session) => {
      setUsuario(session?.user || null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  /* ---- detección de conexión ---- */
  useEffect(() => {
    const on = () => setEnLinea(true);
    const off = () => setEnLinea(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  /* ---- cola de cambios pendientes (permite registrar sin internet) ---- */
  const leerOutbox = () => {
    try { return JSON.parse(localStorage.getItem(claveOutbox)) || []; } catch (e) { return []; }
  };
  const escribirOutbox = (xs) => {
    try { localStorage.setItem(claveOutbox, JSON.stringify(xs)); } catch (e) { /* sin espacio */ }
    setPendientes(xs.length);
  };

  const sincronizar = async () => {
    if (!supabase || !usuario || sincronizando.current) return;
    sincronizando.current = true;
    let cola = leerOutbox();
    while (cola.length) {
      const op = cola[0];
      try {
        let q;
        if (op.op === "delete") q = await supabase.from(op.tabla).delete().eq("id", op.id);
        else q = await supabase.from(op.tabla).upsert(op.datos); // upsert: seguro ante reintentos
        if (q.error) throw q.error;
        cola = cola.slice(1);
        escribirOutbox(cola);
      } catch (e) {
        break; /* sin conexión o error temporal: se reintentará */
      }
    }
    sincronizando.current = false;
  };

  const persistir = (ops) => {
    escribirOutbox([...leerOutbox(), ...ops]);
    sincronizar();
  };

  /* reintentos: al recuperar conexión y cada 30 segundos */
  useEffect(() => { if (enLinea && usuario) sincronizar(); }, [enLinea, usuario]);
  useEffect(() => {
    if (!usuario) return;
    const t = setInterval(sincronizar, 30000);
    return () => clearInterval(t);
  }, [usuario]);

  /* ---- carga inicial: nube primero; caché local si no hay conexión ---- */
  useEffect(() => {
    if (!usuario || !supabase) return;
    setCargado(false);
    (async () => {
      try {
        const [mq, rg, ev] = await Promise.all([
          supabase.from("maquinas").select("*").order("creado", { ascending: true }),
          supabase.from("registros").select("*").order("creado", { ascending: false }),
          supabase.from("eventos").select("*").order("creado", { ascending: false }),
        ]);
        if (mq.error || rg.error || ev.error) throw (mq.error || rg.error || ev.error);
        setMaquinas(mq.data.map(deMaquinaDB));
        setRegistros(rg.data.map(deRegistroDB));
        setEventos(ev.data.map(deEventoDB));
      } catch (e) {
        /* sin internet: usar la última copia guardada en el dispositivo */
        try {
          const c = JSON.parse(localStorage.getItem(claveCache));
          if (c) { setMaquinas(c.maquinas || []); setRegistros(c.registros || []); setEventos(c.eventos || []); }
        } catch (e2) { /* sin caché previa */ }
      }
      setPendientes(leerOutbox().length);
      setCargado(true);
      sincronizar();
    })();
  }, [usuario]);

  /* ---- caché local: última copia para trabajar sin conexión ---- */
  useEffect(() => {
    if (!cargado || !claveCache) return;
    try { localStorage.setItem(claveCache, JSON.stringify({ maquinas, registros, eventos })); } catch (e) { /* sin espacio */ }
  }, [maquinas, registros, eventos, cargado, claveCache]);

  const notificar = (msg) => {
    setAviso(msg);
    setTimeout(() => setAviso(null), 2600);
  };

  /* ---- acciones (actualizan la pantalla al instante y suben a la nube) ---- */
  const agregarMaquina = (m) => {
    const nueva = { id: uid(), ...m, horasTotales: 0, horasDesdeMant: 0, fallas: 0 };
    setMaquinas((xs) => [...xs, nueva]);
    persistir([{ tabla: "maquinas", op: "upsert", datos: aMaquinaDB(nueva, usuario.id) }]);
    notificar("Máquina agregada");
  };

  const registrarHoras = (id, horas) => {
    const h = +horas;
    if (!(h > 0)) return;
    const m = maquinas.find((x) => x.id === id);
    if (!m) return;
    const act = { ...m, horasTotales: m.horasTotales + h, horasDesdeMant: m.horasDesdeMant + h };
    setMaquinas((xs) => xs.map((x) => (x.id === id ? act : x)));
    persistir([{ tabla: "maquinas", op: "upsert", datos: aMaquinaDB(act, usuario.id) }]);
    notificar(`+${h} h registradas`);
  };

  const registrarMantenimiento = (id) => {
    const m = maquinas.find((x) => x.id === id);
    if (!m) return;
    const act = { ...m, horasDesdeMant: 0 };
    const evn = { id: uid(), maquinaId: id, tipo: "mantenimiento", fecha: hoy(), nota: `Preventivo a las ${fmt(m.horasTotales)} h` };
    setMaquinas((xs) => xs.map((x) => (x.id === id ? act : x)));
    setEventos((es) => [evn, ...es]);
    persistir([
      { tabla: "maquinas", op: "upsert", datos: aMaquinaDB(act, usuario.id) },
      { tabla: "eventos", op: "upsert", datos: aEventoDB(evn, usuario.id) },
    ]);
    notificar("Mantenimiento registrado · contador en cero");
  };

  const registrarFalla = (id, nota) => {
    const m = maquinas.find((x) => x.id === id);
    if (!m) return;
    const act = { ...m, fallas: m.fallas + 1 };
    const evn = { id: uid(), maquinaId: id, tipo: "falla", fecha: hoy(), nota: nota || "Falla no especificada" };
    setMaquinas((xs) => xs.map((x) => (x.id === id ? act : x)));
    setEventos((es) => [evn, ...es]);
    persistir([
      { tabla: "maquinas", op: "upsert", datos: aMaquinaDB(act, usuario.id) },
      { tabla: "eventos", op: "upsert", datos: aEventoDB(evn, usuario.id) },
    ]);
    notificar("Falla registrada");
  };

  const eliminarMaquina = (id) => {
    setMaquinas((xs) => xs.filter((m) => m.id !== id));
    setRegistros((rs) => rs.filter((r) => r.maquinaId !== id));
    setEventos((es) => es.filter((e) => e.maquinaId !== id));
    /* la base de datos borra en cascada los registros y eventos de la máquina */
    persistir([{ tabla: "maquinas", op: "delete", id }]);
  };

  const guardarOEE = (reg) => {
    const nuevo = { id: uid(), fecha: hoy(), ...reg };
    setRegistros((rs) => [nuevo, ...rs]);
    persistir([{ tabla: "registros", op: "upsert", datos: aRegistroDB(nuevo, usuario.id) }]);
    notificar("Registro OEE guardado");
  };

  const cerrarSesion = async () => {
    try { await supabase.auth.signOut(); } catch (e) { /* sin conexión */ }
    setMaquinas([]); setRegistros([]); setEventos([]); setTab("tablero");
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
    ["analisis", "Análisis"],
    ["historial", "Historial"],
    ["guia", "Guía"],
  ];

  if (!supabase) return <PantallaMensaje titulo="Falta configurar" texto="Abre src/App.jsx y pega el Project URL y la anon key de tu proyecto de Supabase en las dos líneas marcadas al inicio del archivo." />;
  if (!autListo) return <PantallaMensaje titulo="TPM Guayana" texto="Iniciando…" />;
  if (!usuario) return <Login />;
  if (!cargado) return <PantallaMensaje titulo="TPM Guayana" texto="Cargando los datos del taller…" />;

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
            <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span
                title={enLinea ? "Conectado a la nube" : "Los registros se guardan en el dispositivo y subirán al volver la conexión"}
                style={{
                  fontFamily: mono, fontSize: 11, padding: "3px 8px", borderRadius: 4,
                  background: enLinea ? "rgba(46,139,87,0.25)" : "rgba(193,39,45,0.3)",
                  color: enLinea ? "#6FCF97" : "#F5A3A6",
                }}
              >
                {enLinea
                  ? (pendientes ? `En línea · subiendo ${pendientes}…` : "En línea · sincronizado")
                  : `Sin conexión · ${pendientes} por subir`}
              </span>
              <button
                onClick={cerrarSesion}
                style={{ background: "transparent", border: "1px solid #5A6675", color: "#C3CDD8", borderRadius: 4, padding: "3px 10px", fontFamily: display, fontSize: 13, letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer" }}
              >
                Salir
              </button>
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
                  padding: "10px 14px",
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
        {tab === "analisis" && <Analisis maquinas={maquinas} registros={registros} eventos={eventos} />}
        {tab === "historial" && <Historial maquinas={maquinas} registros={registros} eventos={eventos} />}
        {tab === "guia" && <Guia />}
      </main>
    </div>
  );
}

/* ============================================================
   PANTALLAS DE ACCESO
   ============================================================ */
function PantallaMensaje({ titulo, texto }) {
  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: body, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <style>{FONTS}</style>
      <div style={{ background: T.panel, border: `1.5px solid ${T.line}`, borderRadius: 10, padding: 28, maxWidth: 420, textAlign: "center" }}>
        <h1 style={{ fontFamily: display, fontSize: 26, margin: "0 0 8px", textTransform: "uppercase", color: T.ink }}>{titulo}</h1>
        <p style={{ margin: 0, color: T.inkSoft, fontSize: 14, lineHeight: 1.5 }}>{texto}</p>
      </div>
    </div>
  );
}

function Login() {
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);

  const entrar = async () => {
    if (!correo.trim() || !clave) { setError("Escribe el correo y la contraseña."); return; }
    setError(null);
    setCargando(true);
    const { error: e } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: clave });
    setCargando(false);
    if (e) setError("Correo o contraseña incorrectos, o no hay conexión a internet. Verifica e intenta de nuevo.");
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: body, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <style>{FONTS}</style>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ background: T.ink, borderRadius: "10px 10px 0 0", padding: "22px 22px 16px", color: "#fff", position: "relative", overflow: "hidden" }}>
          <div aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 8, background: `repeating-linear-gradient(135deg, ${T.orange}, ${T.orange} 8px, ${T.ink} 8px, ${T.ink} 16px)` }} />
          <h1 style={{ fontFamily: display, fontSize: 30, margin: 0, textTransform: "uppercase", letterSpacing: "0.02em" }}>TPM Guayana</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#C3CDD8" }}>Mantenimiento preventivo · Ciudad Guayana</p>
        </div>
        <div style={{ background: T.panel, border: `1.5px solid ${T.line}`, borderTop: "none", borderRadius: "0 0 10px 10px", padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
          <Field label="Correo">
            <input style={inputStyle} type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="taller@correo.com" />
          </Field>
          <Field label="Contraseña">
            <input style={inputStyle} type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} onKeyDown={(e) => e.key === "Enter" && entrar()} />
          </Field>
          {error && <p style={{ color: T.danger, fontSize: 13, margin: 0 }}>{error}</p>}
          <button style={{ ...btn(T.orange), opacity: cargando ? 0.6 : 1 }} disabled={cargando} onClick={entrar}>
            {cargando ? "Entrando…" : "Entrar"}
          </button>
          <p style={{ fontSize: 12, color: T.inkSoft, margin: 0, lineHeight: 1.5 }}>
            El acceso lo entrega el administrador del sistema. Tras iniciar sesión una vez, la app recuerda al usuario
            y puede registrar datos incluso sin conexión: se sincronizan al volver el internet.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   TABLERO (con bienvenida para usuarios nuevos)
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
      <div style={{ background: T.panel, border: `1.5px solid ${T.line}`, borderRadius: 8, padding: "28px 24px" }}>
        <p style={{ fontFamily: display, fontSize: 26, fontWeight: 700, margin: "0 0 6px", textTransform: "uppercase" }}>
          Bienvenido a TPM Guayana
        </p>
        <p style={{ color: T.inkSoft, margin: "0 0 18px", maxWidth: 560 }}>
          Esta herramienta te ayuda a cuidar las máquinas de tu taller: mide cuánto producen de verdad
          (el indicador OEE) y te avisa cuándo toca el mantenimiento preventivo, antes de que la máquina falle.
        </p>
        {[
          ["1", "Registra tus máquinas", "Ve a la pestaña MÁQUINAS y agrega cada equipo con su intervalo de mantenimiento (cada cuántas horas de uso toca el preventivo)."],
          ["2", "Registra el trabajo de cada día", "Al final de cada turno: anota las horas trabajadas de la máquina y llena el formulario de REGISTRAR OEE con la producción del turno."],
          ["3", "Deja que la app te guíe", "El TABLERO te mostrará alertas de mantenimiento en semáforo (verde/amarillo/rojo) y la pestaña ANÁLISIS te dirá dónde estás perdiendo producción."],
        ].map(([n, t, d]) => (
          <div key={n} style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "flex-start" }}>
            <div style={{ width: 30, height: 30, borderRadius: 15, background: T.orange, color: "#fff", fontFamily: display, fontWeight: 700, fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</div>
            <div>
              <strong style={{ fontFamily: display, fontSize: 17, textTransform: "uppercase" }}>{t}</strong>
              <div style={{ fontSize: 13, color: T.inkSoft }}>{d}</div>
            </div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
          <button style={btn(T.orange)} onClick={() => irA("maquinas")}>Empezar: agregar máquina</button>
          <button style={btnGhost(T.steel)} onClick={() => irA("guia")}>Leer la guía completa</button>
        </div>
      </div>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* alertas */}
      <section>
        <h2 style={h2Style}>
          Alertas de mantenimiento
          <Ayuda texto="El semáforo compara las horas trabajadas desde el último mantenimiento con el intervalo definido para cada máquina. Verde: menos del 75% del intervalo. Amarillo (PRÓXIMO): entre 75% y 90%, planifica el mantenimiento. Rojo (URGENTE): 90% o más, hazlo cuanto antes para evitar una falla." />
        </h2>
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
        <h2 style={h2Style}>
          Indicadores por máquina
          <Ayuda texto="OEE: porcentaje del potencial de la máquina que realmente se aprovechó (clase mundial: 85% o más). MTBF: promedio de horas que la máquina trabaja entre una falla y la siguiente; mientras más alto, más confiable es el equipo." />
        </h2>
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
          <Field
            label="Intervalo mant. (h)"
            ayuda="Cada cuántas horas de trabajo la máquina necesita mantenimiento preventivo. Búscalo en el manual del fabricante; si no lo tienes, empieza con 250 h (valor típico para equipos de taller) y ajústalo con la experiencia."
          >
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
                <Ayuda texto="'+ Horas trabajadas': suma las horas que la máquina operó (llénalo cada día o cada turno). 'Mantenimiento hecho': márcalo cuando se realice el preventivo; el contador del semáforo vuelve a cero y el evento queda en el historial." />
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
   FORMULARIO OEE (con causa de parada e interpretación)
   ============================================================ */
function FormOEE({ maquinas, onGuardar }) {
  const [maquinaId, setMaquinaId] = useState("");
  const [f, setF] = useState({ tiempoPlan: "480", paradas: "0", causa: "", piezas: "", defectuosas: "0", cicloIdeal: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const res = useMemo(() => calcOEE(f), [f]);
  const hayParadas = +f.paradas > 0;
  const faltaCausa = hayParadas && !f.causa;
  const listo = maquinaId && Number.isFinite(res.oee) && res.oee >= 0 && !faltaCausa;
  const interpretacion = interpretarOEE(res);

  const guardar = () => {
    if (!listo) return;
    onGuardar({
      maquinaId,
      tiempoPlan: +f.tiempoPlan, paradas: +f.paradas,
      causa: hayParadas ? f.causa : "",
      piezas: +f.piezas, defectuosas: +f.defectuosas, cicloIdeal: +f.cicloIdeal,
      disp: res.disp, rend: res.rend, cal: res.cal, oee: res.oee,
    });
    setF({ ...f, paradas: "0", causa: "", piezas: "", defectuosas: "0" });
  };

  if (!maquinas.length)
    return <p style={{ color: T.inkSoft }}>Primero agrega una máquina en la pestaña <strong>Máquinas</strong>.</p>;

  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr", maxWidth: 720 }}>
      <section style={{ background: T.panel, border: `1.5px solid ${T.line}`, borderRadius: 8, padding: 16 }}>
        <h2 style={h2Style}>
          Datos del turno
          <Ayuda texto="Llena este formulario UNA VEZ por turno y por máquina, al final del turno. Con estos 5 datos la app calcula el OEE: cuánto del potencial de la máquina se aprovechó realmente." />
        </h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 }}>
          <Field label="Máquina">
            <select style={inputStyle} value={maquinaId} onChange={(e) => setMaquinaId(e.target.value)}>
              <option value="">Selecciona…</option>
              {maquinas.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
            </select>
          </Field>
          <Field
            label="Tiempo planificado (min)"
            ayuda="Minutos que la máquina DEBÍA trabajar en el turno, sin contar paradas programadas (almuerzo, limpieza planificada). Ejemplo: turno de 8 horas con 1 hora de almuerzo = 420 min."
          >
            <input style={inputStyle} type="number" min="1" value={f.tiempoPlan} onChange={set("tiempoPlan")} />
          </Field>
          <Field
            label="Paradas no planif. (min)"
            ayuda="Suma de los minutos que la máquina estuvo detenida SIN estar programado: averías, falta de material, cortes de energía, ajustes imprevistos, ausencia del operario."
          >
            <input style={inputStyle} type="number" min="0" value={f.paradas} onChange={set("paradas")} />
          </Field>
          {hayParadas && (
            <Field
              label="Causa principal de la parada"
              ayuda="La causa que acumuló MÁS minutos de parada en el turno. Registrarla permite que la pestaña Análisis te muestre qué causa te está costando más producción (diagrama de Pareto)."
            >
              <select style={{ ...inputStyle, borderColor: faltaCausa ? T.danger : T.line }} value={f.causa} onChange={set("causa")}>
                <option value="">Selecciona la causa…</option>
                {CAUSAS_PARADA.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          )}
          <Field label="Piezas producidas" ayuda="Total de unidades procesadas en el turno, contando buenas y defectuosas.">
            <input style={inputStyle} type="number" min="0" value={f.piezas} onChange={set("piezas")} placeholder="0" />
          </Field>
          <Field label="Piezas defectuosas" ayuda="Unidades rechazadas o que hubo que retrabajar.">
            <input style={inputStyle} type="number" min="0" value={f.defectuosas} onChange={set("defectuosas")} />
          </Field>
          <Field
            label="Ciclo ideal (min/pieza)"
            ayuda="Tiempo teórico para producir UNA pieza en condiciones perfectas. Cronométralo con la máquina a ritmo normal sin interrupciones (promedia 10 mediciones) o tómalo del fabricante. Ejemplo: 40 piezas/hora = 1,5 min/pieza. Usa siempre el mismo valor."
          >
            <input style={inputStyle} type="number" min="0" step="0.01" value={f.cicloIdeal} onChange={set("cicloIdeal")} placeholder="1.50" />
          </Field>
        </div>
        {faltaCausa && (
          <p style={{ fontSize: 12, color: T.danger, margin: "10px 0 0" }}>
            Registraste paradas: selecciona la causa principal para poder guardar.
          </p>
        )}
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
        {interpretacion && (
          <p style={{ fontSize: 13, color: "#DCE3EA", marginTop: 12, lineHeight: 1.5, borderLeft: `3px solid ${T.steel}`, paddingLeft: 10 }}>
            {interpretacion}
          </p>
        )}
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
   ANÁLISIS: tendencia OEE + Pareto de causas + exportación
   ============================================================ */
function Analisis({ maquinas, registros, eventos }) {
  const [maquinaId, setMaquinaId] = useState("todas");
  const nombre = (id) => maquinas.find((m) => m.id === id)?.nombre || "—";

  const regsFiltrados = useMemo(() => {
    const rs = maquinaId === "todas" ? registros : registros.filter((r) => r.maquinaId === maquinaId);
    return [...rs].reverse(); // cronológico: del más viejo al más nuevo
  }, [registros, maquinaId]);

  /* ---- Pareto de causas de parada (minutos por causa) ---- */
  const pareto = useMemo(() => {
    const acc = {};
    regsFiltrados.forEach((r) => {
      if (+r.paradas > 0) {
        const c = r.causa || "(sin causa registrada)";
        acc[c] = (acc[c] || 0) + +r.paradas;
      }
    });
    const items = Object.entries(acc).sort((a, b) => b[1] - a[1]);
    const total = items.reduce((s, [, v]) => s + v, 0);
    let acum = 0;
    return {
      total,
      items: items.map(([causa, min]) => {
        acum += min;
        return { causa, min, pctItem: total ? min / total : 0, pctAcum: total ? acum / total : 0 };
      }),
    };
  }, [regsFiltrados]);

  /* ---- exportaciones CSV ---- */
  const num = (v, d = 4) => (Number.isFinite(v) ? +v.toFixed(d) : "");
  const exportarRegistros = () => {
    const filas = [
      ["Fecha", "Máquina", "Tiempo planificado (min)", "Paradas (min)", "Causa principal", "Piezas producidas", "Piezas defectuosas", "Ciclo ideal (min/pieza)", "Disponibilidad", "Rendimiento", "Calidad", "OEE"],
      ...[...registros].reverse().map((r) => [
        r.fecha, nombre(r.maquinaId), r.tiempoPlan, r.paradas, r.causa || "", r.piezas, r.defectuosas, r.cicloIdeal,
        num(r.disp), num(r.rend), num(r.cal), num(r.oee),
      ]),
    ];
    descargarCSV(`tpm-registros-oee-${hoy()}.csv`, filas);
  };
  const exportarEventos = () => {
    const filas = [
      ["Fecha", "Máquina", "Tipo", "Nota"],
      ...[...eventos].reverse().map((e) => [e.fecha, nombre(e.maquinaId), e.tipo, e.nota]),
    ];
    descargarCSV(`tpm-fallas-mantenimientos-${hoy()}.csv`, filas);
  };
  const exportarMaquinas = () => {
    const filas = [
      ["Máquina", "Tipo", "Intervalo mant. (h)", "Horas desde mant.", "Horas totales", "Fallas", "MTBF (h)"],
      ...maquinas.map((m) => [
        m.nombre, m.tipo, m.intervaloMant, num(m.horasDesdeMant, 1), num(m.horasTotales, 1), m.fallas,
        m.fallas > 0 ? num(m.horasTotales / m.fallas, 1) : "",
      ]),
    ];
    descargarCSV(`tpm-maquinas-${hoy()}.csv`, filas);
  };

  if (!registros.length)
    return (
      <div style={{ background: T.panel, border: `1.5px solid ${T.line}`, borderRadius: 8, padding: 24 }}>
        <p style={{ fontFamily: display, fontSize: 22, fontWeight: 600, margin: "0 0 8px", textTransform: "uppercase" }}>Aún no hay datos que analizar</p>
        <p style={{ color: T.inkSoft, margin: 0 }}>
          Cuando guardes registros de OEE en la pestaña <strong>Registrar OEE</strong>, aquí verás la evolución del indicador
          en el tiempo y el diagrama de Pareto con las causas de parada que más producción te cuestan.
        </p>
      </div>
    );

  /* ---- gráfico de tendencia (SVG, sin librerías) ---- */
  const W = 640, H = 220, PAD = { l: 44, r: 12, t: 14, b: 26 };
  const pts = regsFiltrados.filter((r) => Number.isFinite(r.oee));
  const n = pts.length;
  const x = (i) => PAD.l + (n <= 1 ? (W - PAD.l - PAD.r) / 2 : (i * (W - PAD.l - PAD.r)) / (n - 1));
  const y = (v) => PAD.t + (1 - Math.min(Math.max(v, 0), 1.1) / 1.1) * (H - PAD.t - PAD.b);
  const linea = pts.map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(r.oee).toFixed(1)}`).join(" ");
  const promedio = n ? pts.reduce((s, r) => s + r.oee, 0) / n : NaN;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* selector */}
      <section style={{ background: T.panel, border: `1.5px solid ${T.line}`, borderRadius: 8, padding: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: T.inkSoft }}>Analizar:</span>
        <select style={{ ...inputStyle, width: "auto", minWidth: 180 }} value={maquinaId} onChange={(e) => setMaquinaId(e.target.value)}>
          <option value="todas">Todas las máquinas</option>
          {maquinas.map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}
        </select>
        <span style={{ fontFamily: mono, fontSize: 13, color: T.inkSoft }}>
          {n} registro{n === 1 ? "" : "s"} · OEE promedio: <strong style={{ color: colorOEE(promedio) }}>{pct(promedio)}</strong>
        </span>
      </section>

      {/* tendencia */}
      <section style={{ background: T.panel, border: `1.5px solid ${T.line}`, borderRadius: 8, padding: 16 }}>
        <h2 style={h2Style}>
          Tendencia del OEE
          <Ayuda texto="Cada punto es un registro de turno, en orden cronológico. La línea verde punteada es la referencia de clase mundial (85%). Lo importante no es un punto aislado sino la dirección: ¿la línea sube con las semanas? Entonces el mantenimiento preventivo está funcionando." />
        </h2>
        <div style={{ overflowX: "auto" }}>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: 460, display: "block" }} role="img" aria-label="Gráfico de tendencia del OEE">
            {[0, 0.25, 0.5, 0.75, 1].map((v) => (
              <g key={v}>
                <line x1={PAD.l} y1={y(v)} x2={W - PAD.r} y2={y(v)} stroke={T.line} strokeWidth="1" />
                <text x={PAD.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fontFamily={mono} fill={T.inkSoft}>{(v * 100).toFixed(0)}%</text>
              </g>
            ))}
            <line x1={PAD.l} y1={y(0.85)} x2={W - PAD.r} y2={y(0.85)} stroke={T.ok} strokeWidth="1.5" strokeDasharray="6 4" />
            <text x={W - PAD.r} y={y(0.85) - 5} textAnchor="end" fontSize="11" fontFamily={mono} fill={T.ok}>meta 85%</text>
            {n > 1 && <path d={linea} fill="none" stroke={T.steel} strokeWidth="2.5" />}
            {pts.map((r, i) => (
              <circle key={r.id || i} cx={x(i)} cy={y(r.oee)} r="4" fill={colorOEE(r.oee)} stroke="#fff" strokeWidth="1.5" />
            ))}
            {n > 0 && [pts[0], pts[n - 1]].map((r, k) => (
              <text key={k} x={x(k === 0 ? 0 : n - 1)} y={H - 8} textAnchor={k === 0 ? "start" : "end"} fontSize="11" fontFamily={mono} fill={T.inkSoft}>{r.fecha}</text>
            ))}
          </svg>
        </div>
      </section>

      {/* Pareto */}
      <section style={{ background: T.panel, border: `1.5px solid ${T.line}`, borderRadius: 8, padding: 16 }}>
        <h2 style={h2Style}>
          Pareto de causas de parada
          <Ayuda texto="Ordena las causas de parada de mayor a menor según los minutos que te costaron. El principio de Pareto dice que pocas causas concentran la mayoría de las pérdidas: ataca primero las barras más largas y el porcentaje acumulado te dice cuánto del problema resuelves." />
        </h2>
        {!pareto.items.length ? (
          <p style={{ color: T.inkSoft, margin: 0 }}>No hay paradas registradas en esta selección. Cuando registres turnos con paradas y su causa, aquí aparecerá el análisis.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pareto.items.map((it, i) => (
              <div key={it.causa}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 3, gap: 8, flexWrap: "wrap" }}>
                  <span><strong>{i + 1}.</strong> {it.causa}</span>
                  <span style={{ fontFamily: mono, color: T.inkSoft }}>
                    {fmt(it.min, 0)} min · {(it.pctItem * 100).toFixed(1)} % · acum. {(it.pctAcum * 100).toFixed(0)} %
                  </span>
                </div>
                <div style={{ height: 16, background: T.bg, borderRadius: 4, border: `1px solid ${T.line}` }}>
                  <div style={{ height: "100%", width: `${it.pctItem * 100}%`, background: i === 0 ? T.danger : i === 1 ? T.orange : T.steel, borderRadius: 4, minWidth: 2 }} />
                </div>
              </div>
            ))}
            <p style={{ fontSize: 12, color: T.inkSoft, margin: "4px 0 0" }}>
              Total de minutos perdidos por paradas: <strong>{fmt(pareto.total, 0)} min</strong>. Prioriza atacar las primeras causas de la lista.
            </p>
          </div>
        )}
      </section>

      {/* exportación */}
      <section style={{ background: T.panel, border: `1.5px solid ${T.line}`, borderRadius: 8, padding: 16 }}>
        <h2 style={h2Style}>
          Exportar datos
          <Ayuda texto="Descarga los datos en formato CSV, que abre directamente en Excel. Úsalo para respaldar la información o para análisis estadísticos más profundos. El archivo queda en la carpeta de Descargas del dispositivo." />
        </h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
          <button style={btn(T.steel, true)} onClick={exportarRegistros}>Registros OEE (Excel/CSV)</button>
          <button style={btn(T.steel, true)} onClick={exportarEventos}>Fallas y mantenimientos</button>
          <button style={btn(T.steel, true)} onClick={exportarMaquinas}>Resumen de máquinas</button>
        </div>
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
                  {["Fecha", "Máquina", "Paradas", "Causa", "Disp.", "Rend.", "Cal.", "OEE"].map((h) => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {registros.map((r, i) => (
                  <tr key={r.id} style={{ background: i % 2 ? "#F5F7F9" : "#fff" }}>
                    <td style={td}>{r.fecha}</td>
                    <td style={td}>{nombre(r.maquinaId)}</td>
                    <td style={td}>{fmt(+r.paradas, 0)} min</td>
                    <td style={td}>{+r.paradas > 0 ? (r.causa || "(sin causa)") : "—"}</td>
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

/* ============================================================
   GUÍA (manual de usuario dentro de la app)
   ============================================================ */
function Guia() {
  const S = ({ titulo, children }) => (
    <section style={{ background: T.panel, border: `1.5px solid ${T.line}`, borderRadius: 8, padding: 16 }}>
      <h2 style={h2Style}>{titulo}</h2>
      <div style={{ fontSize: 14, lineHeight: 1.6, color: T.ink }}>{children}</div>
    </section>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 760 }}>
      <S titulo="¿Qué es esta app y para qué sirve?">
        <p style={{ margin: "6px 0" }}>
          TPM Guayana aplica dos ideas del <strong>Mantenimiento Productivo Total (TPM)</strong>, la metodología japonesa que busca
          cero fallas y cero pérdidas en las máquinas: <strong>medir</strong> cuánto produce realmente cada equipo, y
          <strong> prevenir</strong> las fallas haciendo el mantenimiento a tiempo en vez de esperar a que la máquina se dañe.
          Reparar una máquina dañada siempre cuesta más (repuestos, horas paradas, pedidos atrasados) que mantenerla a tiempo.
        </p>
      </S>

      <S titulo="El indicador OEE, explicado simple">
        <p style={{ margin: "6px 0" }}>
          El <strong>OEE</strong> (Eficiencia General de los Equipos) responde una pregunta: <em>de todo lo que esta máquina
          pudo haber producido en el turno, ¿qué porcentaje produjo de verdad?</em> Combina tres factores que se multiplican:
        </p>
        <p style={{ margin: "6px 0" }}>
          <strong style={{ color: T.steel }}>Disponibilidad</strong> — ¿la máquina estuvo funcionando el tiempo que debía?
          Cada minuto de parada no planificada la baja.<br />
          <strong style={{ color: T.steel }}>Rendimiento</strong> — mientras funcionó, ¿trabajó a su velocidad ideal?
          Los ritmos lentos y las microparadas la bajan.<br />
          <strong style={{ color: T.steel }}>Calidad</strong> — de lo que produjo, ¿cuánto salió bueno?
          Cada pieza defectuosa o retrabajada la baja.
        </p>
        <p style={{ margin: "6px 0" }}>
          <strong>Cómo leer el resultado:</strong> 85 % o más es nivel de clase mundial. Entre 60 % y 85 % es un nivel
          aceptable con margen de mejora. Menos de 60 % indica pérdidas importantes — y es el punto de partida normal de un
          taller que recién empieza a medir: lo importante no es el número de hoy sino que la tendencia suba.
        </p>
      </S>

      <S titulo="El semáforo de mantenimiento">
        <p style={{ margin: "6px 0" }}>
          Cada máquina tiene un <strong>intervalo de mantenimiento</strong>: cada cuántas horas de trabajo necesita su
          preventivo (por ejemplo, cada 250 h). La app suma las horas que registras y compara:
        </p>
        <p style={{ margin: "6px 0" }}>
          <strong style={{ color: T.ok }}>■ Verde</strong> — menos del 75 % del intervalo consumido. Todo bien.<br />
          <strong style={{ color: T.warn }}>■ Amarillo (PRÓXIMO)</strong> — entre 75 % y 90 %. Planifica el mantenimiento:
          consigue repuestos, decide qué día conviene parar.<br />
          <strong style={{ color: T.danger }}>■ Rojo (URGENTE)</strong> — 90 % o más. Haz el mantenimiento cuanto antes;
          cada hora extra aumenta el riesgo de una falla en pleno trabajo.
        </p>
        <p style={{ margin: "6px 0" }}>
          Al completar el mantenimiento, márcalo con el botón <strong>"Mantenimiento hecho"</strong> en la pestaña Máquinas:
          el contador vuelve a cero y el evento queda en el historial.
        </p>
      </S>

      <S titulo="Rutina diaria recomendada (5 minutos al cierre del turno)">
        <p style={{ margin: "6px 0" }}>
          <strong>1.</strong> En <strong>Máquinas</strong>, registra las horas que trabajó cada equipo ("+ Horas trabajadas").<br />
          <strong>2.</strong> En <strong>Registrar OEE</strong>, llena los datos del turno de cada máquina y guarda.
          Si hubo paradas, registra la causa principal — ese dato alimenta el análisis.<br />
          <strong>3.</strong> Si una máquina falló, regístralo en <strong>Máquinas</strong> con el botón rojo, describiendo qué pasó.<br />
          <strong>4.</strong> Mira el <strong>Tablero</strong>: si hay alertas amarillas o rojas, planifica el mantenimiento.<br />
          <strong>5.</strong> Una vez por semana, revisa <strong>Análisis</strong>: ¿la tendencia del OEE sube? ¿qué causa de
          parada domina el Pareto? Esa causa es tu prioridad de la semana.
        </p>
      </S>

      <S titulo="Diccionario rápido">
        <p style={{ margin: "6px 0" }}>
          <strong>Tiempo planificado:</strong> minutos que la máquina debía operar en el turno (sin contar almuerzo ni paradas programadas).<br />
          <strong>Parada no planificada:</strong> minutos detenida sin estar previsto (avería, falta de material, corte de luz…).<br />
          <strong>Ciclo ideal:</strong> tiempo teórico para producir una pieza en condiciones perfectas. Se cronometra una vez y no se cambia.<br />
          <strong>MTBF:</strong> horas promedio que la máquina trabaja entre una falla y la siguiente. Más alto = más confiable.<br />
          <strong>Pareto:</strong> análisis que ordena las causas de pérdida de mayor a menor; pocas causas suelen concentrar casi todo el problema.
        </p>
      </S>

      <S titulo="Sobre tus datos">
        <p style={{ margin: "6px 0" }}>
          Los datos se guardan <strong>en la nube</strong> asociados a tu cuenta: todos los dispositivos que entren con el
          mismo usuario ven la misma información, y nada se pierde aunque cambies de teléfono. La app además guarda una
          copia en el dispositivo para trabajar <strong>sin conexión</strong>: puedes registrar turnos, horas y fallas sin
          internet, y el indicador del encabezado mostrará cuántos cambios están pendientes de subir — se sincronizan solos
          al volver la señal. Aun así, es buena práctica descargar un respaldo periódico desde
          <strong> Análisis → Exportar datos</strong> (por ejemplo, cada viernes).
        </p>
      </S>

      <p style={{ fontSize: 12, color: T.inkSoft, textAlign: "center", margin: "4px 0 0" }}>
        TPM Guayana v3 · Proyecto de tesis de grado — Ingeniería Industrial, UNEG · Ciudad Guayana, Venezuela
      </p>
    </div>
  );
}

const td = { padding: "8px 12px", whiteSpace: "nowrap" };
