import { auth, db, REGISTRATIONS_COL } from "./firebase.js";
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { onSnapshot, doc, getDoc, updateDoc, deleteDoc, collection, addDoc, serverTimestamp, query, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { generateQR } from "./qr.js";
import { MAX_QUOTA } from "./config.js";

let allStudents = [];
let filteredStudents = [];
let lostItems = [];
let html5QrcodeScanner = null;
let currentSelectedStudentForQr = null;
let unsubscribeListener = null;
let unsubscribeLostItemsListener = null;

const LOST_ITEMS_COL = collection(db, "lost_items");

document.addEventListener('DOMContentLoaded', () => {
    // Firebase Oturum Dinleyicisi
    onAuthStateChanged(auth, (user) => {
        const loginCard = document.getElementById('admin-login-card');
        const dashboard = document.getElementById('admin-dashboard');
        const logoutBtn = document.getElementById('adminLogoutBtn');

        if (user) {
            if (loginCard) loginCard.classList.add('d-none');
            if (dashboard) dashboard.classList.remove('d-none');
            if (logoutBtn) logoutBtn.classList.remove('d-none');
            setupRealtimeListener();
            setupLostItemsListener();
        } else {
            if (loginCard) loginCard.classList.remove('d-none');
            if (dashboard) dashboard.classList.add('d-none');
            if (logoutBtn) logoutBtn.classList.add('d-none');
            if (unsubscribeListener) {
                unsubscribeListener();
                unsubscribeListener = null;
            }
            if (unsubscribeLostItemsListener) {
                unsubscribeLostItemsListener();
                unsubscribeLostItemsListener = null;
            }
        }
    });

    setupAuthEvents();
    setupSearchAndFilterEvents();
    setupExcelExportEvent();
    setupEditFormEvent();
    setupQrModalActions();
    setupScannerEvents();
    setupLostItemFormEvent();
});

// Admin Giriş / Çıkış Olayları
function setupAuthEvents() {
    const loginForm = document.getElementById('adminLoginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = (document.getElementById('adminEmail')?.value || '').trim();
            const password = document.getElementById('adminPassword')?.value || '';

            if (!email || !password) {
                Swal.fire('Uyarı', 'Lütfen e-posta ve şifrenizi giriniz.', 'warning');
                return;
            }

            Swal.fire({ title: 'Giriş Yapılıyor...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

            try {
                await signInWithEmailAndPassword(auth, email, password);
                Swal.close();
            } catch (err) {
                console.error("Giriş hatası:", err);
                Swal.close();
                Swal.fire('Giriş Başarısız', 'E-posta adresi veya şifre hatalı.', 'error');
            }
        });
    }

    const logoutBtn = document.getElementById('adminLogoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await signOut(auth);
            } catch (err) {
                console.error("Çıkış hatası:", err);
            }
        });
    }
}

