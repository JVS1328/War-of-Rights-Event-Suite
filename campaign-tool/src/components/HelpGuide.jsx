import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Modal } from './ui/Primitives';

/**
 * The manual, printed as a pamphlet: a contents list in small caps, then one
 * ruled article per subject, each opening onto body text set in the reading
 * face. Which articles are shown depends on the campaign style.
 */
const HelpGuide = ({ isOpen, onClose, campaignStyle = 'standard' }) => {
  const isGrand = campaignStyle === 'grand';
  const [expandedSections, setExpandedSections] = useState({
    // Grand Campaign sections
    gcOverview: isGrand,
    gcSetup: false,
    gcTurn: false,
    gcMovement: false,
    gcCombat: false,
    gcReplenishGarrison: false,
    gcVictory: false,
    // Shared sections
    dispatch: false,
    // Legacy sections
    overview: !isGrand,
    howToPlay: false,
    orders: false,
    spSystem: false,
    battles: false,
    commanders: false,
    abilities: false,
    victory: false,
    tips: false,
  });

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  if (!isOpen) return null;

  /** The articles in the order they are set, for the contents list. */
  const contents = [
    ...(isGrand ? [
      ['gcOverview', 'The Grand Campaign'],
      ['gcSetup', 'Setup — the toss and the placing'],
      ['gcTurn', 'The turn — drawing and ending'],
      ['gcMovement', 'Movement — miles, rail and river'],
      ['gcCombat', 'Combat — attack, support, resolve'],
      ['gcReplenishGarrison', 'Replenishment and garrison'],
      ['gcVictory', 'Victory in the Grand Campaign'],
    ] : []),
    ['dispatch', 'The Turn Dispatch'],
    ['overview', isGrand ? 'Notes on the legacy campaign' : 'What the tracker is for'],
    ['howToPlay', 'How a campaign is played'],
    ['orders', 'Orders of the day'],
    ['spSystem', 'Supply points'],
    ['battles', 'Outcomes of battle'],
    ['commanders', 'Drawing for commanders'],
    ['abilities', 'Special abilities'],
    ['victory', 'Terms of victory'],
    ['tips', 'Advice to regiment leaders'],
  ];

  /** Open an article from the contents and bring it into view. */
  const openFromContents = (id) => {
    setExpandedSections(prev => ({ ...prev, [id]: true }));
    setTimeout(() => {
      document.getElementById(`guide-${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }, 0);
  };

  /** One article: a ruled heading that opens onto its body. */
  const Article = ({ id, title, children }) => {
    const open = !!expandedSections[id];
    return (
      <div id={`guide-${id}`} className="ui-line" data-open={open}>
        <button onClick={() => toggleSection(id)} className="ui-line-head">
          <span className="font-display text-[15px] uppercase tracking-[0.08em]">{title}</span>
          {open
            ? <ChevronDown className="w-4 h-4 text-ink-3 shrink-0" />
            : <ChevronRight className="w-4 h-4 text-ink-3 shrink-0" />}
        </button>
        {open && <div className="ui-line-body text-[14.5px] leading-relaxed">{children}</div>}
      </div>
    );
  };

  /** A run-in bold lead for a paragraph inside an article. */
  const Lead = ({ children }) => <p className="font-bold mt-3 first:mt-0">{children}</p>;

  return (
    <Modal
      title={isGrand ? 'Grand Campaign Guide' : 'Campaign Tracker Guide'}
      subtitle={isGrand
        ? 'Tabletop ruleset adaptation — tokens, movement, combat, victory'
        : 'For War of Rights regiment leaders'}
      width="max-w-3xl"
      onClose={onClose}
      footer={
        <button onClick={onClose} className="ui-btn ui-btn-primary ui-btn-block">
          Close the manual
        </button>
      }
    >
      {/* ── Contents ─────────────────────────────────────────────────── */}
      <nav className="mb-5 pb-3 border-b border-rule">
        <div className="ui-eyebrow mb-1">Contents</div>
        <div className="text-[14px]" style={{ fontVariant: 'small-caps', letterSpacing: '0.06em' }}>
          {contents.map(([id, label], i) => (
            <span key={id}>
              {i > 0 && <span className="text-ink-3"> · </span>}
              <button
                onClick={() => openFromContents(id)}
                className="text-ink-2 hover:text-ink underline decoration-paper-3 underline-offset-2"
              >
                {label}
              </button>
            </span>
          ))}
        </div>
      </nav>

      {isGrand && (
        <>
          <Article id="gcOverview" title="The Grand Campaign">
            <p>
              Grand Campaign adapts Maj. Tindall&apos;s tabletop ruleset to this app.
              Instead of territory-for-VP, both sides push <strong>tokens</strong> (1:1 with
              your regiments) around the Eastern Theatre map. Victory points come
              from <strong>capital captures</strong> and <strong>token wipes</strong>, not from owning ground.
              Territory colour is flavour: tokens sitting in a territory slowly
              shift its influence toward their side over months.
            </p>
            <p className="mt-3">
              Each side has a national <strong>treasury</strong> and <strong>manpower pool</strong>; both grow
              monthly per owned city. You will see the live figures and per-month
              adds in the sidebar turn tracker.
            </p>
            <p className="ui-hint mt-3">
              Every number here — starting strength, pool sizes, movement rates,
              casualty modifiers, VP to win — is tunable under Settings → Grand Campaign.
            </p>
          </Article>

          <Article id="gcSetup" title="Setup — the toss and the placing">
            <ol className="list-decimal pl-5 space-y-2">
              <li>Draw your map first: use <strong>Edit Map Features</strong> to drop cities,
                  forts, rail stations, railway polylines, and rivers.
                  Capitals get a ring. Railways must start at a city, fort,
                  or rail station and snap to anchors as you draw.</li>
              <li>Add one <strong>token</strong> per regiment, each side, using the sidebar.
                  Rename or edit at any time.</li>
              <li>Hit <strong>Begin Setup</strong>. A coin is flipped (heads the Union, tails the
                  Confederacy). The winner draws their first token from the bag and places it
                  by clicking the map — placement is restricted to friendly
                  territory. Sides alternate until every token is placed.</li>
              <li>Month 1 begins. The first drawer of each month flips between
                  sides — it is always the opposite of last month&apos;s starter.</li>
            </ol>
          </Article>

          <Article id="gcTurn" title="The turn — drawing and ending">
            <p>
              Each month, token tiles are drawn one at a time from their side&apos;s
              bag, alternating sides. Click <strong>Draw Next Token</strong> in the turn tracker
              to bring up that token for its turn. A token already in a pending
              battle is skipped to the discard pile.
            </p>
            <p className="mt-3">
              During a token&apos;s turn you may <strong>move</strong>, <strong>attack</strong>, <strong>board rail</strong>,
              <strong> embark river</strong>, <strong>disembark</strong>, <strong>replenish</strong>, <strong>garrison</strong>, or simply
              <strong> end</strong>. Each button only shows when the action is legal for that
              token&apos;s current situation.
            </p>
            <p className="mt-3">
              When both bags empty, the month rolls over: income ticks in,
              manpower regenerates per city, bags refill, and the first drawer
              flips sides. The calendar advances one month.
            </p>
          </Article>

          <Article id="gcMovement" title="Movement — miles, rail and river">
            <p>
              Every token has <strong>2 movement points</strong> per turn (tunable). Distances
              are shown in <strong>miles</strong>, with each mode granting a different rate per point.
              Click <strong>Move</strong> — a dashed ruler follows your cursor showing live
              distance, cost, and mode. Confirm by clicking the destination.
            </p>
            <p className="mt-3">
              <strong>March</strong> is the default. River crossings on a march add one point each.
              The ruler stays active between marches as long as you have points left.
            </p>
            <p className="mt-3">
              <strong>Rail</strong> and <strong>river</strong> movement are not automatic — they are <em>explicit</em>
              actions:
            </p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Board Rail</strong> — must be at a city, fort, or rail station that sits on
                  a railway. Ends the turn.</li>
              <li><strong>Embark River</strong> — must be adjacent to a river. Ends the turn.</li>
              <li>Once boarded, all movement is locked to that rail or river line
                  until you <strong>disembark</strong>. Trying to move off it shows a
                  &ldquo;must disembark first&rdquo; warning on the ruler.</li>
              <li><strong>Disembark</strong> drops you where you stopped and ends the turn.</li>
            </ul>
            <p className="ui-hint mt-3">
              You cannot attack from a train or a river — disembark first, then
              attack next turn.
            </p>
          </Article>

          <Article id="gcCombat" title="Combat — attack, support, resolve">
            <p>
              A token&apos;s <strong>Attack</strong> button appears when enemy tokens are within
              combat adjacency. The attack modal walks you through:
            </p>
            <ol className="list-decimal pl-5 space-y-2 mt-2">
              <li><strong>Target and supporters.</strong> Pick the defender; each side may optionally
                  add <strong>one</strong> supporter within support range (four tokens at most).</li>
              <li><strong>Terrain, weather, light.</strong> Weighted rolls based on the defender&apos;s
                  territory and campaign settings. Re-roll or override by hand.</li>
              <li><strong>Map pick and ban.</strong> Three maps are drawn from the rolled terrain&apos;s pool
                  (cooldown-aware). The defender bans one, the attacker picks one.</li>
            </ol>
            <p className="mt-3">
              The battle is now <strong>pending</strong> and the attacker&apos;s turn ends. Go and play
              War of Rights; when you return, open the battle from the returns of
              engagements and hit <strong>Resolve</strong>. You enter <em>raw</em> casualties; the tool
              applies modifiers (fatigue +5% a point, winter attacker +25%, train or river
              +15%) and subtracts the result from engaged tokens. Supporters
              absorb 40% of their side&apos;s total.
            </p>
            <p className="mt-3">
              <strong>Last Stand</strong> (100–500 manpower) applies automatically. A last-stand token
              caps enemy casualties at twice its strength; if it wins, it takes no
              casualties and retreats four march points. If it loses, it is wiped
              outright. Last-stand tokens cannot attack, reinforce, or capture.
            </p>
            <p className="mt-3">
              Losing the battle retreats the engaged token four march points toward
              its nearest friendly city or fort. A wipe (under 100 manpower) awards the
              enemy +2 VP and drops the token from the map — still visible in
              the roster, marked wiped.
            </p>
          </Article>

          <Article id="gcReplenishGarrison" title="Replenishment and garrison">
            <p>
              <strong>Replenish</strong> — only at a friendly city or fort. The modal buys men in
              blocks of a hundred, at a treasury and national manpower cost per block.
              A live preview shows the price, capped by whichever pool runs out first.
              Ends the turn.
            </p>
            <p className="mt-3">
              <strong>Garrison</strong> — at a friendly city or fort, detach up to 500 men from
              your token into the work, or recall them. Ends the turn. Under
              attack, the garrison absorbs defender casualties first and inflicts
              a hundred attacker casualties for every hundred garrison men.
            </p>
          </Article>

          <Article id="gcVictory" title="Victory in the Grand Campaign">
            <p>First side to <strong>10 VP</strong> wins (tunable). Points come from two events:</p>
            <ul className="list-disc pl-5 space-y-1 mt-2">
              <li><strong>Capital capture</strong> — walk an active token into an undefended
                  enemy capital. +2 VP and $750.</li>
              <li><strong>Token wipe</strong> — reduce an enemy token below 100 manpower. +2 VP.</li>
            </ul>
            <p className="ui-hint mt-3">
              Capital-capture points are re-awarded every time a capital flips sides,
              so retaking a lost capital pays again.
            </p>
          </Article>
        </>
      )}

      <Article id="dispatch" title="The Turn Dispatch">
        <p>
          The <strong>Dispatch</strong> button in the dateline reads a turn back
          as a period field report: the weather and light each battle was fought under, who led the attack,
          what it cost both sides in men and supply, what changed hands, and how the war looks heading
          into the next month.
        </p>
        <ul className="list-disc pl-5 space-y-1 mt-3">
          <li>It opens on its own when you {isGrand ? 'roll into a new month' : 'advance the turn'},
              showing the turn that just closed.</li>
          <li>Use the arrows in the footer to page back through earlier turns.</li>
          <li><strong>Copy for Discord</strong> puts the whole dispatch on your clipboard with its
              formatting intact, ready to paste into your campaign channel.</li>
          <li><strong>Copy + map link</strong> does the same and appends a share link to the live map,
              so readers can click through to the current state of the campaign.</li>
        </ul>
        <p className="ui-hint mt-3">
          The wording varies from battle to battle but never changes for the same battle, so a dispatch
          posted last week still matches what the tracker shows today.
        </p>
      </Article>

      <Article id="overview" title={isGrand ? 'Notes on the legacy campaign' : 'What the tracker is for'}>
        <p>
          The <strong>Campaign Tracker</strong> is a strategic layer over War of Rights events.
          It lets regiment leaders fight for control of territories across a campaign map, with each battle
          played in game affecting the wider situation.
        </p>
        <p className="mt-3">
          Think of it as a board game whose battles are resolved by actually playing War of Rights matches.
          Your regiment&apos;s performance in game decides whether you take or hold ground on the map.
        </p>
        <div className="ui-box mt-3">
          <div className="ui-eyebrow mb-1">The terms used</div>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Territories</strong> — regions on the map, each worth victory points</li>
            <li><strong>Supply points</strong> — the strategic resource spent fighting battles</li>
            <li><strong>Turns</strong> — campaign time advances in two-month steps</li>
            <li><strong>Victory</strong> — by draining the enemy&apos;s supply, holding every territory,
                or leading on points at the war&apos;s end</li>
          </ul>
        </div>
      </Article>

      <Article id="howToPlay" title="How a campaign is played">
        <Lead>1. Choose your target</Lead>
        <p>Select a territory to attack. You may attack neutral ground or enemy-held ground.
        Some campaigns require the target to be adjacent to your line.</p>

        <Lead>2. Play the battle</Lead>
        <p>Organise your War of Rights match. The attacking side picks the map from those available.
        Play the match and take down the result — who won, and the casualties on each side.</p>

        <Lead>3. Record the battle</Lead>
        <p>Use <strong>Record a battle</strong> to enter the result. The tracker works out the supply
        cost to both sides from the territory&apos;s value, the casualties, and the outcome.</p>

        <Lead>4. Advance the turn</Lead>
        <p>When the turn is done, advance it. That moves the campaign date forward two months,
        generates supply for each side from the territories they hold, reduces ability cooldowns,
        and opens the Turn Dispatch for the turn just closed, ready to copy into Discord.</p>
      </Article>

      <Article id="orders" title="Orders of the day">
        <p>
          Orders are given before the ground is chosen, not after it has been fought over.
          At the head of the turn each side writes one line on the sheet — what it intends,
          and what it is willing to spend on it — and only then does anyone look at the map.
        </p>

        <Lead>1. Write the order</Lead>
        <p>Each side takes exactly one action in a turn. <strong>Attack</strong> is the ordinary
        case. <strong>Defend</strong> means no attack is made at all, and a side that defends
        spends nothing. <strong>Declare a landing</strong> puts the transports to sea; see below.
        With the order goes the choice of whether to spend a use of the season&apos;s offensive
        doctrine on it, and whether to call on the standing order.</p>

        <Lead>2. Then choose the ground</Lead>
        <p>With the order written, the plate knows what is in reach and washes back everything
        that is not. Hold <strong>Ctrl</strong> over a region and the card says why. Your own
        ground is never a target, and beyond your own line the reasons run:</p>

        <div className="ui-box mt-3">
          <div className="ui-eyebrow mb-1">Why ground is out of reach</div>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Two steps beyond your line</strong>, or three, or more — an ordinary
                attack reaches one step and no further</li>
            <li><strong>Not connected to your line</strong> — there is no chain of regions
                leading to it at all</li>
            <li><strong>No water access</strong> — the only reach you had was by sea, and that
                region sits on neither a coast nor a major river</li>
          </ul>
          <p className="ui-hint mt-2">
            Where a different order would have reached it, the card says which: Foot Cavalry,
            Stuart&apos;s Ride, the Anaconda Plan, or a landing.
          </p>
        </div>

        <p className="ui-hint mt-3">
          All of this applies only while <strong>adjacency</strong> is required under Settings.
          Turn it off and everything but your own ground is in reach.
        </p>

        <Lead>3. The landing</Lead>
        <p>A landing takes two turns. Declare it on one turn — nothing else happens that turn,
        and the transports gather. On the <strong>next turn, and that turn only</strong>, you may
        attack any enemy or neutral region with water access, however far from your line, at the
        normal cost. The right lapses unused when the turn is out.</p>
        <p className="mt-3">
          A region taken that way has no friendly neighbour, so it is <strong>cut off</strong> and
          costs double to defend until your line reaches it. That is the ordinary supply rule, and
          it is the whole risk of landing.
        </p>
        <p className="mt-3">
          The Union&apos;s <strong>Anaconda Plan</strong> needs no declaration: it is the landing
          made at once, on any water region, at a quarter off, twice in a season. It may also be
          declared on a turn the Union already holds landing rights, which is how a landing is
          made cheaply.
        </p>

        <Lead>4. The override</Lead>
        <p>An admin may record a battle on ground the rules refuse. Double-click it on the plate,
        confirm, and the recorder opens with every region open to it. The engagement then carries
        <strong> reach overridden</strong> in the returns, so the ledger is honest about it. There
        is no switch for this beyond the adjacency setting — it is one battle at a time, on the
        record.</p>
      </Article>

      <Article id="spSystem" title="Supply points">
        <p>
          Supply stands for an army&apos;s strategic strength and its ability to wage war.
          Run out and you are beaten.
        </p>

        <div className="ui-box mt-3">
          <div className="ui-eyebrow mb-1">The point multiplier</div>
          <p>Supply costs scale with the value of the ground fought over:</p>
          <p className="bg-paper-2 p-2 mt-2 font-mono text-xs">
            multiplier = territory VP ÷ 5
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>5 VP — 1.0×</li>
            <li>7 VP — 1.4×</li>
            <li>10 VP — 2.0×</li>
            <li>12 VP — 2.4×</li>
            <li>15 VP — 3.0×</li>
            <li>20 VP — 4.0×</li>
          </ul>
          <p className="ui-hint mt-2">
            More valuable ground is harder to take and costlier to fight over. The figure
            scales smoothly for any custom value.
          </p>
        </div>

        <div className="ui-box mt-3">
          <div className="ui-eyebrow mb-1">What an attacker pays</div>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Attacking neutral ground:</strong> 50 base × multiplier × (your casualties ÷ total)</li>
            <li><strong>Attacking enemy ground:</strong> 75 base × multiplier × (your casualties ÷ total)</li>
          </ul>
          <p className="ui-hint mt-2">
            Attackers pay more because they are the aggressors and must commit more to take ground.
            Enemy ground costs more again, being fortified and defended.
          </p>
        </div>

        <div className="ui-box mt-3">
          <div className="ui-eyebrow mb-1">What a defender pays</div>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Defending your own ground:</strong> 25 base × multiplier × (your casualties ÷ total)</li>
            <li><strong>Defending neutral ground:</strong> 50 base × multiplier × (your casualties ÷ total)</li>
          </ul>
          <p className="ui-hint mt-2">
            Home ground is cheaper to hold — you have supply lines and works. Fighting away
            from home costs twice as much.
          </p>
        </div>

        <div className="ui-box mt-3">
          <div className="ui-eyebrow mb-1">The casualty ratio</div>
          <p>Both sides pay in proportion to the casualties they take:</p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Take half the total casualties, pay half the maximum cost</li>
            <li>Take four fifths, pay four fifths</li>
            <li>Win or lose, heavy casualties mean heavy supply losses</li>
          </ul>
          <p className="mt-2 text-mark font-bold">
            A pyrrhic victory still cripples a campaign.
          </p>
        </div>

        <div className="ui-box mt-3">
          <div className="ui-eyebrow mb-1">Supply generated</div>
          <p>Each turn you gain supply equal to the total victory points of the territories you hold.
          Holding valuable ground is what sustains a war effort.</p>
        </div>
      </Article>

      <Article id="battles" title="Outcomes of battle">
        <Lead>If the attacker wins</Lead>
        <ul className="list-disc pl-5 space-y-1">
          <li>The territory changes hands</li>
          <li>Victory points transfer at once, or gradually, depending on the settings</li>
          <li>Both sides pay supply on their casualties</li>
        </ul>

        <Lead>If the defender wins</Lead>
        <ul className="list-disc pl-5 space-y-1">
          <li>The territory stays with its owner</li>
          <li>If it was neutral it may pass to the defender, depending on the settings</li>
          <li>Both sides still pay supply on their casualties</li>
        </ul>

        <div className="ui-box mt-3">
          <div className="ui-eyebrow mb-1">Map cooldowns</div>
          <p>Once played, a map rests for two turns. That keeps the same battlefield
          from being fought over and over, and encourages variety.</p>
        </div>
      </Article>

      <Article id="commanders" title="Drawing for commanders">
        <p>
          Regiments entered under Settings form a commander pool for each side. You may draw for
          who leads a battle from two places, and both share the one pool:
        </p>

        <div className="ui-box mt-3">
          <div className="ui-eyebrow mb-1">On the campaign map</div>
          <p>
            The <strong>Battle Commanders</strong> panel beside the map draws for both sides
            ahead of time — useful for settling who commands the first map of the turn before
            anyone picks a target. Drawing takes that regiment out of the pool at once, and
            &ldquo;Set up the battle&rdquo; opens the recorder with both sides filled in.
          </p>
        </div>

        <div className="ui-box mt-3">
          <div className="ui-eyebrow mb-1">In the battle recorder</div>
          <p>
            The same draw appears while recording a battle. Anyone drawn on the map is
            already reserved; &ldquo;Change&rdquo; returns that regiment to the pool so you can draw or
            pick again.
          </p>
        </div>

        <div className="ui-box mt-3">
          <div className="ui-eyebrow mb-1">Rotation of the pool</div>
          <p>
            A regiment stays out of the pool until every other regiment on its side has had a
            turn. The pool then refills with the whole roster, including whoever just led —
            but they sit out the very next draw, so nobody commands two battles running.
            Editing the roster in Settings resets both pools and clears any pending draw.
          </p>
        </div>
      </Article>

      <Article id="abilities" title="Special abilities">
        <p>Each side has one ability that can turn the tide of a campaign:</p>

        <div className="ui-box mt-3">
          <div className="ui-eyebrow mb-1 text-union">Union — Special Orders 191</div>
          <p>Declared during an attack: if the Union wins, the Confederate defender pays
          <strong> three times the normal supply cost</strong>. It stands for the capture of the
          Confederate battle plans, as happened before Antietam.</p>
        </div>

        <div className="ui-box mt-3">
          <div className="ui-eyebrow mb-1 text-rebel">Confederate — Valley Supply Lines</div>
          <p>Declared during an attack: the Confederate attacker pays
          <strong> only half the normal supply cost</strong>. It stands for efficient use of the
          Shenandoah Valley for logistics.</p>
        </div>

        <p className="ui-hint mt-3">
          Abilities rest for two turns after use by default. Spend them well.
        </p>
      </Article>

      <Article id="victory" title="Terms of victory">
        <p>A campaign can end in three ways:</p>

        <div className="ui-box mt-3">
          <div className="ui-eyebrow mb-1">1. Supply exhausted — immediate</div>
          <p>If either side&apos;s supply falls to nothing, they lose on the spot. It stands for
          an army&apos;s collapse from exhaustion and attrition.</p>
        </div>

        <div className="ui-box mt-3">
          <div className="ui-eyebrow mb-1">2. Total control — immediate</div>
          <p>If one side holds every territory on the map, they win at once. Total conquest.</p>
        </div>

        <div className="ui-box mt-3">
          <div className="ui-eyebrow mb-1">3. The campaign runs out — December 1865</div>
          <p>If the campaign reaches its end date, the side with the most victory points wins.
          It stands for the political settlement at the war&apos;s end.</p>
        </div>
      </Article>

      <Article id="tips" title="Advice to regiment leaders">
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Husband your supply.</strong> An aggressive campaign drains it quickly. Balance
              attack against defence.</li>
          <li><strong>High-value ground matters.</strong> It is worth more in points and generates more
              supply each turn. Go for it.</li>
          <li><strong>Casualties cost supply.</strong> Even in victory, a heavy butcher&apos;s bill costs
              you more supply. Fight economically.</li>
          <li><strong>Spend abilities at the right moment.</strong> Do not waste them on minor
              affairs; keep them for the decisive one.</li>
          <li><strong>Export often.</strong> The export saves your campaign; the import restores or
              shares it.</li>
          <li><strong>Edit the map for custom campaigns.</strong> The map editor builds your own
              territory layout and point values.</li>
        </ul>

        <div className="ui-box mt-3">
          <div className="ui-eyebrow mb-1">On the plate</div>
          <ul className="list-disc pl-5 space-y-1">
            <li><span className="ui-kbd">Ctrl</span> — show a territory&apos;s particulars</li>
            <li><span className="ui-kbd">Ctrl</span> + click — pin those particulars open</li>
            <li>Double-click — record a battle on that ground</li>
            <li><span className="ui-kbd">Shift</span> + scroll — zoom the plate</li>
            <li><span className="ui-kbd">Shift</span> + drag — pan the plate</li>
          </ul>
        </div>
      </Article>
    </Modal>
  );
};

export default HelpGuide;
