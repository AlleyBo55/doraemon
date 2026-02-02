document.addEventListener('DOMContentLoaded', () => {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const testBtn = document.getElementById('testBtn');
  const testResult = document.getElementById('testResult');
  
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
    if (response?.connected) {
      statusDot.classList.add('connected');
      statusText.textContent = 'Connected to Doraemon';
      testBtn.disabled = false;
    } else {
      statusDot.classList.add('disconnected');
      statusText.textContent = 'Doraemon not running';
      testBtn.disabled = true;
    }
  });
  
  testBtn.addEventListener('click', () => {
    testBtn.disabled = true;
    testResult.textContent = 'Sending...';
    testResult.classList.remove('error');
    
    chrome.runtime.sendMessage({
      type: 'NOTIFICATION',
      title: '🧪 Test Notification',
      body: 'If you see this in Doraemon, the connection works!',
      url: 'chrome-extension://test'
    }, (response) => {
      if (response?.success) {
        testResult.textContent = '✅ Sent! Check Doraemon';
      } else {
        testResult.textContent = '❌ Failed to send';
        testResult.classList.add('error');
      }
      setTimeout(() => {
        testBtn.disabled = false;
        testResult.textContent = '';
      }, 3000);
    });
  });
});
