const runtimeConfig = window.STUDYMATE_CONFIG || {};
const localHostnames = new Set(["localhost", "127.0.0.1", "::1"]);
const defaultBackendUrl = localHostnames.has(window.location.hostname) || window.location.protocol === "file:"
    ? "http://localhost:5000"
    : "";

function normalizeBaseUrl(value) {
    return String(value || "").trim().replace(/\/+$/, "");
}

const API_BASE_URL = normalizeBaseUrl(runtimeConfig.API_BASE_URL || defaultBackendUrl);
const SOCKET_URL = normalizeBaseUrl(runtimeConfig.SOCKET_URL || API_BASE_URL);

function appUrl(path) {
    if (/^https?:\/\//i.test(path)) {
        return path;
    }

    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return API_BASE_URL ? `${API_BASE_URL}${normalizedPath}` : normalizedPath;
}

function uploadUrl(filename) {
    return appUrl(`/uploads/${encodeURIComponent(filename)}`);
}

const socket = SOCKET_URL ? io(SOCKET_URL) : io();

let authToken = localStorage.getItem("token") || null;
let currentUser = null;

let activeView = "home";
let selectedCourseId = null;
let selectedCourse = null;
let selectedCourseMembers = [];
let selectedFriend = null;
let activePrivateConversationId = null;
let activeProfile = null;
let viewedProfile = null;
let currentSearchQuery = "";
let currentSearchResults = [];
let navigationStack = [];

let joinedCourses = [];
let discoverCourses = [];
let friends = [];
let incomingRequests = [];
let outgoingRequests = [];
let friendRecommendations = [];

let joinedCourseRoomId = null;
let joinedPrivateRoomId = null;
let searchFilter = "all";
let lastPeopleSearchToken = 0;
let courseMessagesHasMore = false;
let privateMessagesHasMore = false;
let oldestCourseMessageId = null;
let oldestPrivateMessageId = null;
let pendingDeleteFriend = null;
let deleteFriendConfirmationStep = 0;

const COURSE_API = "/courses";
const MESSAGE_API = "/messages";
const FRIENDS_API = "/friends";

const courseInput = document.getElementById("courseInput");
const addCourseBtn = document.getElementById("addCourseBtn");
const courseList = document.getElementById("courseList");
const courseCount = document.getElementById("courseCount");
const discoverList = document.getElementById("discoverList");
const discoverCount = document.getElementById("discoverCount");

const messageList = document.getElementById("messageList");
const messageInput = document.getElementById("messageInput");
const sendMessageBtn = document.getElementById("sendMessageBtn");

const privateMessageList = document.getElementById("privateMessageList");
const privateMessageInput = document.getElementById("privateMessageInput");
const sendPrivateMessageBtn = document.getElementById("sendPrivateMessageBtn");

const usernameInput = document.getElementById("usernameInput");
const emailInput = document.getElementById("emailInput");
const passwordInput = document.getElementById("passwordInput");
const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const logoutBtn = document.getElementById("logoutBtn");

const loginPanel = document.querySelector(".login-panel");
const appContainer = document.querySelector(".app-container");
const authMessage = document.getElementById("authMessage");
const sessionBadge = document.getElementById("sessionBadge");
const userMeta = document.getElementById("userMeta");
const brandRole = document.getElementById("brandRole");
const themeToggle = document.getElementById("themeToggle");

const homeWorkspace = document.getElementById("homeWorkspace");
const courseWorkspace = document.getElementById("courseWorkspace");
const privateWorkspace = document.getElementById("privateWorkspace");
const profileWorkspace = document.getElementById("profileWorkspace");
const searchWorkspace = document.getElementById("searchWorkspace");

const activeCourseTitle = document.getElementById("activeCourseTitle");
const workspaceSubtitle = document.getElementById("workspaceSubtitle");
const onlineUsersEl = document.getElementById("onlineUsers");
const typingIndicator = document.getElementById("typingIndicator");
const loadOlderCourseMessagesBtn = document.getElementById("loadOlderCourseMessagesBtn");

const activeFriendTitle = document.getElementById("activeFriendTitle");
const privateWorkspaceSubtitle = document.getElementById("privateWorkspaceSubtitle");
const privateTypingIndicator = document.getElementById("privateTypingIndicator");
const loadOlderPrivateMessagesBtn = document.getElementById("loadOlderPrivateMessagesBtn");
const viewFriendProfileBtn = document.getElementById("viewFriendProfileBtn");

const tabBtns = document.querySelectorAll(".tab-btn");
const tabPanes = document.querySelectorAll(".tab-pane");

const noteTitle = document.getElementById("noteTitle");
const noteFile = document.getElementById("noteFile");
const uploadNoteBtn = document.getElementById("uploadNoteBtn");
const notesList = document.getElementById("notesList");

const assignmentList = document.getElementById("assignmentList");
const courseAdminSection = document.getElementById("courseAdminSection");
const courseMembersList = document.getElementById("courseMembersList");
const createAssignmentSection = document.getElementById("createAssignmentSection");
const createAssignmentBtn = document.getElementById("createAssignmentBtn");
const assignmentTitleInput = document.getElementById("assignmentTitle");
const assignmentDescriptionInput = document.getElementById("assignmentDescription");
const assignmentDueDateInput = document.getElementById("assignmentDueDate");

const friendIdLabel = document.getElementById("friendIdLabel");
const friendList = document.getElementById("friendList");
const recommendationList = document.getElementById("recommendationList");
const incomingRequestList = document.getElementById("incomingRequestList");
const outgoingRequestList = document.getElementById("outgoingRequestList");
const friendCount = document.getElementById("friendCount");
const incomingRequestCount = document.getElementById("incomingRequestCount");
const outgoingRequestCount = document.getElementById("outgoingRequestCount");
const profileBtn = document.getElementById("profileBtn");
const profileTitle = document.getElementById("profileTitle");
const profileCard = document.getElementById("profileCard");
const profileCourseList = document.getElementById("profileCourseList");
const profileFriendListTitle = document.getElementById("profileFriendListTitle");
const profileFriendList = document.getElementById("profileFriendList");
const profileActions = document.getElementById("profileActions");
const backBtn = document.getElementById("backBtn");
const toolbarHomeBtn = document.getElementById("toolbarHomeBtn");
const userSummaryModal = document.getElementById("userSummaryModal");
const userSummaryTitle = document.getElementById("userSummaryTitle");
const userSummaryContent = document.getElementById("userSummaryContent");
const closeUserSummaryBtn = document.getElementById("closeUserSummaryBtn");
const deleteFriendModal = document.getElementById("deleteFriendModal");
const deleteFriendModalTitle = document.getElementById("deleteFriendModalTitle");
const deleteFriendModalContent = document.getElementById("deleteFriendModalContent");
const closeDeleteFriendModalBtn = document.getElementById("closeDeleteFriendModalBtn");
const cancelDeleteFriendBtn = document.getElementById("cancelDeleteFriendBtn");
const confirmDeleteFriendBtn = document.getElementById("confirmDeleteFriendBtn");

const toolbarSearch = document.querySelector(".toolbar-search");
const searchToggleBtn = document.getElementById("searchToggleBtn");
const globalSearchInput = document.getElementById("globalSearchInput");
const executeSearchBtn = document.getElementById("executeSearchBtn");
const searchResults = document.getElementById("searchResults");
const searchFilterBtns = document.querySelectorAll(".search-filter");
const searchWorkspaceTitle = document.getElementById("searchWorkspaceTitle");
const searchWorkspaceSubtitle = document.getElementById("searchWorkspaceSubtitle");
const searchWorkspaceContent = document.getElementById("searchWorkspaceContent");

function getPreferredTheme() {
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark" || savedTheme === "light") {
        return savedTheme;
    }

    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
}

