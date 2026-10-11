import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { COACHES, PLAYERS, ROWS, SLOTS, evaluateSquad } from './data/players';

const MODEL_URL = (import.meta.env.VITE_TM_MODEL_URL || '').trim();
const INITIAL_RAISED_CLASS = (import.meta.env.VITE_TM_RAISED_CLASS || '').trim();
const GESTURE_CONFIDENCE = 0.85;
const GESTURE_HOLD_MS = 650;
const REARM_LOWER_MS = 350;

function detectRaisedClass(labels) {
  return labels.find(label => /(?:rais|angkat|hand.?up|tangan.?atas)/i.test(label) && !/down|turun|lower/i.test(label)) || '';
}

const DECISION_SECONDS = 8;
const MAX_REJECTIONS = 2;

const initial = {
  phase: 'intro', index: 0, roster: {}, current: null,
  seen: [], rejected: 0, seconds: DECISION_SECONDS, coach: null,
};

const randomItem = (items) => items[Math.floor(Math.random() * items.length)];

function playerPool(state) {
  const taken = new Set(Object.values(state.roster).map(p => p.id));
  const slot = SLOTS[state.index];
  return PLAYERS.filter(p => p.position === slot.position && !taken.has(p.id) && !state.seen.includes(p.id));
}

function acceptCurrent(state) {
  if (state.phase !== 'deciding' || !state.current) return state;
  const roster = { ...state.roster, [SLOTS[state.index].id]: state.current };
  if (state.index === SLOTS.length - 1) {
    return { ...state, roster, current: null, seen: [], phase: 'manager-spinning' };
  }
  return { ...state, roster, index: state.index + 1, current: null, seen: [], rejected: 0, phase: 'spinning' };
}

function rejectCurrent(state) {
  if (state.phase !== 'deciding' || !state.current) return state;
  if (state.rejected >= MAX_REJECTIONS) return acceptCurrent(state);
  return {
    ...state, seen: [...state.seen, state.current.id],
    rejected: state.rejected + 1, current: null, phase: 'spinning',
  };
}

function reducer(state, action) {
  switch (action.type) {
    case 'START': return { ...initial, phase: 'spinning' };
    case 'SPIN_TICK':
      return (state.phase === 'spinning' || state.phase === 'manager-spinning')
        ? { ...state, current: action.item } : state;
    case 'REVEAL':
      return state.phase === 'spinning'
        ? { ...state, current: action.item, seconds: DECISION_SECONDS, phase: 'deciding' } : state;
    case 'ACCEPT': return acceptCurrent(state);
    case 'REJECT': return rejectCurrent(state);
    case 'SECOND':
      if (state.phase !== 'deciding') return state;
      return state.seconds <= 1
        ? rejectCurrent(state)
        : { ...state, seconds: state.seconds - 1 };
    case 'MANAGER_LOCK':
      return state.phase === 'manager-spinning'
        ? { ...state, current: null, coach: action.item, phase: 'result' } : state;
    default: return state;
  }
}

function PlayerCard({ player, isSpinning = false, large = false, placeholder }) {
  if (!player) return (
    <div className={`player-card empty-card ${large ? 'large-card' : ''}`}>
      <span className="empty-plus">+</span>
      <span className="card-position">{placeholder || '???'}</span>
    </div>
  );
  const tier = player.legend ? 'legend-card' : player.rating >= 91 ? 'elite-card' : 'gold-card';
  return (
    <div className={`player-card ${large ? 'large-card' : ''} ${tier} ${isSpinning ? 'is-spinning' : ''}`}>
      {large && <span className="card-tier">{player.legend ? 'FOOTBALL ICON' : player.rating >= 91 ? 'ELITE PLAYER' : 'GOLD PLAYER'}</span>}
      <div className="card-top">
        <span className="player-rating">{player.rating}</span>
        <span className="player-flag" aria-label={player.nation}>{player.flag}</span>
      </div>
      <div className="player-monogram" aria-hidden="true">{player.name.split(' ').slice(-1)[0].slice(0, 1)}</div>
      <div className="player-name">{player.name}</div>
      <div className="player-meta">{player.position} {player.legend ? '· ICON' : ''}</div>
    </div>
  );
}

