const express = require("express");
const multer = require("multer");
const path = require("path");

const db = require("../db");
const authenticateToken = require("../middleware/authMiddleware");

const router = express.Router();

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

function numericId(value) {
    const id = Number(value);
    return Number.isFinite(id) ? id : null;
}

async function getCourseRole(courseId, userId) {
    const courseMembers = await db.collection("course_members");
    const membership = await courseMembers.findOne({ course_id: courseId, user_id: userId });
    return membership ? normalizeRole(membership.role) : null;
}

async function getAssignmentCourseRole(assignmentId, userId) {
    const assignments = await db.collection("assignments");
    const assignment = await assignments.findOne({ id: assignmentId });

    if (!assignment) {
        return null;
    }

    const role = await getCourseRole(assignment.course_id, userId);
    return role ? { course_id: assignment.course_id, role } : null;
}

async function attachTeacherNames(assignments) {
    const users = await db.collection("users");
    const userIds = [...new Set(assignments.map((assignment) => assignment.user_id))];
    const userRows = await users
        .find({ id: { $in: userIds } }, { projection: { _id: 0, id: 1, username: 1 } })
        .toArray();
    const usersById = new Map(userRows.map((user) => [user.id, user]));

    return assignments.map((assignment) => ({
        ...assignment,
        teacher_name: usersById.get(assignment.user_id)?.username || "Unknown",
    }));
}

router.get("/:courseId", authenticateToken, async (req, res) => {
    const courseId = numericId(req.params.courseId);

    if (!courseId) {
        return res.status(400).json({ error: "Course is required" });
    }

    try {
        const courseRole = await getCourseRole(courseId, req.user.id);

        if (!courseRole) {
            return res.status(403).json({ error: "You are not a member of this course" });
        }

        const assignments = await db.collection("assignments");
        const rows = await assignments
            .find({ course_id: courseId }, { projection: { _id: 0 } })
            .sort({ created_at: -1 })
            .toArray();

        res.json(await attachTeacherNames(rows));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Database error" });
    }
});

router.post("/:courseId", authenticateToken, async (req, res) => {
    const courseId = numericId(req.params.courseId);
    const { title, description, dueDate } = req.body;

    if (!courseId) {
        return res.status(400).json({ error: "Course is required" });
    }

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

        const newAssignment = await db.insertWithId("assignments", {
            course_id: courseId,
            user_id: req.user.id,
            title,
            description: description || "",
            due_date: dueDate || null,
        });

        const [assignmentWithTeacher] = await attachTeacherNames([newAssignment]);
        res.json(assignmentWithTeacher);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Database error" });
    }
});

router.post("/:assignmentId/submit", authenticateToken, uploadSubmission.single("file"), async (req, res) => {
    const assignmentId = numericId(req.params.assignmentId);
    const { submissionText } = req.body;

    if (!assignmentId) {
        return res.status(400).json({ error: "Assignment is required" });
    }

    try {
        const assignmentMembership = await getAssignmentCourseRole(assignmentId, req.user.id);

        if (!assignmentMembership) {
            return res.status(403).json({ error: "Assignment not found or you are not a member of this course" });
        }

        if (assignmentMembership.role !== "student") {
            return res.status(403).json({ error: "Only students can submit assignments" });
        }

        const submissions = await db.collection("assignment_submissions");
        const existing = await submissions.findOne({ assignment_id: assignmentId, user_id: req.user.id });
        const filePath = req.file ? req.file.filename : existing?.file_path || null;

        if (existing) {
            await submissions.updateOne(
                { id: existing.id },
                {
                    $set: {
                        submission_text: submissionText || "",
                        file_path: filePath,
                        submitted_at: new Date(),
                    }
                }
            );
        } else {
            await db.insertWithId("assignment_submissions", {
                assignment_id: assignmentId,
                user_id: req.user.id,
                submission_text: submissionText || "",
                file_path: filePath,
                submitted_at: new Date(),
            });
        }

        res.json({ message: "Assignment submitted successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Database error" });
    }
});

router.get("/:assignmentId/submissions", authenticateToken, async (req, res) => {
    const assignmentId = numericId(req.params.assignmentId);

    if (!assignmentId) {
        return res.status(400).json({ error: "Assignment is required" });
    }

    try {
        const assignmentMembership = await getAssignmentCourseRole(assignmentId, req.user.id);

        if (!assignmentMembership) {
            return res.status(403).json({ error: "Assignment not found or you are not a member of this course" });
        }

        if (!["admin", "teacher"].includes(assignmentMembership.role)) {
            return res.status(403).json({ error: "Only course teachers or admins can view submissions" });
        }

        const submissions = await db.collection("assignment_submissions");
        const users = await db.collection("users");
        const submissionRows = await submissions
            .find({ assignment_id: assignmentId }, { projection: { _id: 0 } })
            .sort({ submitted_at: -1 })
            .toArray();
        const userIds = [...new Set(submissionRows.map((submission) => submission.user_id))];
        const userRows = await users
            .find({ id: { $in: userIds } }, { projection: { _id: 0, id: 1, username: 1, email: 1 } })
            .toArray();
        const usersById = new Map(userRows.map((user) => [user.id, user]));

        const rows = submissionRows.map((submission) => ({
            ...submission,
            username: usersById.get(submission.user_id)?.username || "Unknown",
            email: usersById.get(submission.user_id)?.email || "",
        }));

        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Database error" });
    }
});

module.exports = router;
