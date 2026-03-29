const socket = io();

let authToken = localStorage.getItem("token") || null;
let currentUser = null;
let selectedCourseId = null;

socket.on("authenticated", ({ user }) => {
    currentUser = user;
    // Show teacher controls if user is a teacher
    showTeacherControls(user.role === 'teacher');
});

socket.on("unauthorized", () => {
    handleUnauthorized();
});

socket.on("coursePresence", (users) => {
    renderOnlineUsers(users);
});

socket.on("typing", ({ user }) => {
    if (!user || user.id === currentUser?.id) return;
    setTypingIndicator(`${user.username} is typing...`);
    clearTimeout(window.__typingTimeout);
    window.__typingTimeout = setTimeout(() => {
        setTypingIndicator("");
    }, 1200);
});

// API endpoints
const COURSE_API = "/courses";
const MESSAGE_API = "/messages";

// DOM elements
const courseInput = document.getElementById("courseInput");
const addCourseBtn = document.getElementById("addCourseBtn");
const courseList = document.getElementById("courseList");

const messageList = document.getElementById("messageList");
const messageInput = document.getElementById("messageInput");
const sendMessageBtn = document.getElementById("sendMessageBtn");

const usernameInput = document.getElementById("usernameInput");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const roleInput = document.getElementById("roleInput");
const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const logoutBtn = document.getElementById("logoutBtn");

const loginPanel = document.querySelector(".login-panel");
const appContainer = document.querySelector(".app-container");
const authMessage = document.getElementById("authMessage");

const courseContentPanel = document.querySelector(".course-content-panel");
const tabBtns = document.querySelectorAll(".tab-btn");
const tabPanes = document.querySelectorAll(".tab-pane");

// Tab switching
tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
        const tabName = btn.dataset.tab;

        // Update active tab button
        tabBtns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        // Show active tab content
        tabPanes.forEach(pane => pane.classList.remove("active"));
        document.getElementById(`${tabName}-tab`).classList.add("active");
    });
});

function showAuthMessage(message, type = "info") {
    if (!authMessage) return;
    authMessage.textContent = message;
    authMessage.style.color = type === "error" ? "#c00" : type === "success" ? "green" : "#333";
}

function renderOnlineUsers(users) {
    const onlineUsersEl = document.getElementById("onlineUsers");
    if (!onlineUsersEl) return;

    if (!users || users.length === 0) {
        onlineUsersEl.textContent = "No one else online";
        return;
    }

    const names = users.map((u) => u.username).join(", ");
    onlineUsersEl.textContent = `Online: ${names}`;
}

function setTypingIndicator(text) {
    const el = document.getElementById("typingIndicator");
    if (!el) return;
    el.textContent = text;
}

function showTeacherControls(isTeacher) {
    const createAssignmentSection = document.getElementById("createAssignmentSection");
    if (createAssignmentSection) {
        createAssignmentSection.style.display = isTeacher ? "block" : "none";
    }
}

function handleUnauthorized() {
    authToken = null;
    localStorage.removeItem("token");
    showAuthMessage("Session expired. Please log in again.", "error");
    setAuthState(false);
}

async function safeFetch(url, options = {}) {
    options.headers = {
        ...(options.headers || {}),
        ...getAuthHeaders(),
    };

    const response = await fetch(url, options);

    if (response.status === 401 || response.status === 403) {
        handleUnauthorized();
    }

    return response;
}

function ensureSocketAuthenticated() {
    if (!authToken) return;

    socket.emit("authenticate", authToken);
}

function setAuthState(loggedIn) {
    loginPanel.classList.toggle("hidden", loggedIn);
    appContainer.classList.toggle("hidden", !loggedIn);
    logoutBtn.style.display = loggedIn ? "inline-block" : "none";

    if (loggedIn) {
        showAuthMessage("");
        ensureSocketAuthenticated();
        fetchCourses();
        fetchDiscoverCourses();
        showTeacherControls(currentUser?.role === 'teacher');
    } else {
        currentUser = null;
        selectedCourseId = null;
        messageList.innerHTML = "";
        renderOnlineUsers([]);
        setTypingIndicator("");
        document.getElementById("activeCourseTitle").innerText = "Select a Course";
        courseContentPanel.style.display = "none";
        showTeacherControls(false);
    }
}

function showTeacherControls(isTeacher) {
    const createAssignmentSection = document.getElementById("createAssignmentSection");
    if (createAssignmentSection) {
        createAssignmentSection.style.display = isTeacher ? "block" : "none";
    }
}

