self.addEventListener('install', () => {
    console.log('Service Worker installed.');
});

self.addEventListener('fetch', (event) => {
    console.log('Fetching:', event.request.url);
});