function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);

    if (themeToggle) {
        const isDark = theme === "dark";
        themeToggle.classList.toggle("is-dark", isDark);
        themeToggle.classList.toggle("is-light", !isDark);
        themeToggle.setAttribute("aria-pressed", String(!isDark));
        themeToggle.setAttribute("aria-label", isDark ? "Dark mode is off" : "Light mode is on");
    }
}

function setupThemeToggle() {
    if (!themeToggle) return;

    applyTheme(getPreferredTheme());
    themeToggle.addEventListener("click", () => {
        const currentTheme = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
        applyTheme(currentTheme === "dark" ? "light" : "dark");
    });
}

function isSearchExpanded() {
    return !!toolbarSearch?.classList.contains("search-open");
}

function setSearchExpanded(expanded, options = {}) {
    if (!toolbarSearch || !searchToggleBtn) return;

    toolbarSearch.classList.toggle("search-open", expanded);
    searchToggleBtn.setAttribute("aria-expanded", String(expanded));
    searchToggleBtn.setAttribute("aria-label", expanded ? "Close search" : "Open search");

    if (!expanded) {
        searchResults?.classList.add("hidden");
        return;
    }

    if (options.focusInput !== false) {
        window.setTimeout(() => globalSearchInput?.focus(), 0);
    }

    if (globalSearchInput?.value.trim()) {
        performSearch(globalSearchInput.value.trim());
    }
}

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

    const response = await fetch(appUrl(url), options);
    if (response.status === 401) {
        handleUnauthorized();
    }

    return response;
}

function normalizeRole(role) {
    return String(role || "").toLowerCase();
}

function getCourseRole(course) {
    return normalizeRole(course?.course_role || course?.role || "student");
}

