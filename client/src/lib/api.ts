import type { BootstrapResponse } from "@shared/types";

const base = import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "";

async function read(response: Response): Promise<BootstrapResponse> {
  if (!response.ok) throw new Error("The timetable service is not responding.");
  return response.json() as Promise<BootstrapResponse>;
}

export function fetchBootstrap() {
  return fetch(`${base}/api/bootstrap`).then(read);
}

export function refreshBootstrap() {
  return fetch(`${base}/api/sync`, { method: "POST" }).then(read);
}
