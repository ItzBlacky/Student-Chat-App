const socket = io();

let authToken = localStorage.getItem("token") || null;
let currentUser = null;
let selectedCourseId = null;

const COURSE_API = "/courses";
const MESSAGE_API = "/messages";

const courseInput = document.getElementById("courseInput");
const addCourseBtn = document.getElementById("addCourseBtn");
const courseList = document.getElementById("courseList");
const courseCount = document.getElementById("courseCount");
const discoverList = document.getElementById("discoverList");
const discoverCount = document.getElementById("discoverCount");

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
const sessionBadge = document.getElementById("sessionBadge");
const userMeta = document.getElementById("userMeta");
const brandRole = document.getElementById("brandRole");

const emptyWorkspace = document.getElementById("emptyWorkspace");
const courseContentPanel = document.querySelector(".course-content-panel");
const activeCourseTitle = document.getElementById("activeCourseTitle");
const workspaceSubtitle = document.getElementById("workspaceSubtitle");
const onlineUsersEl = document.getElementById("onlineUsers");
const typingIndicator = document.getElementById("typingIndicator");

const tabBtns = document.querySelectorAll(".tab-btn");
const tabPanes = document.querySelectorAll(".tab-pane");

const noteTitle = document.getElementById("noteTitle");
const noteFile = document.getElementById("noteFile");
const uploadNoteBtn = document.getElementById("uploadNoteBtn");
const notesList = document.getElementById("notesList");

const assignmentList = document.getElementById("assignmentList");
const createAssignmentSection = document.getElementById("createAssignmentSection");
const createAssignmentBtn = document.getElementById("createAssignmentBtn");
const assignmentTitleInput = document.getElementById("assignmentTitle");
const assignmentDescriptionInput = document.getElementById("assignmentDescription");
const assignmentDueDateInput = document.getElementById("assignmentDueDate");

tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
        const tabName = btn.dataset.tab;

        tabBtns.forEach((item) => item.classList.remove("active"));
        tabPanes.forEach((pane) => pane.classList.remove("active"));

        btn.classList.add("active");
        document.getElementById(`${tabName}-tab`).classList.add("active");
    });
});

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            "\"": "&quot;",
            "'": "&#39;",
        };
        return entities[char];
    });
}

function showAuthMessage(message, type = "info") {
    if (!authMessage) return;
    authMessage.textContent = message;
    authMessage.dataset.type = type;
}

function getAuthHeaders() {
    return authToken ? { Authorization: `Bearer ${authToken}` } : {};
}

async function safeFetch(url, options = {}) {
    options.headers = {
        ...(options.headers || {}),
        ...getAuthHeaders(),
    };

    const response = await fetch(url, options);

    if (response.status === 401) {
        handleUnauthorized();
    }

    return response;
}

function updateUserChrome() {
    if (sessionBadge) {
        sessionBadge.textContent = authToken ? (currentUser ? "Authenticated" : "Reconnecting") : "Guest";
    }

    if (userMeta) {
        userMeta.textContent = currentUser
            ? `${currentUser.username} - ${currentUser.role}`
            : authToken
                ? "Restoring your workspace..."
                : "Sign in to open your dashboard";
    }

    if (brandRole) {
        brandRole.textContent = currentUser
            ? `Welcome back, ${currentUser.username}`
            : authToken
                ? "Reconnecting your session"
                : "Sign in to continue";
    }
}

function renderOnlineUsers(users) {
    if (!onlineUsersEl) return;

    if (!users || users.length === 0) {
        onlineUsersEl.textContent = "No one online yet";
        return;
    }

    const names = users.map((user) => user.username).join(", ");
    onlineUsersEl.textContent = `${users.length} online - ${names}`;
}

function setTypingIndicator(text) {
    if (!typingIndicator) return;
    typingIndicator.textContent = text;
}

