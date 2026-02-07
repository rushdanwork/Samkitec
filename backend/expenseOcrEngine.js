export const detectAmount = (text = '') => {
  const normalized = String(text);
  const matches = normalized.match(/(?:\$|₹|EUR\s*)?\s*(\d{1,3}(?:[\d,]*)(?:\.\d{1,2})?)/g);
  if (!matches || matches.length === 0) return null;
  const last = matches[matches.length - 1];
  const numeric = last.replace(/[^\d.]/g, '');
  const amount = Number.parseFloat(numeric);
  return Number.isNaN(amount) ? null : amount;
};

export const detectVendor = (text = '') => {
  const normalized = String(text).trim();
  if (!normalized) return null;
  const vendorMatch = normalized.match(/vendor[:\s-]*([\w\s&.-]{3,})/i);
  if (vendorMatch) return vendorMatch[1].trim();
  const urlMatch = normalized.match(/(?:https?:\/\/)?(?:www\.)?([\w-]+)/i);
  if (urlMatch) return urlMatch[1].replace(/[-_]/g, ' ').trim();
  return normalized.split(/[\n,]/)[0].trim();
};

export const detectDate = (text = '') => {
  const normalized = String(text);
  const dateMatch = normalized.match(/(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) return dateMatch[1];
  const altMatch = normalized.match(/(\d{2}\/\d{2}\/\d{4})/);
  if (!altMatch) return null;
  const [month, day, year] = altMatch[1].split('/');
  return `${year}-${month}-${day}`;
};

export const categoryGuess = (text = '') => {
  const normalized = String(text).toLowerCase();
  if (/(flight|hotel|uber|taxi|train|air)/.test(normalized)) return 'travel';
  if (/(meal|restaurant|cafe|dinner|lunch|breakfast)/.test(normalized)) return 'meals';
  if (/(office|stationery|supplies|software|laptop)/.test(normalized)) return 'office';
  if (/(fuel|gas|petrol|diesel)/.test(normalized)) return 'fuel';
  return 'misc';
};

export const extractReceiptData = (text = '') => {
  const amount = detectAmount(text);
  const vendor = detectVendor(text);
  const category = categoryGuess(text);
  const date = detectDate(text);

  return {
    amount,
    vendor,
    categoryGuess: category,
    date,
    confidence: Math.min(0.95, 0.6 + (amount ? 0.15 : 0) + (vendor ? 0.15 : 0)),
  };
};
