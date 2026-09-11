'use client';
import {
  useCallback,
  useMemo,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { CalmEngine, prepareEegWasm, type CalmReading } from './eeg-wasm';
import { focusFromCalmActivity } from './focus-control';
import { assessMuseQuality } from './muse-quality';
const INITIAL: CalmReading & { focus: number } = {
  activity: 1,
  focus: 0,
  alpha: 0,
  beta: 0,
  theta: 0,
  ratio: 0,
  alphaVariance: 0,
  zRatio: 0,
  calibrated: false,
  calibrating: false,
  calibrationProgress: 0,
  quality: [0, 0, 0, 0],
  lastUpdate: 0,
};
const subscribeSupport = () => () => {};
const readSupport = () => Boolean(navigator.bluetooth);
const serverSupport = () => true;
export function useMuse() {
  const [reading, setReading] = useState(INITIAL);
  const [connected, setConnected] = useState(false),
    [connecting, setConnecting] = useState(false);
  const [deviceName, setDeviceName] = useState('Muse 2'),
    [battery, setBattery] = useState<number | null>(null);
  const [error, setError] = useState(''),
    [fresh, setFresh] = useState(false);
  const supported = useSyncExternalStore(
    subscribeSupport,
    readSupport,
    serverSupport,
  );
  const [packetState, setPacketState] = useState({
    times: [0, 0, 0, 0],
    now: 0,
  });
  const engine = useRef<CalmEngine | null>(null);
  const client = useRef<import('muse-js').MuseClient | null>(null);
  const device = useRef<BluetoothDevice | null>(null);
  const subscriptions = useRef<{ unsubscribe: () => void }[]>([]);
  const packets = useRef([0, 0, 0, 0]);
  const generation = useRef(0);
  const calibratedThisSession = useRef(new Set<string>());
  const waveform = useRef<number[][]>([[], [], [], []]);
  const disconnect = useCallback(() => {
    generation.current++;
    subscriptions.current.forEach((s) => s.unsubscribe());
    subscriptions.current = [];
    try {
      client.current?.disconnect();
      device.current?.gatt?.disconnect();
    } catch {
      /* already disconnected */
    }
    engine.current?.dispose();
    engine.current = null;
    client.current = null;
    device.current = null;
    packets.current = [0, 0, 0, 0];
    setConnected(false);
    setConnecting(false);
    setBattery(null);
    setFresh(false);
    waveform.current = [[], [], [], []];
  }, []);
  useEffect(() => {
    let cancelled = false;
    prepareEegWasm().catch(() => {
      if (!cancelled)
        setError('EEG module could not load. Connect again to retry.');
    });
    const timer = setInterval(() => {
      const now = Date.now();
      setFresh(
        [0, 3].every(
          (i) => packets.current[i] > 0 && now - packets.current[i] < 3000,
        ),
      );
      setPacketState({ times: [...packets.current], now });
    }, 350);
    return () => {
      cancelled = true;
      clearInterval(timer);
      disconnect();
    };
  }, [disconnect]);
  const connect = useCallback(async () => {
    if (connecting) return;
    disconnect();
    const ticket = generation.current;
    setError('');
    setConnecting(true);
    setReading(INITIAL);
    if (!navigator.bluetooth) {
      setError(
        'Open this page in Chrome or Edge on a computer, or Chrome on Android, to connect Muse 2. Demo works here.',
      );
      setConnecting(false);
      return;
    }
    try {
      // Request while still inside the user's click gesture.
      const selected = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: 'Muse-', services: [0xfe8d] }],
        optionalServices: [0xfe8d],
      });
      if (ticket !== generation.current) return;
      device.current = selected;
      const gatt = await selected.gatt?.connect();
      if (!gatt)
        throw new Error(
          'Could not reach the headset. Turn Muse 2 on and close other apps using it.',
        );
      const { MuseClient } = await import('muse-js');
      if (ticket !== generation.current) {
        gatt.disconnect();
        return;
      }
      const muse = new MuseClient();
      client.current = muse;
      await muse.connect(gatt);
      if (ticket !== generation.current) {
        muse.disconnect();
        return;
      }
      await prepareEegWasm();
      if (ticket !== generation.current) {
        muse.disconnect();
        return;
      }
      const e = new CalmEngine();
      engine.current = e;
      let wasCalibrating = false;
      const unsub = e.subscribe((r) => {
        if (wasCalibrating && r.calibrated && !r.calibrating)
          calibratedThisSession.current.add(selected.id);
        wasCalibrating = r.calibrating;
        setReading({
          ...r,
          focus: focusFromCalmActivity(r.activity),
        });
      });
      subscriptions.current.push({
        unsubscribe: () => {
          unsub();
        },
      });
      e.setDevice(selected.id, !calibratedThisSession.current.has(selected.id));
      subscriptions.current.push(
        muse.eegReadings.subscribe((eeg) => {
          const channel = eeg.electrode;
          if (channel >= 0 && channel <= 3) {
            packets.current[channel] = Date.now();
            const w = waveform.current[channel];
            w.push(...eeg.samples);
            if (w.length > 640) w.splice(0, w.length - 640);
            try {
              e.push(channel as 0 | 1 | 2 | 3, eeg.samples);
            } catch {
              disconnect();
              setReading(INITIAL);
              setError('EEG processing stopped. Reconnect to retry.');
            }
          }
        }),
        muse.telemetryData.subscribe((t) =>
          setBattery(Math.round(t.batteryLevel)),
        ),
        muse.connectionStatus.subscribe((status) => {
          if (!status) {
            setConnected(false);
            setFresh(false);
            setBattery(null);
            packets.current = [0, 0, 0, 0];
          }
        }),
      );
      selected.addEventListener(
        'gattserverdisconnected',
        () => {
          if (ticket === generation.current) {
            setConnected(false);
            setFresh(false);
            packets.current = [0, 0, 0, 0];
          }
        },
        { once: true },
      );
      setDeviceName(selected.name || 'Muse 2');
      await muse.start();
      if (ticket === generation.current) setConnected(true);
    } catch (err) {
      if (ticket === generation.current) {
        disconnect();
        setError(
          err instanceof Error && err.name === 'NotFoundError'
            ? 'No headset selected. You can connect again or try Demo.'
            : err instanceof Error
              ? err.message
              : 'Connection failed. Please try again.',
        );
      }
    } finally {
      if (ticket === generation.current) setConnecting(false);
    }
  }, [connecting, disconnect]);
  const recalibrate = () => engine.current?.startCalibration();
  const assessment = useMemo(
    () =>
      assessMuseQuality(
        packetState.times,
        packetState.now,
        reading.calibrated,
        reading.calibrating,
        reading.quality,
      ),
    [packetState, reading.calibrated, reading.calibrating, reading.quality],
  );
  const usable =
    connected &&
    assessment.usable &&
    reading.lastUpdate > 0 &&
    packetState.now - reading.lastUpdate < 3000;
  return {
    reading,
    connected,
    connecting,
    connect,
    disconnect,
    deviceName,
    battery,
    error,
    supported,
    fresh,
    usable,
    channelFresh: assessment.fresh,
    signalQuality: assessment.level,
    recalibrate,
    waveform,
  };
}