// Canlı Firestore Veri Dinleyicisi (Öğrenciler)
function setupRealtimeListener() {
    if (unsubscribeListener) unsubscribeListener();

    unsubscribeListener = onSnapshot(REGISTRATIONS_COL, (snapshot) => {
        allStudents = snapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data()
        }));

        processAndRenderData();
        populateStudentSelectForLostItem();
    }, (error) => {
        console.error("Firestore okuma hatası:", error);
        const tbody = document.getElementById('studentTableBody');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="12" class="text-center text-danger py-4">Veriler yüklenirken yetki hatası oluştu. Lütfen tekrar giriş yapınız.</td></tr>`;
        }
    });
}

// Kayıp Eşya Verilerini Dinleme
function setupLostItemsListener() {
    if (unsubscribeLostItemsListener) unsubscribeLostItemsListener();

    const q = query(LOST_ITEMS_COL, orderBy("createdAt", "desc"));
    unsubscribeLostItemsListener = onSnapshot(q, (snapshot) => {
        lostItems = snapshot.docs.map(docSnap => ({
            id: docSnap.id,
            ...docSnap.data()
        }));
        renderLostItemsTable();
    }, (error) => {
        console.error("Kayıp eşya okuma hatası:", error);
    });
}

// Kayıp Eşya Formunda Öğrenci Seçim Listesini Doldurma
function populateStudentSelectForLostItem() {
    const selectEl = document.getElementById('lostStudentSelect');
    if (!selectEl) return;

    let optionsHtml = '<option value="">-- Öğrenci Seçiniz (Opsiyonel / Genel) --</option>';
    allStudents.forEach(s => {
        optionsHtml += `<option value="${s.id}">${s.registerNumber || 'TYO'} - ${s.name} ${s.surname} (${s.phone || 'Tel yok'})</option>`;
    });
    selectEl.innerHTML = optionsHtml;
}

// Kayıp Eşya Bildirimi Kaydetme Olayı
function setupLostItemFormEvent() {
    const form = document.getElementById('lostItemForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const currentUser = auth.currentUser;
        if (!currentUser) {
            Swal.fire('Hata', 'Oturum açmış yönetici bulunamadı.', 'error');
            return;
        }

        const studentId = document.getElementById('lostStudentSelect').value;
        const itemName = document.getElementById('lostItemName').value.trim();
        const itemCategory = document.getElementById('lostItemCategory').value;
        const itemLocation = document.getElementById('lostItemLocation').value.trim();
        const itemDescription = document.getElementById('lostItemDescription').value.trim();
        const itemStatus = document.getElementById('lostItemStatus').value;

        let selectedStudentData = null;
        if (studentId) {
            const found = allStudents.find(s => s.id === studentId);
            if (found) {
                selectedStudentData = {
                    id: found.id,
                    registerNumber: found.registerNumber || '',
                    fullName: `${found.name} ${found.surname}`,
                    phone: found.phone || '',
                    seatNumber: found.seatNumber || 'Atanmadı'
                };
            }
        }

        const payload = {
            student: selectedStudentData,
            itemName,
            category: itemCategory,
            location: itemLocation,
            description: itemDescription,
            status: itemStatus,
            adminEmail: currentUser.email || 'Bilinmiyor',
            adminUid: currentUser.uid,
            createdAt: serverTimestamp()
        };

        Swal.fire({ title: 'Kaydediliyor...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

        try {
            await addDoc(LOST_ITEMS_COL, payload);
            Swal.close();
            form.reset();
            Swal.fire({
                icon: 'success',
                title: 'Bildiri Oluşturuldu',
                text: 'Kayıp eşya bildirimi başarıyla kaydedildi ve yönetici bilgileri işlendi.',
                timer: 2000,
                showConfirmButton: false
            });
        } catch (err) {
            console.error("Kayıp eşya ekleme hatası:", err);
            Swal.close();
            Swal.fire('Hata', 'Kayıt eklenirken bir hata oluştu.', 'error');
        }
    });
}

// Kayıp Eşyaları Tabloda Listeleme
function renderLostItemsTable() {
    const tbody = document.getElementById('lostItemsTableBody');
    const badgeEl = document.getElementById('lostItemsCountBadge');
    if (!tbody) return;

    if (badgeEl) badgeEl.innerText = `${lostItems.length} Bildiri`;

    if (lostItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-4 text-muted">
                    <i class="fa-solid fa-box-open fa-2xl mb-2 d-block opacity-50"></i>
                    Henüz kayıtlı kayıp eşya bildirimi bulunmuyor.
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    lostItems.forEach((item, index) => {
        let dateStr = 'Tarih yok';
        if (item.createdAt && item.createdAt.toDate) {
            dateStr = item.createdAt.toDate().toLocaleString('tr-TR');
        }

        let studentInfo = '<span class="text-muted small">Genel / Sahipsiz Eşya</span>';
        if (item.student) {
            studentInfo = `
                <div class="fw-bold text-dark">${item.student.fullName}</div>
                <div class="small text-muted font-monospace">${item.student.registerNumber} | Koltuk: ${item.student.seatNumber}</div>
            `;
        }

        let statusBadge = '<span class="badge bg-warning text-dark">Aranıyor</span>';
        if (item.status === 'bulundu') {
            statusBadge = '<span class="badge bg-success">Bulundu / Teslim Edildi</span>';
        } else if (item.status === 'arsiv') {
            statusBadge = '<span class="badge bg-secondary">Arşivlendi</span>';
        }

        html += `
            <tr>
                <td class="text-center fw-bold text-muted small">${index + 1}</td>
                <td>${studentInfo}</td>
                <td>
                    <div class="fw-bold text-dark">${item.itemName}</div>
                    <div class="small text-muted">${item.category}</div>
                </td>
                <td class="small">${item.location || '-'}</td>
                <td class="small text-truncate" style="max-width: 150px;" title="${item.description || ''}">${item.description || '-'}</td>
                <td>${statusBadge}</td>
                <td class="small">
                    <div class="fw-semibold text-primary"><i class="fa-solid fa-user-shield me-1"></i>${item.adminEmail}</div>
                    <div class="text-muted" style="font-size: 0.75rem;">${dateStr}</div>
                </td>
                <td class="text-center">
                    <div class="btn-group btn-group-sm">
                        <button class="btn btn-outline-danger delete-lost-btn" data-id="${item.id}" title="Bildirimi Sil">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;

    tbody.querySelectorAll('.delete-lost-btn').forEach(btn => {
        btn.addEventListener('click', () => confirmDeleteLostItem(btn.dataset.id));
    });
}

