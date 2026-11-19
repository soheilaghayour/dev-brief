import { SourceFilterList } from './SourceFilterList';
import { SourceStatus } from './SourceStatus';
import { TagFilterList } from './TagFilterList';

/** The tag, source and status lists: fetched after hydration, so they load as a separate chunk. */
export function FeedFilterLists() {
  return (
    <div className="flex flex-col gap-4">
      <TagFilterList />
      <SourceFilterList />
      <SourceStatus />
    </div>
  );
}
