import { useState, useEffect, useRef } from 'react';
import { Map, Trophy, Plus, Download, Upload, Settings, Swords, SkipForward, AlertCircle, Edit, HelpCircle, Share2, ScrollText } from 'lucide-react';
import MapView from './components/MapView';
import CampaignStats from './components/CampaignStats';
import TerritoryList from './components/TerritoryList';
import BattleHistory from './components/BattleHistory';
import BattleRecorder from './components/BattleRecorder';
import SettingsModal from './components/SettingsModal';
import MapEditor from './components/MapEditor';
import TerritoryEditor from './components/TerritoryEditor';
import HelpGuide from './components/HelpGuide';
import RegimentStats from './components/RegimentStats';
import TokenPanel from './components/TokenPanel';
import MapFeaturesPanel from './components/MapFeaturesPanel';
import SetupWizard from './components/SetupWizard';
import TurnTracker from './components/TurnTracker';
import InitiativeRoll from './components/InitiativeRoll';
import DoctrineDraft from './components/DoctrineDraft';
import MoveConfirmModal from './components/MoveConfirmModal';
import GrandBattleModal from './components/GrandBattleModal';
import GrandBattleResolveModal from './components/GrandBattleResolveModal';
import GarrisonModal from './components/GarrisonModal';
import ReplenishModal from './components/ReplenishModal';
import LSRetreatModal from './components/LSRetreatModal';
import CommanderRollPanel from './components/CommanderRollPanel';
import TurnSummary from './components/TurnSummary';
import { ScoreBoard } from './components/ui/Primitives';
import { ActionBar } from './components/ui/ActionBar';
import {
  isGrandCampaign,
  addToken as gcAddToken,
  renameToken as gcRenameToken,
  removeToken as gcRemoveToken,
  updateToken as gcUpdateToken,
  moveTokenTo as gcMoveTokenTo,
  addMapPoint as gcAddMapPoint,
  addMapLine as gcAddMapLine,
  updateMapFeature as gcUpdateMapFeature,
  removeMapFeature as gcRemoveMapFeature,
  resolveCoinFlip as gcResolveCoinFlip,
  drawNextSetupToken as gcDrawNextSetupToken,
  placeSetupToken as gcPlaceSetupToken,
  drawNextToken as gcDrawNextToken,
  endTokenTurn as gcEndTokenTurn,
  evaluateMove as gcEvaluateMove,
  performMove as gcPerformMove,
  createGCBattle as gcCreateBattle,
  resolveGCBattle as gcResolveBattle,
  performReplenish as gcPerformReplenish,
  performGarrison as gcPerformGarrison,
  performRecallGarrison as gcPerformRecallGarrison,
  findStrongholdAtToken as gcFindStrongholdAtToken,
  performBoardRail as gcPerformBoardRail,
  performBoardRiver as gcPerformBoardRiver,
  performDisembark as gcPerformDisembark,
  findRailwaySnap as gcFindRailwaySnap,
  performLSRetreat as gcPerformLSRetreat,
  inchesToMiles as gcInchesToMiles,
  distance as gcDistance,
  loadEasternTheatrePreset as gcLoadEasternTheatrePreset,
} from './utils/grandCampaignLogic';
import { createDefaultCampaign, createEasternTheatreCampaign, CAMPAIGN_TEMPLATES } from './data/defaultCampaign';
import {
  processBattleResult,
  processTransitioningTerritories,
  applyCommanderPoolUpdate,
  reserveCommander,
} from './utils/campaignLogic';
import { checkVictoryConditions } from './utils/victoryConditions';
import { advanceTurn as advanceCampaignDate, isCampaignOver } from './utils/dateSystem';
import { calculateCPGeneration } from './utils/cpSystem';
import { getTurnOrder } from './utils/initiative';
import { getMultiplier } from './utils/doctrines';
import { validateImportedCampaign, prepareCampaignExport, formatImportError } from './utils/campaignValidation';
import { generateShareUrl, generateShortShareUrl } from './utils/shareMap';

const STORAGE_KEY = 'WarOfRightsCampaignTracker';

