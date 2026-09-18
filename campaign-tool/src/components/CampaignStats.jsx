import { useState } from 'react';
import { Section, SectionHead, SectionBody, Row, Modal, SIDE_TEXT } from './ui/Primitives';
import { casualtyTotals, battleCounts } from '../utils/campaignTotals';

/**
 * The Butcher's Bill — what the campaign has cost, and the supply-point
 * editor reached from its toolbar.
 *
 * Victory points, the turn and the campaign date now live in the masthead and
 * the dateline, so they are not repeated here.
 */
const CampaignStats = ({ campaign, onUpdateCampaign }) => {
  const [showCPEditor, setShowCPEditor] = useState(false);
  const [editedCP, setEditedCP] = useState({ USA: 0, CSA: 0 });

  if (!campaign) return null;

  const casualties = casualtyTotals(campaign.battles);
  const { fought } = battleCounts(campaign.battles);
  const perEngagement = fought > 0 ? Math.round(casualties.total / fought) : 0;

  const formatNumber = (num) => num.toLocaleString('en-US');

  const handleOpenCPEditor = () => {
    setEditedCP({ USA: campaign.combatPowerUSA || 0, CSA: campaign.combatPowerCSA || 0 });
    setShowCPEditor(true);
  };

  const handleSaveCPChanges = () => {
    if (!onUpdateCampaign) {
      alert('Campaign update function not available');
      return;
    }

    const updatedCampaign = {
      ...campaign,
      combatPowerUSA: parseInt(editedCP.USA) || 0,
      combatPowerCSA: parseInt(editedCP.CSA) || 0
    };

    const cpHistory = [...(campaign.cpHistory || [])];
    const usaChange = (parseInt(editedCP.USA) || 0) - (campaign.combatPowerUSA || 0);
    const csaChange = (parseInt(editedCP.CSA) || 0) - (campaign.combatPowerCSA || 0);

    if (usaChange !== 0) {
      cpHistory.push({
        turn: campaign.currentTurn,
        date: new Date().toISOString(),
        action: 'Manual Adjustment',
        side: 'USA',
        cpChange: usaChange,
        newBalance: parseInt(editedCP.USA) || 0
      });
    }

    if (csaChange !== 0) {
      cpHistory.push({
        turn: campaign.currentTurn,
        date: new Date().toISOString(),
        action: 'Manual Adjustment',
        side: 'CSA',
        cpChange: csaChange,
        newBalance: parseInt(editedCP.CSA) || 0
      });
    }

    updatedCampaign.cpHistory = cpHistory;

    onUpdateCampaign(updatedCampaign);
    setShowCPEditor(false);
  };

  return (
    <Section>
      <SectionHead
        title="The Butcher's Bill"
        meta={fought > 0 ? `${fought} ${fought === 1 ? 'engagement' : 'engagements'}` : null}
        actions={
          campaign.cpSystemEnabled && onUpdateCampaign ? (
            <button
              onClick={handleOpenCPEditor}
              className="ui-btn ui-btn-sm"
              title="Adjust supply points"
            >
              Adjust
            </button>
          ) : null
        }
      />
      <SectionBody>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
          <Row
            label={<span className={SIDE_TEXT.USA}>Union</span>}
            value={formatNumber(casualties.usa)}
          />
          <Row
            label={<span className={SIDE_TEXT.CSA}>Confederate</span>}
            value={formatNumber(casualties.csa)}
          />
          <Row label="Total" value={formatNumber(casualties.total)} />
          <Row label="Per engagement" value={formatNumber(perEngagement)} />
        </div>
      </SectionBody>

      {/* SP editor */}
      {showCPEditor && (
        <Modal
          dismissible={false}
          title="Supply points"
          subtitle="Manual adjustments are logged in the supply history."
          width="max-w-md"
          onClose={() => setShowCPEditor(false)}
          footer={
            <>
              <button onClick={handleSaveCPChanges} className="ui-btn ui-btn-primary flex-1">
                Save changes
              </button>
              <button onClick={() => setShowCPEditor(false)} className="ui-btn flex-1">
                Cancel
              </button>
            </>
          }
        >
          <div className="space-y-4">
            {['USA', 'CSA'].map(side => (
              <div key={side}>
                <label className={`ui-label ${SIDE_TEXT[side]}`}>{side} supply points</label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={editedCP[side]}
                  onChange={(e) => setEditedCP({ ...editedCP, [side]: e.target.value })}
                  className="ui-field text-lg font-bold tabular"
                />
                <div className="ui-hint mt-1">
                  Standing at {(side === 'USA' ? campaign.combatPowerUSA : campaign.combatPowerCSA) || 0} SP.
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </Section>
  );
};

export default CampaignStats;
