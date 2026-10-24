import type { ReactNode } from 'react';
import { photoUrl, type MemberView } from '../../shared/protocol';

/** A player's bubble: their selfie with an outline in their colour, or a solid colour disc without a selfie. */
export function Avatar({
  member,
  size = 26,
  children,
}: {
  member: Pick<MemberView, 'playerId' | 'photoRev' | 'color'>;
  size?: number;
  /** Shown on the colour disc when there is no selfie (e.g. the player number). */
  children?: ReactNode;
}) {
  const url = photoUrl(member);
  return (
    <span
      className={`avatar-dot${url ? ' has-photo' : ''}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, size * 0.5),
        backgroundColor: member.color,
        backgroundImage: url ? `url(${url})` : undefined,
        borderColor: member.color,
      }}
    >
      {url ? null : children}
    </span>
  );
}
