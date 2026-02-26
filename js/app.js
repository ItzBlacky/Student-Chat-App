let selectedCourseId = null;
const courseInput = document.getElementById("courseInput");
const addCourseBtn = document.getElementById("addCourseBtn");
const courseList = document.getElementById("courseList");

const API_URL = "http://localhost:5000/courses";

async function fetchCourses() {
    const response = await fetch(API_URL);
    const data = await response.json();
    renderCourses(data);
}

function renderCourses(courses) {
    courseList.innerHTML = "";

    courses.forEach((course) => {
        const li = document.createElement("li");
        li.textContent = course.name;

        li.style.cursor = "pointer";

        li.onclick = () => {
            selectedCourseId = course.id;
            fetchMessages(course.id);
        };

        courseList.appendChild(li);
    });
}

addCourseBtn.onclick = async () => {
    const courseName = courseInput.value.trim();
    if (!courseName) return;

    await fetch(API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ name: courseName })
    });

    courseInput.value = "";
    fetchCourses();
};

// Load courses on page load
fetchCourses();
const messageList = document.getElementById("messageList");
const messageInput = document.getElementById("messageInput");
const sendMessageBtn = document.getElementById("sendMessageBtn");

async function fetchMessages(courseId) {
    const response = await fetch(`${API_URL}/${courseId}/messages`);
    const data = await response.json();

    messageList.innerHTML = "";

    data.forEach((msg) => {
        const li = document.createElement("li");
        li.textContent = msg.content;
        messageList.appendChild(li);
    });
}

sendMessageBtn.onclick = async () => {
    if (!selectedCourseId) {
        alert("Select a course first");
        return;
    }

    const content = messageInput.value.trim();
    if (!content) return;

    await fetch(`${API_URL}/${selectedCourseId}/messages`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ content })
    });

    messageInput.value = "";
    fetchMessages(selectedCourseId);
};