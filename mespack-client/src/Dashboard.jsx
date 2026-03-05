import { useState, useEffect, useRef, useCallback } from "react";

// ── MQTT config ───────────────────────────────────────────────────────────────
const MQTT_HOST    = "10.156.116.175";
const MQTT_WS_PORT = 1886;
const MQTT_TOPIC   = "Unilever_Ph_Nutrition/Dressings_Halal/Filling_Flexibles/DFOS/Dressings DFOS Params";

// ── Filler state map ──────────────────────────────────────────────────────────
const FILLER_STATE = {
  0: { label: "Idle",       color: "text-slate-400",   bg: "bg-slate-50",   ring: "ring-slate-200"   },
  1: { label: "Starting",   color: "text-amber-500",   bg: "bg-amber-50",   ring: "ring-amber-200"   },
  2: { label: "Running",    color: "text-emerald-500", bg: "bg-emerald-50", ring: "ring-emerald-200" },
  3: { label: "Stopping",   color: "text-amber-500",   bg: "bg-amber-50",   ring: "ring-amber-200"   },
  4: { label: "Stopped",    color: "text-red-500",     bg: "bg-red-50",     ring: "ring-red-200"     },
  5: { label: "Fault",      color: "text-red-600",     bg: "bg-red-50",     ring: "ring-red-200"     },
  6: { label: "Running",    color: "text-emerald-500", bg: "bg-emerald-50", ring: "ring-emerald-200" },
};

// ── Static graph data ─────────────────────────────────────────────────────────
const TIME_LABELS = [
  "6:00","6:30","7:00","7:30","8:00","8:30","9:00",
  "9:30","10:00","10:30","11:00","11:30","12:00","12:30","13:00","13:30","14:00",
];
const PRODUCED_HISTORY = [33,152,111,80,120,92,0,58,60,138,151,147,126,164,117,91];
const LINE_SPEED_HISTORY = [
  20,65,68,70,68,70,70,70,70,68,35,20,65,68,70,70,68,70,70,35,20,65,68,70,
  70,68,70,70,35,20,65,68,70,70,68,70,70,35,20,65,68,70,70,68,70,70,35,20,
  65,68,70,70,68,70,70,35,20,65,68,70,70,68,70,70,35,20,65,68,70,70,68,70,
  70,35,20,65,68,70,70,68,70,70,35,20,65,68,70,70,68,70,70,35,20,65,68,70,
  70,68,70,70,35,20,65,68,
];
const LOSS_SEGMENTS = [
  { start:0,  end:5,  type:"blue"   },{ start:5,  end:8,  type:"yellow" },
  { start:8,  end:17, type:"green"  },{ start:17, end:22, type:"red"    },
  { start:22, end:30, type:"green"  },{ start:30, end:32, type:"yellow" },
  { start:32, end:38, type:"green"  },{ start:38, end:43, type:"blue"   },
  { start:43, end:44, type:"yellow" },{ start:44, end:52, type:"green"  },
  { start:52, end:57, type:"red"    },{ start:57, end:63, type:"green"  },
  { start:63, end:64, type:"yellow" },{ start:64, end:72, type:"green"  },
  { start:72, end:77, type:"red"    },{ start:77, end:83, type:"green"  },
  { start:83, end:84, type:"yellow" },{ start:84, end:92, type:"green"  },
  { start:92, end:97, type:"red"    },{ start:97, end:100,type:"green"  },
];
const LOSS_STYLE = {
  blue:"#bfdbfe", red:"#fecaca", yellow:"#fde68a", green:"#d1fae5",
};
const LEGEND = [
  { color:"#bfdbfe", label:"Planned Downtime"   },
  { color:"#fecaca", label:"Unplanned Downtime" },
  { color:"#fde68a", label:"Minor Stop"         },
  { color:"#d1fae5", label:"Running"            },
];
const NAV_ITEMS = [
  { label:"Dashboard",                 icon:"⊞" },
  { label:"DFOS Data",                 icon:"🗂" },
  { label:"Fill Weight Dressing Data", icon:"⚖" },
  { label:"Weight Data",               icon:"📊" },
];
const EFFICIENCY_META = [
  { key:"oee",         label:"OEE",          tw:"bg-indigo-500"  },
  { key:"avail",       label:"Availability", tw:"bg-emerald-400" },
  { key:"performance", label:"Performance",  tw:"bg-sky-500"     },
  { key:"quality",     label:"Quality",      tw:"bg-amber-400"   },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function Badge({ children, color="emerald" }) {
  const m = {
    emerald:"bg-emerald-50 text-emerald-600 ring-emerald-200",
    red:"bg-red-50 text-red-500 ring-red-200",
    amber:"bg-amber-50 text-amber-600 ring-amber-200",
    slate:"bg-slate-100 text-slate-500 ring-slate-200",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ${m[color]}`}>
      {children}
    </span>
  );
}

function MqttStatusPill({ status }) {
  const map = {
    connecting: { dot:"bg-amber-400 animate-pulse", text:"Connecting…",  pill:"bg-amber-50 border-amber-200 text-amber-600" },
    connected:  { dot:"bg-emerald-500 animate-pulse", text:"MQTT Live",  pill:"bg-emerald-50 border-emerald-200 text-emerald-600" },
    error:      { dot:"bg-red-500",                   text:"MQTT Error", pill:"bg-red-50 border-red-200 text-red-600" },
    disconnected:{ dot:"bg-slate-400",                text:"Disconnected",pill:"bg-slate-100 border-slate-200 text-slate-500" },
  };
  const s = map[status] || map.disconnected;
  return (
    <div className={`flex items-center gap-2 border text-[12px] font-semibold px-3 py-1.5 rounded-full ${s.pill}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.text}
    </div>
  );
}

