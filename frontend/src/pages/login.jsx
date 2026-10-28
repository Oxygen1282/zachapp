import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import PasswordInput from "../components/PasswordInput";

function Login() {
    const { login } = useAuth();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit() {
        setError("");
        setSubmitting(true);
        try {
            // On success, the gate re-renders and shows the app — nothing else to do.
            await login(email, password);

            // Land on the default page, not wherever the URL was left.
            Navigate("/", {replace: true });    // Router-aware redirect
            
        } catch (err) {
            setError(err.message);
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div 
            style={{
                height: "100vh",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
            }}
        >
            <div 
                style={{
                    width: "320px",
                    padding: "24px",
                    border: "1px solid #ccc",
                    borderRadius: "10px",
                }}
            >
                <h2>Rad Power Washing</h2>
                <p 
                    style={{
                        color: "#777",
                        marginTop: 0,
                    }}
                >
                    Sign in to continue
                </p>

                <label>Email</label>
                <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    style={{
                        width: "100%",
                        marginBottom: "10px",
                    }}
                />

                <label>Password</label>
                <PasswordInput
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                    style={{ marginbottom: "10px" }}
                />

                {error && <div style={{ color: "red", marginBottom: "10px" }}>{error}</div>}

                <button onClick={handleSubmit} disabled={submitting} style={{ width: "100%" }}>
                    {submitting ? "Signing In..." : "Sign In"}
                </button>

            </div>
        </div>
    );
}

export default Login;