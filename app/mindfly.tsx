'use client';
import { assetUrl } from '@/lib/asset-url';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Bluetooth,
  CircleHelp,
  Cpu,
  Play,
  Unplug,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMuse } from '@/lib/use-muse';
import { clamp, type AnatomyData } from '@/lib/anatomy';
import type { WalkingState } from '@/lib/bpn-walking';
import { resolveFocusControl } from '@/lib/focus-control';
import { demoFocusAt } from '@/lib/demo-focus';
import LaboratoryScene from './scene';
import { type BpnData, type ModelSpike } from '@/lib/bpn-circuit';
import { createBpnEngine, type EngineStatus } from '@/lib/bpn-engine';
import type { BpnEngine } from '@/lib/wasm-bpn';
import {
  advanceBpnWalking,
  advanceWalkingGate,
  initialWalkingGate,
  initialBpnWalking,
} from '@/lib/bpn-walking';
import { walkingTiming } from '@/lib/xenova/walking-kinematics.js';

import { eegDisplay, demoEegSamples } from '@/lib/neural-display';

export type SimulationState = {
  posePaused: boolean;
  gaitPhase: number;
  drive: number;
  navigation: WalkingState;
  inputHz: number;
  active: Float32Array;
  spikeEvents: ModelSpike[];
  running: boolean;
  reset: number;
  time: number;
};
const EMPTY: SimulationState = {
  posePaused: false,
  gaitPhase: 0,
  drive: 0,
  navigation: initialBpnWalking(),
  inputHz: 0,

  active: new Float32Array(),
  spikeEvents: [],
  running: false,
  reset: 0,
  time: 0,
};
export default function MindFly() {
  const muse = useMuse();
  const [bpnData, setBpnData] = useState<BpnData | null>(null);
  const bpn = useRef<BpnEngine | null>(null);
  const [engineStatus, setEngineStatus] =
    useState<EngineStatus>('Loading Rust/WASM');
  const walkingGate = useRef(initialWalkingGate());
  const [demo, setDemo] = useState(false),
    [demoDrive, setDemoDrive] = useState(0.3);
  const [info, setInfo] = useState(false),
    [anatomy, setAnatomy] = useState<AnatomyData | null>(null);
  const [dataError, setDataError] = useState(''),
    [revision, setRevision] = useState(0),
    [sceneError, setSceneError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const flight = useRef<SimulationState>({ ...EMPTY });
  const scope = useRef<HTMLCanvasElement>(null);
  const meter = useRef({ activity: 0, enabled: false, usable: false });
  const isLive = muse.connected || muse.connecting;
  const effectiveDemo = demo && !isLive;
  const focusControl = resolveFocusControl({
    connected: muse.connected,
    usable: muse.usable,
    measuredFocus: muse.reading.focus,
    demo: effectiveDemo,
    demoFocus: demoDrive,
  });
  const drive = focusControl.focus;
  const demoTime = useRef(0);
  const [demoSamples, setDemoSamples] = useState(() => demoEegSamples(0, 0.3));
  useEffect(() => {
    if (!effectiveDemo) return;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      demoTime.current += Math.min(0.25, (now - last) / 1000);
      last = now;
      const next = demoFocusAt(demoTime.current);
      setDemoDrive(next);
      setDemoSamples(demoEegSamples(demoTime.current, next));
    }, 100);
    return () => clearInterval(timer);
  }, [effectiveDemo]);
  const [eegMeasurements, setEegMeasurements] = useState(() =>
    eegDisplay([], [], 'none'),
  );
  const eeg = useRef(eegMeasurements);
  useEffect(() => {
    const update = () => {
      const next = eegDisplay(
        effectiveDemo ? demoSamples : muse.waveform.current,
        effectiveDemo ? [true, true, true, true] : muse.channelFresh,
        muse.connected ? 'live' : effectiveDemo ? 'demo' : 'none',
      );
      eeg.current = next;
      setEegMeasurements(next);
    };
    // Read mutable device buffers outside render; refresh even between packets.
    update();
    const timer = setInterval(update, 350);
    return () => clearInterval(timer);
  }, [
    effectiveDemo,
    demoSamples,
    muse.connected,
    muse.channelFresh,
    muse.waveform,
  ]);
  const controlAvailable = focusControl.enabled;
  const enabled = controlAvailable;
  useEffect(() => {
    meter.current = {
      activity: drive,
      enabled,
      usable: !focusControl.fallback,
    };
  }, [drive, enabled, focusControl.fallback]);
  useEffect(() => {
    const abort = new AbortController();
    let ownedEngine: BpnEngine | null = null;
    Promise.all([
      fetch(assetUrl('/data/malecns.json'), { signal: abort.signal }).then(
        (r) => {
          if (!r.ok) throw Error('Neural anatomy could not load.');
          return r.json() as Promise<AnatomyData>;
        },
      ),
      fetch(assetUrl('/data/bpn-walking.json'), { signal: abort.signal }).then(
        (r) => {
          if (!r.ok) throw Error('Walking circuit could not load.');
          return r.json() as Promise<BpnData>;
        },
      ),
    ])
      .then(async ([data, walking]) => {
        ownedEngine = await createBpnEngine(walking, abort.signal, (status) => {
          if (!abort.signal.aborted) setEngineStatus(status);
        });
        if (abort.signal.aborted) {
          ownedEngine.dispose?.();
          return;
        }
        bpn.current = ownedEngine;
        setAnatomy(data);
        setBpnData(walking);
      })
      .catch((e) => {
        if (e.name !== 'AbortError')
          setDataError(
            'Could not load the Rust/WASM simulation. Check your connection and retry.',
          );
      });
    return () => {
      abort.abort();
      ownedEngine?.dispose?.();
      if (bpn.current === ownedEngine) bpn.current = null;
    };
  }, [revision]);
  const sceneAnatomy = useMemo(
    () =>
      anatomy && bpnData
        ? {
            ...anatomy,
            circuit: bpnData,
          }
        : null,
    [anatomy, bpnData],
  );
  useEffect(() => {
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(),
        previousWall = last,
        dt = Math.min(0.08, (now - last) / 1000);
      last = now;
      const m = meter.current;
      if (!bpn.current) return;
      const f = flight.current;
      const visible =
        document.visibilityState !== 'hidden' && now - previousWall < 250;
      const allowed = m.enabled && m.usable && visible;
      walkingGate.current = advanceWalkingGate(
        walkingGate.current,
        m.activity,
        allowed,
      );
      let out;
      try {
        out = bpn.current?.advance(walkingGate.current.stimulating);
      } catch {
        bpn.current?.dispose?.();
        bpn.current = null;
        walkingGate.current = initialWalkingGate();
        flight.current = {
          ...f,
          running: false,
          drive: 0,
          inputHz: 0,
          active: new Float32Array(f.active.length),
          spikeEvents: [],
          posePaused: true,
          navigation: { ...f.navigation, velocity: [0, 0, 0] },
        };
        setEngineStatus('WASM unavailable');
        setDataError(
          'The Rust/WASM simulation stopped. Reload the simulation to retry.',
        );
        return;
      }
      if (!out) return;
      const navigation = advanceBpnWalking(
        f.navigation,
        out.forward,
        0.05,
        allowed && walkingGate.current.stimulating,
      );
      const speed = Math.hypot(...navigation.velocity);
      flight.current = {
        ...f,

        posePaused: false,
        drive: m.activity,
        navigation,
        time: f.time + 0.05,
        gaitPhase:
          f.gaitPhase + walkingTiming(speed).frequency * Math.PI * 2 * 0.05,
        inputHz: out.inputHz,

        active: out.active,
        spikeEvents: out.spikeEvents,
        running: allowed,
      };
    }, 50);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const canvas = scope.current,
        ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        const ratio = Math.min(devicePixelRatio, 2),
          w = canvas.clientWidth,
          h = canvas.clientHeight;
        if (canvas.width !== w * ratio || canvas.height !== h * ratio) {
          canvas.width = w * ratio;
          canvas.height = h * ratio;
        }
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.strokeStyle = '#363636';
        ctx.lineWidth = 0.5;
        const laneHeight = h / 4;
        for (let ch = 0; ch < 4; ch++) {
          const y = (ch + 0.5) * laneHeight;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
        const colors = ['#d2d2d2', '#9a9a9a', '#b5b5b5', '#7e7e7e'];
        for (let ch = 0; ch < 4; ch++) {
          ctx.strokeStyle = colors[ch];
          ctx.lineWidth = 1.4;
          ctx.globalAlpha = 0.8;
          ctx.beginPath();
          const wave = muse.waveform.current[ch];
          for (let x = 0; x < w; x++) {
            const live = muse.connected && muse.channelFresh[ch];
            const val = live
              ? (wave[Math.floor((x / Math.max(1, w)) * wave.length)] || 0) *
                0.18
              : effectiveDemo
                ? demoSamples[ch][Math.min(511, Math.floor((x / w) * 512))] *
                  0.18
                : 0;
            const y =
              (ch + 0.5) * laneHeight +
              clamp(val, -laneHeight * 0.34, laneHeight * 0.34);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [
    muse.waveform,
    muse.connected,
    muse.channelFresh,
    effectiveDemo,
    demoSamples,
  ]);
  const startDemo = () => {
    reset();
    demoTime.current = 0;
    setDemoDrive(0.3);
    setDemo(true);
  };
  const connect = () => {
    setDemo(false);
    void muse.connect();
  };
  const reset = () => {
    if (effectiveDemo) {
      demoTime.current = 0;
      setDemoDrive(0.3);
    }
    bpn.current?.reset();
    walkingGate.current = initialWalkingGate();
    flight.current = {
      ...EMPTY,
      navigation: initialBpnWalking(),
      reset: flight.current.reset + 1,
    };
  };
  const status = muse.connected
    ? !focusControl.fallback
      ? muse.signalQuality === 'fair'
        ? 'Live EEG · fair contact'
        : 'Live EEG'
      : muse.reading.calibrating
        ? 'Calibrating · low-focus fallback'
        : 'Poor signal · low-focus fallback'
    : muse.connecting
      ? 'Connecting'
      : effectiveDemo
        ? 'Demo signal'
        : 'Headset disconnected';
  return (
    <main className="app-shell" data-neural-engine={engineStatus}>
      <header className="site-header">
        <div className="brand-lockup">
          <a href={assetUrl('/').replace(/\/$/, '') || '/'} className="brand site-brand">
            <span className="brand-symbol">
              <img
                src={assetUrl('/brain-fly-outline.png')}
                alt=""
                width={48}
                height={48}
              />
            </span>
            <span>
              mindfly<span className="brand-dot">.</span>
            </span>
          </a>
          <a
            className="repository-link"
            href="https://github.com/MindExtendAI/mindfly"
            target="_blank"
            rel="noopener noreferrer"
          >
            Source Code [link]
          </a>
        </div>
      </header>
      <div className="workspace">
        <section
          className="flight-lab"
          aria-label="Connected human and fly brains on the left, separate fly body on the right"
        >
          <div className="scene-stage view-overview">
            <LaboratoryScene
              anatomy={sceneAnatomy}
              eeg={eeg}
              contactColors={[0, 1, 2, 3].map((i) =>
                !muse.connected
                  ? '#38434b'
                  : !muse.channelFresh[i]
                    ? '#f38b7c'
                    : muse.reading.quality[i] >= 1
                      ? '#80e2be'
                      : muse.reading.quality[i] >= 0.5
                        ? '#e6c57d'
                        : '#f38b7c',
              )}
              flight={flight}
              onReady={() => setLoaded(true)}
              onError={setSceneError}
              revision={revision}
            />
            <div className="stage-grain" />
            <div className="anatomy-label human-label">
              <strong>Human Brain</strong>
              <small>
                10Hz EEG Alpha Waves
                <br />
                Muse 2 Device
              </small>
            </div>
            <div className="anatomy-label flybrain-label">
              <strong>Fly Brain</strong>
              <small>
                10 Hz Optogenetic Stimulation · MaleCNS{' '}
                <a
                  className="study-title-link"
                  href="https://male-cns.janelia.org/download/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  [link]
                </a>
              </small>
            </div>
            <div className="anatomy-label flybody-label">
              <div className="study-heading">
                <strong>Simulated Study</strong>
              </div>
              <small>
                Two Brain Pathways Initiate Distinct Forward Walking Programs in
                Drosophila{' '}
                <a
                  className="study-title-link"
                  href="https://www.cell.com/neuron/fulltext/S0896-6273(20)30576-6"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  [link]
                </a>
              </small>
            </div>
            {(!loaded || dataError || sceneError) && (
              <div className="loading-overlay">
                <Cpu size={22} />
                <p>{dataError || sceneError || 'Preparing neural anatomy…'}</p>
                {(dataError || sceneError) && (
                  <Button
                    onClick={() => {
                      setSceneError('');
                      setDataError('');
                      setLoaded(false);
                      setRevision((x) => x + 1);
                    }}
                  >
                    Retry
                  </Button>
                )}
              </div>
            )}
          </div>
        </section>
        <aside className="control-panel" aria-label="Neural movement controls">
          <div className="panel-section sidebar-header">
            <div className="sidebar-brand-row">
              <Button
                variant="ghost"
                className="about-button"
                onClick={() => setInfo(true)}
              >
                <CircleHelp size={17} /> How it works
              </Button>
            </div>
            <div className="top-actions">
              <span
                className={`connection-badge ${muse.usable ? (muse.signalQuality === 'fair' ? 'fair' : 'live') : effectiveDemo ? 'demo' : ''}`}
              >
                <i />
                {status}
              </span>
              {!isLive && (
                <Button
                  variant="outline"
                  className="quick-demo"
                  onClick={() => {
                    if (effectiveDemo) {
                      setDemo(false);
                      reset();
                    } else startDemo();
                  }}
                >
                  <Play size={15} />
                  {effectiveDemo ? 'Exit demo' : 'Try demo'}
                </Button>
              )}
              <Button
                className="connect-button"
                onClick={muse.connected ? muse.disconnect : connect}
                disabled={muse.connecting}
              >
                {muse.connected ? <Unplug /> : <Bluetooth />}
                {muse.connected ? 'Disconnect' : 'Connect Muse 2'}
              </Button>
            </div>
            <div className="compact-device">
              {muse.error && (
                <output className="error-message">{muse.error}</output>
              )}
              {!muse.supported && !muse.error && (
                <p className="quiet-copy">
                  For Muse, use Chrome or Edge with Web Bluetooth. Demo is
                  available in this browser.
                </p>
              )}
              {muse.connected && (
                <p className="device-summary">
                  {muse.deviceName}
                  {muse.battery !== null ? ` · ${muse.battery}% battery` : ''}
                </p>
              )}
            </div>
          </div>

          <div className="panel-section waveform-section">
            <div className="section-heading">
              <h2>{effectiveDemo ? 'Demo signal' : 'EEG signal'}</h2>
              <span className="mini-label">
                {muse.connected
                  ? '256 HZ'
                  : effectiveDemo
                    ? null
                    : '4 CHANNELS'}
              </span>
            </div>
            <div className="eeg-signal-status compact-device">
              {muse.connected && (
                <>
                  <div className="calibration-line">
                    <span>
                      {muse.reading.calibrating
                        ? `Baseline · ${Math.round(muse.reading.calibrationProgress * 100)}%`
                        : muse.usable
                          ? muse.signalQuality === 'fair'
                            ? 'TP9 / TP10 usable · fair contact'
                            : 'Signal ready'
                          : 'Adjust TP9 / TP10 contact'}
                    </span>
                    <button onClick={muse.recalibrate}>Recalibrate</button>
                  </div>
                  {muse.reading.calibrating && (
                    <>
                      <div className="cal-progress">
                        <i
                          style={{
                            width: `${muse.reading.calibrationProgress * 100}%`,
                          }}
                        />
                      </div>
                      <p className="quiet-copy">
                        Keep still with comfortable, open eyes. Collecting 15
                        seconds of recent baseline EEG; unstable windows are
                        retried.
                      </p>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="waveform-lanes">
              <div className="electrodes waveform-channel-labels">
                {['TP9', 'AF7', 'AF8', 'TP10'].map((name, i) => (
                  <span
                    key={name}
                    title={
                      !muse.connected
                        ? `${name}: disconnected`
                        : !muse.channelFresh[i]
                          ? `${name}: no recent data`
                          : muse.reading.quality[i] >= 1
                            ? `${name}: good contact`
                            : muse.reading.quality[i] >= 0.5
                              ? `${name}: fair contact`
                              : `${name}: poor contact`
                    }
                  >
                    <i
                      style={{
                        background: muse.connected
                          ? !muse.channelFresh[i]
                            ? '#f38b7c'
                            : muse.reading.quality[i] >= 1
                              ? '#80e2be'
                              : muse.reading.quality[i] >= 0.5
                                ? '#e6c57d'
                                : '#f38b7c'
                          : '#38434b',
                      }}
                    />
                    {name}
                  </span>
                ))}
              </div>
              <canvas
                className="eeg-scope"
                ref={scope}
                aria-label={
                  effectiveDemo
                    ? 'Illustrative demo waveforms'
                    : 'Live four-channel EEG waveforms'
                }
              />
            </div>
          </div>
        </aside>
      </div>
      <Dialog open={info} onOpenChange={setInfo}>
        <DialogContent className="info-dialog">
          <DialogHeader>
            <DialogTitle>How MindFly works</DialogTitle>
          </DialogHeader>
          <div className="info-content">
            <p>
              MindFly is an interactive simulation inspired by “Two Brain
              Pathways Initiate Distinct Forward Walking Programs in
              Drosophila.” The study used light pulses to activate the fly’s
              walking neurons. MindFly builds on this approach with simulated
              stimulation at 10 pulses per second (10 Hz), one of the
              frequencies tested.{' '}
              <a
                href="https://pmc.ncbi.nlm.nih.gov/articles/PMC9435592/"
                target="_blank"
                rel="noreferrer"
              >
                Study
              </a>{' '}
              MindFly uses the MaleCNS connectome—a map of neural connections
              created by HHMI Janelia, the University of Cambridge, MRC
              Laboratory of Molecular Biology, and Google Research.{' '}
              <a
                href="https://male-cns.janelia.org/download/"
                target="_blank"
                rel="noreferrer"
              >
                MaleCNS
              </a>{' '}
              Connect a Muse 2 headset in Chrome on a Bluetooth-enabled
              computer, complete calibration, and relax while focusing. MindFly
              analyzes your EEG, including alpha activity around 10 Hz, to
              estimate a focus score. When that score is high, the app triggers
              simulated 10 Hz stimulation of the modeled walking circuit, making
              the virtual fly walk.
            </p>
            <h3>1. Human EEG and the Focus score</h3>
            <p>
              Muse 2 records electrical potential differences at the scalp
              through four channels: TP9 and TP10 behind the ears, and AF7 and
              AF8 on the forehead. It samples each channel at 256 Hz, with a
              reference at FPz. The waveforms show these electrode signals. The
              human brain image is AI-generated and the label positions are
              schematic, not a scan or a map of activity inside your brain.{' '}
              <a
                href="https://pmc.ncbi.nlm.nih.gov/articles/PMC11679084/"
                target="_blank"
                rel="noreferrer"
              >
                Muse recording methods ↗
              </a>
            </p>
            <p>
              The dots beside the channel labels show estimated contact quality:
              green for good, yellow for fair, and red for poor contact or
              missing recent data. They appear gray when the headset is
              disconnected. Their color does not represent alpha power or
              attention.
            </p>
            <p>
              MindFly analyzes EEG activity to calculate a Focus score. It
              compares alpha, theta and beta band features with a personal
              calibration baseline, accounts for changes in alpha stability, and
              smooths the result. Analysis uses 512-sample windows, covering two
              seconds of EEG. Alpha activity around 10 Hz contributes to the
              calculation; the score is not an alpha percentage or a validated
              measurement of attention. Eye movements, muscle activity and poor
              contact can affect it. Signal-quality checks reduce some errors
              but do not remove every artifact.
            </p>
            <p>
              Try demo generates both the waveforms and a changing Focus score.
              It lets you explore the simulation without a headset.
            </p>

            <h3>2. Fly anatomy and the modeled circuit</h3>
            <p>
              MaleCNS reconstructs a male fruit fly’s central nervous system
              from electron microscopy. MindFly uses its neuron identities,
              cell-body coordinates, skeletons and directed connections. The
              active model contains 54 neurons and 266 connections selected for
              a particular stimulation benchmark. Each connection can represent
              multiple synapses. The surrounding gray anatomy is a visual
              reference.{' '}
              <a
                href="https://male-cns.janelia.org/download/"
                target="_blank"
                rel="noreferrer"
              >
                MaleCNS data and methods ↗
              </a>
            </p>
            <p>
              The lower structure is the ventral nerve cord. All neuron overlays
              share the same two-dimensional projection of the recorded
              coordinates; depth is projected out. The white branches represent
              skeleton centerlines, with cell bodies at their annotated
              positions. Anatomical placement does not establish how those cells
              fire. Neurotransmitter predictions inform the model’s synaptic
              signs, while electrical response parameters remain assumptions.
            </p>

            <h3>3. The Bidaye study and 10 Hz stimulation</h3>
            <p>
              Bidaye et al. showed that activating Bolt protocerebral neurons
              (BPNs) with light can initiate fast, straight forward walking. The
              neurons expressed CsChrimson, a light-sensitive protein. Figure 7A
              compares stimulation frequencies from 10 to 150 Hz: higher
              frequencies increased walking duration and forward speed. MindFly
              uses 10 Hz from this range. The paper’s standard transient
              behavioral protocol used 50 Hz with 5 ms pulses unless stated
              otherwise.{' '}
              <a
                href="https://doi.org/10.1016/j.neuron.2020.07.032"
                target="_blank"
                rel="noreferrer"
              >
                Bidaye et al., 2020 ↗
              </a>
            </p>
            <p>
              MindFly stimulates 24 candidate cells from the CL208, CL209,
              SMP459, SMP460 and SMP461 types. Their correspondence to the
              neurons targeted in the experiment remains unresolved. The
              simulation is inspired by the study; its individual spike times
              and walking statistics have not been matched to recordings from
              those flies.
            </p>

            <h3>4. How EEG controls the virtual fly</h3>
            <p>
              A usable Focus score of at least 65% starts simulated stimulation:
              one 5 ms input pulse every 100 ms, or 10 pulses per second. Each
              bout lasts up to 30 seconds of model time. Lowering the score
              below 65% stops stimulation and allows another bout. Unusable or
              disconnected EEG also stops walking. These control rules are
              choices made for MindFly.
            </p>
            <p>
              The neural engine uses a leaky integrate-and-fire model: each
              neuron integrates inputs, emits a spike when its modeled voltage
              reaches a threshold, and resets. It advances in 0.5 ms steps,
              using a 20 ms membrane time constant, 5 ms synaptic decay and 2 ms
              connection delay. The input drive of 2 mV/ms is a model parameter,
              not a measured light intensity or biological current.
            </p>
            <p>
              A weighted readout of modeled activity controls forward speed.
              Software rules handle position and turns near the arena wall;
              inverse kinematics positions the legs. The model has no leg
              motor-neuron output, muscles or sensory feedback from the body.
              The virtual arena is a flat, 44 mm circle, based on the diameter
              of the study’s bowl-shaped arenas. The body asset depicts a female
              fly, while the neural anatomy comes from a male.
            </p>
            <p>
              Human alpha activity and the fly’s 10 Hz input have different
              roles: EEG features determine the Focus score, and the score
              switches a generated stimulus on or off. The app does not send the
              raw EEG waveform to the modeled neurons. A 10 Hz input also does
              not mean that every neuron fires ten times per second.
            </p>
            <p>
              Neural engine: {engineStatus}. Both the neural simulation and EEG
              calculations run locally in Rust/WASM. If a required module cannot
              load or stops working, control stops until you retry. Software
              validation does not establish biological accuracy.
            </p>

            <h3>5. What the animation shows</h3>
            <p>
              The connecting curve shows progress toward the stimulation
              threshold. At 0% it is empty; at 30% it fills to about 46% of its
              length. It reaches the fly at 65% when stimulation is enabled. The
              dots repeat every 100 ms and take 800 ms to travel the full curve.
              This travel time is visual feedback: the model starts stimulation
              when its threshold is met, without waiting for a dot to arrive.
              Reduced-motion settings hide the moving dots.
            </p>
            <p>
              The fly image combines 25 aligned overlays covering all 54 modeled
              neurons. Each overlay’s brightness follows the average modeled
              spike activity of its cells, with a fading afterglow. It does not
              show a recording of simultaneous firing. Overlays are hidden below
              65% usable focus and when control is inactive; candidate BPN
              overlays also require stimulation to be on. The highlighted
              branches show anatomy, not measured action potentials traveling
              through the cells.
            </p>

            <h3>6. What the software checks establish</h3>
            <p>
              Automated tests compare the reduced circuit with reference outputs
              from a full-CNS Java simulation, including a 45-second benchmark
              and interrupted stimulation. Removing BPN output connections
              eliminates downstream spikes and forward output in that model.
              Tests also check coordinate registration, EEG processing, stopping
              behavior and agreement with saved reference outputs.{' '}
              <a
                href="https://github.com/MindExtendAI/mindfly/tree/main/tests"
                target="_blank"
                rel="noreferrer"
              >
                Model checks and reference traces ↗
              </a>
            </p>
            <p>
              These checks establish consistency between software
              implementations. They do not validate the candidate BPN mapping,
              individual neural responses, real-fly movement or attention
              decoding in people. Those claims require independent experimental
              measurements.
            </p>
            <h3>Connecting Muse 2</h3>
            <p>
              Open MindFly in Chrome on a Bluetooth-enabled computer, turn on
              Muse 2, and close other apps using the headset. Select Connect
              Muse 2 and choose your device. Fit it securely, stay still and let
              calibration complete. Adjust contact at TP9 and TP10 if
              calibration does not finish. Both posterior channels must keep
              sending data; after calibration, one usable posterior contact can
              sustain control even when forehead contact is poor.
            </p>
            <p>
              Recalibrate starts a new baseline while retaining a previously
              accepted one. If no recent usable Focus estimate is available, the
              app sets control focus to zero and stops walking. Disconnecting
              also stops control. Select Try demo to use generated signals
              instead.
            </p>
            <h3>Sources & attribution</h3>
            <div className="source-links">
              <a
                href="https://doi.org/10.1016/j.neuron.2020.07.032"
                target="_blank"
                rel="noreferrer"
              >
                Bidaye 2020 · brain neurons that drive walking ↗
              </a>
              <a
                href="https://elifesciences.org/articles/46409"
                target="_blank"
                rel="noreferrer"
              >
                DeAngelis et al. 2019 · walking coordination ↗
              </a>
              <a
                href={assetUrl('/data/bpn-walking.json')}
                target="_blank"
                rel="noreferrer"
              >
                BPN candidate circuit · recorded connections and source revision
                ↗
              </a>
              <a
                href="https://huggingface.co/spaces/Xenova/fruit-fly-simulation/tree/main"
                target="_blank"
                rel="noreferrer"
              >
                Xenova · fly materials, wing exposures and articulated poses ↗
              </a>
              <a
                href="https://male-cns.janelia.org/"
                target="_blank"
                rel="noreferrer"
              >
                MaleCNS / Janelia · CC BY 4.0 ↗
              </a>
              <a
                href="https://github.com/NeLy-EPFL/fly-svg-maker"
                target="_blank"
                rel="noreferrer"
              >
                NeuroMechFly anatomy · Apache 2.0 ↗
              </a>
              <a href={assetUrl('/ATTRIBUTION.txt')} target="_blank">
                Full asset and model notes ↗
              </a>
            </div>
            <p className="quiet-copy">
              Fly body scan: female specimen. Neural reconstruction: male. EEG
              is processed locally; only calibration parameters are saved in
              this browser.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