// =======================
// LOGIN
// =======================
if (loginBtn) {
    loginBtn.onclick = async () => {

        const email = emailInput.value.trim();
        const password = passwordInput.value;

        if (!email || !password) {
            showAuthMessage("Enter email and password", "error");
            return;
        }

        try {
            const response = await fetch("/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (data.token) {
                localStorage.setItem("token", data.token);
                authToken = data.token;
                showAuthMessage("Login successful", "success");
                setAuthState(true);
            } else {
                showAuthMessage(data.error || "Login failed", "error");
            }
        } catch (err) {
            console.error(err);
            showAuthMessage("Unable to reach server. Is it running?", "error");
        }

    };
}

// =======================
// REGISTER
// =======================
if (registerBtn) {
    registerBtn.onclick = async () => {
        const username = usernameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const role = roleInput.value;

        if (!username || !email || !password) {
            showAuthMessage("Username, email, and password are required.", "error");
            return;
        }

        try {
            const response = await fetch("/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, email, password, role })
            });

            const data = await response.json();

            if (response.ok) {
                showAuthMessage("Registered successfully. Please log in.", "success");
            } else {
                showAuthMessage(data.error || "Registration failed", "error");
            }
        } catch (err) {
            console.error(err);
            showAuthMessage("Unable to reach server. Is it running?", "error");
        }
    };
}

// =======================
// LOGOUT
// =======================
logoutBtn.onclick = () => {
    handleUnauthorized();
};

// =======================
// FETCH JOINED COURSES
// =======================

// =======================
// FETCH JOINED COURSES
// =======================
async function fetchCourses() {

    if (!authToken) return;

    const response = await safeFetch(COURSE_API);

    if (!response.ok) return;

    const data = await response.json();
    renderCourses(data);
}

// =======================
// FETCH DISCOVER COURSES
// =======================
async function fetchDiscoverCourses() {

    if (!authToken) return;

    const response = await safeFetch(`${COURSE_API}/discover`);

    if (!response.ok) return;

    const data = await response.json();
    renderDiscoverCourses(data);
}

// =======================
// RENDER JOINED COURSES
// =======================
function renderCourses(courses) {

    courseList.innerHTML = "";

    courses.forEach(course => {

        const li = document.createElement("li");
        li.textContent = course.name;
        li.style.cursor = "pointer";

        if (selectedCourseId === course.id) {
            li.classList.add("selected");
        }

        li.onclick = () => {

            if (selectedCourseId === course.id) return;

            if (selectedCourseId) {
                socket.emit("leaveCourse", selectedCourseId);
            }

            selectedCourseId = course.id;

            // Update UI selection
            document.querySelectorAll("#courseList li").forEach((item) => {
                item.classList.remove("selected");
            });
            li.classList.add("selected");

            // Show course content panel
            courseContentPanel.style.display = "block";

            document.getElementById("activeCourseTitle").innerText = course.name;

            socket.emit("joinCourse", course.id);

            // Load content for all tabs
            fetchMessages(course.id);
            fetchNotes(course.id);
            fetchAssignments(course.id); // Placeholder
        };

        // DELETE BUTTON
        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "X";
        deleteBtn.style.marginLeft = "10px";

        deleteBtn.onclick = async (e) => {

            e.stopPropagation();

            await safeFetch(`${COURSE_API}/${course.id}`, {
                method: "DELETE"
            });

            if (selectedCourseId === course.id) {
                socket.emit("leaveCourse", course.id);
                selectedCourseId = null;
                document.getElementById("activeCourseTitle").innerText = "Select a Course";
                renderOnlineUsers([]);
                setTypingIndicator("");
                courseContentPanel.style.display = "none";
            }

            fetchCourses();
            fetchDiscoverCourses();
            messageList.innerHTML = "";

        };

        li.appendChild(deleteBtn);
        courseList.appendChild(li);

    });

}

// =======================
// RENDER DISCOVER COURSES
// =======================
function renderDiscoverCourses(courses) {

    const discoverList = document.getElementById("discoverList");
    if (!discoverList) return;

    discoverList.innerHTML = "";

    courses.forEach(course => {

        const li = document.createElement("li");
        li.textContent = course.name;

        const joinBtn = document.createElement("button");
        joinBtn.textContent = "Join";

        joinBtn.onclick = async () => {

await safeFetch(`${COURSE_API}/${course.id}/join`, {
            method: "POST"
            });

            fetchCourses();
            fetchDiscoverCourses();

        };

        li.appendChild(joinBtn);
        discoverList.appendChild(li);

    });

}

// =======================
// CREATE COURSE
// =======================
addCourseBtn.onclick = async () => {

    const courseName = courseInput.value.trim();
    if (!courseName) return;

    await safeFetch(COURSE_API, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ name: courseName })
    });

    courseInput.value = "";

    fetchCourses();
    fetchDiscoverCourses();
};

