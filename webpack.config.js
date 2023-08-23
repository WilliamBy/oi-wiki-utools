const path = require('path');

module.exports = {
    entry: './preload.js',
    output: {
        filename: 'preload.js',
        path: path.resolve(__dirname, 'dist'),
    },
};