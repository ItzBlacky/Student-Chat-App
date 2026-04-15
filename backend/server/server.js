const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const jwt = require("jsonwebtoken");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const db = require("./db");
const authRoutes = require("./routes/auth");
const notesRoutes = require("./routes/notes");
const coursesRoutes = require("./routes/courses");
const messagesRoutes = require("./routes/messages");
const assignmentsRoutes = require("./routes/assignments");
const friendsRoutes = require("./routes/friends");

const app = express();
const server = http.createServer(app);

function parseAllowedOrigins() {
  const configuredOrigins = process.env.FRONTEND_URLS || process.env.FRONTEND_URL || "";
  const origins = configuredOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return origins.length > 0 ? origins : ["*"];
}

const allowedOrigins = parseAllowedOrigins();
const corsOptions = {
  origin(origin, callback) {
    if (allowedOrigins.includes("*") || !origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS`));
  }
};

const io = new Server(server, {
  cors: corsOptions
});

const JWT_SECRET = process.env.JWT_SECRET;

// Track which users are currently online in each course
const coursePresence = new Map(); // courseId -> Map<socketId, { id, username }>

function emitCoursePresence(courseId) {
  const users = coursePresence.get(courseId);
  const list = users ? Array.from(users.values()) : [];
  io.to(`course_${courseId}`).emit("coursePresence", list);
}

app.use(cors(corsOptions));
app.use(express.json());

// socket access in routes
app.set("io", io);

// static uploads
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

async function getHealthStatus() {
  await (await db.getDb()).command({ ping: 1 });

  return {
    service: "StudyMate API",
    status: "ok",
    database: "connected",
    timestamp: new Date().toISOString()
  };
}

app.get("/", async (req, res) => {
  try {
    res.json(await getHealthStatus());
  } catch (error) {
    res.status(503).json({
      service: "StudyMate API",
      status: "degraded",
      database: "unreachable",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get("/health", async (req, res) => {
  try {
    res.json(await getHealthStatus());
  } catch (error) {
    res.status(503).json({
      service: "StudyMate API",
      status: "degraded",
      database: "unreachable",
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ROUTES (clean structure)
app.use("/auth", authRoutes);
app.use("/courses", coursesRoutes);
app.use("/messages", messagesRoutes);
app.use("/notes", notesRoutes);
app.use("/assignments", assignmentsRoutes);
app.use("/friends", friendsRoutes);

// SOCKET
io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Authenticate socket if token is provided
  socket.on("authenticate", async (token) => {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const users = await db.collection("users");
      const user = await users.findOne(
        { id: Number(decoded.id) },
        { projection: { _id: 0, id: 1, username: 1, email: 1, user_code: 1 } }
      );

      if (!user) {
        socket.emit("unauthorized", { error: "User not found" });
        return;
      }

      socket.user = user;
      socket.emit("authenticated", { user });
    } catch (err) {
      console.warn("Socket auth failed", err.message);
      socket.emit("unauthorized", { error: "Invalid token" });
    }
  });

  socket.on("joinCourse", (courseId) => {
    if (!socket.user) return;

    socket.join(`course_${courseId}`);

    const users = coursePresence.get(courseId) || new Map();
    users.set(socket.id, { id: socket.user.id, username: socket.user.username });
    coursePresence.set(courseId, users);

    emitCoursePresence(courseId);
  });

  socket.on("leaveCourse", (courseId) => {
    if (!socket.user) return;

    socket.leave(`course_${courseId}`);

    const users = coursePresence.get(courseId);
    if (users) {
      users.delete(socket.id);
      if (users.size === 0) {
        coursePresence.delete(courseId);
      } else {
        coursePresence.set(courseId, users);
      }
      emitCoursePresence(courseId);
    }
  });

  socket.on("typing", (courseId) => {
    if (!socket.user) return;
    socket.to(`course_${courseId}`).emit("typing", {
      user: {
        id: socket.user.id,
        username: socket.user.username
      }
    });
  });

  socket.on("joinPrivateConversation", async (conversationId) => {
    if (!socket.user || !conversationId) return;

    try {
      const privateConversations = await db.collection("private_conversations");
      const conversation = await privateConversations.findOne({
        id: Number(conversationId),
        $or: [
          { user_one_id: socket.user.id },
          { user_two_id: socket.user.id },
        ],
      });

      if (!conversation) {
        return;
      }

      socket.join(`private_${conversationId}`);
    } catch (error) {
      console.warn("Private conversation join failed", error.message);
    }
  });

  socket.on("leavePrivateConversation", (conversationId) => {
    if (!socket.user || !conversationId) return;
    socket.leave(`private_${conversationId}`);
  });

  socket.on("privateTyping", async ({ conversationId }) => {
    if (!socket.user || !conversationId) return;

    try {
      const privateConversations = await db.collection("private_conversations");
      const conversation = await privateConversations.findOne({
        id: Number(conversationId),
        $or: [
          { user_one_id: socket.user.id },
          { user_two_id: socket.user.id },
        ],
      });

      if (!conversation) {
        return;
      }

      socket.to(`private_${conversationId}`).emit("privateTyping", {
        conversationId,
        user: {
          id: socket.user.id,
          username: socket.user.username
        }
      });
    } catch (error) {
      console.warn("Private typing emit failed", error.message);
    }
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    // Remove from all course presence lists
    for (const [courseId, users] of coursePresence) {
      if (users.has(socket.id)) {
        users.delete(socket.id);
        if (users.size === 0) {
          coursePresence.delete(courseId);
        } else {
          coursePresence.set(courseId, users);
        }
        emitCoursePresence(courseId);
      }
    }
  });
});

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 5000;

function startServer(initialPort, maxAttempts = 10) {
  let attempt = 0;
  let port = initialPort;

  const tryListen = () => {
    attempt += 1;
    server.listen(port, () => {
      console.log(`Server running on http://localhost:${port}`);
    });
  };

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && attempt < maxAttempts) {
      const nextPort = port + 1;
      console.log(`Port ${port} is busy, trying ${nextPort}...`);
      port = nextPort;
      server.close(() => tryListen());
    } else {
      console.error('Server error:', err);
    }
  });

  tryListen();
}

async function initializeServer() {
  try {
    if (typeof db.runMigrations === "function") {
      await db.runMigrations();
    }
    startServer(PORT);
  } catch (error) {
    console.error("Startup migration failed:", error);
  }
}

initializeServer();