function updateUserChrome() {
    const courseRole = getCourseRole(selectedCourse);
    const viewLabel = activeView === "course" && selectedCourse
        ? `${courseRole || "member"} in ${selectedCourse.name}`
        : activeView === "private" && selectedFriend
            ? `chatting with ${selectedFriend.username}`
            : activeView === "profile" && viewedProfile
                ? `viewing ${viewedProfile.username}`
                : activeView === "search" && currentSearchQuery
                    ? `searching "${currentSearchQuery}"`
                    : "home";

    if (sessionBadge) {
        sessionBadge.textContent = authToken ? (currentUser ? "Authenticated" : "Reconnecting") : "Guest";
    }

    if (userMeta) {
        userMeta.textContent = currentUser
            ? `${currentUser.username} · ${viewLabel}`
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

    if (friendIdLabel) {
        friendIdLabel.textContent = "Use the toolbar search to find courses, friends, and people.";
    }
}

function renderOnlineUsers(users) {
    if (!onlineUsersEl) return;

    if (!users || users.length === 0) {
        onlineUsersEl.textContent = "No one online yet";
        return;
    }

    const names = users.map((user) => user.username).join(", ");
    onlineUsersEl.textContent = `${users.length} online · ${names}`;
}

function setTypingIndicator(text) {
    if (typingIndicator) {
        typingIndicator.textContent = text;
    }
}

function setPrivateTypingIndicator(text) {
    if (privateTypingIndicator) {
        privateTypingIndicator.textContent = text || "Say hello to start chatting";
    }
}

function getSelectedCourseRole() {
    return getCourseRole(selectedCourse);
}

function canCreateAssignments() {
    return ["admin", "teacher"].includes(getSelectedCourseRole());
}

function canManageRoles() {
    return getSelectedCourseRole() === "admin";
}

function canSubmitAssignments() {
    return getSelectedCourseRole() === "student";
}

function showTeacherControls(isTeacher = canCreateAssignments()) {
    if (!createAssignmentSection) return;
    createAssignmentSection.classList.toggle("hidden", !isTeacher);
    createAssignmentSection.style.display = isTeacher ? "grid" : "none";
}

function showCourseAdminControls(isAdmin = canManageRoles()) {
    if (!courseAdminSection) return;
    courseAdminSection.classList.toggle("hidden", !isAdmin);
    courseAdminSection.style.display = isAdmin ? "grid" : "none";
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

function matchesUserSearch(user, normalized) {
    const username = String(user?.username || "").toLowerCase();
    const email = String(user?.email || "").toLowerCase();
    const userCode = String(user?.user_code || "").toLowerCase();
    return username.includes(normalized) || email.includes(normalized) || userCode.includes(normalized);
}

function getInitial(value) {
    return String(value || "?").trim().charAt(0).toUpperCase() || "?";
}

function createMessageItem(message, isOwnMessage) {
    const li = document.createElement("li");
    li.className = `message-item${isOwnMessage ? " own" : ""}`;

    if (!isOwnMessage) {
        const avatar = document.createElement("button");
        avatar.type = "button";
        avatar.className = "message-avatar";
        avatar.textContent = getInitial(message.username || message.email);
        avatar.addEventListener("click", () => showUserSummary(message.user_id ?? message.userId));
        li.appendChild(avatar);
    }

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

function updateNavigationButtons() {
    if (backBtn) {
        backBtn.disabled = navigationStack.length === 0;
    }
}

function refreshSearchWorkspaceIfOpen() {
    if (activeView === "search" && currentSearchQuery) {
        renderSearchWorkspace(currentSearchQuery, currentSearchResults);
    }
}

function setMainView(view, options = {}) {
    const previousView = activeView;

    if (!options.skipHistory && previousView && previousView !== view) {
        navigationStack.push(previousView);
    }

    [homeWorkspace, courseWorkspace, privateWorkspace, profileWorkspace, searchWorkspace].forEach((panel) => {
        if (panel) {
            panel.classList.remove("active-view");
        }
    });

    if (view === "home" && homeWorkspace) {
        homeWorkspace.classList.add("active-view");
    }

    if (view === "course" && courseWorkspace) {
        courseWorkspace.classList.add("active-view");
    }

    if (view === "private" && privateWorkspace) {
        privateWorkspace.classList.add("active-view");
    }

    if (view === "profile" && profileWorkspace) {
        profileWorkspace.classList.add("active-view");
    }

    if (view === "search" && searchWorkspace) {
        searchWorkspace.classList.add("active-view");
    }

    activeView = view;
    updateUserChrome();
    renderCourses(joinedCourses);
    renderFriends();
    updateNavigationButtons();
}

function leaveJoinedRooms() {
    if (joinedCourseRoomId) {
        socket.emit("leaveCourse", joinedCourseRoomId);
        joinedCourseRoomId = null;
        renderOnlineUsers([]);
        setTypingIndicator("");
    }

    if (joinedPrivateRoomId) {
        socket.emit("leavePrivateConversation", joinedPrivateRoomId);
        joinedPrivateRoomId = null;
        setPrivateTypingIndicator("");
    }
}

function showHomeView() {
    leaveJoinedRooms();
    setMainView("home");
}

function clearCourseWorkspace() {
    selectedCourseId = null;
    selectedCourse = null;
    selectedCourseMembers = [];
    messageList.innerHTML = "";
    notesList.innerHTML = "";
    assignmentList.innerHTML = "";
    if (courseMembersList) {
        courseMembersList.innerHTML = "";
    }
    if (activeCourseTitle) {
        activeCourseTitle.textContent = "Select a Course";
    }
    if (workspaceSubtitle) {
        workspaceSubtitle.textContent = "Live chat, materials, and assignment activity.";
    }
    renderOnlineUsers([]);
    setTypingIndicator("");
    courseMessagesHasMore = false;
    oldestCourseMessageId = null;
    if (loadOlderCourseMessagesBtn) {
        loadOlderCourseMessagesBtn.classList.add("hidden");
    }
    showTeacherControls(false);
    showCourseAdminControls(false);
}

function clearPrivateWorkspace() {
    selectedFriend = null;
    activePrivateConversationId = null;
    privateMessageList.innerHTML = "";
    if (activeFriendTitle) {
        activeFriendTitle.textContent = "Select a friend";
    }
    if (privateWorkspaceSubtitle) {
        privateWorkspaceSubtitle.textContent = "Personal messages with your friends live here.";
    }
    setPrivateTypingIndicator("");
    privateMessagesHasMore = false;
    oldestPrivateMessageId = null;
    if (loadOlderPrivateMessagesBtn) {
        loadOlderPrivateMessagesBtn.classList.add("hidden");
    }
    if (viewFriendProfileBtn) {
        viewFriendProfileBtn.classList.add("hidden");
    }
}

function handleUnauthorized() {
    leaveJoinedRooms();
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

async function hydrateDashboard() {
    await Promise.all([
        fetchCourses(),
        fetchDiscoverCourses(),
        fetchFriendOverview(),
        fetchOwnProfile(),
    ]);
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
        showHomeView();
        hydrateDashboard();
    } else {
        joinedCourses = [];
        discoverCourses = [];
        friends = [];
        incomingRequests = [];
        outgoingRequests = [];
        friendRecommendations = [];
        activeProfile = null;
        courseList.innerHTML = "";
        discoverList.innerHTML = "";
        friendList.innerHTML = "";
        recommendationList.innerHTML = "";
        incomingRequestList.innerHTML = "";
        outgoingRequestList.innerHTML = "";
        clearCourseWorkspace();
        clearPrivateWorkspace();
    }
}

async function fetchOwnProfile() {
    if (!authToken) return;

    const response = await safeFetch(`${FRIENDS_API}/profile`);
    if (!response.ok) return;

    activeProfile = await response.json();
    renderProfile(activeProfile, true);
    updateUserChrome();
}

function renderProfileConnections(profile, isOwnProfile) {
    if (!profileFriendList || !profileFriendListTitle) return;

    const connections = isOwnProfile ? (profile.friends || []) : (profile.mutual_friends || []);
    profileFriendListTitle.textContent = isOwnProfile ? "Your friends" : "Mutual friends";
    profileFriendList.innerHTML = "";

    if (!connections.length) {
        profileFriendList.appendChild(
            createEmptyListMarkup(
                isOwnProfile
                    ? "No friends added yet."
                    : "No mutual friends to show."
            )
        );
        return;
    }

    connections.forEach((friend) => {
        profileFriendList.appendChild(createFriendItem(friend, (actions) => {
            const viewBtn = document.createElement("button");
            viewBtn.type = "button";
            viewBtn.className = "mini-btn";
            viewBtn.textContent = "View";
            viewBtn.addEventListener("click", () => openPersonProfile(friend.id));
            actions.appendChild(viewBtn);

            if (isOwnProfile || friend.conversation_id) {
                const chatBtn = document.createElement("button");
                chatBtn.type = "button";
                chatBtn.className = "mini-btn";
                chatBtn.textContent = "Chat";
                chatBtn.addEventListener("click", () => openPrivateChat(friend));
                actions.appendChild(chatBtn);
            }
        }));
    });
}

function renderProfile(profile, isOwnProfile = false) {
    if (!profileCard || !profileCourseList || !profileFriendList || !profile) return;
    viewedProfile = profile;

    if (profileTitle) {
        profileTitle.textContent = isOwnProfile ? "Your profile" : `${profile.username}'s profile`;
    }

    profileCard.innerHTML = `
        <div class="profile-stat"><strong>Username</strong><span>${escapeHtml(profile.username)}</span></div>
        <div class="profile-stat"><strong>Email</strong><span>${escapeHtml(profile.email)}</span></div>
        <div class="profile-stat"><strong>User ID</strong><span>${escapeHtml(profile.user_code)}</span></div>
        <div class="profile-stat"><strong>Total courses</strong><span>${escapeHtml(profile.total_courses)}</span></div>
        <div class="profile-stat"><strong>Total friends</strong><span>${escapeHtml(profile.total_friends)}</span></div>
    `;

    if (!isOwnProfile && profile.relationship === "friend") {
        const dangerSection = document.createElement("div");
        dangerSection.className = "profile-danger-zone";

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "danger-btn";
        removeBtn.textContent = "Delete Friend";
        removeBtn.addEventListener("click", () => openDeleteFriendModal(profile));

        dangerSection.appendChild(removeBtn);
        profileCard.appendChild(dangerSection);
    }

    if (profileActions) {
        profileActions.innerHTML = "";

        if (!isOwnProfile) {
            if (profile.relationship === "friend") {
                const chatBtn = document.createElement("button");
                chatBtn.type = "button";
                chatBtn.className = "mini-btn";
                chatBtn.textContent = "Chat";
                chatBtn.addEventListener("click", () => openPrivateChat(profile));
                profileActions.appendChild(chatBtn);
            } else if (profile.relationship === "incoming_pending" && profile.request_id) {
                const acceptBtn = document.createElement("button");
                acceptBtn.type = "button";
                acceptBtn.className = "mini-btn";
                acceptBtn.textContent = "Accept Friend";
                acceptBtn.addEventListener("click", async () => {
                    await respondToFriendRequest(profile.request_id, "accept");
                    await openPersonProfile(profile.id);
                });
                profileActions.appendChild(acceptBtn);
            } else if (profile.relationship !== "outgoing_pending") {
                const addBtn = document.createElement("button");
                addBtn.type = "button";
                addBtn.className = "mini-btn";
                addBtn.textContent = "Add Friend";
                addBtn.addEventListener("click", () => sendFriendRequest(profile.user_code));
                profileActions.appendChild(addBtn);
            } else {
                const pendingBadge = document.createElement("span");
                pendingBadge.className = "course-badge";
                pendingBadge.textContent = "Request Sent";
                profileActions.appendChild(pendingBadge);
            }
        }
    }

    profileCourseList.innerHTML = "";
    if (!profile.courses?.length) {
        profileCourseList.appendChild(createEmptyListMarkup("No joined courses yet."));
    } else {
        profile.courses.forEach((course) => {
            const item = document.createElement("li");
            item.className = "friend-item";
            item.innerHTML = `
                <div class="friend-main">
                    <div class="friend-name">${escapeHtml(course.name)}</div>
                    <div class="friend-meta">${escapeHtml(normalizeRole(course.role))} role</div>
                </div>
            `;
            profileCourseList.appendChild(item);
        });
    }

    renderProfileConnections(profile, isOwnProfile);
}

function openProfileView() {
    leaveJoinedRooms();
    setMainView("profile");
    fetchOwnProfile();
}

async function openPersonProfile(userId) {
    const response = await safeFetch(`${FRIENDS_API}/users/${userId}/summary`);
    const profile = await response.json().catch(() => ({}));

    if (!response.ok) {
        showAuthMessage(profile.error || "Unable to load profile", "error");
        return;
    }

    leaveJoinedRooms();
    renderProfile(profile, Number(profile.id) === Number(currentUser?.id));
    setMainView("profile");
}

function renderDeleteFriendModalStep() {
    if (!deleteFriendModalContent || !confirmDeleteFriendBtn || !pendingDeleteFriend) return;

    if (deleteFriendModalTitle) {
        deleteFriendModalTitle.textContent = deleteFriendConfirmationStep === 0
            ? `Remove ${pendingDeleteFriend.username}?`
            : `Final confirmation`;
    }

    if (deleteFriendConfirmationStep === 0) {
        deleteFriendModalContent.innerHTML = `
            <div class="profile-stat"><strong>Friend</strong><span>${escapeHtml(pendingDeleteFriend.username)}</span></div>
            <div class="profile-stat"><strong>User ID</strong><span>${escapeHtml(pendingDeleteFriend.user_code)}</span></div>
            <div class="delete-warning-copy">Removing this friend will erase your private chat access and remove them from your friends list.</div>
        `;
        confirmDeleteFriendBtn.textContent = "Continue";
    } else {
        deleteFriendModalContent.innerHTML = `
            <div class="delete-warning-copy">This action cannot be undone from the app. Are you sure you want to permanently remove ${escapeHtml(pendingDeleteFriend.username)} as a friend?</div>
        `;
        confirmDeleteFriendBtn.textContent = "Delete Friend";
    }
}

function openDeleteFriendModal(friend) {
    if (!deleteFriendModal || !friend) return;

    pendingDeleteFriend = friend;
    deleteFriendConfirmationStep = 0;
    renderDeleteFriendModalStep();
    deleteFriendModal.classList.remove("hidden");
}

function closeDeleteFriendModal() {
    if (deleteFriendModal) {
        deleteFriendModal.classList.add("hidden");
    }

    pendingDeleteFriend = null;
    deleteFriendConfirmationStep = 0;
}

async function deleteFriend(friendId) {
    const response = await safeFetch(`${FRIENDS_API}/users/${friendId}`, {
        method: "DELETE",
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        showAuthMessage(data.error || "Unable to delete friend", "error");
        return false;
    }

    showAuthMessage(data.message || "Friend removed", "success");
    await Promise.all([fetchFriendOverview(), fetchOwnProfile()]);

    if (selectedFriend && Number(selectedFriend.id) === Number(friendId)) {
        clearPrivateWorkspace();
        showHomeView();
    }

    if (viewedProfile && Number(viewedProfile.id) === Number(friendId)) {
        openProfileView();
    }

    if (globalSearchInput?.value.trim()) {
        await performSearch(globalSearchInput.value.trim());
        refreshSearchWorkspaceIfOpen();
    }

    return true;
}

function renderSearchWorkspace(query, results) {
    if (!searchWorkspaceContent) return;

    if (searchWorkspaceTitle) {
        searchWorkspaceTitle.textContent = query ? `Results for "${query}"` : "Search results";
    }

    if (searchWorkspaceSubtitle) {
        searchWorkspaceSubtitle.textContent = results.length
            ? "Open a result to see more details or continue the conversation."
            : "No matching courses, friends, or people were found.";
    }

    searchWorkspaceContent.innerHTML = "";

    if (!results.length) {
        const empty = document.createElement("div");
        empty.className = "empty-list";
        empty.textContent = "No matching search results.";
        searchWorkspaceContent.appendChild(empty);
        return;
    }

    results.forEach((result) => {
        const card = document.createElement("div");
        card.className = "search-result-card";

        const main = document.createElement("div");
        main.className = "search-result-main";

        const title = document.createElement("div");
        title.className = "search-result-title";
        title.textContent = result.title;

        const meta = document.createElement("div");
        meta.className = "search-result-meta";
        meta.textContent = result.meta;

        const actionBtn = document.createElement("button");
        actionBtn.type = "button";
        actionBtn.className = "mini-btn";
        actionBtn.textContent = result.actionLabel;
        actionBtn.disabled = !!result.disabled;
        actionBtn.addEventListener("click", async () => {
            await result.action();
            searchResults.classList.add("hidden");
        });

        main.appendChild(title);
        main.appendChild(meta);
        card.appendChild(main);
        card.appendChild(actionBtn);
        main.addEventListener("click", async () => {
            await result.action();
            searchResults.classList.add("hidden");
        });
        searchWorkspaceContent.appendChild(card);
    });
}

function getSearchPreviewResults(results) {
    if (!Array.isArray(results) || results.length === 0) {
        return [];
    }

    if (searchFilter !== "all") {
        return results.slice(0, 8);
    }

    const grouped = {
        course: [],
        friend: [],
        people: [],
    };

    results.forEach((result) => {
        const type = result.type || "course";
        if (!grouped[type]) {
            grouped[type] = [];
        }
        grouped[type].push(result);
    });

    const preview = [];
    const quotas = {
        course: 3,
        friend: 3,
        people: 4,
    };

    Object.entries(quotas).forEach(([type, limit]) => {
        grouped[type].slice(0, limit).forEach((result) => preview.push(result));
    });

    if (preview.length >= 10) {
        return preview.slice(0, 10);
    }

    results.forEach((result) => {
        if (preview.length >= 10) {
            return;
        }

        if (!preview.includes(result)) {
            preview.push(result);
        }
    });

    return preview;
}

function buildPersonResult(person) {
    const isFriend = person.relationship === "friend";
    const sharedCourses = Number(person.common_courses ?? person.mutual_courses ?? 0);
    const metaParts = [isFriend ? "Friend" : "Person", person.user_code || "--"];

    if (sharedCourses > 0) {
        metaParts.push(`${sharedCourses} shared courses`);
    }

    return {
        type: "people",
        title: person.username,
        meta: metaParts.join(" · "),
        actionLabel: "View",
        disabled: false,
        action: async () => {
            await openPersonProfile(person.id);
        },
    };
}

async function showUserSummary(userId) {
    if (!userId || !userSummaryModal || !userSummaryContent) return;

    const response = await safeFetch(`${FRIENDS_API}/users/${userId}/summary`);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        showAuthMessage(data.error || "Unable to load user information", "error");
        return;
    }

    if (userSummaryTitle) {
        userSummaryTitle.textContent = `${data.username}'s profile`;
    }

    userSummaryContent.innerHTML = `
        <div class="profile-stat"><strong>User ID</strong><span>${escapeHtml(data.user_code)}</span></div>
        <div class="profile-stat"><strong>Email</strong><span>${escapeHtml(data.email)}</span></div>
        <div class="profile-stat"><strong>Joined courses</strong><span>${escapeHtml(data.total_courses)}</span></div>
        <div class="profile-stat"><strong>Total friends</strong><span>${escapeHtml(data.total_friends)}</span></div>
        <div class="profile-card">
            ${(data.courses || []).map((course) => `
                <div class="profile-stat">
                    <strong>${escapeHtml(course.name)}</strong>
                    <span>${escapeHtml(normalizeRole(course.role))}</span>
                </div>
            `).join("") || `<div class="empty-list">No joined courses visible.</div>`}
        </div>
    `;

    const viewProfileBtn = document.createElement("button");
    viewProfileBtn.type = "button";
    viewProfileBtn.className = "mini-btn";
    viewProfileBtn.textContent = "Open Profile";
    viewProfileBtn.addEventListener("click", async () => {
        closeUserSummary();
        await openPersonProfile(userId);
    });
    userSummaryContent.appendChild(viewProfileBtn);

    userSummaryModal.classList.remove("hidden");
}

function closeUserSummary() {
    if (userSummaryModal) {
        userSummaryModal.classList.add("hidden");
    }
}

function goBack() {
    const previousView = navigationStack.pop();
    if (!previousView) return;
    setMainView(previousView, { skipHistory: true });
}

function getCourseSubtitle(course) {
    const courseRole = getCourseRole(course);
    if (courseRole === "admin") {
        return "You are the course admin. Manage roles, assignments, and activity from here.";
    }

    if (courseRole === "teacher") {
        return "You are a course teacher. Create assignments and review student submissions here.";
    }

    return "You are a student in this course. Follow updates and submit your assignment work here.";
}

async function openCourse(course) {
    if (!course) return;

    if (joinedPrivateRoomId) {
        socket.emit("leavePrivateConversation", joinedPrivateRoomId);
        joinedPrivateRoomId = null;
    }

    if (joinedCourseRoomId && joinedCourseRoomId !== course.id) {
        socket.emit("leaveCourse", joinedCourseRoomId);
    }

    selectedCourseId = course.id;
    selectedCourse = course;
    selectedFriend = null;
    activePrivateConversationId = null;

    joinedCourseRoomId = course.id;
    socket.emit("joinCourse", course.id);

    if (activeCourseTitle) {
        activeCourseTitle.textContent = course.name;
    }

    if (workspaceSubtitle) {
        workspaceSubtitle.textContent = getCourseSubtitle(course);
    }

    setMainView("course");
    showTeacherControls();
    showCourseAdminControls();

    await Promise.all([
        fetchMessages(course.id),
        fetchNotes(course.id),
        fetchAssignments(course.id),
        fetchCourseMembers(course.id),
    ]);
}

async function openPrivateChat(friend) {
    if (!friend) return;

    if (joinedCourseRoomId) {
        socket.emit("leaveCourse", joinedCourseRoomId);
        joinedCourseRoomId = null;
        renderOnlineUsers([]);
        setTypingIndicator("");
    }

    selectedFriend = friend;

    const response = await safeFetch(`${FRIENDS_API}/conversations/${friend.id}/messages?limit=40`);
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        showAuthMessage(data.error || "Unable to load private conversation", "error");
        return;
    }

    const data = await response.json();
    activePrivateConversationId = data.conversationId;

    if (joinedPrivateRoomId && joinedPrivateRoomId !== activePrivateConversationId) {
        socket.emit("leavePrivateConversation", joinedPrivateRoomId);
    }

    joinedPrivateRoomId = activePrivateConversationId;
    socket.emit("joinPrivateConversation", activePrivateConversationId);

    activeFriendTitle.textContent = friend.username;
    privateWorkspaceSubtitle.textContent = `Private conversation with ${friend.username} · ID ${friend.user_code}`;
    if (viewFriendProfileBtn) {
        viewFriendProfileBtn.classList.remove("hidden");
    }
    setPrivateTypingIndicator("");
    renderPrivateMessages(data.messages || [], data.hasMore);
    setMainView("private");
}

function renderPrivateMessages(messages, hasMore = false, prepend = false) {
    if (!privateMessageList) return;

    if (!prepend) {
        privateMessageList.innerHTML = "";
    }

    if (!messages.length && !prepend) {
        privateMessageList.appendChild(createEmptyListMarkup("No messages yet. Start the conversation."));
        privateMessagesHasMore = false;
        oldestPrivateMessageId = null;
        if (loadOlderPrivateMessagesBtn) {
            loadOlderPrivateMessagesBtn.classList.add("hidden");
        }
        return;
    }

    const previousHeight = privateMessageList.scrollHeight;
    const orderedMessages = prepend ? [...messages].reverse() : messages;
    orderedMessages.forEach((message) => {
        const isOwnMessage = (message.user_id ?? message.userId) === currentUser?.id;
        const item = createMessageItem(message, isOwnMessage);
        if (prepend) {
            privateMessageList.prepend(item);
        } else {
            privateMessageList.appendChild(item);
        }
    });

    privateMessagesHasMore = !!hasMore;
    oldestPrivateMessageId = messages.length ? messages[0].id : oldestPrivateMessageId;
    if (loadOlderPrivateMessagesBtn) {
        loadOlderPrivateMessagesBtn.classList.toggle("hidden", !privateMessagesHasMore);
    }

    if (prepend) {
        privateMessageList.scrollTop = privateMessageList.scrollHeight - previousHeight;
    } else {
        privateMessageList.scrollTop = privateMessageList.scrollHeight;
    }
}

async function fetchCourses() {
    if (!authToken) return;

    const response = await safeFetch(COURSE_API);
    if (!response.ok) return;

    joinedCourses = await response.json();

    if (selectedCourseId) {
        selectedCourse = joinedCourses.find((course) => course.id === selectedCourseId) || null;
        if (!selectedCourse) {
            clearCourseWorkspace();
            if (activeView === "course") {
                showHomeView();
            }
        }
    }

    renderCourses(joinedCourses);
    updateUserChrome();
}

async function fetchDiscoverCourses() {
    if (!authToken) return;

    const response = await safeFetch(`${COURSE_API}/discover`);
    if (!response.ok) return;

    discoverCourses = await response.json();
    renderDiscoverCourses(discoverCourses);
}

async function fetchFriendOverview() {
    if (!authToken) return;

    const response = await safeFetch(`${FRIENDS_API}/overview`);
    if (!response.ok) return;

    const data = await response.json();
    friends = data.friends || [];
    incomingRequests = data.incomingRequests || [];
    outgoingRequests = data.outgoingRequests || [];
    friendRecommendations = data.recommendations || [];

    renderFriends();
    renderIncomingRequests();
    renderOutgoingRequests();
    renderRecommendations();
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
        li.className = `course-item${selectedCourseId === course.id && activeView === "course" ? " selected" : ""}`;

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
        meta.textContent = `${getCourseRole(course)} role`;

        const badge = document.createElement("span");
        badge.className = "course-badge";
        badge.textContent = getCourseRole(course);

        main.appendChild(name);
        main.appendChild(meta);
        openBtn.appendChild(main);
        openBtn.appendChild(badge);

        const actionBtn = document.createElement("button");
        actionBtn.type = "button";
        actionBtn.className = "course-action-btn";

        const isAdminCourse = getCourseRole(course) === "admin";
        actionBtn.textContent = isAdminCourse ? "Delete" : "Leave";
        actionBtn.addEventListener("click", async (event) => {
            event.stopPropagation();

            const response = await safeFetch(`${COURSE_API}/${course.id}`, {
                method: "DELETE",
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                showAuthMessage(data.error || `Failed to ${isAdminCourse ? "delete" : "leave"} course`, "error");
                return;
            }

            if (selectedCourseId === course.id) {
                clearCourseWorkspace();
                showHomeView();
            }

            showAuthMessage(isAdminCourse ? "Course deleted." : "You left the course.", "success");
            await Promise.all([fetchCourses(), fetchDiscoverCourses(), fetchFriendOverview()]);
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
        meta.textContent = "Join this course to unlock chat, materials, assignments, and live activity.";

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
            await Promise.all([fetchCourses(), fetchDiscoverCourses(), fetchFriendOverview()]);
        });

        main.appendChild(name);
        main.appendChild(meta);
        shell.appendChild(main);
        shell.appendChild(joinBtn);
        li.appendChild(shell);
        discoverList.appendChild(li);
    });
}

function createFriendItem(friend, actionsBuilder) {
    const li = document.createElement("li");
    li.className = "friend-item";

    const main = document.createElement("div");
    main.className = "friend-main";

    const name = document.createElement("div");
    name.className = "friend-name";
    name.textContent = friend.username;

    const meta = document.createElement("div");
    meta.className = "friend-meta";

    const metaParts = [`ID ${friend.user_code}`];
    const sharedCourseCount = Number(friend.mutual_courses ?? friend.common_courses ?? 0);
    if (sharedCourseCount) {
        metaParts.push(`${sharedCourseCount} shared course${sharedCourseCount === 1 ? "" : "s"}`);
    }
    if (friend.common_course_names) {
        metaParts.push(friend.common_course_names);
    }
    meta.textContent = metaParts.join(" · ");

    main.appendChild(name);
    main.appendChild(meta);
    li.appendChild(main);

    const actions = document.createElement("div");
    actions.className = "friend-actions";
    actionsBuilder(actions);
    li.appendChild(actions);

    return li;
}

function renderFriends() {
    setCount(friendCount, friends.length, "friends");
    friendList.innerHTML = "";

    if (!friends.length) {
        friendList.appendChild(createEmptyListMarkup("No friends yet. Use the toolbar search to find people."));
        return;
    }

    friends.forEach((friend) => {
        friendList.appendChild(createFriendItem(friend, (actions) => {
            const chatBtn = document.createElement("button");
            chatBtn.type = "button";
            chatBtn.className = "mini-btn";
            chatBtn.textContent = activeView === "private" && selectedFriend?.id === friend.id ? "Open" : "Chat";
            chatBtn.addEventListener("click", () => openPrivateChat(friend));
            actions.appendChild(chatBtn);
        }));
    });
}

function renderIncomingRequests() {
    setCount(incomingRequestCount, incomingRequests.length, "pending");
    incomingRequestList.innerHTML = "";

    if (!incomingRequests.length) {
        incomingRequestList.appendChild(createEmptyListMarkup("No incoming friend requests right now."));
        return;
    }

    incomingRequests.forEach((request) => {
        incomingRequestList.appendChild(createFriendItem(request, (actions) => {
            const acceptBtn = document.createElement("button");
            acceptBtn.type = "button";
            acceptBtn.className = "mini-btn";
            acceptBtn.textContent = "Accept";
            acceptBtn.addEventListener("click", () => respondToFriendRequest(request.id, "accept"));

            const rejectBtn = document.createElement("button");
            rejectBtn.type = "button";
            rejectBtn.className = "mini-btn";
            rejectBtn.textContent = "Reject";
            rejectBtn.addEventListener("click", () => respondToFriendRequest(request.id, "reject"));

            actions.appendChild(acceptBtn);
            actions.appendChild(rejectBtn);
        }));
    });
}

function renderOutgoingRequests() {
    setCount(outgoingRequestCount, outgoingRequests.length, "pending");
    outgoingRequestList.innerHTML = "";

    if (!outgoingRequests.length) {
        outgoingRequestList.appendChild(createEmptyListMarkup("No outgoing requests pending."));
        return;
    }

    outgoingRequests.forEach((request) => {
        outgoingRequestList.appendChild(createFriendItem(request, (actions) => {
            const badge = document.createElement("span");
            badge.className = "course-badge";
            badge.textContent = "Pending";
            actions.appendChild(badge);
        }));
    });
}

function renderRecommendations() {
    recommendationList.innerHTML = "";

    if (!friendRecommendations.length) {
        recommendationList.appendChild(createEmptyListMarkup("No recommendations yet. Join more shared courses to discover people."));
        return;
    }

    friendRecommendations.forEach((person) => {
        recommendationList.appendChild(createFriendItem(person, (actions) => {
            const addBtn = document.createElement("button");
            addBtn.type = "button";
            addBtn.className = "mini-btn";
            addBtn.textContent = "Add";
            addBtn.addEventListener("click", () => sendFriendRequest(person.user_code));
            actions.appendChild(addBtn);
        }));
    });
}

async function sendFriendRequest(userCode) {
    const normalizedCode = String(userCode || "").trim();

    if (!normalizedCode) {
        showAuthMessage("Enter a friend's unique ID.", "error");
        return;
    }

    const response = await safeFetch(`${FRIENDS_API}/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userCode: normalizedCode }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        showAuthMessage(data.error || "Unable to send friend request", "error");
        return;
    }

    showAuthMessage(data.message || "Friend request sent", "success");
    await fetchFriendOverview();
    if (globalSearchInput?.value.trim()) {
        await performSearch(globalSearchInput.value.trim());
        refreshSearchWorkspaceIfOpen();
    }
}

async function respondToFriendRequest(requestId, action) {
    const response = await safeFetch(`${FRIENDS_API}/requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        showAuthMessage(data.error || "Unable to update friend request", "error");
        return;
    }

    showAuthMessage(data.message || "Friend request updated", "success");
    await fetchFriendOverview();
    if (globalSearchInput?.value.trim()) {
        await performSearch(globalSearchInput.value.trim());
        refreshSearchWorkspaceIfOpen();
    }
}

async function fetchCourseMembers(courseId) {
    if (!courseId) return;

    const response = await safeFetch(`${COURSE_API}/${courseId}/members`);
    if (!response.ok) return;

    selectedCourseMembers = await response.json();
    renderCourseMembers(selectedCourseMembers);
}

function renderCourseMembers(members) {
    if (!courseMembersList) return;

    courseMembersList.innerHTML = "";

    if (!canManageRoles()) {
        showCourseAdminControls(false);
        return;
    }

    showCourseAdminControls(true);

    members.forEach((member) => {
        const item = document.createElement("div");
        item.className = "course-member-item";

        const main = document.createElement("div");
        main.className = "course-member-main";

        const name = document.createElement("div");
        name.className = "course-member-name";
        name.textContent = member.username;

        const meta = document.createElement("div");
        meta.className = "course-member-meta";
        meta.textContent = `${member.email} · ${normalizeRole(member.role || "student")}`;

        main.appendChild(name);
        main.appendChild(meta);
        item.appendChild(main);

        if (normalizeRole(member.role) === "admin") {
            const badge = document.createElement("span");
            badge.className = "course-badge";
            badge.textContent = "admin";
            item.appendChild(badge);
        } else {
            const actions = document.createElement("div");
            actions.className = "role-actions";

            const teacherBtn = document.createElement("button");
            teacherBtn.type = "button";
            teacherBtn.className = "role-btn";
            teacherBtn.textContent = "Make Teacher";
            teacherBtn.disabled = normalizeRole(member.role) === "teacher";
            teacherBtn.addEventListener("click", () => updateCourseMemberRole(member.id, "teacher"));

            const studentBtn = document.createElement("button");
            studentBtn.type = "button";
            studentBtn.className = "role-btn";
            studentBtn.textContent = "Make Student";
            studentBtn.disabled = normalizeRole(member.role) === "student";
            studentBtn.addEventListener("click", () => updateCourseMemberRole(member.id, "student"));

            actions.appendChild(teacherBtn);
            actions.appendChild(studentBtn);
            item.appendChild(actions);
        }

        courseMembersList.appendChild(item);
    });
}

async function updateCourseMemberRole(userId, role) {
    if (!selectedCourseId) return;

    const response = await safeFetch(`${COURSE_API}/${selectedCourseId}/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        showAuthMessage(data.error || "Unable to update course role", "error");
        return;
    }

    showAuthMessage(`Updated member role to ${role}.`, "success");
    await Promise.all([fetchCourseMembers(selectedCourseId), fetchCourses()]);
}

async function fetchMessages(courseId, beforeId = null) {
    const query = beforeId ? `?beforeId=${beforeId}&limit=40` : "?limit=40";
    const response = await safeFetch(`${MESSAGE_API}/${courseId}${query}`);
    if (!response.ok) return;

    const data = await response.json();
    const messages = data.messages || [];

    if (!beforeId) {
        messageList.innerHTML = "";
    }

    if (!messages.length && !beforeId) {
        messageList.appendChild(createEmptyListMarkup("No messages yet. Start the conversation."));
        courseMessagesHasMore = false;
        oldestCourseMessageId = null;
        if (loadOlderCourseMessagesBtn) {
            loadOlderCourseMessagesBtn.classList.add("hidden");
        }
        return;
    }

    const previousHeight = messageList.scrollHeight;
    const orderedMessages = beforeId ? [...messages].reverse() : messages;
    orderedMessages.forEach((message) => {
        const isOwnMessage = (message.user_id ?? message.userId) === currentUser?.id;
        const item = createMessageItem(message, isOwnMessage);
        if (beforeId) {
            messageList.prepend(item);
        } else {
            messageList.appendChild(item);
        }
    });

    courseMessagesHasMore = !!data.hasMore;
    oldestCourseMessageId = messages.length ? messages[0].id : oldestCourseMessageId;
    if (loadOlderCourseMessagesBtn) {
        loadOlderCourseMessagesBtn.classList.toggle("hidden", !courseMessagesHasMore);
    }

    if (beforeId) {
        messageList.scrollTop = messageList.scrollHeight - previousHeight;
    } else {
        messageList.scrollTop = messageList.scrollHeight;
    }
}

async function sendCourseMessage() {
    if (!authToken) {
        showAuthMessage("Please log in first.", "error");
        return;
    }

    if (!selectedCourseId) {
        showAuthMessage("Select a course first.", "error");
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
}

async function sendPrivateMessage() {
    if (!selectedFriend) {
        showAuthMessage("Open a friend chat first.", "error");
        return;
    }

    const content = privateMessageInput.value.trim();
    if (!content) return;

    const response = await safeFetch(`${FRIENDS_API}/conversations/${selectedFriend.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        showAuthMessage(data.error || "Unable to send private message", "error");
        return;
    }

    if (privateMessageList.querySelector(".empty-list")) {
        privateMessageList.innerHTML = "";
    }

    privateMessageList.appendChild(createMessageItem(data.message, true));
    privateMessageList.scrollTop = privateMessageList.scrollHeight;
    privateMessageInput.value = "";
    privateMessageInput.focus();
}

async function fetchNotes(courseId) {
    const response = await safeFetch(`/notes/${courseId}/notes`);
    if (!response.ok) return;

    renderNotes(await response.json());
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
        link.href = uploadUrl(note.file_path);
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

    renderAssignments(await response.json());
}

function renderAssignments(assignments) {
    assignmentList.innerHTML = "";
    showTeacherControls();
    showCourseAdminControls();

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
                ${canSubmitAssignments() ? `<button class="submit-assignment-btn" data-assignment-id="${assignment.id}">Submit Assignment</button>` : ""}
                ${canCreateAssignments() ? `<button class="view-submissions-btn" data-assignment-id="${assignment.id}">View Submissions</button>` : ""}
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
            document.getElementById(`submission-form-${event.target.dataset.assignmentId}`).classList.toggle("hidden");
        });
    });

    document.querySelectorAll(".submit-btn").forEach((btn) => {
        btn.addEventListener("click", (event) => submitAssignment(event.target.dataset.assignmentId));
    });

    document.querySelectorAll(".cancel-btn").forEach((btn) => {
        btn.addEventListener("click", (event) => {
            document.getElementById(`submission-form-${event.target.dataset.assignmentId}`).classList.add("hidden");
        });
    });

    document.querySelectorAll(".view-submissions-btn").forEach((btn) => {
        btn.addEventListener("click", (event) => viewSubmissions(event.target.dataset.assignmentId));
    });
}

