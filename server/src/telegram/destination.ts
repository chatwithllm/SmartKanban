import type { Proposal as AIProposal } from '../ai/propose.js';
import type { Destination } from './proposals.js';

const URL_RE = /https?:\/\//i;

/**
 * Picks the auto-selected destination for the new structured-capture flow.
 *
 *   - Knowledge: title or description contains a URL
 *   - Private card: DM with no URL
 *   - Public card: group with no URL (lands in Family Inbox)
 *
 * The AIProposal type does not carry an explicit `links` array, so URL
 * detection happens on the title + description strings directly. The
 * original message text is checked by the caller (sendProposal) via
 * the existing `extractUrls` helper.
 */
export function defaultDestination(
  p: Pick<AIProposal, 'title' | 'description'>,
  isPrivateChat: boolean,
  extraText = '',
): Destination {
  const hasLink =
    URL_RE.test(p.title) ||
    URL_RE.test(p.description ?? '') ||
    URL_RE.test(extraText);
  if (hasLink) return 'knowledge';
  return isPrivateChat ? 'private_card' : 'public_card';
}

export function destinationOptions(
  isPrivateChat: boolean,
): Array<{ key: Destination; label: string }> {
  return isPrivateChat
    ? [
        { key: 'private_card', label: '🔒 Private' },
        { key: 'public_card', label: '👥 Public' },
        { key: 'knowledge', label: '📚 Knowledge' },
      ]
    : [
        { key: 'public_card', label: '👥 Inbox' },
        { key: 'private_card', label: '🔒 Mine' },
        { key: 'knowledge', label: '📚 Knowledge' },
      ];
}
