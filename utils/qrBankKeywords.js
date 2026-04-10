/**
 * Nhãn đa ngôn ngữ (VI/EN/ZH) → trường nội bộ cho parser QR / chuyển khoản.
 * Key chuẩn hóa: trim, lowercase ASCII, gộp khoảng trắng (CJK giữ nguyên).
 */

const normalizeLabelKey = (raw) =>
  String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

/** @type {Map<string, 'account'|'bank'|'name'|'amount'|'note'>} */
const LABEL_TO_FIELD = new Map();

function register(field, labels) {
  for (const label of labels) {
    const k = normalizeLabelKey(label);
    if (k && !LABEL_TO_FIELD.has(k)) {
      LABEL_TO_FIELD.set(k, field);
    }
  }
}

register('account', [
  '账号',
  '帐号',
  '卡号',
  'stk',
  'số tk',
  'so tk',
  'số tài khoản',
  'so tai khoan',
  'account',
  'account number',
  'acct',
  'acc no',
  'acc no.',
  'số tk ck',
  'so tk ck',
  'card no',
  'card number',
  'số thẻ',
  'so the'
]);

register('bank', [
  '银行名称',
  '银行',
  'ngân hàng',
  'ten ngan hang',
  'bank',
  'tên ngân hàng',
  'nh',
  'tên nh',
  'ten nh'
]);

register('name', [
  '持卡人姓名',
  '提款姓名',
  '名字',
  '姓名',
  'tên chủ thẻ',
  'ten chu the',
  'tên chủ tk',
  'ten chu tk',
  'tên chủ tài khoản',
  'ten chu tai khoan',
  'tên',
  'ten',
  'chủ tk',
  'chu tk',
  'account name',
  'holder',
  'cardholder',
  'name',
  'beneficiary',
  'người thụ hưởng',
  'nguoi thu huong'
]);

register('amount', [
  '金额',
  'số tiền',
  'so tien',
  'amount',
  'số tiền ck',
  'so tien ck',
  'số tiền chuyển',
  'so tien chuyen',
  'money'
]);

register('note', [
  '备注',
  'ghi chú',
  'ghi chu',
  'note',
  'memo',
  'nội dung ck',
  'noi dung ck',
  'nội dung chuyển khoản',
  'noi dung chuyen khoan',
  'nội dung',
  'noi dung',
  'nội dung thanh toán',
  'noi dung thanh toan',
  'reference',
  'ref'
]);

/**
 * @param {string} rawKey — phần trước dấu : hoặc ：
 * @returns {'account'|'bank'|'name'|'amount'|'note'|null}
 */
const matchLabelToField = (rawKey) => {
  const k = normalizeLabelKey(rawKey);
  return LABEL_TO_FIELD.get(k) || null;
};

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Thứ tự dài → ngắn để khớp "số tài khoản" trước "stk". */
const sortedLabelKeys = () =>
  [...LABEL_TO_FIELD.keys()].sort((a, b) => b.length - a.length);

/**
 * Dòng dạng `stk 2349785`, `ten Ha van tien` (không có dấu :).
 * @returns {{ field: string, value: string } | null}
 */
const matchSpaceSeparatedLine = (line) => {
  const trimmed = String(line || '').trim();
  if (!trimmed || /[:：]/.test(trimmed)) return null;
  for (const key of sortedLabelKeys()) {
    const re = new RegExp(`^${escapeRegExp(key)}\\s+(.+)$`, 'iu');
    const m = trimmed.match(re);
    if (m) {
      return { field: LABEL_TO_FIELD.get(key), value: m[1].trim() };
    }
  }
  return null;
};

module.exports = {
  normalizeLabelKey,
  matchLabelToField,
  matchSpaceSeparatedLine,
  LABEL_TO_FIELD
};
