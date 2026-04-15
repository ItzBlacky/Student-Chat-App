const express = require("express");

const db = require("../db");
const authenticateToken = require("../middleware/authMiddleware");

const router = express.Router();

function numericId(value) {
    const id = Number(value);
    return Number.isFinite(id) ? id : null;
}

async function isCourseMember(courseId, userId) {
    const courseMembers = await db.collection("course_members");
    return !!await courseMembers.findOne({ course_id: courseId, user_id: userId });
}

async function attachUsers(messages) {
    const users = await db.collection("users");
    const userIds = [...new Set(messages.map((message) => message.user_id))];
    const userRows = await users
        .find({ id: { $in: userIds } }, { projection: { _id: 0, id: 1, username: 1, email: 1, user_code: 1 } })
        .toArray();
    const usersById = new Map(userRows.map((user) => [user.id, user]));

    return messages.map((message) => {
        const user = usersById.get(message.user_id) || {};
        return {
            ...message,
            username: user.username,
            email: user.email,
            user_code: user.user_code,
        };
    });
}

router.get("/:courseId", authenticateToken, async (req, res) => {
    const courseId = numericId(req.params.courseId);
    const beforeId = Number(req.query.beforeId || 0);
    const limit = Math.min(Math.max(Number(req.query.limit || 40), 1), 100);

    if (!courseId) {
        return res.status(400).json({ error: "Course is required" });
    }

    try {
        if (!await isCourseMember(courseId, req.user.id)) {
            return res.status(403).json({ error: "You are not a member of this course" });
        }

        const messages = await db.collection("messages");
        const filter = { course_id: courseId };

        if (beforeId > 0) {
            filter.id = { $lt: beforeId };
        }

        const recentMessages = await messages
            .find(filter, { projection: { _id: 0 } })
            .sort({ id: -1 })
            .limit(limit)
            .toArray();
        const rows = await attachUsers(recentMessages.reverse());
        const oldestId = rows.length ? rows[0].id : null;
        const olderCount = oldestId
            ? await messages.countDocuments({ course_id: courseId, id: { $lt: oldestId } })
            : 0;

        res.json({
            messages: rows,
            hasMore: olderCount > 0,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Database error" });
    }
});

router.post("/:courseId", authenticateToken, async (req, res) => {
    const courseId = numericId(req.params.courseId);
    const content = String(req.body.content || "");

    if (!courseId) {
        return res.status(400).json({ error: "Course is required" });
    }

    if (!content || content.trim() === "") {
        return res.status(400).json({ error: "Message cannot be empty" });
    }

    try {
        if (!await isCourseMember(courseId, req.user.id)) {
            return res.status(403).json({ error: "You are not a member of this course" });
        }

        const savedMessage = await db.insertWithId("messages", {
            course_id: courseId,
            content,
            user_id: req.user.id,
        });

        const io = req.app.get("io");
        const message = {
            ...savedMessage,
            courseId,
            userId: req.user.id,
            email: req.user.email,
            username: req.user.username,
            user_code: req.user.user_code,
            created_at: savedMessage.created_at.toISOString(),
        };

        io.to(`course_${courseId}`).emit("newMessage", message);
        res.json(message);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Database error" });
    }
});

module.exports = router;
