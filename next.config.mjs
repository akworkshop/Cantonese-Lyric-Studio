import { execSync } from 'child_process';

function getBuildVersion() {
  const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (vercelSha) {
    return vercelSha.slice(0, 7);
  }
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

const buildDate = new Date().toISOString().slice(2, 10).replace(/-/g, '');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: `${buildDate}.${getBuildVersion()}`,
  },
};

export default nextConfig;
