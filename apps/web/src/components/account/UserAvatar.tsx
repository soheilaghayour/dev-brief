import type { Me } from '@devbrief/shared';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/Avatar';

export function UserAvatar({
  user,
  className,
}: {
  user: Pick<Me, 'name' | 'image'>;
  className?: string;
}) {
  return (
    <Avatar className={className}>
      {user.image && <AvatarImage src={user.image} alt="" referrerPolicy="no-referrer" />}
      <AvatarFallback>{user.name.slice(0, 1).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}
