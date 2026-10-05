# War of Rights Season Tracker

A React-based web application for tracking regiment performance across a War of
Rights competitive season. Built with the same design patterns as the Log
Analyzer.

## Two sites, one build

The deployment serves two things off the same URL.

**The public site** is what the address gives you. Anyone can open it, find the
event they play in, and read it: standings, schedule, roster, playoff bracket,
Elo ladder and the whole player-stats panel — every season, no link required
and nothing shared with them first. It is entirely read-only; there is not a
control on it that would change anything.

An event with no nights recorded — rounds imported for the stats and nothing
else, which plenty of them are — shows only the player stats. Standings, a
schedule and a bracket would all be empty, so that half of the site is not
there: no rail group, no season picker, no screens.

- `#/` — the directory. Every published event, plus a box to type one's short
  name into.
- `#/e/<short-name>` — an event. Add a screen (`/standings`, `/nights`,
  `/pairings`, `/stats`, …) and a season (`/sea_abc123`, or `overall`) to link
  straight to a view.
- `#/tools` — the side balancer and company splitter, which need no event at
  all.

**The admin site** is the tracker, at **`/#/admin`** — your deployment's URL
with `#/admin` on the end — behind the admin pass. That is
where events are created, nights recorded, rounds imported and seasons
published. Everything it does is what it always did; what is new is a **Publish
to the site** screen under Setup.

Writes are refused by the server without the pass, so the gate on `#/admin` is a
courtesy — it stops the tracker opening in a state where every save is about to
fail — rather than the thing keeping strangers out.

## The database

Everything the site serves — events, seasons, rounds, their replays, regiment
pins and the share-link store — lives in Postgres on Neon, reached through `/api/db` (see
`api/_lib/`). Reads are public; every write needs
`Authorization: Bearer <ADMIN_PASS>`.

### Tables

The shape follows how the site reads (`api/_lib/schema.js`):

| Table | Holds |
| --- | --- |
| `wor_events` | One row per event: name, published flag, its seasons and unit registry. This is what the directory lists. |
| `wor_scoreboards` | One row per imported round. `payload` is the **whole** parsed scoreboard; the summary columns beside it — map, mode, winner, the night it is bound to — are copies, so a list view never has to load a killfeed. |
| `wor_event_docs` | An event's regiment pins, its renames, and the tracker's own state: one JSON document each, because that is exactly how the screens hold them and nothing queries inside them. |
| `wor_replays` | A round's replay — positions and artillery, compressed — in chunks, keyed to its scoreboard row. It is visible exactly when its round is, and goes when the round or event is deleted. |
| `wor_round_samples` | Each round's training sample for the replay Analysis panel's win model, worked out once when its replay lands. Goes with its round. |
| `wor_round_model` | That model: one row, refitted whenever the rounds it learns from change. |
| `wor_shares` | The short-link store, so the deployment needs one database rather than two. |

The DDL is idempotent and runs on the first request after a cold start, so a
fresh Neon database needs no migration step — point `WOR_DATABASE_URL` at it and
it builds what it needs.

### Deploying

Two environment variables, and an optional third:

| Variable | What it is |
| --- | --- |
| `WOR_DATABASE_URL` | Your Neon connection string. `DATABASE_URL` and `POSTGRES_URL` are accepted too, which is what Vercel's Neon integration sets. Use the **pooled** endpoint. |
| `ADMIN_PASS` | A secret you choose, at least 12 characters — make it a long random one (`openssl rand -base64 32`). Without it the database refuses **every** write, which is the safe default rather than an open door. |
| `PUBS_API_URL` | Optional. The PUBS dashboard's backend (e.g. `https://….up.railway.app`). The replay Analysis panel's win model then starts from the dashboard's public-round model (see Analysis below). |

`vercel.json` routes every `/api/db/...` path to the single function in
`api/db.js`. That rewrite is not optional: a `[...path]` filename matched only
one segment on the deployment, so `/api/db/events` ran while
`/api/db/events/<slug>/tracker` got the platform's own 404 before the function
was ever invoked. The app itself uses hash routing, so it needs no rewrite of
its own.

The driver is `@neondatabase/serverless`, which speaks Postgres over HTTP — no
connection pool to keep warm and no socket to lose between invocations, which is
what makes it usable from a serverless function at all.

### Running it locally

`npm run dev` serves the API as well as the app. With no `WOR_DATABASE_URL` in
the environment it runs against **PGlite** — Postgres compiled to WebAssembly,
in memory, gone when the dev server stops — and prints an admin pass to enter at
`#/admin`. So the whole site works on a laptop with nothing provisioned, and
against the same SQL the deployment runs.

