console.log('[App] Registration script loaded');

if ('serviceWorker' in navigator) {
  console.log('[App] Service Worker is supported');
  
  window.addEventListener('load', function() {
    console.log('[App] Attempting to register Service Worker...');
    
    navigator.serviceWorker.register('/sw.js')
      .then(function(registration) {
        console.log('[App] ✅ Service Worker registered!');
        console.log('[App] Scope:', registration.scope);
      })
      .catch(function(error) {
        console.error('[App] ❌ Registration failed:', error);
      });
  });
}