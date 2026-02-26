const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 5000;

app.use(cors());        // must come before routes
app.use(express.json());

// In-memory storage (temporary)
let courses = [];

// GET all courses
app.get("/courses", (req, res) => {
    res.json(courses);
});

// POST new course
app.post("/courses", (req, res) => {
    const { name } = req.body;

    if (!name) {
        return res.status(400).json({ error: "Course name is required" });
    }

    courses.push(name);
    res.json({ message: "Course added", courses });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});