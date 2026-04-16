const { MongoClient } = require("mongodb");

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!uri) {
    throw new Error("MONGO_URI is required");
}

let clientPromise;

function getDatabaseName() {
    if (process.env.MONGO_DB_NAME) {
        return process.env.MONGO_DB_NAME;
    }

    try {
        const parsed = new URL(uri);
        const dbName = parsed.pathname.replace(/^\/+/, "");
        return dbName || "studymate";
    } catch (error) {
        return "studymate";
    }
}

function getClient() {
    if (!clientPromise) {
        const client = new MongoClient(uri);
        clientPromise = client.connect();
    }

    return clientPromise;
}

async function getDb() {
    const client = await getClient();
    return client.db(getDatabaseName());
}

async function collection(name) {
    const db = await getDb();
    return db.collection(name);
}

async function nextId(name) {
    const counters = await collection("counters");
    const result = await counters.findOneAndUpdate(
        { _id: name },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: "after" }
    );

    return result.seq;
}

async function insertWithId(name, document) {
    const targetCollection = await collection(name);
    const id = await nextId(name);
    const now = new Date();
    const savedDocument = {
        id,
        created_at: now,
        ...document,
    };

    await targetCollection.insertOne(savedDocument);
    return savedDocument;
}

async function syncCounter(name) {
    const targetCollection = await collection(name);
    const counters = await collection("counters");
    const [maxDocument] = await targetCollection
        .aggregate([
            { $group: { _id: null, maxId: { $max: "$id" } } }
        ])
        .toArray();

    if (maxDocument?.maxId) {
        await counters.updateOne(
            { _id: name },
            { $max: { seq: Number(maxDocument.maxId) } },
            { upsert: true }
        );
    }
}

async function runMigrations() {
    const db = await getDb();

    await Promise.all([
        db.collection("users").createIndex({ id: 1 }, { unique: true }),
        db.collection("users").createIndex({ email: 1 }, { unique: true }),
        db.collection("users").createIndex({ username: 1 }, { unique: true }),
        db.collection("users").createIndex({ user_code: 1 }, { unique: true }),
        db.collection("course_members").createIndex({ course_id: 1, user_id: 1 }, { unique: true }),
        db.collection("course_members").createIndex({ user_id: 1 }),
        db.collection("messages").createIndex({ course_id: 1, id: -1 }),
        db.collection("notes").createIndex({ course_id: 1, created_at: -1 }),
        db.collection("assignments").createIndex({ course_id: 1, created_at: -1 }),
        db.collection("assignment_submissions").createIndex({ assignment_id: 1, user_id: 1 }, { unique: true }),
        db.collection("friend_requests").createIndex({ pair_key: 1 }, { unique: true }),
        db.collection("friend_requests").createIndex({ sender_id: 1, receiver_id: 1, status: 1 }),
        db.collection("private_conversations").createIndex({ user_one_id: 1, user_two_id: 1 }, { unique: true }),
        db.collection("private_messages").createIndex({ conversation_id: 1, id: -1 }),
    ]);

    await Promise.all([
        "users",
        "courses",
        "course_members",
        "messages",
        "notes",
        "assignments",
        "assignment_submissions",
        "friend_requests",
        "private_conversations",
        "private_messages",
    ].map(syncCounter));
}

module.exports = {
    collection,
    getClient,
    getDb,
    insertWithId,
    nextId,
    runMigrations,
};
