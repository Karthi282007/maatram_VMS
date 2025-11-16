// student-script.js
// Full, self-contained student portal script with profile edit + storage upload + toggles

import { auth, db } from './firebase.js';
import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-auth.js";

import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-storage.js";

/* DOM guard - only run on pages that include #frame */
if (!document.getElementById('frame')) {
  console.log('student-script: not on student page — aborting initialization.');
} else {

  /* ---------- DOM elements ---------- */
  const hambtn = document.getElementById('hambtn');
  const profilePanel = document.getElementById('profilePanel');
  const profileSummary = document.getElementById('profileSummary');
  const profileEdit = document.getElementById('profileEdit');
  const profileCircle = document.getElementById('profileCircle');
  const profileCircleImg = document.getElementById('profileCircleImg') || null;
  const profileInitial = document.getElementById('profileInitial');

  const welcomeTitle = document.getElementById('welcomeTitle');
  const profileName = document.getElementById('profileName');
  const profileRole = document.getElementById('profileRole');

  const summaryName = document.getElementById('summaryName');
  const summaryPhone = document.getElementById('summaryPhone');
  const summaryCollege = document.getElementById('summaryCollege');
  const summaryYear = document.getElementById('summaryYear');

  const frame = document.getElementById('frame');
  const btnRecent = document.getElementById('btnRecent');
  const btnMyEvents = document.getElementById('btnMyEvents');
  const btnTasks = document.getElementById('btnTasks');
  const logoutBtn = document.getElementById('logoutBtn');
  const toast = document.getElementById('toast');
  const notifCount = document.getElementById('notifCount');
  const notifBtn = document.getElementById('notifBtn');

  // side-panel links
  const panelContribBtn = document.getElementById('panelContribBtn');
  const panelAchBtn = document.getElementById('panelAchBtn');
  const panelReportBtn = document.getElementById('panelReportBtn');

  // profile edit elements (inside profileEdit)
  const profilePhotoInput = document.getElementById('profilePhotoInput');
  const profilePhotoPreview = document.getElementById('profilePhotoPreview');
  const profileNameInput = document.getElementById('profileNameInput');
  const profileDobInput = document.getElementById('profileDobInput');
  const profilePhoneInput = document.getElementById('profilePhoneInput');
  const profileCollegeInput = document.getElementById('profileCollegeInput');
  const profileYearInput = document.getElementById('profileYearInput');
  const saveProfileBtn = document.getElementById('saveProfileBtn');
  const cancelProfileBtn = document.getElementById('cancelProfileBtn');
  const editProfileBtn = document.getElementById('editProfileBtn');
  const closePanelBtn = document.getElementById('closePanelBtn');
  const profileMsg = document.getElementById('profileMsg');

  // summary may be missing in some layouts — guards used later
  let currentUser = null;
  let currentUserData = null;
  let currentPreviewBlob = null; // object URL to revoke when done

  /* ---------- small helpers ---------- */
  function showToast(text, ms = 3000){
    if (!toast) return;
    toast.textContent = text;
    toast.classList.remove('hidden');
    setTimeout(()=> toast.classList.add('hidden'), ms);
  }
  function el(tag, attrs = {}) {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k,v])=>{
      if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else e.setAttribute(k, v);
    });
    return e;
  }

  /* ---------- UI wiring ---------- */
  if (hambtn) hambtn.addEventListener('click', ()=> {
    if (!profilePanel) return;
    profilePanel.classList.toggle('hidden');
  });

  if (closePanelBtn) closePanelBtn.addEventListener('click', ()=> {
    if (!profilePanel) return;
    profilePanel.classList.add('hidden');
    // if editing, collapse edit and show summary
    if (profileEdit) profileEdit.style.display = 'none';
    if (profileSummary) profileSummary.style.display = 'block';
  });

  if (notifBtn) notifBtn.addEventListener('click', ()=> showToast('No new notifications'));
  if (logoutBtn) logoutBtn.addEventListener('click', async ()=> {
    try { await signOut(auth); window.location.href = 'index.html'; }
    catch(e){ console.error(e); showToast('Logout failed'); }
  });

  // panel navigation
  if (panelContribBtn) panelContribBtn.addEventListener('click', ()=> renderPanelView('contributions'));
  if (panelAchBtn) panelAchBtn.addEventListener('click', ()=> renderPanelView('achievements'));
  if (panelReportBtn) panelReportBtn.addEventListener('click', ()=> renderPanelView('report'));

  if (btnRecent) btnRecent.addEventListener('click', ()=> renderTab('recent'));
  if (btnMyEvents) btnMyEvents.addEventListener('click', ()=> renderTab('myevents'));
  if (btnTasks) btnTasks.addEventListener('click', ()=> renderTab('tasks'));

  if (editProfileBtn) editProfileBtn.addEventListener('click', ()=> {
    if (!profileEdit || !profileSummary) return;
    profileSummary.style.display = 'none';
    profileEdit.style.display = 'block';
    if (profilePanel) profilePanel.scrollTop = 0;
  });

  // profile photo preview: create object URL and remember to revoke
  if (profilePhotoInput) {
    profilePhotoInput.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      if (currentPreviewBlob) { try { URL.revokeObjectURL(currentPreviewBlob); } catch(e){} currentPreviewBlob = null; }
      const url = URL.createObjectURL(f);
      currentPreviewBlob = url;
      if (profilePhotoPreview) profilePhotoPreview.src = url;
    });
  }

  /* ---------- Firestore helpers ---------- */
  async function loadRecentEvents() {
    try {
      const q = query(collection(db, 'events'));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.error('loadRecentEvents', err);
      showToast('Unable to load events (permission).');
      return [];
    }
  }

  async function loadEventById(id) {
    try {
      const d = await getDoc(doc(db,'events',id));
      return d.exists() ? { id: d.id, ...d.data() } : null;
    } catch (err) {
      console.error('loadEventById', err);
      return null;
    }
  }

  async function loadMyRegistrations() {
    if (!currentUser) return [];
    try {
      const q = query(collection(db, 'registrations'), where('studentUid','==', currentUser.uid));
      const snap = await getDocs(q);
      return snap.docs.map(d=>({ id: d.id, ...d.data() }));
    } catch (err) {
      console.error('loadMyRegistrations', err);
      showToast('Unable to fetch your registrations (permission).');
      return [];
    }
  }

  // register with snapshot of user profile to avoid future reads/restrictions
  async function registerForEvent(eventId) {
    if (!currentUser) { showToast('Not signed in'); return; }
    try {
      const userDocSnap = await getDoc(doc(db, 'users', currentUser.uid));
      const userProfile = userDocSnap.exists() ? userDocSnap.data() : {};
      await addDoc(collection(db, 'registrations'), {
        eventId,
        studentUid: currentUser.uid,
        studentName: userProfile.name || (currentUser.displayName || ''),
        studentPhone: userProfile.phone || '',
        createdAt: serverTimestamp(),
        status: 'pending'
      });
      showToast('Registered successfully (pending)');
      renderTab('myevents');
    } catch (err) {
      console.error('registerForEvent', err);
      showToast('Registration failed');
    }
  }

  async function loadMyTasks() {
    if (!currentUser) return [];
    try {
      const q = query(collection(db, 'tasks'), where('assigneeUid','==', currentUser.uid));
      const snap = await getDocs(q);
      return snap.docs.map(d=>({ id: d.id, ...d.data() }));
    } catch (err) {
      console.error('loadMyTasks', err);
      showToast('Unable to fetch tasks (permission).');
      return [];
    }
  }

  /* ---------- Renderers ---------- */
  async function renderTab(tab) {
    frame.innerHTML = '';
    if (tab === 'recent') {
      frame.appendChild(el('div',{text:'Loading events...'}));
      const events = await loadRecentEvents();
      frame.innerHTML = '';
      if (events.length === 0) { frame.appendChild(el('div',{text:'No upcoming events.', class:'placeholder'})); return; }
      events.forEach(ev => {
        const box = el('div',{class:'event'});
        const left = el('div');
        left.appendChild(el('div',{text: ev.title || 'Untitled', class:'title'}));
        left.appendChild(el('div',{text: `${ev.date||''} • ${ev.time||''} • ${ev.location||''}`, class:'meta'}));
        left.appendChild(el('div',{text: ev.description || '', class:'desc'}));
        const right = el('div');
        const regBtn = el('button',{text:'Register', class:'btn'});
        regBtn.addEventListener('click', ()=> registerForEvent(ev.id));
        right.appendChild(regBtn);
        box.appendChild(left); box.appendChild(right);
        frame.appendChild(box);
      });
    } else if (tab === 'myevents') {
      frame.appendChild(el('div',{text:'Loading your events...'}));
      const regs = await loadMyRegistrations();
      frame.innerHTML = '';
      if (regs.length === 0) { frame.appendChild(el('div',{text:"You haven't registered for any events yet.", class:'placeholder'})); return; }
      for (const r of regs) {
        const ev = await loadEventById(r.eventId);
        const box = el('div',{class:'event'});
        const left = el('div');
        left.appendChild(el('div',{text: ev?.title || 'Event (deleted)'}));
        left.appendChild(el('div',{text: (ev?.date||'') + ' • ' + (ev?.time||''), class:'meta'}));
        left.appendChild(el('div',{text: 'Status: ' + (r.status||'pending'), class:'meta'}));
        const right = el('div');
        const v = el('button',{text:'View', class:'btn'});
        v.addEventListener('click', ()=> showToast(ev?.description || 'No description'));
        right.appendChild(v);
        box.appendChild(left); box.appendChild(right);
        frame.appendChild(box);
      }
    } else if (tab === 'tasks') {
      frame.appendChild(el('div',{text:'Loading tasks...'}));
      const tasks = await loadMyTasks();
      frame.innerHTML = '';
      if (tasks.length === 0) { frame.appendChild(el('div',{text:'No tasks assigned.', class:'placeholder'})); return; }
      tasks.forEach(t=>{
        const box = el('div',{class:'event'});
        box.appendChild(el('div',{text: t.title || 'Task' }));
        box.appendChild(el('div',{text: t.details || '', class:'meta'}));
        frame.appendChild(box);
      });
    }
  }

  async function renderPanelView(view) {
    frame.innerHTML = '';
    if (view === 'contributions') {
      frame.appendChild(el('div',{text:'Loading contributions...'}));
      if (!currentUserData) { frame.innerHTML = ''; frame.appendChild(el('div',{text:'No profile loaded.', class:'placeholder'})); return; }
      const wrap = el('div'); wrap.appendChild(el('h3',{text:'My contributions'}));
      const contributions = currentUserData.contributionDetails || [];
      if (contributions.length === 0) wrap.appendChild(el('div',{text:'No contributions yet', class:'muted'}));
      else { const ul = el('ul'); contributions.forEach(c=>ul.appendChild(el('li',{text:c}))); wrap.appendChild(ul); }
      frame.appendChild(wrap);
    } else if (view === 'achievements') {
      frame.appendChild(el('div',{text:'Loading achievements...'}));
      const wrap = el('div'); wrap.appendChild(el('h3',{text:'My Achievements'}));
      const ach = currentUserData?.achievements || [];
      if (ach.length === 0) wrap.appendChild(el('div',{text:'No achievements yet', class:'muted'}));
      else { const ul = el('ul'); ach.forEach(a=>ul.appendChild(el('li',{text:a}))); wrap.appendChild(ul); }
      frame.appendChild(wrap);
    } else if (view === 'report') {
      frame.appendChild(el('div',{text:'Loading report...'}));
      if (!currentUserData) { frame.innerHTML = ''; frame.appendChild(el('div',{text:'No profile loaded', class:'placeholder'})); return; }
      const wrap = el('div'); wrap.appendChild(el('h3',{text:'My Report'}));
      wrap.appendChild(el('div',{text:`Total contributions: ${currentUserData.contributions||0}`, class:'big'}));
      wrap.appendChild(el('div',{text:`Summary: ${currentUserData.reportSummary||'No report available'}`, class:'muted'}));
      frame.appendChild(wrap);
    }
    if (profilePanel) profilePanel.classList.add('hidden');
  }

  /* ---------- Profile UI population & toggles ---------- */
  function populateProfileUI(userDocData) {
    if (!userDocData) return;
    if (profileName) profileName.textContent = userDocData.name || 'Student';
    if (profileRole) profileRole.textContent = userDocData.role || 'Student';
    if (welcomeTitle) welcomeTitle.textContent = `Welcome, ${userDocData.name || 'Student'}`;

    // summary fields
    if (summaryName) summaryName.textContent = userDocData.name || '—';
    if (summaryPhone) summaryPhone.textContent = userDocData.phone || '—';
    if (summaryCollege) summaryCollege.textContent = userDocData.college || '—';
    if (summaryYear) summaryYear.textContent = userDocData.year || '—';

    // fill edit inputs
    if (profileNameInput) profileNameInput.value = userDocData.name || '';
    if (profileDobInput) profileDobInput.value = userDocData.dob ? (typeof userDocData.dob === 'string' ? userDocData.dob : (userDocData.dob.seconds ? new Date(userDocData.dob.seconds*1000).toISOString().slice(0,10) : '')) : '';
    if (profilePhoneInput) profilePhoneInput.value = userDocData.phone || '';
    if (profileCollegeInput) profileCollegeInput.value = userDocData.college || '';
    if (profileYearInput) profileYearInput.value = userDocData.year || '';

    // header circle: if photoURL exists show it, otherwise show initials
    if (userDocData.photoURL) {
      if (profileCircleImg) { profileCircleImg.src = userDocData.photoURL; profileCircleImg.style.display = 'block'; }
      if (profileInitial) profileInitial.style.display = 'none';
    } else {
      if (profileCircleImg) profileCircleImg.style.display = 'none';
      if (profileInitial) {
        profileInitial.textContent = (userDocData.name || 'ST').split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase();
        profileInitial.style.display = 'block';
      }
    }
  }

  /* ---------- Save profile (upload + write) ---------- */
  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', async () => {
      if (!currentUser) { showToast('Not signed in'); return; }
      if (profileMsg) profileMsg.textContent = '';
      saveProfileBtn.disabled = true;
      const prevText = saveProfileBtn.textContent || 'Save Profile';
      saveProfileBtn.textContent = 'Saving...';

      try {
        let photoURL = currentUserData?.photoURL || null;

        // Upload photo if a file is selected
        const file = profilePhotoInput && profilePhotoInput.files && profilePhotoInput.files[0];
        if (file) {
          if (file.size > 2.5 * 1024 * 1024) {
            if (profileMsg) profileMsg.textContent = 'Image too large (max 2.5MB).';
            saveProfileBtn.disabled = false;
            saveProfileBtn.textContent = prevText;
            return;
          }

          try {
            const storage = getStorage();
            const p = `users/${currentUser.uid}/profile-${Date.now()}`;
            const sRef = storageRef(storage, p);
            await uploadBytes(sRef, file); // may throw CORS or network error
            photoURL = await getDownloadURL(sRef);
          } catch (uploadErr) {
            console.error('Upload failed', uploadErr);
            // A typical cause is wrong bucket name or bucket CORS; show a friendly message.
            if (uploadErr?.code === 'storage/unauthorized' || uploadErr?.message?.toLowerCase?.()?.includes('cors') || uploadErr?.message?.toLowerCase?.()?.includes('access')) {
              showToast('Upload failed (CORS/permission). Check bucket settings and storageBucket in firebase.js.');
            } else {
              showToast('Upload failed. See console.');
            }
            throw uploadErr; // rethrow to be handled by outer try/catch
          }
        }

        // Build profile data & write to Firestore
        const profileUpdate = {
          name: profileNameInput ? profileNameInput.value.trim() : '',
          phone: profilePhoneInput ? profilePhoneInput.value.trim() : '',
          college: profileCollegeInput ? profileCollegeInput.value.trim() : '',
          year: profileYearInput ? profileYearInput.value : '',
          dob: profileDobInput ? profileDobInput.value : '',
          updatedAt: new Date()
        };
        if (photoURL) profileUpdate.photoURL = photoURL;

        const userDocRef = doc(db, 'users', currentUser.uid);
        try {
          await updateDoc(userDocRef, profileUpdate);
        } catch (e) {
          // doc might not exist; set it
          await setDoc(userDocRef, { uid: currentUser.uid, ...profileUpdate });
        }

        // Update local state & UI
        currentUserData = { ...(currentUserData || {}), ...profileUpdate };
        populateProfileUI(currentUserData);

        if (profileMsg) profileMsg.textContent = 'Profile saved';
        showToast('Profile updated');

        // hide the edit area, show summary
        if (profileEdit) profileEdit.style.display = 'none';
        if (profileSummary) profileSummary.style.display = 'block';
        // close panel for nicer UX
        if (profilePanel) profilePanel.classList.add('hidden');

        // Revoke object URL if used
        if (currentPreviewBlob) {
          try { URL.revokeObjectURL(currentPreviewBlob); } catch(e) {}
          currentPreviewBlob = null;
        }

      } catch (err) {
        console.error('save profile overall failed', err);
        if (profileMsg) profileMsg.textContent = 'Failed to save profile. See console.';
      } finally {
        saveProfileBtn.disabled = false;
        saveProfileBtn.textContent = prevText;
      }
    });
  }

  // Cancel the edit: restore values and hide edit UI
  if (cancelProfileBtn) {
    cancelProfileBtn.addEventListener('click', ()=> {
      populateProfileUI(currentUserData || {});
      if (profileEdit) profileEdit.style.display = 'none';
      if (profileSummary) profileSummary.style.display = 'block';
      if (currentPreviewBlob) { try { URL.revokeObjectURL(currentPreviewBlob); } catch(e){} currentPreviewBlob = null; }
    });
  }

  /* ---------- Auth listener ---------- */
  onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'index.html'; return; }
    currentUser = user;
    try {
      const udSnap = await getDoc(doc(db, 'users', user.uid));
      if (!udSnap.exists()) {
        showToast('User profile missing. Contact admin.');
        console.error('User doc missing for', user.uid);
        return;
      }
      currentUserData = udSnap.data();
      populateProfileUI(currentUserData);
      // default view
      renderTab('recent');

      // pending registrations count demo
      try {
        const q = query(collection(db,'registrations'), where('studentUid','==', user.uid));
        const snap = await getDocs(q);
        const pending = snap.docs.filter(d => d.data().status === 'pending').length;
        if (pending > 0 && notifCount) { notifCount.textContent = pending; notifCount.classList.remove('hidden'); }
        else if (notifCount) notifCount.classList.add('hidden');
      } catch (e) { /* ignore notifications error */ }

    } catch (err) {
      console.error('Auth listener failed to fetch profile', err);
      showToast('Failed to fetch profile (check permissions).');
    }
  });

} // end DOM guard
