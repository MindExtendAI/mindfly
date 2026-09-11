//! Port of lib/bpn-circuit.ts. Anatomy, controls and renderer remain in TypeScript.
//! The JS adapter validates graph indices before crossing this private ABI.
struct Term {
    weight: f64,
    population: f64,
    indices: Vec<usize>,
}
pub struct Engine {
    voltage: Vec<f32>,
    current: Vec<f32>,
    refractory: Vec<u64>,
    awake: Vec<bool>,
    delayed: Vec<Vec<f32>>,
    output: Vec<Vec<(usize, f32)>>,
    targets: Vec<bool>,
    terms: Vec<Term>,
    tick: u64,
    train_tick: u64,
    was_on: bool,
    forward: f64,
    pulses: u32,
    counts: Vec<u32>,
    activity: Vec<f32>,
    events: Vec<u32>,
    decay: f32,
    syn_decay: f32,
    coupling: f32,
    smoothing: f64,
}
#[no_mangle]
pub extern "C" fn engine_new(
    n: usize,
    decay: f32,
    syn_decay: f32,
    coupling: f32,
    smoothing: f64,
) -> *mut Engine {
    Box::into_raw(Box::new(Engine {
        voltage: vec![-52.; n],
        current: vec![0.; n],
        refractory: vec![0; n],
        awake: vec![false; n],
        delayed: vec![vec![0.; n]; 5],
        output: vec![vec![]; n],
        targets: vec![false; n],
        terms: vec![],
        tick: 0,
        train_tick: 0,
        was_on: false,
        forward: 0.,
        pulses: 0,
        counts: vec![0; n],
        activity: vec![0.; n],
        events: vec![],
        decay,
        syn_decay,
        coupling,
        smoothing,
    }))
}
#[no_mangle]
pub unsafe extern "C" fn engine_free(p: *mut Engine) {
    drop(Box::from_raw(p));
}
#[no_mangle]
pub unsafe extern "C" fn engine_target(p: *mut Engine, i: usize) {
    (&mut *p).targets[i] = true;
}
#[no_mangle]
pub unsafe extern "C" fn engine_edge(p: *mut Engine, a: usize, b: usize, weight: f32) {
    (&mut *p).output[a].push((b, weight));
}
#[no_mangle]
pub unsafe extern "C" fn engine_term(p: *mut Engine, weight: f64, population: f64) {
    (&mut *p).terms.push(Term {
        weight,
        population,
        indices: vec![],
    });
}
#[no_mangle]
pub unsafe extern "C" fn engine_term_index(p: *mut Engine, i: usize) {
    (&mut *p).terms.last_mut().unwrap().indices.push(i);
}
#[no_mangle]
pub unsafe extern "C" fn engine_reset(p: *mut Engine) {
    let e = &mut *p;
    e.voltage.fill(-52.);
    e.current.fill(0.);
    e.refractory.fill(0);
    e.awake.fill(false);
    e.activity.fill(0.);
    e.counts.fill(0);
    e.events.clear();
    for slot in &mut e.delayed {
        slot.fill(0.);
    }
    e.tick = 0;
    e.train_tick = 0;
    e.pulses = 0;
    e.forward = 0.;
    e.was_on = false;
}
#[no_mangle]
pub unsafe extern "C" fn engine_advance(p: *mut Engine, stimulate: u32) {
    let e = &mut *p;
    let on = stimulate != 0;
    if on && !e.was_on {
        e.train_tick = 0;
    }
    e.was_on = on;
    e.counts.fill(0);
    e.events.clear();
    let mut spikes = Vec::with_capacity(e.voltage.len());
    for step in 0..100 {
        let pulse = on && e.train_tick % 200 < 10;
        if on && e.train_tick % 200 == 0 {
            e.pulses += 1;
        }
        if pulse {
            for i in 0..e.targets.len() {
                if e.targets[i] {
                    e.awake[i] = true;
                }
            }
        }
        let due = (e.tick % 5) as usize;
        spikes.clear();
        for i in 0..e.counts.len() {
            if !e.awake[i] {
                continue;
            }
            let mut g = e.current[i] + e.delayed[due][i];
            e.delayed[due][i] = 0.;
            let mut v = e.voltage[i];
            let mut refrac = e.tick < e.refractory[i];
            let injection = if pulse && e.targets[i] { 1.0_f32 } else { 0.0 };
            if refrac {
                v = -52.;
            } else {
                v = ((-52. + (v + 52.) * e.decay) + g * e.coupling) + injection;
                g *= e.syn_decay;
                if v >= -45. {
                    spikes.push(i);
                    e.counts[i] += 1;
                    e.events.push(i as u32);
                    e.events.push(step);
                    v = -52.;
                    g = 0.;
                    e.refractory[i] = e.tick + 4;
                    refrac = true;
                }
            }
            e.current[i] = g;
            e.voltage[i] = v;
            let pending = e.delayed.iter().any(|slot| slot[i] != 0.);
            if !refrac
                && !pending
                && injection == 0.
                && (v + 52.).abs() <= 0.02_f32
                && g.abs() <= 0.02_f32
            {
                e.awake[i] = false;
                e.voltage[i] = -52.;
                e.current[i] = 0.;
            }
        }
        let queue = ((e.tick + 4) % 5) as usize;
        for &i in &spikes {
            for &(j, weight) in &e.output[i] {
                e.delayed[queue][j] += weight;
                e.awake[j] = true;
            }
        }
        if on {
            e.train_tick += 1;
        }
        e.tick += 1;
    }
    let mut raw = 0.;
    for term in &e.terms {
        let sum: u32 = term.indices.iter().map(|&i| e.counts[i]).sum();
        if term.population != 0. {
            raw += term.weight * ((sum as f64 * 20.) / term.population / 50.).min(1.);
        }
    }
    e.forward += e.smoothing * (raw - e.forward);
    for i in 0..e.counts.len() {
        e.activity[i] = if e.counts[i] > 0 {
            1.
        } else {
            (e.activity[i] as f64 * 0.82) as f32
        };
    }
}
#[no_mangle]
pub unsafe extern "C" fn engine_counts(p: *const Engine) -> *const u32 {
    (&*p).counts.as_ptr()
}
#[no_mangle]
pub unsafe extern "C" fn engine_activity(p: *const Engine) -> *const f32 {
    (&*p).activity.as_ptr()
}
#[no_mangle]
pub unsafe extern "C" fn engine_events(p: *const Engine) -> *const u32 {
    (&*p).events.as_ptr()
}
#[no_mangle]
pub unsafe extern "C" fn engine_events_len(p: *const Engine) -> usize {
    (&*p).events.len()
}
#[no_mangle]
pub unsafe extern "C" fn engine_forward(p: *const Engine) -> f64 {
    (&*p).forward
}
#[no_mangle]
pub unsafe extern "C" fn engine_pulses(p: *const Engine) -> u32 {
    (&*p).pulses
}
