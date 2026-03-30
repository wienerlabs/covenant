import { useState, useEffect, useCallback } from "react";

interface ProfileData {
  id: string;
  walletAddress: string;
  displayName: string;
  bio: string;
  role: string;
  avatarSeed: string;
  createdAt: string;
  updatedAt: string;
}

export default function useProfile(wallet: string | undefined) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!wallet) {
      setProfile(null);
      setNotFound(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setNotFound(false);

    try {
      const response = await fetch(`/api/profile/${wallet}`);
      if (response.status === 404) {
        setProfile(null);
        setNotFound(true);
      } else if (response.ok) {
        const data = await response.json();
        setProfile(data);
        setNotFound(false);
      }
    } catch (err) {
      console.error("Failed to fetch profile:", err);
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return { profile, loading, notFound, refetch: fetchProfile };
}
