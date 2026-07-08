/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        './src/*.html',
        './src/js/**/*.js',
    ],
    theme: {
        extend: {
            colors: {
                primary: '#3b82f6',
                secondary: '#60a5fa',
                accent: '#2563eb',
            },
        },
    },
    plugins: [],
};
