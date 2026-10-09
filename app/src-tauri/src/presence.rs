// Discord status ("Rich Presence"). On by default, switchable in settings.
//
// The app talks only to the Discord app already running on this computer,
// over its local pipe. Discord then shows, on the reader's profile:
//   The Curve Terminal
//   a word and a line from the fixed list below, changing every 90 seconds
//   how long the app has been open
//   a button linking to thecurve.in
// Nothing from the journal, settings or anything the reader writes is ever
// sent. The lines are picked at random and do not describe what the reader
// is doing. The Privacy panel says all of this in plain words.

use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use tauri::{AppHandle, Emitter};

/// The Discord application ID, from the Discord Developer Portal. It is not
/// a secret: every app that shows a Discord status carries its ID. While it
/// is empty the status stays off and settings says "Not set up in this build".
const CLIENT_ID: &str = "1557792319091249222";

/// The art asset uploaded to that application under this name (the mark).
const LARGE_IMAGE: &str = "mark";

const ROTATE: Duration = Duration::from_secs(90);
const RETRY: Duration = Duration::from_secs(15);

/// A word, then a line. Plain, calm, never advice.
const LINES: [(&str, &str); 20] = [
    ("Reflecting", "Reading an old trade"),
    ("Composing", "Writing a session note"),
    ("Tracing", "Following the tape back to the open"),
    ("Auditing", "Checking a fill against the footprint"),
    ("Surveying", "Looking over yesterday's profile"),
    ("Annotating", "Marking where the auction turned"),
    ("Studying", "Reading about absorption"),
    ("Deciphering", "Untangling a delta divergence"),
    ("Cataloguing", "Filing the morning's notes"),
    ("Revisiting", "Rereading last week's entries"),
    ("Measuring", "Working out where value sat"),
    ("Pondering", "Asking why that level held"),
    ("Sketching", "Drawing the day's structure"),
    ("Contemplating", "Thinking over a misread"),
    ("Chronicling", "Writing down what the tape said"),
    ("Examining", "Reading The Auction"),
    ("Reckoning", "Counting the session's prints"),
    ("Distilling", "Turning a messy day into one paragraph"),
    ("Wandering", "Browsing The Curve's long reads"),
    ("Listening", "Watching the book breathe"),
];

#[derive(Clone, Copy, PartialEq, Eq, Debug, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Off,
    Connecting,
    Connected,
    NotRunning,
    NotConfigured,
}

enum Msg {
    Enable(bool),
    Shutdown,
}

pub struct Presence {
    tx: Mutex<Sender<Msg>>,
    status: Arc<Mutex<Status>>,
    worker: Mutex<Option<std::thread::JoinHandle<()>>>,
}

impl Presence {
    pub fn spawn(app: AppHandle) -> Self {
        let (tx, rx) = mpsc::channel();
        let status = Arc::new(Mutex::new(Status::Off));
        let st = status.clone();
        let worker = std::thread::spawn(move || run(app, rx, st));
        Self {
            tx: Mutex::new(tx),
            status,
            worker: Mutex::new(Some(worker)),
        }
    }

    /// Clear the status and close the pipe before the app exits.
    pub fn shutdown(&self) {
        let _ = self.tx.lock().map(|tx| tx.send(Msg::Shutdown));
        if let Some(h) = self.worker.lock().ok().and_then(|mut w| w.take()) {
            let _ = h.join();
        }
    }
}

/// Switch the status on or off, then wait briefly for the worker's answer
/// so the loading bar and settings can say what actually happened.
#[tauri::command]
pub async fn presence_set(
    state: tauri::State<'_, Presence>,
    enabled: bool,
) -> Result<Status, String> {
    *state.status.lock().map_err(|e| e.to_string())? = Status::Connecting;
    state
        .tx
        .lock()
        .map_err(|e| e.to_string())?
        .send(Msg::Enable(enabled))
        .map_err(|_| "The Discord worker has stopped".to_string())?;

    let status = state.status.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let until = Instant::now() + Duration::from_millis(2000);
        loop {
            let s = status.lock().map(|g| *g).unwrap_or(Status::NotRunning);
            if s != Status::Connecting || Instant::now() >= until {
                return s;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
    })
    .await
    .map_err(|e| e.to_string())
}