async function viewSubmissions(assignmentId) {
    const response = await safeFetch(`/assignments/${assignmentId}/submissions`);
    if (!response.ok) {
        showAuthMessage("Failed to load submissions", "error");
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
                ${submission.file_path ? `<p><strong>File:</strong> <a class="note-link" href="${uploadUrl(submission.file_path)}" target="_blank">${escapeHtml(submission.file_path)}</a></p>` : ""}
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
        showAuthMessage(`Submission failed: ${error.error || "Unknown error"}`, "error");
        return;
    }

    showAuthMessage("Assignment submitted successfully!", "success");
    document.getElementById(`submission-form-${assignmentId}`).classList.add("hidden");
    document.getElementById(`submission-text-${assignmentId}`).value = "";
    fileInput.value = "";
}

async function performSearch(query) {
    if (!searchResults) return;

    const trimmedQuery = String(query || "").trim();
    currentSearchQuery = trimmedQuery;

    if (!trimmedQuery) {
        searchResults.innerHTML = "";
        searchResults.classList.add("hidden");
        currentSearchResults = [];
        return;
    }

    const normalized = trimmedQuery.toLowerCase();
    const results = [];
    const friendIds = new Set(friends.map((friend) => Number(friend.id)));

    if (["all", "courses"].includes(searchFilter)) {
        joinedCourses
            .filter((course) => course.name.toLowerCase().includes(normalized))
            .slice(0, 5)
            .forEach((course) => {
                results.push({
                    type: "course",
                    title: course.name,
                    meta: `Joined course · ${getCourseRole(course)}`,
                    actionLabel: "Open",
                    action: () => openCourse(course),
                });
            });

        discoverCourses
            .filter((course) => course.name.toLowerCase().includes(normalized))
            .slice(0, 5)
            .forEach((course) => {
                results.push({
                    type: "course",
                    title: course.name,
                    meta: "Available course",
                    actionLabel: "Join",
                    action: async () => {
                        const response = await safeFetch(`${COURSE_API}/${course.id}/join`, { method: "POST" });
                        if (response.ok) {
                            showAuthMessage(`Joined ${course.name}`, "success");
                            await Promise.all([fetchCourses(), fetchDiscoverCourses(), fetchFriendOverview()]);
                        }
                    },
                });
            });
    }

    if (["all", "friends"].includes(searchFilter)) {
        friends
            .filter((friend) => matchesUserSearch(friend, normalized))
            .slice(0, 8)
            .forEach((friend) => {
                results.push({
                    type: "friend",
                    title: friend.username,
                    meta: `Friend · ${friend.user_code}`,
                    actionLabel: "View",
                    action: () => openPersonProfile(friend.id),
                });
            });
    }

    if (["all", "people"].includes(searchFilter)) {
        const peopleResults = new Map();
        const addPersonResult = (person) => {
            const personId = Number(person?.id);
            if (!personId || peopleResults.has(personId)) {
                return;
            }

            peopleResults.set(personId, buildPersonResult(person));
        };

        if (searchFilter === "people") {
            friends
                .filter((friend) => matchesUserSearch(friend, normalized))
                .forEach((friend) => {
                    addPersonResult({
                        ...friend,
                        relationship: "friend",
                        common_courses: friend.mutual_courses ?? 0,
                    });
                });
        }

        const searchToken = ++lastPeopleSearchToken;
        const response = await safeFetch(`${FRIENDS_API}/people-search?q=${encodeURIComponent(trimmedQuery)}`);
        if (searchToken !== lastPeopleSearchToken) {
            return;
        }

        const people = response.ok ? await response.json() : [];
        people.forEach((person) => {
            if (searchFilter === "all" && friendIds.has(Number(person.id))) {
                return;
            }

            addPersonResult(person);
        });

        peopleResults.forEach((result) => results.push(result));
    }

    currentSearchResults = results;
    renderSearchResults(getSearchPreviewResults(results));
}

