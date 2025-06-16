const { composePlugins, withNx } = require("@nx/webpack");
const nodeExternals = require('webpack-node-externals');

// Nx plugins for webpack.
module.exports = composePlugins(withNx(), (config) => {
  // Mark all dependencies from node_modules as external.
  // This is the standard practice for backend applications.
  config.externals = [
    nodeExternals({
      // Prisma client needs a specific setup to work with webpack.
      // We allowlist it here to ensure its files are processed correctly.
      allowlist: [/@prisma\/client/],
    }),
  ];

  // Update the webpack config as needed here.
  // e.g. `config.plugins.push(new MyPlugin())`
  return config;
});