The tests use PGlite too, which means the queries in `api/_lib/store.js` are
genuinely executed rather than mocked: a typo, a missing column or a conflict
clause that does not do what it looks like fails a test rather than a
deployment.

### Who Can Do What

One secret, `ADMIN_PASS`, guards every write. The rules are in
`api/_lib/auth.js` and `api/_lib/router.js`, and `api/_lib/security.test.js`
holds them in place:

- **Every write needs the pass** — creating events, importing rounds, editing
  pins, publishing, deleting. Presented as `Authorization: Bearer`, never in a
  URL, and compared in constant time.
- **No pass configured means no writes at all.** A deployment that has not been
  given one refuses every write rather than accepting them from anyone.
- **The gate on `/#/admin` is a courtesy, not the boundary.** It stops the
  tracker opening in a state where every save is about to fail. The server
  checks the pass on every write regardless of what the browser did.
- **An unpublished event is invisible** — its meta, season, rounds, pins and
  renames all 404 for anyone without the pass, and it answers exactly as an
  event that never existed, so the directory cannot be probed for drafts.
- **A round id carries its event**, so one event's id cannot be used to read
  another's.

Two things to know about the trust model:

- The pass is kept in `localStorage`, so anyone with the machine has it. That is
  the same boundary the tracker has always had — until this change the entire
  season lived in that same storage.
- There is no rate limiting beyond the platform's own. The pass is the only
  thing standing in front of writes, so it should be long and random rather than
  memorable.

### What a Shared Cache May Keep

Caching a response that was not public is how private data leaks, so the rule
is explicit rather than implied:

- A **published** event's reads are the same bytes for everyone, whoever asked,
  so they carry `public` cache headers and Vercel's CDN answers repeat readers
  without waking the database.
- An **unpublished** event is the owner's alone. Its reads carry
  `private, no-store` — never held by a proxy, revalidated every time.
- The **sign-in check** is never stored by anything.
- **Nothing a caller sent reaches a response header.** A round id or a list of
  week ids identifies a response, so it goes into the ETag as a hash.

Unpublishing takes effect at the edge within the `s-maxage` window (five
minutes), after which one reader may be served a stale copy while the edge
refreshes behind them. For a stats site that is the right trade; if you need an
event hidden the moment you click, delete it instead.

### What Makes a Page Load Fast

A season of scoreboards is the one request a visitor waits on, so five things
stand between them and the numbers:

- **Only the season on screen is fetched.** A visitor lands on one season; a
  four-season event used to download all four to draw one of them. `weekIds`
  narrows the read, and switching to All seasons fetches the rest once.
- **The join/leave log stays behind.** No stat or view reads it and it is a
  twelfth of what a round weighs. Postgres drops it from the document before
  the row is sent; the stored round still has it, and a backup still asks for it.
- **Page boundaries are computed from recorded sizes.** Each round's byte count
  is written down when it is stored, so cutting pages costs one cheap query
  rather than re-serializing every killfeed in the event — which the first
  version did, once per page.
- **Pages are fetched together.** Because the boundaries depend only on those
  sizes, page 0 also says how many pages there are, and the rest go out at once
  instead of walking a cursor one round trip at a time.
- **Every public read carries an ETag.** An unchanged event costs a 304 — one
  cheap query and no payload — and Vercel's CDN answers repeat readers without
  waking the database at all.
- **Writes cost one round trip each.** Saving a round updates the round and its
  event's timestamp in a single statement; the event's round count is counted
  where it is read rather than kept in step by hand.
- **The schema is one statement.** It is created on the first request after a
  cold start, and nine separate `CREATE`s meant nine round trips before anything
  could be read.

Measured on a four-season event of 72 full rounds (18 MB of scoreboards), in
development, where React's StrictMode fetches everything twice: landing on a
season takes ~3.4 s the first time and ~1.4 s on a reload. Before these
changes the same page took ~5 s cold and ~7.5 s reloading, and read every
season to show one.

What is left is inherent to computing the stats in the browser: the rounds have
to arrive and be parsed. Going further means publishing precomputed leaderboards
alongside the rounds and reading those instead.

### What a round row holds

`payload` is the entire scoreboard the parser produced, not a summary of it:
meta, players, the officer command log, the roster, the per-posting service log,
the killfeed and the join/leave log. `src/stats/roundTrip.test.ts` walks a real
overlay CSV all the way — parse, publish, store, read back as a visitor — and
asserts the round that comes out equals the round that went in, field for field.

