import pc from 'picocolors';

const COLUMN = {
  TIME: 8,
  METHOD: 6,
  STATUS: 6,
  DURATION: 8,
  URL: 40,
};

const colorMethod = (method) => {
  const text = method.padEnd(COLUMN.METHOD);
  switch (method) {
    case 'GET':    return pc.green(text);
    case 'POST':   return pc.blue(text);
    case 'PUT':    return pc.yellow(text);
    case 'PATCH':  return pc.magenta(text);
    case 'DELETE': return pc.red(text);
    default:       return pc.gray(text);
  }
};

const colorStatus = (status) => {
  const text = String(status).padEnd(COLUMN.STATUS);
  if (status >= 500) return pc.red(text);
  if (status >= 400) return pc.yellow(text);
  if (status >= 300) return pc.cyan(text);
  if (status >= 200) return pc.green(text);
  return pc.gray(text);
};

const colorDuration = (ms) => {
  const text = `${ms}ms`.padStart(COLUMN.DURATION);
  if (ms > 500) return pc.red(text);
  if (ms > 100) return pc.yellow(text);
  return pc.green(text);
};

const truncate = (str, max) => (str.length > max ? `${str.slice(0, max - 1)}…` : str);

const formatTime = () => {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
};

export const requestLogger = (req, res, next) => {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number((process.hrtime.bigint() - start) / 1_000_000n);
    const time = pc.dim(formatTime());
    const method = colorMethod(req.method);
    const status = colorStatus(res.statusCode);
    const duration = colorDuration(durationMs);
    const url = truncate(req.originalUrl, COLUMN.URL).padEnd(COLUMN.URL);
    const user = req.user?.email ?? pc.dim('guest');

    console.log(`${time}  ${method}  ${status}  ${duration}   ${url}  ${user}`);
  });

  next();
};

export const printRequestLogHeader = () => {
  const header =
    'TIME'.padEnd(COLUMN.TIME) + '  ' +
    'METHOD'.padEnd(COLUMN.METHOD) + '  ' +
    'STATUS'.padEnd(COLUMN.STATUS) + '  ' +
    'DURATION'.padStart(COLUMN.DURATION) + '   ' +
    'URL'.padEnd(COLUMN.URL) + '  ' +
    'USER';

  const totalWidth = header.length;

  console.log();
  console.log(pc.bold(pc.cyan(header)));
  console.log(pc.dim('─'.repeat(Math.min(totalWidth, 100))));
};
