const express = require("express");
const router = express.Router();
const pool = require("../db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { generateUniqueUserCode } = require("../utils/userCode");

const JWT_SECRET = process.env.JWT_SECRET;


// =======================
// REGISTER
// =======================
router.post("/register", async (req, res) => {

    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: "All fields required" });
    }

    const emailRegex = /\S+@\S+\.\S+/;

    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: "Invalid email format" });
    }

    if (password.length < 6) {
        return res.status(400).json({ error: "Password must be at least 6 characters" });
    }

    try {

        const hashedPassword = await bcrypt.hash(password, 10);
        const userCode = await generateUniqueUserCode(pool, username);

        await pool.query(
            "INSERT INTO users (username, user_code, email, password) VALUES (?, ?, ?, ?)",
            [username, userCode, email, hashedPassword]
        );

        res.json({ message: "User registered successfully" });

    } catch (error) {

        if (error.code === "ER_DUP_ENTRY") {
            return res.status(400).json({
                error: "Email already registered"
            });
        }

        console.error(error);
        res.status(500).json({ error: "Registration failed" });

    }

});


// =======================
// LOGIN
// =======================
router.post("/login", async (req, res) => {

    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "All fields required" });
    }

    try {

        const [rows] = await pool.query(
            "SELECT * FROM users WHERE email = ?",
            [email]
        );

        if (rows.length === 0) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const user = rows[0];

        const match = await bcrypt.compare(password, user.password);

        if (!match) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign(
            {
                id: user.id,
                username: user.username,
                email: user.email,
                user_code: user.user_code
            },
            JWT_SECRET,
            { expiresIn: "1d" }
        );

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                user_code: user.user_code
            }
        });

    } catch (error) {

        console.error(error);
        res.status(500).json({ error: "Login failed" });

    }

});

module.exports = router;