function showTeacherControls(isTeacher) {
    if (!createAssignmentSection) return;
    createAssignmentSection.classList.toggle("hidden", !isTeacher);
}

function setWorkspaceState(hasCourse, courseName = "") {
    if (emptyWorkspace) {
        emptyWorkspace.classList.toggle("hidden", hasCourse);
    }

    if (courseContentPanel) {
        courseContentPanel.style.display = hasCourse ? "flex" : "none";
    }

    if (activeCourseTitle && !hasCourse) {
        activeCourseTitle.textContent = "Select a Course";
    }

    if (workspaceSubtitle) {
        workspaceSubtitle.textContent = hasCourse
            ? `Live chat, materials, and assignment activity for ${courseName}.`
            : "Live chat, materials, and assignment activity.";
    }
}

function clearWorkspace() {
    selectedCourseId = null;
    messageList.innerHTML = "";
    notesList.innerHTML = "";
    assignmentList.innerHTML = "";
    renderOnlineUsers([]);
    setTypingIndicator("");
    setWorkspaceState(false);
}

function handleUnauthorized() {
    if (selectedCourseId) {
        socket.emit("leaveCourse", selectedCourseId);
    }

    authToken = null;
    currentUser = null;
    localStorage.removeItem("token");
    showAuthMessage("Session expired. Please log in again.", "error");
    setAuthState(false);
}

function ensureSocketAuthenticated() {
    if (!authToken) return;
    socket.emit("authenticate", authToken);
}

function setAuthState(loggedIn) {
    loginPanel.classList.toggle("hidden", loggedIn);
    appContainer.classList.toggle("hidden", !loggedIn);

    if (logoutBtn) {
        logoutBtn.style.display = loggedIn ? "inline-flex" : "none";
    }

    if (loggedIn) {
        showAuthMessage("");
        updateUserChrome();
        ensureSocketAuthenticated();
        fetchCourses();
        fetchDiscoverCourses();
        showTeacherControls(currentUser?.role === "teacher");
        setWorkspaceState(!!selectedCourseId, activeCourseTitle?.textContent || "");
    } else {
        courseList.innerHTML = "";
        discoverList.innerHTML = "";
        clearWorkspace();
        updateUserChrome();
        showTeacherControls(false);
    }
}

function setCount(el, count, suffix) {
    if (!el) return;
    el.textContent = `${count} ${suffix}`;
}

function createEmptyListMarkup(text) {
    const item = document.createElement("li");
    item.className = "empty-list";
    item.textContent = text;
    return item;
}

function createMessageItem(message, isOwnMessage) {
    const li = document.createElement("li");
    li.className = `message-item${isOwnMessage ? " own" : ""}`;

    const bubble = document.createElement("article");
    bubble.className = "message-bubble";

    const meta = document.createElement("div");
    meta.className = "message-meta";

    const author = document.createElement("span");
    author.className = "message-author";
    author.textContent = message.username || message.email || (isOwnMessage ? "You" : "Unknown");

    const time = document.createElement("span");
    time.textContent = formatTimestamp(message.created_at);

    const text = document.createElement("div");
    text.className = "message-text";
    text.textContent = message.content;

    meta.appendChild(author);
    meta.appendChild(time);
    bubble.appendChild(meta);
    bubble.appendChild(text);
    li.appendChild(bubble);

    return li;
}

function formatTimestamp(ts) {
    if (!ts) return "";

    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return "";

    return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
}

function openCourse(course) {
    if (selectedCourseId === course.id) return;

    if (selectedCourseId) {
        socket.emit("leaveCourse", selectedCourseId);
    }

    selectedCourseId = course.id;
    setWorkspaceState(true, course.name);
    activeCourseTitle.textContent = course.name;
    workspaceSubtitle.textContent = course.is_owner
        ? "You own this course. Manage discussion, materials, and assignments from one place."
        : "Follow live discussion, shared materials, and assignment updates here.";

    socket.emit("joinCourse", course.id);

    fetchMessages(course.id);
    fetchNotes(course.id);
    fetchAssignments(course.id);
    renderCourses(window.__joinedCourses || []);
}

