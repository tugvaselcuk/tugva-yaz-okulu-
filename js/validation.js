export const notify = {
    success: (msg) => Swal.fire({ icon: 'success', title: 'Başarılı', text: msg, confirmButtonColor: '#004b87' }),
    error: (msg) => Swal.fire({ icon: 'error', title: 'Hata', text: msg, confirmButtonColor: '#004b87' }),
    info: (msg) => Swal.fire({ icon: 'info', title: 'Bilgi', text: msg, confirmButtonColor: '#004b87' })
};

export function cleanDoubleSpaces(str) {
    return (str || '').replace(/\s+/g, ' ').trim();
}

export function formatName(str) {
    str = cleanDoubleSpaces(str);
    return str.split(' ').map(w => w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1).toLocaleLowerCase('tr-TR')).join(' ');
}

export function calculateAge(birthDateStr) {
    if (!birthDateStr) return 0;
    const birthDate = new Date(birthDateStr);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
}
