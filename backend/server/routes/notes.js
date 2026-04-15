const express = require("express");
const multer = require("multer");
const path = require("path");

const db = require("../db");
const authenticateToken = require("../middleware/authMiddleware");

const router = express.Router();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, "../uploads"));
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    }
});

const upload = multer({ storage });

function numericId(value) {
    const id = Number(value);
    return Number.isFinite(id) ? id : null;
}

async function isCourseMember(courseId, userId) {
    const courseMembers = await db.collection("course_members");
    return !!await courseMembers.findOne({ course_id: courseId, user_id: userId });
}

router.post("/:courseId/notes", authenticateToken, upload.single("file"), async (req, res) => {
    try {
        const courseId = numericId(req.params.courseId);
        const { title } = req.body;

        if (!courseId) {
            return res.status(400).json({ error: "Course is required" });
        }

        if (!await isCourseMember(courseId, req.user.id)) {
            return res.status(403).json({ error: "You are not a member of this course" });
        }

        if (!req.file) {
            return res.status(400).json({ error: "File missing" });
        }

        const filePath = req.file.filename;
        await db.insertWithId("notes", {
            course_id: courseId,
            user_id: req.user.id,
            title: title || req.file.originalname,
            file_path: filePath,
        });

        res.json({
            message: "Note uploaded",
            file: filePath,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Upload failed" });
    }
});

router.get("/:courseId/notes", authenticateToken, async (req, res) => {
    const courseId = numericId(req.params.courseId);

    if (!courseId) {
        return res.status(400).json({ error: "Course is required" });
    }

    try {
        if (!await isCourseMember(courseId, req.user.id)) {
            return res.status(403).json({ error: "You are not a member of this course" });
        }

        const notes = await db.collection("notes");
        const rows = await notes
            .find({ course_id: courseId }, { projection: { _id: 0 } })
            .sort({ created_at: -1 })
            .toArray();

        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch notes" });
    }
});

module.exports = router;
