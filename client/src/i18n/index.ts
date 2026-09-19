import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import commonVi from './locales/vi/common.json';
import navVi from './locales/vi/nav.json';
import youtubeVi from './locales/vi/youtube.json';
import mailVi from './locales/vi/mail.json';
import browserVi from './locales/vi/browser.json';
import sourceVi from './locales/vi/source.json';
import contentVi from './locales/vi/content.json';
import factoryVi from './locales/vi/factory.json';
import dashboardVi from './locales/vi/dashboard.json';

import commonEn from './locales/en/common.json';
import navEn from './locales/en/nav.json';
import youtubeEn from './locales/en/youtube.json';
import mailEn from './locales/en/mail.json';
import browserEn from './locales/en/browser.json';
import sourceEn from './locales/en/source.json';
import contentEn from './locales/en/content.json';
import factoryEn from './locales/en/factory.json';
import dashboardEn from './locales/en/dashboard.json';

export const LOCALES = ['vi', 'en'] as const;
export type AppLocale = (typeof LOCALES)[number];

export const LOCALE_STORAGE_KEY = 'dammo-locale';

export const defaultNS = 'common';
export const namespaces = [
  'common',
  'nav',
  'youtube',
  'mail',
  'browser',
  'source',
  'content',
  'factory',
  'dashboard',
] as const;

export type AppNamespace = (typeof namespaces)[number];

const resources = {
  vi: {
    common: commonVi,
    nav: navVi,
    youtube: youtubeVi,
    mail: mailVi,
    browser: browserVi,
    source: sourceVi,
    content: contentVi,
    factory: factoryVi,
    dashboard: dashboardVi,
  },
  en: {
    common: commonEn,
    nav: navEn,
    youtube: youtubeEn,
    mail: mailEn,
    browser: browserEn,
    source: sourceEn,
    content: contentEn,
    factory: factoryEn,
    dashboard: dashboardEn,
  },
};

function readStoredLocale(): AppLocale {
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored === 'vi' || stored === 'en') return stored;
  } catch {
    /* ignore */
  }
  return 'vi';
}

export function setAppLocale(locale: AppLocale): void {
  void i18n.changeLanguage(locale);
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = locale;
}

void i18n.use(initReactI18next).init({
  resources,
  lng: readStoredLocale(),
  fallbackLng: 'vi',
  defaultNS,
  ns: [...namespaces],
  interpolation: { escapeValue: false },
  returnNull: false,
});

document.documentElement.lang = i18n.language === 'en' ? 'en' : 'vi';

export default i18n;
