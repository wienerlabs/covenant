import { useState, useEffect, useCallback } from "react";

export interface JobData {
  poster: string;
  taker: string | null;
  amount: number;
  specHash: string;
  status: "Open" | "Accepted" | "Completed" | "Cancelled";
  createdAt: number;
  deadline: number;
  minWords: number;
}

export interface JobEntry {
  job: JobData;
  jobPda: string;
}

const MOCK_JOBS: JobEntry[] = [
  {
    jobPda: "Cv7t2X9kFpHq3mNbRz1YWd4AeJcLn8Uf6GsKoQ5vBxT",
    job: {
      poster: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      taker: null,
      amount: 500_000_000,
      specHash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      status: "Open",
      createdAt: 1711756800,
      deadline: 1712361600,
      minWords: 2000,
    },
  },
  {
    jobPda: "8HnR3kFpYq5mNbWz2XWd4BeJcMn9Vg7HtLpKoR6wCyU",
    job: {
      poster: "3FxKmRvBnP8qYtZsW7aJdNcHg6UeXo4LrTbVp2wQMhS",
      taker: "7KjNmPqRsT4vWxYzA2bCdEfGhI8jKlMnOpQrStUvWxYz",
      amount: 1_200_000_000,
      specHash: "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
      status: "Accepted",
      createdAt: 1711670400,
      deadline: 1712275200,
      minWords: 5000,
    },
  },
  {
    jobPda: "5TgS4lGpZr6nOcXa3YXe5CfKdNo0Wh8ItMqLpS7xDzV",
    job: {
      poster: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      taker: "4LkOmQrStU5wXyZaB3cDeFgHiJ9kLmNoPqRsTuVwXyZa",
      amount: 750_000_000,
      specHash: "c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
      status: "Completed",
      createdAt: 1711584000,
      deadline: 1712188800,
      minWords: 3000,
    },
  },
];

interface UseJobListOptions {
  filter: "all" | "mine";
  walletPubkey?: string;
}

export default function useJobList({ filter, walletPubkey }: UseJobListOptions) {
  const [jobs, setJobs] = useState<JobEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJobs = useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      let filtered = MOCK_JOBS;
      if (filter === "mine" && walletPubkey) {
        filtered = MOCK_JOBS.filter(
          (entry) =>
            entry.job.poster === walletPubkey || entry.job.taker === walletPubkey
        );
      }
      setJobs(filtered);
      setLoading(false);
    }, 800);
  }, [filter, walletPubkey]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  return { jobs, loading, refresh: fetchJobs };
}
