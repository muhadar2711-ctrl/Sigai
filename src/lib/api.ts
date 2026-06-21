export async function apiFetch(endpoint: string, options?: RequestInit) {
  try {
    const customKey = localStorage.getItem("custom_grok_key");
    const adminSecret = localStorage.getItem("admin_secret") || ""; // Added for Admin Auth
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-admin-token": adminSecret,
    };
    if (customKey) {
      headers["x-grok-key"] = customKey;
    }

    const res = await fetch(`/api${endpoint}`, {
      ...options,
      headers: { ...headers, ...options?.headers },
    });
    
    if (res.status === 401 || res.status === 403) {
      console.warn(`[Auth API] Unauthorized request to ${endpoint}`);
    }

    const data = await res.json();
    return data;
  } catch (err) {
    console.error("API Fetch Error", err);
    return { success: false, message: "Network Error", data: null };
  }
}
