export function downloadRegistrationPDF(data) {
    if (!data) return;
    const { jsPDF } = window.jspdf;
    const docPdf = new jsPDF();

    docPdf.setFontSize(18);
    docPdf.text("TUGVA Yaz Okulu Kayit Belgesi", 14, 20);

    docPdf.setFontSize(11);
    docPdf.text(`Kayit Numarasi: ${data.registerNumber}`, 14, 32);
    docPdf.text(`Ad Soyad: ${data.name} ${data.surname}`, 14, 40);
    docPdf.text(`TC Kimlik No: ${data.tc}`, 14, 48);
    docPdf.text(`Telefon: ${data.phone}`, 14, 56);
    docPdf.text(`Dogum Tarihi / Yas: ${data.birthDate} (${data.age})`, 14, 64);
    docPdf.text(`Ilce / Mahalle: ${data.district} / ${data.neighborhood}`, 14, 72);
    docPdf.text(`Adres: ${data.address}`, 14, 80);

    if (data.age < 18) {
        docPdf.text(`Okul / Sinif: ${data.school} - ${data.className}`, 14, 88);
        docPdf.text(`Veli Ad / Tel: ${data.parentName} - ${data.parentPhone}`, 14, 96);
        docPdf.text(`Koltuk Numarasi: ${data.seatNumber || 'Atanmadi'}`, 14, 104);
    } else {
        docPdf.text(`Koltuk Numarasi: ${data.seatNumber || 'Atanmadi'}`, 14, 88);
    }

    docPdf.save(`TUGVA_Kayit_${data.registerNumber}.pdf`);
}