async function confirmDeleteLostItem(itemId) {
    Swal.fire({
        title: 'Bildirimi Sil?',
        text: 'Bu kayıp eşya bildirimi kalıcı olarak silinecektir!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Evet, Sil!',
        cancelButtonText: 'Vazgeç'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                await deleteDoc(doc(db, "lost_items", itemId));
                Swal.fire('Silindi!', 'Bildiri kaldırıldı.', 'success');
            } catch (err) {
                Swal.fire('Hata!', 'Silme işlemi başarısız oldu.', 'error');
            }
        }
    });
}

// Arama, Sıralama ve Filtre Dinleyicileri
function setupSearchAndFilterEvents() {
    const searchInput = document.getElementById('searchInput');
    const sortSelect = document.getElementById('sortSelect');
    const seatFilterSelect = document.getElementById('seatFilterSelect');

    if (searchInput) {
        searchInput.addEventListener('input', () => {
            processAndRenderData();
        });
    }
    if (sortSelect) sortSelect.addEventListener('change', processAndRenderData);
    if (seatFilterSelect) seatFilterSelect.addEventListener('change', processAndRenderData);
}

function getEffectiveGroupKey(student) {
    if (student.familyGroup && student.familyGroup.trim() !== '') {
        return student.familyGroup.trim().toUpperCase('tr');
    }
    return (student.surname || '').trim().toUpperCase('tr');
}

function processAndRenderData() {
    let result = [...allStudents];

    const searchInput = document.getElementById('searchInput');
    const searchTerm = (searchInput?.value || '').trim().toLowerCase('tr');

    if (searchTerm) {
        result = result.filter(s => 
            (s.name || '').toLowerCase('tr').includes(searchTerm) ||
            (s.surname || '').toLowerCase('tr').includes(searchTerm) ||
            (s.tc || '').includes(searchTerm) ||
            (s.phone || '').includes(searchTerm) ||
            (s.registerNumber || '').toLowerCase('tr').includes(searchTerm) ||
            (s.seatNumber || '').toLowerCase('tr').includes(searchTerm) ||
            (s.parentName || '').toLowerCase('tr').includes(searchTerm) ||
            (s.parentPhone || '').includes(searchTerm) ||
            (s.familyGroup || '').toLowerCase('tr').includes(searchTerm)
        );
    }

    const seatFilterVal = document.getElementById('seatFilterSelect')?.value || 'all';
    if (seatFilterVal === 'seated') {
        result = result.filter(s => s.seatNumber && s.seatNumber.trim() !== '');
    } else if (seatFilterVal === 'unseated') {
        result = result.filter(s => !s.seatNumber || s.seatNumber.trim() === '');
    }

    const groupCounts = {};
    allStudents.forEach(s => {
        const key = getEffectiveGroupKey(s);
        if (key) {
            groupCounts[key] = (groupCounts[key] || 0) + 1;
        }
    });

    const sortVal = document.getElementById('sortSelect')?.value || 'family';
    
    result.sort((a, b) => {
        if (sortVal === 'family' || sortVal === 'surname') {
            const keyA = getEffectiveGroupKey(a);
            const keyB = getEffectiveGroupKey(b);
            const groupComp = keyA.localeCompare(keyB, 'tr', { sensitivity: 'base' });
            if (groupComp !== 0) return groupComp;
            return (a.name || '').localeCompare(b.name || '', 'tr', { sensitivity: 'base' });
        } else if (sortVal === 'custom') {
            const orderA = typeof a.displayOrder === 'number' ? a.displayOrder : 999999;
            const orderB = typeof b.displayOrder === 'number' ? b.displayOrder : 999999;
            return orderA - orderB;
        } else if (sortVal === 'name') {
            return (a.name || '').localeCompare(b.name || '', 'tr', { sensitivity: 'base' });
        } else if (sortVal === 'registerNumber') {
            return (a.registerNumber || '').localeCompare(b.registerNumber || '');
        } else if (sortVal === 'seatNumber') {
            return (a.seatNumber || 'ZZZ').localeCompare(b.seatNumber || 'ZZZ');
        }
        return 0;
    });

    filteredStudents = result;

    updateStats(groupCounts);
    renderTable(filteredStudents, groupCounts);
}

