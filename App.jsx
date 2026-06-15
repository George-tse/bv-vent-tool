import { useState, useEffect, useRef, useCallback } from 'react';
import {
  STATIONS, ACTIVITIES, DEFECT_TYPES, PRIORITIES, BV_FANS, TARP,
  calcQ, effectiveMinQ, makeReading,
} from './data/stations.js';
import {
  getAllSurveys, saveSurvey,
  savePhoto, getPhotosForSurvey,
  getAllFanEvents, saveFanEvent,
  getUnsyncedSurveys, getUnsyncedFanEvents,
} from './lib/db.js';
import { syncAll } from './lib/sync.js';

// ── Formatters ────────────────────────────────────────────────────────────────

const todayStr = () => new Date().toISOString().split('T')[0];
const fmtDate  = d => d
  ? new Date(d + 'T12:00:00').toLocaleDateString('en-AU', { day:'2-digit', month:'short', year:'numeric' })
  : '—';

// ── UI primitives ─────────────────────────────────────────────────────────────

const Inp = ({ lbl, v, ch, type = 'text', unit, ph = '' }) => (
  <div className="mb-3">
    <span className="block text-xs text-gray-500 mb-1">
      {lbl}{unit && <span className="text-gray-400 ml-1">{unit}</span>}
    </span>
    <input
      type={type} value={v} onChange={e => ch(e.target.value)} placeholder={ph}
      inputMode={type === 'number' ? 'decimal' : undefined}
      className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm
                 focus:border-blue-400 focus:outline-none bg-white"
    />
  </div>
);

const Sel = ({ lbl, v, ch, opts }) => (
  <div className="mb-3">
    {lbl && <span className="block text-xs text-gray-500 mb-1">{lbl}</span>}
    <select value={v} onChange={e => ch(e.target.value)}
      className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm bg-white
                 focus:border-blue-400 focus:outline-none">
      {opts.map(o => <option key={o}>{o}</option>)}
    </select>
  </div>
);

const Pip = ({ q, minQ }) => {
  if (q === null) return <span className="w-2.5 h-2.5 rounded-full bg-gray-300 flex-shrink-0 inline-block" />;
  return q >= minQ
    ? <span className="w-2.5 h-2.5 rounded-full bg-green-500 flex-shrink-0 inline-block" />
    : <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0 inline-block" />;
};

const SyncBtn = ({ status, msg, pending, isOnline, onClick }) => {
  const cfg = {
    idle:    { bg: 'bg-blue-600', label: `Sync to cloud${pending > 0 ? ` (${pending})` : ''}` },
    syncing: { bg: 'bg-blue-400', label: msg || 'Syncing…' },
    done:    { bg: 'bg-green-600', label: msg || 'Synced ✓' },
    error:   { bg: 'bg-red-600',  label: msg || 'Sync failed' },
  }[status] || { bg: 'bg-blue-600', label: 'Sync' };

  return (
    <button onClick={onClick} disabled={!isOnline || status === 'syncing'}
      className={`w-full py-3 rounded-xl text-white text-sm font-bold transition-colors ${cfg.bg}
                  disabled:opacity-50 disabled:cursor-not-allowed`}>
      {status === 'syncing'
        ? <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            {cfg.label}
          </span>
        : cfg.label}
    </button>
  );
};

// ── Screen: Home ──────────────────────────────────────────────────────────────

function Home({ surveys, pending, isOnline, onNew, onOpen, onSync, syncStatus, syncMsg }) {
  return (
    <div className="p-4 pb-8">
      <div className="pt-1 mb-5">
        <p className="text-xs font-mono text-blue-600 tracking-widest mb-1 uppercase">Focus Minerals · Bonnie Vale UG</p>
        <h1 className="text-2xl font-bold text-gray-900">Vent Survey Tool</h1>
        <p className="text-sm text-gray-400 mt-0.5">FML-UGM-RP-002 · Secondary Ventilation</p>
      </div>

      <button onClick={onNew}
        className="w-full py-3.5 rounded-xl bg-brand text-white font-bold text-sm mb-3 active:opacity-80">
        + New survey
      </button>

      {pending > 0 && (
        <div className="mb-3">
          <SyncBtn status={syncStatus} msg={syncMsg} pending={pending} isOnline={isOnline} onClick={onSync} />
          {!isOnline && (
            <p className="text-xs text-amber-600 text-center mt-1.5">
              Connect to WiFi or mobile data to sync
            </p>
          )}
        </div>
      )}

      {surveys.length > 0 && (
        <>
          <p className="text-xs font-mono text-gray-400 tracking-widest mb-2 uppercase">Previous surveys</p>
          {surveys.map(sv => {
            const done = sv.readings.filter(r => r.done).length;
            const defs = sv.readings.reduce((a, r) => a + (r.defects?.length || 0), 0);
            return (
              <button key={sv.id} onClick={() => onOpen(sv)}
                className="w-full text-left bg-white rounded-xl border border-gray-200 p-4 mb-2
                           hover:border-blue-300 active:bg-gray-50 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-semibold text-sm text-gray-900">{fmtDate(sv.date)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{sv.surveyor}</p>
                  </div>
                  <div className="text-right flex-shrink-0 ml-2">
                    <p className="text-xs font-mono font-bold text-blue-600">{done}/{STATIONS.length}</p>
                    {defs > 0 && <p className="text-xs text-red-500 mt-0.5">⚠ {defs} defect{defs !== 1 ? 's' : ''}</p>}
                    {sv.synced
                      ? <p className="text-xs text-green-500 mt-0.5">☁ synced</p>
                      : <p className="text-xs text-amber-500 mt-0.5">● local</p>}
                  </div>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {STATIONS.map((stn, i) => {
                    const r  = sv.readings[i];
                    const q  = calcQ(r.vel, stn.csa, r.csaOv);
                    const mQ = effectiveMinQ(stn, r.act);
                    return <Pip key={stn.id} q={q} minQ={mQ} />;
                  })}
                </div>
              </button>
            );
          })}
        </>
      )}

      {surveys.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-5xl mb-3">📋</p>
          <p className="font-medium text-gray-500">No surveys yet</p>
          <p className="text-sm mt-1">Tap + New survey to begin</p>
        </div>
      )}
    </div>
  );
}

