const API_URL = import.meta.env.VITE_API_URL;

// Drop-in replacement for fetch() that automatically attaches the auth token.
// Usage is the same as fetch, but you can pass a path ("/clients/") or a full URL.
export async function apiFetch(url, options = {}) {

    const token = localStorage.getItem("token");

    // Merge the Authorization header into whatever headers were passed.
    const headers = {
        ...(options.headers || {}),
    };
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    // Allow calling with a relative path or a full URL.
    const fullUrl = url.startsWith("http") ? url : `${API_URL}${url}`;

    const response = await fetch(fullUrl, { ...options, headers });

    // If the token is missing/expired/invalid, the backend returns 401.
    // Clear the stored token and bounce to login by reloading — the gate will
    // then show the login page since there's no token.
    if (response.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("permissions");
        localStorage.removeItem("name");
        window.location.reload();
    }

    return response;
}