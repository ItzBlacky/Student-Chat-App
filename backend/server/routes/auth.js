const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const db = require("../db");
const { generateUniqueUserCode } = require("../utils/userCode");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;

function publicUser(user) {
    return {
        id: user.id,
        username: user.username,
        email: user.email,
        user_code: user.user_code,
    };
}

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
        const users = await db.collection("users");
        const normalizedEmail = email.trim().toLowerCase();
        const existingUser = await users.findOne({
            $or: [
                { email: normalizedEmail },
                { username: username.trim() },
            ],
        });

        if (existingUser) {
            return res.status(400).json({ error: "Email or username already registered" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const userCode = await generateUniqueUserCode(db, username);

        await db.insertWithId("users", {
            username: username.trim(),
            user_code: userCode,
            email: normalizedEmail,
            password: hashedPassword,
        });

        res.json({ message: "User registered successfully" });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ error: "Email or username already registered" });
        }

        console.error(error);
        res.status(500).json({ error: "Registration failed" });
    }
});

router.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "All fields required" });
    }

    try {
        const users = await db.collection("users");
        const user = await users.findOne({ email: email.trim().toLowerCase() });

        if (!user) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            return res.status(400).json({ error: "Invalid credentials" });
        }

        const token = jwt.sign(publicUser(user), JWT_SECRET, { expiresIn: "1d" });

        res.json({
            token,
            user: publicUser(user),
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Login failed" });
    }
});

module.exports = router;