socket.on("authenticated", ({ user }) => {
    currentUser = user;
    updateUserChrome();
    showTeacherControls(user.role === "teacher");

    if (selectedCourseId) {
        fetchAssignments(selectedCourseId);
    }
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

socket.on("newMessage", (message) => {
    if (message.courseId != selectedCourseId) return;
    if (message.userId === currentUser?.id) return;

    messageList.appendChild(createMessageItem(message, false));
    messageList.scrollTop = messageList.scrollHeight;
});

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
                body: JSON.stringify({ email, password }),
            });

            const data = await response.json();

            if (!response.ok || !data.token) {
                showAuthMessage(data.error || "Login failed", "error");
                return;
            }

            localStorage.setItem("token", data.token);
            authToken = data.token;
            currentUser = data.user || null;
            showAuthMessage("Login successful", "success");
            setAuthState(true);
        } catch (error) {
            console.error(error);
            showAuthMessage("Unable to reach server. Is it running?", "error");
        }
    };
}

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
                body: JSON.stringify({ username, email, password, role }),
            });

            const data = await response.json();

            if (response.ok) {
                showAuthMessage("Registered successfully. Please log in.", "success");
            } else {
                showAuthMessage(data.error || "Registration failed", "error");
            }
        } catch (error) {
            console.error(error);
            showAuthMessage("Unable to reach server. Is it running?", "error");
        }
    };
}

if (logoutBtn) {
    logoutBtn.onclick = () => {
        handleUnauthorized();
    };
}

async function fetchCourses() {
    if (!authToken) return;

    const response = await safeFetch(COURSE_API);
    if (!response.ok) return;

    const data = await response.json();
    window.__joinedCourses = data;
    renderCourses(data);
}

async function fetchDiscoverCourses() {
    if (!authToken) return;

    const response = await safeFetch(`${COURSE_API}/discover`);
    if (!response.ok) return;

    const data = await response.json();
    renderDiscoverCourses(data);
}

