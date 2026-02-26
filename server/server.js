
const express = require("express");
const cors = require("cors");
const pool = require("./db");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// GET all courses from database
app.get("/courses", async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM courses ORDER BY id DESC");
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Database error" });
    }
});

// POST new course to database
app.post("/courses", async (req, res) => {
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({ error: "Course name is required" });
    }

    try {
        await pool.query("INSERT INTO courses (name) VALUES (?)", [name]);
        res.json({ message: "Course added" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Database error" });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});