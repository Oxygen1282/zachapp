import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { canManageContent, isOwner } from "../auth/permissions";


function Layout() {
    const { permissions, name, logout } = useAuth();

    // Pages everyone sees.
    const navItems = [
        { to: "/", label: "Calendar", end: true },
        { to: "/clients", label: "Clients" },
        { to: "/jobs", label: "Jobs" },
    ];

    // Owner-only Pages
    if (isOwner(permissions)) {
        navItems.push({ to: "/accounting", label: "Accounting" });
        navItems.push({ to: "/billing", label: "Billing" });
        navItems.push({ to: "/contracts", label: "Contracts" });
    }

    // Timesheets tab: Managers and Employees (anyone who clocks in).
    // Owners get the Employees tab instead (Phase 7), not a personal timesheet.
    if (!isOwner(permissions)) {
        navItems.push({ to: "/timesheets", label: "Timesheets" });
    }

    // Employees tab: Owner + Manager (management). Owners get this INSTEAD of a
    // personal Timesheets tab; Managers get both.
    if (canManageContent(permissions)) {
        navItems.push({ to: "/employees", label: "Employees" });
    }

    return (
        <div 
            style={{
                display: "flex",
                height: "100vh",
            }}
        >
            <nav 
                style={{
                    position: "fixed",
                    top: 0,
                    left: 0,
                    width: "200px",
                    height: "100vh",
                    borderRight: "1px solid #ccc",
                    padding: "20px 0",
                    boxSizing: "border-box",
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                <div 
                    style={{
                        padding: "0 20px 10px",
                        fontWeight: "bold",
                    }}
                >
                    {name}
                    <div 
                        style={{
                            fontSize: "0.8m",
                            color: "#888",
                            fontWeight: "normal",
                        }}
                    >
                        {permissions}
                    </div>
                </div>

                {navItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        style={({ isActive }) => ({
                            display: "block",
                            padding: "12px 20px",
                            textDecoration: "none",
                            color: isActive ? "#fff" : "#333",
                            backgroundColor: isActive ? "#1e3a8a" : "transparent",
                        })}
                    >
                        {item.label}
                    </NavLink>
                ))}

                {/* Logout pinned at the bottom */}
                <button onClick={logout} style={{ margin: "auto 20px 0", padding: "10px" }}>
                    Log Out
                </button>
            </nav>

            <main style={{ marginLeft: "200px", flexGrow: 1, height: "100vh", overflowY: "auto" }}>
                <Outlet />
            </main>
        </div>
    );
}

export default Layout;