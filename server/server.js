require("dotenv").config();
console.log("JWT_SECRET:", process.env.JWT_SECRET);

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const authRoutes = require("./routes/auth");
const coursesRoutes = require("./routes/courses");
const messagesRoutes = require("./routes/messages");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

app.use(cors());
app.use(express.json());

// allow routes to access socket
app.set("io", io);

// ROUTES
app.use("/auth", authRoutes);
app.use("/courses", coursesRoutes);
app.use("/courses", messagesRoutes);

// SOCKET CONNECTION
io.on("connection", (socket) => {

  console.log("User connected:", socket.id);

  socket.on("joinCourse", (courseId) => {
    socket.join(`course_${courseId}`);
  });

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);
  });

});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});