// =======================
// FETCH MESSAGES
// =======================
function formatTimestamp(ts) {
    if (!ts) return "";
    const date = new Date(ts);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

async function fetchMessages(courseId) {

    const response = await safeFetch(`${MESSAGE_API}/${courseId}`);

    if (!response.ok) return;

    const data = await response.json();

    messageList.innerHTML = "";

    data.forEach(msg => {

        const li = document.createElement("li");
        const time = formatTimestamp(msg.created_at);
        const name = msg.username || msg.email || "Unknown";
        li.textContent = `${time ? `[${time}] ` : ""}${name}: ${msg.content}`;

        messageList.appendChild(li);

    });

    messageList.scrollTop = messageList.scrollHeight;

}

// =======================
// SEND MESSAGE
// =======================
sendMessageBtn.onclick = async () => {

    if (!authToken) {
        showAuthMessage("Please log in first.", "error");
        return;
    }

    if (!selectedCourseId) {
        alert("Select a course first");
        return;
    }

    const content = messageInput.value.trim();
    if (!content) return;

    const response = await safeFetch(`${MESSAGE_API}/${selectedCourseId}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ content })
    });

    if (response.ok) {
        const data = await response.json();
        const li = document.createElement("li");
        const time = formatTimestamp(data.created_at);
        const name = data.username || data.email || "You";
        li.textContent = `${time ? `[${time}] ` : ""}${name}: ${data.content}`;
        messageList.appendChild(li);
        messageList.scrollTop = messageList.scrollHeight;
    }

    messageInput.value = "";
    messageInput.focus();
};

messageInput.addEventListener("input", () => {
    if (selectedCourseId) {
        socket.emit("typing", selectedCourseId);
    }
});

// =======================
// SOCKET RECEIVE
// =======================
socket.on("newMessage", (message) => {

    if (message.courseId != selectedCourseId) return;

    // Skip if this is our own message (already appended locally)
    if (message.userId === currentUser?.id) return;

    const li = document.createElement("li");
    const time = formatTimestamp(message.created_at);
    const name = message.username || message.email || "Unknown";
    li.textContent = `${time ? `[${time}] ` : ""}${name}: ${message.content}`;

    messageList.appendChild(li);
    messageList.scrollTop = messageList.scrollHeight;

});

// =======================
// NOTES
// =======================
const noteTitle = document.getElementById("noteTitle");
const noteFile = document.getElementById("noteFile");
const uploadNoteBtn = document.getElementById("uploadNoteBtn");
const notesList = document.getElementById("notesList");

uploadNoteBtn.onclick = async () => {

    if (!selectedCourseId) {
        alert("Select course first");
        return;
    }

    const formData = new FormData();
    formData.append("title", noteTitle.value);
    formData.append("file", noteFile.files[0]);

    if (!noteFile.files || noteFile.files.length === 0) {
        alert("Please select a file to upload.");
        return;
    }

    await safeFetch(`/notes/${selectedCourseId}/notes`, {
        method: "POST",
        body: formData
    });

    fetchNotes(selectedCourseId);
};

// =======================
// FETCH NOTES
// =======================
async function fetchNotes(courseId) {

    const response = await safeFetch(
        `/notes/${courseId}/notes`
    );

    if (!response.ok) return;

    const notes = await response.json();
    renderNotes(notes);
}

// =======================
// RENDER NOTES
// =======================
function renderNotes(notes) {

    notesList.innerHTML = "";

    notes.forEach(note => {

        const li = document.createElement("li");

        const link = document.createElement("a");
        link.href = `http://localhost:5000/uploads/${note.file_path}`;
        link.target = "_blank";
        link.textContent = note.title;

        li.appendChild(link);
        notesList.appendChild(li);

    });

}

// =======================
// FETCH ASSIGNMENTS
// =======================
async function fetchAssignments(courseId) {
    const response = await safeFetch(`/assignments/${courseId}`);
    if (!response.ok) return;

    const assignments = await response.json();
    renderAssignments(assignments);
}

