const express = require("express");
const router = express.Router();

const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");


// GET MESSAGES
router.get("/:id/messages", authenticateToken, async (req, res) => {

    const courseId = req.params.id;

    try {

        const [rows] = await pool.query(
            "SELECT * FROM messages WHERE course_id = ? ORDER BY id ASC",
            [courseId]
        );

        res.json(rows);

    } catch (error) {

        console.error(error);
        res.status(500).json({ error: "Database error" });

    }

});


// POST MESSAGE
router.post("/:id/messages", authenticateToken, async (req, res) => {

    const courseId = req.params.id;
    const { content } = req.body;

    if (!content || content.trim() === "") {
        return res.status(400).json({ error: "Message cannot be empty" });
    }

    try {

        const [course] = await pool.query(
            "SELECT id FROM courses WHERE id = ?",
            [courseId]
        );

        if (course.length === 0) {
            return res.status(404).json({ error: "Course not found" });
        }

        const [result] = await pool.query(
            "INSERT INTO messages (course_id, content, user_id) VALUES (?, ?, ?)",
            [courseId, content, req.user.id]
        );

        const io = req.app.get("io");

        const message = {
            id: result.insertId,
            courseId,
            content,
            userId: req.user.id
        };

        io.to(`course_${courseId}`).emit("newMessage", message);

        res.json(message);

    } catch (error) {

        console.error(error);
        res.status(500).json({ error: "Database error" });

    }

});

module.exports = router;