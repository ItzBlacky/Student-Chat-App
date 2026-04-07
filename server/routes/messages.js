const express = require("express");
const router = express.Router();

const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");


// =======================
// GET MESSAGES
// =======================
router.get("/:courseId", authenticateToken, async (req, res) => {

    const courseId = req.params.courseId;
    const beforeId = Number(req.query.beforeId || 0);
    const limit = Math.min(Math.max(Number(req.query.limit || 40), 1), 100);

    try {
        const [member] = await pool.query(
            `
            SELECT id
            FROM course_members
            WHERE course_id = ? AND user_id = ?
            LIMIT 1
            `,
            [courseId, req.user.id]
        );

        if (member.length === 0) {
            return res.status(403).json({
                error: "You are not a member of this course"
            });
        }

        const params = [courseId];
        let beforeClause = "";

        if (beforeId > 0) {
            beforeClause = "AND messages.id < ?";
            params.push(beforeId);
        }

        params.push(limit);

        const [rows] = await pool.query(
            `
            SELECT *
            FROM (
                SELECT messages.*, users.email, users.username, users.user_code
                FROM messages
                JOIN users ON messages.user_id = users.id
                WHERE messages.course_id = ?
                ${beforeClause}
                ORDER BY messages.id DESC
                LIMIT ?
            ) recent_messages
            ORDER BY id ASC
            `,
            params
        );

        const oldestId = rows.length ? rows[0].id : null;
        const [olderRows] = oldestId
            ? await pool.query(
                `
                SELECT COUNT(*) AS total
                FROM messages
                WHERE course_id = ?
                  AND id < ?
                `,
                [courseId, oldestId]
            )
            : [[{ total: 0 }]];

        res.json({
            messages: rows,
            hasMore: Number(olderRows[0]?.total || 0) > 0,
        });

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
