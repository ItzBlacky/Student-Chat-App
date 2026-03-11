const express = require("express");
const router = express.Router();

const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");


// GET ALL COURSES
router.get("/", async (req, res) => {

    try {

        const [rows] = await pool.query(
            "SELECT * FROM courses ORDER BY id DESC"
        );

        res.json(rows);

    } catch (error) {

        console.error(error);
        res.status(500).json({ error: "Failed to fetch courses" });

    }

});


// CREATE COURSE
router.post("/", authenticateToken, async (req, res) => {

    const { name } = req.body;

    if (!name || name.trim() === "") {
        return res.status(400).json({ error: "Course name required" });
    }

    try {

        await pool.query(
            "INSERT INTO courses (name, user_id) VALUES (?, ?)",
            [name, req.user.id]
        );

        res.json({ message: "Course created successfully" });

    } catch (error) {

        console.error(error);
        res.status(500).json({ error: "Failed to create course" });

    }

});


// DELETE COURSE
router.delete("/:id", authenticateToken, async (req, res) => {

    const courseId = req.params.id;

    try {

        const [rows] = await pool.query(
            "SELECT user_id FROM courses WHERE id = ?",
            [courseId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "Course not found" });
        }

        if (rows[0].user_id !== req.user.id) {
            return res.status(403).json({ error: "Not allowed to delete this course" });
        }

        await pool.query(
            "DELETE FROM courses WHERE id = ?",
            [courseId]
        );

        res.json({ message: "Course deleted successfully" });

    } catch (error) {

        console.error(error);
        res.status(500).json({ error: "Failed to delete course" });

    }

});

module.exports = router;