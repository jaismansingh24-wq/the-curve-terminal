// The Backdrop: official public data, fetched here on the native side and
// kept in the app's folder, so the interface never contacts anything itself.
//
// The interface asks for a source by name, with at most one checked argument
// (a year, a market code, a series or a range). Each name maps to one fixed
// address below, so nothing the interface shows can make the app contact
// anywhere else. Every address here is listed on the Sources panel, and
// scripts/check.mjs fails the build if one is missing there.
//
//   %LOCALAPPDATA%\in.thecurve.terminal\backdrop\   the last copy of each
//
// A copy is used while it is younger than the age the interface asks for;
// after that it is fetched again, if fetching is switched on. If a fetch
// fails, the last copy is returned with the reason, so the page can say it
// is stale rather than going blank.

use std::fs;
use std::io::Read;
use std::path::PathBuf;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager};

/// Started with --test: copies go to their own folder.
pub struct Cache {
    pub testing: bool,
}

/// Who is asking, as polite clients say: the app, its version, and where it lives.
const AGENT: &str = concat!("TheCurveTerminal/", env!("CARGO_PKG_VERSION"), " (+https://thecurve.in)");
const MAX_BYTES: u64 = 16 * 1024 * 1024;

const EIA_SERIES: [&str; 4] = ["WCESTUS1", "WCSSTUS1", "WGTSTUS1", "WDISTUS1"];

const AUCTION_FIELDS: &str = "auction_date,issue_date,maturity_date,security_type,security_term,cusip,reopening,inflation_index_security,floating_rate,cash_management_bill_cmb,offering_amt,total_tendered,total_accepted,comp_accepted,bid_to_cover_ratio,high_yield,high_discnt_rate,high_investment_rate,int_rate,primary_dealer_accepted,direct_bidder_accepted,indirect_bidder_accepted,soma_accepted,announcemt_date,closing_time_comp";
const TFF_FIELDS: &str = "report_date_as_yyyy_mm_dd,open_interest_all,dealer_positions_long_all,dealer_positions_short_all,asset_mgr_positions_long,asset_mgr_positions_short,lev_money_positions_long,lev_money_positions_short,other_rept_positions_long,other_rept_positions_short,nonrept_positions_long_all,nonrept_positions_short_all";
const DIS_FIELDS: &str = "report_date_as_yyyy_mm_dd,open_interest_all,prod_merc_positions_long,prod_merc_positions_short,swap_positions_long_all,swap__positions_short_all,m_money_positions_long_all,m_money_positions_short_all,other_rept_positions_long,other_rept_positions_short,nonrept_positions_long_all,nonrept_positions_short_all";

/// Today's date in UTC, as (year, month, day), from the system clock.
fn today() -> (i64, u32, u32) {
    let days = (SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() / 86_400) as i64;
    // civil from days (Howard Hinnant's algorithm)
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    (y, m, d)
}

fn year_arg(arg: &str, from: i64) -> Result<i64, String> {
    let y: i64 = arg.parse().map_err(|_| "That year is not a number.".to_string())?;
    if y < from || y > today().0 {
        return Err(format!("There is no file for {y}."));
    }
    Ok(y)
}

/// Socrata's query parameters, encoded by hand: the market code is checked
/// before it gets here, so only the fixed text needs escaping.
fn enc(s: &str) -> String {
    s.chars()
        .map(|c| match c {
            'A'..='Z' | 'a'..='z' | '0'..='9' | '-' | '_' | '.' | ',' => c.to_string(),
            ' ' => "%20".into(),
            '\'' => "%27".into(),
            '=' => "%3D".into(),
            '$' => "%24".into(),
            _ => format!("%{:02X}", c as u32),
        })
        .collect()
}

/// The one address for each source. Anything else is refused.
fn address(id: &str, arg: &str) -> Result<String, String> {
    let tsy = |kind: &str, y: i64| {
        format!("https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/{y}/all?type={kind}&field_tdr_date_value={y}&page&_format=csv")
    };
    let cftc = |dataset: &str, fields: &str| -> Result<String, String> {
        if arg.len() != 6 || !arg.chars().all(|c| c.is_ascii_uppercase() || c.is_ascii_digit()) {
            return Err("That is not a CFTC market code.".into());
        }
        Ok(format!(
            "https://publicreporting.cftc.gov/resource/{dataset}.json?{}={}&{}={}&{}={}&{}=1000",
            enc("$select"), enc(fields),
            enc("$where"), enc(&format!("cftc_contract_market_code='{arg}'")),
            enc("$order"), enc("report_date_as_yyyy_mm_dd DESC"),
            enc("$limit"),
        ))
    };
    let nyfed = |path: &str| -> Result<String, String> {
        let years = match arg {
            "1y" => 1,
            "5y" => 5,
            _ => return Err("That range is not offered.".into()),
        };
        let (y, m, d) = today();
        let day = d.min(28);
        Ok(format!(
            "https://markets.newyorkfed.org/api/rates/{path}/search.json?startDate={:04}-{:02}-{:02}&endDate={:04}-{:02}-{:02}",
            y - years, m, day, y, m, d
        ))
    };
    match id {
        "tsy-nominal" => Ok(tsy("daily_treasury_yield_curve", year_arg(arg, 1990)?)),
        "tsy-real" => Ok(tsy("daily_treasury_real_yield_curve", year_arg(arg, 2003)?)),
        "nyfed-latest" => Ok("https://markets.newyorkfed.org/api/rates/all/latest.json".into()),
        "nyfed-effr" => nyfed("unsecured/effr"),
        "nyfed-sofr" => nyfed("secured/sofr"),
        "auctions" => Ok(format!(
            "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query?fields={AUCTION_FIELDS}&sort=-auction_date&page%5Bsize%5D=500"
        )),
        "cftc-tff" => cftc("gpe5-46if", TFF_FIELDS),
        "cftc-dis" => cftc("72hh-3qpy", DIS_FIELDS),
        "ecb-90d" => Ok("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml".into()),
        "eia" => {
            if !EIA_SERIES.contains(&arg) {
                return Err("That EIA series is not offered.".into());
            }
            Ok(format!("https://www.eia.gov/dnav/pet/hist/LeafHandler.ashx?n=PET&s={arg}&f=W"))
        }
        "fed-press" => Ok("https://www.federalreserve.gov/feeds/press_all.xml".into()),
        _ => Err(format!("No source called {id}.")),
    }
}