function Pitch({ roster, currentSlot }) {
  return (
    <div className="pitch" aria-label="4-3-3 squad formation">
      <div className="pitch-circle" />
      <div className="pitch-box pitch-box-top" />
      <div className="pitch-box pitch-box-bottom" />
      {ROWS.map((row, rowIndex) => (
        <div className="pitch-row" key={rowIndex}>
          {row.map((id) => {
            const pos = SLOTS.find(slot => slot.id === id);
            return (
              <div className={`pitch-slot ${currentSlot === id ? 'pitch-active' : ''}`} key={id}>
                <PlayerCard player={roster[id]} placeholder={pos.position} />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function GestureCamera({ isChoosing, onAccept }) {
  const canvasRef = useRef(null);
  const choosingRef = useRef(isChoosing);
  const selectedClassRef = useRef(INITIAL_RAISED_CLASS);
  const selectedClassVersionRef = useRef(0);
  const [status, setStatus] = useState(MODEL_URL ? 'Loading AI model…' : 'Model not connected');
  const [confidence, setConfidence] = useState(0);
  const [classNames, setClassNames] = useState([]);
  const [selectedClass, setSelectedClass] = useState(INITIAL_RAISED_CLASS);
  const [hint, setHint] = useState('Lower your hand before each selection.');

  useEffect(() => { choosingRef.current = isChoosing; }, [isChoosing]);

  function changeRaisedClass(nextClass) {
    selectedClassRef.current = nextClass;
    selectedClassVersionRef.current += 1;
    setSelectedClass(nextClass);
    setHint('Lower your hand to arm the next gesture.');
  }

  useEffect(() => {
    if (!MODEL_URL) return undefined;
    let active = true;
    let webcam;
    let frameId;
    let labelsInitialized = false;
    let lastChoosing = false;
    let lastSelectedClassVersion = selectedClassVersionRef.current;
    let loweredAt = null;
    let raisedAt = null;
    let armed = false;
    let firedForCandidate = false;
    let lastUiUpdate = 0;
    let lastHint = '';

    const changeHint = (message) => {
      if (lastHint !== message && active) {
        lastHint = message;
        setHint(message);
      }
    };

    async function setup() {
      try {
        if (!window.tmPose) throw new Error('AI libraries failed to load. Check internet and refresh.');
        const base = MODEL_URL.endsWith('/') ? MODEL_URL : `${MODEL_URL}/`;
        const model = await window.tmPose.load(`${base}model.json`, `${base}metadata.json`);
        if (!active) return;
        webcam = new window.tmPose.Webcam(240, 180, true);
        await webcam.setup();
        if (!active) { webcam.stop?.(); return; }
        await webcam.play();
        if (!active) { webcam.stop?.(); return; }
        setStatus('AI and webcam ready');

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const loop = async () => {
          if (!active) return;
          try {
            webcam.update();
            const { pose, posenetOutput } = await model.estimatePose(webcam.canvas);
            const predictions = await model.predict(posenetOutput);
            if (!active) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(webcam.canvas, 0, 0, canvas.width, canvas.height);
            if (pose) {
              window.tmPose.drawKeypoints(pose.keypoints, 0.5, ctx);
              window.tmPose.drawSkeleton(pose.keypoints, 0.5, ctx);
            }

            if (!labelsInitialized) {
              labelsInitialized = true;
              const names = predictions.map(item => item.className);
              setClassNames(names);
              const initial = selectedClassRef.current || detectRaisedClass(names);
              if (initial && names.includes(initial)) {
                selectedClassRef.current = initial;
                setSelectedClass(initial);
              }
            }

            const isCurrentlyChoosing = choosingRef.current;
            if (isCurrentlyChoosing !== lastChoosing) {
              lastChoosing = isCurrentlyChoosing;
              // Never carry a held-up hand from one roulette candidate to the next.
              armed = false;
              firedForCandidate = false;
              loweredAt = null;
              raisedAt = null;
              changeHint(isCurrentlyChoosing ? 'Lower hand briefly to get ready.' : 'Waiting for next player…');
            }

            if (lastSelectedClassVersion !== selectedClassVersionRef.current) {
              lastSelectedClassVersion = selectedClassVersionRef.current;
              armed = false;
              firedForCandidate = false;
              loweredAt = null;
              raisedAt = null;
              changeHint('Lower your hand to confirm this gesture class.');
            }

            const selected = selectedClassRef.current;
            const raised = predictions.find(item => item.className === selected);
            const raisedScore = raised?.probability ?? 0;
            const otherScores = predictions.filter(item => item.className !== selected);
            const downScore = otherScores.length ? Math.max(...otherScores.map(item => item.probability)) : 0;
            const visiblePoints = pose?.keypoints?.filter(point => point.score >= 0.5).length ?? 0;
            const personVisible = visiblePoints >= 5;
            const now = performance.now();

            if (now - lastUiUpdate >= 180) {
              setConfidence(Math.round(raisedScore * 100));
              lastUiUpdate = now;
            }

            if (isCurrentlyChoosing && !firedForCandidate) {
              if (!selected || !raised) {
                changeHint('Select the Hand Raised class below.');
                armed = false;
                raisedAt = null;
                loweredAt = null;
              } else if (!personVisible) {
                changeHint('Move into camera view.');
                raisedAt = null;
                loweredAt = null;
              } else if (!armed) {
                if (downScore >= 0.75) {
                  if (loweredAt === null) loweredAt = now;
                  if (now - loweredAt >= REARM_LOWER_MS) {
                    armed = true;
                    changeHint('Ready! Raise your hand to SIGN.');
                  } else changeHint('Keep your hand down briefly…');
                } else {
                  loweredAt = null;
                  changeHint('Lower your hand to enable signing.');
                }
              } else if (raisedScore >= GESTURE_CONFIDENCE) {
                if (raisedAt === null) raisedAt = now;
                changeHint('Hold your raised hand steady…');
                if (now - raisedAt >= GESTURE_HOLD_MS) {
                  firedForCandidate = true;
                  armed = false;
                  changeHint('✓ Gesture detected — player signed!');
                  onAccept();
                }
              } else {
                raisedAt = null;
                changeHint('Ready! Raise your hand to SIGN.');
              }
            }
            frameId = window.requestAnimationFrame(loop);
          } catch (error) {
            if (active) setStatus(`Detection error: ${error.message}`);
          }
        };
        frameId = window.requestAnimationFrame(loop);
      } catch (error) {
        if (active) setStatus(`Camera unavailable: ${error.message}`);
      }
    }
    setup();
    return () => {
      active = false;
      if (frameId) window.cancelAnimationFrame(frameId);
      webcam?.stop?.();
    };
  }, [onAccept]);

  return (
    <section className="camera-panel">
      <div className="panel-header"><span>AI GESTURE DETECTION</span><span className={`status-dot ${MODEL_URL && status === 'AI and webcam ready' ? 'connected' : ''}`} /></div>
      {MODEL_URL ? <div className="camera-stage"><canvas className="camera-feed" width="240" height="180" ref={canvasRef} /><span className="camera-live-chip">{status === 'AI and webcam ready' ? '● LIVE TRACKING' : '◌ CONNECTING'}</span></div> : (
        <div className="camera-offline"><span className="camera-icon">◉</span><span>Connect Teachable Machine to enable camera</span></div>
      )}
      <div className="camera-stats">
        <span>{status}</span>
        {MODEL_URL && <strong>{confidence}% RAISED</strong>}
      </div>
      {MODEL_URL && <div className="gesture-meter" role="meter" aria-label="Raised hand prediction confidence" aria-valuenow={confidence} aria-valuemin="0" aria-valuemax="100"><span style={{ width: `${confidence}%` }} /><i title="85% trigger threshold" /></div>}
      {MODEL_URL && classNames.length > 0 && (
        <label className="model-class-picker">
          <span>WHICH CLASS MEANS HAND RAISED?</span>
          <select value={selectedClass} onChange={event => changeRaisedClass(event.target.value)}>
            <option value="">Choose class…</option>
            {classNames.map(name => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
      )}
      <p className="camera-instruction" aria-live="polite">{MODEL_URL ? hint : 'Using manual controls until a model URL is configured.'}</p>
      <p className="camera-guide">Lower hand to arm, then raise and hold to <strong>SIGN</strong>. Keep it down until the timer ends to <strong>SKIP</strong>. Buttons remain available.</p>
    </section>
  );
}

function TrophyModal({ score, coach, onClose }) {
  const closeButtonRef = useRef(null);
  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="trophy-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="trophy-modal" role="dialog" aria-modal="true" aria-labelledby="trophy-popup-title">
        <button className="modal-close" ref={closeButtonRef} onClick={onClose} aria-label="Close trophy reveal">×</button>
        <span className="eyebrow">THE FINAL WHISTLE</span>
        <span className="trophy-halo" aria-hidden="true">{score.trophy.emoji}</span>
        <span className="trophy-pretitle">YOUR SEASON'S ACHIEVEMENT</span>
        <h2 id="trophy-popup-title">{score.trophy.name}</h2>
        <p>{score.trophy.detail}</p>
        <div className="trophy-summary">
          <div><strong>{score.overall}</strong><small>TEAM OVERALL</small></div>
          <div><strong>{coach.rating}</strong><small>MANAGER RATING</small></div>
          <div><strong>11/11</strong><small>STARTING XI</small></div>
        </div>
        <span className="trophy-coach">Managed by {coach.name}</span>
        <button className="primary-btn popup-continue" onClick={onClose}>VIEW FULL TEAM RESULTS <span aria-hidden="true">→</span></button>
      </div>
    </div>
  );
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initial);
  const [showTrophyPopup, setShowTrophyPopup] = useState(false);
  const dismissTrophyPopup = useCallback(() => setShowTrophyPopup(false), []);
  const { phase, index, roster, current, rejected, seconds, coach } = state;
  const handleAccept = useCallback(() => dispatch({ type: 'ACCEPT' }), []);
  const progress = Object.keys(roster).length;
  const score = useMemo(() => evaluateSquad(roster, coach), [roster, coach]);
  useEffect(() => { setShowTrophyPopup(phase === 'result'); }, [phase]);

  useEffect(() => {
    if (phase !== 'spinning' && phase !== 'manager-spinning') return undefined;
    const pool = phase === 'spinning' ? playerPool(state) : COACHES;
    if (!pool.length) return undefined;
    const interval = window.setInterval(() => dispatch({ type: 'SPIN_TICK', item: randomItem(pool) }), 85);
    const timeout = window.setTimeout(() => {
      window.clearInterval(interval);
      dispatch({ type: phase === 'spinning' ? 'REVEAL' : 'MANAGER_LOCK', item: randomItem(pool) });
    }, phase === 'spinning' ? 1550 : 2600);
    return () => { window.clearInterval(interval); window.clearTimeout(timeout); };
    // Dependencies deliberately track the data that changes the candidate pool.
  }, [phase, index, state.roster, state.seen]);

  useEffect(() => {
    if (phase !== 'deciding') return undefined;
    const interval = window.setInterval(() => dispatch({ type: 'SECOND' }), 1000);
    return () => window.clearInterval(interval);
  }, [phase, current?.id]);

  const activeSlot = SLOTS[index];
  const isDraft = phase === 'spinning' || phase === 'deciding';
  const isChoosing = phase === 'deciding';

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="logo"><span className="logo-mark">XI</span><div><strong>ULTIMATE XI</strong><small>THE DRAFT EXPERIENCE</small></div></div>
        <span className="topbar-label">BUILD THE SQUAD. MAKE HISTORY.</span>
        <span className="topbar-badge">MACHINE LEARNING EDITION</span>
      </header>

      {phase === 'intro' ? (
        <main className="intro-screen">
          <span className="eyebrow">THE ULTIMATE FOOTBALL CHALLENGE</span>
          <h1>BUILD YOUR <em>LEGACY.</em></h1>
          <p>11 players. One surprise manager. Infinite possibilities. Use your hand gesture to decide who makes your ultimate starting lineup.</p>
          <div className="intro-metrics"><span><b>50</b> PLAYERS</span><span><b>06</b> MANAGERS</span><span><b>4-3-3</b> FORMATION</span></div>
          <div className="intro-guide"><span><b>01</b> ROULETTE PICKS</span><span><b>02</b> RAISE HAND TO SIGN</span><span><b>03</b> REVEAL YOUR TROPHY</span></div>
          <button className="primary-btn intro-btn" onClick={() => dispatch({ type: 'START' })}>START THE DRAFT <span>→</span></button>
          <p className="intro-tip">TIP: Keyboard/mouse controls work even without a trained ML model.</p>
        </main>
      ) : (
        <main className="game-layout">
          <section className="squad-panel">
            <div className="section-heading"><div><span className="eyebrow">YOUR DREAM TEAM</span><h2>Starting <em>XI</em></h2></div><div className="counter"><strong>{String(progress).padStart(2, '0')}<span>/11</span></strong><small>SELECTED</small></div></div>
            <div className="draft-progress" role="progressbar" aria-label="Starting eleven progress" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="11">
              {SLOTS.map((slot, slotIndex) => <span key={slot.id} title={`${slot.position} · ${slotIndex < progress ? 'Signed' : 'Pending'}`} className={`progress-segment ${slotIndex < progress ? 'done' : ''} ${isDraft && slotIndex === index ? 'upcoming' : ''}`} />)}
            </div>
            <div className="draft-subtitle"><span>{isDraft ? `NOW DRAFTING · ${activeSlot.label.toUpperCase()}` : phase === 'manager-spinning' ? 'ALL PLAYERS SIGNED · MANAGER ROULETTE' : 'YOUR FINAL ELEVEN'}</span><span>{Math.round(progress / 11 * 100)}% COMPLETE</span></div>
            <Pitch roster={roster} currentSlot={isDraft ? activeSlot.id : null} />
            <div className="squad-footer"><span>FORMATION <strong>4-3-3</strong></span><span>MANAGER <strong>{coach?.name || (phase === 'manager-spinning' ? 'ROULETTE…' : 'TBD')}</strong></span></div>
          </section>

          <section className="action-column">
            {phase === 'result' && score ? (
              <div className="result-panel">
                <span className="eyebrow">THE VERDICT IS IN</span>
                <div className="trophy-icon">{score.trophy.emoji}</div>
                <h2>{score.trophy.name}</h2>
                <p>{score.trophy.detail}</p>
                <div className="overall-number">{score.overall}<small> / 100</small></div>
                <div className="score-breakdown">
                  <div><span>Average player rating</span><b>{score.playerQuality}</b></div>
                  <div><span>Team chemistry</span><b>{score.chemistry}</b></div>
                  <div><span>Manager: {coach.name}</span><b>{coach.rating}</b></div>
                </div>
                <button className="secondary-btn view-trophy-btn" onClick={() => setShowTrophyPopup(true)}>VIEW TROPHY REVEAL ↗</button>
                <button className="primary-btn" onClick={() => dispatch({ type: 'START' })}>DRAFT AGAIN ↗</button>
              </div>
            ) : (
              <section className="reveal-panel">
                <div className="reveal-header"><span className="eyebrow">{phase === 'manager-spinning' ? 'FINAL ROUND · MANAGER' : `ROUND ${String(index + 1).padStart(2, '0')} OF 11`}</span><span className="live-tag">● LIVE DRAFT</span></div>
                <h2>{phase === 'manager-spinning' ? 'Your next manager' : 'Your next signing'}</h2>
                <p>{phase === 'manager-spinning' ? 'The manager is assigned automatically. No skips!' : `Looking for a ${activeSlot.label.toLowerCase()} (${activeSlot.position}).`}</p>
                {phase === 'manager-spinning' ? (
                  <div className="manager-reveal">
                    <span className="manager-icon">♟</span>
                    <strong>{current?.name || 'SCOUTING…'}</strong>
                    <span>{current?.flag || '⚽'} MANAGER</span>
                  </div>
                ) : (
                  <div className="big-card-holder"><PlayerCard player={current} large isSpinning={phase === 'spinning'} placeholder={activeSlot.position} /></div>
                )}
                {isChoosing ? (
                  <>
                    <div className="decision-header"><span>MAKE YOUR DECISION</span><strong>{seconds}s</strong></div>
                    <div className="timer-track"><div style={{ width: `${seconds / DECISION_SECONDS * 100}%` }} /></div>
                    <div className="decision-buttons"><button className="reject-btn" onClick={() => dispatch({ type: 'REJECT' })} disabled={rejected >= MAX_REJECTIONS}>✕ SKIP <small>{MAX_REJECTIONS - rejected} left</small></button><button className="primary-btn" onClick={handleAccept}>✓ SIGN PLAYER</button></div>
                    <p className="decision-help">No raised hand = auto skip. After 2 skips, the next player is automatically signed.</p>
                  </>
                ) : <div className="spinning-msg"><span className="spinner" /> {phase === 'manager-spinning' ? 'ASSIGNING YOUR MANAGER…' : 'SCOUTING AVAILABLE PLAYERS…'}</div>}
              </section>
            )}
            <GestureCamera isChoosing={isChoosing} onAccept={handleAccept} />
          </section>
        </main>
      )}
      {phase === 'result' && score && showTrophyPopup && <TrophyModal score={score} coach={coach} onClose={dismissTrophyPopup} />}
      <footer className="footer"><span>ULTIMATE XI © GAME PROTOTYPE</span><span>Ratings and trophy criteria are fictional gameplay values, not official forecasts.</span></footer>
    </div>
  );
}