// ── Screen: New Survey ────────────────────────────────────────────────────────

function NewSurvey({ onStart, onBack }) {
  const [info, setInfo] = useState({ date: todayStr(), surveyor: 'George Xie', weather: '' });
  const set = (k, v) => setInfo(p => ({ ...p, [k]: v }));
  return (
    <div className="p-4 pb-8">
      <div className="flex items-center gap-3 mb-5 pt-1">
        <button onClick={onBack} className="text-blue-600 text-sm font-medium">← Back</button>
        <h2 className="font-bold text-lg text-gray-900">New survey</h2>
      </div>
      <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
        <p className="text-xs font-mono text-blue-600 tracking-widest mb-3 uppercase">Survey details</p>
        <Inp lbl="Survey date" v={info.date}     ch={v => set('date', v)}     type="date" />
        <Inp lbl="Ventilation officer" v={info.surveyor} ch={v => set('surveyor', v)} ph="Full name" />
        <Inp lbl="Surface conditions"  v={info.weather}  ch={v => set('weather', v)}  ph="e.g. Sunny 28 °C" />
      </div>
      <button onClick={() => onStart(info)} disabled={!info.date || !info.surveyor}
        className="w-full py-4 rounded-2xl bg-brand text-white font-bold text-sm disabled:opacity-50">
        Start survey → 8 stations
      </button>
    </div>
  );
}

// ── Screen: Station list ──────────────────────────────────────────────────────

