import { useState } from "react";

// A password field with a show/hide toggle. Behaves like a normal controlled
// input (value + onChange passed in), but adds an eye button that flips the
// input between type="password" (masked) and type="text" (visible).
function PasswordInput({ value, onChange, placeholder, style, onKeyDown}) {

    // Local UI state: is the password currently revealed?
    const [visible, setVisible] = useState(false);

    return (
        <div 
            style={{
                position: "relative",
                display: "inline-block",
                width: style?.width ?? "100%",
            }}
        >
            <input 
                type={visible ? "text" : "password"}
                value={value}
                onChange={onChange}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                autoComplete="new-password"
                style={{
                    ...style,
                    width: "100%",
                    paddingRight: "60px",
                    boxSizing: "border-box"
                }}
            />
            {/* The toggle. type="button" so it never submits anything. */}
            <button
                type="button"
                onClick={() => setVisible(!visible)}
                style={{
                    position: "absolute",
                    right: "4px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    fontSize: "0.75em",
                    padding: "2px 6px",
                    cursor: "pointer",
                }}
            >
                {visible ? "Hide" : "Show"}
            </button>
        </div>
    );
}

export default PasswordInput;