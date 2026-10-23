/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack(config) {
    config.module.rules.push({
      test: /[/\\]europa-war[/\\]strategy[/\\]useSimulation\.ts$/,
      parser: {
        // Compile the worker entry URL while our factory places its bootstrap
        // inside Europa's service worker scope. Other games keep native workers.
        worker: ["...", "*simulationWorker.create()"],
      },
    });
    return config;
  },
};

module.exports = nextConfig;
