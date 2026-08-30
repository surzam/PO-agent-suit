import fs from 'node:fs/promises';
import path from 'node:path';

// AppImage's generated AppRun only applies executableArgs through its desktop
// entry. Direct execution otherwise reaches Chromium before main.mjs can add
// the portable Linux switch. Keep the security exception narrow and explicit.
export default async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') return;
  const executable = context.packager.executableName;
  const publicPath = path.join(context.appOutDir, executable);
  const binaryName = `${executable}-bin`;
  const binaryPath = path.join(context.appOutDir, binaryName);
  await fs.rename(publicPath, binaryPath);
  await fs.writeFile(publicPath, `#!/bin/sh\nHERE="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexec "$HERE/${binaryName}" --no-sandbox "$@"\n`, { mode:0o755 });
}
