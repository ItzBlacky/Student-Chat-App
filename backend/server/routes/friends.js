const express = require("express");

const db = require("../db");
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

function numericId(value) {
    const id = Number(value);
    return Number.isFinite(id) ? id : null;
}

function formatPeopleStatus(friendship, currentUserId) {
    if (!friendship) return "none";
    if (friendship.status === "accepted") return "friend";
    if (friendship.status === "pending") {
        return Number(friendship.sender_id) === Number(currentUserId)
            ? "outgoing_pending"
            : "incoming_pending";
    }
    return "none";
}

async function publicUserById(userId) {
    const users = await db.collection("users");
    return users.findOne(
        { id: Number(userId) },
        { projection: { _id: 0, id: 1, username: 1, email: 1, user_code: 1 } }
    );
}

async function getFriendship(currentUserId, otherUserId) {
    const friendRequests = await db.collection("friend_requests");
    return friendRequests.findOne({ pair_key: buildPairKey(currentUserId, otherUserId) });
}

async function requireAcceptedFriendship(currentUserId, otherUserId) {
    const friendship = await getFriendship(currentUserId, otherUserId);
    return friendship?.status === "accepted" ? friendship : null;
}

async function ensureConversation(userA, userB) {
    const [firstUserId, secondUserId] = sortUserPair(userA, userB);
    const privateConversations = await db.collection("private_conversations");
    const existing = await privateConversations.findOne({
        user_one_id: firstUserId,
        user_two_id: secondUserId,
    });

    if (existing) {
        return existing;
    }

    return db.insertWithId("private_conversations", {
        user_one_id: firstUserId,
        user_two_id: secondUserId,
    });
}

