const express = require("express");
const router = express.Router();
const multer = require("multer");

const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");

// MULTER CONFIG for assignment submissions
const path = require("path");

const submissionStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, "../uploads"));
    },
    filename: (req, file, cb) => {
        cb(null, "submission-" + Date.now() + "-" + file.originalname);
    }
});

const uploadSubmission = multer({ storage: submissionStorage });

// =======================
// GET ASSIGNMENTS FOR A COURSE
// =======================
router.get("/:courseId", authenticateToken, async (req, res) => {
    const courseId = req.params.courseId;

    try {
        // Check if user is a member of the course
        const [member] = await pool.query(
            "SELECT * FROM course_members WHERE course_id = ? AND user_id = ?",
            [courseId, req.user.id]
        );

        if (member.length === 0) {
            return res.status(403).json({ error: "You are not a member of this course" });
        }

        const [assignments] = await pool.query(
            `SELECT assignments.*, users.username as teacher_name
             FROM assignments
             JOIN users ON assignments.user_id = users.id
             WHERE assignments.course_id = ?
             ORDER BY assignments.created_at DESC`,
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
        // Check if user is a teacher
        if (req.user.role !== 'teacher') {
            return res.status(403).json({ error: "Only teachers can create assignments" });
        }

        // Check if user is a member of the course
        const [member] = await pool.query(
            "SELECT * FROM course_members WHERE course_id = ? AND user_id = ?",
            [courseId, req.user.id]
        );

        if (member.length === 0) {
            return res.status(403).json({ error: "You are not a member of this course" });
        }

        const [result] = await pool.query(
            "INSERT INTO assignments (course_id, user_id, title, description, due_date) VALUES (?, ?, ?, ?, ?)",
            [courseId, req.user.id, title, description || "", dueDate || null]
        );

        const [newAssignment] = await pool.query(
            `SELECT assignments.*, users.username as teacher_name
             FROM assignments
             JOIN users ON assignments.user_id = users.id
             WHERE assignments.id = ?`,
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
        // Check if assignment exists and user is member of the course
        const [assignment] = await pool.query(
            `SELECT assignments.*, course_members.user_id as member_id
             FROM assignments
             JOIN course_members ON assignments.course_id = course_members.course_id
             WHERE assignments.id = ? AND course_members.user_id = ?`,
            [assignmentId, req.user.id]
        );

        if (assignment.length === 0) {
            return res.status(403).json({ error: "Assignment not found or you are not a member of this course" });
        }

        const filePath = req.file ? req.file.filename : null;

        // Check if user already submitted
        const [existing] = await pool.query(
            "SELECT * FROM assignment_submissions WHERE assignment_id = ? AND user_id = ?",
            [assignmentId, req.user.id]
        );

        if (existing.length > 0) {
            // Update existing submission
            await pool.query(
                "UPDATE assignment_submissions SET submission_text = ?, file_path = ?, submitted_at = CURRENT_TIMESTAMP WHERE id = ?",
                [submissionText || "", filePath, existing[0].id]
            );
        } else {
            // Create new submission
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
// GET SUBMISSIONS FOR AN ASSIGNMENT (for teachers)
// =======================
router.get("/:assignmentId/submissions", authenticateToken, async (req, res) => {
    const assignmentId = req.params.assignmentId;

    try {
        // Check if user created the assignment or is a teacher
        const [assignment] = await pool.query(
            "SELECT * FROM assignments WHERE id = ? AND user_id = ?",
            [assignmentId, req.user.id]
        );

        if (assignment.length === 0) {
            return res.status(403).json({ error: "You can only view submissions for assignments you created" });
        }

        const [submissions] = await pool.query(
            `SELECT assignment_submissions.*, users.username, users.email
             FROM assignment_submissions
             JOIN users ON assignment_submissions.user_id = users.id
             WHERE assignment_submissions.assignment_id = ?
             ORDER BY assignment_submissions.submitted_at DESC`,
            [assignmentId]
        );

        res.json(submissions);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Database error" });
    }
});

module.exports = router;