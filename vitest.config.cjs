const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
    test: {
        include: ['tests/**/*.test.js'],
        environment: 'node',
        globals: true,
        reporters: ['default'],
        testTimeout: 30000,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: [
                'electron/**/*.js',
                'src/js/**/*-core.js',
            ],
            exclude: [
                'electron/main.js',
                'electron/preload.js',
                '**/node_modules/**',
            ],
        },
    },
});
