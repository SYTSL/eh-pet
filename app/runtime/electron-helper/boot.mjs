// Keep startup failures visible even when the main app has not created its logger yet.
import { app, dialog } from 'electron';
import { appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir, release } from 'node:os';

if (process.env.DSH_PET_SAFE_GRAPHICS === '1' || process.argv.includes('--disable-gpu')) {
  app.disableHardwareAcceleration();
}

let failed = false;
function fail(error) {
  if (failed) return;
  failed = true;
  const detail = error instanceof Error ? error.stack || error.message : String(error);
  let file;
  for (const base of [dirname(process.execPath), tmpdir()]) {
    try {
      file = join(base, 'eh-pet-startup.log');
      appendFileSync(file, `${new Date().toISOString()} Windows ${release()} ${process.arch}\n${detail}\n`, 'utf8');
      break;
    } catch {
      file = undefined;
    }
  }
  dialog.showErrorBox(
    'eh 桌宠启动失败',
    `未能启动桌宠。请将此信息发给制作者。\n\n${detail.slice(0, 1800)}\n\n诊断日志：${file || '无法写入日志'}`,
  );
  app.exit(1);
}
process.on('uncaughtException', fail);
process.on('unhandledRejection', fail);
try {
  await import('../../lib/app.js');
} catch (error) {
  fail(error);
}
