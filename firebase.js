// src/firebase.js

// Import the functions you need from the Firebase "CDN"
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { getFirestore, doc, setDoc } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyBKgan8dELkeAvLgn3J8GnKWj0V2VP3bA8",
  authDomain: "maatram-cloud.firebaseapp.com",
  projectId: "maatram-cloud",
  storageBucket: "maatram-cloud.appspot.com",
  messagingSenderId: "1069741414761",
  appId: "1:1069741414761:web:ba99d538cd7f1be3fd05f8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export the services you'll use
export const auth = getAuth(app);
export const db = getFirestore(app);

// Export the specific functions we need in our scripts
export {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  doc,
  setDoc
};
