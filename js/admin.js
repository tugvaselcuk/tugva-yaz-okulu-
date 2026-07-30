// Excel Dışa Aktarma (Ekrandaki Aile/Manuel Sıraya Birebir Sadık Kalınarak)
function setupExcelExportEvent() {
    const exportBtn = document.getElementById('exportExcelBtn');
    if (!exportBtn) return;

    exportBtn.addEventListener('click', () => {
        if (filteredStudents.length === 0) {
            Swal.fire('Uyarı', 'İndirilecek kayıt bulunamadı.', 'warning');
            return;
        }

        // Ekrandaki güncel sırayı cinsiyet ayırmadan birebir doğrudan aktar
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
            { wch: 8 },  // Sıra No
            { wch: 22 }, // Aile / Birleştirilmiş Grup
            { wch: 12 }, // Kayıt No
            { wch: 12 }, // Koltuk No
            { wch: 16 }, // Soyadı
            { wch: 18 }, // Adı
            { wch: 16 }, // TC Kimlik No
            { wch: 14 }, // Telefon
            { wch: 20 }, // Veli Ad Soyad
            { wch: 14 }, // Veli Telefon
            { wch: 14 }, // Doğum Tarihi
            { wch: 6 },  // Yaş
            { wch: 10 }, // Cinsiyet
            { wch: 14 }, // İlçe
            { wch: 20 }, // Mahalle
            { wch: 35 }, // Açık Adres
            { wch: 28 }, // Okul Adı
            { wch: 12 }  // Sınıf
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Kayit_Listesi");

        const today = new Date().toISOString().split('T')[0];
        XLSX.writeFile(workbook, `TUGVA_Yaz_Okulu_Kayıtlar_${today}.xlsx`);

        Swal.fire({
            icon: 'success',
            title: 'Excel İndirildi',
            text: `${filteredStudents.length} kayıt ekrandaki aile ve grup sıralamasıyla indirildi.`,
            timer: 2000,
            showConfirmButton: false
        });
    });
}