function executeSearch() {
    const query = globalSearchInput?.value.trim() || "";
    if (!query) {
        searchResults.classList.add("hidden");
        setSearchExpanded(false, { focusInput: false });
        return;
    }

    performSearch(query).then(() => {
        searchResults.classList.add("hidden");
        renderSearchWorkspace(query, currentSearchResults);
        setMainView("search", { skipHistory: activeView === "search" });
        setSearchExpanded(false, { focusInput: false });
    });
}

function renderSearchResults(results) {
    if (!searchResults) return;

    searchResults.innerHTML = "";
    searchResults.classList.toggle("hidden", results.length === 0);

    if (!results.length) {
        return;
    }

    results.forEach((result) => {
        const item = document.createElement("div");
        item.className = "search-result-item";

        const main = document.createElement("div");
        main.className = "search-result-main";

        const title = document.createElement("div");
        title.className = "search-result-title";
        title.textContent = result.title;

        const meta = document.createElement("div");
        meta.className = "search-result-meta";
        meta.textContent = result.meta;

        const actionBtn = document.createElement("button");
        actionBtn.type = "button";
        actionBtn.className = "mini-btn";
        actionBtn.textContent = result.actionLabel;
        actionBtn.disabled = !!result.disabled;
        actionBtn.addEventListener("click", async () => {
            await result.action();
            if (!result.disabled) {
                searchResults.classList.add("hidden");
            }
        });

        main.appendChild(title);
        main.appendChild(meta);
        item.appendChild(main);
        item.appendChild(actionBtn);
        main.addEventListener("click", async () => {
            await result.action();
            if (!result.disabled) {
                searchResults.classList.add("hidden");
            }
        });
        searchResults.appendChild(item);
    });
}

