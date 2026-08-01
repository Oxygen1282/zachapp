// Frontend mirror of the backend capability helpers. Same intent: express
// what a role CAN DO, checked in one place. These gate UI VISIBILITY only —
// the backend guards are the real enforcement.

export function canManageContent(permissions) {
    // Create/edit clients, jobs, calendar events.
    return permissions === "Owner" || permissions === "Manager";
}

export function isOwner(permissions) {
    // Accounting, billing, user management.
    return permissions === "Owner";
}