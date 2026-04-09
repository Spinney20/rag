const API_BASE = import.meta.env.VITE_API_URL || "";

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const { headers: extraHeaders, ...restOptions } = options || {};
  const res = await fetch(`${API_BASE}/api${path}`, {
    ...restOptions,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `API error: ${res.status}`);
  }
  if (res.status === 204) return {} as T;
  return res.json();
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, { method: "POST", body: formData });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || `Upload error: ${res.status}`);
  }
  return res.json();
}
