const express = require("express");
const router = express.Router();

const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");


// =======================
// GET JOINED COURSES
// =======================
router.get("/", authenticateToken, async (req, res) => {

    try {

        const [rows] = await pool.query(
            `
            SELECT courses.*, courses.user_id = ? AS is_owner
            FROM courses
            JOIN course_members
            ON courses.id = course_members.course_id
            WHERE course_members.user_id = ?
            ORDER BY courses.id DESC
            `,
            [req.user.id, req.user.id]
        );

        res.json(rows);

    } catch (err) {

        console.error(err);
        res.status(500).json({ error: "Failed to fetch courses" });

    }

});


// =======================
// DISCOVER COURSES (NEW)
// =======================
router.get("/discover", authenticateToken, async (req, res) => {

    try {

        const [rows] = await pool.query(
            `
            SELECT *
            FROM courses
            WHERE id NOT IN (
                SELECT course_id
                FROM course_members
                WHERE user_id = ?
            )
            ORDER BY id DESC
            `,
            [req.user.id]
        );

        res.json(rows);

    } catch (err) {

        console.error(err);
        res.status(500).json({ error: "Failed to fetch discover courses" });

    }

});


// =======================
// CREATE COURSE
// =======================
router.post("/", authenticateToken, async (req, res) => {

    const { name } = req.body;

    if (!name) {
        return res.status(400).json({ error: "Course name required" });
    }

    const conn = await pool.getConnection();

    try {

        await conn.beginTransaction();

        const [result] = await conn.query(
            "INSERT INTO courses (name, user_id) VALUES (?, ?)",
            [name, req.user.id]
        );

        const courseId = result.insertId;

        await conn.query(
            "INSERT INTO course_members (course_id, user_id) VALUES (?, ?)",
            [courseId, req.user.id]
        );

        await conn.commit();

        res.json({
            message: "Course created",
            courseId
        });

    } catch (err) {

        await conn.rollback();

        if (err.code === "ER_DUP_ENTRY") {
            return res.status(400).json({
                error: "Course already exists"
            });
        }

        console.error(err);
        res.status(500).json({ error: "Failed to create course" });

    } finally {
        conn.release();
    }

});


// =======================
// JOIN COURSE
// =======================
router.post("/:id/join", authenticateToken, async (req, res) => {

    const courseId = req.params.id;

    try {

        await pool.query(
            "INSERT INTO course_members (course_id, user_id) VALUES (?, ?)",
            [courseId, req.user.id]
        );

        res.json({ message: "Joined course" });

    } catch (err) {

        if (err.code === "ER_DUP_ENTRY") {
            return res.json({ message: "Already joined" });
        }

        console.error(err);
        res.status(500).json({ error: "Join failed" });

    }

});


// =======================
// DELETE COURSE
// =======================
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
            const [membership] = await pool.query(
                "SELECT * FROM course_members WHERE course_id = ? AND user_id = ?",
                [courseId, req.user.id]
            );

            if (membership.length === 0) {
                return res.status(403).json({ error: "You are not a member of this course" });
            }

            await pool.query(
                "DELETE FROM course_members WHERE course_id = ? AND user_id = ?",
                [courseId, req.user.id]
            );

            return res.json({ message: "Left course" });
        }

        // 🔥 CLEANUP RELATED DATA
        await pool.query("DELETE FROM course_members WHERE course_id = ?", [courseId]);
        await pool.query("DELETE FROM messages WHERE course_id = ?", [courseId]);
        await pool.query("DELETE FROM notes WHERE course_id = ?", [courseId]);

        await pool.query("DELETE FROM courses WHERE id = ?", [courseId]);

        res.json({ message: "Course deleted" });

    } catch (error) {

        console.error(error);
        res.status(500).json({ error: "Failed to delete course" });

    }

});

module.exports = router;
