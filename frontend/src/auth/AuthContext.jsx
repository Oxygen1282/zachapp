import { createContext, useContext, useState } from "react";

const API_URL = import.meta.env.VITE_API_URL;

// The shape of what the context provides to the whole app.
const AuthContext = createContext(null);

// Wrap the app in this so any component can read auth state / log in / log out.
export function AuthProvider({ children }) {

    // Read any existing token from localStorage on first load, so a refresh
    // keeps you logged in.
    const [token, setToken] = useState(() => localStorage.getItem("token"));
    const [permissions, setPermissions] = useState(() => localStorage.getItem("permissions"));
    const [name, setName] = useState(() => localStorage.getItem("name"));

    // Log in: call the backend, store the token + user info.
    async function login(email, password) {
        const response = await fetch(`${API_URL}/users/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.detail || "Login Failed");
        }

        const data = await response.json();

        // Persist to localStorage so a refresh stays logged in
        localStorage.setItem("token", data.access_token);
        localStorage.setItem("permissions", data.permissions);
        localStorage.setItem("name", data.name);

        setToken(data.access_token);
        setPermissions(data.permissions);
        setName(data.name);
    }

    // Log out: Clear everything
    function logout() {
        localStorage.removeItem("token");
        localStorage.removeItem("permissions");
        localStorage.removeItem("name");
        
        setToken(null);
        setPermissions(null);
        setName(null);
    }

    const value = { token, permissions, name, login, logout }

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

// Convenience hook so components can do: const { permissions, logout } = useAuth();
export function useAuth() {
    return useContext(AuthContext);
}