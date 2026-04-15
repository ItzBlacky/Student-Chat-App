const express = require("express");

const pool = require("../db");
const authenticateToken = require("../middleware/authMiddleware");

const router = express.Router();

function buildPairKey(userA, userB) {
    const low = Math.min(Number(userA), Number(userB));
    const high = Math.max(Number(userA), Number(userB));
    return `${low}:${high}`;
}

function sortUserPair(userA, userB) {
    const low = Math.min(Number(userA), Number(userB));
    const high = Math.max(Number(userA), Number(userB));
    return [low, high];
}

async function ensureConversation(userA, userB) {
    const [firstUserId, secondUserId] = sortUserPair(userA, userB);

    const [existing] = await pool.query(
        `
        SELECT id, user_one_id, user_two_id
        FROM private_conversations
        WHERE user_one_id = ? AND user_two_id = ?
        LIMIT 1
        `,
        [firstUserId, secondUserId]
    );

    if (existing.length > 0) {
        return existing[0];
    }

    const [result] = await pool.query(
        `
        INSERT INTO private_conversations (user_one_id, user_two_id)
        VALUES (?, ?)
        `,
        [firstUserId, secondUserId]
    );

    return {
        id: result.insertId,
        user_one_id: firstUserId,
        user_two_id: secondUserId,
    };
}

async function getFriendship(currentUserId, otherUserId) {
    const pairKey = buildPairKey(currentUserId, otherUserId);
    const [rows] = await pool.query(
        `
        SELECT *
        FROM friend_requests
        WHERE pair_key = ?
        LIMIT 1
        `,
        [pairKey]
    );

    return rows[0] || null;
}

async function requireAcceptedFriendship(currentUserId, otherUserId) {
    const friendship = await getFriendship(currentUserId, otherUserId);

    if (!friendship || friendship.status !== "accepted") {
        return null;
    }

    return friendship;
}

function formatPeopleStatus(friendship, currentUserId) {
    if (!friendship) {
        return "none";
    }

    if (friendship.status === "accepted") {
        return "friend";
    }

    if (friendship.status === "pending") {
        return Number(friendship.sender_id) === Number(currentUserId)
            ? "outgoing_pending"
            : "incoming_pending";
    }

    return "none";
}

async function getCourseSummaryForUser(userId) {
    const [rows] = await pool.query(
        `
        SELECT c.id, c.name, LOWER(cm.role) AS role
        FROM course_members cm
        JOIN courses c ON c.id = cm.course_id
        WHERE cm.user_id = ?
        ORDER BY c.name ASC
        `,
        [userId]
    );

    return rows;
}

async function getFriendCountForUser(userId) {
    const [rows] = await pool.query(
        `
        SELECT COUNT(*) AS total
        FROM friend_requests
        WHERE status = 'accepted'
          AND (sender_id = ? OR receiver_id = ?)
        `,
        [userId, userId]
    );

    return Number(rows[0]?.total || 0);
}

async function getFriendsForUser(userId, perspectiveUserId = userId) {
    const [rows] = await pool.query(
        `
        SELECT
            u.id,
            u.username,
            u.email,
            u.user_code,
            pc.id AS conversation_id,
            COALESCE(common_courses.common_courses, 0) AS mutual_courses,
            COALESCE(common_courses.common_course_names, '') AS common_course_names
        FROM friend_requests fr
        JOIN users u
            ON u.id = CASE
                WHEN fr.sender_id = ? THEN fr.receiver_id
                ELSE fr.sender_id
            END
        LEFT JOIN private_conversations pc
            ON (
                (pc.user_one_id = ? AND pc.user_two_id = u.id)
                OR
                (pc.user_one_id = u.id AND pc.user_two_id = ?)
            )
        LEFT JOIN (
            SELECT
                cm_other.user_id,
                COUNT(DISTINCT cm_other.course_id) AS common_courses,
                GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') AS common_course_names
            FROM course_members cm_self
            JOIN course_members cm_other
                ON cm_self.course_id = cm_other.course_id
                AND cm_other.user_id <> cm_self.user_id
            JOIN courses c ON c.id = cm_self.course_id
            WHERE cm_self.user_id = ?
            GROUP BY cm_other.user_id
        ) AS common_courses
            ON common_courses.user_id = u.id
        WHERE fr.status = 'accepted'
          AND (fr.sender_id = ? OR fr.receiver_id = ?)
        ORDER BY u.username ASC
        `,
        [userId, perspectiveUserId, perspectiveUserId, perspectiveUserId, userId, userId]
    );

    return rows;
}