// ── SVG line-speed chart ──────────────────────────────────────────────────────
function LineSpeedSVG({ liveSpeed }) {
  const W = 1000, H = 72;
  const data = [...LINE_SPEED_HISTORY];
  // replace last point with live speed (normalised to 0-100, max ~250 u/m)
  if (liveSpeed != null) data[data.length - 1] = Math.min(100, (liveSpeed / 250) * 100);
  const n = data.length;
  const pts = data.map((v,i) => `${(i/(n-1))*W},${H-(v/100)*H}`).join(" ");
  const fillPts = `0,${H} ${pts} ${W},${H}`;
  const plannedY = H - (68/100)*H;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height:72 }}>
      <defs>
        <linearGradient id="spd" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#6366f1" stopOpacity="0.18"/>
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0"  />
        </linearGradient>
      </defs>
      <polygon points={fillPts} fill="url(#spd)" />
      <line x1={0} y1={plannedY} x2={W} y2={plannedY} stroke="#60a5fa" strokeWidth={1.5} strokeDasharray="7 5"/>
      <polyline points={pts} fill="none" stroke="#6366f1" strokeWidth={2} strokeLinejoin="round"/>
      {/* live dot */}
      {liveSpeed != null && (
        <circle cx={W} cy={H - (Math.min(100,(liveSpeed/250)*100)/100)*H} r={5} fill="#6366f1" stroke="#fff" strokeWidth={2}/>
      )}
    </svg>
  );
}

