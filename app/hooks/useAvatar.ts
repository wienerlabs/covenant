"use client";
import { useState, useEffect } from "react";

export default function useAvatar(wallet: string | undefined | null) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarSeed, setAvatarSeed] = useState<string>("default");

  useEffect(() => {
    if (!wallet) return;
    fetch(`/api/profile/${wallet}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) {
          setAvatarUrl(data.avatarUrl || null);
          setAvatarSeed(data.avatarSeed || wallet);
        } else {
          setAvatarSeed(wallet);
        }
      })
      .catch(() => setAvatarSeed(wallet));
  }, [wallet]);

  return { avatarUrl, avatarSeed };
}
