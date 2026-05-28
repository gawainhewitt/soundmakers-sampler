import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

// Prevent all scrolling on iOS
document.addEventListener('touchmove', function(e) {
  e.preventDefault();
}, { passive: false });

const app = mount(App, {
  target: document.getElementById('app'),
})

// Prevent pinch zoom
document.addEventListener('gesturestart', function(e) {
  e.preventDefault();
  document.body.style.zoom = 0.99;
});

document.addEventListener('gesturechange', function(e) {
  e.preventDefault();
  document.body.style.zoom = 0.99;
});

document.addEventListener('gestureend', function(e) {
  e.preventDefault();
  document.body.style.zoom = 1;
});

// Prevent double-tap zoom
let lastTouchEnd = 0;
document.addEventListener('touchend', function(event) {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) {
    event.preventDefault();
  }
  lastTouchEnd = now;
}, false);

// Force reset zoom on page load
window.addEventListener('load', function() {
  // Reset any accidental zoom
  document.body.style.zoom = 1;
  
  // Also try the viewport meta approach
  const viewport = document.querySelector('meta[name=viewport]');
  if (viewport) {
    viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=0, viewport-fit=cover';
  }
});

// Comprehensive fix for iOS viewport/scroll issues when returning to app
function resetViewportAndLayout() {
  // Force scroll to top
  window.scrollTo(0, 0);
  document.body.scrollTop = 0;
  document.documentElement.scrollTop = 0;
  
  // Reset zoom
  document.body.style.zoom = 1;
  
  // Update CSS custom property for viewport height
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
  
  // Force layout recalculation
  document.body.style.display = 'none';
  document.body.offsetHeight; // Trigger reflow
  document.body.style.display = '';
  
  // Dispatch resize event to trigger orientation/layout updates
  window.dispatchEvent(new Event('resize'));
}

// Listen for page becoming visible again (switching back to tab)
document.addEventListener('visibilitychange', function() {
  if (!document.hidden) {
    console.log('Page visible - resetting viewport');
    resetViewportAndLayout();
  }
});

// Listen for page being shown from cache (back button)
window.addEventListener('pageshow', function(event) {
  if (event.persisted) {
    console.log('Page shown from cache - resetting viewport');
    resetViewportAndLayout();
  }
});

// Listen for window regaining focus
window.addEventListener('focus', function() {
  console.log('Window focused - resetting viewport');
  resetViewportAndLayout();
});

export default app
