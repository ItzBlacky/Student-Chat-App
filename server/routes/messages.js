const express = require("express");
const router = express.Router();

const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");


// =======================
// GET MESSAGES
// =======================
router.get("/:courseId", authenticateToken, async (req, res) => {

    const courseId = req.params.courseId;

    try {

        const [rows] = await pool.query(
            `
            SELECT messages.*, users.email, users.username
            FROM messages
            JOIN users ON messages.user_id = users.id
            WHERE messages.course_id = ?
            ORDER BY messages.id ASC
            `,
            [courseId]
        );

        res.json(rows);

    } catch (error) {

        console.error(error);
        res.status(500).json({ error: "Database error" });

    }

});


// =======================
// SEND MESSAGE
// =======================
router.post("/:courseId", authenticateToken, async (req, res) => {

    const courseId = req.params.courseId;
    const { content } = req.body;

    if (!content || content.trim() === "") {
        return res.status(400).json({ error: "Message cannot be empty" });
    }

    try {

        // 🔥 CHECK MEMBERSHIP
        const [member] = await pool.query(
            `
            SELECT * FROM course_members
            WHERE course_id = ? AND user_id = ?
            `,
            [courseId, req.user.id]
        );

        if (member.length === 0) {
            return res.status(403).json({
                error: "You are not a member of this course"
            });
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
            userId: req.user.id,
            email: req.user.email,
            username: req.user.username,
            created_at: new Date().toISOString()
        };

        io.to(`course_${courseId}`).emit("newMessage", message);

        res.json(message);

    } catch (error) {

        console.error(error);
        res.status(500).json({ error: "Database error" });

    }

});

module.exports = router;