socket.on("authenticated", ({ user }) => {
    currentUser = user;
    updateUserChrome();
});

socket.on("unauthorized", () => {
    handleUnauthorized();
});

socket.on("coursePresence", (users) => {
    if (activeView === "course") {
        renderOnlineUsers(users);
    }
});

socket.on("typing", ({ user }) => {
    if (!user || user.id === currentUser?.id || activeView !== "course") return;

    setTypingIndicator(`${user.username} is typing...`);
    clearTimeout(window.__typingTimeout);
    window.__typingTimeout = setTimeout(() => setTypingIndicator(""), 1200);
});

socket.on("privateTyping", ({ conversationId, user }) => {
    if (!user || user.id === currentUser?.id) return;
    if (Number(conversationId) !== Number(activePrivateConversationId) || activeView !== "private") return;

    setPrivateTypingIndicator(`${user.username} is typing...`);
    clearTimeout(window.__privateTypingTimeout);
    window.__privateTypingTimeout = setTimeout(() => setPrivateTypingIndicator(""), 1200);
});

socket.on("newMessage", (message) => {
    if (Number(message.courseId) !== Number(selectedCourseId) || activeView !== "course") return;
    if (message.userId === currentUser?.id) return;

    if (messageList.querySelector(".empty-list")) {
        messageList.innerHTML = "";
    }

    messageList.appendChild(createMessageItem(message, false));
    messageList.scrollTop = messageList.scrollHeight;
});

