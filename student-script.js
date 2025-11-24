// student-script.js
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
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

/* --- DOM guard: run only on student page where #frame exists --- */
if (!document.getElementById('frame')) {
  console.log('student-script: not on student page — aborting.');
} else {

  // ===== DOM ELEMENTS =====
  const frame = document.getElementById('frame');
  const toast = document.getElementById('toast');

  // Topbar
  const hambtn = document.getElementById('hambtn');
  const notifBtn = document.getElementById('notifBtn');
  const notifCount = document.getElementById('notifCount');
  const logoutBtn = document.getElementById('logoutBtn');

  // Profile panel
  const profilePanel = document.getElementById('profilePanel');
  const profileCircle = document.getElementById('profileCircle');
  const profileInitial = document.getElementById('profileInitial');
  const profileCircleImg = document.getElementById('profileCircleImg');
  const profileName = document.getElementById('profileName');
  const profileRole = document.getElementById('profileRole');
  const closePanelBtn = document.getElementById('closePanelBtn');

  // Profile summary
  const summaryName = document.getElementById('summaryName');
  const summaryPhone = document.getElementById('summaryPhone');
  const summaryCollege = document.getElementById('summaryCollege');
  const summaryYear = document.getElementById('summaryYear');

  // Profile edit form
  const profileEdit = document.getElementById('profileEdit');
  const profileSummaryBlock = document.getElementById('profileSummary');
  const editProfileBtn = document.getElementById('editProfileBtn');
  const saveProfileBtn = document.getElementById('saveProfileBtn');
  const cancelProfileBtn = document.getElementById('cancelProfileBtn');
  const profilePhotoInput = document.getElementById('profilePhotoInput');
  const profilePhotoPreview = document.getElementById('profilePhotoPreview');
  const profileNameInput = document.getElementById('profileNameInput');
  const profileDobInput = document.getElementById('profileDobInput');
  const profilePhoneInput = document.getElementById('profilePhoneInput');
  const profileCollegeInput = document.getElementById('profileCollegeInput');
  const profileYearInput = document.getElementById('profileYearInput');
  const profileMsg = document.getElementById('profileMsg');

  // Panel links
  const panelContribBtn = document.getElementById('panelContribBtn');
  const panelAchBtn = document.getElementById('panelAchBtn');
  const panelReportBtn = document.getElementById('panelReportBtn');

  // Top tabs
  const btnRecent = document.getElementById('btnRecent');
  const btnMyEvents = document.getElementById('btnMyEvents');
  const btnTasks = document.getElementById('btnTasks');

  // Summary cards
  const reportContrib = document.getElementById('reportContrib');
  const achCard = document.getElementById('achCard');
  const contribList = document.getElementById('contribList');

  // Welcome title
  const welcomeTitle = document.getElementById('welcomeTitle');

  // ===== STATE =====
  let currentUser = null;
  let currentUserData = null;

  let myRegistrations = [];        // list of registrations for current student
  let myRegEventIds = new Set();   // set of event IDs current student has registered for

  // ===== HELPERS =====

  function showToast(msg, ms = 3000) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), ms);
  }

  function el(tag, attrs = {}) {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else e.setAttribute(k, v);
    });
    return e;
  }

  async function loadMyRegistrations() {
    if (!currentUser) return;

    try {
      const qRegs = query(
        collection(db, 'registrations'),
        where('studentUid', '==', currentUser.uid)
      );
      const snap = await getDocs(qRegs);
      myRegistrations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      myRegEventIds = new Set(myRegistrations.map(r => r.eventId));

      // update summary card "My Report" total contributions
      if (reportContrib) {
        reportContrib.textContent = myRegistrations.length.toString();
      }

      // a simple contributions text
      if (contribList) {
        if (myRegistrations.length === 0) {
          contribList.textContent = 'No contributions yet';
        } else {
          contribList.innerHTML = myRegistrations
            .slice(0, 5)
            .map(r => `<div>Event ID: ${r.eventId}</div>`)
            .join('');
        }
      }
    } catch (err) {
      console.error('loadMyRegistrations', err);
      showToast('Unable to load your registrations');
    }
  }

  async function hasExistingRegistration(eventId) {
    // First check the cached set
    if (myRegEventIds.has(eventId)) {
      return true;
    }

    // Double-check in Firestore to avoid race conditions
    try {
      const qCheck = query(
        collection(db, 'registrations'),
        where('eventId', '==', eventId),
        where('studentUid', '==', currentUser.uid)
      );
      const snap = await getDocs(qCheck);
      if (!snap.empty) {
        // cache it now
        myRegEventIds.add(eventId);
        return true;
      }
    } catch (err) {
      console.error('hasExistingRegistration', err);
      // on error, we’ll be safe and let registration fail separately
    }
    return false;
  }

  // Register for an event with "no double registration" rule
  async function registerForEvent(ev, btnForUI = null) {
    if (!currentUser) {
      showToast('Please login again');
      return;
    }

    // Ensure we have the latest registration list
    await loadMyRegistrations();

    if (await hasExistingRegistration(ev.id)) {
      showToast('You have already registered for this event');
      if (btnForUI) {
        btnForUI.disabled = true;
        btnForUI.textContent = 'Registered';
      }
      return;
    }

    try {
      const payload = {
        eventId: ev.id,
        studentUid: currentUser.uid,
        createdAt: serverTimestamp(),
        status: ev.autoApprove ? 'approved' : 'pending',
        studentName: currentUserData?.name || '',
        studentPhone: currentUserData?.phone || '',
        studentCollege: currentUserData?.college || '',
        studentYear: currentUserData?.year || ''
      };

      await addDoc(collection(db, 'registrations'), payload);
      myRegEventIds.add(ev.id);

      showToast('Registered successfully');

      if (btnForUI) {
        btnForUI.disabled = true;
        btnForUI.textContent = 'Registered';
      }

      // update summary counts
      await loadMyRegistrations();
    } catch (err) {
      console.error('registerForEvent', err);
      showToast('Registration failed');
    }
  }

  // ===== RENDER TABS =====

  async function renderTab(tab) {
    // Update tab "selected" state (for accessibility if you want)
    if (btnRecent)  btnRecent.setAttribute('aria-selected', tab === 'recent' ? 'true' : 'false');
    if (btnMyEvents) btnMyEvents.setAttribute('aria-selected', tab === 'myevents' ? 'true' : 'false');
    if (btnTasks)   btnTasks.setAttribute('aria-selected', tab === 'tasks' ? 'true' : 'false');

    if (!frame) return;
    frame.innerHTML = '';

    if (tab === 'recent') {
      await renderRecentEvents();
      return;
    }

    if (tab === 'myevents') {
      await renderMyEvents();
      return;
    }

    if (tab === 'tasks') {
      renderTasksPlaceholder();
      return;
    }
  }

  // === Recent Events tab ===
  async function renderRecentEvents() {
    frame.innerHTML = '<div class="placeholder">Loading events...</div>';

    await loadMyRegistrations();

    try {
      const snap = await getDocs(collection(db, 'events'));
      const events = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.createdAt ? (a.createdAt.seconds ?? 0) : 0;
          const tb = b.createdAt ? (b.createdAt.seconds ?? 0) : 0;
          return tb - ta;
        });

      frame.innerHTML = '';

      if (events.length === 0) {
        frame.innerHTML = '<div class="placeholder">No events available.</div>';
        return;
      }

      events.forEach(ev => {
        const box = el('div', { class: 'event' });

        const left = el('div');
        left.appendChild(el('div', { text: ev.title || 'Untitled Event' }));
        left.appendChild(el('div', {
          text: `${ev.date || ''} • ${ev.time || ''} • ${ev.location || ''}`,
          class: 'meta'
        }));
        if (ev.description) {
          left.appendChild(el('div', {
            text: ev.description,
            class: 'desc'
          }));
        }

        const right = el('div');
        const registered = myRegEventIds.has(ev.id);
        const regBtn = el('button', {
          text: registered ? 'Registered' : 'Register',
          class: 'btn btn-yellow'
        });
        regBtn.disabled = registered;

        regBtn.addEventListener('click', () => {
          if (!regBtn.disabled) {
            registerForEvent(ev, regBtn);
          }
        });

        right.appendChild(regBtn);
        box.appendChild(left);
        box.appendChild(right);
        frame.appendChild(box);
      });

    } catch (err) {
      console.error('renderRecentEvents', err);
      frame.innerHTML = '<div class="placeholder">Failed to load events.</div>';
    }
  }

  // === My Events tab: show events student has registered for ===
  async function renderMyEvents() {
    frame.innerHTML = '<div class="placeholder">Loading your events...</div>';

    await loadMyRegistrations();

    if (myRegistrations.length === 0) {
      frame.innerHTML = '<div class="placeholder">You have not registered for any events yet.</div>';
      return;
    }

    frame.innerHTML = '';

    // Build a map of eventId -> event data
    const eventsById = {};

    for (const r of myRegistrations) {
      if (!r.eventId) continue;
      if (eventsById[r.eventId]) continue; // avoid duplicate fetch

      try {
        const evSnap = await getDoc(doc(db, 'events', r.eventId));
        if (evSnap.exists()) {
          eventsById[r.eventId] = { id: evSnap.id, ...evSnap.data() };
        }
      } catch (err) {
        console.warn('Could not load event for registration', r.id, err);
      }
    }

    const eventIds = Object.keys(eventsById);
    if (eventIds.length === 0) {
      frame.innerHTML = '<div class="placeholder">Your registrations refer to events that no longer exist.</div>';
      return;
    }

    eventIds.forEach(eid => {
      const ev = eventsById[eid];
      const box = el('div', { class: 'event' });

      const left = el('div');
      left.appendChild(el('div', { text: ev.title || 'Untitled Event' }));
      left.appendChild(el('div', {
        text: `${ev.date || ''} • ${ev.time || ''}`,
        class: 'meta'
      }));

      const right = el('div');

      // View button to toggle detailed info BELOW this event
      const viewBtn = el('button', {
        text: 'View',
        class: 'btn btn-yellow'
      });

      const details = el('div', {
        class: 'muted'
      });
      details.style.marginTop = '8px';
      details.style.display = 'none';   // hidden by default

      details.innerHTML = `
        <div><strong>Location:</strong> ${ev.location || '—'}</div>
        <div><strong>Date:</strong> ${ev.date || '—'}</div>
        <div><strong>Time:</strong> ${ev.time || '—'}</div>
        <div><strong>Description:</strong> ${ev.description || '—'}</div>
      `;

      viewBtn.addEventListener('click', () => {
        const isHidden = details.style.display === 'none';
        details.style.display = isHidden ? 'block' : 'none';
        viewBtn.textContent = isHidden ? 'Hide' : 'View';
      });

      right.appendChild(viewBtn);

      box.appendChild(left);
      box.appendChild(right);
      // Append details BELOW this event row
      const wrapper = el('div');
      wrapper.appendChild(box);
      wrapper.appendChild(details);

      frame.appendChild(wrapper);
    });
  }

  // === My Tasks tab (placeholder) ===
  function renderTasksPlaceholder() {
    frame.innerHTML = `
      <div class="card">
        <h3>My Tasks</h3>
        <p class="muted">Task tracking is coming soon.</p>
      </div>
    `;
  }

  // ===== PROFILE LOGIC =====

  function fillProfileUIFromData(data) {
    const name = data?.name || 'Student';
    const phone = data?.phone || '—';
    const college = data?.college || '—';
    const year = data?.year || '—';

    if (welcomeTitle) welcomeTitle.textContent = `Welcome, ${name}`;
    if (profileName) profileName.textContent = name;
    if (profileRole) profileRole.textContent = 'Student';

    // initials in circle
    const initials = name
      .split(' ')
      .map(s => s[0])
      .slice(0,2)
      .join('')
      .toUpperCase();

    if (profileInitial) profileInitial.textContent = initials;

    if (summaryName) summaryName.textContent = name;
    if (summaryPhone) summaryPhone.textContent = phone;
    if (summaryCollege) summaryCollege.textContent = college;
    if (summaryYear) summaryYear.textContent = year;

    // fill edit form
    if (profileNameInput) profileNameInput.value = data?.name || '';
    if (profileDobInput) profileDobInput.value = data?.dob || '';
    if (profilePhoneInput) profilePhoneInput.value = data?.phone || '';
    if (profileCollegeInput) profileCollegeInput.value = data?.college || '';
    if (profileYearInput) profileYearInput.value = data?.year || '';

    if (data?.photoUrl) {
      if (profileCircleImg) {
        profileCircleImg.src = data.photoUrl;
        profileCircleImg.style.display = 'block';
      }
      if (profileInitial) profileInitial.style.display = 'none';
      if (profilePhotoPreview) profilePhotoPreview.src = data.photoUrl;
    }
  }

  async function saveProfile() {
    if (!currentUser) return;
    if (!profileMsg) return;

    const name = profileNameInput?.value.trim() || '';
    const dob = profileDobInput?.value || '';
    const phone = profilePhoneInput?.value.trim() || '';
    const college = profileCollegeInput?.value.trim() || '';
    const year = profileYearInput?.value || '';

    profileMsg.textContent = 'Saving...';

    try {
      const userRef = doc(db, 'users', currentUser.uid);
      const payload = {
        name,
        dob,
        phone,
        college,
        year
      };
      await updateDoc(userRef, payload);

      currentUserData = {
        ...(currentUserData || {}),
        ...payload
      };
      fillProfileUIFromData(currentUserData);

      profileMsg.textContent = 'Profile updated';
      // switch back to summary mode
      if (profileEdit && profileSummaryBlock) {
        profileEdit.style.display = 'none';
        profileSummaryBlock.style.display = 'block';
      }
    } catch (err) {
      console.error('saveProfile', err);
      profileMsg.textContent = 'Failed to save profile';
    }
  }

  // ===== WIRING EVENTS =====

  // Topbar
  if (hambtn && profilePanel) {
    hambtn.addEventListener('click', () => {
      profilePanel.classList.toggle('hidden');
    });
  }

  if (closePanelBtn && profilePanel) {
    closePanelBtn.addEventListener('click', () => {
      profilePanel.classList.add('hidden');
    });
  }

  if (notifBtn) {
    notifBtn.addEventListener('click', () => {
      showToast('No new notifications');
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await signOut(auth);
        window.location.href = 'index.html';
      } catch (err) {
        console.error(err);
        showToast('Logout failed');
      }
    });
  }

  // Tabs
  if (btnRecent)   btnRecent.addEventListener('click', () => renderTab('recent'));
  if (btnMyEvents) btnMyEvents.addEventListener('click', () => renderTab('myevents'));
  if (btnTasks)    btnTasks.addEventListener('click', () => renderTab('tasks'));

  // Panel links
  if (panelContribBtn) panelContribBtn.addEventListener('click', () => renderTab('myevents'));
  if (panelReportBtn)  panelReportBtn.addEventListener('click', () => renderTab('myevents'));
  if (panelAchBtn && achCard) {
    panelAchBtn.addEventListener('click', () => {
      frame.innerHTML = '';
      const card = el('div', { class: 'card' });
      card.appendChild(el('h3', { text: 'My achievements' }));
      const ul = el('ul', { class: 'small-list' });
      ul.innerHTML = achCard.innerHTML;
      card.appendChild(ul);
      frame.appendChild(card);
    });
  }

  // Profile edit toggles
  if (editProfileBtn && profileEdit && profileSummaryBlock) {
    editProfileBtn.addEventListener('click', () => {
      profileSummaryBlock.style.display = 'none';
      profileEdit.style.display = 'block';
    });
  }

  if (cancelProfileBtn && profileEdit && profileSummaryBlock) {
    cancelProfileBtn.addEventListener('click', () => {
      profileEdit.style.display = 'none';
      profileSummaryBlock.style.display = 'block';
    });
  }

  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', saveProfile);
  }

  // Photo preview (local only)
  if (profilePhotoInput && profilePhotoPreview) {
    profilePhotoInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        profilePhotoPreview.src = reader.result;
      };
      reader.readAsDataURL(file);
      // NOTE: this does not upload to storage; you'd add upload logic if needed
    });
  }

  // ===== AUTH LISTENER =====

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = 'index.html';
      return;
    }

    currentUser = user;

    try {
      const userSnap = await getDoc(doc(db, 'users', user.uid));
      if (!userSnap.exists()) {
        showToast('User profile missing');
        return;
      }

      const data = userSnap.data();
      currentUserData = data;

      // basic role check; adjust as per your schema
      if (data.role && data.role !== 'student') {
        showToast('Not authorized for Student portal');
        return;
      }

      fillProfileUIFromData(data);

      // load my registrations (for summary + set)
      await loadMyRegistrations();

      // default tab
      await renderTab('recent');

      // notifications: count of approved registrations maybe
      try {
        const qPending = query(
          collection(db, 'registrations'),
          where('studentUid', '==', user.uid),
          where('status', '==', 'approved')
        );
        const snap = await getDocs(qPending);
        const count = snap.size;
        if (count > 0) {
          notifCount.textContent = count.toString();
          notifCount.classList.remove('hidden');
        } else {
          notifCount.classList.add('hidden');
        }
      } catch (err) {
        // ignore notif errors
      }

    } catch (err) {
      console.error('Auth init error', err);
      showToast('Failed to load student profile');
    }
  });

} // end DOM guard
