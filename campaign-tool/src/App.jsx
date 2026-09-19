import { useState, useEffect } from 'react';
import CampaignTracker from './CampaignTracker';
import SharedMapView from './components/SharedMapView';
import { getShareFromUrl, fetchSharePayload } from './utils/shareMap';

function App() {
  const [shareData, setShareData] = useState(undefined); // undefined = not checked yet
  const [shareError, setShareError] = useState(false);

  useEffect(() => {
    const loadShare = async () => {
      setShareError(false);
      const result = getShareFromUrl();

      if (result?.pending) {
        const data = await fetchSharePayload(result.id);
        if (data) {
          setShareData(data);
        } else {
          setShareError(true);
          setShareData(null);
        }
      } else {
        setShareData(result);
      }
    };

    loadShare();

    const onHashChange = () => loadShare();
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // Still checking
  if (shareData === undefined) return null;

  // Short link failed to load
  if (shareError) {
    return (
      <div className="app-shell grid place-items-center p-6">
        {/* A notice pinned to the sheet, not a card: rules above and below,
            the apology in ink, one way out. */}
        <div className="relative z-10 max-w-sm w-full text-center">
          <div className="overline">The Campaign Dispatch</div>
          <h2 className="font-display text-2xl font-black uppercase tracking-wide border-y border-rule py-3 mb-3">
            No such dispatch
          </h2>
          <p className="ui-hint mb-5">
            This share link has expired, or was never issued.
          </p>
          <a href={window.location.pathname} className="ui-btn ui-btn-primary">
            Open the tracker
          </a>
        </div>
      </div>
    );
  }

  // Shared view
  if (shareData) return <SharedMapView shareData={shareData} />;

  // Normal tracker
  return <CampaignTracker />;
}

export default App;
