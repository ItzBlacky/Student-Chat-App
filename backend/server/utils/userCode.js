function normalizeUserCodeBase(username) {
    const cleaned = String(username || "user")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

    if (!cleaned) {
        return "user";
    }

    return cleaned.slice(0, 18);
}

async function generateUniqueUserCode(db, username) {
    const base = normalizeUserCodeBase(username);
    let candidate = base;
    let suffix = 1;

    // Keep codes short, readable, and based on the username.
    while (true) {
        const users = await db.collection("users");
        const existingUser = await users.findOne({ user_code: candidate }, { projection: { id: 1 } });

        if (!existingUser) {
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
