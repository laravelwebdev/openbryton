/**
 * Language Engine & Controller
 * Translation dictionaries are loaded modularly from lang/id.js and lang/en.js
 */
let langIdDict = typeof window !== 'undefined' && window.langId ? window.langId : (typeof langId !== 'undefined' ? langId : null);
let langEnDict = typeof window !== 'undefined' && window.langEn ? window.langEn : (typeof langEn !== 'undefined' ? langEn : null);

if (!langIdDict && typeof require === 'function') {
  try { langIdDict = require('./lang/id.js'); } catch (e) { }
}
if (!langEnDict && typeof require === 'function') {
  try { langEnDict = require('./lang/en.js'); } catch (e) { }
}

const translations = {
  id: langIdDict || {},
  en: langEnDict || {}
};

if (typeof window !== 'undefined') {
  window.translations = translations;
}
let currentLang = localStorage.getItem('openbryton_lang') || 'id';

function t(key) {
  if (!key) return '';
  if (translations[currentLang] && translations[currentLang][key] !== undefined) {
    return translations[currentLang][key];
  }
  if (translations['id'] && translations['id'][key] !== undefined) {
    return translations['id'][key];
  }
  return key;
}

/**
 * Consolidates Toast message translations into lang.js
 * Handles translation keys as well as raw strings and dynamic prefixes.
 */
function translateToast(message) {
  if (!message) return '';

  // 1. If key exists in translations dictionary, use t(key)
  if (translations[currentLang] && translations[currentLang][message] !== undefined) {
    return translations[currentLang][message];
  }

  // 2. If current language is Indonesian, raw Indonesian text needs no translation
  if (currentLang === 'id') {
    return message;
  }

  // 3. Fallback: Lookup matching raw Indonesian text in lang/id.js dictionary and return corresponding lang/en.js value
  const idDict = translations.id || {};
  const enDict = translations.en || {};
  for (const key in idDict) {
    if (idDict[key] === message && enDict[key]) {
      return enDict[key];
    }
  }

  return message;
}

if (typeof window !== 'undefined') {
  window.translateToast = translateToast;
}


function switchLanguage(lang) {
  currentLang = lang;
  localStorage.setItem('openbryton_lang', lang);
  updateDOMText();

  // Re-render JS dynamic text (e.g. table if points exist)
  if (typeof updateStatsAndUI === 'function') {
    updateStatsAndUI();
  }
  if (typeof loadMyRoutes === 'function' && document.getElementById('page-myroutes')?.classList.contains('active')) {
    loadMyRoutes();
  }
  if (typeof updateRoundTripUI === 'function') {
    updateRoundTripUI();
  }
}

function updateDOMText() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = t(key);
    if (val && val !== key) {
      if (el.hasAttribute('data-i18n-html')) {
        el.innerHTML = val;
      } else {
        el.textContent = val;
      }
    }
  });

  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const val = t(key);
    if (val && val !== key) {
      el.title = val;
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const val = t(key);
    if (val && val !== key) {
      el.placeholder = val;
    }
  });

  // Need to recreate lucide icons if we overwrote innerHTML
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function updateLangDropdownUI() {
  const btnIcon = document.getElementById('currentLangIcon');
  const btnText = document.getElementById('currentLangText');
  const options = document.querySelectorAll('.lang-option');

  if (btnIcon && btnText) {
    if (currentLang === 'id') {
      btnIcon.className = 'fi fi-id';
      btnText.textContent = 'ID';
    } else {
      btnIcon.className = 'fi fi-gb';
      btnText.textContent = 'EN';
    }
  }

  options.forEach(opt => {
    if (opt.getAttribute('data-value') === currentLang) {
      opt.classList.add('active');
    } else {
      opt.classList.remove('active');
    }
  });
}

function initLangDropdown() {
  const dropdown = document.getElementById('langDropdown');
  const btn = document.getElementById('langDropdownBtn');
  const options = document.querySelectorAll('.lang-option');

  if (!dropdown || !btn) return;

  // Toggle dropdown
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target)) {
      dropdown.classList.remove('open');
    }
  });

  // Handle option click
  options.forEach(opt => {
    opt.addEventListener('click', (e) => {
      const val = opt.getAttribute('data-value');
      if (val !== currentLang) {
        switchLanguage(val);
      }
      dropdown.classList.remove('open');
    });
  });

  updateLangDropdownUI();
}

// Override switchLanguage to also update UI
const originalSwitchLanguage = switchLanguage;
window.switchLanguage = function (lang) {
  originalSwitchLanguage(lang);
  updateLangDropdownUI();
};

// Initial setup
document.addEventListener('DOMContentLoaded', () => {
  updateDOMText();
  initLangDropdown();
});
