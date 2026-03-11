const socket = io("http://localhost:5000");

let authToken = localStorage.getItem("token") || null;
let selectedCourseId = null;

const courseInput = document.getElementById("courseInput");
const addCourseBtn = document.getElementById("addCourseBtn");
const courseList = document.getElementById("courseList");

const messageList = document.getElementById("messageList");
const messageInput = document.getElementById("messageInput");
const sendMessageBtn = document.getElementById("sendMessageBtn");

const API_URL = "http://localhost:5000/courses";

const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const loginBtn = document.getElementById("loginBtn");

loginBtn.onclick = async () => {

    const email = emailInput.value;
    const password = passwordInput.value;

    if (!email || !password) {
        alert("Enter email and password");
        return;
    }

    const response = await fetch("http://localhost:5000/auth/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            email,
            password
        })
    });

    const data = await response.json();

    if (data.token) {

        localStorage.setItem("token", data.token);

        authToken = data.token;

        alert("Login successful");

    } else {

        alert(data.error || "Login failed");

    }

};
document.getElementById("logoutBtn").onclick = () => {

    localStorage.removeItem("token");

    location.reload();

};
// =======================
// FETCH COURSES
// =======================

async function fetchCourses() {

    const response = await fetch(API_URL);

    if (!response.ok) {
        console.error("Failed to fetch courses");
        return;
    }

    const data = await response.json();
    renderCourses(data);

}


// =======================
// RENDER COURSES
// =======================

function renderCourses(courses) {

    courseList.innerHTML = "";

    courses.forEach(course => {

        const li = document.createElement("li");
        li.textContent = course.name;
        li.style.cursor = "pointer";

        li.onclick = () => {

            selectedCourseId = course.id;

            fetchMessages(course.id);

            socket.emit("joinCourse", course.id);

        };

        const deleteBtn = document.createElement("button");

        deleteBtn.textContent = "X";
        deleteBtn.style.marginLeft = "10px";

        deleteBtn.onclick = async (e) => {

            e.stopPropagation();

            await fetch(`${API_URL}/${course.id}`, {
                method: "DELETE",
                headers: {
                    "Authorization": `Bearer ${authToken}`
                }
            });

            fetchCourses();
            messageList.innerHTML = "";

        };

        li.appendChild(deleteBtn);
        courseList.appendChild(li);

    });

}


// =======================
// CREATE COURSE
// =======================

addCourseBtn.onclick = async () => {

    const courseName = courseInput.value.trim();

    if (!courseName) return;

    await fetch(API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
            name: courseName
        })
    });

    courseInput.value = "";

    fetchCourses();

};


// =======================
// FETCH MESSAGES
// =======================

async function fetchMessages(courseId) {

    const response = await fetch(`${API_URL}/${courseId}/messages`, {
        headers: {
            "Authorization": `Bearer ${authToken}`
        }
    });

    if (!response.ok) {
        console.error("Failed to fetch messages");
        return;
    }

    const data = await response.json();

    messageList.innerHTML = "";

    data.forEach(msg => {

        const li = document.createElement("li");
        li.textContent = msg.content;

        messageList.appendChild(li);

    });

}


// =======================
// SEND MESSAGE
// =======================

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
            "Content-Type": "application/json",
            "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({
            content
        })
    });

    messageInput.value = "";

};


// =======================
// SOCKET RECEIVE
// =======================

socket.on("newMessage", (message) => {

    if (message.courseId == selectedCourseId) {

        const li = document.createElement("li");

        li.textContent = message.content;

        messageList.appendChild(li);

    }

});


// =======================
// LOAD COURSES
// =======================

fetchCourses();