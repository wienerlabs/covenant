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
        setNotifications(data);
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

  return { notifications, loading, unreadCount };
}
