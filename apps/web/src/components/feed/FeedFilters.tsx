import { SourceFilterList } from './SourceFilterList';
import { SourceStatus } from './SourceStatus';
import { TagFilterList } from './TagFilterList';

/** The filter column: shown in the desktop sidebar and inside the mobile bottom sheet. */
export function FeedFilters() {
  return (
    <div className="flex flex-col gap-4">
      <TagFilterList />
      <SourceFilterList />
      <SourceStatus />
    </div>
  );
}
