const webpack = require('webpack');
const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

const { NODE_ENV = 'development' } = process.env;

const base = {
  context: __dirname,
  entry: {
    background: './src/background/index.js',
    'content-script': './src/content-scripts/index.js',
    popup: './src/popup/index.js',
    detail: './src/popup/detail.js',
    options: './src/options/index.js'
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        loader: 'babel-loader'
      },
      {
        test: /\.css$/,
        use: [
          'style-loader',
          'css-loader'
        ]
      }
    ]
  },
  plugins: [
    new CopyPlugin([
      { from: './src/manifest.json', to: './manifest.json' },
      { from: './src/images', to: 'images' },
      { from: './src/background/preload.js', to: './preload.js' }
    ]),
    new HtmlWebpackPlugin({
      template: './src/popup/index.html',
      chunks: ['popup'],
      filename: 'popup.html'
    }),
    new HtmlWebpackPlugin({
      template: './src/options/index.html',
      chunks: ['options'],
      filename: 'options.html'
    }),
    new HtmlWebpackPlugin({
      template: './src/popup/detail.html',
      chunks: ['detail'],
      filename: 'detail.html'
    }),
    new webpack.DefinePlugin({
      'process.env': {
        NODE_ENV: JSON.stringify(NODE_ENV)
      }
    })
  ],
  node: {
    fs: "empty"
  }
};

const development = {
  ...base,
  output: {
    path: path.join(__dirname, 'build'),
    filename: '[name].js'
  },
  mode: 'development',
  devtool: '#eval-module-source-map',
  plugins: [
    ...base.plugins,
    new webpack.HotModuleReplacementPlugin()
  ]
};

const production = {
  ...base,
  output: {
    path: path.join(__dirname, 'dist'),
    filename: '[name].js'
  },
  mode: 'production',
  devtool: '#source-map',
  plugins: [
    ...base.plugins,
    new webpack.LoaderOptionsPlugin({
      minimize: true,
      debug: false
    })
  ]
};

if (NODE_ENV === 'development') {
  module.exports = development;
} else {
  module.exports = production;
}