Two things that would be easy to get wrong, and are tested:

- **Steam ids stay strings.** A SteamID64 is past `Number.MAX_SAFE_INTEGER`, so
  anything that treated one as a number would hand back different digits.
- **`joinLeaves` is kept.** It is stripped from share links and export files,
  where it is dead weight nothing reads and the payload has to stay small. The
  database is meant to be the record, so publishing sends the whole thing.

One caveat worth knowing: a bundle inside an **old export file** had
`joinLeaves` stripped when that file was written, so importing one cannot put
back what the file never carried. Everything else in it comes across whole.
Publishing straight from the tracker is unaffected — it reads IndexedDB, which
has the full round.

### Getting your existing seasons in

Nothing migrates itself; the tracker still keeps its own copy in this browser
and works offline exactly as before. Publishing is a copy up, not a move.

- **A season you are running now.** Open it in the tracker, go to Setup →
  Publish to the site, give it a name and a short name, and hit Publish. Every
  imported round goes up with it.
- **A season that only exists as a file.** Same screen, *Import a file straight
  into the database* — it reads any export the suite has ever written,
  including the flat season files from before events existed, and puts it on the
  site without opening it in the tracker first.
- **A different machine.** Pull into the tracker brings a published event back
  down.

Unpublishing hides an event from the site without deleting it. Deleting removes
it from the database and leaves your browser's copy alone.

### Replays

A round can carry its replay (the overlay's `replay_<stamp>.csv`, plus its
`_arty.csv` when there is one), and the site shows it as the round's **Replay**
tab: the map, every player, the kill feed and the guns, scrubbed by time.

- **Attaching** is on Setup → Publish to the site, under **Replays**, for an
  event already in the database. Pick a night's files at once and each replay
  lands on the round that started when it did (both files record the round's
  start); a replay no round fits is named so you can attach it by hand from
  its row. Replays live only in the database — the tracker's own copy of a
  season never holds one.
- **Units, not just tags.** The replay's unit grouping uses the event's own
  units — pins, the unit list and renames, the same resolver the stats screens
  use — and falls back to the tag in a player's name only for someone it cannot
  place. In-game regiment and company come from the round's roster.
- **What is stored** is the quantized pose stream (positions to ~5 cm, headings
  to a degree or so, height dropped), deflated: around 1.5 MB for a half-hour
  round of 160 players, cut into ~1.5 MB chunks so no request nears the body
  cap. Chunk 0 goes up last, and a round only counts as having a replay once
  it lands.
- **The viewer is its own chunk**, loaded when someone opens the tab, and the
  map art sits in `public/assets`, fetched only then.