function renderCourses(courses) {
    setCount(courseCount, courses.length, "joined");
    courseList.innerHTML = "";

    if (!courses.length) {
        courseList.appendChild(createEmptyListMarkup("No courses yet. Create one to get started."));
        return;
    }

    courses.forEach((course) => {
        const li = document.createElement("li");
        li.className = `course-item${selectedCourseId === course.id ? " selected" : ""}`;

        const openBtn = document.createElement("button");
        openBtn.type = "button";
        openBtn.className = "course-item-button";
        openBtn.addEventListener("click", () => openCourse(course));

        const main = document.createElement("div");
        main.className = "course-main";

        const name = document.createElement("div");
        name.className = "course-name";
        name.textContent = course.name;

        const meta = document.createElement("div");
        meta.className = "course-meta";
        meta.textContent = course.is_owner ? "Teacher-owned space" : "Joined course";

        const badge = document.createElement("span");
        badge.className = "course-badge";
        badge.textContent = course.is_owner ? "Owner" : "Member";

        main.appendChild(name);
        main.appendChild(meta);
        openBtn.appendChild(main);
        openBtn.appendChild(badge);

        const actionBtn = document.createElement("button");
        actionBtn.type = "button";
        actionBtn.className = "course-action-btn";
        actionBtn.textContent = course.is_owner ? "Delete" : "Leave";
        actionBtn.addEventListener("click", async (event) => {
            event.stopPropagation();

            const response = await safeFetch(`${COURSE_API}/${course.id}`, {
                method: "DELETE",
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                showAuthMessage(data.error || `Failed to ${course.is_owner ? "delete" : "leave"} course`, "error");
                return;
            }

            if (selectedCourseId === course.id) {
                socket.emit("leaveCourse", course.id);
                clearWorkspace();
            }

            showAuthMessage(course.is_owner ? "Course deleted." : "You left the course.", "success");
            fetchCourses();
            fetchDiscoverCourses();
        });

        li.appendChild(openBtn);
        li.appendChild(actionBtn);
        courseList.appendChild(li);
    });
}

function renderDiscoverCourses(courses) {
    setCount(discoverCount, courses.length, "available");
    discoverList.innerHTML = "";

    if (!courses.length) {
        discoverList.appendChild(createEmptyListMarkup("You're already part of every available course."));
        return;
    }

    courses.forEach((course) => {
        const li = document.createElement("li");
        li.className = "discover-item";

        const shell = document.createElement("div");
        shell.className = "discover-item-shell";

        const main = document.createElement("div");
        main.className = "discover-main";

        const name = document.createElement("div");
        name.className = "discover-name";
        name.textContent = course.name;

        const meta = document.createElement("div");
        meta.className = "discover-meta";
        meta.textContent = "Join this course to unlock chat, materials, and assignments.";

        const joinBtn = document.createElement("button");
        joinBtn.type = "button";
        joinBtn.className = "join-btn";
        joinBtn.textContent = "Join";
        joinBtn.addEventListener("click", async () => {
            const response = await safeFetch(`${COURSE_API}/${course.id}/join`, {
                method: "POST",
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                showAuthMessage(data.error || "Unable to join course", "error");
                return;
            }

            showAuthMessage(`Joined ${course.name}`, "success");
            fetchCourses();
            fetchDiscoverCourses();
        });

        main.appendChild(name);
        main.appendChild(meta);
        shell.appendChild(main);
        shell.appendChild(joinBtn);
        li.appendChild(shell);
        discoverList.appendChild(li);
    });
}

if (addCourseBtn) {
    addCourseBtn.onclick = async () => {
        const courseName = courseInput.value.trim();
        if (!courseName) return;

        const response = await safeFetch(COURSE_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: courseName }),
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            showAuthMessage(data.error || "Unable to create course", "error");
            return;
        }

        courseInput.value = "";
        showAuthMessage("Course created successfully.", "success");
        fetchCourses();
        fetchDiscoverCourses();
    };
}

async function fetchMessages(courseId) {
    const response = await safeFetch(`${MESSAGE_API}/${courseId}`);
    if (!response.ok) return;

    const data = await response.json();
    messageList.innerHTML = "";

    if (!data.length) {
        const empty = document.createElement("li");
        empty.className = "empty-list";
        empty.textContent = "No messages yet. Start the conversation.";
        messageList.appendChild(empty);
        return;
    }

    data.forEach((message) => {
        const isOwnMessage = (message.user_id ?? message.userId) === currentUser?.id;
        messageList.appendChild(createMessageItem(message, isOwnMessage));
    });

    messageList.scrollTop = messageList.scrollHeight;
}

if (sendMessageBtn) {
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
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            showAuthMessage(data.error || "Unable to send message", "error");
            return;
        }

        const message = await response.json();

        if (messageList.querySelector(".empty-list")) {
            messageList.innerHTML = "";
        }

        messageList.appendChild(createMessageItem(message, true));
        messageList.scrollTop = messageList.scrollHeight;
        messageInput.value = "";
        messageInput.focus();
    };
}

if (messageInput) {
    messageInput.addEventListener("input", () => {
        if (selectedCourseId) {
            socket.emit("typing", selectedCourseId);
        }
    });

    messageInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            sendMessageBtn.click();
        }
    });
}

if (courseInput) {
    courseInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            addCourseBtn.click();
        }
    });
}

if (passwordInput) {
    passwordInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            loginBtn.click();
        }
    });
}

