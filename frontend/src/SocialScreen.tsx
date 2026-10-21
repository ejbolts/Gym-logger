import { useState } from 'react';
import { CachedTabPanel } from './CachedTabPanel';
import { FriendsActivityCard } from './FriendsActivity';
import { AccountHeaderActions } from './AccountHeaderActions';
import { FriendsPanel } from './SharedProfiles';
import { PageHeader } from './TodayScreen';
import { useSlidingIndicator } from './motionHooks';
import type { SharedProfileSummary, User } from './types';

export function SocialScreen({
  active,
  onOpenProfile,
  onChooseSharing,
  onOpenSettings,
  account,
  openFeedback,
}: {
  active: boolean;
  onOpenProfile: (profile: Pick<SharedProfileSummary, 'id' | 'display_name'>) => void;
  onChooseSharing: () => void;
  onOpenSettings: () => void;
  account?: User;
  openFeedback?: number;
}) {
  const [section, setSection] = useState<'activity' | 'friends'>('activity');
  const [friendsVisited, setFriendsVisited] = useState(false);
  const indicator = useSlidingIndicator<HTMLDivElement>(section);

  function openFriends() {
    setFriendsVisited(true);
    setSection('friends');
  }

  return (
    <section className="social-screen content-page">
      <PageHeader
        title="Social"
        eyebrow="Friends · sessions · reactions"
        onOpenSettings={onOpenSettings}
        accountActions={
          <AccountHeaderActions
            active={active}
            profile={account}
            openFeedback={openFeedback}
            onOpenProfile={onChooseSharing}
            onOpenFriends={openFriends}
          />
        }
      />
      <div
        ref={indicator}
        className="segmented-control slide-indicator"
        role="tablist"
        aria-label="Social sections"
      >
        <button
          type="button"
          role="tab"
          aria-selected={section === 'activity'}
          className={section === 'activity' ? 'active' : ''}
          onClick={() => setSection('activity')}
        >
          Following
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={section === 'friends'}
          className={section === 'friends' ? 'active' : ''}
          onClick={openFriends}
        >
          Friends
        </button>
      </div>
      <CachedTabPanel active={section === 'activity'}>
        <FriendsActivityCard
          active={active && section === 'activity'}
          onOpenFriend={onOpenProfile}
          onOpenFriends={openFriends}
          onChooseSharing={onChooseSharing}
          title="Latest sessions"
          friendsLabel="Find friends"
        />
      </CachedTabPanel>
      {friendsVisited && (
        <CachedTabPanel active={section === 'friends'}>
          <FriendsPanel
            active={active && section === 'friends'}
            refreshKey={0}
            onOpenProfile={onOpenProfile}
            onChooseSharing={onChooseSharing}
          />
        </CachedTabPanel>
      )}
    </section>
  );
}
