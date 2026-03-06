import { useState, useEffect, useRef, useCallback } from "react";

// ── MQTT/Server config (topic for display; connection via server) ───────────────
const MQTT_TOPIC = "Unilever_Ph_Nutrition/Dressings_Halal/Filling_Flexibles/DFOS/Dressings DFOS Params";

// WebSocket URL: same origin + /ws (proxied to mespack-server in dev, or server serves client in prod)
function getWsUrl() {
  const base = import.meta.env.VITE_WS_URL;
  if (base) {
    if (base.startsWith("ws://") || base.startsWith("wss://")) return base;
    const u = new URL(base);
    return (u.protocol === "https:" ? "wss:" : "ws:") + "//" + u.host + "/ws";
  }
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

// ── Filler state map ──────────────────────────────────────────────────────────
const FILLER_STATE = {
  0: { label: "Idle",     color: "text-slate-400",   bg: "bg-slate-50",   ring: "ring-slate-200"   },
  1: { label: "Starting", color: "text-amber-500",   bg: "bg-amber-50",   ring: "ring-amber-200"   },
  2: { label: "Running",  color: "text-emerald-500", bg: "bg-emerald-50", ring: "ring-emerald-200" },
  3: { label: "Stopping", color: "text-amber-500",   bg: "bg-amber-50",   ring: "ring-amber-200"   },
  4: { label: "Stopped",  color: "text-red-500",     bg: "bg-red-50",     ring: "ring-red-200"     },
  5: { label: "Fault",    color: "text-red-600",     bg: "bg-red-50",     ring: "ring-red-200"     },
  6: { label: "Running",  color: "text-emerald-500", bg: "bg-emerald-50", ring: "ring-emerald-200" },
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
  { label: "Dashboard", id: "dashboard" },
];

// ── SVG Icons (professional set) ─────────────────────────────────────────────
const IconDashboard = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>
);
const IconChart = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 17l6-6 4 4 8-8" /></svg>
);
const IconTarget = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" /></svg>
);
const IconSignal = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0" /></svg>
);
const IconTag = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318a2.25 2.25 0 00.659 1.59l9.692 9.692a2.25 2.25 0 003.182 0l4.318-4.318a2.25 2.25 0 000-3.182L11.16 3.66A2.25 2.25 0 009.568 3z" /><path d="M6 6h.01v.01H6V6z" /></svg>
);
const IconBolt = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
);
const IconInbox = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 012.012 1.424l.256 1.912a2.25 2.25 0 002.013 1.424h3.218a2.25 2.25 0 002.013-1.424l.256-1.912a2.25 2.25 0 012.013-1.424h3.86m-19.5 0V6a2.25 2.25 0 012.25-2.25h15A2.25 2.25 0 0121.75 6v7.5m-19.5 0A2.25 2.25 0 005.25 16.5h13.5A2.25 2.25 0 0021.75 14.25m-19.5 0v7.5a2.25 2.25 0 002.25 2.25h15a2.25 2.25 0 002.25-2.25v-7.5" /></svg>
);
const IconOutbox = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
);
const IconBan = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
);
const IconSpeed = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
);
const IconDownload = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
);
const IconSearch = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
);
const IconBell = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" /></svg>
);
const IconMenu = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" /></svg>
);
const IconClose = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
);
const EFFICIENCY_META = [
  { key:"oee",         label:"OEE",          tw:"bg-indigo-500"  },
  { key:"avail",       label:"Availability", tw:"bg-emerald-400" },
  { key:"performance", label:"Performance",  tw:"bg-sky-500"     },
  { key:"quality",     label:"Quality",      tw:"bg-amber-400"   },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function Badge({ children, color = "emerald" }) {
  const m = {
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200/80",
    red:     "bg-red-50 text-red-600 ring-red-200/80",
    amber:   "bg-amber-50 text-amber-700 ring-amber-200/80",
    slate:   "bg-slate-100 text-slate-600 ring-slate-200/80",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold ring-1 ${m[color]}`}>
      {children}
    </span>
  );
}

function MqttStatusPill({ status }) {
  const map = {
    connecting:   { dot: "bg-amber-500 animate-pulse",     text: "Connecting…",   short: "…",   pill: "bg-amber-50 border-amber-200 text-amber-700"       },
    connected:    { dot: "bg-emerald-500",                 text: "Live",         short: "Live", pill: "bg-emerald-50 border-emerald-200 text-emerald-700" },
    error:        { dot: "bg-red-500",                      text: "Error",        short: "Err",  pill: "bg-red-50 border-red-200 text-red-700"             },
    disconnected: { dot: "bg-slate-400",                    text: "Disconnected",  short: "Off",  pill: "bg-slate-100 border-slate-200 text-slate-600"      },
  };
  const s = map[status] || map.disconnected;
  return (
    <div className={`flex items-center gap-1.5 sm:gap-2 border text-[11px] sm:text-[12px] font-semibold px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl min-h-[40px] sm:min-h-0 ${s.pill}`}>
      <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0 ${s.dot} ${status === "connected" ? "animate-pulse" : ""}`} />
      <span className="hidden sm:inline">{s.text}</span>
      <span className="sm:hidden">{s.short}</span>
    </div>
  );
}

