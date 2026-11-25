import i18n from '../i18n';

/** BCP 47 tag for number and date formatting in the current app language. */
export function appLocale(): 'en-US' | 'vi-VN' {
  return i18n.language === 'en' ? 'en-US' : 'vi-VN';
}
