//
//  popup.js
//  This file runs only in the popup. It loads the list of ".shopify-section" IDs
//  from the current page, shows them as checkboxes, highlights them on hover,
//  and injects the smooth scroll code with user-selected exclusions.
//

document.addEventListener('DOMContentLoaded', async () => {
    const sectionListContainer = document.getElementById('section-list');
    const startBtn = document.getElementById('start');
    const stopBtn = document.getElementById('stop');
  
    // 1) Get the current active tab
    const currentTab = await getCurrentTab();
    if (!currentTab || !currentTab.id) {
      sectionListContainer.textContent = 'No active tab found.';
      return;
    }
  
    // 2) Inject highlight CSS into the page (only once)
    await injectHighlightCSS(currentTab.id);
  
    // 3) Fetch all .shopify-section IDs from the current page
    chrome.scripting.executeScript(
      {
        target: { tabId: currentTab.id },
        func: getShopifySectionIDs
      },
      (injectionResults) => {
        // injectionResults[0].result should be an array of IDs
        const shopifyIDs = injectionResults && injectionResults[0]
          ? injectionResults[0].result
          : [];
  
        // Clear loading text
        sectionListContainer.innerHTML = '';
  
        if (!shopifyIDs.length) {
          sectionListContainer.textContent = 'No .shopify-section divs found.';
          return;
        }
  
        // 4) Create a row for each ID with:
        //    - A checkbox
        //    - A label showing the ID
        //    - Hover events that highlight the section in the page
        shopifyIDs.forEach((id) => {
          const container = document.createElement('div');
          container.className = 'checkbox-container';
  
          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.value = id;
          checkbox.id = `cb_${id}`;
  
          const label = document.createElement('label');
          label.textContent = id;
          label.htmlFor = `cb_${id}`;
  
          // Highlight on hover (mouse enter)
          container.addEventListener('mouseenter', () => {
            highlightSectionInPage(id, currentTab.id);
          });
          // Remove highlight on mouse leave
          container.addEventListener('mouseleave', () => {
            removeHighlightFromPage(id, currentTab.id);
          });
  
          container.appendChild(checkbox);
          container.appendChild(label);
          sectionListContainer.appendChild(container);
        });
      }
    );
  
    // 5) Start smooth scroll on button click
    startBtn.addEventListener('click', async () => {
      // Gather all checked IDs
      const excludedIDs = Array.from(
        sectionListContainer.querySelectorAll('input[type="checkbox"]:checked')
      ).map((cb) => cb.value);
  
      // Inject the smooth scrolling script with selected exclusions
      chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: initSmoothScroll,
        args: [excludedIDs]
      });
      window.close();
    });
  
    // 6) Stop smooth scroll on button click
    stopBtn.addEventListener('click', async () => {
      chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: stopSmoothScroll
      });
    });
  });
  
  // Helper: get the active tab
  async function getCurrentTab() {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }
  
  // -- In-page script injection logic --
  
  /**
   * Step A: Insert a <style> to highlight sections, if not already inserted.
   */
  async function injectHighlightCSS(tabId) {
    return chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Only inject once, if we haven't already
        if (!document.getElementById('my-extension-highlight-css')) {
          const style = document.createElement('style');
          style.id = 'my-extension-highlight-css';
          // Outline the hovered element in red
          style.textContent = `
            .my-extension-highlight {
              border: 4px solid red !important;
              opacity: .5;
              filter: invert(20%);
              box-sizing: border-box;
            }
          `;
          document.head.appendChild(style);
        }
      }
    });
  }
  
  /**
   * Step B: On hover, we highlight the corresponding section by ID.
   */
  function highlightSectionInPage(sectionId, tabId) {
    chrome.scripting.executeScript({
      target: { tabId },
      func: (id) => {
        const el = document.getElementById(id);
        if (el) el.classList.add('my-extension-highlight');
      },
      args: [sectionId]
    });
  }
  
  /**
   * Step C: Remove the highlight when no longer hovered.
   */
  function removeHighlightFromPage(sectionId, tabId) {
    chrome.scripting.executeScript({
      target: { tabId },
      func: (id) => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('my-extension-highlight');
      },
      args: [sectionId]
    });
  }
  
  // -- Functions that run directly in the page context --
  
  /**
   * Return an array of ID strings for every .shopify-section
   */
  function getShopifySectionIDs() {
    return Array.from(document.querySelectorAll('.shopify-section'))
      .map((div) => div.id)
      .filter(Boolean); // keep only truthy IDs
  }
  
  /**
   * Start the smooth scrolling logic, skipping anything in excludedSections
   */
  function initSmoothScroll(excludedSections) {
    if (window.scrollInterval) {
      console.log('Smooth scroll is already running!');
      return;
    }
  
    const normalSpeed = 10;
    const slowSpeed   = 1;
    const slowdownDuration = 3000; // ms
    const checkInterval    = 16;   // ~60 FPS
    const centerThreshold  = 50;   // px
  
    let speed = normalSpeed;
    let isSlowingDown = false;
    let triggeredSections = new Set();
  
    setTimeout(() => {
        window.scrollInterval = setInterval(() => {
        // Scroll the page
        window.scrollBy(0, speed);
    
        // Dispatch scroll/wheel events
        window.dispatchEvent(new Event('scroll', { bubbles: true }));
        window.dispatchEvent(new Event('wheel', { bubbles: true }));
    
        // Stop at bottom
        if (window.innerHeight + window.scrollY >= document.body.scrollHeight) {
            clearInterval(window.scrollInterval);
            delete window.scrollInterval;
            console.log('Reached bottom. Smooth scrolling stopped.');
            return;
        }
    
        // Check if we should slow down
        if (!isSlowingDown) {
            const centerOfViewport = window.innerHeight / 2;
            for (const section of document.querySelectorAll('.shopify-section')) {
            if (excludedSections.includes(section.id)) continue;
    
            const rect = section.getBoundingClientRect();
            const sectionCenter = rect.top + (rect.height / 2);
    
            if (Math.abs(sectionCenter - centerOfViewport) < centerThreshold
                && !triggeredSections.has(section.id)) {
                isSlowingDown = true;
                triggeredSections.add(section.id);
    
                speed = slowSpeed;
                setTimeout(() => {
                speed = normalSpeed;
                isSlowingDown = false;
                }, slowdownDuration);
    
                break;
            }
            }
        }
        }, checkInterval);
    }, 3000);
    console.log('Smooth scrolling started. Excluded sections:', excludedSections);
  }
  
  /**
   * Stop the scroll interval if running
   */
  function stopSmoothScroll() {
    if (window.scrollInterval) {
      clearInterval(window.scrollInterval);
      delete window.scrollInterval;
      console.log('Smooth scrolling stopped manually.');
    } else {
      console.log('No smooth scroll in progress or script not injected yet.');
    }
  }
  