// =======================
// RENDER ASSIGNMENTS
// =======================
function renderAssignments(assignments) {
    const assignmentList = document.getElementById("assignmentList");
    if (!assignmentList) return;

    assignmentList.innerHTML = "";

    if (assignments.length === 0) {
        assignmentList.innerHTML = "<p>No assignments yet.</p>";
        return;
    }

    assignments.forEach(assignment => {
        const div = document.createElement("div");
        div.className = "assignment-item";

        const dueDate = assignment.due_date ? new Date(assignment.due_date).toLocaleDateString() : "No due date";
        const isOverdue = assignment.due_date && new Date(assignment.due_date) < new Date();

        div.innerHTML = `
            <h4>${assignment.title}</h4>
            <p>${assignment.description || "No description"}</p>
            <p><strong>Due:</strong> ${dueDate} ${isOverdue ? '<span style="color: red;">(Overdue)</span>' : ''}</p>
            <p><em>Created by: ${assignment.teacher_name}</em></p>
            <button class="submit-assignment-btn" data-assignment-id="${assignment.id}">Submit Assignment</button>
            ${currentUser?.role === 'teacher' ? `<button class="view-submissions-btn" data-assignment-id="${assignment.id}">View Submissions</button>` : ''}
            <div class="submission-form" id="submission-form-${assignment.id}" style="display: none;">
                <textarea placeholder="Your submission text" id="submission-text-${assignment.id}"></textarea>
                <input type="file" id="submission-file-${assignment.id}">
                <button class="submit-btn" data-assignment-id="${assignment.id}">Submit</button>
                <button class="cancel-btn" data-assignment-id="${assignment.id}">Cancel</button>
            </div>
            <div class="submissions-list" id="submissions-list-${assignment.id}" style="display: none;"></div>
        `;

        assignmentList.appendChild(div);
    });

    // Add event listeners for submit buttons
    document.querySelectorAll(".submit-assignment-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const assignmentId = e.target.dataset.assignmentId;
            const form = document.getElementById(`submission-form-${assignmentId}`);
            form.style.display = form.style.display === "none" ? "block" : "none";
        });
    });

    // Add event listeners for submission forms
    document.querySelectorAll(".submit-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const assignmentId = e.target.dataset.assignmentId;
            await submitAssignment(assignmentId);
        });
    });

    // Add event listeners for view submissions buttons
    document.querySelectorAll(".view-submissions-btn").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            const assignmentId = e.target.dataset.assignmentId;
            await viewSubmissions(assignmentId);
        });
    });

// =======================
// VIEW SUBMISSIONS (FOR TEACHERS)
// =======================
async function viewSubmissions(assignmentId) {
    const response = await safeFetch(`/assignments/${assignmentId}/submissions`);
    if (!response.ok) {
        alert("Failed to load submissions");
        return;
    }

    const submissions = await response.json();
    const submissionsList = document.getElementById(`submissions-list-${assignmentId}`);

    if (submissions.length === 0) {
        submissionsList.innerHTML = "<p>No submissions yet.</p>";
    } else {
        submissionsList.innerHTML = submissions.map(sub => `
            <div class="submission-item">
                <h5>${sub.username} (${sub.email})</h5>
                <p><strong>Submitted:</strong> ${new Date(sub.submitted_at).toLocaleString()}</p>
                ${sub.submission_text ? `<p><strong>Text:</strong> ${sub.submission_text}</p>` : ''}
                ${sub.file_path ? `<p><strong>File:</strong> <a href="/uploads/${sub.file_path}" target="_blank">${sub.file_path}</a></p>` : ''}
            </div>
        `).join('');
    }

    submissionsList.style.display = submissionsList.style.display === "none" ? "block" : "none";
}

// =======================
// SUBMIT ASSIGNMENT
// =======================
async function submitAssignment(assignmentId) {
    const text = document.getElementById(`submission-text-${assignmentId}`).value;
    const fileInput = document.getElementById(`submission-file-${assignmentId}`);
    const file = fileInput.files[0];

    const formData = new FormData();
    if (text) formData.append("submissionText", text);
    if (file) formData.append("file", file);

    const response = await safeFetch(`/assignments/${assignmentId}/submit`, {
        method: "POST",
        body: formData
    });

    if (response.ok) {
        alert("Assignment submitted successfully!");
        // Hide the form
        document.getElementById(`submission-form-${assignmentId}`).style.display = "none";
        // Clear the form
        document.getElementById(`submission-text-${assignmentId}`).value = "";
        fileInput.value = "";
    } else {
        const error = await response.json();
        alert("Submission failed: " + (error.error || "Unknown error"));
    }
}

// =======================
// CREATE ASSIGNMENT
// =======================
const createAssignmentBtn = document.getElementById("createAssignmentBtn");
if (createAssignmentBtn) {
    createAssignmentBtn.onclick = async () => {
        if (!selectedCourseId) {
            alert("Select a course first");
            return;
        }

        const title = document.getElementById("assignmentTitle").value.trim();
        const description = document.getElementById("assignmentDescription").value;
        const dueDate = document.getElementById("assignmentDueDate").value;

        if (!title) {
            alert("Assignment title is required");
            return;
        }

        const response = await safeFetch(`/assignments/${selectedCourseId}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                title,
                description,
                dueDate
            })
        });

        if (response.ok) {
            // Clear form
            document.getElementById("assignmentTitle").value = "";
            document.getElementById("assignmentDescription").value = "";
            document.getElementById("assignmentDueDate").value = "";

            // Refresh assignments
            fetchAssignments(selectedCourseId);
            alert("Assignment created successfully!");
        } else {
            const error = await response.json();
            alert("Failed to create assignment: " + (error.error || "Unknown error"));
        }
    };
}


// =======================
// INITIAL LOAD
// =======================
setAuthState(!!authToken);