const CampaignTracker = () => {
  // State management
  const [campaign, setCampaign] = useState(null);
  const [selectedTerritory, setSelectedTerritory] = useState(null);
  const [showBattleRecorder, setShowBattleRecorder] = useState(false);
  const [editingBattle, setEditingBattle] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showVictory, setShowVictory] = useState(null);
  const [showMapEditor, setShowMapEditor] = useState(false);
  const [showHelpGuide, setShowHelpGuide] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [battleRecorderInitialTerritory, setBattleRecorderInitialTerritory] = useState(null);
  const [territoryEditorTarget, setTerritoryEditorTarget] = useState(null);

  // Turn Dispatch — the end-of-turn write-up. Holds the turn being read, or
  // null when the dispatch is closed.
  const [summaryTurn, setSummaryTurn] = useState(null);
  const lastSeenTurnRef = useRef(null);

  // One hidden file input, driven by the Import action wherever it renders.
  const importInputRef = useRef(null);

  // Grand Campaign: which token (if any) is currently in "click-to-place" mode
  const [moveModeTokenId, setMoveModeTokenId] = useState(null);

  // Grand Campaign: feature-edit mode state. `featureEditMode` is a top-level
  // boolean that swaps the sidebar; `featureTool` is the currently selected
  // placement tool (city/fort/station/railway/river). `lineDraft` accumulates
  // points for in-progress railways/rivers.
  const [featureEditMode, setFeatureEditMode] = useState(false);
  const [featureTool, setFeatureTool] = useState(null);
  const [featurePointSide, setFeaturePointSide] = useState('USA');
  const [featurePointIsCapital, setFeaturePointIsCapital] = useState(false);
  const [lineDraft, setLineDraft] = useState([]);

  // Grand Campaign setup wizard state
  const [showSetupWizard, setShowSetupWizard] = useState(false);
  const [setupError, setSetupError] = useState(null);

  // Grand Campaign in-turn movement state. When a token's turn is active the
  // user can click "Move", which enters targeting mode; the next valid map
  // click computes an evaluation and pops the MoveConfirmModal.
  const [turnMoveActive, setTurnMoveActive] = useState(false);
  const [pendingMove, setPendingMove] = useState(null); // { evaluation, destination }

  // Grand Campaign combat modals
  const [showBattleModal, setShowBattleModal] = useState(false);
  const [resolvingBattleId, setResolvingBattleId] = useState(null);

  // Grand Campaign garrison modal
  const [showGarrisonModal, setShowGarrisonModal] = useState(false);
  // Grand Campaign replenish modal
  const [showReplenishModal, setShowReplenishModal] = useState(false);
  // Grand Campaign "may retreat" prompt for last-stand winners.
  // lsRetreat: { tokenId, maxMP } | null — modal open
  // lsRetreatPicking: { tokenId, maxMP } | null — map-click picking mode
  const [lsRetreat, setLSRetreat] = useState(null);
  const [lsRetreatPicking, setLSRetreatPicking] = useState(null);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setCampaign(JSON.parse(saved));
      } catch (error) {
        console.error('Error loading campaign:', error);
        setCampaign(createDefaultCampaign());
      }
    } else {
      setCampaign(createDefaultCampaign());
    }
  }, []);

  // Save to localStorage on campaign changes
  useEffect(() => {
    if (campaign) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(campaign));
      
      // Check victory conditions
      const victory = checkVictoryConditions(campaign);
      if (victory && !showVictory) {
        setShowVictory(victory);
      }
    }
  }, [campaign]);

  // Grand Campaign months roll over on their own once both bags are empty, so
  // there's no "Advance Turn" click to hang the dispatch off. Watch the turn
  // counter instead and open the write-up for the month that just closed.
  useEffect(() => {
    if (!campaign) return;
    const turn = campaign.currentTurn;
    const previous = lastSeenTurnRef.current;
    lastSeenTurnRef.current = turn;
    if (previous != null && turn === previous + 1 && isGrandCampaign(campaign)) {
      setSummaryTurn(previous);
    }
  }, [campaign]);

  // Core methods
  const recordBattle = (battleData) => {
    if (!campaign) return;

    const battle = { ...battleData };

    if (battle.status === 'pending') {
      // Pending battle: add to history and update commander pool, but no territory/VP/CP processing
      const updatedCampaign = applyCommanderPoolUpdate({
        ...campaign,
        battles: [...campaign.battles, battle]
      }, battle);
      setCampaign(updatedCampaign);
    } else {
      // Completed battle: process territory changes, VP, CP
      const updatedCampaign = processBattleResult(campaign, battle);
      setCampaign(updatedCampaign);
    }

    setShowBattleRecorder(false);
    setEditingBattle(null);
    setBattleRecorderInitialTerritory(null);
  };

  const updateBattle = (battleData) => {
    if (!campaign) return;

    const battle = { ...battleData };
    const oldBattle = campaign.battles.find(b => b.id === battle.id);
    if (!oldBattle) return;

    const wasPending = oldBattle.status === 'pending' || !oldBattle.winner;
    const isNowCompleted = battle.status === 'completed' && battle.winner;

    if (wasPending && isNowCompleted) {
      // Pending → completed: process territory/VP/CP changes now
      const campaignWithoutOld = {
        ...campaign,
        battles: campaign.battles.filter(b => b.id !== battle.id)
      };
      // The pool was already updated when this battle was saved as pending.
      const updatedCampaign = processBattleResult(campaignWithoutOld, battle, {
        skipCommanderPool: true
      });
      setCampaign(updatedCampaign);
    } else {
      // Metadata-only update (casualties, notes, etc.) or still pending
      const updatedBattles = campaign.battles.map(b =>
        b.id === battle.id ? { ...b, ...battle } : b
      );
      setCampaign({ ...campaign, battles: updatedBattles });
    }

    setShowBattleRecorder(false);
    setEditingBattle(null);
    setBattleRecorderInitialTerritory(null);
  };

  /**
   * Roll / pick / clear the commander who will lead a side in the next
   * battle. Reserving pulls the regiment out of that side's pool right away
   * and pre-selects it in the Battle Recorder; clearing puts it back.
   */
  const handleReserveCommander = (side, regiment) => {
    setCampaign(c => (c ? reserveCommander(c, side, regiment) : c));
  };

  const handleEditBattle = (battle) => {
    // Grand Campaign battles use the dedicated resolve modal instead of the
    // standard BattleRecorder.
    if (battle?.mode === 'grand') {
      if (battle.status === 'pending') {
        setResolvingBattleId(battle.id);
      }
      return;
    }
    setEditingBattle(battle);
    setShowBattleRecorder(true);
  };

  const advanceTurn = () => {
    if (!campaign) return;
    
    if (!confirm(`Advance to Turn ${campaign.currentTurn + 1}?`)) return;

    // Create updated campaign object
    const updatedCampaign = { ...campaign };
    
    // Advance turn counter
    updatedCampaign.currentTurn = campaign.currentTurn + 1;

    // === DATE SYSTEM ===
    // Advance campaign date by 2 months
    if (campaign.campaignDate) {
      updatedCampaign.campaignDate = advanceCampaignDate(campaign.campaignDate);
      
      // Check if campaign has ended
      if (isCampaignOver(updatedCampaign.campaignDate)) {
        alert('Campaign has reached its end date (December 1865)!');
      }
    }

    // === CP GENERATION (if enabled) ===
    if (campaign.cpSystemEnabled) {
      // Calculate VP from controlled territories. Income scales with
      // incomePerVP so it keeps pace when ticket costs raise the SP scale.
      const cpGeneration = calculateCPGeneration(
        campaign.territories,
        campaign.settings?.incomePerVP ?? 1,
        {
          USA: getMultiplier(campaign, 'USA', 'incomeMultUrban'),
          CSA: getMultiplier(campaign, 'CSA', 'incomeMultUrban'),
        }
      );

      // Add CP to each side's pool
      updatedCampaign.combatPowerUSA = (campaign.combatPowerUSA || 0) + cpGeneration.usa;
      updatedCampaign.combatPowerCSA = (campaign.combatPowerCSA || 0) + cpGeneration.csa;

      // Add CP history entries
      const cpHistory = [...(campaign.cpHistory || [])];

      // USA CP generation
      if (cpGeneration.usa > 0) {
        cpHistory.push({
          turn: updatedCampaign.currentTurn,
          date: new Date().toISOString(),
          action: 'Turn Generation',
          side: 'USA',
          cpChange: cpGeneration.usa,
          newBalance: updatedCampaign.combatPowerUSA
        });
      }

      // CSA CP generation
      if (cpGeneration.csa > 0) {
        cpHistory.push({
          turn: updatedCampaign.currentTurn,
          date: new Date().toISOString(),
          action: 'Turn Generation',
          side: 'CSA',
          cpChange: cpGeneration.csa,
          newBalance: updatedCampaign.combatPowerCSA
        });
      }

      updatedCampaign.cpHistory = cpHistory;
    }

    // === PROCESS TERRITORY TRANSITIONS ===
    // Progress any territories in capture transition state
    const campaignWithTransitions = processTransitioningTerritories(updatedCampaign);

    // === REDUCE ABILITY COOLDOWNS ===
    if (campaignWithTransitions.abilities) {
      // Reduce cooldowns for all abilities
      ['USA', 'CSA'].forEach(side => {
        if (campaignWithTransitions.abilities[side] && campaignWithTransitions.abilities[side].cooldown > 0) {
          campaignWithTransitions.abilities[side] = {
            ...campaignWithTransitions.abilities[side],
            cooldown: Math.max(0, campaignWithTransitions.abilities[side].cooldown - 1)
          };
        }
      });
    }

    setCampaign(campaignWithTransitions);

    // The turn that just closed is the one worth reading about.
    setSummaryTurn(campaign.currentTurn);
  };

  const newCampaign = () => {
    if (!confirm('Start a new campaign? This will clear all current data. Make sure to export first!')) {
      return;
    }
    setShowTemplateSelector(true);
  };

  const handleTemplateSelect = (templateKey) => {
    const template = CAMPAIGN_TEMPLATES[templateKey];
    if (template) {
      const fresh = template.create();
      setCampaign(fresh);
      setSelectedTerritory(null);
      setShowVictory(null);
    }
    setShowTemplateSelector(false);
  };

  const handleMapEditorSave = (modifiedTerritories) => {
    if (!campaign) return;

    // Calculate new VP totals based on modified territories
    let vpUSA = 0;
    let vpCSA = 0;
    
    modifiedTerritories.forEach(territory => {
      if (territory.owner === 'USA') {
        vpUSA += territory.victoryPoints;
      } else if (territory.owner === 'CSA') {
        vpCSA += territory.victoryPoints;
      }
    });

    // Update campaign with modified territories while preserving battle history
    setCampaign({
      ...campaign,
      territories: modifiedTerritories,
      victoryPointsUSA: vpUSA,
      victoryPointsCSA: vpCSA
    });
    
    setSelectedTerritory(null);
    setShowMapEditor(false);
  };

  const handleMapEditorClose = () => {
    setShowMapEditor(false);
    // If no campaign exists, create default one
    if (!campaign) {
      const fresh = createDefaultCampaign();
      setCampaign(fresh);
    }
  };

  const editCampaignMap = () => {
    if (!confirm('Edit campaign map? You can modify territories, VP values, and ownership. Battle history will be preserved.')) {
      return;
    }
    setShowMapEditor(true);
  };

  const exportCampaign = () => {
    if (!campaign) return;

    // Prepare campaign data with version and metadata
    const data = prepareCampaignExport(campaign);

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `campaign-${campaign.name.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const importCampaign = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);

        // Comprehensive validation of campaign state
        const validation = validateImportedCampaign(data);

        if (!validation.success) {
          alert(formatImportError(validation.error));
          return;
        }

        // Import successful - update campaign state and reset UI
        setCampaign(validation.campaign);
        setSelectedTerritory(null);
        setShowVictory(null);
        setShowBattleRecorder(false);
        setShowSettings(false);
        setShowMapEditor(false);

        alert('Campaign imported successfully!');
      } catch (error) {
        alert(formatImportError(`JSON parsing error: ${error.message}`));
      }
    };
    reader.readAsText(file);

    // Reset file input to allow re-importing the same file
    event.target.value = '';
  };

  /** Short share link when the server answers, long client-only link if not. */
  const buildShareLink = async () => {
    try {
      return await generateShortShareUrl(campaign);
    } catch {
      // Server unavailable — fall back to client-only long URL
      return generateShareUrl(campaign);
    }
  };

  const shareCampaignMap = async () => {
    if (!campaign) return;

    const url = await buildShareLink();

    try {
      await navigator.clipboard.writeText(url);
      alert('Share link copied to clipboard! Anyone with this link can view your campaign map.');
    } catch {
      prompt('Copy this link to share your campaign map:', url);
    }
  };

  const saveSettings = (newSettings) => {
    if (!campaign) return;

    // Extract campaign name, regiments, terrain groups, viz, GC settings, and standard settings
    const { name, regiments, terrainGroups, terrainViz, gcSettings, ...settings } = newSettings;

    // Persist terrain groups & visualization config inside settings
    if (terrainGroups) {
      settings.terrainGroups = terrainGroups;
    }
    if (terrainViz) {
      settings.terrainViz = terrainViz;
    }

    // Update commander pool when regiments change
    const updatedCampaign = {
      ...campaign,
      name: name,
      settings: settings
    };

    // Grand Campaign: merge edited gcSettings into campaign.grandCampaign.settings
    if (gcSettings && campaign.grandCampaign) {
      updatedCampaign.grandCampaign = {
        ...campaign.grandCampaign,
        settings: { ...campaign.grandCampaign.settings, ...gcSettings },
      };
    }

    // Update regiments if provided
    if (regiments) {
      updatedCampaign.regiments = regiments;

      // Reset commander pools to include all regiments
      updatedCampaign.commanderPool = {
        USA: regiments.USA.map(r => r.id),
        CSA: regiments.CSA.map(r => r.id)
      };

      // The roster changed, so any pre-rolled commander is void (its regiment
      // is back in the refreshed pool above) and nobody is benched.
      updatedCampaign.pendingCommanders = { USA: null, CSA: null };
      updatedCampaign.benchedCommanders = { USA: null, CSA: null };
    }

    setCampaign(updatedCampaign);
    setShowSettings(false);
  };

  // === Grand Campaign handlers ===
  const handleAddToken = (payload) => setCampaign(c => gcAddToken(c, payload));
  const handleRenameToken = (tokenId, newName) => setCampaign(c => gcRenameToken(c, tokenId, newName));
  const handleRemoveToken = (tokenId) => {
    setCampaign(c => gcRemoveToken(c, tokenId));
    if (moveModeTokenId === tokenId) setMoveModeTokenId(null);
  };
  const handleUpdateToken = (tokenId, patch) => setCampaign(c => gcUpdateToken(c, tokenId, patch));
  const handleEnterMoveMode = (tokenId) => setMoveModeTokenId(tokenId);
  const handleCancelMoveMode = () => setMoveModeTokenId(null);
  const handleMapPlaceClick = (point) => {
    // Last-stand winner is picking a retreat destination.
    if (isGC && lsRetreatPicking) {
      handleLSRetreatClick({ x: point.x, y: point.y });
      return;
    }
    // In-turn movement targeting has priority whenever a move is being
    // chosen for the currently-drawn token.
    if (isGC && turnMoveActive && campaign.grandCampaign.currentTokenId) {
      const evaluation = gcEvaluateMove(campaign, campaign.grandCampaign.currentTokenId, { x: point.x, y: point.y });
      if (!evaluation.valid) {
        // The ruler chip is already showing the reason in red — don't
        // interrupt the player with a modal popup. Silently ignore.
        return;
      }
      setPendingMove({ evaluation, destination: { x: point.x, y: point.y } });
      return;
    }
    // Grand Campaign setup placement takes highest priority when active.
    if (isGC && campaign.grandCampaign.phase === 'setup-placement') {
      // Need the territory at the click point (supplied by MapView as point.territoryId).
      const territory = point.territoryId
        ? campaign.territories.find(t => t.id === point.territoryId)
        : null;
      const owner = territory?.owner || null;
      const result = gcPlaceSetupToken(campaign, { x: point.x, y: point.y }, owner);
      if (result.error) {
        setSetupError(result.error);
      } else {
        setSetupError(null);
        setCampaign(result.campaign);
      }
      return;
    }
    // Priority 1: placing a token in move mode
    if (moveModeTokenId) {
      setCampaign(c => gcMoveTokenTo(c, moveModeTokenId, point));
      setMoveModeTokenId(null);
      return;
    }
    // Priority 2: placing a map feature via the current tool
    if (featureTool === 'city' || featureTool === 'fort' || featureTool === 'station') {
      setCampaign(c => gcAddMapPoint(c, {
        kind: featureTool,
        x: point.x,
        y: point.y,
        side: featurePointSide,
        isCapital: featurePointIsCapital,
      }));
      // Stay in tool so user can drop multiple points in sequence.
      return;
    }
    if (featureTool === 'railway') {
      // Railways must *start* at a city / fort / rail station. Subsequent
      // points auto-snap to nearby anchors or other rail endpoints if the
      // cursor is close enough — otherwise the raw click is used.
      const snap = gcFindRailwaySnap(campaign, { x: point.x, y: point.y });
      const isFirstPoint = lineDraft.length === 0;
      if (isFirstPoint) {
        if (!snap?.isAnchor) {
          alert('Railways must start at a City, Fort, or Rail Station. Click one to begin.');
          return;
        }
        setLineDraft([{ x: snap.x, y: snap.y }]);
        return;
      }
      const next = snap ? { x: snap.x, y: snap.y } : { x: point.x, y: point.y };
      setLineDraft(prev => [...prev, next]);
      return;
    }
    if (featureTool === 'river') {
      setLineDraft(prev => [...prev, { x: point.x, y: point.y }]);
      return;
    }
  };

  // === Setup wizard handlers ===
  const handleOpenSetupWizard = () => {
    if (!isGC) return;
    // Reset any edit modes so the map is free for setup clicks.
    setMoveModeTokenId(null);
    setFeatureEditMode(false);
    setFeatureTool(null);
    setLineDraft([]);
    setShowSetupWizard(true);
  };
  const handleCloseSetupWizard = () => setShowSetupWizard(false);
  const handleCoinFlipCommit = (winner) => {
    // resolveCoinFlip populates bags; then immediately draw the first token.
    const withFlip = gcResolveCoinFlip(campaign, winner);
    const drawn = gcDrawNextSetupToken(withFlip);
    setCampaign(drawn);
    setSetupError(null);
  };

  // === Turn-machine handlers (phase: 'playing') ===
  const handleDrawNextToken = () => setCampaign(c => gcDrawNextToken(c));
  const handleEndTokenTurn = () => {
    // End the current token's turn, then immediately draw the next one.
    setCampaign(c => gcDrawNextToken(gcEndTokenTurn(c)));
    setTurnMoveActive(false);
    setPendingMove(null);
  };

  // === Replenishment / garrison handlers ===
  const handleOpenReplenish = () => setShowReplenishModal(true);
  const handleCloseReplenish = () => setShowReplenishModal(false);
  const handleConfirmReplenish = (men) => {
    const tokenId = campaign.grandCampaign.currentTokenId;
    if (!tokenId) return;
    const result = gcPerformReplenish(campaign, tokenId, men);
    if (result.error) {
      alert(`Cannot replenish: ${result.error}`);
      return;
    }
    // Replenish ends turn; immediately draw next token.
    setCampaign(c => gcDrawNextToken(gcEndTokenTurn(result.campaign)));
    setTurnMoveActive(false);
    setShowReplenishModal(false);
  };
  const handleOpenGarrison = () => setShowGarrisonModal(true);
  const handleCloseGarrison = () => setShowGarrisonModal(false);
  const handleGarrisonAction = (featureId, men) => {
    const tokenId = campaign.grandCampaign.currentTokenId;
    const result = gcPerformGarrison(campaign, tokenId, featureId, men);
    if (result.error) { alert(`Cannot garrison: ${result.error}`); return; }
    setCampaign(c => gcDrawNextToken(gcEndTokenTurn(result.campaign)));
    setShowGarrisonModal(false);
    setTurnMoveActive(false);
  };
  const handleRecallAction = (featureId, men) => {
    const tokenId = campaign.grandCampaign.currentTokenId;
    const result = gcPerformRecallGarrison(campaign, tokenId, featureId, men);
    if (result.error) { alert(`Cannot recall: ${result.error}`); return; }
    setCampaign(c => gcDrawNextToken(gcEndTokenTurn(result.campaign)));
    setShowGarrisonModal(false);
    setTurnMoveActive(false);
  };

  // === Combat handlers ===
  const handleOpenAttack = () => {
    setTurnMoveActive(false);
    setShowBattleModal(true);
  };
  const handleCreateBattle = (payload) => {
    setCampaign(c => gcCreateBattle(c, payload));
    setShowBattleModal(false);
    // Attacker turn ended inside createGCBattle; immediately draw next.
    setTimeout(() => setCampaign(c => gcDrawNextToken(c)), 0);
  };
  const handleOpenResolveBattle = (battle) => {
    if (battle?.mode === 'grand' && battle.status === 'pending') {
      setResolvingBattleId(battle.id);
    } else {
      // Legacy battle — delegate to existing handler
      handleEditBattle(battle);
    }
  };
  const handleResolveBattle = (payload) => {
    if (!resolvingBattleId) return;
    const result = gcResolveBattle(campaign, resolvingBattleId, payload);
    if (result.error) {
      alert(result.error);
      return;
    }
    setCampaign(result.campaign);
    setResolvingBattleId(null);
    // If a last-stand winner is eligible to retreat, queue the prompt. The
    // modal lets the player choose to skip, auto-retreat to the nearest
    // friendly stronghold, or pick a destination on the map within range.
    if (result.mayRetreat) {
      setLSRetreat(result.mayRetreat);
    }
  };

  // === Last-stand retreat handlers ===
  const handleLSRetreatSkip = () => setLSRetreat(null);
  const handleLSRetreatAuto = () => {
    if (!lsRetreat) return;
    // Reuse the shared retreat helper by funnelling through a tiny inline
    // retreat — applyRetreat lives inside grandCampaignLogic but isn't
    // exported. Instead we auto-pick the nearest friendly stronghold and
    // call performLSRetreat targeted there.
    const gc = campaign.grandCampaign;
    const token = gc.tokens.find(t => t.id === lsRetreat.tokenId);
    if (!token) { setLSRetreat(null); return; }
    const strongholds = [
      ...gc.mapFeatures.cities.filter(c => c.side === token.side),
      ...gc.mapFeatures.forts.filter(f => f.side === token.side),
    ];
    if (strongholds.length === 0) { setLSRetreat(null); return; }
    const nearest = strongholds.reduce((best, s) =>
      !best || gcDistance(token.position, s) < gcDistance(token.position, best) ? s : best
    , null);
    // Walk as far as retreat range permits along the direct line.
    const maxInches = lsRetreat.maxMP * gc.settings.marchInchesPerMP;
    const maxSvg = maxInches * (gc.settings.svgUnitsPerInch || 10);
    const dx = nearest.x - token.position.x;
    const dy = nearest.y - token.position.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const step = Math.min(d, maxSvg);
    const dest = d === 0
      ? { x: token.position.x, y: token.position.y }
      : { x: token.position.x + (dx / d) * step, y: token.position.y + (dy / d) * step };
    const result = gcPerformLSRetreat(campaign, lsRetreat.tokenId, dest, lsRetreat.maxMP);
    if (!result.error) setCampaign(result.campaign);
    setLSRetreat(null);
  };
  const handleLSRetreatPickSpot = () => {
    if (!lsRetreat) return;
    setLSRetreatPicking(lsRetreat);
    setLSRetreat(null);
  };
  const handleLSRetreatClick = (point) => {
    if (!lsRetreatPicking) return;
    const result = gcPerformLSRetreat(campaign, lsRetreatPicking.tokenId, point, lsRetreatPicking.maxMP);
    if (result.error) {
      // The ruler chip already tells the user — silent no-op.
      return;
    }
    setCampaign(result.campaign);
    setLSRetreatPicking(null);
  };

  // === Board / disembark handlers (all end the turn) ===
  const chainEndAndDraw = (updated) => {
    setCampaign(c => gcDrawNextToken(gcEndTokenTurn(updated)));
    setTurnMoveActive(false);
    setPendingMove(null);
  };
  const handleBoardRail = () => {
    const tokenId = campaign.grandCampaign.currentTokenId;
    if (!tokenId) return;
    const result = gcPerformBoardRail(campaign, tokenId);
    if (result.error) { alert(`Cannot board: ${result.error}`); return; }
    chainEndAndDraw(result.campaign);
  };
  const handleBoardRiver = () => {
    const tokenId = campaign.grandCampaign.currentTokenId;
    if (!tokenId) return;
    const result = gcPerformBoardRiver(campaign, tokenId);
    if (result.error) { alert(`Cannot embark: ${result.error}`); return; }
    chainEndAndDraw(result.campaign);
  };
  const handleDisembark = () => {
    const tokenId = campaign.grandCampaign.currentTokenId;
    if (!tokenId) return;
    const result = gcPerformDisembark(campaign, tokenId);
    if (result.error) { alert(`Cannot disembark: ${result.error}`); return; }
    chainEndAndDraw(result.campaign);
  };

  // === In-turn movement handlers ===
  const handleBeginMove = () => {
    if (turnMoveActive) {
      setTurnMoveActive(false);
      setPendingMove(null);
    } else {
      setTurnMoveActive(true);
    }
  };
  const handleCancelPendingMove = () => setPendingMove(null);
  const handleConfirmMove = () => {
    if (!pendingMove) return;
    const tokenId = campaign.grandCampaign.currentTokenId;
    const result = gcPerformMove(campaign, tokenId, pendingMove.destination);
    if (result.error) {
      alert(result.error);
      return;
    }
    setCampaign(result.campaign);
    setPendingMove(null);
    // Keep the ruler / move mode open if the token still has MP (ruler
    // updates live on the map). Only close when MP is exhausted, the turn
    // was forcibly ended (capture), or a capture flow is kicking in.
    if (result.turnEnds || (result.mpRemaining ?? 0) <= 0) {
      setTurnMoveActive(false);
    }
    if (result.capture) {
      const { feature, isCapital, payout, vpDelta } = result.capture;
      const msg = isCapital
        ? `Captured capital ${feature.name}! +$${payout}, +${vpDelta} VP.`
        : `Captured ${feature.name}! +$${payout}.`;
      alert(msg);
      setTimeout(() => setCampaign(c => gcDrawNextToken(gcEndTokenTurn(c))), 0);
    }
  };

  // === Feature edit mode handlers ===
  const enterFeatureEditMode = () => {
    setFeatureEditMode(true);
    setMoveModeTokenId(null); // don't mix modes
  };
  const exitFeatureEditMode = () => {
    setFeatureEditMode(false);
    setFeatureTool(null);
    setLineDraft([]);
  };
  const handleSelectTool = (tool) => {
    setFeatureTool(tool);
    setLineDraft([]); // reset draft when switching tools
  };
  const handleFinishLine = () => {
    if (!featureTool || lineDraft.length < 2) return;
    setCampaign(c => gcAddMapLine(c, { kind: featureTool, points: lineDraft }));
    setLineDraft([]);
  };
  const handleCancelLine = () => setLineDraft([]);
  const handleUndoLinePoint = () => setLineDraft(d => d.slice(0, -1));
  const handleUpdateFeature = (id, patch) => setCampaign(c => gcUpdateMapFeature(c, id, patch));
  const handleRemoveFeature = (id) => setCampaign(c => gcRemoveMapFeature(c, id));

  /** Fetch the county GeoJSON and overwrite the map with the historical preset. */
  const handleLoadPreset = async () => {
    if (!isGC) return;
    const mf = campaign.grandCampaign.mapFeatures;
    const hasExisting =
      mf.cities.length || mf.forts.length || mf.stations.length ||
      mf.railways.length || mf.rivers.length;
    if (hasExisting && !confirm(
      'Replace ALL current map features with the historical Eastern Theatre preset?\n' +
      'Capitals, cities, forts, stations, railways, and rivers will be overwritten.'
    )) return;
    try {
      const next = await gcLoadEasternTheatrePreset(campaign);
      setCampaign(next);
    } catch (e) {
      alert(`Could not load preset: ${e.message || e}`);
    }
  };

  const handleTerritoryClick = (territory) => {
    setSelectedTerritory(prev => prev?.id === territory.id ? null : territory);
  };

  const handleTerritoryDoubleClick = (territory) => {
    setSelectedTerritory(territory);
    setEditingBattle(null);
    setBattleRecorderInitialTerritory(territory.id);
    setShowBattleRecorder(true);
  };

  const handleTerritoryCtrlDoubleClick = (territory) => {
    setTerritoryEditorTarget(territory);
  };

  const handleTerritoryEditorSave = (updatedTerritory) => {
    setCampaign(prev => ({
      ...prev,
      territories: prev.territories.map(t =>
        t.id === updatedTerritory.id ? { ...t, ...updatedTerritory } : t
      ),
    }));
    setTerritoryEditorTarget(null);
  };

  if (!campaign) {
    return (
      <div className="app-shell grid place-items-center">
        <div className="text-mist-400 text-sm">Loading campaign…</div>
      </div>
    );
  }

  const isGC = isGrandCampaign(campaign);
  const gcTokens = isGC ? campaign.grandCampaign.tokens : null;
  const gcMapFeatures = isGC ? campaign.grandCampaign.mapFeatures : null;
  const gcPhase = isGC ? campaign.grandCampaign.phase : null;
  const isSetupActive = gcPhase === 'setup-coinflip' || gcPhase === 'setup-placement';
  const interactionLocked = gcPhase === 'setup-placement' || turnMoveActive || !!lsRetreatPicking;

  // Season initiative: one roll decides who opens the season, then the first
  // move alternates each turn.
  const handleRollInitiative = (result) => {
    setCampaign(prev => ({ ...prev, initiative: result }));
  };
  const turnOrder = getTurnOrder(campaign.initiative, campaign.currentTurn);

  // Doctrine draft. Committing locks both sides' picks and resets the spent
  // counters; re-drafting clears them so a season can be set up again.
  const handleCommitDoctrines = (draft) => {
    setCampaign(prev => ({
      ...prev,
      doctrines: {
        USA: { ...draft.USA, usesSpent: 0, holdFirstLossSpent: false },
        CSA: { ...draft.CSA, usesSpent: 0, holdFirstLossSpent: false },
      },
    }));
  };
  const handleReopenDoctrines = () => {
    setCampaign(prev => ({
      ...prev,
      doctrines: {
        USA: { ...(prev.doctrines?.USA || {}), offense: null, defense: null },
        CSA: { ...(prev.doctrines?.CSA || {}), offense: null, defense: null },
      },
    }));
  };

  const spSettings = campaign.cpSystemEnabled ? {
    vpBase: campaign.settings?.vpBase || 1,
    attackEnemy: campaign.settings?.baseAttackCostEnemy ?? 75,
    attackNeutral: campaign.settings?.baseAttackCostNeutral ?? 50,
    defenseFriendly: campaign.settings?.baseDefenseCostFriendly ?? 25,
    defenseNeutral: campaign.settings?.baseDefenseCostNeutral ?? 50,
    ticketMode: campaign.settings?.ticketCostEnabled === true,
    vpCurve: campaign.settings?.vpCurve || 'linear',
    ticketCostDivisor: campaign.settings?.ticketCostDivisor ?? 100,
  } : null;

  const battlesFought = campaign.battles.filter(b => b.status !== 'pending' && b.winner).length;
  const battlesPending = campaign.battles.filter(b => b.status === 'pending' || !b.winner).length;

  // App-bar actions, declared once. ActionBar shows the whole row on a wide
  // screen and tucks everything but the pinned actions into a menu on a phone.
  const appBarActions = [
    !isGC && {
      key: 'battle', label: 'Record Battle', icon: Swords, variant: 'primary', pinned: true,
      onClick: () => setShowBattleRecorder(true),
    },
    !isGC && {
      key: 'advance', label: 'Advance Turn', icon: SkipForward, variant: 'ghost',
      title: 'Advance to the next turn', onClick: advanceTurn,
    },
    {
      key: 'dispatch', label: 'Dispatch', icon: ScrollText, variant: 'ghost',
      title: 'Read the end-of-turn dispatch',
      onClick: () => setSummaryTurn(campaign.currentTurn),
    },
    { key: 'share', label: 'Share Map', icon: Share2, divider: true, title: 'Copy share link', onClick: shareCampaignMap },
    { key: 'export', label: 'Export JSON', icon: Download, onClick: exportCampaign },
    { key: 'import', label: 'Import JSON', icon: Upload, onClick: () => importInputRef.current?.click() },
    { key: 'edit-map', label: 'Edit Map', icon: Edit, onClick: editCampaignMap },
    { key: 'new', label: 'New Campaign', icon: Plus, onClick: newCampaign },
    { key: 'settings', label: 'Settings', icon: Settings, onClick: () => setShowSettings(true) },
    { key: 'guide', label: 'Guide', icon: HelpCircle, onClick: () => setShowHelpGuide(true) },
  ].filter(Boolean);

  // Turn / date / battle counts. Sits under the campaign name on a wide
  // screen; on a phone the name and the actions fill that row, so it moves
  // to one of its own rather than stacking three words deep.
  const campaignMeta = (
    <>
      <span className="text-mist-400">Turn {campaign.currentTurn}</span>
      {turnOrder.length > 0 && (
        <>
          <span className="text-ink-600">·</span>
          <span
            className={turnOrder[0] === 'USA' ? 'text-union-400' : 'text-rebel-400'}
            title={`${turnOrder[0]} moves first this turn, then ${turnOrder[1]}`}
          >
            {turnOrder[0]} first
          </span>
        </>
      )}
      {campaign.campaignDate?.displayString && (
        <>
          <span className="text-ink-600">·</span>
          <span>{campaign.campaignDate.displayString}</span>
        </>
      )}
      <span className="text-ink-600">·</span>
      <span>{battlesFought} {battlesFought === 1 ? 'battle' : 'battles'}</span>
      {battlesPending > 0 && (
        <span className="ui-badge ui-badge-warn">{battlesPending} pending</span>
      )}
      {isGC && <span className="ui-badge ui-badge-neutral">Grand Campaign</span>}
    </>
  );

  return (
    <div className="app-shell">
      {/* ── App bar ─────────────────────────────────────────────────── */}
      <header className="app-bar sticky top-0 z-30">
        <div className="max-w-[110rem] mx-auto px-3 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 sm:gap-x-4">
          <div className="flex flex-1 items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-brass-900 border border-brass-500/40 grid place-items-center shrink-0">
              <Map className="w-5 h-5 text-brass-300" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-mist-100 truncate leading-tight">{campaign.name}</h1>
              <div className="hidden sm:flex items-center flex-wrap gap-x-2 gap-y-1 mt-0.5 text-xs text-mist-500">
                {campaignMeta}
              </div>
            </div>
          </div>

          <ActionBar actions={appBarActions} />

          <div className="flex sm:hidden w-full items-center flex-wrap gap-x-2 gap-y-1 text-xs text-mist-500">
            {campaignMeta}
          </div>
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            onChange={importCampaign}
            className="hidden"
          />
        </div>
      </header>

      <div className="max-w-[110rem] mx-auto px-3 sm:px-6 py-4 sm:py-5">
        {/* Main Content Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-5 mb-4 sm:mb-5 items-start">
          {/* Map View - Takes 2 columns */}
          <div className="xl:col-span-2 space-y-4 sm:space-y-5">
            <MapView
              territories={campaign.territories}
              selectedTerritory={selectedTerritory}
              onTerritoryClick={handleTerritoryClick}
              onTerritoryDoubleClick={handleTerritoryDoubleClick}
              onTerritoryCtrlDoubleClick={handleTerritoryCtrlDoubleClick}
              pendingBattleTerritoryIds={
                campaign.battles
                  .filter(b => b.status === 'pending' || !b.winner)
                  .map(b => b.territoryId)
              }
              recentBattleTerritoryIds={
                campaign.battles
                  .filter(b => b.status === 'completed' && b.winner && b.turn >= campaign.currentTurn - 1)
                  .map(b => b.territoryId)
              }
              spSettings={spSettings}
              terrainViz={campaign.settings?.terrainViz}
              tokens={gcTokens}
              moveModeTokenId={moveModeTokenId}
              onMapClick={handleMapPlaceClick}
              mapFeatures={gcMapFeatures}
              featureTool={featureTool}
              lineDraft={lineDraft}
              interactionLocked={interactionLocked}
              influenceThreshold={isGC ? (campaign.grandCampaign.settings.influenceThreshold || 0) : 0}
              rulerFromPoint={(() => {
                if (!isGC) return null;
                if (lsRetreatPicking) {
                  return campaign.grandCampaign.tokens.find(t => t.id === lsRetreatPicking.tokenId)?.position || null;
                }
                if (turnMoveActive && campaign.grandCampaign.currentTokenId) {
                  return campaign.grandCampaign.tokens.find(t => t.id === campaign.grandCampaign.currentTokenId)?.position || null;
                }
                return null;
              })()}
              rulerEvaluator={(() => {
                if (!isGC) return null;
                if (lsRetreatPicking) {
                  // Retreat evaluator: valid if within maxMP march-MP of the
                  // token's current position. No mode/cost — it's a free
                  // post-battle reposition.
                  const gc = campaign.grandCampaign;
                  const token = gc.tokens.find(t => t.id === lsRetreatPicking.tokenId);
                  return (point) => {
                    if (!token?.position) return { valid: false, reason: 'no position' };
                    const svgPerInch = gc.settings.svgUnitsPerInch || 10;
                    const inches = Math.sqrt(
                      (point.x - token.position.x) ** 2 + (point.y - token.position.y) ** 2
                    ) / svgPerInch;
                    const maxInches = lsRetreatPicking.maxMP * gc.settings.marchInchesPerMP;
                    const miles = gcInchesToMiles(inches, gc.settings);
                    const maxMiles = gcInchesToMiles(maxInches, gc.settings);
                    if (inches > maxInches) {
                      return { valid: false, reason: `out of retreat range (${miles} mi / ${maxMiles} mi)` };
                    }
                    return {
                      valid: true,
                      inches,
                      miles,
                      crossings: 0,
                      mode: 'retreat',
                      cost: 0,
                      ratesMilesPerMP: {},
                    };
                  };
                }
                if (turnMoveActive && campaign.grandCampaign.currentTokenId) {
                  return (point) => gcEvaluateMove(campaign, campaign.grandCampaign.currentTokenId, point);
                }
                return null;
              })()}
            />

            <BattleHistory
              battles={campaign.battles}
              territories={campaign.territories}
              onEditBattle={handleEditBattle}
              campaign={campaign}
            />
          </div>

          {/* Right Sidebar — swaps based on mode:
              - Standard campaign: CampaignStats
              - Grand Campaign (default): TokenPanel (+ "Edit Map Features" button)
              - Grand Campaign (features-edit mode): MapFeaturesPanel */}
          <div className="space-y-4">
            {isGC && featureEditMode && (
              <MapFeaturesPanel
                campaign={campaign}
                tool={featureTool}
                pointSide={featurePointSide}
                pointIsCapital={featurePointIsCapital}
                lineDraft={lineDraft}
                onSelectTool={handleSelectTool}
                onChangePointSide={setFeaturePointSide}
                onTogglePointCapital={() => setFeaturePointIsCapital(v => !v)}
                onFinishLine={handleFinishLine}
                onCancelLine={handleCancelLine}
                onUndoLinePoint={handleUndoLinePoint}
                onUpdateFeature={handleUpdateFeature}
                onRemoveFeature={handleRemoveFeature}
                onExitEditMode={exitFeatureEditMode}
                onLoadPreset={handleLoadPreset}
              />
            )}
            {isGC && !featureEditMode && (
              <>
                {gcPhase === 'setup-coinflip' && gcTokens.length > 0 && (
                  <button
                    onClick={handleOpenSetupWizard}
                    className="ui-btn ui-btn-primary ui-btn-block animate-pulse"
                  >
                    Begin Setup — Coin Flip & Placement
                  </button>
                )}
                {gcPhase === 'setup-placement' && (
                  <div className="ui-card px-3 py-2 border-brass-500/40 text-brass-300 text-xs">
                    Setup in progress — follow the floating panel to place tokens.
                  </div>
                )}
                {gcPhase === 'playing' && (
                  <TurnTracker
                    campaign={campaign}
                    onDrawNext={handleDrawNextToken}
                    onEndTurn={handleEndTokenTurn}
                    onBeginMove={handleBeginMove}
                    turnMoveActive={turnMoveActive}
                    onAttack={handleOpenAttack}
                    onReplenish={handleOpenReplenish}
                    onGarrison={handleOpenGarrison}
                    onBoardRail={handleBoardRail}
                    onBoardRiver={handleBoardRiver}
                    onDisembark={handleDisembark}
                  />
                )}
                <button
                  onClick={enterFeatureEditMode}
                  className="ui-btn ui-btn-ghost ui-btn-block"
                >
                  Edit Map Features (cities / forts / rails / rivers)
                </button>
                <TokenPanel
                  campaign={campaign}
                  moveModeTokenId={moveModeTokenId}
                  onAddToken={handleAddToken}
                  onRenameToken={handleRenameToken}
                  onRemoveToken={handleRemoveToken}
                  onUpdateToken={handleUpdateToken}
                  onEnterMoveMode={handleEnterMoveMode}
                  onCancelMoveMode={handleCancelMoveMode}
                />
              </>
            )}
            {!isGC && (
              <>
                <CommanderRollPanel
                  campaign={campaign}
                  onReserveCommander={handleReserveCommander}
                  onRecordBattle={() => {
                    setEditingBattle(null);
                    setBattleRecorderInitialTerritory(selectedTerritory?.id || null);
                    setShowBattleRecorder(true);
                  }}
                />
                <InitiativeRoll
                  campaign={campaign}
                  onRoll={handleRollInitiative}
                />
                <DoctrineDraft
                  campaign={campaign}
                  onCommit={handleCommitDoctrines}
                  onReopen={handleReopenDoctrines}
                />
                <CampaignStats
                  campaign={campaign}
                  onUpdateCampaign={setCampaign}
                />
              </>
            )}
          </div>
        </div>

        {/* Regiment Leaderboard - Shows if regiments are configured */}
        {(campaign.regiments?.USA?.length > 0 || campaign.regiments?.CSA?.length > 0) && (
          <div className="mb-5">
            <RegimentStats campaign={campaign} />
          </div>
        )}

        {/* Bottom Section — in Grand Campaign the territory list is hidden;
            the month advances automatically on bag rollover and battles are
            initiated from the token turn tracker. */}
        {!isGC && (
          <TerritoryList
            territories={campaign.territories}
            onTerritorySelect={handleTerritoryClick}
            spSettings={spSettings}
          />
        )}

        {/* Battle Recorder Modal */}
        {showBattleRecorder && (
          <BattleRecorder
            territories={campaign.territories}
            currentTurn={campaign.currentTurn}
            campaign={campaign}
            onRecordBattle={recordBattle}
            onUpdateBattle={updateBattle}
            onClose={() => { setShowBattleRecorder(false); setEditingBattle(null); setBattleRecorderInitialTerritory(null); }}
            editingBattle={editingBattle}
            initialTerritoryId={battleRecorderInitialTerritory}
            onReserveCommander={handleReserveCommander}
          />
        )}

        {/* Turn Dispatch — end-of-turn write-up */}
        {summaryTurn != null && (
          <TurnSummary
            key={summaryTurn}
            campaign={campaign}
            initialTurn={summaryTurn}
            onClose={() => setSummaryTurn(null)}
            onRequestShareLink={buildShareLink}
          />
        )}

        {/* Settings Modal */}
        {showSettings && (
          <SettingsModal
            campaign={campaign}
            onSave={saveSettings}
            onClose={() => setShowSettings(false)}
          />
        )}

        {/* Map Editor Modal */}
        {showMapEditor && (
          <MapEditor
            isOpen={showMapEditor}
            onClose={handleMapEditorClose}
            onSave={handleMapEditorSave}
            existingCampaign={campaign}
          />
        )}

        {/* Territory Editor Modal (Ctrl+double-click) */}
        {territoryEditorTarget && (
          <TerritoryEditor
            territory={territoryEditorTarget}
            terrainGroups={campaign.settings?.terrainGroups || {}}
            onSave={handleTerritoryEditorSave}
            onClose={() => setTerritoryEditorTarget(null)}
          />
        )}

        {/* Help Guide Modal */}
        <HelpGuide
          isOpen={showHelpGuide}
          onClose={() => setShowHelpGuide(false)}
          campaignStyle={isGC ? 'grand' : 'standard'}
        />

        {/* Grand Campaign Setup Wizard — opened either explicitly from the
            sidebar button, or automatically once the placement phase begins. */}
        {isGC && (showSetupWizard || gcPhase === 'setup-placement') && (
          <SetupWizard
            campaign={campaign}
            lastPlacementError={setupError}
            onFlip={handleCoinFlipCommit}
            onClose={handleCloseSetupWizard}
            onClearError={() => setSetupError(null)}
          />
        )}

        {/* Grand Campaign — replenishment */}
        {isGC && showReplenishModal && (() => {
          const tokenId = campaign.grandCampaign.currentTokenId;
          const token = campaign.grandCampaign.tokens.find(t => t.id === tokenId);
          if (!token) return null;
          return (
            <ReplenishModal
              campaign={campaign}
              token={token}
              onConfirm={handleConfirmReplenish}
              onCancel={handleCloseReplenish}
            />
          );
        })()}

        {/* Grand Campaign — last-stand winner may retreat */}
        {isGC && lsRetreat && (
          <LSRetreatModal
            campaign={campaign}
            tokenId={lsRetreat.tokenId}
            maxMP={lsRetreat.maxMP}
            onSkip={handleLSRetreatSkip}
            onAuto={handleLSRetreatAuto}
            onPickSpot={handleLSRetreatPickSpot}
          />
        )}

        {/* Grand Campaign — LS retreat destination picker HUD */}
        {isGC && lsRetreatPicking && (() => {
          const token = campaign.grandCampaign.tokens.find(t => t.id === lsRetreatPicking.tokenId);
          if (!token) return null;
          const maxInches = lsRetreatPicking.maxMP * campaign.grandCampaign.settings.marchInchesPerMP;
          const maxMiles = gcInchesToMiles(maxInches, campaign.grandCampaign.settings);
          return (
            <div className="ui-hud ui-card border-orange-500/60 p-3">
              <div className="ui-eyebrow text-orange-300 mb-1">LS Retreat — pick a spot</div>
              <div className="text-xs text-mist-300">
                Click within <span className="text-mist-100 font-semibold">{maxMiles} miles</span> of {token.name}.
                Out-of-range hovers show in red.
              </div>
              <button
                onClick={() => setLSRetreatPicking(null)}
                className="ui-btn ui-btn-ghost ui-btn-sm ui-btn-block mt-2"
              >
                Cancel (hold position)
              </button>
            </div>
          );
        })()}

        {/* Grand Campaign — garrison / recall */}
        {isGC && showGarrisonModal && (() => {
          const tokenId = campaign.grandCampaign.currentTokenId;
          const token = campaign.grandCampaign.tokens.find(t => t.id === tokenId);
          const feature = gcFindStrongholdAtToken(campaign, tokenId);
          if (!token || !feature) return null;
          return (
            <GarrisonModal
              campaign={campaign}
              token={token}
              feature={feature}
              onGarrison={handleGarrisonAction}
              onRecall={handleRecallAction}
              onCancel={handleCloseGarrison}
            />
          );
        })()}

        {/* Grand Campaign — attack initiator */}
        {isGC && showBattleModal && (
          <GrandBattleModal
            campaign={campaign}
            onCreate={handleCreateBattle}
            onCancel={() => setShowBattleModal(false)}
          />
        )}

        {/* Grand Campaign — resolve a pending battle */}
        {isGC && resolvingBattleId && (() => {
          const battle = campaign.battles.find(b => b.id === resolvingBattleId);
          if (!battle) return null;
          return (
            <GrandBattleResolveModal
              campaign={campaign}
              battle={battle}
              onResolve={handleResolveBattle}
              onCancel={() => setResolvingBattleId(null)}
            />
          );
        })()}

        {/* Grand Campaign in-turn move confirmation */}
        {isGC && pendingMove && (() => {
          const token = campaign.grandCampaign.tokens.find(t => t.id === campaign.grandCampaign.currentTokenId);
          const mpLeft = campaign.grandCampaign.settings.movementPointsPerTurn - (token?.movementPointsUsed || 0);
          return (
            <MoveConfirmModal
              evaluation={pendingMove.evaluation}
              token={token}
              destination={pendingMove.destination}
              mpLeft={mpLeft}
              onConfirm={handleConfirmMove}
              onCancel={handleCancelPendingMove}
            />
          );
        })()}

        {/* Campaign Template Selector Modal */}
        {showTemplateSelector && (
          <div className="ui-modal-backdrop" onClick={() => setShowTemplateSelector(false)}>
            <div className="ui-modal max-w-lg" onClick={(e) => e.stopPropagation()}>
              <div className="ui-modal-head">
                <div>
                  <div className="ui-modal-title">
                    <Map className="w-5 h-5" />
                    New Campaign
                  </div>
                  <div className="ui-hint mt-0.5">Choose a map template to start from.</div>
                </div>
              </div>
              <div className="ui-modal-body ui-scroll space-y-2">
                {Object.entries(CAMPAIGN_TEMPLATES).map(([key, template]) => (
                  <button
                    key={key}
                    onClick={() => handleTemplateSelect(key)}
                    className="ui-listitem w-full text-left p-4 hover:border-brass-400/50 transition"
                  >
                    <div className="font-semibold text-mist-100">{template.name}</div>
                    <div className="text-xs text-mist-400 mt-1 leading-relaxed">{template.description}</div>
                  </button>
                ))}
              </div>
              <div className="ui-modal-foot">
                <button onClick={() => setShowTemplateSelector(false)} className="ui-btn ui-btn-ghost ui-btn-block">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Victory Modal */}
        {showVictory && (
          <div className="ui-modal-backdrop">
            <div className="ui-modal max-w-xl">
              <div className="ui-modal-body ui-scroll text-center py-10">
                <div className="w-20 h-20 rounded-2xl bg-brass-900 border border-brass-500/40 grid place-items-center mx-auto mb-6">
                  <Trophy className="w-10 h-10 text-brass-300" />
                </div>
                <div className="ui-eyebrow mb-2">Campaign Victory</div>
                <h2 className="text-3xl font-bold mb-2">
                  <span className={showVictory.winner === 'USA' ? 'text-union-400' : 'text-rebel-400'}>
                    {showVictory.winner}
                  </span>
                  <span className="text-mist-100"> wins</span>
                </h2>
                <p className="text-sm text-mist-400 max-w-md mx-auto">{showVictory.description}</p>
                <div className="mt-2 text-xs text-mist-500">
                  Victory type: <span className="text-brass-300 font-semibold">{showVictory.type}</span>
                </div>

                <div className="ui-inset mt-6 p-5 text-left">
                  <div className="ui-eyebrow mb-3">Final Standing</div>
                  <ScoreBoard usaVP={campaign.victoryPointsUSA} csaVP={campaign.victoryPointsCSA} />
                  <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-ink-700">
                    <div className="ui-row">
                      <span className="ui-row-label">Turns</span>
                      <span className="ui-row-value">{campaign.currentTurn}</span>
                    </div>
                    <div className="ui-row">
                      <span className="ui-row-label">Battles</span>
                      <span className="ui-row-value">{campaign.battles.length}</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="ui-modal-foot">
                <button onClick={() => setShowVictory(null)} className="ui-btn ui-btn-ghost flex-1">
                  Continue Viewing
                </button>
                <button
                  onClick={() => { setShowVictory(null); newCampaign(); }}
                  className="ui-btn ui-btn-primary flex-1"
                >
                  New Campaign
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CampaignTracker;