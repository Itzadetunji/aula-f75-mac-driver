import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { RESOURCES } from '@shared/i18n'

void i18n.use(initReactI18next).init({
  resources: Object.fromEntries(Object.entries(RESOURCES).map(([lng, strings]) => [lng, { translation: strings }])),
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n
