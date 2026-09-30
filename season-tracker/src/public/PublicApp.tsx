import { EventDirectory } from './EventDirectory';
import { PublicEventView } from './PublicEventView';
import { ToolsView } from './ToolsView';
import type { Route } from '../cloud/route';

/**
 * The public site: everything a visitor can reach without a token. Which page
 * they get is entirely a function of the URL hash, which App has already read.
 */
export function PublicApp({ route }: { route: Route }) {
  if (route.kind === 'tools') return <ToolsView />;
  if (route.kind === 'event') {
    return <PublicEventView slug={route.slug} screen={route.screen} season={route.season} night={route.night} />;
  }
  return <EventDirectory />;
}
