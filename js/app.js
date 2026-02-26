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

        // Access the actual property from DB row
        li.textContent = course.name;

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