fn folder(app: &AppHandle) -> Result<PathBuf, String> {
    let name = if app.state::<Cache>().testing { "backdrop.test" } else { "backdrop" };
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join(name);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn ms(t: SystemTime) -> u64 {
    t.duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}

fn fetch(url: &str) -> Result<String, String> {
    let agent = ureq::AgentBuilder::new()
        .user_agent(AGENT)
        .timeout_connect(Duration::from_secs(12))
        .timeout(Duration::from_secs(45))
        .build();
    let res = agent.get(url).call().map_err(|e| match e {
        ureq::Error::Status(code, _) => format!("the source answered with status {code}"),
        ureq::Error::Transport(t) => format!("it could not be reached ({})", t.kind()),
    })?;
    let mut text = String::new();
    res.into_reader()
        .take(MAX_BYTES)
        .read_to_string(&mut text)
        .map_err(|e| format!("the reply could not be read ({e})"))?;
    if text.trim().is_empty() {
        return Err("the source sent an empty reply".into());
    }
    Ok(text)
}

#[derive(serde::Serialize)]
pub struct Got {
    text: String,
    /// when this copy was fetched, in ms since 1970
    fetched_at: u64,
    /// fetched just now, rather than read from the last copy
    fresh: bool,
    /// why a fetch failed, when the last copy is being shown instead
    error: Option<String>,
}

/// A source's text: the last copy if it is young enough, otherwise fetched
/// again (when `network` is on). `max_age_hours` comes from the interface;
/// `force` fetches regardless, for the Fetch again button.
#[tauri::command]
pub async fn backdrop_get(app: AppHandle, id: String, arg: Option<String>, max_age_hours: f64, network: bool, force: bool) -> Result<Got, String> {
    let arg = arg.unwrap_or_default();
    let url = address(&id, &arg)?;
    let name = if arg.is_empty() { format!("{id}.txt") } else { format!("{id}-{arg}.txt") };
    let path = folder(&app)?.join(name);

    let cached = fs::metadata(&path).ok().and_then(|m| m.modified().ok()).and_then(|t| {
        fs::read_to_string(&path).ok().map(|text| (text, t))
    });
    if let Some((text, t)) = &cached {
        let age = SystemTime::now().duration_since(*t).unwrap_or_default().as_secs_f64() / 3600.0;
        if !force && age < max_age_hours.max(0.0) {
            return Ok(Got { text: text.clone(), fetched_at: ms(*t), fresh: false, error: None });
        }
    }
    if !network {
        return match cached {
            Some((text, t)) => Ok(Got { text, fetched_at: ms(t), fresh: false, error: None }),
            None => Err("Fetching is switched off in Settings, and there is no earlier copy.".into()),
        };
    }

    let got = tauri::async_runtime::spawn_blocking(move || fetch(&url)).await.map_err(|e| e.to_string())?;
    match got {
        Ok(text) => {
            let tmp = path.with_extension("tmp");
            if fs::write(&tmp, &text).is_ok() {
                let _ = fs::rename(&tmp, &path);
            }
            Ok(Got { text, fetched_at: ms(SystemTime::now()), fresh: true, error: None })
        }
        Err(why) => match cached {
            Some((text, t)) => Ok(Got { text, fetched_at: ms(t), fresh: false, error: Some(why) }),
            None => Err(format!("The source could not be fetched: {why}.")),
        },
    }
}

/// Delete every downloaded copy (Settings, under The Backdrop).
#[tauri::command]
pub fn backdrop_clear(app: AppHandle) -> Result<u32, String> {
    let dir = folder(&app)?;
    let mut n = 0;
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())?.flatten() {
        if fs::remove_file(entry.path()).is_ok() {
            n += 1;
        }
    }
    Ok(n)
}
