export async function apiFetch(endpoint: string, options?: RequestInit) {
  try {
    const customKey = localStorage.getItem("custom_grok_key");
    const adminSecret = localStorage.getItem("admin_secret") || "";
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

    // Log auth failures
    if (res.status === 401) {
      console.warn(`[Auth API] 401 Unauthorized on ${endpoint} — check ADMIN_SECRET`);
    }
    if (res.status === 403) {
      console.warn(`[Auth API] 403 Forbidden on ${endpoint} — invalid token`);
    }
    if (res.status === 404) {
      console.warn(`[API] 404 Not Found on ${endpoint} — check backend M route prefix`);
    }
    if (res.status === 429) {
      console.warn(`[API] 429 Rate Limited on ${endpoint}`);
    }
    if (res.status >= 500) {
      console.error(`[API] Server Error ${res.status} on ${endpoint}`);
    }

    // Handle empty responses
    const text = await res.text();
    if (!text) {
      return { success: false, message: "Empty response from server", status: res.status };
    }

    try {
      const data = JSON.parse(text);
      return data;
    } catch (parseErr) {
      console.error(`[API] Invalid JSON response from ${endpoint}:`, text.substring(0, 200));
      return { success: false, message: "Invalid JSON response from server", raw: text.substring(0, 500) };
    }
  } catch (err: any) {
    console.error(`[API] Fetch Error for ${endpoint}:`, err.message);
    // Return error info instead of generic fallback
    return {
      success: false,
      message: err.message || "Network Error",
      error: err,
      data: null,
    };
  }
}