function updateStats(groupCounts) {
    const totalEl = document.getElementById('stat-total');
    const familiesEl = document.getElementById('stat-families');
    const seatedEl = document.getElementById('stat-seated');
    const unseatedEl = document.getElementById('stat-unseated');
    const minorsEl = document.getElementById('stat-minors');
    const remainingEl = document.getElementById('stat-remaining');
    const badgeEl = document.getElementById('listCountBadge');

    const totalCount = allStudents.length;
    const groupCount = Object.values(groupCounts).filter(count => count > 1).length;
    const seatedCount = allStudents.filter(s => s.seatNumber && s.seatNumber.trim() !== '').length;
    const unseatedCount = totalCount - seatedCount;
    const minorCount = allStudents.filter(s => (s.age || 0) < 18).length;
    const remaining = Math.max(0, MAX_QUOTA - totalCount);

    if (totalEl) totalEl.innerText = totalCount;
    if (familiesEl) familiesEl.innerText = `${groupCount} Grup / Aile`;
    if (seatedEl) seatedEl.innerText = seatedCount;
    if (unseatedEl) unseatedEl.innerText = unseatedCount;
    if (minorsEl) minorsEl.innerText = minorCount;
    if (remainingEl) remainingEl.innerText = `${remaining} / ${MAX_QUOTA}`;
    if (badgeEl) badgeEl.innerText = `${filteredStudents.length} Kayıt Gösteriliyor`;
}