async function getMutualFriends(currentUserId, otherUserId) {
    const [rows] = await pool.query(
        `
        SELECT
            u.id,
            u.username,
            u.email,
            u.user_code,
            pc.id AS conversation_id,
            COALESCE(common_courses.common_courses, 0) AS mutual_courses,
            COALESCE(common_courses.common_course_names, '') AS common_course_names
        FROM friend_requests fr_other
        JOIN users u
            ON u.id = CASE
                WHEN fr_other.sender_id = ? THEN fr_other.receiver_id
                ELSE fr_other.sender_id
            END
        JOIN friend_requests fr_self
            ON fr_self.status = 'accepted'
           AND fr_self.pair_key = CONCAT(LEAST(?, u.id), ':', GREATEST(?, u.id))
        LEFT JOIN private_conversations pc
            ON (
                (pc.user_one_id = ? AND pc.user_two_id = u.id)
                OR
                (pc.user_one_id = u.id AND pc.user_two_id = ?)
            )
        LEFT JOIN (
            SELECT
                cm_other.user_id,
                COUNT(DISTINCT cm_other.course_id) AS common_courses,
                GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') AS common_course_names
            FROM course_members cm_self
            JOIN course_members cm_other
                ON cm_self.course_id = cm_other.course_id
                AND cm_other.user_id <> cm_self.user_id
            JOIN courses c ON c.id = cm_self.course_id
            WHERE cm_self.user_id = ?
            GROUP BY cm_other.user_id
        ) AS common_courses
            ON common_courses.user_id = u.id
        WHERE fr_other.status = 'accepted'
          AND (fr_other.sender_id = ? OR fr_other.receiver_id = ?)
          AND u.id NOT IN (?, ?)
        ORDER BY u.username ASC
        `,
        [
            otherUserId,
            currentUserId,
            currentUserId,
            currentUserId,
            currentUserId,
            currentUserId,
            otherUserId,
            otherUserId,
            currentUserId,
            otherUserId,
        ]
    );

    return rows;
}

