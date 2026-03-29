const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

function authenticateToken(req, res, next) {

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

        const user = jwt.verify(token, JWT_SECRET);

        req.user = user;

        next();

    } catch (error) {

        console.error("JWT Error:", error.message);

        return res.status(401).json({ error: "Invalid token" });

    }

}

module.exports = authenticateToken;
