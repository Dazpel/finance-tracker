export const formatDate = (date: any) => {
  if (!date) return "";
  const yyyy = date.year || date.getFullYear?.();
  const mm = String((date.month || date.getMonth?.() || 0)).padStart(
    2,
    "0"
  );
  const dd = String(date.day || date.getDate?.() || 0).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};
