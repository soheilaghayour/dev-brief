/** What each catalog component renders that no other one does; the tests find sections by it. */
export const SECTION_SIGNATURES = {
  KeyTakeaways: 'ol',
  StoryClusterCard: 'article[data-story-id]',
  ConsensusCallout: 'h3 + [data-slot="badge"] > svg',
  TechVelocityChart: 'figure',
  TagBadgeList: 'a[href^="/feed?tags="]',
} as const;