fn set(app: &AppHandle, status: &Arc<Mutex<Status>>, s: Status) {
    if let Ok(mut g) = status.lock() {
        if *g != s {
            *g = s;
            let _ = app.emit("presence-status", s);
        }
    }
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// A fresh order of the twenty lines, so none repeats until all have shown.
fn shuffled(seed: &mut u64) -> Vec<usize> {
    let mut v: Vec<usize> = (0..LINES.len()).collect();
    for i in (1..v.len()).rev() {
        *seed ^= *seed << 13;
        *seed ^= *seed >> 7;
        *seed ^= *seed << 17;
        let j = (*seed % (i as u64 + 1)) as usize;
        v.swap(i, j);
    }
    v
}

fn connect() -> Option<DiscordIpcClient> {
    let mut c = DiscordIpcClient::new(CLIENT_ID);
    c.connect().ok()?;
    Some(c)
}

fn close(client: &mut Option<DiscordIpcClient>) {
    if let Some(mut c) = client.take() {
        let _ = c.clear_activity();
        let _ = c.close();
    }
}

fn run(app: AppHandle, rx: Receiver<Msg>, status: Arc<Mutex<Status>>) {
    let opened = now_millis();
    let mut seed = (opened as u64) ^ 0x9E37_79B9_7F4A_7C15;
    let mut order = shuffled(&mut seed);
    let mut idx = 0usize;

    let mut enabled = false;
    let mut client: Option<DiscordIpcClient> = None;
    let mut next_try = Instant::now();
    let mut next_line = Instant::now();

    loop {
        let wait = if enabled { Duration::from_secs(1) } else { Duration::from_secs(3600) };
        match rx.recv_timeout(wait) {
            Ok(Msg::Enable(on)) => {
                enabled = on;
                if on {
                    next_try = Instant::now();
                    if client.is_some() {
                        set(&app, &status, Status::Connected);
                    }
                }
            }
            Ok(Msg::Shutdown) | Err(RecvTimeoutError::Disconnected) => {
                close(&mut client);
                break;
            }
            Err(RecvTimeoutError::Timeout) => {}
        }

        if !enabled {
            close(&mut client);
            set(&app, &status, Status::Off);
            continue;
        }
        if CLIENT_ID.is_empty() {
            set(&app, &status, Status::NotConfigured);
            continue;
        }
        if client.is_none() {
            if Instant::now() < next_try {
                continue;
            }
            match connect() {
                Some(c) => {
                    client = Some(c);
                    next_line = Instant::now();
                }
                None => {
                    set(&app, &status, Status::NotRunning);
                    next_try = Instant::now() + RETRY;
                    continue;
                }
            }
        }
        if Instant::now() >= next_line {
            if idx >= order.len() {
                order = shuffled(&mut seed);
                idx = 0;
            }
            let (word, line) = LINES[order[idx]];
            idx += 1;
            let act = activity::Activity::new()
                .details(word)
                .state(line)
                .timestamps(activity::Timestamps::new().start(opened))
                .assets(
                    activity::Assets::new()
                        .large_image(LARGE_IMAGE)
                        .large_text("The Curve Terminal"),
                )
                .buttons(vec![activity::Button::new("Visit The Curve", "https://thecurve.in")]);
            let sent = client.as_mut().map(|c| c.set_activity(act).is_ok()).unwrap_or(false);
            if sent {
                set(&app, &status, Status::Connected);
                next_line = Instant::now() + ROTATE;
            } else {
                // Discord was closed: drop the pipe and look again shortly
                if let Some(mut c) = client.take() {
                    let _ = c.close();
                }
                set(&app, &status, Status::NotRunning);
                next_try = Instant::now() + RETRY;
            }
        }
    }
}