function StationList({ sv, onSel, onReport, onBack }) {
  const done = sv.readings.filter(r => r.done).length;
  const defs = sv.readings.reduce((a, r) => a + (r.defects?.length || 0), 0);
  return (
    <div>
      <div className="no-print bg-white border-b border-gray-200 px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={onBack} className="text-blue-600 text-sm font-medium">← Save & back</button>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-gray-900 truncate">{fmtDate(sv.date)}</p>
            <p className="text-xs text-gray-400">{sv.surveyor}</p>
          </div>
          <button onClick={onReport}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors
            ${done === STATIONS.length ? 'bg-brand text-white' : 'bg-gray-100 text-gray-400'}`}>
            Report →
          </button>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1">
          <div className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${(done / STATIONS.length) * 100}%` }} />
        </div>
        <div className="flex justify-between">
          <span className="text-xs text-gray-400">{done}/{STATIONS.length} complete</span>
          {defs > 0 && <span className="text-xs text-red-500">⚠ {defs} defect{defs !== 1 ? 's' : ''}</span>}
        </div>
      </div>

      <div className="p-4">
        {STATIONS.map((stn, i) => {
          const r  = sv.readings[i];
          const q  = calcQ(r.vel, stn.csa, r.csaOv);
          const mQ = effectiveMinQ(stn, r.act);
          return (
            <button key={stn.id} onClick={() => onSel(i)}
              className={`w-full text-left rounded-xl p-4 mb-2.5 border transition-colors
              ${r.done ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white hover:border-blue-300'}`}>
              <div className="flex items-center gap-3">
                <Pip q={q} minQ={mQ} />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline gap-1">
                    <span className="font-semibold text-sm text-gray-900">{stn.loc}</span>
                    <span className="text-xs text-gray-400 flex-shrink-0">{stn.fan}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">{stn.stn} · CSA {stn.csa} m²</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {(r.defects?.length > 0) && (
                    <span className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-1.5">
                      ⚠{r.defects.length}
                    </span>
                  )}
                  {q !== null
                    ? <span className={`text-xs font-mono font-bold px-2 py-1 rounded-lg
                        ${q >= mQ ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {q.toFixed(1)}
                      </span>
                    : <span className="text-gray-300 text-lg">›</span>}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Screen: Station entry ─────────────────────────────────────────────────────

function StationEntry({ sv, idx, stationPhotos, onUpd, onDef, onPhoto, onDone, onBack }) {
  const stn = STATIONS[idx];
  const r   = sv.readings[idx];
  const q   = calcQ(r.vel, stn.csa, r.csaOv);
  const mQ  = effectiveMinQ(stn, r.act);
  const qOk = q !== null && q >= mQ;

  const [gasOpen, setGasOpen]   = useState(false);
  const [defOpen, setDefOpen]   = useState(false);
  const [dType,   setDType]     = useState(DEFECT_TYPES[0]);
  const [dPri,    setDPri]      = useState(PRIORITIES[0]);
  const [dNote,   setDNote]     = useState('');
  const photoRef = useRef();

  const up = (field, val) => onUpd(idx, field, val);

  const heatZone = () => {
    const wb = parseFloat(r.wb);
    if (!r.wb || isNaN(wb)) return null;
    if (wb < 27) return { t: 'Optimum',                      cls: 'text-green-700 bg-green-50 border-green-200' };
    if (wb < 30) return { t: 'Caution — increase monitoring', cls: 'text-yellow-700 bg-yellow-50 border-yellow-200' };
    if (wb < 32) return { t: 'Buffer — supervisor approval',  cls: 'text-orange-700 bg-orange-50 border-orange-200' };
    return            { t: 'WITHDRAWAL — stop all work',    cls: 'text-red-700 bg-red-50 border-red-200' };
  };

  const gasWarnings = (() => {
    const w = [];
    if (r.o2  && parseFloat(r.o2)  < 19.5)  w.push('⚡ O₂ below 19.5 % — evacuate immediately');
    if (r.co  && parseFloat(r.co)  > 21)    w.push('⚡ CO exceeds Alarm-1 (21 ppm)');
    if (r.no2 && parseFloat(r.no2) > 1)     w.push('⚡ NO₂ exceeds 1 ppm — check blasting status');
    if (r.h2s && parseFloat(r.h2s) > 1)     w.push('⚡ H₂S exceeds 1 ppm');
    return w;
  })();

  const zone = heatZone();

  const submitDefect = () => {
    onDef(idx, dType, dPri, dNote);
    setDefOpen(false); setDNote('');
  };

  const handlePhoto = (e) => {
    const file = e.target.files[0];
    if (file) onPhoto(idx, file);
    e.target.value = '';   // allow re-selecting same file
  };

  return (
    <div className="pb-10">
      {/* Sticky header */}
      <div className="no-print sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={onBack} className="text-blue-600 text-sm font-medium">← List</button>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-gray-900">{stn.loc}</p>
            <p className="text-xs text-gray-400">{stn.fan} · {stn.stn} · {stn.csa} m²</p>
          </div>
          <span className="text-xs text-gray-400">{idx + 1}/{STATIONS.length}</span>
        </div>
        {/* Q status bar */}
        <div className={`mx-4 mb-3 rounded-xl px-4 py-2.5 text-xs font-semibold text-center border
          ${q === null
            ? 'bg-gray-50 border-gray-200 text-gray-400'
            : qOk ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-red-50 border-red-200 text-red-700'}`}>
          {q === null
            ? `Q = vel × ${parseFloat(r.csaOv) || stn.csa} m²  —  enter velocity`
            : qOk
              ? `✓  ${r.vel} × ${parseFloat(r.csaOv) || stn.csa} = ${q.toFixed(1)} m³/s  ≥  ${mQ} m³/s`
              : `✗  ${q.toFixed(1)} m³/s  <  ${mQ} m³/s  NON-COMPLIANT`}
        </div>
      </div>

      <div className="px-4 pt-3 space-y-3">

        {/* Airflow */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-xs font-mono text-blue-600 tracking-widest mb-3 uppercase">Airflow · ALNOR RVA501 + Disto</p>
          <div className="grid grid-cols-2 gap-3">
            <Inp lbl="Face velocity" v={r.vel}   ch={v => up('vel',   v)} type="number" unit="m/s" ph="0.0" />
            <Inp lbl="CSA override"  v={r.csaOv} ch={v => up('csaOv', v)} type="number" unit="m²"  ph={`${stn.csa}`} />
          </div>
          <p className="text-xs text-gray-400 text-center mt-1">
            Min Q = {stn.minQ} m³/s
            {stn.truckMinQ ? ' · 45 m³/s for truck loading (Portal)' : ''}
          </p>
        </div>

        {/* Temperature */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-xs font-mono text-blue-600 tracking-widest mb-3 uppercase">Temperature · Kestrel</p>
          <div className="grid grid-cols-3 gap-3">
            <Inp lbl="DB" v={r.db}  ch={v => up('db',  v)} type="number" unit="°C"  ph="28" />
            <Inp lbl="WB" v={r.wb}  ch={v => up('wb',  v)} type="number" unit="°C"  ph="22" />
            <Inp lbl="BP" v={r.bar} ch={v => up('bar', v)} type="number" unit="hPa" ph="996" />
          </div>
          {zone && (
            <p className={`text-xs font-semibold px-3 py-2 rounded-xl border mt-2 ${zone.cls}`}>
              WB {r.wb} °C → {zone.t}
            </p>
          )}
        </div>

        {/* Gas — collapsible */}
        <div className="bg-white rounded-2xl border border-gray-200">
          <button onClick={() => setGasOpen(!gasOpen)}
            className="w-full px-4 py-3 flex justify-between items-center text-left">
            <div>
              <p className="text-xs font-mono text-blue-600 tracking-widest uppercase">Gas · Blackline Safety G7</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {r.o2 ? `O₂ ${r.o2}%  CO ${r.co || '—'} ppm` : 'Tap to record gas readings'}
              </p>
            </div>
            <span className="text-gray-300 text-xs ml-2">{gasOpen ? '▲' : '▼'}</span>
          </button>
          {gasOpen && (
            <div className="border-t border-gray-100 px-4 pb-4 pt-3">
              <div className="grid grid-cols-3 gap-3">
                <Inp lbl="O₂" v={r.o2}  ch={v => up('o2',  v)} type="number" unit="%" ph="20.9" />
                <Inp lbl="CO" v={r.co}  ch={v => up('co',  v)} type="number" unit="ppm" ph="0" />
                <Inp lbl="CO₂"v={r.co2} ch={v => up('co2', v)} type="number" unit="ppm" ph="400" />
                <Inp lbl="NO₂"v={r.no2} ch={v => up('no2', v)} type="number" unit="ppm" ph="0" />
                <Inp lbl="H₂S"v={r.h2s} ch={v => up('h2s', v)} type="number" unit="ppm" ph="0" />
              </div>
              {gasWarnings.map((w, i) => (
                <p key={i} className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mt-1">{w}</p>
              ))}
            </div>
          )}
        </div>

        {/* Activity */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <p className="text-xs font-mono text-blue-600 tracking-widest mb-3 uppercase">Activity & notes</p>
          <Sel lbl="Activity at time of survey" v={r.act} ch={v => up('act', v)} opts={ACTIVITIES} />
          {r.act === 'Truck loading' && stn.truckMinQ && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
              ⚠ Truck loading at Portal — confirm ≥ 45 m³/s (1.4 m/s) with Shift Supervisor before commencing
            </p>
          )}
          <Inp lbl="Issues / comments" v={r.cmt} ch={v => up('cmt', v)}
            ph="e.g. Choke partially blocked, bag 25 m from face" />
        </div>

        {/* Defects */}
        <div className="bg-white rounded-2xl border border-gray-200">
          <div className="flex justify-between items-center px-4 py-3">
            <div>
              <p className="text-xs font-mono text-blue-600 tracking-widest uppercase">Defects</p>
              <p className="text-xs text-gray-400">{(r.defects?.length || 0)} recorded</p>
            </div>
            <button onClick={() => setDefOpen(!defOpen)}
              className="text-xs font-semibold text-red-600 border border-red-200 rounded-xl px-3 py-1.5 bg-red-50">
              + Add defect
            </button>
          </div>
          {r.defects?.map(d => (
            <div key={d.id} className="mx-4 mb-3 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5">
              <p className="text-xs font-semibold text-red-700">{d.type}</p>
              <p className="text-xs text-red-400 mt-0.5">{d.priority}</p>
              {d.note && <p className="text-xs text-gray-500 mt-1">{d.note}</p>}
            </div>
          ))}
          {defOpen && (
            <div className="border-t border-gray-100 px-4 pb-4 pt-3">
              <Sel lbl="Defect type" v={dType} ch={setDType} opts={DEFECT_TYPES} />
              <Sel lbl="Priority"    v={dPri}  ch={setDPri}  opts={PRIORITIES} />
              <Inp lbl="Notes" v={dNote} ch={setDNote} ph="Location, severity, photo reference…" />
              <div className="flex gap-2 mt-1">
                <button onClick={() => setDefOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-gray-100 text-gray-600 text-sm">Cancel</button>
                <button onClick={submitDefect}
                  className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold">Save defect</button>
              </div>
            </div>
          )}
        </div>

        {/* Photos */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex justify-between items-center mb-3">
            <div>
              <p className="text-xs font-mono text-blue-600 tracking-widest uppercase">Photos</p>
              <p className="text-xs text-gray-400">{stationPhotos.length} attached · saved offline</p>
            </div>
            <button onClick={() => photoRef.current?.click()}
              className="text-xs font-semibold border border-gray-300 rounded-xl px-3 py-1.5 bg-gray-50">
              📷 Capture
            </button>
            <input ref={photoRef} type="file" accept="image/*" capture="environment"
              className="hidden" onChange={handlePhoto} />
          </div>
          {stationPhotos.length > 0 ? (
            <div className="flex gap-2 flex-wrap">
              {stationPhotos.map(p => (
                <div key={p.id} className="text-center">
                  {p.data && (
                    <img src={p.data} alt={p.name}
                      className="w-20 h-20 object-cover rounded-xl border border-gray-200" />
                  )}
                  <p className="text-xs text-gray-400 mt-1 w-20 truncate text-center">{p.name}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-200 rounded-xl py-6 text-center text-gray-400 text-xs">
              Tap 📷 to capture defect photos
              <br /><span className="text-gray-300">Photos saved to device, uploaded when online</span>
            </div>
          )}
        </div>

        {/* Done button */}
        <button onClick={onDone}
          className={`w-full py-4 rounded-2xl font-bold text-sm transition-colors
          ${r.done
            ? 'bg-green-50 text-green-700 border-2 border-green-300'
            : 'bg-brand text-white active:opacity-80'}`}>
          {r.done ? '✓ Station complete — tap to re-open' : 'Mark station complete →'}
        </button>
      </div>
    </div>
  );
}

// ── Screen: Report view ───────────────────────────────────────────────────────

const TH  = { padding:'5px 7px', fontSize:'10px', textAlign:'left', border:'1px solid rgba(255,255,255,0.25)', whiteSpace:'nowrap' };
const TD  = { padding:'5px 7px', fontSize:'10px', border:'1px solid #e0e0e0', verticalAlign:'top' };

function ReportView({ sv, allPhotos, onBack }) {
  const allDefs = sv.readings.flatMap((r, i) =>
    (r.defects || []).map(d => ({ ...d, loc: STATIONS[i].loc })));

  return (
    <div>
      <div className="no-print bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={onBack} className="text-blue-600 text-sm font-medium">← Back</button>
        <p className="flex-1 font-semibold text-sm text-gray-900">Report · FML-UGM-RP-002</p>
        <button onClick={() => window.print()}
          className="bg-brand text-white rounded-xl px-4 py-2 text-xs font-bold">🖨 Print</button>
      </div>

      <div id="report" style={{ background:'white', color:'#111', fontFamily:'Arial,Helvetica,sans-serif', padding:16 }}>
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
          <div>
            <div style={{ color:'#1B4E8C', fontWeight:900, fontSize:20, letterSpacing:1 }}>FOCUS</div>
            <div style={{ color:'#1B4E8C', fontWeight:700, fontSize:12 }}>Minerals Ltd.</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontWeight:'bold', fontSize:14 }}>Secondary Ventilation Survey Report</div>
            <div style={{ color:'#888', fontSize:9, marginTop:2 }}>FML-UGM-RP-002 · {fmtDate(sv.date)}</div>
          </div>
        </div>

        {/* Meta row */}
        <div style={{ background:'#1B4E8C', color:'white', borderRadius:5, padding:'7px 10px', marginBottom:12, display:'flex', gap:20, flexWrap:'wrap', fontSize:10 }}>
          {[['Mine','Bonnie Vale Underground'],['Survey Date',fmtDate(sv.date)],['Type','Secondary Vent Survey'],['Surveyor',sv.surveyor],['Surface',sv.weather||'—']].map(([k,v])=>(
            <div key={k}><div style={{opacity:.6,marginBottom:1}}>{k}</div><div style={{fontWeight:'bold'}}>{v}</div></div>
          ))}
        </div>

        {/* Measurements table */}
        <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:10 }}>
          <thead>
            <tr style={{ background:'#1B4E8C', color:'white' }}>
              {['Location','Fan','Stn','CSA','Vel','Q m³/s','Min Q','DB°C','WB°C','Activity','Issues','OK'].map(h=>(
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STATIONS.map((stn, i) => {
              const r  = sv.readings[i];
              const q  = calcQ(r.vel, stn.csa, r.csaOv);
              const mQ = effectiveMinQ(stn, r.act);
              const ok = q !== null && q >= mQ;
              return (
                <tr key={stn.id} style={{ background: i % 2 === 0 ? '#F7F9FC' : 'white' }}>
                  <td style={{ ...TD, fontWeight:'bold' }}>{stn.loc}</td>
                  <td style={{ ...TD, fontSize:9 }}>{stn.fan}</td>
                  <td style={TD}>{stn.stn}</td>
                  <td style={{ ...TD, textAlign:'center' }}>{parseFloat(r.csaOv)||stn.csa}</td>
                  <td style={{ ...TD, textAlign:'center', color:r.vel?'#111':'#bbb' }}>{r.vel||'—'}</td>
                  <td style={{ ...TD, textAlign:'center', fontWeight:'bold', color:q?(ok?'#166534':'#991b1b'):'#bbb' }}>{q?q.toFixed(1):'—'}</td>
                  <td style={{ ...TD, textAlign:'center' }}>{mQ}</td>
                  <td style={{ ...TD, textAlign:'center' }}>{r.db||'—'}</td>
                  <td style={{ ...TD, textAlign:'center' }}>{r.wb||'—'}</td>
                  <td style={TD}>{r.act}</td>
                  <td style={TD}>{r.cmt||'—'}</td>
                  <td style={{ ...TD, textAlign:'center', fontWeight:'bold', color:q?(ok?'#166534':'#991b1b'):'#bbb' }}>{q?(ok?'✓':'✗'):'—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* NB note */}
        <div style={{ background:'#FFFDE7', border:'1px solid #F9A825', borderRadius:4, padding:'5px 8px', marginBottom:10, fontSize:9 }}>
          <strong>NB:</strong> Minimum airflow volume requirement of 45 m³/s (at least 1.4 m/s measured by a Kestrel) for loading stockpiles to be confirmed by Shift Supervisor before commencing truck loading at Portal.
        </div>

        {/* Action items */}
        {allDefs.length > 0 && (
          <>
            <div style={{ fontWeight:'bold', fontSize:11, marginBottom:5 }}>Action Items</div>
            <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:10 }}>
              <thead>
                <tr style={{ background:'#1B4E8C', color:'white' }}>
                  {['Description','Location','Corrective Action','Priority','Assigned','Due','Date Completed','Signed'].map(h=>(
                    <th key={h} style={TH}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allDefs.map((d, i) => (
                  <tr key={d.id} style={{ background: i%2===0 ? '#F7F9FC':'white' }}>
                    <td style={TD}>{d.type}</td>
                    <td style={TD}>{d.loc}</td>
                    <td style={TD}>{d.note || 'Repair / replace as required — see photos'}</td>
                    <td style={{ ...TD, color:d.priority.startsWith('P1')?'#991b1b':d.priority.startsWith('P2')?'#92400e':'#111' }}>{d.priority}</td>
                    <td style={TD}>Barminco foreperson</td>
                    <td style={TD}>{d.priority.startsWith('P1')?'Immediate':d.priority.startsWith('P2')?fmtDate(sv.date):'Always'}</td>
                    <td style={{ ...TD, minWidth:70 }}></td>
                    <td style={{ ...TD, minWidth:50 }}></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Defect photos */}
        {allPhotos.length > 0 && (
          <>
            <div style={{ fontWeight:'bold', fontSize:11, marginBottom:5 }}>
              Defects for Correction (Return to vent officer once all defects fixed)
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
              {allPhotos.map(p => {
                const stn = STATIONS.find(s => s.id === p.stationId);
                return (
                  <div key={p.id}>
                    {p.data && (
                      <img src={p.data} style={{ width:'100%', maxHeight:160, objectFit:'cover', borderRadius:4, border:'1px solid #ddd' }} alt={p.name} />
                    )}
                    <p style={{ fontSize:8, color:'#888', marginTop:3 }}>{stn?.loc} — {p.name}</p>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Sign-off */}
        <div style={{ borderTop:'1px solid #ddd', paddingTop:10 }}>
          <div style={{ fontWeight:'bold', textAlign:'center', marginBottom:6, fontSize:10 }}>
            Authorisation of Secondary Ventilation Survey Report
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#1B4E8C', color:'white' }}>
                {['Position','Name','Signed','Date'].map(h=><th key={h} style={TH}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {[
                ['Ventilation Officer', sv.surveyor, '', fmtDate(sv.date)],
                ['Barminco Foreperson', '', '', ''],
                ['Underground Manager', '', '', ''],
              ].map(([pos, name, sig, date], i) => (
                <tr key={i} style={{ background: i%2===0 ? '#F7F9FC':'white', height:36 }}>
                  <td style={{ ...TD, fontWeight:'bold' }}>{pos}</td>
                  <td style={TD}>{name}</td>
                  <td style={TD}>{sig}</td>
                  <td style={TD}>{date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ color:'#ccc', fontSize:8, marginTop:6, textAlign:'right' }}>
          Generated by BV Vent Survey Tool · FML-UGM-RP-002
        </p>
      </div>
    </div>
  );
}

// ── Screen: Fan events ────────────────────────────────────────────────────────

function FanEvents({ events, onAdd }) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: todayStr(), time: '', fans: [], cause: '', actions: '', duration: '', resolution: '' });
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const tog = f => setForm(p => ({ ...p, fans: p.fans.includes(f) ? p.fans.filter(x=>x!==f) : [...p.fans, f] }));
  const submit = () => { onAdd(form); setShowForm(false); setForm({ date: todayStr(), time: '', fans: [], cause: '', actions: '', duration: '', resolution: '' }); };

  return (
    <div className="p-4 pb-8">
      <div className="flex justify-between items-center mb-4 pt-1">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Fan events</h2>
          <p className="text-xs text-gray-400 mt-0.5">Primary fan failures · UVCP §8.7</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="text-xs font-bold text-red-600 border border-red-200 rounded-xl px-3 py-2 bg-red-50">
          + Log event
        </button>
      </div>

      {/* Log form */}
      {showForm && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4">
          <p className="text-xs font-mono text-red-700 tracking-widest mb-3 uppercase">Log fan event</p>
          <div className="grid grid-cols-2 gap-3">
            <Inp lbl="Date" v={form.date} ch={v=>set('date',v)} type="date" />
            <Inp lbl="Time" v={form.time} ch={v=>set('time',v)} type="time" />
          </div>
          <p className="text-xs text-gray-500 mb-1.5">Fan(s) affected</p>
          <div className="mb-3 space-y-1.5">
            {BV_FANS.map(f => (
              <label key={f} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
                <input type="checkbox" checked={form.fans.includes(f)} onChange={() => tog(f)} className="accent-red-600 w-4 h-4" />
                {f}
              </label>
            ))}
          </div>
          <Inp lbl="Cause / description"  v={form.cause}      ch={v=>set('cause',v)}      ph="e.g. Motor trip on VR6-2, vibration fault" />
          <Inp lbl="TARP actions taken"   v={form.actions}    ch={v=>set('actions',v)}    ph="e.g. Applied P3, notified shift boss, limited 3 trucks" />
          <Inp lbl="Outage duration"      v={form.duration}   ch={v=>set('duration',v)}   ph="e.g. 45 min" />
          <Inp lbl="Resolution"           v={form.resolution} ch={v=>set('resolution',v)} ph="e.g. Fan restarted by electrician at 14:30" />
          <div className="flex gap-2 mt-2">
            <button onClick={() => setShowForm(false)}
              className="flex-1 py-2.5 rounded-xl bg-white border border-gray-300 text-gray-600 text-sm">Cancel</button>
            <button onClick={submit}
              className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold">Save event</button>
          </div>
        </div>
      )}

      {/* TARP quick-reference */}
      <div className="bg-white rounded-xl border border-gray-200 mb-4 overflow-hidden">
        <p className="text-xs font-mono text-blue-600 tracking-widest px-4 py-3 border-b border-gray-100 uppercase">
          TARP reference · UVCP Table 12 (BV-adapted)
        </p>
        <div className="overflow-x-auto">
          <table style={{ minWidth:460, borderCollapse:'collapse', fontSize:11 }}>
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Scenario','VR3','VR6','Vol m³/s','Trucks','Restrictions'].map(h => (
                  <th key={h} className="px-3 py-2 text-left text-xs text-gray-500 font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TARP.map((t, i) => (
                <tr key={i} className={`border-b border-gray-100 ${t.vol === 0 ? 'text-red-700 font-semibold' : t.vol < 500 ? 'text-orange-600' : ''}`}>
                  <td className="px-3 py-1.5 font-mono text-xs whitespace-nowrap">{t.p}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{t.vr3}</td>
                  <td className="px-3 py-1.5 font-mono text-xs">{t.vr6}</td>
                  <td className="px-3 py-1.5 font-mono text-xs font-bold">{t.vol}</td>
                  <td className="px-3 py-1.5 text-center text-xs">{t.trucks}</td>
                  <td className="px-3 py-1.5 text-xs text-gray-500">{t.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Events log */}
      {events.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-2">⚡</p>
          <p className="font-medium text-gray-500">No events logged</p>
          <p className="text-sm mt-1">Log primary fan failures for the compliance record</p>
        </div>
      ) : events.map(e => (
        <div key={e.id} className="bg-white rounded-xl border border-gray-200 p-4 mb-2">
          <div className="flex justify-between items-start">
            <div>
              <p className="font-semibold text-sm text-gray-900">
                {fmtDate(e.date)}{e.time ? ` · ${e.time}` : ''}
              </p>
              <p className="text-xs text-red-500 mt-0.5">{(e.fans||[]).join(', ')}</p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs bg-gray-100 rounded px-2 py-0.5 text-gray-500">{e.duration||'—'}</span>
              {e.synced
                ? <span className="text-xs text-green-500">☁</span>
                : <span className="text-xs text-amber-500">●</span>}
            </div>
          </div>
          {e.cause      && <p className="text-xs text-gray-500 mt-2">Cause: {e.cause}</p>}
          {e.actions    && <p className="text-xs text-gray-500 mt-0.5">Actions: {e.actions}</p>}
          {e.resolution && <p className="text-xs text-green-600 mt-0.5 font-medium">✓ {e.resolution}</p>}
        </div>
      ))}
    </div>
  );
}

// ── Root app ──────────────────────────────────────────────────────────────────

export default function App() {
  const [tab,          setTab]         = useState('survey');
  const [surveys,      setSurveys]     = useState([]);
  const [events,       setEvents]      = useState([]);
  const [current,      setCurrent]     = useState(null);
  const [screen,       setScreen]      = useState('home');   // home|new|list|station|report
  const [selIdx,       setSelIdx]      = useState(0);
  const [isOnline,     setIsOnline]    = useState(navigator.onLine);
  const [syncStatus,   setSyncStatus]  = useState('idle');   // idle|syncing|done|error
  const [syncMsg,      setSyncMsg]     = useState('');
  const [pendingCount, setPending]     = useState(0);
  const [loading,      setLoading]     = useState(true);
  const [surveyPhotos, setSurveyPhotos]= useState([]);       // all photos for current survey

  // Initial load from IndexedDB
  useEffect(() => {
    Promise.all([getAllSurveys(), getAllFanEvents()])
      .then(([svs, evs]) => { setSurveys(svs); setEvents(evs); setPending(svs.filter(s => !s.synced).length); })
      .finally(() => setLoading(false));
  }, []);

  // Network status
  useEffect(() => {
    const on = () => setIsOnline(true), off = () => setIsOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // ── Survey handlers ─────────────────────────────────────────────────────────

  const startSurvey = useCallback(async (info) => {
    const sv = {
      id: crypto.randomUUID(),
      date: info.date, surveyor: info.surveyor, weather: info.weather,
      synced: false,
      readings: STATIONS.map(makeReading),
    };
    await saveSurvey(sv);
    setCurrent(sv);
    setSurveyPhotos([]);
    setSurveys(prev => [sv, ...prev]);
    setPending(p => p + 1);
    setScreen('list');
  }, []);

  const openSurvey = useCallback(async (sv) => {
    setCurrent(sv);
    const photos = await getPhotosForSurvey(sv.id);
    setSurveyPhotos(photos);
    setScreen('list');
  }, []);

  const updateReading = useCallback((idx, field, val) => {
    setCurrent(prev => {
      const readings = [...prev.readings];
      readings[idx] = { ...readings[idx], [field]: val };
      const updated = { ...prev, readings, synced: false };
      saveSurvey(updated);   // auto-save every keystroke
      return updated;
    });
  }, []);

  const addDefect = useCallback((idx, type, priority, note) => {
    const defect = { id: crypto.randomUUID(), type, priority, note };
    setCurrent(prev => {
      const readings = [...prev.readings];
      readings[idx] = { ...readings[idx], defects: [...(readings[idx].defects || []), defect] };
      const updated = { ...prev, readings, synced: false };
      saveSurvey(updated);
      setSurveys(svs => svs.map(s => s.id === updated.id ? updated : s));
      return updated;
    });
  }, []);

  const addPhoto = useCallback((idx, file) => {
    const surveyId  = current.id;
    const stationId = STATIONS[idx].id;
    const reader    = new FileReader();
    reader.onload = async (e) => {
      const photo = { id: crypto.randomUUID(), surveyId, stationId, name: file.name, data: e.target.result };
      await savePhoto(photo);
      setSurveyPhotos(prev => [...prev, photo]);
      // Record stub (no data) in reading so report knows how many photos
      setCurrent(prev => {
        const readings = [...prev.readings];
        readings[idx] = { ...readings[idx], photos: [...(readings[idx].photos || []), { id: photo.id, name: photo.name }] };
        const updated = { ...prev, readings, synced: false };
        saveSurvey(updated);
        return updated;
      });
    };
    reader.readAsDataURL(file);
  }, [current]);

  const markDone = useCallback((idx) => {
    setCurrent(prev => {
      const readings = [...prev.readings];
      readings[idx]  = { ...readings[idx], done: true };
      const updated  = { ...prev, readings, synced: false };
      saveSurvey(updated);
      setSurveys(svs => svs.map(s => s.id === updated.id ? updated : s));

      // Auto-advance to next unfinished station
      const next = readings.findIndex((r, i) => i > idx && !r.done);
      if (next >= 0) { setSelIdx(next); setScreen('station'); }
      else setScreen('list');

      return updated;
    });
  }, []);

  const saveBack = useCallback(async () => {
    if (current) {
      await saveSurvey({ ...current, synced: false });
      setSurveys(prev => {
        const exists = prev.find(s => s.id === current.id);
        return exists ? prev.map(s => s.id === current.id ? current : s) : [current, ...prev];
      });
    }
    setCurrent(null); setSurveyPhotos([]); setScreen('home');
  }, [current]);

  // ── Sync ────────────────────────────────────────────────────────────────────

  const handleSync = useCallback(async () => {
    if (!isOnline || syncStatus === 'syncing') return;
    setSyncStatus('syncing');
    try {
      const { synced, errors } = await syncAll(msg => setSyncMsg(msg));
      if (errors.length > 0) {
        setSyncStatus('error'); setSyncMsg(errors[0]);
      } else {
        setSyncStatus('done'); setSyncMsg(`${synced} item${synced !== 1 ? 's' : ''} synced`);
        const refreshed = await getAllSurveys();
        setSurveys(refreshed);
        setPending(refreshed.filter(s => !s.synced).length);
      }
    } catch (err) {
      setSyncStatus('error'); setSyncMsg(err.message);
    }
    setTimeout(() => { setSyncStatus('idle'); setSyncMsg(''); }, 4000);
  }, [isOnline, syncStatus]);

  // ── Fan events ──────────────────────────────────────────────────────────────

  const addFanEvent = useCallback(async (ev) => {
    const event = { ...ev, id: crypto.randomUUID(), synced: false };
    await saveFanEvent(event);
    setEvents(prev => [event, ...prev]);
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    </div>
  );

  const stationPhotos = surveyPhotos.filter(p => p.stationId === STATIONS[selIdx]?.id);

  const isHomeScreen  = screen === 'home';
  const showTabBar    = isHomeScreen;

  return (
    <div className="max-w-lg mx-auto bg-gray-50 min-h-screen">

      {/* Offline banner */}
      {!isOnline && (
        <div className="no-print bg-amber-500 text-white text-center text-xs py-1.5 font-medium">
          📡 Offline — data saves locally, syncs when connected
        </div>
      )}

      {/* Tab bar (home only) */}
      {showTabBar && (
        <div className="no-print flex bg-white border-b border-gray-200 sticky top-0 z-20">
          {[['survey','📋 Survey'],['events','⚡ Fan Events']].map(([id,lbl]) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex-1 py-3 text-sm font-semibold transition-colors
              ${tab === id ? 'text-blue-600 border-b-2 border-blue-500 -mb-px' : 'text-gray-400'}`}>
              {lbl}
            </button>
          ))}
        </div>
      )}

      {/* Survey screens */}
      {tab === 'survey' && (
        <>
          {screen === 'home' && (
            <Home surveys={surveys} pending={pendingCount} isOnline={isOnline}
              onNew={() => setScreen('new')} onOpen={openSurvey}
              onSync={handleSync} syncStatus={syncStatus} syncMsg={syncMsg} />
          )}
          {screen === 'new' && (
            <NewSurvey onStart={startSurvey} onBack={() => setScreen('home')} />
          )}
          {screen === 'list' && current && (
            <StationList sv={current}
              onSel={i => { setSelIdx(i); setScreen('station'); }}
              onReport={() => setScreen('report')} onBack={saveBack} />
          )}
          {screen === 'station' && current && (
            <StationEntry sv={current} idx={selIdx} stationPhotos={stationPhotos}
              onUpd={updateReading} onDef={addDefect} onPhoto={addPhoto}
              onDone={() => markDone(selIdx)} onBack={() => setScreen('list')} />
          )}
          {screen === 'report' && current && (
            <ReportView sv={current} allPhotos={surveyPhotos} onBack={() => setScreen('list')} />
          )}
        </>
      )}

      {/* Fan events */}
      {tab === 'events' && isHomeScreen && (
        <FanEvents events={events} onAdd={addFanEvent} />
      )}
    </div>
  );
}
