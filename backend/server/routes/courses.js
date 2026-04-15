const express = require("express");

const db = require("../db");
const authenticateToken = require("../middleware/authMiddleware");

const router = express.Router();

function normalizeCourseRole(role) {
    return String(role || "").toLowerCase();
}

function numericId(value) {
    const id = Number(value);
    return Number.isFinite(id) ? id : null;
}

async function getCourseMembership(courseId, userId) {
    const courseMembers = await db.collection("course_members");
    const membership = await courseMembers.findOne({
        course_id: numericId(courseId),
        user_id: Number(userId),
    });

    if (!membership) {
        return null;
    }

    return {
        ...membership,
        normalized_role: normalizeCourseRole(membership.role),
    };
}

router.get("/", authenticateToken, async (req, res) => {
    try {
        const courses = await db.collection("courses");
        const courseMembers = await db.collection("course_members");
        const memberships = await courseMembers
            .find({ user_id: req.user.id })
            .sort({ course_id: -1 })
            .toArray();
        const courseIds = memberships.map((membership) => membership.course_id);
        const courseRows = await courses.find({ id: { $in: courseIds } }).toArray();
        const coursesById = new Map(courseRows.map((course) => [course.id, course]));

        const rows = memberships
            .map((membership) => {
                const course = coursesById.get(membership.course_id);
                if (!course) return null;

                return {
                    ...course,
                    course_role: normalizeCourseRole(membership.role),
                    is_owner: Number(course.user_id) === Number(req.user.id),
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.id - a.id);

        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch courses" });
    }
});

router.get("/discover", authenticateToken, async (req, res) => {
    try {
        const courses = await db.collection("courses");
        const courseMembers = await db.collection("course_members");
        const memberships = await courseMembers.find({ user_id: req.user.id }).toArray();
        const joinedCourseIds = memberships.map((membership) => membership.course_id);
        const rows = await courses
            .find({ id: { $nin: joinedCourseIds } })
            .sort({ id: -1 })
            .toArray();

        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch discover courses" });
    }
});

router.post("/", authenticateToken, async (req, res) => {
    const name = String(req.body.name || "").trim();

    if (!name) {
        return res.status(400).json({ error: "Course name required" });
    }

    try {
        const course = await db.insertWithId("courses", {
            name,
            user_id: req.user.id,
        });

        await db.insertWithId("course_members", {
            course_id: course.id,
            user_id: req.user.id,
            role: "admin",
            joined_at: new Date(),
        });

        res.json({ message: "Course created", courseId: course.id });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ error: "Course already exists or joined" });
        }

        console.error(err);
        res.status(500).json({ error: "Failed to create course" });
    }
});

router.post("/:id/join", authenticateToken, async (req, res) => {
    const courseId = numericId(req.params.id);

    if (!courseId) {
        return res.status(400).json({ error: "Course is required" });
    }

    try {
        const courses = await db.collection("courses");
        const course = await courses.findOne({ id: courseId });

        if (!course) {
            return res.status(404).json({ error: "Course not found" });
        }

        await db.insertWithId("course_members", {
            course_id: courseId,
            user_id: req.user.id,
            role: "student",
            joined_at: new Date(),
        });

        res.json({ message: "Joined course" });
    } catch (err) {
        if (err.code === 11000) {
            return res.json({ message: "Already joined" });
        }

        console.error(err);
        res.status(500).json({ error: "Join failed" });
    }
});

