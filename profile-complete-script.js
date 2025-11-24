// profile-complete-script.js
import { auth, db } from './firebase.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";
import { doc, setDoc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

const nameEl = document.getElementById('pc-name');
const roleEl = document.getElementById('pc-role');
const phoneEl = document.getElementById('pc-phone');
const regnoEl = document.getElementById('pc-regno');
const achEl = document.getElementById('pc-ach');
const contribEl = document.getElementById('pc-contrib');

const saveBtn = document.getElementById('pc-save');
const skipBtn = document.getElementById('pc-skip');
const msg = document.getElementById('pc-msg');

function showMsg(t, s=3000){
  msg.textContent = t;
  setTimeout(()=> msg.textContent = '', s);
}

let currentUid = null;
let currentUserData = null;

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // Not signed in -> redirect to login
    window.location.href = 'index.html';
    return;
  }
  currentUid = user.uid;
  // prefill from existing user doc if present
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) {
      currentUserData = snap.data();
      nameEl.value = currentUserData.name || '';
      roleEl.value = currentUserData.role || 'student';
      phoneEl.value = currentUserData.phone || currentUserData.phoneNumber || '';
      regnoEl.value = currentUserData.registerNo || '';
      achEl.value = (currentUserData.achievements || []).join(', ');
      contribEl.value = (currentUserData.contributionDetails || []).join('\n');
    } else {
      // no doc: prefill email/name from auth if available
      nameEl.value = user.displayName || '';
      roleEl.value = 'student';
    }
  } catch (err) {
    console.error('prefill failed', err);
  }
});

saveBtn.addEventListener('click', async () => {
  const name = nameEl.value.trim();
  const role = roleEl.value;
  const phone = phoneEl.value.trim();
  const regno = regnoEl.value.trim();
  const achievements = achEl.value.split(',').map(s=>s.trim()).filter(Boolean);
  const contributionLines = contribEl.value.split('\n').map(s=>s.trim()).filter(Boolean);

  if (!name) { showMsg('Please enter your full name'); return; }

  const payload = {
    uid: currentUid,
    name,
    role,
    phone,
    registerNo: regno,
    achievements,
    contributions: contributionLines.length,
    contributionDetails: contributionLines,
    joinedDate: (currentUserData && currentUserData.joinedDate) ? currentUserData.joinedDate : new Date()
  };

  try {
    // If doc exists, update it; otherwise create
    const uRef = doc(db, 'users', currentUid);
    const existing = await getDoc(uRef);
    if (existing.exists()) {
      await updateDoc(uRef, payload);
    } else {
      await setDoc(uRef, payload);
    }

    showMsg('Profile saved — redirecting...', 1200);
    setTimeout(()=> {
      // redirect based on role
      if (role === 'organizer') window.location.href = 'organizer.html';
      else window.location.href = 'student.html';
    }, 900);

  } catch (err) {
    console.error('save profile failed', err);
    showMsg('Save failed. Check console for details.');
  }
});

skipBtn.addEventListener('click', async () => {
  // create at least a minimal doc if missing
  try {
    if (!currentUid) return;
    const ref = doc(db, 'users', currentUid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { uid: currentUid, role: 'student', joinedDate: new Date() });
    }
    window.location.href = 'student.html';
  } catch (err) {
    console.error('skip failed', err);
    showMsg('Could not skip: ' + (err.message || 'error'));
  }
});
