export function currentShopeeCampaign(date = new Date()) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  if (month >= 8 && month <= 12 && day === month) return { id: `${month}.${month}`, label: `Especial Shopee ${month}.${month}` };
  if (month === 11 && day >= 23 && day <= 30 && date.getDay() === 5) return { id: 'black-friday', label: 'Especial Black Friday Shopee' };
  return null;
}