- **Analysis.** Under the map: win chance over the round, this round against
  past ones on the same ground, a company sheet, flag bearers and distance
  travelled, plus a heatmap (hover it for what happened there) and the line of
  contact as it moves. The win model trains itself on every round with a
  replay, across all events and seasons (`api/_lib/roundModel.js`,
  `GET /api/db/round-model`): a round's sample is worked out when its replay
  lands, and the model refits on the next read after its rounds change. It is
  the events' own model -- public rounds are played differently -- and it
  shows from the first round with a replay, saying how many it has learned
  from. Every scoreboard feeds it too, replay or not: each area's time limit,
  attacker, win rate and ticket pool per player (tickets lost when a side
  broke, from casualties by stance, over the server's population), and the
  "this ground" facts. With `PUBS_API_URL` set it starts from the PUBS
  dashboard's model instead of from nothing: the dashboard's area figures fill
  in areas events haven't settled, the fit leans on the dashboard's until events
  have rounds enough to pull it their own way, and the "this ground" history
  falls back to public rounds where events have none. Nothing flows back to
  the dashboard.

## Features

- **Week Management**: Create and manage weekly matches
- **Unit/Regiment Tracking**: Add and organize participating units
- **Team Rosters**: Assign units to teams for each week
- **Point System**: Configurable point system for wins, losses, and bonuses
- **Season Roster**: Add a unit, rename it across the whole event, and say whether it holds a standings token or plays as a guest
- **Team Balancer**: Weighted balancing of units across the two sides, with an optional skill-based post-season weight for playoffs
- **Round Types**: Regular, Single Round Leads, Playoffs, and Fun Round (exhibition — no points, no map cooldown, no Elo)
- **Season Simulator**: Generate a season of lead assignments, evenly spaced per unit, with spread analytics and a sheet-ready schedule export
- **Playoff Brackets**: Seeded knockout (any number of groups) or two-conference format, with group qualification and wildcards
- **Playoff Format Planner**: Audits the playoff settings you have and recommends the ones that fit your league and your remaining nights, one click to apply
- **Standings**: Real-time standings based on performance
- **Data Persistence**: Automatic saving to browser localStorage, and publishing to a database the public site reads
- **Import/Export**: Save and load season data as JSON files
- **Side Balancer**: A standalone split — paste the coord sheet, pin a unit or two to a side, get an even USA/CSA night — with no event behind it

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn

### Installation

1. Navigate to the season-tracker directory:
```bash
cd season-tracker
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser to the URL shown (typically http://localhost:5173)

## Usage

### Basic Workflow

1. **Add Units**: Enter regiment names on the Season roster screen
2. **Create Weeks**: Add weeks for your season schedule
3. **Assign Teams**: Select a week and assign units to Team A or Team B
4. **Set Leaders**: Choose lead units for each team
5. **Record Results**: Select round winners (Round 1 and Round 2)
6. **View Standings**: Check the real-time standings based on points

### Which Season You Land On

An event's seasons sit in the order they were created or imported, which isn't
the order they were played — import Season 4's file after Season 5's and the
older one ends up last in the list. So anywhere the tracker picks a season for
you, it goes by the number in the name instead:

- **Opening the tracker** activates the most recent season, whichever one was
  active when you closed the tab.
- **The stats screens** start scoped to that season rather than to Overall.
  **All seasons** is one click away in the header, next to the season's name.
- **A shared player-stats link** opens on the most recent season that has rounds
  bound to it, falling back to Overall when nothing is bound — an unbound
  scoreboard only ever shows under Overall.
- **New season** suggests one past the highest number in use, so adding to
  Seasons 2–4 offers "Season 5" rather than a second "Season 4".

Seasons whose names carry no number ("Preseason") fall back to list order.

### Side Balancer (public, no event needed)

`#/tools` carries a balancer that needs nothing behind it. Paste the coord sheet
— name, min, max, one unit a line — click a unit or two onto a side to hold them
there, and it splits the rest into an even USA/CSA night. A unit listed twice has
its numbers added together, and 0–0 men is a night off.

It runs the same engine the season balancer does, minus everything that needs a
season: no teammate history, no divisions, no Elo, no playoff pedigree. What is
left is how even the head counts are, how evenly the units are spread, and how
alike the two sides' min–max spreads look.

The company splitter sits on the same page.

### Balancer

The balancer splits the night from the **season roster**, not from the units you
have already placed — put the night's numbers in (paste the coord sheet, or type
min and max men per unit) and hit Balance.

- **0–0 men is a night off.** A unit with no men to field is left out of the
  split and off the night. Units with no count at all read as 0–0.
- **A unit already on a side stays on it.** It is counted in every metric —
  head count, teammate history, divisions, Elo — but never re-drawn; the rest of
  the pool is packed around it. Release one back into the pool from the balancer
  if you want it moved.
- **Forced pairs** still seed two units onto opposite sides before anything else
  is packed.

Applying an option writes the sides to the night. Anything sitting out comes off
it, and a lead or balance swap pointing at a unit that is no longer there is
cleared with it.

### Point System

Configure the point system in Settings:
- **Win Lead Points**: Points for leading unit on winning team
- **Win Assist Points**: Points for non-lead units on winning team
- **Loss Lead Points**: Points for leading unit on losing team
- **Loss Assist Points**: Points for non-lead units on losing team
- **2-0 Bonus Lead**: Bonus points for lead unit on 2-0 sweep
- **2-0 Bonus Assist**: Bonus points for assist units on 2-0 sweep
- **Balance Points**: Points for units moved to rebalance a round, awarded Per Night, Per Round, or Per Round (Loss Only) — the last awards only when the balanced unit ends up on the losing side

Point System settings — like the balancer weights and round types — are stored independently per season, so each season can be tuned on its own.

### Season Simulator

The overflow menu's **Simulate** builds a season's worth of weeks from a lead schedule:

- **Full Lead Weeks**: two units lead each night, both rounds each — so a night costs 2 lead slots
- **Lead Rounds**: four different units lead each night, one per side per round — a night costs 4 lead slots, and no unit ever leads both rounds of the same night
- **# of Lead Nights per Token Unit**: how many nights each unit leads. Weeks generated = token units × lead nights ÷ leads a night; any leftover slots mean that many units lead one night fewer, which the dialog calls out up front.
- Each unit's lead nights are spread as evenly across the season as the numbers allow, so everyone waits about the same time between leads. Repeat lead matchups and repeated lead pairings are avoided unless the spacing would suffer badly.
- **Schedule Only** stops at the leads — no teams, maps or results.

