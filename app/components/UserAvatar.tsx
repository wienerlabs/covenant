"use client";

import PixelAvatar from "./PixelAvatar";

interface UserAvatarProps {
  seed: string;
  avatarUrl: string | null;
  size?: number;
}

export default function UserAvatar({ seed, avatarUrl, size = 48 }: UserAvatarProps) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt="Avatar"
        width={size}
        height={size}
        style={{
          borderRadius: "8px",
          border: "1px solid rgba(0,0,0,0.15)",
          display: "block",
          boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          objectFit: "cover",
          width: size,
          height: size,
        }}
      />
    );
  }

  return <PixelAvatar seed={seed} size={size} />;
}
