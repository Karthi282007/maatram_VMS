// organizer-script.js
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

/* --- DOM guard: run only on organizer.html where #frame exists --- */
if (!document.getElementById('frame')) {
  console.log('organizer-script: not on organizer page — aborting.');
} else {

  /* UI element references */
  const hambtn = document.getElementById('hambtn');
  const profilePanel = document.getElementById('profilePanel');
  const profileName = document.getElementById('profileName');
  const profileRole = document.getElementById('profileRole');
  const profileInitial = document.getElementById('profileInitial');
  const frame = document.getElementById('frame');
  const panelRecentBtn = document.getElementById('panelRecentBtn');
  const panelAddBtn = document.getElementById('panelAddBtn');
  const panelManageBtn = document.getElementById('panelManageBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const toast = document.getElementById('toast');
  const notifBtn = document.getElementById('notifBtn');
  const notifCount = document.getElementById('notifCount');
  const profileQuick = document.getElementById('profileQuick');

  // main action buttons under title
  const mainRecentBtn = document.getElementById('mainRecentBtn');
  const mainAddBtn = document.getElementById('mainAddBtn');
  const mainManageBtn = document.getElementById('mainManageBtn');

  let currentUser = null;
  let currentUserData = null;

  /* --- Helpers --- */

  function showToast(msg, ms = 3000) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), ms);
  }

  // small helper for creating elements
  function el(tag, attrs = {}) {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else e.setAttribute(k, v);
    });
    return e;
  }

  /* --- UI wiring --- */

  if (hambtn && profilePanel) {
    hambtn.addEventListener('click', () =>
      profilePanel.classList.toggle('hidden')
    );
  }

  if (notifBtn) {
    notifBtn.addEventListener('click', () => showToast('No new notifications'));
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await signOut(auth);
        window.location.href = 'index.html';
      } catch (e) {
        console.error(e);
        showToast('Logout failed');
      }
    });
  }

  // side panel buttons
  if (panelRecentBtn) panelRecentBtn.addEventListener('click', () => renderPanel('recent'));
  if (panelAddBtn) panelAddBtn.addEventListener('click', () => renderPanel('add'));
  if (panelManageBtn) panelManageBtn.addEventListener('click', () => renderPanel('manage'));

  // main buttons under title
  if (mainRecentBtn) mainRecentBtn.addEventListener('click', () => renderPanel('recent'));
  if (mainAddBtn) mainAddBtn.addEventListener('click', () => renderPanel('add'));
  if (mainManageBtn) mainManageBtn.addEventListener('click', () => renderPanel('manage'));

  /* --- Firestore helpers --- */

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

  async function createEvent(payload) {
    try {
      const docRef = await addDoc(collection(db, 'events'), {
        ...payload,
        createdAt: serverTimestamp()
      });
      showToast('Event created');
      return docRef.id;
    } catch (err) {
      console.error('createEvent', err);
      showToast('Failed to create event');
      throw err;
    }
  }

  // organizer's own events
  async function loadOrganizerEvents(uid) {
    try {
      const q = query(collection(db, 'events'), where('organizerUid', '==', uid));
      const snap = await getDocs(q);
      const events = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const ta = a.createdAt
            ? (a.createdAt.seconds ?? (a.createdAt.toMillis ? a.createdAt.toMillis() : 0))
            : 0;
          const tb = b.createdAt
            ? (b.createdAt.seconds ?? (b.createdAt.toMillis ? b.createdAt.toMillis() : 0))
            : 0;
          return tb - ta;
        });
      return events;
    } catch (err) {
      console.error('loadOrganizerEvents', err);
      showToast('Unable to load your events (permission).');
      return [];
    }
  }

  async function loadRegistrationsForEvent(eventId) {
    try {
      const q = query(collection(db, 'registrations'), where('eventId', '==', eventId));
      const snap = await getDocs(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } catch (err) {
      console.error('loadRegistrationsForEvent', err);
      showToast('Unable to load registrations (permission).');
      return [];
    }
  }

  async function sendMessageToParticipants(eventId, message) {
    try {
      const regs = await loadRegistrationsForEvent(eventId);
      if (regs.length === 0) {
        showToast('No participants to message');
        return;
      }

      // update each registration with lastMessage + lastNotifiedAt
      const updates = regs.map(r => {
        const rRef = doc(db, 'registrations', r.id);
        return updateDoc(rRef, {
          lastMessage: message,
          lastNotifiedAt: serverTimestamp()
        }).catch(err => {
          console.warn('failed update reg', r.id, err);
        });
      });

      // audit log of message
      await addDoc(collection(db, 'messages'), {
        eventId,
        message,
        senderUid: currentUser.uid,
        sentAt: serverTimestamp()
      });

      await Promise.all(updates);
      showToast('Message sent to participants');
    } catch (err) {
      console.error('sendMessageToParticipants', err);
      showToast('Failed to send message (permission?)');
    }
  }

  /* --- Render functions --- */

  async function renderPanel(view) {
    if (!frame) return;
    frame.innerHTML = '';
    if (profilePanel) profilePanel.classList.add('hidden');

    // ========= Recent events (global) =========
    if (view === 'recent') {
      frame.appendChild(el('div', { text: 'Loading events...' }));
      const events = await loadRecentEvents();
      frame.innerHTML = '';

      if (events.length === 0) {
        frame.appendChild(el('div', {
          text: 'No upcoming events.',
          class: 'placeholder'
        }));
        return;
      }

      events.forEach(ev => {
        const box = el('div', { class: 'event' });

        const left = el('div');
        left.appendChild(el('div', { text: ev.title || 'Untitled' }));
        left.appendChild(el('div', {
          text: `${ev.date || ''} • ${ev.time || ''} • ${ev.location || ''}`,
          class: 'meta'
        }));
        left.appendChild(el('div', {
          text: ev.description || '',
          class: 'desc'
        }));

        const right = el('div');
        const details = el('div', {
          text: `Organizer: ${ev.organizerName || '—'}`,
          class: 'meta'
        });
        const regBtn = el('button', {
          text: 'Register (test)',
          class: 'btn'
        });

        regBtn.addEventListener('click', async () => {
          try {
            await addDoc(collection(db, 'registrations'), {
              eventId: ev.id,
              studentUid: currentUser.uid,
              createdAt: serverTimestamp(),
              status: ev.autoApprove ? 'approved' : 'pending'
            });
            showToast('Registered (test)');
          } catch (err) {
            console.error(err);
            showToast('Register failed');
          }
        });

        right.appendChild(details);
        right.appendChild(regBtn);
        box.appendChild(left);
        box.appendChild(right);
        frame.appendChild(box);
      });

      return;
    }

    // ========= Add Event view =========
    if (view === 'add') {
      const form = el('div', { class: 'card' });

      form.appendChild(el('h3', { text: 'Create Event' }));
      form.appendChild(el('label', {
        html: `Title<br><input id="evtTitle" class="txt" />`
      }));
      form.appendChild(el('label', {
        html: `Date<br><input id="evtDate" type="date" class="txt" />`
      }));
      form.appendChild(el('label', {
        html: `Time<br><input id="evtTime" class="txt" placeholder="08:00 AM" />`
      }));
      form.appendChild(el('label', {
        html: `Location<br><input id="evtLocation" class="txt" />`
      }));
      form.appendChild(el('label', {
        html: `No. of Volunteers<br><input id="evtLimit" type="number" class="txt" min="1" />`
      }));
      form.appendChild(el('label', {
        html: `Description<br><textarea id="evtDesc" class="txt" rows="4"></textarea>`
      }));
      form.appendChild(el('label', {
        html: `Auto-approve registrations<br><input id="evtAuto" type="checkbox" />`
      }));

      const createBtn = el('button', {
        text: 'Create Event',
        class: 'btn'
      });

      const msg = el('div', { class: 'muted' });

      createBtn.addEventListener('click', async () => {
        const payload = {
          title: document.getElementById('evtTitle').value || 'Untitled',
          date: document.getElementById('evtDate').value || '',
          time: document.getElementById('evtTime').value || '',
          location: document.getElementById('evtLocation').value || '',
          limit: Number(document.getElementById('evtLimit').value) || 0,
          description: document.getElementById('evtDesc').value || '',
          autoApprove: !!document.getElementById('evtAuto').checked,
          organizerUid: currentUser.uid,
          organizerName: currentUserData?.name || ''
        };

        try {
          await createEvent(payload);
          renderPanel('manage');
        } catch (err) {
          msg.textContent = 'Create failed. Check console.';
        }
      });

      const cancelBtn = el('button', {
        text: 'Cancel',
        class: 'btn secondary'
      });
      cancelBtn.addEventListener('click', () => renderPanel('recent'));

      form.appendChild(createBtn);
      form.appendChild(cancelBtn);
      form.appendChild(msg);
      frame.appendChild(form);
      return;
    }

    // ========= Manage events (organizer's own) =========
    if (view === 'manage') {
      frame.appendChild(el('div', { text: 'Loading your events...' }));
      const events = await loadOrganizerEvents(currentUser.uid);
      frame.innerHTML = '';

      if (events.length === 0) {
        frame.appendChild(el('div', {
          text: 'You have not created any events yet.',
          class: 'placeholder'
        }));
        return;
      }

      events.forEach(ev => {
        const box = el('div', { class: 'event' });
        const left = el('div');
        left.appendChild(el('div', { text: ev.title || 'Untitled' }));
        left.appendChild(el('div', {
          text: `${ev.date || ''} • ${ev.time || ''} • ${ev.location || ''}`,
          class: 'meta'
        }));

        const right = el('div');
        const manageBtn = el('button', {
          text: 'Open',
          class: 'btn'
        });

        manageBtn.addEventListener('click', () => openEventManageView(ev));

        right.appendChild(manageBtn);
        box.appendChild(left);
        box.appendChild(right);
        frame.appendChild(box);
      });

      return;
    }
  }

  // ========= Detailed event manage view =========
  async function openEventManageView(ev) {
    if (!frame) return;
    frame.innerHTML = '';

    const header = el('div', { class: 'card' });
    header.appendChild(el('h3', { text: `${ev.title}` }));
    header.appendChild(el('div', {
      text: `${ev.date || ''} • ${ev.time || ''} • ${ev.location || ''}`,
      class: 'muted'
    }));
    header.appendChild(el('div', {
      text: ev.description || '',
      class: 'muted'
    }));
    frame.appendChild(header);

    const regs = await loadRegistrationsForEvent(ev.id);

    const listWrap = el('div');
    listWrap.appendChild(el('h4', { text: 'Registered participants' }));

    if (regs.length === 0) {
      listWrap.appendChild(el('div', {
        text: 'No registrations yet',
        class: 'placeholder'
      }));
      frame.appendChild(listWrap);
    } else {
      for (const r of regs) {
        let displayName = r.studentName || '';
        let phone = r.studentPhone || '';

        // fallback: read from users collection
        if (!displayName || !phone) {
          try {
            const uSnap = await getDoc(doc(db, 'users', r.studentUid));
            if (uSnap.exists()) {
              const ud = uSnap.data();
              if (!displayName) displayName = ud.name || '';
              if (!phone) phone = ud.phone || '';
            }
          } catch (err) {
            console.warn('Could not load user profile for', r.studentUid, err);
          }
        }

        displayName = displayName || 'Unknown';
        phone = phone || 'No phone';

        const row = el('div', { class: 'event' });
        const left = el('div');
        left.appendChild(el('div', {
          text: displayName,
          style: 'font-weight:600'
        }));
        left.appendChild(el('div', {
          text: phone,
          class: 'meta'
        }));

        const right = el('div');
        const initials = (displayName || 'ST')
          .split(' ')
          .map(s => s[0])
          .slice(0, 2)
          .join('')
          .toUpperCase();

        right.appendChild(el('div', {
          text: initials,
          class: 'avatar'
        }));

        row.appendChild(left);
        row.appendChild(right);
        listWrap.appendChild(row);
      }
      frame.appendChild(listWrap);
    }

    // message card
    const msgBox = el('div', { class: 'card' });
    msgBox.appendChild(el('h4', { text: 'Send message to participants' }));
    msgBox.appendChild(el('textarea', {
      id: 'evtMsgInput',
      rows: '4',
      class: 'txt'
    }));

    const sendBtn = el('button', {
      text: 'Send to participants',
      class: 'btn'
    });

    sendBtn.addEventListener('click', async () => {
      const input = document.getElementById('evtMsgInput');
      const text = (input.value || '').trim();
      if (!text) {
        showToast('Enter a message');
        return;
      }
      await sendMessageToParticipants(ev.id, text);
      input.value = '';
    });

    msgBox.appendChild(sendBtn);
    frame.appendChild(msgBox);
  }

  /* --- Auth listener: organizer only --- */
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = 'index.html';
      return;
    }

    currentUser = user;

    try {
      const userDocSnap = await getDoc(doc(db, 'users', user.uid));
      if (!userDocSnap.exists()) {
        showToast('User profile missing');
        return;
      }

      const data = userDocSnap.data();
      currentUserData = data;

      // allow only organizer or superadmin here
      if (data.role !== 'organizer' && data.role !== 'superadmin') {
        showToast('Not authorized for Organizer portal');
        return;
      }

      if (profileName) profileName.textContent = data.name || 'Organizer';
      if (profileRole) profileRole.textContent = data.role || 'Organizer';

      if (profileInitial) {
        profileInitial.textContent = (data.name || 'OR')
          .split(' ')
          .map(s => s[0])
          .slice(0, 2)
          .join('')
          .toUpperCase();
      }

      if (profileQuick) profileQuick.textContent = `UID: ${user.uid}`;

      // default view
      renderPanel('manage');

      // notification count demo: pending approvals (global)
      try {
        const q = query(collection(db, 'registrations'), where('status', '==', 'pending'));
        const snap = await getDocs(q);
        const pending = snap.size;
        if (pending > 0) {
          notifCount.textContent = pending;
          notifCount.classList.remove('hidden');
        } else {
          notifCount.classList.add('hidden');
        }
      } catch (e) {
        // ignore notification error
      }

    } catch (err) {
      console.error(err);
      showToast('Failed to load organizer profile');
    }
  });

  // ======= ripple & auto-attach helper =======
  (function attachRipples() {
    document.addEventListener('pointerdown', function (ev) {
      // Only main (left) click
      if (ev.button !== 0) return;

      const selector =
        '.organizer-page .btn, .organizer-page .action-btn, .organizer-page .tab-btn, ' +
        '.organizer-page .link-btn, .organizer-page .icon-btn, ' +
        '.btn, .action-btn, .tab-btn, .link-btn, .icon-btn';

      const btn = ev.target.closest(selector);
      if (!btn || btn.disabled) return;

      const rect = btn.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'ripple';

      const size = Math.max(rect.width, rect.height) * 0.9;
      ripple.style.width = ripple.style.height = size + 'px';

      const left = ev.clientX - rect.left - size / 2;
      const top = ev.clientY - rect.top - size / 2;
      ripple.style.left = left + 'px';
      ripple.style.top = top + 'px';

      btn.appendChild(ripple);
      setTimeout(() => {
        ripple.remove();
      }, 800);
    }, { passive: true });
  })();

} // end DOM guard
