const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

module.exports = {
  mode: "production",
  experiments: {
    asyncWebAssembly: true,
  },
  entry: {
    index: "./js/index.js"
  },
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "[name].js"
  },
  plugins: [
    // copy all of pkg/ (your optimized WASM + JS shim)
    new CopyPlugin({
      patterns: [
        { from: "pkg", to: "pkg" },
        { from: "static", to: "" }
      ]
    })
  ],
  devServer: {
    static: [path.resolve(__dirname, "dist")],
  },
  module: {
    rules: [{
      test: /\.wasm$/,
      type: "webassembly/async"
    }]
  },
  performance: { hints: false },
};
