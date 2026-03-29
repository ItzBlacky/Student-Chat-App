const jwt = require("jsonwebtoken");
const pool = require("../db");

const JWT_SECRET = process.env.JWT_SECRET;

async function authenticateToken(req, res, next) {

    const authHeader = req.headers["authorization"];

    if (!authHeader) {
        return res.status(401).json({ error: "Access denied" });
    }

    if (!authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Invalid token format" });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({ error: "Token missing" });
    }

    try {

        const decoded = jwt.verify(token, JWT_SECRET);

        const [rows] = await pool.query(
            "SELECT id, username, email FROM users WHERE id = ?",
            [decoded.id]
        );

        if (rows.length === 0) {
            return res.status(401).json({ error: "User not found" });
        }

        req.user = rows[0];

        next();

    } catch (error) {

        console.error("JWT Error:", error.message);

        return res.status(401).json({ error: "Invalid token" });

    }

}

module.exports = authenticateToken;
