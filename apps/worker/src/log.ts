const time = () => new Date().toLocaleTimeString("en-US", { hour12: false });

export const log = {
  info: (message: string) => console.log(`${time()}  ${message}`),
  warn: (message: string) => console.warn(`${time()}  ! ${message}`),
};
