import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Dashboard } from "@/components/Dashboard";
import { fetchBootstrap, refreshBootstrap } from "@/lib/api";
import { applyColors, applyTheme, readStoredColors, readStoredTheme, type ThemeId } from "@/lib/prefs";

function usePreferences() {
  const [theme, setTheme] = useState<ThemeId>(readStoredTheme);
  const [colors, setColors] = useState(readStoredColors);
  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.removeItem("timetable-layout");
    } catch {
      // A blocked store still leaves this visit on the week grid and the compact day.
    }
  }, [theme]);
  useEffect(() => {
    applyColors(colors);
  }, [colors]);
  return {
    theme,
    colors,
    chooseTheme: (next: ThemeId) => setTheme(next),
    chooseColors: (next: boolean) => setColors(next),
  };
}

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export function App() {
  const preferences = usePreferences();
  const now = useNow();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["bootstrap"],
    queryFn: fetchBootstrap,
    refetchInterval: (result) => (result.state.data?.sync.intervalSeconds ?? 45) * 1000,
  });
  const refresh = useMutation({
    mutationFn: refreshBootstrap,
    onSuccess: (data) => queryClient.setQueryData(["bootstrap"], data),
  });

  if (query.isPending && !query.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <h1 className="text-xl font-medium">Loading the timetable</h1>
        <p className="mt-2 text-sm text-muted-foreground">Reading the Google Sheet.</p>
      </div>
    );
  }

  if (!query.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16" role="alert">
        <h1 className="text-xl font-medium">The timetable is unavailable</h1>
        <p className="mt-2 text-sm text-muted-foreground">Start the API server, then try again.</p>
        <button type="button" className="mt-4 text-sm underline underline-offset-4" onClick={() => void query.refetch()}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <Dashboard
      data={query.data}
      now={now}
      pending={refresh.isPending}
      onRefresh={() => refresh.mutate()}
      theme={preferences.theme}
      colors={preferences.colors}
      onTheme={preferences.chooseTheme}
      onColors={preferences.chooseColors}
    />
  );
}