router.get("/profile", authenticateToken, async (req, res) => {
    const userId = req.user.id;

    try {
        const [courses, totalFriends, friendList] = await Promise.all([
            getCourseSummaryForUser(userId),
            getFriendCountForUser(userId),
            getFriendsForUser(userId),
        ]);

        res.json({
            id: req.user.id,
            username: req.user.username,
            email: req.user.email,
            user_code: req.user.user_code,
            total_courses: courses.length,
            total_friends: totalFriends,
            courses,
            friends: friendList,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch profile" });
    }
});

router.get("/users/:userId/summary", authenticateToken, async (req, res) => {
    const targetUserId = Number(req.params.userId);

    if (!targetUserId) {
        return res.status(400).json({ error: "User is required" });
    }

    try {
        const [userRows] = await pool.query(
            `
            SELECT id, username, email, user_code
            FROM users
            WHERE id = ?
            LIMIT 1
            `,
            [targetUserId]
        );

        if (userRows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }

        const [courses, totalFriends, mutualFriends] = await Promise.all([
            getCourseSummaryForUser(targetUserId),
            getFriendCountForUser(targetUserId),
            targetUserId === req.user.id
                ? getFriendsForUser(targetUserId)
                : getMutualFriends(req.user.id, targetUserId),
        ]);

        const friendship = targetUserId === req.user.id
            ? null
            : await getFriendship(req.user.id, targetUserId);

        res.json({
            ...userRows[0],
            total_courses: courses.length,
            total_friends: totalFriends,
            courses,
            friends: targetUserId === req.user.id ? mutualFriends : undefined,
            mutual_friends: mutualFriends,
            relationship: formatPeopleStatus(friendship, req.user.id),
            request_id: friendship?.id || null,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch user summary" });
    }
});

router.get("/overview", authenticateToken, async (req, res) => {
    const userId = req.user.id;

    try {
        const friends = await getFriendsForUser(userId);

        const [incomingRequests] = await pool.query(
            `
            SELECT
                fr.id,
                fr.created_at,
                u.id AS user_id,
                u.username,
                u.email,
                u.user_code,
                COALESCE(common_courses.common_courses, 0) AS mutual_courses,
                COALESCE(common_courses.common_course_names, '') AS common_course_names
            FROM friend_requests fr
            JOIN users u ON u.id = fr.sender_id
            LEFT JOIN (
                SELECT
                    cm_other.user_id,
                    COUNT(DISTINCT cm_other.course_id) AS common_courses,
                    GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') AS common_course_names
                FROM course_members cm_self
                JOIN course_members cm_other
                    ON cm_self.course_id = cm_other.course_id
                    AND cm_other.user_id <> cm_self.user_id
                JOIN courses c ON c.id = cm_self.course_id
                WHERE cm_self.user_id = ?
                GROUP BY cm_other.user_id
            ) AS common_courses
                ON common_courses.user_id = u.id
            WHERE fr.receiver_id = ?
              AND fr.status = 'pending'
            ORDER BY fr.created_at DESC
            `,
            [userId, userId]
        );

        const [outgoingRequests] = await pool.query(
            `
            SELECT
                fr.id,
                fr.created_at,
                u.id AS user_id,
                u.username,
                u.email,
                u.user_code,
                COALESCE(common_courses.common_courses, 0) AS mutual_courses,
                COALESCE(common_courses.common_course_names, '') AS common_course_names
            FROM friend_requests fr
            JOIN users u ON u.id = fr.receiver_id
            LEFT JOIN (
                SELECT
                    cm_other.user_id,
                    COUNT(DISTINCT cm_other.course_id) AS common_courses,
                    GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') AS common_course_names
                FROM course_members cm_self
                JOIN course_members cm_other
                    ON cm_self.course_id = cm_other.course_id
                    AND cm_other.user_id <> cm_self.user_id
                JOIN courses c ON c.id = cm_self.course_id
                WHERE cm_self.user_id = ?
                GROUP BY cm_other.user_id
            ) AS common_courses
                ON common_courses.user_id = u.id
            WHERE fr.sender_id = ?
              AND fr.status = 'pending'
            ORDER BY fr.created_at DESC
            `,
            [userId, userId]
        );

        const [recommendations] = await pool.query(
            `
            SELECT
                u.id,
                u.username,
                u.email,
                u.user_code,
                common_courses.common_courses AS mutual_courses,
                common_courses.common_course_names
            FROM users u
            JOIN (
                SELECT
                    cm_other.user_id,
                    COUNT(DISTINCT cm_other.course_id) AS common_courses,
                    GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') AS common_course_names
                FROM course_members cm_self
                JOIN course_members cm_other
                    ON cm_self.course_id = cm_other.course_id
                    AND cm_other.user_id <> cm_self.user_id
                JOIN courses c ON c.id = cm_self.course_id
                WHERE cm_self.user_id = ?
                GROUP BY cm_other.user_id
            ) AS common_courses
                ON common_courses.user_id = u.id
            LEFT JOIN friend_requests fr
                ON fr.pair_key = CONCAT(LEAST(?, u.id), ':', GREATEST(?, u.id))
            WHERE u.id <> ?
              AND fr.id IS NULL
            ORDER BY common_courses.common_courses DESC, u.username ASC
            LIMIT 8
            `,
            [userId, userId, userId, userId]
        );

        res.json({
            friends,
            incomingRequests,
            outgoingRequests,
            recommendations,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch friend overview" });
    }
});

router.get("/people-search", authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const rawQuery = String(req.query.q || "").trim();

    if (!rawQuery) {
        return res.json([]);
    }

    const normalizedQuery = rawQuery.toLowerCase();
    const likeValue = `%${normalizedQuery}%`;

    try {
        const [rows] = await pool.query(
            `
            SELECT
                u.id,
                u.username,
                u.email,
                u.user_code,
                fr.id AS request_id,
                fr.status AS friendship_status,
                fr.sender_id,
                fr.receiver_id,
                COALESCE(common_courses.common_courses, 0) AS common_courses,
                COALESCE(common_courses.common_course_names, '') AS common_course_names
            FROM users u
            LEFT JOIN friend_requests fr
                ON fr.pair_key = CONCAT(LEAST(?, u.id), ':', GREATEST(?, u.id))
            LEFT JOIN (
                SELECT
                    cm_other.user_id,
                    COUNT(DISTINCT cm_other.course_id) AS common_courses,
                    GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') AS common_course_names
                FROM course_members cm_self
                JOIN course_members cm_other
                    ON cm_self.course_id = cm_other.course_id
                    AND cm_other.user_id <> cm_self.user_id
                JOIN courses c ON c.id = cm_self.course_id
                WHERE cm_self.user_id = ?
                GROUP BY cm_other.user_id
            ) AS common_courses
                ON common_courses.user_id = u.id
            WHERE u.id <> ?
              AND (
                LOWER(u.username) LIKE ?
                OR LOWER(u.user_code) LIKE ?
                OR LOWER(u.email) LIKE ?
              )
            ORDER BY
                CASE
                    WHEN LOWER(u.user_code) = ? THEN 0
                    WHEN LOWER(u.username) = ? THEN 1
                    WHEN LOWER(u.username) LIKE ? THEN 2
                    ELSE 3
                END,
                CASE fr.status
                    WHEN 'accepted' THEN 0
                    WHEN 'pending' THEN 1
                    ELSE 2
                END,
                common_courses.common_courses DESC,
                u.username ASC
            LIMIT 12
            `,
            [userId, userId, userId, userId, likeValue, likeValue, likeValue, normalizedQuery, normalizedQuery, `${normalizedQuery}%`]
        );

        const people = rows.map((person) => ({
            ...person,
            relationship: formatPeopleStatus(person, userId),
        }));

        res.json(people);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to search people" });
    }
});

router.post("/request", authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const userCode = String(req.body.userCode || "").trim().toLowerCase();

    if (!userCode) {
        return res.status(400).json({ error: "Friend ID is required" });
    }

    try {
        const [targetRows] = await pool.query(
            `
            SELECT id, username, email, user_code
            FROM users
            WHERE LOWER(user_code) = ?
            LIMIT 1
            `,
            [userCode]
        );

        if (targetRows.length === 0) {
            return res.status(404).json({ error: "No user found with that friend ID" });
        }

        const targetUser = targetRows[0];

        if (Number(targetUser.id) === Number(userId)) {
            return res.status(400).json({ error: "You cannot add yourself" });
        }

        const pairKey = buildPairKey(userId, targetUser.id);
        const [existingRows] = await pool.query(
            `
            SELECT *
            FROM friend_requests
            WHERE pair_key = ?
            LIMIT 1
            `,
            [pairKey]
        );

        if (existingRows.length > 0) {
            const existing = existingRows[0];

            if (existing.status === "accepted") {
                return res.status(400).json({ error: "You are already friends" });
            }

            if (existing.status === "pending") {
                if (Number(existing.sender_id) === Number(userId)) {
                    return res.status(400).json({ error: "Friend request already sent" });
                }

                await pool.query(
                    `
                    UPDATE friend_requests
                    SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    `,
                    [existing.id]
                );

                const conversation = await ensureConversation(userId, targetUser.id);

                return res.json({
                    message: "Friend request accepted",
                    friendshipStatus: "accepted",
                    conversationId: conversation.id,
                });
            }

            await pool.query(
                `
                UPDATE friend_requests
                SET sender_id = ?, receiver_id = ?, status = 'pending', updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                `,
                [userId, targetUser.id, existing.id]
            );

            return res.json({ message: "Friend request sent", friendshipStatus: "pending" });
        }

        await pool.query(
            `
            INSERT INTO friend_requests (pair_key, sender_id, receiver_id, status)
            VALUES (?, ?, ?, 'pending')
            `,
            [pairKey, userId, targetUser.id]
        );

        res.json({ message: "Friend request sent", friendshipStatus: "pending" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to send friend request" });
    }
});

router.patch("/requests/:requestId", authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const requestId = Number(req.params.requestId);
    const action = String(req.body.action || "").toLowerCase();

    if (!["accept", "reject"].includes(action)) {
        return res.status(400).json({ error: "Action must be accept or reject" });
    }

    try {
        const [rows] = await pool.query(
            `
            SELECT *
            FROM friend_requests
            WHERE id = ?
            LIMIT 1
            `,
            [requestId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: "Friend request not found" });
        }

        const request = rows[0];

        if (Number(request.receiver_id) !== Number(userId)) {
            return res.status(403).json({ error: "You cannot manage this friend request" });
        }

        if (request.status !== "pending") {
            return res.status(400).json({ error: "This friend request is no longer pending" });
        }

        const nextStatus = action === "accept" ? "accepted" : "rejected";

        await pool.query(
            `
            UPDATE friend_requests
            SET status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            `,
            [nextStatus, requestId]
        );

        let conversationId = null;

        if (nextStatus === "accepted") {
            const conversation = await ensureConversation(request.sender_id, request.receiver_id);
            conversationId = conversation.id;
        }

        res.json({
            message: action === "accept" ? "Friend request accepted" : "Friend request rejected",
            friendshipStatus: nextStatus,
            conversationId,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to update friend request" });
    }
});

router.delete("/users/:friendId", authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const friendId = Number(req.params.friendId);

    if (!friendId) {
        return res.status(400).json({ error: "Friend is required" });
    }

    if (Number(friendId) === Number(userId)) {
        return res.status(400).json({ error: "You cannot remove yourself" });
    }

    try {
        const friendship = await requireAcceptedFriendship(userId, friendId);

        if (!friendship) {
            return res.status(404).json({ error: "Friendship not found" });
        }

        const [conversations] = await pool.query(
            `
            SELECT id
            FROM private_conversations
            WHERE (user_one_id = ? AND user_two_id = ?)
               OR (user_one_id = ? AND user_two_id = ?)
            `,
            [userId, friendId, friendId, userId]
        );

        if (conversations.length > 0) {
            await pool.query(
                `
                DELETE FROM private_conversations
                WHERE id IN (?)
                `,
                [conversations.map((conversation) => conversation.id)]
            );
        }

        await pool.query(
            `
            DELETE FROM friend_requests
            WHERE id = ?
            `,
            [friendship.id]
        );

        res.json({ message: "Friend removed successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to remove friend" });
    }
});

router.get("/conversations/:friendId/messages", authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const friendId = Number(req.params.friendId);
    const beforeId = Number(req.query.beforeId || 0);
    const limit = Math.min(Math.max(Number(req.query.limit || 40), 1), 100);

    if (!friendId) {
        return res.status(400).json({ error: "Friend is required" });
    }

    try {
        const friendship = await requireAcceptedFriendship(userId, friendId);

        if (!friendship) {
            return res.status(403).json({ error: "You can only message people you are friends with" });
        }

        const [friendRows] = await pool.query(
            `
            SELECT id, username, email, user_code
            FROM users
            WHERE id = ?
            LIMIT 1
            `,
            [friendId]
        );

        if (friendRows.length === 0) {
            return res.status(404).json({ error: "Friend not found" });
        }

        const conversation = await ensureConversation(userId, friendId);
        const params = [conversation.id];
        let beforeClause = "";

        if (beforeId > 0) {
            beforeClause = "AND private_messages.id < ?";
            params.push(beforeId);
        }

        params.push(limit);

        const [messages] = await pool.query(
            `
            SELECT *
            FROM (
                SELECT
                    private_messages.*,
                    users.username,
                    users.email,
                    users.user_code
                FROM private_messages
                JOIN users ON users.id = private_messages.user_id
                WHERE private_messages.conversation_id = ?
                ${beforeClause}
                ORDER BY private_messages.id DESC
                LIMIT ?
            ) recent_private_messages
            ORDER BY id ASC
            `,
            params
        );

        const oldestId = messages.length ? messages[0].id : null;
        const [olderRows] = oldestId
            ? await pool.query(
                `
                SELECT COUNT(*) AS total
                FROM private_messages
                WHERE conversation_id = ?
                  AND id < ?
                `,
                [conversation.id, oldestId]
            )
            : [[{ total: 0 }]];

        res.json({
            conversationId: conversation.id,
            friend: friendRows[0],
            messages,
            hasMore: Number(olderRows[0]?.total || 0) > 0,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch private messages" });
    }
});

router.post("/conversations/:friendId/messages", authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const friendId = Number(req.params.friendId);
    const content = String(req.body.content || "").trim();

    if (!friendId) {
        return res.status(400).json({ error: "Friend is required" });
    }

    if (!content) {
        return res.status(400).json({ error: "Message cannot be empty" });
    }

    try {
        const friendship = await requireAcceptedFriendship(userId, friendId);

        if (!friendship) {
            return res.status(403).json({ error: "You can only message people you are friends with" });
        }

        const conversation = await ensureConversation(userId, friendId);
        const [result] = await pool.query(
            `
            INSERT INTO private_messages (conversation_id, user_id, content)
            VALUES (?, ?, ?)
            `,
            [conversation.id, userId, content]
        );

        const message = {
            id: result.insertId,
            conversation_id: conversation.id,
            user_id: userId,
            userId,
            content,
            username: req.user.username,
            email: req.user.email,
            user_code: req.user.user_code,
            created_at: new Date().toISOString(),
        };

        const io = req.app.get("io");
        io.to(`private_${conversation.id}`).emit("newPrivateMessage", message);

        res.json({
            conversationId: conversation.id,
            message,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to send private message" });
    }
});

module.exports = router;
