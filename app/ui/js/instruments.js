/* The futures the journal knows, with their contract specifications.

   Source: CME Group's own contract specifications (the ContractSpecs data
   behind each product's "Contract Specs" page on cmegroup.com), read on
   9 October 2026. Tick size and tick value are the outright minimum price
   fluctuation; point value is tick value / tick size. CME changes these
   from time to time (it cut the currency futures' ticks), so they are
   re-checked against CME, never carried forward from memory.

   Prices are entered as decimals: Treasuries in points (117.03125, not
   117'01), grains in cents per bushel (452.25). */

export const CHECKED = '9 October 2026';
export const SOURCE = "CME Group's contract specifications";

const L = (code, name, group, size, tick, tickValue, decimals, yahoo) =>
  ({ code, name, group, size, tick, tickValue, point: tickValue / tick, decimals, yahoo });

export const INSTRUMENTS = [
  L('ES', 'E-mini S&P 500', 'Equity index', 'mini', 0.25, 12.5, 2, 'ES=F'),
  L('MES', 'Micro E-mini S&P 500', 'Equity index', 'micro', 0.25, 1.25, 2, 'MES=F'),
  L('NQ', 'E-mini Nasdaq-100', 'Equity index', 'mini', 0.25, 5, 2, 'NQ=F'),
  L('MNQ', 'Micro E-mini Nasdaq-100', 'Equity index', 'micro', 0.25, 0.5, 2, 'MNQ=F'),
  L('YM', 'E-mini Dow', 'Equity index', 'mini', 1, 5, 0, 'YM=F'),
  L('MYM', 'Micro E-mini Dow', 'Equity index', 'micro', 1, 0.5, 0, 'MYM=F'),
  L('RTY', 'E-mini Russell 2000', 'Equity index', 'mini', 0.1, 5, 1, 'RTY=F'),
  L('M2K', 'Micro E-mini Russell 2000', 'Equity index', 'micro', 0.1, 0.5, 1, 'M2K=F'),
  L('CL', 'Crude Oil (WTI)', 'Energy', 'standard', 0.01, 10, 2, 'CL=F'),
  L('MCL', 'Micro WTI Crude Oil', 'Energy', 'micro', 0.01, 1, 2, 'MCL=F'),
  L('NG', 'Henry Hub Natural Gas', 'Energy', 'standard', 0.001, 10, 3, 'NG=F'),
  L('GC', 'Gold', 'Metals', 'standard', 0.1, 10, 1, 'GC=F'),
  L('MGC', 'Micro Gold', 'Metals', 'micro', 0.1, 1, 1, 'MGC=F'),
  L('SI', 'Silver', 'Metals', 'standard', 0.005, 25, 3, 'SI=F'),
  L('SIL', 'Micro Silver (1,000 oz)', 'Metals', 'micro', 0.005, 5, 3, 'SIL=F'),
  L('HG', 'Copper', 'Metals', 'standard', 0.0005, 12.5, 4, 'HG=F'),
  L('ZB', 'U.S. Treasury Bond', 'Interest rates', 'standard', 0.03125, 31.25, 5, 'ZB=F'),
  L('ZN', '10-Year T-Note', 'Interest rates', 'standard', 0.015625, 15.625, 6, 'ZN=F'),
  L('ZF', '5-Year T-Note', 'Interest rates', 'standard', 0.0078125, 7.8125, 7, 'ZF=F'),
  L('6E', 'Euro FX', 'Currencies', 'standard', 0.00001, 1.25, 5, '6E=F'),
  L('6B', 'British Pound', 'Currencies', 'standard', 0.00001, 0.625, 5, '6B=F'),
  L('6J', 'Japanese Yen', 'Currencies', 'standard', 0.0000001, 1.25, 7, '6J=F'),
  L('6A', 'Australian Dollar', 'Currencies', 'standard', 0.00001, 1, 5, '6A=F'),
  L('ZC', 'Corn (cents per bushel)', 'Grains', 'standard', 0.25, 12.5, 2, 'ZC=F'),
  L('ZS', 'Soybeans (cents per bushel)', 'Grains', 'standard', 0.25, 12.5, 2, 'ZS=F'),
  L('ZW', 'Chicago SRW Wheat (cents per bushel)', 'Grains', 'standard', 0.25, 12.5, 2, 'ZW=F'),
];

const BY = new Map(INSTRUMENTS.map((i) => [i.code, i]));
export const get = (code) => BY.get(code) || null;

export const GROUPS = [...new Set(INSTRUMENTS.map((i) => i.group))];

/* is a price on the instrument's tick? (with room for floating point) */
export function onTick(code, price) {
  const ins = get(code);
  if (!ins || !Number.isFinite(price)) return true;
  const n = price / ins.tick;
  return Math.abs(n - Math.round(n)) < 1e-6;
}

const NUM = new Map();
export function formatPrice(code, price) {
  if (!Number.isFinite(price)) return '';
  const ins = get(code);
  const d = ins ? ins.decimals : 2;
  if (!NUM.has(d)) NUM.set(d, new Intl.NumberFormat('en-GB', { minimumFractionDigits: d, maximumFractionDigits: d }));
  return NUM.get(d).format(price);
}