async function getCourseSummaryForUser(userId) {
    const courseMembers = await db.collection("course_members");
    const courses = await db.collection("courses");
    const memberships = await courseMembers.find({ user_id: Number(userId) }).toArray();
    const courseIds = memberships.map((membership) => membership.course_id);
    const courseRows = await courses
        .find({ id: { $in: courseIds } }, { projection: { _id: 0, id: 1, name: 1 } })
        .sort({ name: 1 })
        .toArray();
    const coursesById = new Map(courseRows.map((course) => [course.id, course]));

    return memberships
        .map((membership) => {
            const course = coursesById.get(membership.course_id);
            if (!course) return null;
            return {
                id: course.id,
                name: course.name,
                role: String(membership.role || "student").toLowerCase(),
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name));
}

async function getCommonCourseInfo(perspectiveUserId, otherUserId) {
    const [perspectiveCourses, otherCourses] = await Promise.all([
        getCourseSummaryForUser(perspectiveUserId),
        getCourseSummaryForUser(otherUserId),
    ]);
    const perspectiveCourseIds = new Set(perspectiveCourses.map((course) => course.id));
    const commonCourses = otherCourses
        .filter((course) => perspectiveCourseIds.has(course.id))
        .sort((a, b) => a.name.localeCompare(b.name));

    return {
        mutual_courses: commonCourses.length,
        common_course_names: commonCourses.map((course) => course.name).join(", "),
    };
}

async function getFriendCountForUser(userId) {
    const friendRequests = await db.collection("friend_requests");
    return friendRequests.countDocuments({
        status: "accepted",
        $or: [
            { sender_id: Number(userId) },
            { receiver_id: Number(userId) },
        ],
    });
}

async function getAcceptedFriendIds(userId) {
    const friendRequests = await db.collection("friend_requests");
    const rows = await friendRequests
        .find({
            status: "accepted",
            $or: [
                { sender_id: Number(userId) },
                { receiver_id: Number(userId) },
            ],
        })
        .toArray();

    return rows.map((row) => Number(row.sender_id) === Number(userId) ? row.receiver_id : row.sender_id);
}

async function enrichUserForFriendList(user, perspectiveUserId) {
    const conversation = await ensureConversation(perspectiveUserId, user.id);
    const commonInfo = await getCommonCourseInfo(perspectiveUserId, user.id);

    return {
        ...user,
        conversation_id: conversation.id,
        mutual_courses: commonInfo.mutual_courses,
        common_course_names: commonInfo.common_course_names,
    };
}

async function getFriendsForUser(userId, perspectiveUserId = userId) {
    const users = await db.collection("users");
    const friendIds = await getAcceptedFriendIds(userId);
    const userRows = await users
        .find({ id: { $in: friendIds } }, { projection: { _id: 0, id: 1, username: 1, email: 1, user_code: 1 } })
        .sort({ username: 1 })
        .toArray();

    return Promise.all(userRows.map((user) => enrichUserForFriendList(user, perspectiveUserId)));
}

async function getMutualFriends(currentUserId, otherUserId) {
    const currentFriendIds = new Set(await getAcceptedFriendIds(currentUserId));
    const otherFriendIds = await getAcceptedFriendIds(otherUserId);
    const mutualIds = otherFriendIds.filter((id) => (
        currentFriendIds.has(id)
        && Number(id) !== Number(currentUserId)
        && Number(id) !== Number(otherUserId)
    ));
    const users = await db.collection("users");
    const userRows = await users
        .find({ id: { $in: mutualIds } }, { projection: { _id: 0, id: 1, username: 1, email: 1, user_code: 1 } })
        .sort({ username: 1 })
        .toArray();

    return Promise.all(userRows.map((user) => enrichUserForFriendList(user, currentUserId)));
}

async function formatRequest(request, otherUserId, perspectiveUserId) {
    const user = await publicUserById(otherUserId);
    if (!user) return null;
    const commonInfo = await getCommonCourseInfo(perspectiveUserId, otherUserId);

    return {
        id: request.id,
        created_at: request.created_at,
        user_id: user.id,
        username: user.username,
        email: user.email,
        user_code: user.user_code,
        mutual_courses: commonInfo.mutual_courses,
        common_course_names: commonInfo.common_course_names,
    };
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
    const targetUserId = numericId(req.params.userId);

    if (!targetUserId) {
        return res.status(400).json({ error: "User is required" });
    }

    try {
        const user = await publicUserById(targetUserId);

        if (!user) {
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
            ...user,
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
        const friendRequests = await db.collection("friend_requests");
        const users = await db.collection("users");
        const friends = await getFriendsForUser(userId);
        const [incomingRows, outgoingRows] = await Promise.all([
            friendRequests.find({ receiver_id: userId, status: "pending" }).sort({ created_at: -1 }).toArray(),
            friendRequests.find({ sender_id: userId, status: "pending" }).sort({ created_at: -1 }).toArray(),
        ]);
        const incomingRequests = (await Promise.all(
            incomingRows.map((request) => formatRequest(request, request.sender_id, userId))
        )).filter(Boolean);
        const outgoingRequests = (await Promise.all(
            outgoingRows.map((request) => formatRequest(request, request.receiver_id, userId))
        )).filter(Boolean);
        const currentFriendships = await friendRequests
            .find({ $or: [{ sender_id: userId }, { receiver_id: userId }] })
            .toArray();
        const connectedUserIds = new Set(currentFriendships.flatMap((request) => [request.sender_id, request.receiver_id]));
        connectedUserIds.add(userId);
        const candidateUsers = await users
            .find({ id: { $nin: [...connectedUserIds] } }, { projection: { _id: 0, id: 1, username: 1, email: 1, user_code: 1 } })
            .toArray();
        const recommendations = (await Promise.all(candidateUsers.map(async (user) => {
            const commonInfo = await getCommonCourseInfo(userId, user.id);
            return commonInfo.mutual_courses > 0
                ? { ...user, ...commonInfo }
                : null;
        })))
            .filter(Boolean)
            .sort((a, b) => b.mutual_courses - a.mutual_courses || a.username.localeCompare(b.username))
            .slice(0, 8);

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

    try {
        const users = await db.collection("users");
        const pattern = new RegExp(normalizedQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        const rows = await users
            .find({
                id: { $ne: userId },
                $or: [
                    { username: pattern },
                    { user_code: pattern },
                    { email: pattern },
                ],
            }, { projection: { _id: 0, id: 1, username: 1, email: 1, user_code: 1 } })
            .limit(40)
            .toArray();

        const people = await Promise.all(rows.map(async (person) => {
            const friendship = await getFriendship(userId, person.id);
            const commonInfo = await getCommonCourseInfo(userId, person.id);
            return {
                ...person,
                request_id: friendship?.id || null,
                friendship_status: friendship?.status || null,
                sender_id: friendship?.sender_id || null,
                receiver_id: friendship?.receiver_id || null,
                common_courses: commonInfo.mutual_courses,
                mutual_courses: commonInfo.mutual_courses,
                common_course_names: commonInfo.common_course_names,
                relationship: formatPeopleStatus(friendship, userId),
            };
        }));

        people.sort((a, b) => {
            const aUserCode = String(a.user_code || "").toLowerCase();
            const bUserCode = String(b.user_code || "").toLowerCase();
            const aUsername = String(a.username || "").toLowerCase();
            const bUsername = String(b.username || "").toLowerCase();
            const rank = (person, userCode, username) => {
                if (userCode === normalizedQuery) return 0;
                if (username === normalizedQuery) return 1;
                if (username.startsWith(normalizedQuery)) return 2;
                return 3;
            };
            const rankDelta = rank(a, aUserCode, aUsername) - rank(b, bUserCode, bUsername);
            const statusOrder = { accepted: 0, pending: 1 };
            const statusDelta = (statusOrder[a.friendship_status] ?? 2) - (statusOrder[b.friendship_status] ?? 2);
            return rankDelta
                || statusDelta
                || b.mutual_courses - a.mutual_courses
                || a.username.localeCompare(b.username);
        });

        res.json(people.slice(0, 12));
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
        const users = await db.collection("users");
        const targetUser = await users.findOne(
            { user_code: userCode },
            { projection: { _id: 0, id: 1, username: 1, email: 1, user_code: 1 } }
        );

        if (!targetUser) {
            return res.status(404).json({ error: "No user found with that friend ID" });
        }

        if (Number(targetUser.id) === Number(userId)) {
            return res.status(400).json({ error: "You cannot add yourself" });
        }

        const pairKey = buildPairKey(userId, targetUser.id);
        const friendRequests = await db.collection("friend_requests");
        const existing = await friendRequests.findOne({ pair_key: pairKey });

        if (existing) {
            if (existing.status === "accepted") {
                return res.status(400).json({ error: "You are already friends" });
            }

            if (existing.status === "pending") {
                if (Number(existing.sender_id) === Number(userId)) {
                    return res.status(400).json({ error: "Friend request already sent" });
                }

                await friendRequests.updateOne(
                    { id: existing.id },
                    { $set: { status: "accepted", updated_at: new Date() } }
                );
                const conversation = await ensureConversation(userId, targetUser.id);

                return res.json({
                    message: "Friend request accepted",
                    friendshipStatus: "accepted",
                    conversationId: conversation.id,
                });
            }

            await friendRequests.updateOne(
                { id: existing.id },
                {
                    $set: {
                        sender_id: userId,
                        receiver_id: targetUser.id,
                        status: "pending",
                        updated_at: new Date(),
                    }
                }
            );

            return res.json({ message: "Friend request sent", friendshipStatus: "pending" });
        }

        await db.insertWithId("friend_requests", {
            pair_key: pairKey,
            sender_id: userId,
            receiver_id: targetUser.id,
            status: "pending",
            updated_at: new Date(),
        });

        res.json({ message: "Friend request sent", friendshipStatus: "pending" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to send friend request" });
    }
});

router.patch("/requests/:requestId", authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const requestId = numericId(req.params.requestId);
    const action = String(req.body.action || "").toLowerCase();

    if (!requestId) {
        return res.status(400).json({ error: "Friend request is required" });
    }

    if (!["accept", "reject"].includes(action)) {
        return res.status(400).json({ error: "Action must be accept or reject" });
    }

    try {
        const friendRequests = await db.collection("friend_requests");
        const request = await friendRequests.findOne({ id: requestId });

        if (!request) {
            return res.status(404).json({ error: "Friend request not found" });
        }

        if (Number(request.receiver_id) !== Number(userId)) {
            return res.status(403).json({ error: "You cannot manage this friend request" });
        }

        if (request.status !== "pending") {
            return res.status(400).json({ error: "This friend request is no longer pending" });
        }

        const nextStatus = action === "accept" ? "accepted" : "rejected";
        await friendRequests.updateOne(
            { id: requestId },
            { $set: { status: nextStatus, updated_at: new Date() } }
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
    const friendId = numericId(req.params.friendId);

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

        const privateConversations = await db.collection("private_conversations");
        const privateMessages = await db.collection("private_messages");
        const conversation = await privateConversations.findOne({
            $or: [
                { user_one_id: userId, user_two_id: friendId },
                { user_one_id: friendId, user_two_id: userId },
            ],
        });

        if (conversation) {
            await privateMessages.deleteMany({ conversation_id: conversation.id });
            await privateConversations.deleteOne({ id: conversation.id });
        }

        const friendRequests = await db.collection("friend_requests");
        await friendRequests.deleteOne({ id: friendship.id });

        res.json({ message: "Friend removed successfully" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to remove friend" });
    }
});

router.get("/conversations/:friendId/messages", authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const friendId = numericId(req.params.friendId);
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

        const friend = await publicUserById(friendId);
        if (!friend) {
            return res.status(404).json({ error: "Friend not found" });
        }

        const conversation = await ensureConversation(userId, friendId);
        const privateMessages = await db.collection("private_messages");
        const filter = { conversation_id: conversation.id };

        if (beforeId > 0) {
            filter.id = { $lt: beforeId };
        }

        const recentMessages = await privateMessages
            .find(filter, { projection: { _id: 0 } })
            .sort({ id: -1 })
            .limit(limit)
            .toArray();
        const messages = recentMessages.reverse();
        const users = await db.collection("users");
        const userIds = [...new Set(messages.map((message) => message.user_id))];
        const userRows = await users
            .find({ id: { $in: userIds } }, { projection: { _id: 0, id: 1, username: 1, email: 1, user_code: 1 } })
            .toArray();
        const usersById = new Map(userRows.map((user) => [user.id, user]));
        const enrichedMessages = messages.map((message) => {
            const user = usersById.get(message.user_id) || {};
            return {
                ...message,
                username: user.username,
                email: user.email,
                user_code: user.user_code,
            };
        });
        const oldestId = enrichedMessages.length ? enrichedMessages[0].id : null;
        const olderCount = oldestId
            ? await privateMessages.countDocuments({ conversation_id: conversation.id, id: { $lt: oldestId } })
            : 0;

        res.json({
            conversationId: conversation.id,
            friend,
            messages: enrichedMessages,
            hasMore: olderCount > 0,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Failed to fetch private messages" });
    }
});

router.post("/conversations/:friendId/messages", authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const friendId = numericId(req.params.friendId);
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
        const savedMessage = await db.insertWithId("private_messages", {
            conversation_id: conversation.id,
            user_id: userId,
            content,
        });

        const message = {
            ...savedMessage,
            userId,
            username: req.user.username,
            email: req.user.email,
            user_code: req.user.user_code,
            created_at: savedMessage.created_at.toISOString(),
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
