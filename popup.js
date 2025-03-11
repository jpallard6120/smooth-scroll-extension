//
//  popup.js
//  This file runs only in the popup. It loads the list of ".shopify-section" IDs
//  from the current page, shows them as checkboxes, and injects the smooth scroll
//  code with user-selected exclusions.
//

// When the popup loads:
document.addEventListener('DOMContentLoaded', async () => {
    const sectionListContainer = document.getElementById('section-list');
    const startBtn = document.getElementById('start');
    const stopBtn = document.getElementById('stop');
  
    // 1) Get the active tab
    const currentTab = await getCurrentTab();
    if (!currentTab || !currentTab.id) {
      sectionListContainer.textContent = 'No active tab found.';
      return;
    }
  
    // 2) Fetch all .shopify-section IDs from the current page
    chrome.scripting.executeScript(
      {
        target: { tabId: currentTab.id },
        func: getShopifySectionIDs
      },
      (injectionResults) => {
        // injectionResults[0].result should be our array of IDs
        const shopifyIDs = injectionResults && injectionResults[0]
          ? injectionResults[0].result
          : [];
  
        // Clear loading text
        sectionListContainer.innerHTML = '';
  
        if (!shopifyIDs.length) {
          sectionListContainer.textContent = 'No .shopify-section divs found.';
          return;
        }
  
        // 3) Dynamically create checkboxes for each ID
        shopifyIDs.forEach((id) => {
          // Outer container for styling
          const container = document.createElement('div');
          container.className = 'checkbox-container';
  
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.value = id;
  
          const label = document.createElement('label');
          label.textContent = id;
  
          container.appendChild(checkbox);
          container.appendChild(label);
          sectionListContainer.appendChild(container);
        });
      }
    );
  
    // Start smooth scroll on button click
    startBtn.addEventListener('click', async () => {
      // Gather all checked IDs
      const excludedIDs = Array.from(
        sectionListContainer.querySelectorAll('input[type="checkbox"]:checked')
      ).map((cb) => cb.value);
  
      // Inject the smooth scrolling script with the selected exclusions
      chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: initSmoothScroll,
        args: [excludedIDs]
      });
    });
  
    // Stop smooth scroll
    stopBtn.addEventListener('click', async () => {
      chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: stopSmoothScroll
      });
    });
  });
  
  // Helper to get the current active tab
  async function getCurrentTab() {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }
  
  // This function runs in the page to grab all .shopify-section IDs
  function getShopifySectionIDs() {
    return Array.from(document.querySelectorAll('.shopify-section'))
      .map((div) => div.id)
      .filter(Boolean); // Keep only truthy IDs
  }
  
  // The main scroll logic, injected into the page.
  function initSmoothScroll(excludedSections) {
    // If we already have an active scroll interval, don't start again.
    if (window.scrollInterval) {
      console.log('Smooth scroll is already running!');
      return;
    }
  
    const normalSpeed = 10;
    const slowSpeed   = 1;
    const slowdownDuration = 3000; // ms
    const checkInterval    = 16;   // ~60 FPS
    const centerThreshold  = 50;   // px "closeness" to center
  
    let speed = normalSpeed;
    let isSlowingDown = false;
    let triggeredSections = new Set();
  
    // Set up our scroll interval
    window.scrollInterval = setInterval(() => {
      // Scroll page
      window.scrollBy(0, speed);
  
      // Dispatch scroll-related events
      window.dispatchEvent(new Event('scroll', { bubbles: true }));
      window.dispatchEvent(new Event('wheel', { bubbles: true }));
  
      // If we've reached the bottom, stop
      if (window.innerHeight + window.scrollY >= document.body.scrollHeight) {
        clearInterval(window.scrollInterval);
        delete window.scrollInterval;
        console.log('Reached bottom. Smooth scrolling stopped.');
        return;
      }
  
      // Check for slowdown conditions
      if (!isSlowingDown) {
        const centerOfViewport = window.innerHeight / 2;
  
        // Any element whose class includes shopify-section
        for (const section of document.querySelectorAll('.shopify-section')) {
          // If user excluded it, skip
          if (excludedSections.includes(section.id)) {
            continue;
          }
  
          const rect = section.getBoundingClientRect();
          const sectionCenter = rect.top + (rect.height / 2);
  
          // If the section center is near the viewport center & hasn't triggered yet
          if (Math.abs(sectionCenter - centerOfViewport) < centerThreshold
              && !triggeredSections.has(section.id)) {
            isSlowingDown = true;
            triggeredSections.add(section.id);
  
            // Slow down
            speed = slowSpeed;
  
            // Restore speed after slowdownDuration
            setTimeout(() => {
              speed = normalSpeed;
              isSlowingDown = false;
            }, slowdownDuration);
  
            break; // stop checking any other sections right now
          }
        }
      }
    }, checkInterval);
  
    console.log('Smooth scrolling started with exclusions:', excludedSections);
  }
  
  // A simple function to stop the interval, exposed for the popup
  function stopSmoothScroll() {
    if (window.scrollInterval) {
      clearInterval(window.scrollInterval);
      delete window.scrollInterval;
      console.log('Smooth scrolling stopped manually.');
    } else {
      console.log('No smooth scroll in progress or script not injected yet.');
    }
  }
  