socket.on("newPrivateMessage", (message) => {
    if (Number(message.conversation_id) !== Number(activePrivateConversationId) || activeView !== "private") return;
    if ((message.user_id ?? message.userId) === currentUser?.id) return;

    if (privateMessageList.querySelector(".empty-list")) {
        privateMessageList.innerHTML = "";
    }

    privateMessageList.appendChild(createMessageItem(message, false));
    privateMessageList.scrollTop = privateMessageList.scrollHeight;
});

tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
        const tabName = btn.dataset.tab;
        tabBtns.forEach((item) => item.classList.remove("active"));
        tabPanes.forEach((pane) => pane.classList.remove("active"));

        btn.classList.add("active");
        document.getElementById(`${tabName}-tab`).classList.add("active");

        if (tabName === "assignments") {
            showTeacherControls();
            showCourseAdminControls();
        }
    });
});

searchFilterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
        searchFilter = btn.dataset.filter;
        searchFilterBtns.forEach((item) => item.classList.toggle("active", item === btn));
        performSearch(globalSearchInput.value.trim()).then(() => {
            refreshSearchWorkspaceIfOpen();
        });
    });
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
            const response = await fetch(appUrl("/auth/login"), {
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

        if (!username || !email || !password) {
            showAuthMessage("Username, email, and password are required.", "error");
            return;
        }

        try {
            const response = await fetch(appUrl("/auth/register"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, email, password }),
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
    logoutBtn.onclick = () => handleUnauthorized();
}

if (toolbarHomeBtn) {
    toolbarHomeBtn.addEventListener("click", () => showHomeView());
}

if (backBtn) {
    backBtn.addEventListener("click", () => goBack());
}

if (profileBtn) {
    profileBtn.addEventListener("click", () => openProfileView());
}

if (viewFriendProfileBtn) {
    viewFriendProfileBtn.addEventListener("click", () => {
        if (selectedFriend?.id) {
            openPersonProfile(selectedFriend.id);
        }
    });
}

if (loadOlderCourseMessagesBtn) {
    loadOlderCourseMessagesBtn.addEventListener("click", () => {
        if (selectedCourseId && oldestCourseMessageId) {
            fetchMessages(selectedCourseId, oldestCourseMessageId);
        }
    });
}

if (loadOlderPrivateMessagesBtn) {
    loadOlderPrivateMessagesBtn.addEventListener("click", async () => {
        if (!selectedFriend || !oldestPrivateMessageId) return;
        const response = await safeFetch(`${FRIENDS_API}/conversations/${selectedFriend.id}/messages?beforeId=${oldestPrivateMessageId}&limit=40`);
        if (!response.ok) return;
        const data = await response.json();
        renderPrivateMessages(data.messages || [], data.hasMore, true);
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
        await Promise.all([fetchCourses(), fetchDiscoverCourses(), fetchFriendOverview()]);
    };
}

if (sendMessageBtn) {
    sendMessageBtn.onclick = () => sendCourseMessage();
}

if (sendPrivateMessageBtn) {
    sendPrivateMessageBtn.onclick = () => sendPrivateMessage();
}

if (messageInput) {
    messageInput.addEventListener("input", () => {
        if (joinedCourseRoomId) {
            socket.emit("typing", joinedCourseRoomId);
        }
    });

    messageInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            sendCourseMessage();
        }
    });
}

