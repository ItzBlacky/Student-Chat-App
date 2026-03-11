const express = require("express");
const router = express.Router();
const multer = require("multer");

const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");


// MULTER CONFIG
const path = require("path");

const storage = multer.diskStorage({

    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, "../uploads"));
    },

    filename: (req, file, cb) => {
        cb(null, Date.now() + "-" + file.originalname);
    }

});

const upload = multer({ storage });


// UPLOAD NOTE
router.post("/:courseId/notes",
    authenticateToken,
    upload.single("file"),
    async (req, res) => {

        try {

            const { courseId } = req.params;
            const { title } = req.body;

            if (!req.file) {
                return res.status(400).json({ error: "File missing" });
            }

            const filePath = req.file.filename;

            await pool.query(
                "INSERT INTO notes (course_id, user_id, title, file_path) VALUES (?, ?, ?, ?)",
                [
                    courseId,
                    req.user.id,
                    title || req.file.originalname,
                    filePath
                ]
            );

            res.json({
                message: "Note uploaded",
                file: filePath
            });

        } catch (error) {

            console.error(error);

            res.status(500).json({
                error: "Upload failed"
            });

        }

});
router.get("/:courseId/notes", authenticateToken, async (req, res) => {

    const { courseId } = req.params;

    try {

        const [rows] = await pool.query(
            "SELECT * FROM notes WHERE course_id = ? ORDER BY created_at DESC",
            [courseId]
        );

        res.json(rows);

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: "Failed to fetch notes"
        });

    }

});

module.exports = router;