const express = require("express");
const router = express.Router();

const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");

function normalizeCourseRole(role) {
    return String(role || "").toLowerCase();
}

async function getCourseMembership(courseId, userId) {
    const [rows] = await pool.query(
        `
        SELECT course_members.*, LOWER(course_members.role) AS normalized_role
        FROM course_members
        WHERE course_members.course_id = ? AND course_members.user_id = ?
        `,
        [courseId, userId]
    );

    return rows[0] || null;
}

// =======================
// GET JOINED COURSES
// =======================
router.get("/", authenticateToken, async (req, res) => {
    try {
        const [rows] = await pool.query(
            `
            SELECT
                courses.*,
                LOWER(course_members.role) AS course_role,
                courses.user_id = ? AS is_owner
            FROM courses
            JOIN course_members ON courses.id = course_members.course_id
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
// DISCOVER COURSES
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
            "INSERT INTO course_members (course_id, user_id, role) VALUES (?, ?, ?)",
            [courseId, req.user.id, "admin"]
        );

        await conn.commit();

        res.json({ message: "Course created", courseId });
    } catch (err) {
        await conn.rollback();

        if (err.code === "ER_DUP_ENTRY") {
            return res.status(400).json({ error: "Course already exists" });
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
            "INSERT INTO course_members (course_id, user_id, role) VALUES (?, ?, ?)",
            [courseId, req.user.id, "student"]
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
// GET COURSE MEMBERS
// =======================
router.get("/:id/members", authenticateToken, async (req, res) => {
    const courseId = req.params.id;

    try {
        const membership = await getCourseMembership(courseId, req.user.id);

        if (!membership) {
            return res.status(403).json({ error: "You are not a member of this course" });
        }

        const [members] = await pool.query(
            `
            SELECT
                users.id,
                users.username,
                users.email,
                LOWER(course_members.role) AS role
            FROM course_members
            JOIN users ON users.id = course_members.user_id
            WHERE course_members.course_id = ?
            ORDER BY
                CASE LOWER(course_members.role)
                    WHEN 'admin' THEN 0
                    WHEN 'teacher' THEN 1
                    ELSE 2
                END,
                users.username ASC
            `,
            [courseId]
        );

        res.json(members);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch course members" });
    }
});

// =======================
// UPDATE COURSE MEMBER ROLE
// =======================
router.patch("/:id/members/:userId", authenticateToken, async (req, res) => {
    const courseId = req.params.id;
    const targetUserId = Number(req.params.userId);
    const requestedRole = normalizeCourseRole(req.body.role);

    if (!["teacher", "student"].includes(requestedRole)) {
        return res.status(400).json({ error: "Role must be teacher or student" });
    }

    try {
        const membership = await getCourseMembership(courseId, req.user.id);

        if (!membership) {
            return res.status(403).json({ error: "You are not a member of this course" });
        }

        if (normalizeCourseRole(membership.normalized_role) !== "admin") {
            return res.status(403).json({ error: "Only course admins can manage roles" });
        }

        if (targetUserId === req.user.id) {
            return res.status(400).json({ error: "Course admin role cannot be changed here" });
        }

        const [courseRows] = await pool.query(
            "SELECT user_id FROM courses WHERE id = ?",
            [courseId]
        );

        if (courseRows.length === 0) {
            return res.status(404).json({ error: "Course not found" });
        }

        if (courseRows[0].user_id === targetUserId) {
            return res.status(400).json({ error: "Course creator remains the admin" });
        }

        const [targetRows] = await pool.query(
            "SELECT * FROM course_members WHERE course_id = ? AND user_id = ?",
            [courseId, targetUserId]
        );

        if (targetRows.length === 0) {
            return res.status(404).json({ error: "Member not found in this course" });
        }

        await pool.query(
            "UPDATE course_members SET role = ? WHERE course_id = ? AND user_id = ?",
            [requestedRole, courseId, targetUserId]
        );

        res.json({ message: "Course role updated", role: requestedRole });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update course role" });
    }
});

// =======================
// DELETE COURSE OR LEAVE COURSE
// =======================
router.delete("/:id", authenticateToken, async (req, res) => {
    const courseId = req.params.id;

    try {
        const [courseRows] = await pool.query(
            "SELECT user_id FROM courses WHERE id = ?",
            [courseId]
        );

        if (courseRows.length === 0) {
            return res.status(404).json({ error: "Course not found" });
        }

        if (courseRows[0].user_id !== req.user.id) {
            const membership = await getCourseMembership(courseId, req.user.id);

            if (!membership) {
                return res.status(403).json({ error: "You are not a member of this course" });
            }

            await pool.query(
                "DELETE FROM course_members WHERE course_id = ? AND user_id = ?",
                [courseId, req.user.id]
            );

            return res.json({ message: "Left course" });
        }

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