// ── SVG line-speed chart ──────────────────────────────────────────────────────
function LineSpeedSVG({ liveSpeed }) {
  const W = 1000, H = 72;
  const data = [...LINE_SPEED_HISTORY];
  if (liveSpeed != null) data[data.length - 1] = Math.min(100, (liveSpeed / 250) * 100);
  const n = data.length;
  const pts      = data.map((v, i) => `${(i / (n - 1)) * W},${H - (v / 100) * H}`).join(" ");
  const fillPts  = `0,${H} ${pts} ${W},${H}`;
  const plannedY = H - (68 / 100) * H;
  const liveCY   = liveSpeed != null ? H - (Math.min(100, (liveSpeed / 250) * 100) / 100) * H : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none" style={{ height: 72 }}>
      <defs>
        <linearGradient id="spd" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#6366f1" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0"    />
        </linearGradient>
      </defs>
      <polygon points={fillPts} fill="url(#spd)" />
      <line x1={0} y1={plannedY} x2={W} y2={plannedY} stroke="#60a5fa" strokeWidth={1.5} strokeDasharray="7 5" />
      <polyline points={pts} fill="none" stroke="#6366f1" strokeWidth={2} strokeLinejoin="round" />
      {liveCY != null && (
        <circle cx={W} cy={liveCY} r={5} fill="#6366f1" stroke="#fff" strokeWidth={2} />
      )}
    </svg>
  );
}

