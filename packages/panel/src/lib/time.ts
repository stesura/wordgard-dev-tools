const pad = (n: number, width = 2) => String(n).padStart(width, "0");
export const clock = (time: number) => {
  const d = new Date(time);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
};
