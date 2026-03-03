const API_URL = "http://172.29.60.60/api";

async function register() {
    const prenom = document.getElementById("prenom").value.trim();
    const nom = document.getElementById("nom").value.trim();
    const email = document.getElementById("email").value.trim();
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value.trim();

    const errorBox = document.getElementById("errorBox");
    const successBox = document.getElementById("successBox");

    errorBox.style.display = "none";
    successBox.style.display = "none";

    if (!prenom || !nom || !email || !username || !password) {
        errorBox.textContent = "Veuillez remplir tous les champs.";
        errorBox.style.display = "block";
        return;
    }

    try {
        const response = await fetch(`${API_URL}/inscription`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prenom, nom, email, username, password })
        });

        const data = await response.json();

        if (!data.success) {
            errorBox.textContent = data.message;
            errorBox.style.display = "block";
            return;
        }

        successBox.textContent = "Compte créé avec succès !";
        successBox.style.display = "block";

        localStorage.setItem("token", data.token);

        setTimeout(() => {
            window.location.href = "/";
        }, 1);

    } catch (err) {
        errorBox.textContent = "Erreur de connexion au serveur.";
        errorBox.style.display = "block";
    }
}
