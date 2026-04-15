const express = require("express");
const router = express.Router();
const multer = require("multer");

const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");

const path = require("path");

const submissionStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, "../uploads"));
    },
    filename: (req, file, cb) => {
        cb(null, `submission-${Date.now()}-${file.originalname}`);
    }
});

const uploadSubmission = multer({ storage: submissionStorage });

function normalizeRole(role) {
    return String(role || "").toLowerCase();
}

async function getCourseRole(courseId, userId) {
    const [rows] = await pool.query(
        `
        SELECT LOWER(role) AS role
        FROM course_members
        WHERE course_id = ? AND user_id = ?
        `,
        [courseId, userId]
    );

    return rows[0]?.role || null;
}

async function getAssignmentCourseRole(assignmentId, userId) {
    const [rows] = await pool.query(
        `
        SELECT assignments.course_id, LOWER(course_members.role) AS role
        FROM assignments
        JOIN course_members ON assignments.course_id = course_members.course_id
        WHERE assignments.id = ? AND course_members.user_id = ?
        `,
        [assignmentId, userId]
    );

    return rows[0] || null;
}

// =======================
// GET ASSIGNMENTS FOR A COURSE
// =======================
router.get("/:courseId", authenticateToken, async (req, res) => {
    const courseId = req.params.courseId;

    try {
        const courseRole = await getCourseRole(courseId, req.user.id);

        if (!courseRole) {
            return res.status(403).json({ error: "You are not a member of this course" });
        }

        const [assignments] = await pool.query(
            `
            SELECT assignments.*, users.username AS teacher_name
            FROM assignments
            JOIN users ON assignments.user_id = users.id
            WHERE assignments.course_id = ?
            ORDER BY assignments.created_at DESC
            `,
            [courseId]
        );

        res.json(assignments);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Database error" });
    }
});

// =======================
// CREATE ASSIGNMENT
// =======================
router.post("/:courseId", authenticateToken, async (req, res) => {
    const courseId = req.params.courseId;
    const { title, description, dueDate } = req.body;

    if (!title || title.trim() === "") {
        return res.status(400).json({ error: "Assignment title is required" });
    }

    try {
        const courseRole = await getCourseRole(courseId, req.user.id);

        if (!courseRole) {
            return res.status(403).json({ error: "You are not a member of this course" });
        }

        if (!["admin", "teacher"].includes(normalizeRole(courseRole))) {
            return res.status(403).json({ error: "Only course teachers or admins can create assignments" });
        }

        const [result] = await pool.query(
            "INSERT INTO assignments (course_id, user_id, title, description, due_date) VALUES (?, ?, ?, ?, ?)",
            [courseId, req.user.id, title, description || "", dueDate || null]
        );

        const [newAssignment] = await pool.query(
            `
            SELECT assignments.*, users.username AS teacher_name
            FROM assignments
            JOIN users ON assignments.user_id = users.id
            WHERE assignments.id = ?
            `,
            [result.insertId]
        );

        res.json(newAssignment[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Database error" });
    }
});

// =======================
// SUBMIT ASSIGNMENT
// =======================
router.post("/:assignmentId/submit", authenticateToken, uploadSubmission.single("file"), async (req, res) => {
    const assignmentId = req.params.assignmentId;
    const { submissionText } = req.body;

    try {
        const assignmentMembership = await getAssignmentCourseRole(assignmentId, req.user.id);

        if (!assignmentMembership) {
            return res.status(403).json({ error: "Assignment not found or you are not a member of this course" });
        }

        if (assignmentMembership.role !== "student") {
            return res.status(403).json({ error: "Only students can submit assignments" });
        }

        const filePath = req.file ? req.file.filename : null;

        const [existing] = await pool.query(
            "SELECT * FROM assignment_submissions WHERE assignment_id = ? AND user_id = ?",
            [assignmentId, req.user.id]
        );

        if (existing.length > 0) {
            await pool.query(
                "UPDATE assignment_submissions SET submission_text = ?, file_path = ?, submitted_at = CURRENT_TIMESTAMP WHERE id = ?",
                [submissionText || "", filePath, existing[0].id]
            );
        } else {
            await pool.query(
                "INSERT INTO assignment_submissions (assignment_id, user_id, submission_text, file_path) VALUES (?, ?, ?, ?)",
                [assignmentId, req.user.id, submissionText || "", filePath]
            );
        }

        res.json({ message: "Assignment submitted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Database error" });
    }
});

// =======================
// GET SUBMISSIONS FOR AN ASSIGNMENT
// =======================
router.get("/:assignmentId/submissions", authenticateToken, async (req, res) => {
    const assignmentId = req.params.assignmentId;

    try {
        const assignmentMembership = await getAssignmentCourseRole(assignmentId, req.user.id);

        if (!assignmentMembership) {
            return res.status(403).json({ error: "Assignment not found or you are not a member of this course" });
        }

        if (!["admin", "teacher"].includes(assignmentMembership.role)) {
            return res.status(403).json({ error: "Only course teachers or admins can view submissions" });
        }

        const [submissions] = await pool.query(
            `
            SELECT assignment_submissions.*, users.username, users.email
            FROM assignment_submissions
            JOIN users ON assignment_submissions.user_id = users.id
            WHERE assignment_submissions.assignment_id = ?
            ORDER BY assignment_submissions.submitted_at DESC
            `,
            [assignmentId]
        );

        res.json(submissions);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Database error" });
    }
});

module.exports = router;
