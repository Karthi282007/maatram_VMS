// login-script.js

// --- Import Functions from Firebase ---
import { 
    auth, 
    db, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    doc, 
    setDoc 
} from './firebase.js';

import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { getDoc } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// --- Get all the HTML Elements ---

// Auth wrappers
const authWrapper = document.getElementById('auth-wrapper');
const signupContainer = document.getElementById('signup-container');
const loginContainer = document.getElementById('login-container');

// Auth links
const showLoginLink = document.getElementById('show-login-link');
const showSignupLink = document.getElementById('show-signup-link');

// Auth forms
const signupForm = document.getElementById('signup-form');
const loginForm = document.getElementById('login-form');

// Auth error messages
const signupError = document.getElementById('signup-error');
const loginError = document.getElementById('login-error');

// --- 1. Event Listeners for Toggling Forms ---

showLoginLink.addEventListener('click', (e) => {
    e.preventDefault(); 
    loginContainer.style.display = 'flex'; // Centering fix
    signupContainer.style.display = 'none';
});

showSignupLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginContainer.style.display = 'none';
    signupContainer.style.display = 'flex'; // Centering fix
});

// --- 2. Handle Signup ---
signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;
  const role = document.getElementById('signup-role').value;
  const registerNo = document.getElementById('signup-regno').value.trim();

  signupError.style.display = 'none';

  if (!registerNo) {
    signupError.textContent = "Please enter your Register Number.";
    signupError.style.display = 'block';
    return;
  }

  try {
    // 1) Create the Auth user
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 2) Build and write the Firestore user doc — IMPORTANT: await this
    const userDoc = {
      uid: user.uid,
      name: name || "",
      email: email || "",
      role: role || "student",
      registerNo: registerNo || "",
      joinedDate: new Date()
    };

    await setDoc(doc(db, "users", user.uid), userDoc); // <-- IMPORTANT await

    // 3) Redirect based on role (onAuthStateChanged will also run but doc already exists)
    if (userDoc.role === 'student') {
      window.location.href = 'student.html';
    } else if (userDoc.role === 'organizer') {
      window.location.href = 'organizer.html';
    } else {
      window.location.href = 'student.html';
    }

  } catch (err) {
    console.error("Signup error:", err);
    signupError.textContent = err.message || 'Signup failed';
    signupError.style.display = 'block';
  }
});

// --- 3. Handle Login ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    loginError.style.display = 'none';

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // That's it! 'onAuthStateChanged' (below) will handle the redirect.
        
    } catch (err) {
        loginError.textContent = err.message;
        loginError.style.display = 'block';
    }
});


// === 4. ROUTING & VALIDATION LOGIC ===
// This "brain" checks who is logged in and redirects them
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (userDocSnap.exists()) {
        const userData = userDocSnap.data();
        // Redirect based on role
        if (userData.role === 'student') {
          window.location.href = 'student.html';
        } else if (userData.role === 'organizer') {
          window.location.href = 'organizer.html';
        } else if (userData.role === 'anchor') {
          alert("Anchor dashboard coming soon!");
          await signOut(auth);
        } else if (userData.role === 'superadmin') {
          alert("Admin dashboard coming soon!");
          await signOut(auth);
        } else {
          window.location.href = 'student.html';
        }
      } else {
        // User doc missing — attempt to create a minimal doc instead of forcing logout
        console.warn("User document missing for uid:", user.uid, " -> creating default doc.");
        try {
          const defaultDoc = {
            uid: user.uid,
            name: user.displayName || "",
            email: user.email || "",
            role: "student",
            joinedDate: new Date()
          };
          await setDoc(doc(db, "users", user.uid), defaultDoc);
          // Redirect to student (or you may send them to a profile-complete page)
          window.location.href = 'student.html';
        } catch (createErr) {
          console.error("Failed to auto-create user doc:", createErr);
          // Show user-friendly message and sign out to avoid broken state
          loginError.textContent = "Your profile couldn't be created automatically. Contact support.";
          loginError.style.display = 'block';
          try { await signOut(auth); } catch(e){ console.warn('signOut failed', e); }
        }
      }
    } catch (err) {
      console.error("Error while checking/creating user doc:", err);
      loginError.textContent = "Authentication error. Try again.";
      loginError.style.display = 'block';
      try { await signOut(auth); } catch(e){ console.warn('signOut failed', e); }
    }
  } else {
    // Not logged in — show login/signup UI
    if (signupContainer) signupContainer.style.display = 'flex';
    if (loginContainer) loginContainer.style.display = 'none';
  }
});