// ── Production graph ──────────────────────────────────────────────────────────
function ProductionGraph({ liveSpeed }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
            <IconChart className="w-5 h-5 text-indigo-600" />
          </div>
          <div className="min-w-0">
            <h2 className="font-bold text-slate-800 text-sm leading-none">Production Overview</h2>
            <p className="text-slate-500 text-[12px] mt-0.5">Line performance · 6:00 – 14:00</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:gap-5 text-[12px] text-slate-500">
          <span className="flex items-center gap-2">
            <svg width="20" height="5"><line x1="0" y1="2.5" x2="20" y2="2.5" stroke="#60a5fa" strokeWidth="1.5" strokeDasharray="4 3" /></svg>
            Planned
          </span>
          <span className="flex items-center gap-2">
            <svg width="20" height="5"><line x1="0" y1="2.5" x2="20" y2="2.5" stroke="#6366f1" strokeWidth="2" /></svg>
            Actual
          </span>
          <button type="button" className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 hover:border-slate-300 transition-colors text-[12px] font-medium touch-manipulation min-h-[44px]">
            <IconDownload className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto overflow-y-hidden">
        <div className="px-4 sm:px-6 py-4 min-w-[480px]">
          {[
            {
              label: "Produced",
              content: (
                <div className="flex justify-between">
                  {PRODUCED_HISTORY.map((v, i) => (
                    <div key={i} className={`text-[11px] font-black text-center flex-1 min-w-0
                      ${v === 0 ? "text-red-500" : v > 100 ? "text-emerald-500" : "text-slate-700"}`}>{v}</div>
                  ))}
                </div>
              ),
            },
            {
              label: "Line Speed",
              content: <LineSpeedSVG liveSpeed={liveSpeed} />,
            },
            {
              label: "Loss Type",
              content: (
                <div className="flex h-10 sm:h-12 rounded-lg overflow-hidden ring-1 ring-slate-100">
                  {LOSS_SEGMENTS.map((seg, i) => (
                    <div key={i} title={seg.type}
                      className="hover:opacity-75 cursor-pointer transition-opacity"
                      style={{
                        width: `${seg.end - seg.start}%`, flexShrink: 0,
                        background: LOSS_STYLE[seg.type],
                        borderRight: seg.type === "yellow" ? "2px solid #f59e0b" : undefined,
                      }} />
                  ))}
                </div>
              ),
            },
          ].map(row => (
            <div key={row.label} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mb-3 last:mb-0">
              <div className="w-full sm:w-24 shrink-0 text-[11px] font-semibold text-slate-400 sm:text-right">{row.label}</div>
              <div className="flex-1 min-w-0">{row.content}</div>
            </div>
          ))}

          <div className="flex ml-0 sm:ml-24 mt-1">
            {TIME_LABELS.map((t, i) => (
              <div key={i} className="flex-1 text-center text-slate-300 text-[10px] min-w-0">{t}</div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 sm:gap-6 px-4 sm:px-6 py-3.5 bg-slate-50/80 border-t border-slate-100">
        {LEGEND.map(item => (
          <div key={item.label} className="flex items-center gap-2 text-[11px] sm:text-[12px] text-slate-600">
            <div className="w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-md ring-1 ring-slate-200/80 shrink-0" style={{ background: item.color }} />
            <span className="truncate">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KPICard({ label, value, icon, accent, sub, badge, live }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-5 flex flex-col gap-3 flex-1 min-w-0 hover:shadow-md hover:border-slate-200 transition-all duration-200 focus-within:ring-2 focus-within:ring-indigo-200 focus-within:ring-offset-2">
      <div className="flex items-start justify-between gap-2">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${accent}`}>
          {icon}
        </div>
        {badge}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</p>
        <div className={`text-2xl font-extrabold leading-tight tabular-nums transition-all duration-300 ${live ? "text-indigo-600" : "text-slate-900"}`}>
          {value}
        </div>
        {sub && <p className="text-[12px] text-slate-500 mt-1.5 truncate" title={sub}>{sub}</p>}
      </div>
    </div>
  );
}

// ── Efficiency card ───────────────────────────────────────────────────────────
function EfficiencyCard({ oee }) {
  const avail = oee ? Math.min(100, oee + 15).toFixed(1) : 0;
  const perf  = oee ? Math.min(100, oee + 22).toFixed(1) : 0;
  const qual  = oee ? Math.min(100, oee + 30).toFixed(1) : 0;
  const vals  = { oee: oee?.toFixed(1) ?? 0, avail, performance: perf, quality: qual };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
            <IconTarget className="w-5 h-5 text-violet-600" />
          </div>
          <span className="font-bold text-slate-800 text-sm">Efficiency</span>
        </div>
        <Badge color="emerald">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Live
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {EFFICIENCY_META.map(item => (
          <div key={item.label} className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold text-slate-500">{item.label}</span>
              <span className="text-sm font-bold text-slate-800 tabular-nums">{vals[item.key]}%</span>
            </div>
            <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${item.tw} transition-all duration-700 ease-out`}
                style={{ width: `${Math.min(100, parseFloat(vals[item.key]))}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
const NAV_ICONS = { dashboard: IconDashboard };
function Sidebar({ active, setActive, open, onClose }) {
  const handleNavClick = (label) => {
    setActive(label);
    onClose?.();
  };

  return (
    <>
      {/* Backdrop: only on mobile/tablet when drawer is open */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 lg:hidden
          ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
        className={`fixed left-0 top-0 h-screen w-[280px] max-w-[85vw] bg-[#0f172a] flex flex-col z-50 border-r border-slate-700/50 shadow-xl
          transition-transform duration-300 ease-out lg:translate-x-0 lg:max-w-none lg:w-[232px]
          ${open ? "translate-x-0" : "-translate-x-full"}`}
        aria-modal={open}
        aria-label="Main navigation"
      >
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 h-14 sm:h-[72px] border-b border-slate-700/50 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-indigo-500/25 ring-2 ring-white/10 shrink-0">M</div>
            <span className="text-white font-bold text-base tracking-tight truncate">Mespack</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close menu"
          >
            <IconClose className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto overflow-x-hidden">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-3 mb-3">Main Menu</p>
          {NAV_ITEMS.map(item => {
            const isActive = active === item.label;
            const IconComponent = NAV_ICONS[item.id] || IconDashboard;
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => handleNavClick(item.label)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-[13px] font-medium transition-all duration-200 group touch-manipulation min-h-[44px]
                  ${isActive ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25" : "text-slate-400 hover:text-white hover:bg-slate-700/50 active:bg-slate-700/70"}`}
              >
                <IconComponent className={`w-5 h-5 shrink-0 ${isActive ? "text-white" : "text-slate-400 group-hover:text-slate-200"}`} />
                <span className="leading-snug truncate">{item.label}</span>
                {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/70 shrink-0" />}
              </button>
            );
          })}
        </nav>
        <div className="px-4 py-4 border-t border-slate-700/50 flex items-center gap-3 shrink-0 bg-slate-800/30">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white text-sm font-semibold shrink-0 ring-2 ring-white/10">A</div>
          <div className="overflow-hidden min-w-0">
            <p className="text-slate-100 text-[13px] font-semibold truncate">Admin User</p>
            <p className="text-slate-500 text-[11px] truncate">admin@weight.ocr</p>
          </div>
          <button type="button" className="ml-auto p-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-600/50 transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center" aria-label="Options">⋯</button>
        </div>
      </aside>
    </>
  );
}

// ── Server WebSocket hook (MQTT is on server; client connects here from any IP) ──
function useMqtt(onMessage) {
  const [mqttStatus, setMqttStatus] = useState("disconnected");
  const onMessageRef = useRef(onMessage);
  const reconnectRef = useRef(null);
  const wsRef = useRef(null);

  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  useEffect(() => {
    const wsUrl = getWsUrl();
    setMqttStatus("connecting");

    function connect() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setMqttStatus("connected");
        if (reconnectRef.current) {
          clearInterval(reconnectRef.current);
          reconnectRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "message" && msg.data) {
            onMessageRef.current(msg.data);
          } else if (msg.type === "status") {
            setMqttStatus(msg.status || "disconnected");
          }
        } catch (e) {
          console.error("[WS] Parse error:", e);
        }
      };

      ws.onerror = () => setMqttStatus("error");
      ws.onclose = () => {
        wsRef.current = null;
        setMqttStatus("disconnected");
        if (!reconnectRef.current) {
          reconnectRef.current = setInterval(() => {
            if (!wsRef.current) connect();
          }, 3000);
        }
      };
    }

    connect();
    return () => {
      if (reconnectRef.current) {
        clearInterval(reconnectRef.current);
        reconnectRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  return mqttStatus;
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [activePage,  setActivePage]  = useState("Dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [data, setData] = useState({
    sku: null, shift: null, state: null,
    counterIn: null, counterOut: null, rejects: null,
    speed: null, oee: null, lineID: null, plantID: null, timestamp: null,
  });
  const [history, setHistory] = useState([]);

  const handleMessage = useCallback((msg) => {
    setData({
      sku:        msg.Mespack_SKU               ?? "—",
      shift:      msg.Mespack_Shift             ?? "—",
      state:      msg.Mespack_Filler_State      ?? null,
      counterIn:  msg.Mespack_Filler_Input_Counter  ?? 0,
      counterOut: msg.Mespack_Filler_Output_Counter ?? 0,
      rejects:    msg.Mespack_Filler_Rejects        ?? 0,
      speed:      msg.Mespack_Filler_Speed          ?? 0,
      oee:        msg.Mespack_Filler_OEE            ?? 0,
      lineID:     msg.lineID  ?? "—",
      plantID:    msg.plantID ?? "—",
      timestamp:  msg._timestamp ?? Date.now(),
    });
    setLastUpdated(new Date());
    setHistory(prev => [
      {
        time:  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        in:    msg.Mespack_Filler_Input_Counter,
        out:   msg.Mespack_Filler_Output_Counter,
        rej:   msg.Mespack_Filler_Rejects,
        speed: msg.Mespack_Filler_Speed?.toFixed(1),
        oee:   msg.Mespack_Filler_OEE?.toFixed(1),
        shift: msg.Mespack_Shift,
        state: msg.Mespack_Filler_State,
      },
      ...prev.slice(0, 9),
    ]);
  }, []);

  const mqttStatus = useMqtt(handleMessage);

  // Lock body scroll when mobile drawer is open; close drawer on resize to desktop
  useEffect(() => {
    if (sidebarOpen) {
      document.body.style.overflow = "hidden";
      const mq = window.matchMedia("(min-width: 1024px)");
      const closeOnDesktop = () => {
        if (mq.matches) setSidebarOpen(false);
      };
      mq.addEventListener("change", closeOnDesktop);
      return () => {
        document.body.style.overflow = "";
        mq.removeEventListener("change", closeOnDesktop);
      };
    }
  }, [sidebarOpen]);

  const stateInfo  = FILLER_STATE[data.state] ?? FILLER_STATE[0];
  const rejectRate = data.counterIn > 0 ? ((data.rejects / data.counterIn) * 100).toFixed(1) : "0.0";
  const passRate   = data.counterIn > 0 ? ((data.counterOut / data.counterIn) * 100).toFixed(1) : "0.0";

  const kpis = [
    {
      label: "SKU", icon: <IconTag className="w-5 h-5 text-indigo-600" />, accent: "bg-indigo-50",
      value: data.sku ?? <span className="text-slate-400 text-xl">—</span>,
      sub:   data.lineID !== "—" ? `Line: ${data.lineID}` : "Awaiting data…",
      badge: <Badge color="emerald"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Active</Badge>,
    },
    {
      label: "Status", icon: <IconBolt className="w-5 h-5 text-emerald-600" />, accent: "bg-emerald-50",
      value: <span className={stateInfo.color}>{data.state !== null ? stateInfo.label : "—"}</span>,
      sub:   data.shift ?? "—",
      badge: data.state !== null
        ? <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ring-1 ${stateInfo.bg} ${stateInfo.color} ${stateInfo.ring}`}>State {data.state}</span>
        : null,
    },
    {
      label: "Counter In", icon: <IconInbox className="w-5 h-5 text-blue-600" />, accent: "bg-blue-50",
      value: data.counterIn?.toLocaleString() ?? "—",
      sub:   "Total input count", live: true,
    },
    {
      label: "Counter Out", icon: <IconOutbox className="w-5 h-5 text-violet-600" />, accent: "bg-violet-50",
      value: data.counterOut?.toLocaleString() ?? "—",
      sub:   `${passRate}% pass-through`, live: true,
    },
    {
      label: "Rejects", icon: <IconBan className="w-5 h-5 text-red-600" />, accent: "bg-red-50",
      value: data.rejects?.toLocaleString() ?? "—",
      sub:   `${rejectRate}% reject rate`, live: true,
      badge: data.rejects > 500
        ? <Badge color="red">High</Badge>
        : data.rejects > 0 ? <Badge color="amber">Monitor</Badge> : null,
    },
    {
      label: "Speed", icon: <IconSpeed className="w-5 h-5 text-amber-600" />, accent: "bg-amber-50",
      value: data.speed != null ? `${data.speed.toFixed(1)} u/m` : "—",
      sub:   "Units per minute", live: true,
      badge: data.speed >= 150
        ? <Badge color="emerald">On target</Badge>
        : data.speed > 0 ? <Badge color="amber">Below target</Badge> : null,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50/80">
      <Sidebar
        active={activePage}
        setActive={setActivePage}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="ml-0 lg:ml-[232px] flex flex-col min-h-screen min-w-0">
        {/* ── Topbar ─────────────────────────────────────────────── */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 h-14 sm:h-[72px] flex items-center justify-between gap-2 shrink-0 shadow-sm">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors touch-manipulation min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
              aria-label="Open menu"
            >
              <IconMenu className="w-5 h-5" />
            </button>
            <div className="relative hidden sm:block flex-1 max-w-[200px] md:max-w-none">
              <IconSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="search"
                className="bg-slate-100 hover:bg-slate-200/80 focus:bg-white focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 rounded-xl pl-10 pr-4 py-2.5 text-[13px] text-slate-700 outline-none w-full min-w-0 md:w-64 transition-all placeholder:text-slate-400 border border-transparent"
                placeholder="Search…"
                aria-label="Search"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            <div className="text-[12px] text-slate-500 hidden md:flex flex-col items-end">
              <span className="font-medium">{new Date().toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}</span>
              {lastUpdated && <span className="text-emerald-600 font-medium">Updated {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
            </div>
            <div className="h-6 sm:h-8 w-px bg-slate-200 hidden sm:block" />
            <MqttStatusPill status={mqttStatus} />
            <button type="button" className="relative p-2.5 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors touch-manipulation min-h-[44px] min-w-[44px]" aria-label="Notifications">
              <IconBell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 border-2 border-white" />
            </button>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white text-sm font-semibold cursor-pointer shadow-sm ring-2 ring-white/50 shrink-0 hidden sm:flex">A</div>
          </div>
        </header>

        {/* ── Connection banner (only when not connected) ─────────── */}
        {mqttStatus !== "connected" && (
          <div className={`mx-4 sm:mx-6 lg:mx-8 mt-4 flex items-center gap-3 px-4 py-3 rounded-xl text-sm border
            ${mqttStatus === "connecting" ? "bg-amber-50 border-amber-200/80 text-amber-800"
            : mqttStatus === "error"      ? "bg-red-50 border-red-200/80 text-red-800"
            : "bg-slate-100 border-slate-200 text-slate-600"}`}>
            <span className={`w-2 h-2 rounded-full shrink-0 ${mqttStatus === "connecting" ? "bg-amber-500 animate-pulse" : mqttStatus === "error" ? "bg-red-500" : "bg-slate-400"}`} />
            <div className="min-w-0">
              <p className="font-semibold leading-tight">
                {mqttStatus === "connecting" ? "Connecting to MQTT broker…"
                : mqttStatus === "error"     ? "MQTT connection error"
                : "MQTT disconnected"}
              </p>
              <p className="text-[12px] mt-0.5 text-slate-500">
                <code className="font-mono text-[11px] bg-white/60 px-1 rounded">{typeof window !== "undefined" ? getWsUrl() : "…/ws"}</code>
              </p>
            </div>
          </div>
        )}

        {/* ── Main ───────────────────────────────────────────────── */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 sm:gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-0.5 sm:mb-1 truncate">
                {data.plantID ?? "Dressings_Halal"} · {data.lineID ?? "DFOS"}
              </p>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">Dashboard</h1>
            </div>
            <div className="text-left xs:text-right text-[12px] text-slate-500 shrink-0">
              <p className="font-medium text-slate-700">{data.shift ?? "—"}</p>
              <p>Mespack Filler</p>
            </div>
          </div>

          {/* KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            {kpis.map(k => <KPICard key={k.label} {...k} />)}
          </div>

          {/* Middle row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <EfficiencyCard oee={data.oee} />

            {/* Live MQTT feed table */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden min-w-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 sm:px-5 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                    <IconSignal className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold text-slate-800 text-sm block">Live MQTT Feed</span>
                    <span className="text-[11px] text-slate-500 font-mono truncate block" title={MQTT_TOPIC}>
                      {MQTT_TOPIC.split("/").pop()}
                    </span>
                  </div>
                </div>
                <div className="shrink-0">
                <Badge color={mqttStatus === "connected" ? "emerald" : "slate"}>
                  {mqttStatus === "connected"
                    ? <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />Live</>
                    : "Offline"}
                </Badge>
                </div>
              </div>

              {history.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-slate-50/50">
                  <IconSignal className="w-12 h-12 mb-4 text-slate-300" />
                  <p className="text-sm font-semibold text-slate-500">Waiting for MQTT messages</p>
                  <p className="text-[12px] mt-1 font-mono text-slate-400">Connecting via server</p>
                </div>
              ) : (
                <div className="overflow-x-auto overflow-y-auto max-h-56 scroll-smooth touch-pan-x">
                  <table className="w-full border-collapse min-w-[640px]">
                    <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200">
                      <tr>
                        {["Time", "In", "Out", "Rejects", "Speed", "OEE", "Shift", "State"].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((row, i) => {
                        const si = FILLER_STATE[row.state] ?? FILLER_STATE[0];
                        return (
                          <tr key={i} className={`border-b border-slate-100 hover:bg-slate-50/80 transition-colors ${i === 0 ? "bg-indigo-50/50" : ""}`}>
                            <td className="px-4 py-2.5 text-[12px] text-slate-500 font-mono whitespace-nowrap">{row.time}</td>
                            <td className="px-4 py-2.5 text-[13px] font-semibold text-slate-700 tabular-nums">{row.in?.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-[13px] font-semibold text-slate-700 tabular-nums">{row.out?.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-[13px] text-red-600 font-semibold tabular-nums">{row.rej?.toLocaleString()}</td>
                            <td className="px-4 py-2.5 text-[13px] text-slate-700 tabular-nums">{row.speed}</td>
                            <td className="px-4 py-2.5 text-[13px] text-indigo-600 font-semibold tabular-nums">{row.oee}%</td>
                            <td className="px-4 py-2.5 text-[12px] text-slate-500">{row.shift}</td>
                            <td className="px-4 py-2.5">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-[11px] font-semibold ring-1 ${si.bg} ${si.color} ${si.ring}`}>
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
          <ProductionGraph liveSpeed={data.speed} />
        </main>
      </div>
    </div>
  );
}