if (privateMessageInput) {
    privateMessageInput.addEventListener("input", () => {
        if (joinedPrivateRoomId) {
            socket.emit("privateTyping", { conversationId: joinedPrivateRoomId });
        }
    });

    privateMessageInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            sendPrivateMessage();
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

if (globalSearchInput) {
    globalSearchInput.addEventListener("input", (event) => performSearch(event.target.value));
    globalSearchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            executeSearch();
            return;
        }

        if (event.key === "Escape") {
            searchResults.classList.add("hidden");
            setSearchExpanded(false, { focusInput: false });
        }
    });
}

if (searchToggleBtn) {
    searchToggleBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        setSearchExpanded(!isSearchExpanded());
    });
}

if (executeSearchBtn) {
    executeSearchBtn.addEventListener("click", () => executeSearch());
}

if (closeUserSummaryBtn) {
    closeUserSummaryBtn.addEventListener("click", () => closeUserSummary());
}

if (closeDeleteFriendModalBtn) {
    closeDeleteFriendModalBtn.addEventListener("click", () => closeDeleteFriendModal());
}

if (cancelDeleteFriendBtn) {
    cancelDeleteFriendBtn.addEventListener("click", () => closeDeleteFriendModal());
}

if (confirmDeleteFriendBtn) {
    confirmDeleteFriendBtn.addEventListener("click", async () => {
        if (!pendingDeleteFriend) return;

        if (deleteFriendConfirmationStep === 0) {
            deleteFriendConfirmationStep = 1;
            renderDeleteFriendModalStep();
            return;
        }

        const friendId = pendingDeleteFriend.id;
        closeDeleteFriendModal();
        await deleteFriend(friendId);
    });
}

document.addEventListener("click", (event) => {
    if (!searchResults || !globalSearchInput) return;
    if (toolbarSearch?.contains(event.target)) return;
    if (searchResults.contains(event.target) || globalSearchInput.contains(event.target)) return;
    searchResults.classList.add("hidden");
    setSearchExpanded(false, { focusInput: false });
});

if (userSummaryModal) {
    userSummaryModal.addEventListener("click", (event) => {
        if (event.target === userSummaryModal) {
            closeUserSummary();
        }
    });
}

if (deleteFriendModal) {
    deleteFriendModal.addEventListener("click", (event) => {
        if (event.target === deleteFriendModal) {
            closeDeleteFriendModal();
        }
    });
}

if (uploadNoteBtn) {
    uploadNoteBtn.onclick = async () => {
        if (!selectedCourseId) {
            showAuthMessage("Select a course first.", "error");
            return;
        }

        if (!noteFile.files || noteFile.files.length === 0) {
            showAuthMessage("Please select a file to upload.", "error");
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

if (createAssignmentBtn) {
    createAssignmentBtn.onclick = async () => {
        if (!selectedCourseId) {
            showAuthMessage("Select a course first.", "error");
            return;
        }

        if (!canCreateAssignments()) {
            showAuthMessage("Only course teachers or admins can create assignments.", "error");
            return;
        }

        const title = assignmentTitleInput.value.trim();
        const description = assignmentDescriptionInput.value;
        const dueDate = assignmentDueDateInput.value;

        if (!title) {
            showAuthMessage("Assignment title is required.", "error");
            return;
        }

        const response = await safeFetch(`/assignments/${selectedCourseId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, description, dueDate }),
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            showAuthMessage(`Failed to create assignment: ${error.error || "Unknown error"}`, "error");
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
    setupThemeToggle();
    updateUserChrome();
    setMainView("home");
    clearCourseWorkspace();
    clearPrivateWorkspace();
    setAuthState(!!authToken);
});
