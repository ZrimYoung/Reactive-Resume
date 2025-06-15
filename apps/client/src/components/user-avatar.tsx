import { getInitials } from "@reactive-resume/utils";

import { useUser } from "../services/user";

type Props = {
  size?: number;
  className?: string;
};

export const UserAvatar = ({ size = 36, className }: Props) => {
  const { user } = useUser();

  if (!user) return null;

  const initials = getInitials(user.name);

  const picture = (
    <div
      style={{ width: size, height: size }}
      className="flex items-center justify-center rounded-full bg-secondary text-center text-[10px] font-semibold text-secondary-foreground"
    >
      {initials}
    </div>
  );

  return <div className={className}>{picture}</div>;
};