router.get("/:id/members", authenticateToken, async (req, res) => {
    const courseId = numericId(req.params.id);

    if (!courseId) {
        return res.status(400).json({ error: "Course is required" });
    }

    try {
        const membership = await getCourseMembership(courseId, req.user.id);

        if (!membership) {
            return res.status(403).json({ error: "You are not a member of this course" });
        }

        const users = await db.collection("users");
        const courseMembers = await db.collection("course_members");
        const memberships = await courseMembers.find({ course_id: courseId }).toArray();
        const userIds = memberships.map((item) => item.user_id);
        const userRows = await users
            .find({ id: { $in: userIds } }, { projection: { _id: 0, id: 1, username: 1, email: 1 } })
            .toArray();
        const usersById = new Map(userRows.map((user) => [user.id, user]));
        const roleOrder = { admin: 0, teacher: 1, student: 2 };

        const members = memberships
            .map((item) => {
                const user = usersById.get(item.user_id);
                if (!user) return null;
                return {
                    ...user,
                    role: normalizeCourseRole(item.role),
                };
            })
            .filter(Boolean)
            .sort((a, b) => {
                const roleDelta = (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3);
                return roleDelta || a.username.localeCompare(b.username);
            });

        res.json(members);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch course members" });
    }
});

router.patch("/:id/members/:userId", authenticateToken, async (req, res) => {
    const courseId = numericId(req.params.id);
    const targetUserId = numericId(req.params.userId);
    const currentUserId = Number(req.user.id);
    const requestedRole = normalizeCourseRole(req.body.role);

    if (!courseId || !targetUserId) {
        return res.status(400).json({ error: "Course and member are required" });
    }

    if (!["teacher", "student"].includes(requestedRole)) {
        return res.status(400).json({ error: "Role must be teacher or student" });
    }

    try {
        const membership = await getCourseMembership(courseId, currentUserId);

        if (!membership) {
            return res.status(403).json({ error: "You are not a member of this course" });
        }

        if (normalizeCourseRole(membership.normalized_role) !== "admin") {
            return res.status(403).json({ error: "Only course admins can manage roles" });
        }

        if (targetUserId === currentUserId) {
            return res.status(400).json({ error: "Course admin role cannot be changed here" });
        }

        const courses = await db.collection("courses");
        const course = await courses.findOne({ id: courseId });

        if (!course) {
            return res.status(404).json({ error: "Course not found" });
        }

        if (Number(course.user_id) === targetUserId) {
            return res.status(400).json({ error: "Course creator remains the admin" });
        }

        const courseMembers = await db.collection("course_members");
        const result = await courseMembers.updateOne(
            { course_id: courseId, user_id: targetUserId },
            { $set: { role: requestedRole } }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({ error: "Member not found in this course" });
        }

        res.json({ message: "Course role updated", role: requestedRole });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update course role" });
    }
});

router.delete("/:id", authenticateToken, async (req, res) => {
    const courseId = numericId(req.params.id);

    if (!courseId) {
        return res.status(400).json({ error: "Course is required" });
    }

    try {
        const courses = await db.collection("courses");
        const course = await courses.findOne({ id: courseId });

        if (!course) {
            return res.status(404).json({ error: "Course not found" });
        }

        const courseMembers = await db.collection("course_members");

        if (Number(course.user_id) !== Number(req.user.id)) {
            const membership = await getCourseMembership(courseId, req.user.id);

            if (!membership) {
                return res.status(403).json({ error: "You are not a member of this course" });
            }

            await courseMembers.deleteOne({ course_id: courseId, user_id: req.user.id });
            return res.json({ message: "Left course" });
        }

        const [messages, notes, assignments, submissions] = await Promise.all([
            db.collection("messages"),
            db.collection("notes"),
            db.collection("assignments"),
            db.collection("assignment_submissions"),
        ]);
        const assignmentIds = (await assignments.find({ course_id: courseId }).toArray()).map((item) => item.id);

        await Promise.all([
            courseMembers.deleteMany({ course_id: courseId }),
            messages.deleteMany({ course_id: courseId }),
            notes.deleteMany({ course_id: courseId }),
            submissions.deleteMany({ assignment_id: { $in: assignmentIds } }),
            assignments.deleteMany({ course_id: courseId }),
            courses.deleteOne({ id: courseId }),
        ]);

        res.json({ message: "Course deleted" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to delete course" });
    }
});

module.exports = router;
