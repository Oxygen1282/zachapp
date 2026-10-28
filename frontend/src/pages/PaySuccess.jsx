import { Link } from "react-router-dom";

// Customer lands here AFTER a successful Stripe checkout. This page is purely
// reassurance — it does NOT mark the invoice paid (the webhook already did, or
// is about to). We deliberately don't assert a status the backend may not have
// finished writing; we just confirm the payment went through on Stripe's side.
function PaySuccess() {
    return (
        <div style={pageStyle}>
            <div style={cardStyle}>
                <div style={{ fontSize: "48px", marginBottom: "12px" }}>✓</div>
                <h1 style={{ margin: "0 0 12px" }}>Payment Received</h1>
                <p style={{ color: "#555", lineHeight: 1.5 }}>
                    Thank you — your payment was successful. A recipt has been sent
                    to your email by our payment processor. You can close this page.
                </p>
                <p
                    style={{
                        color: "#777",
                        fontSize: "0.9em",
                        marginTop: "20px",
                    }}
                >
                    Questions about your invoice? Just reply to the email we sent you.
                </p>
            </div>
        </div>
    );
}

const pageStyle = {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center", 
    justifyContent: "center",
    backgroundColor: "#f5f5f5",
    padding: "20px",
};

const cardStyle = {
    backgroundColor: "white",
    padding: "40px",
    borderRadius: "12px",
    maxWidth: "440px",
    textAlign: "center",
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
};

export default PaySuccess;