import { useState, useEffect, useCallback, useRef } from "react";

export interface NotificationItem {
  id: string;
  type: string;
  message: string;
  jobId: string | null;
  txHash: string | null;
  read: boolean;
  createdAt: string;
}

interface UseNotificationsOptions {
  wallet: string | undefined;
}

function getLastReadAt(wallet: string): number {
  if (typeof window === "undefined") return 0;
  try {
    return parseInt(localStorage.getItem(`covenant:notif:read:${wallet}`) || "0", 10);
  } catch {
    return 0;
  }
}

function setLastReadAt(wallet: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`covenant:notif:read:${wallet}`, String(Date.now()));
  } catch {
    // quota exceeded etc
  }
}

export default function useNotifications({ wallet }: UseNotificationsOptions) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchNotifications = useCallback(async () => {
    if (!wallet) {
      setNotifications([]);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(`/api/notifications/${wallet}`);
      if (res.ok) {
        const data: NotificationItem[] = await res.json();
        // Apply client-side read status from localStorage
        const lastRead = getLastReadAt(wallet);
        const enriched = data.map((n) => ({
          ...n,
          read: new Date(n.createdAt).getTime() <= lastRead,
        }));
        setNotifications(enriched);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [wallet]);

  useEffect(() => {
    fetchNotifications();

    // Poll every 15 seconds
    intervalRef.current = setInterval(fetchNotifications, 15000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchNotifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  /** Mark all notifications as read (client-side localStorage). */
  const markAllRead = useCallback(() => {
    if (!wallet || unreadCount === 0) return;
    setLastReadAt(wallet);
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, read: true })),
    );
  }, [wallet, unreadCount]);

  return { notifications, loading, unreadCount, markAllRead };
}
