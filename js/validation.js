import { cleanDoubleSpaces } from "./utils.js";

export function validateTC(tc) {
    tc = String(tc).trim();
    if (!/^[1-9]\d{10}$/.test(tc)) return false;
    let digits = tc.split('').map(Number);
    let d10 = ((digits[0] + digits[2] + digits[4] + digits[6] + digits[8]) * 7 - (digits[1] + digits[3] + digits[5] + digits[7])) % 10;
    let d11 = (digits.slice(0, 10).reduce((a, b) => a + b, 0)) % 10;
    return digits[9] === d10 && digits[10] === d11;
}

export function validatePhone(phone) {
    phone = cleanDoubleSpaces(phone);
    return /^05\d{9}$/.test(phone);
}