// ── Production graph ──────────────────────────────────────────────────────────
function ProductionGraph({ liveSpeed }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
            <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l6-6 4 4 8-8"/>
            </svg>
          </div>
          <div>
            <h2 className="font-bold text-slate-800 text-sm leading-none">Production Overview</h2>
            <p className="text-slate-400 text-[11px] mt-0.5">Line performance · 6:00 – 14:00</p>
          </div>
        </div>
        <div className="flex items-center gap-5 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <svg width="18" height="5"><line x1="0" y1="2.5" x2="18" y2="2.5" stroke="#60a5fa" strokeWidth="1.5" strokeDasharray="4 3"/></svg>
            Planned
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="18" height="5"><line x1="0" y1="2.5" x2="18" y2="2.5" stroke="#6366f1" strokeWidth="2"/></svg>
            Actual
          </span>
          <button className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors text-[11px] font-medium">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            Export CSV
          </button>
        </div>
      </div>

      <div className="px-6 py-4">
        {[
          {
            label: "Produced",
            content: (
              <div className="flex justify-between">
                {PRODUCED_HISTORY.map((v,i) => (
                  <div key={i} className={`text-[11px] font-black text-center flex-1
                    ${v===0?"text-red-500":v>100?"text-emerald-500":"text-slate-700"}`}>{v}</div>
                ))}
              </div>
            ),
          },
          {
            label: "Line Speed",
            content: <LineSpeedSVG liveSpeed={liveSpeed}/>,
          },
          {
            label: "Loss Type",
            content: (
              <div className="flex h-12 rounded-lg overflow-hidden ring-1 ring-slate-100">
                {LOSS_SEGMENTS.map((seg,i) => (
                  <div key={i} title={seg.type}
                    className="hover:opacity-75 cursor-pointer transition-opacity"
                    style={{
                      width:`${seg.end-seg.start}%`, flexShrink:0,
                      background:LOSS_STYLE[seg.type],
                      borderRight:seg.type==="yellow"?"2px solid #f59e0b":undefined,
                    }}/>
                ))}
              </div>
            ),
          },
        ].map(row => (
          <div key={row.label} className="flex items-center gap-4 mb-3 last:mb-0">
            <div className="w-24 shrink-0 text-[11px] font-semibold text-slate-400 text-right">{row.label}</div>
            <div className="flex-1">{row.content}</div>
          </div>
        ))}

        <div className="flex ml-28 mt-1">
          {TIME_LABELS.map((t,i) => (
            <div key={i} className="flex-1 text-center text-slate-300 text-[10px]">{t}</div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-5 px-6 py-3 bg-slate-50 border-t border-slate-100">
        {LEGEND.map(item => (
          <div key={item.label} className="flex items-center gap-2 text-[11px] text-slate-500">
            <div className="w-3 h-3 rounded-sm" style={{ background:item.color }}/>
            {item.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KPICard({ label, value, icon, accent, sub, badge, live }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 flex flex-col gap-3 flex-1 min-w-[140px] hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-lg ${accent}`}>{icon}</div>
        {badge}
      </div>
      <div>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-1">{label}</p>
        <div className={`text-[22px] font-black text-slate-900 leading-none tabular-nums transition-all duration-300 ${live?"text-indigo-600":""}`}>
          {value}
        </div>
        {sub && <p className="text-[11px] text-slate-400 mt-1.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Efficiency card ───────────────────────────────────────────────────────────
function EfficiencyCard({ oee }) {
  // derive fake avail/perf/quality from OEE for display
  const avail = oee ? Math.min(100, oee + 15).toFixed(1) : 0;
  const perf  = oee ? Math.min(100, oee + 22).toFixed(1) : 0;
  const qual  = oee ? Math.min(100, oee + 30).toFixed(1) : 0;
  const vals  = { oee: oee?.toFixed(1) ?? 0, avail, performance: perf, quality: qual };

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-50 flex items-center justify-center text-base">🎯</div>
          <span className="font-bold text-slate-800 text-sm">Efficiency</span>
        </div>
        <Badge color="emerald"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>Live</Badge>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {EFFICIENCY_META.map(item => (
          <div key={item.label} className="bg-slate-50 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-slate-500">{item.label}</span>
              <span className="text-[13px] font-black text-slate-800">{vals[item.key]}%</span>
            </div>
            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${item.tw} transition-all duration-700`}
                style={{ width:`${Math.min(100, parseFloat(vals[item.key]))}%` }}/>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ active, setActive }) {
  return (
    <aside className="fixed left-0 top-0 h-screen w-[220px] bg-[#0d1117] flex flex-col z-50 border-r border-white/5">
      <div className="flex items-center gap-3 px-5 h-16 border-b border-white/5 shrink-0">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-black text-sm shadow-lg shadow-indigo-500/30">W</div>
        <span className="text-white font-bold text-[15px] tracking-tight">Wastewise</span>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest px-3 mb-2">Main Menu</p>
        {NAV_ITEMS.map(item => {
          const isActive = active === item.label;
          return (
            <button key={item.label} onClick={() => setActive(item.label)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-[13px] font-medium transition-all duration-150 group
                ${isActive?"bg-indigo-600 text-white shadow-lg shadow-indigo-600/30":"text-white/40 hover:text-white/80 hover:bg-white/5"}`}>
              <span className={`text-base transition-transform duration-150 ${isActive?"scale-110":"group-hover:scale-105"}`}>{item.icon}</span>
              <span className="leading-snug truncate">{item.label}</span>
              {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/60"/>}
            </button>
          );
        })}
        <div className="pt-5 px-3">
          <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest mb-3">System</p>
          {["👤  Users","⚙  Settings"].map(l => (
            <button key={l} className="w-full flex items-center px-0 py-2 text-[13px] text-white/35 hover:text-white/70 transition-colors">{l}</button>
          ))}
        </div>
        <div className="pt-5 px-3">
          <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest mb-2">Devices</p>
          <div className="flex items-center gap-2 text-[12px] text-white/25">
            <span className="w-1.5 h-1.5 rounded-full bg-white/20"/>No devices connected
          </div>
        </div>
      </nav>
      <div className="px-4 py-4 border-t border-white/5 flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white text-xs font-bold shrink-0">A</div>
        <div className="overflow-hidden">
          <p className="text-white/80 text-[12px] font-semibold truncate">Admin User</p>
          <p className="text-white/30 text-[11px] truncate">admin@weight.ocr</p>
        </div>
        <button className="ml-auto text-white/20 hover:text-white/50 transition-colors text-sm">⋯</button>
      </div>
    </aside>
  );
}

// ── MQTT hook ─────────────────────────────────────────────────────────────────
function useMqtt(onMessage) {
  const [mqttStatus, setMqttStatus] = useState("disconnected");
  const clientRef = useRef(null);
  const onMessageRef = useRef(onMessage);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  useEffect(() => {
    // mqtt.js must be available via CDN — loaded in index.html
    // or installed: npm install mqtt
    if (typeof window === "undefined") return;

    const mqtt = window.mqtt;
    if (!mqtt) {
      console.warn("mqtt.js not found. Add to index.html: <script src='https://unpkg.com/mqtt/dist/mqtt.min.js'></script>");
      setMqttStatus("error");
      return;
    }

    setMqttStatus("connecting");
    const url = `ws://${MQTT_HOST}:${MQTT_WS_PORT}/ws`;
    const client = mqtt.connect(url, {
      reconnectPeriod: 3000,
      connectTimeout: 5000,
    });
    clientRef.current = client;

    client.on("connect", () => {
      setMqttStatus("connected");
      client.subscribe(MQTT_TOPIC, { qos: 0 }, err => {
        if (err) console.error("Subscribe error:", err);
      });
    });

    client.on("message", (topic, payload) => {
      try {
        const data = JSON.parse(payload.toString());
        onMessageRef.current(data);
      } catch (e) {
        console.error("MQTT parse error:", e);
      }
    });

    client.on("error",      err => { console.error("MQTT error:", err); setMqttStatus("error"); });
    client.on("offline",    ()  => setMqttStatus("disconnected"));
    client.on("reconnect",  ()  => setMqttStatus("connecting"));
    client.on("disconnect", ()  => setMqttStatus("disconnected"));

    return () => { client.end(true); };
  }, []);

  return mqttStatus;
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [activePage, setActivePage] = useState("Dashboard");
  const [lastUpdated, setLastUpdated] = useState(null);

  // Live MQTT data state — fields mapped directly from JSON payload
  const [data, setData] = useState({
    sku:        null,
    shift:      null,
    state:      null,
    counterIn:  null,
    counterOut: null,
    rejects:    null,
    speed:      null,
    oee:        null,
    lineID:     null,
    plantID:    null,
    timestamp:  null,
  });

  // Message history for the table
  const [history, setHistory] = useState([]);

  const handleMessage = useCallback((msg) => {
    setData({
      sku:        msg.Mespack_SKU ?? "—",
      shift:      msg.Mespack_Shift ?? "—",
      state:      msg.Mespack_Filler_State ?? null,
      counterIn:  msg.Mespack_Filler_Input_Counter  ?? 0,
      counterOut: msg.Mespack_Filler_Output_Counter ?? 0,
      rejects:    msg.Mespack_Filler_Rejects        ?? 0,
      speed:      msg.Mespack_Filler_Speed          ?? 0,
      oee:        msg.Mespack_Filler_OEE            ?? 0,
      lineID:     msg.lineID   ?? "—",
      plantID:    msg.plantID  ?? "—",
      timestamp:  msg._timestamp ?? Date.now(),
    });
    setLastUpdated(new Date());
    setHistory(prev => [
      {
        time:   new Date().toLocaleTimeString([], { hour:"2-digit", minute:"2-digit", second:"2-digit" }),
        in:     msg.Mespack_Filler_Input_Counter,
        out:    msg.Mespack_Filler_Output_Counter,
        rej:    msg.Mespack_Filler_Rejects,
        speed:  msg.Mespack_Filler_Speed?.toFixed(1),
        oee:    msg.Mespack_Filler_OEE?.toFixed(1),
        shift:  msg.Mespack_Shift,
        state:  msg.Mespack_Filler_State,
      },
      ...prev.slice(0, 49),   // keep last 50
    ]);
  }, []);

  const mqttStatus = useMqtt(handleMessage);

  // Derived
  const stateInfo    = FILLER_STATE[data.state] ?? FILLER_STATE[0];
  const rejectRate   = data.counterIn > 0
    ? ((data.rejects / data.counterIn) * 100).toFixed(1) : "0.0";
  const passRate     = data.counterIn > 0
    ? ((data.counterOut / data.counterIn) * 100).toFixed(1) : "0.0";

  const kpis = [
    {
      label:"SKU", icon:"🏷", accent:"bg-indigo-50",
      value: data.sku ?? <span className="text-slate-300 text-lg">—</span>,
      sub: data.lineID ? `Line: ${data.lineID}` : "Awaiting data…",
      badge: <Badge color="emerald"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>Active</Badge>,
    },
    {
      label:"Status", icon:"⚡", accent:"bg-emerald-50",
      value: <span className={stateInfo.color}>{data.state !== null ? stateInfo.label : "—"}</span>,
      sub: data.shift ?? "—",
      badge: data.state !== null
        ? <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ring-1 ${stateInfo.bg} ${stateInfo.color} ${stateInfo.ring}`}>State {data.state}</span>
        : null,
    },
    {
      label:"Counter In", icon:"📥", accent:"bg-blue-50",
      value: data.counterIn?.toLocaleString() ?? "—",
      sub: "Total input count",
      live: true,
    },
    {
      label:"Counter Out", icon:"📤", accent:"bg-violet-50",
      value: data.counterOut?.toLocaleString() ?? "—",
      sub: `${passRate}% pass-through`,
      live: true,
    },
    {
      label:"Rejects", icon:"🚫", accent:"bg-red-50",
      value: data.rejects?.toLocaleString() ?? "—",
      sub: `${rejectRate}% reject rate`,
      live: true,
      badge: data.rejects > 500
        ? <Badge color="red">⚠ High</Badge>
        : data.rejects > 0 ? <Badge color="amber">Monitor</Badge> : null,
    },
    {
      label:"Speed", icon:"⚡", accent:"bg-amber-50",
      value: data.speed != null ? `${data.speed.toFixed(1)} u/m` : "—",
      sub: "Units per minute",
      live: true,
      badge: data.speed >= 150
        ? <Badge color="emerald">On target</Badge>
        : data.speed > 0 ? <Badge color="amber">Below target</Badge> : null,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50" style={{ fontFamily:"'DM Sans','Segoe UI',sans-serif" }}>
      <Sidebar active={activePage} setActive={setActivePage}/>

      <div className="ml-[220px] flex flex-col min-h-screen">
        {/* ── Topbar ───────────────────────────────────────────────── */}
        <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-100 px-8 h-16 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button className="text-slate-300 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100">☰</button>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input className="bg-slate-100 hover:bg-slate-200 focus:bg-white focus:ring-2 focus:ring-indigo-300 rounded-xl pl-9 pr-4 py-2 text-[13px] text-slate-700 outline-none w-60 transition-all placeholder:text-slate-400"
                placeholder="Search records, devices…"/>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-[12px] text-slate-400 font-mono hidden lg:flex flex-col items-end">
              <span>{new Date().toLocaleDateString([], { weekday:"short", month:"short", day:"numeric" })}</span>
              {lastUpdated && <span className="text-emerald-400">↻ {lastUpdated.toLocaleTimeString()}</span>}
            </div>
            <div className="h-5 w-px bg-slate-200"/>
            <MqttStatusPill status={mqttStatus}/>
            <button className="relative w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-5-5.917V4a1 1 0 10-2 0v1.083A6 6 0 006 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
              </svg>
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500 border border-white"/>
            </button>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white text-xs font-bold cursor-pointer">A</div>
          </div>
        </header>

        {/* ── MQTT info banner ──────────────────────────────────────── */}
        {mqttStatus !== "connected" && (
          <div className={`mx-8 mt-4 flex items-start gap-3 px-4 py-3 rounded-xl text-sm border
            ${mqttStatus === "connecting"   ? "bg-amber-50 border-amber-200 text-amber-700"
            : mqttStatus === "error"        ? "bg-red-50 border-red-200 text-red-700"
            : "bg-slate-100 border-slate-200 text-slate-600"}`}>
            <span className="text-lg mt-0.5">
              {mqttStatus === "connecting" ? "⏳" : mqttStatus === "error" ? "⚠️" : "🔌"}
            </span>
            <div>
              <p className="font-bold leading-none mb-1">
                {mqttStatus === "connecting" ? "Connecting to MQTT broker…"
                : mqttStatus === "error"     ? "MQTT connection error"
                : "MQTT disconnected"}
              </p>
              <p className="text-[12px] opacity-80">
                {mqttStatus === "error"
                  ? "Make sure mqtt.js is loaded in your index.html and the broker is reachable at ws://localhost:1886/ws"
                  : `Subscribing to: ${MQTT_TOPIC}`}
              </p>
              {mqttStatus === "error" && (
                <code className="block mt-1 text-[11px] bg-white/60 px-2 py-1 rounded font-mono">
                  {"<script src=\"https://unpkg.com/mqtt/dist/mqtt.min.js\"></script>"}
                </code>
              )}
            </div>
          </div>
        )}

        {/* ── Main ─────────────────────────────────────────────────── */}
        <main className="flex-1 px-8 py-6 space-y-5">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-1">
                {data.plantID ?? "Dressings_Halal"} · {data.lineID ?? "DFOS"}
              </p>
              <h1 className="text-[26px] font-black text-slate-900 tracking-tight leading-none">Dashboard</h1>
            </div>
            <div className="text-right text-[12px] text-slate-400">
              <p className="font-mono">{data.shift ?? "—"}</p>
              <p>Mespack Filler</p>
            </div>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-6 gap-4">
            {kpis.map(k => <KPICard key={k.label} {...k}/>)}
          </div>

          {/* Middle row */}
          <div className="grid grid-cols-3 gap-4">
            <EfficiencyCard oee={data.oee}/>

            {/* Live message history table */}
            <div className="col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-base">📡</div>
                  <span className="font-bold text-slate-800 text-sm">Live MQTT Feed</span>
                  <span className="text-[11px] text-slate-400 font-mono truncate max-w-[240px]" title={MQTT_TOPIC}>
                    /{MQTT_TOPIC.split("/").pop()}
                  </span>
                </div>
                <Badge color={mqttStatus === "connected" ? "emerald" : "slate"}>
                  {mqttStatus === "connected"
                    ? <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>Live</>
                    : "Offline"}
                </Badge>
              </div>

              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-slate-300">
                  <svg className="w-10 h-10 mb-3" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z"/>
                  </svg>
                  <p className="text-sm font-semibold">Waiting for MQTT messages…</p>
                  <p className="text-[12px] mt-1">ws://localhost:{MQTT_WS_PORT}/ws</p>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-52 overflow-y-auto">
                  <table className="w-full">
                    <thead className="sticky top-0">
                      <tr className="bg-slate-50 border-b border-slate-100">
                        {["Time","In","Out","Rejects","Speed","OEE","Shift","State"].map(h => (
                          <th key={h} className="text-left px-4 py-2.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((row, i) => {
                        const si = FILLER_STATE[row.state] ?? FILLER_STATE[0];
                        return (
                          <tr key={i} className={`border-b border-slate-50 hover:bg-slate-50/60 transition-colors ${i===0?"bg-indigo-50/30":""}`}>
                            <td className="px-4 py-2.5 text-[11px] text-slate-500 font-mono whitespace-nowrap">{row.time}</td>
                            <td className="px-4 py-2.5 text-[12px] font-semibold text-slate-700 tabular-nums">{row.in?.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-[12px] font-semibold text-slate-700 tabular-nums">{row.out?.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-[12px] text-red-500 font-bold tabular-nums">{row.rej?.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-[12px] text-slate-700 tabular-nums">{row.speed}</td>
                            <td className="px-4 py-2.5 text-[12px] text-indigo-600 font-bold tabular-nums">{row.oee}%</td>
                            <td className="px-4 py-2.5 text-[11px] text-slate-500">{row.shift}</td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ring-1 ${si.bg} ${si.color} ${si.ring}`}>
                                {si.label}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Production graph — bottom */}
          <ProductionGraph liveSpeed={data.speed}/>
        </main>
      </div>
    </div>
  );
}