function renderTable(students, groupCounts) {
    const tbody = document.getElementById('studentTableBody');
    if (!tbody) return;

    if (students.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="12" class="text-center py-5 text-muted">
                    <i class="fa-solid fa-folder-open fa-2xl mb-3 d-block opacity-50"></i>
                    Aranan kriterlere uygun öğrenci bulunamadı.
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    students.forEach((student, index) => {
        const groupKey = getEffectiveGroupKey(student);
        const countInGroup = groupCounts[groupKey] || 0;
        const isGrouped = countInGroup > 1;

        const rowClass = isGrouped ? 'same-family-row' : '';
        const badgeHtml = isGrouped 
            ? `<span class="badge bg-primary-subtle text-primary border border-primary-subtle family-badge ms-1" title="Aynı grupta ${countInGroup} kişi var">
                <i class="fa-solid fa-people-roof me-1"></i>Grup (${countInGroup})
               </span>`
            : '';

        const hasSeat = student.seatNumber && student.seatNumber.trim() !== '';
        const seatHtml = hasSeat
            ? `<span class="badge seat-badge-assigned fs-6 px-2 py-1"><i class="fa-solid fa-chair me-1"></i>${student.seatNumber}</span>`
            : `<button class="btn btn-sm btn-outline-warning text-dark py-0 px-2 quick-seat-btn" data-id="${student.id}"><i class="fa-solid fa-plus me-1"></i>Koltuk Ver</button>`;

        const familyLabel = student.familyGroup && student.familyGroup.trim() !== ''
            ? `<span class="badge bg-info-subtle text-dark border border-info fw-semibold"><i class="fa-solid fa-link me-1"></i>${student.familyGroup}</span>`
            : `<span class="text-muted small">${student.surname || ''} Ailesi</span>`;

        const parentInfoHtml = (student.parentName || student.parentPhone) 
            ? `<div class="fw-bold text-dark"><i class="fa-solid fa-user-shield me-1 text-success"></i>${student.parentName || '-'}</div><div class="small"><a href="tel:${student.parentPhone}" class="text-decoration-none text-muted">${student.parentPhone || '-'}</a></div>`
            : `<span class="text-muted small">-</span>`;

        const schoolInfoHtml = (student.school || student.className)
            ? `<div>${student.school || '-'}</div><span class="badge bg-light text-dark border">Sınıf: ${student.className || '-'}</span>`
            : `<span class="text-muted small">-</span>`;

        html += `
            <tr class="${rowClass}">
                <td class="text-center fw-bold text-muted small">${index + 1}</td>
                <td>
                    <span class="badge bg-light text-dark border font-monospace fs-6">
                        ${student.registerNumber || 'TYO-0000'}
                    </span>
                </td>
                <td>
                    <div class="fw-bold text-dark">${student.name || ''} <span class="text-primary">${student.surname || ''}</span></div>
                    ${badgeHtml}
                </td>
                <td>${seatHtml}</td>
                <td class="font-monospace text-muted small">${student.tc || '-'}</td>
                <td class="small"><a href="tel:${student.phone}" class="text-decoration-none text-dark fw-semibold">${student.phone || '-'}</a></td>
                <td class="small">${student.birthDate || '-'} <br><span class="badge bg-secondary-subtle text-dark">${student.age || '-'} Yaş / ${student.gender || '-'}</span></td>
                <td class="small text-truncate" style="max-width: 130px;" title="${student.neighborhood || ''} Mah. ${student.district || ''}">
                    ${student.district || '-'}${student.neighborhood ? ' / ' + student.neighborhood : ''}
                </td>
                <td class="small">${schoolInfoHtml}</td>
                <td class="bg-light-subtle">${parentInfoHtml}</td>
                <td>
                    ${familyLabel}
                    <button class="btn btn-link btn-sm p-0 ms-1 text-decoration-none join-group-btn" data-id="${student.id}" data-surname="${student.surname}" title="Gruba Bağla / Değiştir">
                        <i class="fa-solid fa-pen-to-square text-muted"></i>
                    </button>
                </td>
                <td class="text-center">
                    <div class="d-inline-flex align-items-center gap-1">
                        <div class="reorder-btn-group me-1">
                            <button class="btn btn-outline-secondary move-up-btn" data-index="${index}" title="Yukarı Taşı">▲</button>
                            <button class="btn btn-outline-secondary move-down-btn" data-index="${index}" title="Aşağı Taşı">▼</button>
                        </div>
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-outline-dark qr-btn" data-id="${student.id}" title="QR Kod & İndir">
                                <i class="fa-solid fa-qrcode"></i>
                            </button>
                            <button class="btn btn-outline-primary edit-btn" data-id="${student.id}" title="Düzenle / Koltuk & Grup Ver">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button class="btn btn-outline-danger delete-btn" data-id="${student.id}" data-name="${student.name} ${student.surname}" title="Kaydı Sil">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </div>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;

    tbody.querySelectorAll('.move-up-btn').forEach(btn => {
        btn.addEventListener('click', () => moveStudentOrder(parseInt(btn.dataset.index), -1));
    });

    tbody.querySelectorAll('.move-down-btn').forEach(btn => {
        btn.addEventListener('click', () => moveStudentOrder(parseInt(btn.dataset.index), 1));
    });

    tbody.querySelectorAll('.join-group-btn').forEach(btn => {
        btn.addEventListener('click', () => promptJoinGroup(btn.dataset.id, btn.dataset.surname));
    });

    tbody.querySelectorAll('.qr-btn').forEach(btn => {
        btn.addEventListener('click', () => openQrModal(btn.dataset.id));
    });

    tbody.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });

    tbody.querySelectorAll('.quick-seat-btn').forEach(btn => {
        btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });

    tbody.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', () => confirmDeleteStudent(btn.dataset.id, btn.dataset.name));
    });
}

async function promptJoinGroup(studentId, defaultSurname) {
    const student = allStudents.find(s => s.id === studentId);
    if (!student) return;

    const { value: groupName } = await Swal.fire({
        title: 'Aile / Grup Birleştirme',
        text: `"${student.name} ${student.surname}" kişisini başka bir soyada veya aileye bağlamak için grup adı yazınız (Örn: "Aslan Ailesi"):`,
        input: 'text',
        inputValue: student.familyGroup || `${student.surname} Ailesi`,
        showCancelButton: true,
        confirmButtonText: 'Kaydet ve Birleştir',
        cancelButtonText: 'İptal',
        inputValidator: (val) => {
            if (!val || !val.trim()) return 'Lütfen geçerli bir grup ismi giriniz!';
        }
    });

    if (groupName) {
        try {
            await updateDoc(doc(REGISTRATIONS_COL, studentId), {
                familyGroup: groupName.trim()
            });
            Swal.fire({ icon: 'success', title: 'Birleştirildi', text: 'Kişi gruba bağlandı.', timer: 1500, showConfirmButton: false });
        } catch (err) {
            console.error(err);
            Swal.fire('Hata', 'Grup güncellenemedi.', 'error');
        }
    }
}

async function moveStudentOrder(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= filteredStudents.length) return;

    const sortSelect = document.getElementById('sortSelect');
    if (sortSelect) sortSelect.value = 'custom';

    const currentStudent = filteredStudents[index];
    const targetStudent = filteredStudents[targetIndex];

    filteredStudents[index] = targetStudent;
    filteredStudents[targetIndex] = currentStudent;

    filteredStudents.forEach((s, idx) => {
        s.displayOrder = idx;
    });

    const groupCounts = {};
    allStudents.forEach(s => {
        const key = getEffectiveGroupKey(s);
        if (key) groupCounts[key] = (groupCounts[key] || 0) + 1;
    });
    renderTable(filteredStudents, groupCounts);

    try {
        await Promise.all([
            updateDoc(doc(REGISTRATIONS_COL, currentStudent.id), { displayOrder: targetIndex }),
            updateDoc(doc(REGISTRATIONS_COL, targetStudent.id), { displayOrder: index })
        ]);
    } catch (err) {
        console.error("Sıra kaydedilemedi:", err);
    }
}

function openEditModal(studentId) {
    const student = allStudents.find(s => s.id === studentId);
    if (!student) return;

    document.getElementById('editStudentId').value = student.id;
    document.getElementById('editRegisterNumber').value = student.registerNumber || '';
    document.getElementById('editSeatNumber').value = student.seatNumber || '';
    document.getElementById('editFamilyGroup').value = student.familyGroup || '';
    document.getElementById('editTc').value = student.tc || '';
    document.getElementById('editName').value = student.name || '';
    document.getElementById('editSurname').value = student.surname || '';
    document.getElementById('editPhone').value = student.phone || '';
    document.getElementById('editGender').value = student.gender || 'Erkek';
    document.getElementById('editDistrict').value = student.district || '';
    document.getElementById('editNeighborhood').value = student.neighborhood || '';
    document.getElementById('editAddress').value = student.address || '';
    document.getElementById('editSchool').value = student.school || '';
    document.getElementById('editClassName').value = student.className || '';
    document.getElementById('editParentName').value = student.parentName || '';
    document.getElementById('editParentPhone').value = student.parentPhone || '';

    const bsModal = new bootstrap.Modal(document.getElementById('editModal'));
    bsModal.show();
}

function setupEditFormEvent() {
    const saveBtn = document.getElementById('saveEditBtn');
    if (!saveBtn) return;

    saveBtn.addEventListener('click', async () => {
        const studentId = document.getElementById('editStudentId').value;
        if (!studentId) return;

        const docRef = doc(REGISTRATIONS_COL, studentId);
        const updatePayload = {
            seatNumber: (document.getElementById('editSeatNumber').value || '').trim(),
            familyGroup: (document.getElementById('editFamilyGroup').value || '').trim(),
            tc: (document.getElementById('editTc').value || '').trim(),
            name: (document.getElementById('editName').value || '').trim(),
            surname: (document.getElementById('editSurname').value || '').trim(),
            phone: (document.getElementById('editPhone').value || '').trim(),
            gender: document.getElementById('editGender').value,
            district: (document.getElementById('editDistrict').value || '').trim(),
            neighborhood: (document.getElementById('editNeighborhood').value || '').trim(),
            address: (document.getElementById('editAddress').value || '').trim(),
            school: (document.getElementById('editSchool').value || '').trim(),
            className: (document.getElementById('editClassName').value || '').trim(),
            parentName: (document.getElementById('editParentName').value || '').trim(),
            parentPhone: (document.getElementById('editParentPhone').value || '').trim()
        };

        try {
            await updateDoc(docRef, updatePayload);
            const modalEl = document.getElementById('editModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();

            Swal.fire({
                icon: 'success',
                title: 'Güncellendi',
                text: 'Kayıt, koltuk ve aile/grup bilgisi kaydedildi.',
                timer: 1800,
                showConfirmButton: false
            });
        } catch (err) {
            console.error("Güncelleme hatası:", err);
            Swal.fire('Hata', 'Kayıt güncellenirken bir hata oluştu.', 'error');
        }
    });
}

async function openQrModal(studentId) {
    const student = allStudents.find(s => s.id === studentId);
    if (!student) return;

    currentSelectedStudentForQr = student;

    document.getElementById('qrModalTitle').innerHTML = `<i class="fa-solid fa-qrcode me-2"></i>${student.registerNumber} - QR Kod`;
    
    await generateQR('modalQrCode', student.id);

    document.getElementById('qrStudentDetails').innerHTML = `
        <div class="row g-2">
            <div class="col-6"><strong>Ad Soyad:</strong> ${student.name} ${student.surname}</div>
            <div class="col-6"><strong>Koltuk No:</strong> <span class="text-primary fw-bold">${student.seatNumber || 'Atanmadı'}</span></div>
            <div class="col-6"><strong>TC Kimlik:</strong> ${student.tc}</div>
            <div class="col-6"><strong>Telefon:</strong> ${student.phone}</div>
            <div class="col-12"><strong>Ait Olduğu Grup:</strong> ${student.familyGroup || student.surname + ' Ailesi'}</div>
            <div class="col-12"><strong>Veli Bilgisi:</strong> ${student.parentName || '-'} (${student.parentPhone || '-'})</div>
            <div class="col-12"><strong>Adres:</strong> ${student.neighborhood || ''} Mah. ${student.district || ''}</div>
        </div>
    `;

    const bsModal = new bootstrap.Modal(document.getElementById('qrModal'));
    bsModal.show();
}

function setupQrModalActions() {
    const downloadBtn = document.getElementById('downloadQrBtn');
    const printBtn = document.getElementById('printQrBtn');

    if (downloadBtn) {
        downloadBtn.addEventListener('click', () => {
            const qrCanvas = document.querySelector('#modalQrCode canvas');
            const qrImg = document.querySelector('#modalQrCode img');
            let dataUrl = '';

            if (qrCanvas) dataUrl = qrCanvas.toDataURL("image/png");
            else if (qrImg && qrImg.src) dataUrl = qrImg.src;

            if (dataUrl && currentSelectedStudentForQr) {
                const a = document.createElement('a');
                a.href = dataUrl;
                a.download = `QR_${currentSelectedStudentForQr.registerNumber}_${currentSelectedStudentForQr.name}_${currentSelectedStudentForQr.surname}.png`;
                a.click();
            } else {
                Swal.fire('Hata', 'QR resim verisi alınamadı.', 'error');
            }
        });
    }

    if (printBtn) {
        printBtn.addEventListener('click', () => {
            window.print();
        });
    }
}

function setupScannerEvents() {
    const qrScanModalEl = document.getElementById('qrScanModal');
    if (!qrScanModalEl) return;

    qrScanModalEl.addEventListener('shown.bs.modal', () => {
        if (html5QrcodeScanner) return;

        html5QrcodeScanner = new Html5QrcodeScanner("reader", { 
            fps: 10, 
            qrbox: { width: 250, height: 250 } 
        });

        html5QrcodeScanner.render(async (decodedText) => {
            try {
                const parsed = JSON.parse(decodedText);
                if (parsed && parsed.id) {
                    if (html5QrcodeScanner) {
                        html5QrcodeScanner.clear().catch(e => console.error(e));
                        html5QrcodeScanner = null;
                    }

                    const modal = bootstrap.Modal.getInstance(qrScanModalEl);
                    if (modal) modal.hide();

                    const docSnap = await getDoc(doc(REGISTRATIONS_COL, parsed.id));
                    if (docSnap.exists()) {
                        openQrModal(docSnap.id);
                    } else {
                        Swal.fire('Bulunamadı', 'Okutulan QR koda ait öğrenci kaydı bulunamadı.', 'warning');
                    }
                }
            } catch (err) {
                Swal.fire('Geçersiz QR', 'Okutulan QR kod bu sisteme ait değil.', 'error');
            }
        });
    });

    qrScanModalEl.addEventListener('hidden.bs.modal', () => {
        if (html5QrcodeScanner) {
            html5QrcodeScanner.clear().catch(e => console.error(e));
            html5QrcodeScanner = null;
        }
    });
}

function confirmDeleteStudent(studentId, fullName) {
    Swal.fire({
        title: 'Silmek İstiyor musunuz?',
        text: `"${fullName}" öğrencisinin kaydı kalıcı olarak silinecektir!`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Evet, Sil!',
        cancelButtonText: 'Vazgeç'
    }).then(async (result) => {
        if (result.isConfirmed) {
            try {
                await deleteDoc(doc(REGISTRATIONS_COL, studentId));
                Swal.fire('Silindi!', 'Kayıt silindi.', 'success');
            } catch (err) {
                Swal.fire('Hata!', 'Silme işlemi başarısız oldu.', 'error');
            }
        }
    });
}

function setupExcelExportEvent() {
    const exportBtn = document.getElementById('exportExcelBtn');
    if (!exportBtn) return;

    exportBtn.addEventListener('click', () => {
        if (filteredStudents.length === 0) {
            Swal.fire('Uyarı', 'İndirilecek kayıt bulunamadı.', 'warning');
            return;
        }

        const excelRows = filteredStudents.map((s, index) => ({
            "Sıra No": index + 1,
            "Aile / Birleştirilmiş Grup": s.familyGroup || `${s.surname} Ailesi`,
            "Kayıt No": s.registerNumber || '',
            "Koltuk No": s.seatNumber || 'Atanmadı',
            "Soyadı": (s.surname || '').toUpperCase('tr'),
            "Adı": s.name || '',
            "TC Kimlik No": s.tc || '',
            "Telefon": s.phone || '',
            "Veli Ad Soyad": s.parentName || '-',
            "Veli Telefon": s.parentPhone || '-',
            "Doğum Tarihi": s.birthDate || '',
            "Yaş": s.age || '',
            "Cinsiyet": s.gender || '',
            "İlçe": s.district || '',
            "Mahalle": s.neighborhood || '',
            "Açık Adres": s.address || '',
            "Okul Adı": s.school || '-',
            "Sınıf": s.className || '-'
        }));

        const worksheet = XLSX.utils.json_to_sheet(excelRows);

        worksheet['!cols'] = [
            { wch: 8 },  { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 16 },
            { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 20 }, { wch: 14 },
            { wch: 14 }, { wch: 6 },  { wch: 10 }, { wch: 14 }, { wch: 20 },
            { wch: 35 }, { wch: 28 }, { wch: 12 }
        ];

        worksheet['!printHeader'] = [1, 1];
        if (!worksheet['!views']) worksheet['!views'] = [{}];
        worksheet['!views'][0].showGridLines = true;

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Kayit_Listesi");

        const today = new Date().toISOString().split('T')[0];
        XLSX.writeFile(workbook, `TUGVA_Yaz_Okulu_Kayıtlar_${today}.xlsx`);

        Swal.fire({
            icon: 'success',
            title: 'Excel İndirildi',
            text: `Kılavuz çizgileri ve kenarlıkları ayarlanmış olarak indirildi.`,
            timer: 2000,
            showConfirmButton: false
        });
    });
}

