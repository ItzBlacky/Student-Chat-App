const courseInput = document.getElementById("courseInput");
const addCourseBtn = document.getElementById("addCourseBtn");
const courseList = document.getElementById("courseList");

// Load saved courses from localStorage
let courses = JSON.parse(localStorage.getItem("courses")) || [];

function saveCourses() {
    localStorage.setItem("courses", JSON.stringify(courses));
}

function renderCourses() {
    courseList.innerHTML = "";

    courses.forEach((course, index) => {
        const li = document.createElement("li");
        li.textContent = course;

        const deleteBtn = document.createElement("button");
        deleteBtn.textContent = "Delete";
        deleteBtn.onclick = () => {
            courses.splice(index, 1);
            saveCourses();
            renderCourses();
        };

        li.appendChild(deleteBtn);
        courseList.appendChild(li);
    });
}

addCourseBtn.onclick = () => {
    const courseName = courseInput.value.trim();
    if (courseName !== "") {
        courses.push(courseName);
        courseInput.value = "";
        saveCourses();
        renderCourses();
    }
};

// Initial render
renderCourses();