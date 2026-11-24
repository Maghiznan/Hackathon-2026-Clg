
// =====================================
// 1. SIDEBAR NAVIGATION
// =====================================

const navLinks = document.querySelectorAll(".nav-link");
const pageTitle = document.querySelector(".topbar h2");

navLinks.forEach(link => {

    link.addEventListener("click", function(event) {

        event.preventDefault();

        // Remove active class from all links
        navLinks.forEach(nav => nav.classList.remove("active"));

        // Activate clicked link
        this.classList.add("active");

        // Update page title
        pageTitle.textContent = this.textContent;

    });

});


// =====================================
// 2. LIVE CLOCK
// =====================================

function updateClock() {

    const now = new Date();

    const time = now.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
    });

    const date = now.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });

    document.querySelector(".system-status").innerHTML = `
        <span class="status-dot"></span>
        System Online
        <span class="clock">${date} | ${time}</span>
    `;

}

updateClock();
setInterval(updateClock, 1000);


// =====================================
// 3. CAMERA STATUS
// =====================================

const cameraScreens = document.querySelectorAll(".camera-screen");

cameraScreens.forEach((camera, index) => {

    camera.innerHTML = `
        <div class="camera-placeholder">
            <span>CAM 0${index + 1}</span>
            <p>Waiting for video feed...</p>
        </div>
    `;

});


// =====================================
// 4. STATISTICS ANIMATION
// =====================================

const statNumbers = document.querySelectorAll(".stat-card p");

statNumbers.forEach(number => {

    const target = Number(number.textContent);
    let current = 0;

    const duration = 800;
    const steps = 30;
    const increment = target / steps;

    const timer = setInterval(() => {

        current += increment;

        if (current >= target) {
            current = target;
            clearInterval(timer);
        }

        number.textContent = Math.round(current)
            .toString()
            .padStart(2, "0");

    }, duration / steps);

});


// =====================================
// 5. CONSOLE MESSAGE
// =====================================

console.log("BorderWatch AI Frontend Initialized");
console.log("Waiting for backend connection...");