The summary popup afterwards reports season length, average/shortest/longest gap between a unit's leads against the ideal gap, a per-unit breakdown, and — when rounds were simulated — the lead vs assist point split. It also renders the schedule as a tab-separated block you can copy straight into a matchup sheet, or download as CSV.

### Which Night the Matchup Opens On

Night matchup opens on the **most recent night with a round entered**, not the
last one on the schedule. A season is built ahead of itself — the fixtures run
to a final long before they are played — so the last week is usually empty, and
opening on it shows a matchup that has not happened.

A season nobody has played yet falls back to its last night, so a brand-new one
still lands on something. The rule is `latestPlayedWeek` in
`stats/nightMatchup`, which is also where the schedule's played/unplayed flag
comes from — one definition of "this night happened", read by both.

### Playoffs on the public site

The public playoff screen draws the **projected** bracket, not just the nights
already played: who qualifies on the table as it sits, how they seed, and which
matchups that produces down to the final. It is the same seeding the tracker
runs — `utils/playoffBracket` — so a visitor and the owner see one bracket
rather than two that have to agree.

What it does not carry is the format planner. Choosing a bracket is the owner's
job; reading the one that was chosen is everybody's.

### Playoff Formats

Playoffs draw in one of two styles, set under **Bracket Style** (Stats → Playoffs):

- **Seeded Knockout** — every qualifier is reseeded 1–N on total points and paired 1-vs-N down the bracket, so seeds 1 and 2 can only meet in the final. An 8-team field is 1v8, 4v5, 2v7, 3v6 into quarterfinals, semifinals and a final. Fields of 4 to 16 all draw; anything short of a power of two gives the top seeds a first-round bye. **Groups only decide who gets in, not who plays whom**, so this works with any number of groups — three of five, five of three, or none at all.
- **Conference** — splits the field between two conferences, each crowning a winner before a championship. It needs exactly two conferences, which come from the first word of a division name, so "North Valley" and "North Ridge" are one conference.

With **Qualify Through Groups** on, each group sends its top N. Any remaining wildcard seats go to the best units left over — league-wide in a knockout, per-conference in a conference bracket.

### Playoff Format Planner

Turning on **Enable Playoff Tracking** opens a planner above the playoff picture. Tell it how many playoff nights the calendar can spare and it does two things:

- **Audits the settings you have.** What field they actually produce, which stages get drawn, how many nights that takes, and anything broken — a conference too small to draw, qualifiers that get a seed but never a matchup, units that group play shuts out.
- **Recommends formats that fit.** Up to three genuinely different brackets, each with its entry rule, field size, share of the league and length. **Apply** writes it straight into the settings.

Two facts about the tracker drive most of the advice:

- **A round hosts one matchup**, since each side has one lead, and a night is two rounds. So two matchups fit in a night, and that — not the number of stages — is what decides how long a bracket takes. An 8-team bracket is seven series; a 4-team one is three. Best-of-3 across an 8-team bracket runs 7–11 nights; single-round quarterfinals bring the same bracket down to 5–7.
- **"Rounds per match" is really first to (N ÷ 2) + 1 wins.** 2 and 3 are the same series: both need two wins, and both can run to a third round if the first two split. The planner labels these honestly and prefers the odd setting, which says what it means.

The **Rounds per Playoff Stage** inputs are labelled with the stages your current settings actually draw — Quarterfinals, Semifinals, Finals — rather than fixed names, so they read the way the bracket will.

Recommendations only include brackets the tracker draws whole, and prefer a field that fills every slot over one that hands out byes. A field it half-draws — where the standings promise a seed the bracket never plays — is never recommended, though the audit will explain it if you configure one by hand.

### Data Management

- **Export**: Download your season data as a JSON file
- **Import**: Load previously saved season data
- **Auto-Save**: Data automatically saves to browser localStorage

## Design Philosophy

This application follows the KISS (Keep It Simple, Stupid), DRY (Don't Repeat Yourself), SOLID, and YAGNI (You Aren't Gonna Need It) principles, matching the design patterns used in the Log Analyzer component.

## Technology Stack

- **React 19**: UI framework
- **Vite**: Build tool and dev server
- **Tailwind CSS 4**: Styling
- **Lucide React**: Icons
- **localStorage + IndexedDB**: What the tracker keeps in this browser
- **Neon (Postgres)**: What the public site reads, behind `/api/db`
- **PGlite**: Postgres in WebAssembly, for local development and tests

## Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## License

This project is part of the War of Rights Event Tracker suite.