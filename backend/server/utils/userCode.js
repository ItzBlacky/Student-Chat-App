function normalizeUserCodeBase(username) {
    const cleaned = String(username || "user")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

    if (!cleaned) {
        return "user";
    }

    return cleaned.slice(0, 18);
}

async function generateUniqueUserCode(pool, username) {
    const base = normalizeUserCodeBase(username);
    let candidate = base;
    let suffix = 1;

    // Keep codes short, readable, and based on the username.
    while (true) {
        const [rows] = await pool.query(
            "SELECT id FROM users WHERE user_code = ? LIMIT 1",
            [candidate]
        );

        if (rows.length === 0) {
            return candidate;
        }

        suffix += 1;
        candidate = `${base}${suffix}`.slice(0, 24);
    }
}

module.exports = {
    generateUniqueUserCode,
    normalizeUserCodeBase,
};