if (uploadNoteBtn) {
    uploadNoteBtn.onclick = async () => {
        if (!selectedCourseId) {
            alert("Select course first");
            return;
        }

        if (!noteFile.files || noteFile.files.length === 0) {
            alert("Please select a file to upload.");
            return;
        }

        const formData = new FormData();
        formData.append("title", noteTitle.value.trim());
        formData.append("file", noteFile.files[0]);

        const response = await safeFetch(`/notes/${selectedCourseId}/notes`, {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            showAuthMessage(data.error || "Upload failed", "error");
            return;
        }

        noteTitle.value = "";
        noteFile.value = "";
        showAuthMessage("Material uploaded successfully.", "success");
        fetchNotes(selectedCourseId);
    };
}

async function fetchNotes(courseId) {
    const response = await safeFetch(`/notes/${courseId}/notes`);
    if (!response.ok) return;

    const notes = await response.json();
    renderNotes(notes);
}

function renderNotes(notes) {
    notesList.innerHTML = "";

    if (!notes.length) {
        notesList.appendChild(createEmptyListMarkup("No materials uploaded for this course yet."));
        return;
    }

    notes.forEach((note) => {
        const li = document.createElement("li");
        li.className = "note-item";

        const main = document.createElement("div");
        main.className = "note-main";

        const title = document.createElement("div");
        title.className = "note-title";
        title.textContent = note.title;

        const meta = document.createElement("div");
        meta.className = "note-meta";
        meta.textContent = "Shared course material";

        const link = document.createElement("a");
        link.className = "note-link";
        link.href = `/uploads/${note.file_path}`;
        link.target = "_blank";
        link.textContent = "Open file";

        main.appendChild(title);
        main.appendChild(meta);
        li.appendChild(main);
        li.appendChild(link);
        notesList.appendChild(li);
    });
}

async function fetchAssignments(courseId) {
    const response = await safeFetch(`/assignments/${courseId}`);
    if (!response.ok) return;

    const assignments = await response.json();
    renderAssignments(assignments);
}

function renderAssignments(assignments) {
    assignmentList.innerHTML = "";

    if (!assignments.length) {
        const empty = document.createElement("div");
        empty.className = "empty-list";
        empty.textContent = "No assignments yet for this course.";
        assignmentList.appendChild(empty);
        return;
    }

    assignments.forEach((assignment) => {
        const card = document.createElement("article");
        card.className = "assignment-item";

        const dueDate = assignment.due_date
            ? new Date(assignment.due_date).toLocaleDateString()
            : "No due date";
        const isOverdue = assignment.due_date && new Date(assignment.due_date) < new Date();

        card.innerHTML = `
            <h4>${escapeHtml(assignment.title)}</h4>
            <p>${escapeHtml(assignment.description || "No description")}</p>
            <p><strong>Due:</strong> ${escapeHtml(dueDate)} <span class="status-chip ${isOverdue ? "overdue" : "active"}">${isOverdue ? "Overdue" : "Active"}</span></p>
            <p><strong>Created by:</strong> ${escapeHtml(assignment.teacher_name)}</p>
            <div class="assignment-actions">
                <button class="submit-assignment-btn" data-assignment-id="${assignment.id}">Submit Assignment</button>
                ${currentUser?.role === "teacher" ? `<button class="view-submissions-btn" data-assignment-id="${assignment.id}">View Submissions</button>` : ""}
            </div>
            <div class="submission-form hidden" id="submission-form-${assignment.id}">
                <textarea placeholder="Your submission text" id="submission-text-${assignment.id}"></textarea>
                <input type="file" id="submission-file-${assignment.id}">
                <div class="assignment-actions">
                    <button class="submit-btn" data-assignment-id="${assignment.id}">Submit</button>
                    <button class="cancel-btn" data-assignment-id="${assignment.id}">Cancel</button>
                </div>
            </div>
            <div class="submissions-list hidden" id="submissions-list-${assignment.id}"></div>
        `;

        assignmentList.appendChild(card);
    });

    document.querySelectorAll(".submit-assignment-btn").forEach((btn) => {
        btn.addEventListener("click", (event) => {
            const assignmentId = event.target.dataset.assignmentId;
            const form = document.getElementById(`submission-form-${assignmentId}`);
            form.classList.toggle("hidden");
        });
    });

    document.querySelectorAll(".submit-btn").forEach((btn) => {
        btn.addEventListener("click", async (event) => {
            const assignmentId = event.target.dataset.assignmentId;
            await submitAssignment(assignmentId);
        });
    });

    document.querySelectorAll(".cancel-btn").forEach((btn) => {
        btn.addEventListener("click", (event) => {
            const assignmentId = event.target.dataset.assignmentId;
            document.getElementById(`submission-form-${assignmentId}`).classList.add("hidden");
        });
    });

    document.querySelectorAll(".view-submissions-btn").forEach((btn) => {
        btn.addEventListener("click", async (event) => {
            const assignmentId = event.target.dataset.assignmentId;
            await viewSubmissions(assignmentId);
        });
    });
}

async function viewSubmissions(assignmentId) {
    const response = await safeFetch(`/assignments/${assignmentId}/submissions`);

    if (!response.ok) {
        alert("Failed to load submissions");
        return;
    }

    const submissions = await response.json();
    const submissionsList = document.getElementById(`submissions-list-${assignmentId}`);

    if (!submissions.length) {
        submissionsList.innerHTML = '<div class="empty-list">No submissions yet.</div>';
    } else {
        submissionsList.innerHTML = submissions.map((submission) => `
            <div class="submission-item">
                <h5>${escapeHtml(submission.username)} (${escapeHtml(submission.email)})</h5>
                <p><strong>Submitted:</strong> ${escapeHtml(new Date(submission.submitted_at).toLocaleString())}</p>
                ${submission.submission_text ? `<p><strong>Text:</strong> ${escapeHtml(submission.submission_text)}</p>` : ""}
                ${submission.file_path ? `<p><strong>File:</strong> <a class="note-link" href="/uploads/${encodeURIComponent(submission.file_path)}" target="_blank">${escapeHtml(submission.file_path)}</a></p>` : ""}
            </div>
        `).join("");
    }

    submissionsList.classList.toggle("hidden");
}

async function submitAssignment(assignmentId) {
    const text = document.getElementById(`submission-text-${assignmentId}`).value;
    const fileInput = document.getElementById(`submission-file-${assignmentId}`);
    const file = fileInput.files[0];

    const formData = new FormData();
    if (text) formData.append("submissionText", text);
    if (file) formData.append("file", file);

    const response = await safeFetch(`/assignments/${assignmentId}/submit`, {
        method: "POST",
        body: formData,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        alert(`Submission failed: ${error.error || "Unknown error"}`);
        return;
    }

    alert("Assignment submitted successfully!");
    document.getElementById(`submission-form-${assignmentId}`).classList.add("hidden");
    document.getElementById(`submission-text-${assignmentId}`).value = "";
    fileInput.value = "";
}

if (createAssignmentBtn) {
    createAssignmentBtn.onclick = async () => {
        if (!selectedCourseId) {
            alert("Select a course first");
            return;
        }

        const title = assignmentTitleInput.value.trim();
        const description = assignmentDescriptionInput.value;
        const dueDate = assignmentDueDateInput.value;

        if (!title) {
            alert("Assignment title is required");
            return;
        }

        const response = await safeFetch(`/assignments/${selectedCourseId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, description, dueDate }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            alert(`Failed to create assignment: ${error.error || "Unknown error"}`);
            return;
        }

        assignmentTitleInput.value = "";
        assignmentDescriptionInput.value = "";
        assignmentDueDateInput.value = "";
        showAuthMessage("Assignment created successfully.", "success");
        fetchAssignments(selectedCourseId);
    };
}

document.addEventListener("DOMContentLoaded", () => {
    updateUserChrome();
    setWorkspaceState(false);
    setAuthState(!!authToken);
});
