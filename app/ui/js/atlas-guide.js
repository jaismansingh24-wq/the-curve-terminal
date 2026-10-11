/* How it connects: what each part of Atlas has to do with an index future,
   how the link is usually read, and where that read goes wrong. Written for
   NQ first; the other CME equity index futures are listed and arrive in a
   later update.

   These are descriptions of tendencies that have been seen over some
   periods, said as such, each with the way it fails. Nothing here is a
   reading of what the market will do, a score or a regime label. */

export const INDICES = [
  { code: 'NQ', name: 'E-mini Nasdaq-100', ready: true },
  { code: 'ES', name: 'E-mini S&P 500', ready: false },
  { code: 'YM', name: 'E-mini Dow', ready: false },
  { code: 'RTY', name: 'E-mini Russell 2000', ready: false },
];

export const GUIDE = {
  NQ: {
    intro: [
      'NQ is the E-mini Nasdaq-100 future on CME. The Nasdaq-100 holds 100 of the largest non-financial companies listed on Nasdaq, and leans heavily towards large technology and communication companies, many of them valued on profits expected years ahead.',
      'That is why NQ is often called long duration. Like a long-dated bond, much of its value rests on the distant future, so it is sensitive to the rate that future profit is discounted at. Most of the links below run through that one idea.',
    ],
    caution: [
      'Everything in Atlas changes once a day or once a week. NQ changes every second, for reasons Atlas does not show: company results, news, flows, options hedging. The links below are tendencies seen over some periods. They have weakened, reversed and come back. None of them says what NQ will do next, and together they do not add up to a score.',
      'Read the background before you read a session, or when you look back at a trade in your journal: what rates, the dollar and positioning had been doing that week, and what was scheduled. Then set what you saw on the tape against it. The background describes the weather, not the next step.',
    ],
    topics: [
      {
        id: 'real', title: 'Real yields', page: 'rates', pageName: 'Rates',
        link: 'A real yield is the return on a Treasury after inflation: the closest thing the market has to a price of time, and the rate distant profit is discounted at. When it rises, a dollar of profit ten years away is worth less today, and companies valued on far-off profit lose more value than companies valued on profit now.',
        read: 'Rising real yields are read as a headwind for NQ, and falling real yields as support. Much of that read comes from 2022, when the 10-year real yield climbed from below zero and the Nasdaq-100 fell hard.',
        wrong: 'The link is about valuation, and valuation is only part of what moves NQ. When real yields rise because the economy is expected to grow faster, expected profit can rise with them, and NQ has risen alongside. The speed of a move is often said to matter more than its size; slow drifts have come and gone with little effect. TIPS yields also carry a liquidity premium of their own.',
      },
      {
        id: 'curve', title: 'Treasury yields and the curve', page: 'rates', pageName: 'Rates',
        link: 'The 2-year yield follows what the market expects the Fed to do over the next two years. The 10-year adds expected growth, inflation and a term premium (the extra return asked for lending for longer). NQ is tied to both: the 2-year through the cost of money, the 10-year through discounting.',
        read: 'A sharp rise in the 2-year around a CPI release, a jobs report or an FOMC meeting is read as tighter policy ahead, and NQ has often fallen on those days. A curve that steepens because long yields rise is read differently from one that steepens because short yields fall: the first is about the cost of long-term money, the second about expected cuts.',
        wrong: 'An inverted curve (2s10s below zero) is widely read as a warning of recession, but it is a set of prices: the curve stayed inverted through 2023 and much of 2024 while the Nasdaq-100 rose. For long stretches of the 2000s and 2010s, rising yields came with rising stocks, because yields rose on growth; in 2022 they moved in opposite directions, because yields rose on inflation and policy. Which of the two is in charge changes, and the yield chart alone does not say.',
      },
      {
        id: 'fed', title: 'The Fed and overnight rates', page: 'rates', pageName: 'Rates',
        link: 'The Fed sets a target range for the fed funds rate, and the overnight rates (EFFR, SOFR) settle in or near it. They are the base cost of money for everything else, including the borrowing that funds and dealers use to hold positions in NQ.',
        read: 'Cuts, or a path towards them, are read as easier money and support for stocks; hikes as the opposite. NQ\'s largest moves around FOMC meetings have tended to come when the decision or the statement differed from what was already priced in.',
        wrong: 'What moves prices is the surprise against expectations, and Atlas does not carry expectations: no futures-implied path, no consensus. A cut made because the economy is weakening has come with falling stocks. SOFR jumping above the range for a day or two can reflect funding pressure around month or quarter ends, not a change of policy.',
      },
      {
        id: 'auctions', title: 'Treasury auctions', page: 'auctions', pageName: 'Auctions',
        link: 'Each auction is a test of demand for new government debt. When one clears at a higher yield than the market was trading just before, yields in that part of the curve can rise in the minutes after the result, and long-duration stocks can move with them.',
        read: 'A weak 10-year or 30-year auction (a low bid-to-cover, a small indirect share, a clearing yield above the yield just before) is read as pressure on long yields and on NQ that afternoon, and a strong one as relief.',
        wrong: 'The yield just before the auction (the when-issued yield) is not in Treasury\'s data, so the tail that most desks judge an auction by cannot be shown here. Bid-to-cover depends partly on how much dealers are required to bid. One auction rarely sets a direction for longer than an afternoon, and the same result is often called weak by one desk and fine by another.',
      },
      {
        id: 'dollar', title: 'The dollar', page: 'currencies', pageName: 'Currencies',
        link: 'Many Nasdaq-100 companies sell abroad. When the dollar strengthens, sales made in other currencies are worth fewer dollars. A stronger dollar also tends to come with tighter financial conditions around the world, because much of the world borrows in dollars.',
        read: 'A rising dollar is read as a headwind for NQ, and a falling dollar as support.',
        wrong: 'The dollar also rises when the US is growing faster than elsewhere, and US stocks have risen with it then. Atlas shows the dollar against the euro and other currencies as the ECB sets them once a day: one snapshot, and not the broad dollar index most traders quote.',
      },
      {
        id: 'positioning', title: 'Positioning in NQ', page: 'positioning', pageName: 'Positioning',
        link: 'The CFTC\'s Traders in Financial Futures report shows who holds NQ futures: dealers, asset managers, leveraged funds and others. Large positions have to be managed, and when they are cut quickly the selling or buying can move the market whatever the background.',
        read: 'Positions near the edge of their own history are read as crowded. A very large net short in leveraged funds is read as fuel for a squeeze if NQ rises, and a very large net long as room for a fall. Changes from one week to the next are read as who has been adding and who has been cutting.',
        wrong: 'The figures are three days old when they appear. Much of a group\'s position can be one leg of a hedge or a spread against the cash index, options or other futures, so a net short is not necessarily a position that gains from a fall. Micro NQ (MNQ) and options are reported separately. Positions have stayed at the edge of their range for months.',
      },
      {
        id: 'energy', title: 'Energy', page: 'energy', pageName: 'Energy',
        link: 'Oil feeds into inflation, through fuel and transport costs and through what people expect prices to do. Inflation feeds into yields and Fed policy, and those feed into NQ. Weekly US stocks are one input to the oil price.',
        read: 'Stocks falling faster than the season would explain are read as tighter supply and upward pressure on oil, and a sustained rise in oil as a headwind for NQ by way of higher yields.',
        wrong: 'The chain is long and loose: stocks to oil, oil to expected inflation, that to yields, yields to NQ, with other forces at every step. Weekly stocks are estimates, revised later, and swing with refinery maintenance and the seasons. The Nasdaq-100 holds few energy companies, so the link runs through rates rather than through its own profit.',
      },
      {
        id: 'releases', title: 'Scheduled releases', page: 'releases', pageName: 'Releases',
        link: 'CPI, the jobs report, GDP, PCE and FOMC decisions are scheduled. On those days rates and the dollar can reprice within seconds of the release, and NQ moves with them.',
        read: 'A hotter inflation figure or a stronger jobs report than expected is read as higher yields ahead and pressure on NQ, and a cooler one as the opposite.',
        wrong: 'The reaction depends on the surprise against what was expected, and on which part of a report the market is watching that month, which changes. Atlas shows when releases are due, not what was expected, and the first move after a release has at times reversed within the same session.',
      },
    ],
    together: {
      lead: 'One way to read the background, in this order. It is a checklist, not a score.',
      steps: [
        'Real yields: up, down or flat over the month, and how fast?',
        'The 2-year: has the market moved its view of the Fed, and is anything scheduled this week that could move it again?',
        'The curve: steepening or flattening, and from which end?',
        'The dollar: stronger or weaker over the month?',
        'Positioning in NQ: near the edge of its own range, and which group changed most last week?',
        'Oil and stocks: anything feeding into expected inflation?',
      ],
      after: [
        'Note the answers beside the session in your journal. Over time you will see which parts of the background were in play on the days you traded, and which were not.',
        'The answers describe conditions. They do not add up to a score, and they do not say which way NQ will go: the same background has come with NQ rising and with NQ falling.',
      ],
    },
    regimes: {
      lead: 'Words often used to describe a background. They are labels for conditions, usually applied after the fact.',
      list: [
        ['Inflation in charge', 'Yields and the dollar rise on inflation news, and stocks fall as bonds fall. 2022 is the usual example.'],
        ['Growth in charge', 'Yields rise because growth looks stronger, and stocks rise with them.'],
        ['Easing', 'The Fed is cutting, or expected to; short-term yields fall first and the curve steepens from the short end.'],
        ['Stress', 'The dollar rises, short-term funding rates jump, and positions are cut across markets at once.'],
      ],
      wrong: 'Markets move between these without notice, and more than one can be at work at once. Atlas shows the parts. It does not name the regime, and no label here is a reading of what comes next.',
    },
  },
};
